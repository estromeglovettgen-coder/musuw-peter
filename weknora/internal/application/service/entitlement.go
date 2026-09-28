package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/Tencent/WeKnora/internal/utils"
)

type entitlementService struct {
	repo           interfaces.EntitlementRepository
	keys           modelopenrouter.KeyManager
	allowanceLocks sync.Map
}

var (
	// Keep the package-local name for existing service tests/callers while the
	// stable classification lives at the OpenRouter transport boundary.
	errAllowanceRenewalPending = modelopenrouter.ErrAllowanceRenewalPending
	errSubscriptionPaused      = errors.New("subscription is paused")
)

func NewEntitlementService(repo interfaces.EntitlementRepository) interfaces.EntitlementService {
	return newEntitlementService(repo, modelopenrouter.NewKeyManagerFromEnv())
}

func newEntitlementService(repo interfaces.EntitlementRepository, keys modelopenrouter.KeyManager) interfaces.EntitlementService {
	return &entitlementService{repo: repo, keys: keys}
}

func (s *entitlementService) lockAllowance(tenantID uint64) func() {
	value, _ := s.allowanceLocks.LoadOrStore(tenantID, &sync.Mutex{})
	mu := value.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

func (s *entitlementService) Current(ctx context.Context, at time.Time) (*types.ConsumerEntitlement, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	unlock := s.lockAllowance(tenantID)
	defer unlock()
	tenant, err := s.repo.GetTenantEntitlement(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	plan := types.EffectiveConsumerPlanAt(tenant, at)
	limits := types.LimitsForConsumerPlan(plan)
	planStatus := tenant.PlanStatus
	planSource := "free"
	if types.PaddleEffectiveConsumerPlanAt(tenant, at) != types.ConsumerPlanFree {
		planSource = "paddle"
	} else if complimentary, active := types.ActiveComplimentaryPlanAt(tenant, at); active && complimentary == plan {
		planStatus = "complimentary"
		planSource = "complimentary"
	}
	current := &types.ConsumerEntitlement{
		ConsumerPlanLimits:        limits,
		PlanStatus:                planStatus,
		PlanSource:                planSource,
		ComplimentaryPlan:         tenant.ComplimentaryPlan,
		ComplimentaryExpiresAt:    tenant.ComplimentaryExpiresAt,
		StorageUsed:               tenant.StorageUsed,
		OpenRouterCreditsStatus:   types.OpenRouterCreditsUnprovisioned,
		PaddleCustomerID:          tenant.PaddleCustomerID,
		PaddleSubscriptionID:      tenant.PaddleSubscriptionID,
		PaddleBillingPeriod:       tenant.PaddleBillingPeriod,
		PaddleCurrentPeriodEnd:    tenant.PaddleCurrentPeriodEnd,
		OpenRouterCreditPeriodEnd: tenant.OpenRouterCreditPeriodEnd,
	}
	current.OpenRouterResetsAt = entitlementResetAt(tenant, plan, at)

	credentials := openRouterCredentialsFromTenant(tenant)
	if credentials == nil {
		return current, nil
	}
	if strings.TrimSpace(credentials.APIKey) == "" || strings.TrimSpace(credentials.KeyHash) == "" || s.keys == nil {
		current.OpenRouterCreditsStatus = types.OpenRouterCreditsUnavailable
		return current, nil
	}
	info, err := s.ensureAllowanceCurrent(ctx, tenant, at)
	if err != nil {
		if errors.Is(err, errAllowanceRenewalPending) {
			current.OpenRouterUsedMicrousd = limits.MonthlyOpenRouterMicrousd
			current.OpenRouterRemainingMicrousd = 0
			current.OpenRouterCreditsStatus = types.OpenRouterCreditsPending
			return current, nil
		}
		logger.Warnf(ctx, "OpenRouter managed-key usage lookup failed for tenant %d: %v", tenantID, err)
		current.OpenRouterCreditsStatus = types.OpenRouterCreditsUnavailable
		return current, nil
	}
	// ensureAllowanceCurrent may advance a free/yearly tenant to its next
	// personal period. Return that new boundary in the same response.
	current.OpenRouterResetsAt = entitlementResetAt(tenant, plan, at)
	// Preserve the provider's raw key counters separately from the consumer
	// period projection below. OpenRouter usage is provider/lifetime state;
	// the consumer fields are plan-scoped and may be clamped.
	current.OpenRouterProviderUsedMicrousd = nonNegativeMicrousd(info.UsageMicrousd)
	current.OpenRouterProviderRemainingMicrousd = nonNegativeMicrousd(info.LimitRemainingMicrousd)
	remaining := clampMicrousd(info.LimitRemainingMicrousd, 0, limits.MonthlyOpenRouterMicrousd)
	current.OpenRouterUsedMicrousd = limits.MonthlyOpenRouterMicrousd - remaining
	current.OpenRouterRemainingMicrousd = remaining
	current.OpenRouterCreditsStatus = types.OpenRouterCreditsAvailable
	logger.Infof(ctx, "OpenRouter managed-key usage resolved tenant_id=%d allowance_microusd=%d used_microusd=%d remaining_microusd=%d monthly_reset=%t",
		tenantID, limits.MonthlyOpenRouterMicrousd, current.OpenRouterUsedMicrousd, remaining, info.MonthlyReset)
	return current, nil
}

// CurrentForTenant is the explicit-tenant form used by platform operations.
// Reusing Current keeps the provider lookup, period refresh, clamping, and
// fail-closed status in one implementation. The caller's identity remains in
// ctx for audit/log attribution; only the target tenant context value changes.
func (s *entitlementService) CurrentForTenant(ctx context.Context, tenantID uint64, at time.Time) (*types.ConsumerEntitlement, error) {
	if tenantID == 0 {
		return nil, fmt.Errorf("tenant ID must be positive")
	}
	return s.Current(context.WithValue(ctx, types.TenantIDContextKey, tenantID), at)
}

func (s *entitlementService) ResolvePaddleSubscription(ctx context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, error) {
	return s.repo.ResolvePaddleSubscription(ctx, customerID, subscriptionID)
}

// SetOpenRouterRemainingForTenant adjusts the existing OpenRouter-managed
// child key's remaining allowance without adding a local usage counter. The
// absolute provider limit is lifetime usage plus the requested remainder,
// exactly as the normal entitlement path does. Requests are bounded by the
// tenant's current effective plan allowance and cannot mutate Paddle or the
// persisted plan.
func (s *entitlementService) SetOpenRouterRemainingForTenant(ctx context.Context, tenantID uint64, remainingMicrousd int64) (*types.ConsumerEntitlement, error) {
	if tenantID == 0 {
		return nil, fmt.Errorf("tenant ID must be positive")
	}
	if remainingMicrousd < 0 {
		return nil, fmt.Errorf("remaining OpenRouter credits cannot be negative")
	}

	requestCtx := context.WithValue(ctx, types.TenantIDContextKey, tenantID)
	unlock := s.lockAllowance(tenantID)
	tenant, err := s.repo.GetTenantEntitlement(requestCtx, tenantID)
	if err != nil {
		unlock()
		return nil, err
	}
	plan := types.EffectiveConsumerPlanAt(tenant, time.Now().UTC())
	allowance := types.LimitsForConsumerPlan(plan).MonthlyOpenRouterMicrousd
	if remainingMicrousd > allowance {
		unlock()
		return nil, fmt.Errorf("remaining OpenRouter credits cannot exceed the current %s plan allowance", plan)
	}
	stored := openRouterCredentialsFromTenant(tenant)
	if stored == nil || strings.TrimSpace(stored.KeyHash) == "" {
		unlock()
		return nil, fmt.Errorf("OpenRouter tenant credentials are unavailable")
	}
	if s.keys == nil {
		unlock()
		return nil, fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured")
	}

	// Normalize the provider state first. This preserves the existing paid-term
	// and free-anniversary gates instead of letting an operator accidentally
	// open an unpaid period by changing a stale key.
	info, err := s.ensureAllowanceCurrent(requestCtx, tenant, time.Now().UTC())
	if err != nil {
		unlock()
		return nil, err
	}
	targetLimit := info.UsageMicrousd + remainingMicrousd
	// OpenRouter rejects a zero absolute limit. A zero remaining value is
	// therefore exact only when lifetime usage is already positive; otherwise
	// fail closed instead of silently granting one micro-dollar.
	if targetLimit <= 0 {
		unlock()
		return nil, fmt.Errorf("remaining OpenRouter credits must be positive when provider usage is zero")
	}
	if _, err := s.repo.SetOpenRouterDesiredLimit(requestCtx, tenantID, targetLimit); err != nil {
		unlock()
		return nil, fmt.Errorf("persist OpenRouter tenant credit limit: %w", err)
	}
	if err := s.syncTenantOpenRouterDesiredLimit(requestCtx, tenant); err != nil {
		unlock()
		return nil, fmt.Errorf("update OpenRouter tenant credit limit: %w", err)
	}
	unlock()

	return s.CurrentForTenant(requestCtx, tenantID, time.Now().UTC())
}

func (s *entitlementService) GrantComplimentaryPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, expiresAt time.Time, grantID string) (*types.ConsumerEntitlement, bool, error) {
	if tenantID == 0 {
		return nil, false, apperrors.NewValidationError("tenant ID must be positive")
	}
	if plan != types.ConsumerPlanPlus && plan != types.ConsumerPlanPro && plan != types.ConsumerPlanMax {
		return nil, false, apperrors.NewValidationError("complimentary plan must be plus, pro, or max")
	}
	grantID = strings.TrimSpace(grantID)
	if !validComplimentaryGrantID(grantID) {
		return nil, false, apperrors.NewValidationError("complimentary grant ID must be 16-64 letters, digits, hyphens, or underscores")
	}
	now := time.Now().UTC()
	expiresAt = expiresAt.UTC()
	if !expiresAt.After(now) {
		return nil, false, apperrors.NewValidationError("complimentary expiration must be in the future")
	}

	requestCtx := context.WithValue(ctx, types.TenantIDContextKey, tenantID)
	unlock := s.lockAllowance(tenantID)
	tenant, err := s.repo.GetTenantEntitlement(requestCtx, tenantID)
	if err != nil {
		unlock()
		return nil, false, err
	}
	if tenant.ComplimentaryGrantID == grantID {
		if tenant.ComplimentaryPlan == plan && tenant.ComplimentaryExpiresAt != nil && tenant.ComplimentaryExpiresAt.UTC().Equal(expiresAt) {
			if err := s.syncTenantOpenRouterDesiredLimit(requestCtx, tenant); err != nil {
				unlock()
				return nil, false, apperrors.NewServiceUnavailableError(err.Error())
			}
			unlock()
			current, currentErr := s.CurrentForTenant(requestCtx, tenantID, now)
			return current, false, currentErr
		}
		unlock()
		return nil, false, apperrors.NewConflictError("complimentary grant ID was already used")
	}
	if _, active := types.ActiveComplimentaryPlanAt(tenant, now); active {
		unlock()
		return nil, false, apperrors.NewConflictError("revoke the active complimentary grant before creating another")
	}
	if types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree ||
		strings.TrimSpace(tenant.PaddleCustomerID) != "" || strings.TrimSpace(tenant.PaddleSubscriptionID) != "" {
		unlock()
		return nil, false, apperrors.NewConflictError("complimentary grants require a Paddle-unbound Free tenant")
	}

	periodEnd := complimentaryPeriodEnd(now, expiresAt)
	desiredLimit := int64(0)
	stored := openRouterCredentialsFromTenant(tenant)
	if stored != nil && strings.TrimSpace(stored.KeyHash) != "" {
		if s.keys == nil {
			unlock()
			return nil, false, apperrors.NewServiceUnavailableError("OpenRouter management is unavailable")
		}
		priorInfo, infoErr := s.keys.GetKey(requestCtx, stored.KeyHash)
		if infoErr != nil || priorInfo == nil {
			unlock()
			return nil, false, apperrors.NewServiceUnavailableError("OpenRouter tenant allowance is unavailable")
		}
		desiredLimit = priorInfo.UsageMicrousd + types.LimitsForConsumerPlan(plan).MonthlyOpenRouterMicrousd
	}
	applied, err := s.repo.GrantComplimentaryPlan(requestCtx, tenantID, plan, grantID, now, expiresAt, periodEnd, desiredLimit)
	if err != nil {
		unlock()
		if errors.Is(err, repository.ErrComplimentaryPlanConflict) {
			return nil, false, apperrors.NewConflictError(err.Error())
		}
		return nil, false, err
	}
	latest, reloadErr := s.repo.GetTenantEntitlement(requestCtx, tenantID)
	if reloadErr != nil {
		unlock()
		return nil, applied, reloadErr
	}
	if !applied {
		if latest.ComplimentaryGrantID != grantID || latest.ComplimentaryPlan != plan || latest.ComplimentaryExpiresAt == nil || !latest.ComplimentaryExpiresAt.UTC().Equal(expiresAt) {
			unlock()
			return nil, false, apperrors.NewConflictError("complimentary grant changed concurrently")
		}
	}
	// Synchronize from the row reloaded after commit, never from the pre-lock
	// provider snapshot. If a signed Paddle activation won immediately after the
	// grant transaction, its durable desired limit is the only target used here.
	if err := s.syncTenantOpenRouterDesiredLimit(requestCtx, latest); err != nil {
		unlock()
		return nil, applied, apperrors.NewServiceUnavailableError(err.Error())
	}
	unlock()
	current, err := s.CurrentForTenant(requestCtx, tenantID, now)
	return current, applied, err
}

func (s *entitlementService) RevokeComplimentaryPlan(ctx context.Context, tenantID uint64, grantID string) (*types.ConsumerEntitlement, bool, error) {
	if tenantID == 0 {
		return nil, false, apperrors.NewValidationError("tenant ID must be positive")
	}
	grantID = strings.TrimSpace(grantID)
	if !validComplimentaryGrantID(grantID) {
		return nil, false, apperrors.NewValidationError("complimentary grant ID must be 16-64 letters, digits, hyphens, or underscores")
	}
	now := time.Now().UTC()
	requestCtx := context.WithValue(ctx, types.TenantIDContextKey, tenantID)
	unlock := s.lockAllowance(tenantID)
	tenant, err := s.repo.GetTenantEntitlement(requestCtx, tenantID)
	if err != nil {
		unlock()
		return nil, false, err
	}
	if tenant.ComplimentaryGrantID != grantID {
		unlock()
		return nil, false, apperrors.NewConflictError("complimentary grant ID does not match")
	}
	applied, err := s.repo.RevokeComplimentaryPlan(requestCtx, tenantID, grantID, now, now, 0)
	if err != nil {
		unlock()
		if errors.Is(err, repository.ErrComplimentaryPlanConflict) {
			return nil, false, apperrors.NewConflictError(err.Error())
		}
		return nil, false, err
	}
	latest, reloadErr := s.repo.GetTenantEntitlement(requestCtx, tenantID)
	if reloadErr != nil {
		unlock()
		return nil, applied, reloadErr
	}
	if stored := openRouterCredentialsFromTenant(latest); stored != nil && strings.TrimSpace(stored.KeyHash) != "" {
		if _, syncErr := s.ensureAllowanceCurrent(requestCtx, latest, now); syncErr != nil {
			unlock()
			return nil, applied, apperrors.NewServiceUnavailableError(syncErr.Error())
		}
	}
	unlock()
	current, currentErr := s.CurrentForTenant(requestCtx, tenantID, now)
	return current, applied, currentErr
}

func (s *entitlementService) OpenRouterAPIKey(ctx context.Context) (string, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	unlock := s.lockAllowance(tenantID)
	defer unlock()
	tenant, err := s.repo.GetTenantEntitlement(ctx, tenantID)
	if err != nil {
		return "", err
	}
	_, complimentaryActive := types.ActiveComplimentaryPlanAt(tenant, time.Now().UTC())
	if tenant.PlanStatus == "paused" && !complimentaryActive {
		return "", errSubscriptionPaused
	}
	now := time.Now().UTC()
	plan := types.EffectiveConsumerPlanAt(tenant, now)
	if paidPlanAccessUnavailable(tenant, plan, now) {
		return "", errAllowanceRenewalPending
	}
	if stored := openRouterCredentialsFromTenant(tenant); stored != nil {
		if strings.TrimSpace(stored.APIKey) == "" || strings.TrimSpace(stored.KeyHash) == "" {
			logger.Warnf(ctx, "OpenRouter tenant credentials are incomplete tenant_id=%d", tenantID)
			return "", fmt.Errorf("OpenRouter tenant credentials are incomplete")
		}
		if s.keys == nil {
			return "", fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured; cannot enforce the tenant spend limit")
		}
		// Validate the provider limit on every key use, not only at a period
		// boundary. This closes the unavoidable cross-provider crash window where
		// OpenRouter accepted a plan limit but the local Paddle plan transaction
		// did not commit. The durable local plan remains the access authority.
		if _, err := s.ensureAllowanceCurrent(ctx, tenant, now); err != nil {
			return "", err
		}
		return stored.APIKey, nil
	}
	if s.keys == nil {
		logger.Warnf(ctx, "OpenRouter tenant key provisioning unavailable tenant_id=%d reason=management_key_not_configured", tenantID)
		return "", fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured")
	}
	if utils.GetAESKey() == nil {
		logger.Warnf(ctx, "OpenRouter tenant key provisioning unavailable tenant_id=%d reason=system_aes_key_invalid", tenantID)
		return "", fmt.Errorf("SYSTEM_AES_KEY must contain exactly 32 bytes before provisioning OpenRouter tenant keys")
	}

	limit := types.LimitsForConsumerPlan(plan).MonthlyOpenRouterMicrousd
	creditPeriodEnd := initialCreditPeriodEnd(
		tenant, plan, tenant.PaddleBillingPeriod, now, tenant.PaddleCurrentPeriodEnd,
	)
	if _, active := types.ActiveComplimentaryPlanAt(tenant, time.Now().UTC()); active && tenant.ComplimentaryExpiresAt != nil {
		creditPeriodEnd = complimentaryPeriodEnd(time.Now().UTC(), tenant.ComplimentaryExpiresAt.UTC())
	}
	logger.Infof(ctx, "OpenRouter tenant key provisioning started tenant_id=%d monthly_limit_microusd=%d", tenantID, limit)
	created, err := s.keys.CreateKey(ctx, fmt.Sprintf("musuw-tenant-%d", tenantID), limit, false)
	if err != nil {
		logger.Warnf(ctx, "OpenRouter tenant key provisioning failed tenant_id=%d: %v", tenantID, err)
		return "", err
	}
	candidate := &types.OpenRouterCredentials{APIKey: created.Key, KeyHash: created.Hash}
	inserted, err := s.repo.SetOpenRouterCredentialsIfAbsent(ctx, tenantID, candidate, creditPeriodEnd, limit)
	if err != nil {
		if deleteErr := s.keys.DeleteKey(ctx, created.Hash); deleteErr != nil {
			logger.Errorf(ctx, "OpenRouter orphaned tenant key cleanup failed tenant_id=%d: %v", tenantID, deleteErr)
			return "", errors.Join(
				err,
				fmt.Errorf("delete orphaned OpenRouter key: %w", deleteErr),
			)
		}
		logger.Warnf(ctx, "OpenRouter tenant key persistence failed tenant_id=%d: %v", tenantID, err)
		return "", err
	}
	if inserted {
		logger.Infof(ctx, "OpenRouter tenant key provisioning completed tenant_id=%d", tenantID)
		return created.Key, nil
	}

	// Another request/replica won first-use provisioning. Delete the orphaned
	// provider key and use the durable winner from the tenant credentials JSONB.
	if deleteErr := s.keys.DeleteKey(ctx, created.Hash); deleteErr != nil {
		logger.Errorf(ctx, "OpenRouter raced tenant key cleanup failed tenant_id=%d: %v", tenantID, deleteErr)
		return "", fmt.Errorf("delete raced OpenRouter key: %w", deleteErr)
	}
	logger.Infof(ctx, "OpenRouter tenant key provisioning race resolved tenant_id=%d", tenantID)
	tenant, err = s.repo.GetTenantEntitlement(ctx, tenantID)
	if err != nil {
		return "", err
	}
	stored := openRouterCredentialsFromTenant(tenant)
	if stored == nil || strings.TrimSpace(stored.APIKey) == "" || strings.TrimSpace(stored.KeyHash) == "" {
		return "", fmt.Errorf("OpenRouter tenant key provisioning race completed without durable credentials")
	}
	return stored.APIKey, nil
}

// ensureAllowanceCurrent keeps one provider-managed key on the tenant's own
// monthly cycle. Free and yearly plans refresh lazily on the first read/use
// after their boundary, with yearly refreshes capped by Paddle's verified paid
// term. Monthly subscriptions wait for Paddle's paid recurring transaction
// webhook, so unused credit cannot leak into an unpaid period.
func (s *entitlementService) ensureAllowanceCurrent(ctx context.Context, tenant *types.Tenant, at time.Time) (*modelopenrouter.KeyInfo, error) {
	complimentaryPlan, complimentaryActive := types.ActiveComplimentaryPlanAt(tenant, at)
	if tenant != nil && tenant.PlanStatus == "paused" && !complimentaryActive {
		return nil, errSubscriptionPaused
	}
	at = at.UTC()
	plan := types.EffectiveConsumerPlanAt(tenant, at)
	if paidPlanAccessUnavailable(tenant, plan, at) {
		return nil, errAllowanceRenewalPending
	}
	stored := openRouterCredentialsFromTenant(tenant)
	if stored == nil || strings.TrimSpace(stored.KeyHash) == "" || s.keys == nil {
		return nil, fmt.Errorf("OpenRouter tenant credentials are unavailable")
	}
	info, err := s.keys.GetKey(ctx, stored.KeyHash)
	if err != nil {
		return nil, err
	}
	if info == nil {
		return nil, fmt.Errorf("OpenRouter tenant key lookup returned no state")
	}

	allowance := types.LimitsForConsumerPlan(plan).MonthlyOpenRouterMicrousd
	periodEnd := tenant.OpenRouterCreditPeriodEnd
	expiredComplimentary := tenant.ComplimentaryPlan != "" && tenant.ComplimentaryGrantID != "" &&
		tenant.ComplimentaryExpiresAt != nil && !tenant.ComplimentaryExpiresAt.After(at)
	// A paid tenant may predate the billing-period column. Treat an unknown
	// period like monthly (webhook-gated), not yearly (self-refreshing), so a
	// missing migration value can never grant an unpaid allowance.
	if periodEnd != nil && !periodEnd.After(at) && plan != types.ConsumerPlanFree && tenant.PaddleBillingPeriod != "yearly" && !complimentaryActive {
		return info, errAllowanceRenewalPending
	}

	// The durable desired limit is the only local representation of the
	// provider spend boundary. Once written, every read/use converges the
	// provider to this exact absolute value; it never recomputes a new grant
	// from a stale plan or a local usage counter.
	desiredLimit := tenant.OpenRouterDesiredLimitMicrousd
	var targetPeriodEnd *time.Time
	if expiredComplimentary {
		value := monthlyBoundaryAfter(tenant.CreatedAt, at)
		targetPeriodEnd = &value
		desiredLimit = info.UsageMicrousd + allowance
	} else if periodEnd == nil {
		value := initialCreditPeriodEnd(tenant, plan, tenant.PaddleBillingPeriod, at, nil)
		if complimentaryActive && tenant.ComplimentaryExpiresAt != nil {
			value = complimentaryPeriodEnd(at, tenant.ComplimentaryExpiresAt.UTC())
		}
		targetPeriodEnd = &value
		if desiredLimit <= 0 {
			// Legacy keys have no durable target yet. Preserve the provider's
			// current absolute limit exactly while establishing the personal
			// period; the provider remains the sole usage authority.
			desiredLimit = info.LimitMicrousd
		}
	} else if !periodEnd.After(at) {
		value := nextPersonalCreditPeriodEnd(*periodEnd, at)
		if complimentaryActive && tenant.ComplimentaryExpiresAt != nil && value.After(tenant.ComplimentaryExpiresAt.UTC()) {
			value = tenant.ComplimentaryExpiresAt.UTC()
		} else if plan == types.ConsumerPlanFree && !tenant.CreatedAt.IsZero() {
			value = monthlyBoundaryAfter(tenant.CreatedAt, at)
		}
		targetPeriodEnd = &value
		// Skipped inactive periods never stack. The current period starts with
		// exactly one plan allowance above lifetime provider usage.
		desiredLimit = info.UsageMicrousd + allowance
	} else if desiredLimit <= 0 {
		// Existing migrated rows can have a valid period but no desired target.
		// Bootstrap it once under a row lock from the provider's current limit.
		desiredLimit = info.LimitMicrousd
		if desiredLimit <= 0 {
			return nil, fmt.Errorf("OpenRouter managed key has no positive limit to bootstrap")
		}
		inserted, persistErr := s.repo.SetOpenRouterDesiredLimitIfUnset(ctx, tenant.ID, desiredLimit)
		if persistErr != nil {
			return nil, fmt.Errorf("persist OpenRouter tenant desired limit: %w", persistErr)
		}
		if inserted {
			tenant.OpenRouterDesiredLimitMicrousd = desiredLimit
		} else {
			latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenant.ID)
			if reloadErr != nil {
				return nil, reloadErr
			}
			tenant = latest
			desiredLimit = tenant.OpenRouterDesiredLimitMicrousd
		}
	}
	if desiredLimit <= 0 {
		return nil, fmt.Errorf("OpenRouter tenant desired limit is unavailable")
	}

	// A period transition and its desired absolute limit commit together. The
	// false result means another replica won the row lock; reload its one
	// durable target instead of minting a second allowance from our snapshot.
	if targetPeriodEnd != nil {
		periodValue := targetPeriodEnd.UTC()
		var applied bool
		var persistErr error
		if (complimentaryActive && complimentaryPlan == plan) || expiredComplimentary {
			applied, persistErr = s.repo.AdvanceComplimentaryCreditPeriod(
				ctx, tenant.ID, tenant.ComplimentaryGrantID, at, plan, periodValue, desiredLimit,
			)
		} else {
			applied, persistErr = s.repo.AdvanceOpenRouterCreditPeriod(
				ctx, tenant.ID, "", "", "", time.Time{}, "", "", periodValue, desiredLimit,
			)
		}
		if persistErr != nil {
			return nil, fmt.Errorf("persist OpenRouter personal credit period: %w", persistErr)
		}
		if applied {
			tenant.OpenRouterCreditPeriodEnd = &periodValue
			tenant.OpenRouterDesiredLimitMicrousd = desiredLimit
		} else {
			latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenant.ID)
			if reloadErr != nil {
				return nil, reloadErr
			}
			tenant = latest
			desiredLimit = tenant.OpenRouterDesiredLimitMicrousd
			if desiredLimit <= 0 {
				// The winning writer may have only advanced the period on a
				// legacy row. Bootstrap its target atomically before syncing.
				if _, persistErr = s.repo.SetOpenRouterDesiredLimitIfUnset(ctx, tenant.ID, info.LimitMicrousd); persistErr != nil {
					return nil, fmt.Errorf("persist OpenRouter tenant desired limit: %w", persistErr)
				}
				latest, reloadErr = s.repo.GetTenantEntitlement(ctx, tenant.ID)
				if reloadErr != nil {
					return nil, reloadErr
				}
				tenant = latest
				desiredLimit = tenant.OpenRouterDesiredLimitMicrousd
			}
		}
		logger.Infof(ctx, "OpenRouter personal credit period advanced tenant_id=%d period_end=%s applied=%t desired_limit_microusd=%d", tenant.ID, periodValue.Format(time.RFC3339), applied, desiredLimit)
	}

	if desiredLimit <= 0 {
		return nil, fmt.Errorf("OpenRouter tenant desired limit is unavailable")
	}
	if info.LimitMicrousd != desiredLimit || info.MonthlyReset {
		if err := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); err != nil {
			return nil, fmt.Errorf("synchronize OpenRouter tenant credit limit: %w", err)
		}
		// The convergence helper may have observed a newer Paddle/grant target
		// than this request. Return the provider's final state rather than
		// projecting counters from the stale target above.
		latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenant.ID)
		if reloadErr != nil {
			return nil, reloadErr
		}
		latestPlan := types.EffectiveConsumerPlanAt(latest, at)
		if latest.PlanStatus == "paused" {
			if _, active := types.ActiveComplimentaryPlanAt(latest, at); !active {
				return nil, errSubscriptionPaused
			}
		}
		if paidPlanAccessUnavailable(latest, latestPlan, at) {
			return nil, errAllowanceRenewalPending
		}
		latestStored := openRouterCredentialsFromTenant(latest)
		if latestStored == nil || strings.TrimSpace(latestStored.KeyHash) == "" {
			return nil, fmt.Errorf("OpenRouter tenant credentials are unavailable")
		}
		info, reloadErr = s.keys.GetKey(ctx, latestStored.KeyHash)
		if reloadErr != nil {
			return nil, reloadErr
		}
		if info == nil {
			return nil, fmt.Errorf("OpenRouter tenant key lookup returned no state")
		}
	}
	return info, nil
}

func openRouterCredentialsFromTenant(tenant *types.Tenant) *types.OpenRouterCredentials {
	if tenant == nil || tenant.Credentials == nil {
		return nil
	}
	return tenant.Credentials.OpenRouter
}

func (s *entitlementService) OpenRouterUserID(ctx context.Context) string {
	// OpenRouter's user field is attribution, not the spend boundary. Keep the
	// same human stable across workspaces; the per-tenant child key isolates spend.
	userID, _ := types.UserIDFromContext(ctx)
	if strings.TrimSpace(userID) == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(userID))
	return "musuw_" + hex.EncodeToString(sum[:12])
}

func (s *entitlementService) ApplyConsumerPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, eventPeriodEnd *time.Time) (bool, error) {
	unlock := s.lockAllowance(tenantID)
	defer unlock()
	return s.applyConsumerPlanLocked(ctx, tenantID, plan, status, billingPeriod, eventID, occurredAt, customerID, subscriptionID, eventPeriodEnd)
}

func (s *entitlementService) applyConsumerPlanLocked(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, eventPeriodEnd *time.Time) (bool, error) {
	tenant, err := s.repo.GetTenantEntitlement(ctx, tenantID)
	if err != nil {
		return false, err
	}
	if eventID != "" && tenant.PaddleLastEventID == eventID {
		if err := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); err != nil {
			return false, err
		}
		logger.Infof(ctx, "Consumer plan event already durably applied tenant_id=%d", tenantID)
		return true, nil
	}
	if eventID != "" && tenant.PaddleLastEventAt != nil && !occurredAt.After(*tenant.PaddleLastEventAt) {
		if err := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); err != nil {
			return false, err
		}
		logger.Infof(ctx, "Consumer plan event ignored as stale tenant_id=%d", tenantID)
		return false, nil
	}
	if eventID != "" && tenant.PaddleLastRenewalAt != nil && !occurredAt.After(tenant.PaddleLastRenewalAt.UTC()) {
		if err := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); err != nil {
			return false, err
		}
		logger.Infof(ctx, "Consumer plan event ignored as older than confirmed renewal tenant_id=%d", tenantID)
		return false, nil
	}
	plan = types.NormalizeConsumerPlan(plan)
	if strings.TrimSpace(status) == "" {
		status = "active"
	}
	target := &types.Tenant{Plan: plan, PlanStatus: status}
	targetPlan := types.EffectiveConsumerPlan(target)
	currentSubscriptionID := strings.TrimSpace(tenant.PaddleSubscriptionID)
	incomingSubscriptionID := strings.TrimSpace(subscriptionID)
	newInitialPaidActivation := (types.NormalizeConsumerPlan(tenant.Plan) == types.ConsumerPlanFree || tenant.PlanStatus == "canceled") &&
		targetPlan != types.ConsumerPlanFree && incomingSubscriptionID != "" &&
		status == "active" && eventPeriodEnd != nil && !eventPeriodEnd.IsZero() && eventPeriodEnd.After(occurredAt)
	if currentSubscriptionID != "" && incomingSubscriptionID != currentSubscriptionID && !newInitialPaidActivation {
		logger.Infof(ctx, "Consumer plan event ignored for non-current subscription tenant_id=%d", tenantID)
		return false, nil
	}
	wasRevoked := tenant.PlanStatus == "refunded" || tenant.PlanStatus == "chargeback"
	revoking := status == "refunded" || status == "chargeback"
	// Adjustment payloads from older workers used plan=free for a refund or
	// chargeback. Keep the durable paid plan so a later authoritative reversal
	// can restore the same entitlement without treating it as a new purchase.
	persistPlan := plan
	if revoking && types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree {
		persistPlan = types.NormalizeConsumerPlan(tenant.Plan)
	}
	pausingSamePlan := status == "paused" && plan != types.ConsumerPlanFree && types.NormalizeConsumerPlan(tenant.Plan) == plan
	resumingSamePlan := tenant.PlanStatus == "paused" && targetPlan != types.ConsumerPlanFree && types.NormalizeConsumerPlan(tenant.Plan) == targetPlan
	if revoking && tenant.PaddleBillingPeriod != "" {
		// Keep the provider-confirmed cadence as part of the frozen subscription
		// identity. Status revokes access; it must not erase the coordinates used
		// to distinguish a same-period reversal from a newly paid period.
		billingPeriod = tenant.PaddleBillingPeriod
	} else if targetPlan == types.ConsumerPlanFree && !pausingSamePlan {
		billingPeriod = ""
	} else if billingPeriod != "monthly" && billingPeriod != "yearly" {
		return false, fmt.Errorf("Paddle billing period is invalid")
	}
	previousPlan := types.EffectiveConsumerPlan(tenant)
	revokedToPaid := wasRevoked && !revoking && targetPlan != types.ConsumerPlanFree
	// A reversal inside the same provider-paid term restores the frozen target.
	// A later recurring payment has a strictly newer paid-through boundary and
	// starts one normal new allowance. Missing legacy boundaries fail closed by
	// reusing the frozen value rather than minting credit.
	restoringRevoked := revokedToPaid && (tenant.PaddleCurrentPeriodEnd == nil || eventPeriodEnd == nil ||
		!eventPeriodEnd.After(tenant.PaddleCurrentPeriodEnd.UTC()))
	requiresConfirmedPaidPeriod := targetPlan != types.ConsumerPlanFree && !resumingSamePlan &&
		!restoringRevoked && (previousPlan == types.ConsumerPlanFree || tenant.OpenRouterCreditPeriodEnd == nil)
	if requiresConfirmedPaidPeriod &&
		(eventPeriodEnd == nil || eventPeriodEnd.IsZero() || !eventPeriodEnd.After(occurredAt)) {
		logger.Infof(ctx, "Consumer plan event ignored without a confirmed initial paid period tenant_id=%d", tenantID)
		return false, nil
	}
	creditPeriodEnd := nextCreditPeriodEnd(tenant, targetPlan, billingPeriod, occurredAt, eventPeriodEnd)
	if (pausingSamePlan || resumingSamePlan) && tenant.OpenRouterCreditPeriodEnd != nil {
		value := tenant.OpenRouterCreditPeriodEnd.UTC()
		creditPeriodEnd = &value
	}
	if restoringRevoked && tenant.OpenRouterCreditPeriodEnd != nil {
		value := tenant.OpenRouterCreditPeriodEnd.UTC()
		creditPeriodEnd = &value
	}
	if revoking && tenant.OpenRouterCreditPeriodEnd != nil {
		// Keep the paid period boundary frozen with the desired limit. The
		// revoked status itself is the access gate; a later reversal can then
		// restore the exact same period without granting a new cycle.
		value := tenant.OpenRouterCreditPeriodEnd.UTC()
		creditPeriodEnd = &value
	}
	paddlePeriodEnd := nextPaddlePeriodEnd(targetPlan, eventPeriodEnd)

	stored := openRouterCredentialsFromTenant(tenant)
	var priorInfo *modelopenrouter.KeyInfo
	desiredLimit := tenant.OpenRouterDesiredLimitMicrousd
	providerSyncRequired := false
	// A revoked entitlement is fail-closed at the API boundary; leave its
	// provider limit and durable desired value untouched. This makes a reversal
	// an exact replay rather than a new free/paid grant.
	if stored != nil && strings.TrimSpace(stored.KeyHash) != "" && !pausingSamePlan && !resumingSamePlan && !revoking {
		if s.keys == nil {
			return false, fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured; cannot synchronize the tenant spend limit")
		}
		priorInfo, err = s.keys.GetKey(ctx, stored.KeyHash)
		if err != nil {
			return false, fmt.Errorf("read OpenRouter tenant key before plan change: %w", err)
		}
		if priorInfo == nil {
			return false, fmt.Errorf("OpenRouter tenant key lookup returned no state")
		}
		if restoringRevoked {
			// Reversal reuses the frozen absolute target. OpenRouter's lifetime
			// usage remains authoritative, so do not mint a fresh allowance.
			if desiredLimit <= 0 {
				// A legacy revoked row may predate the desired-limit column. Keep
				// its provider limit as the one-time bootstrap rather than granting
				// a fresh target allowance.
				desiredLimit = priorInfo.LimitMicrousd
			}
		} else {
			limit, _ := keyLimitForPlanChange(tenant, targetPlan, billingPeriod, priorInfo)
			desiredLimit = limit
		}
		// A normal end-of-term cancellation starts the user's next Free period.
		// Refunds and paid-tier downgrades do not receive this reset.
		if targetPlan == types.ConsumerPlanFree && status == "canceled" {
			desiredLimit = priorInfo.UsageMicrousd + types.LimitsForConsumerPlan(types.ConsumerPlanFree).MonthlyOpenRouterMicrousd
		}
		providerSyncRequired = desiredLimit > 0
	}

	// The row transaction is the source of truth. Provider synchronization
	// happens only after it commits, so failures leave a replayable desired
	// value instead of a half-applied plan.
	applied, err := s.repo.ApplyConsumerPlan(ctx, tenantID, persistPlan, status, billingPeriod, eventID, occurredAt, customerID, subscriptionID, creditPeriodEnd, paddlePeriodEnd, desiredLimit)
	if err != nil {
		return false, err
	}
	if applied {
		if providerSyncRequired && stored != nil && strings.TrimSpace(stored.KeyHash) != "" {
			if syncErr := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); syncErr != nil {
				return false, syncErr
			}
		}
		logger.Infof(ctx, "Consumer plan applied tenant_id=%d plan=%s status=%s billing_period=%s desired_limit_microusd=%d", tenantID, persistPlan, status, billingPeriod, desiredLimit)
		return true, nil
	}
	// A concurrent newer webhook may have won the row lock. Re-read its one
	// durable target and converge the provider to that value; never reuse our
	// stale usage snapshot for a second grant.
	latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenantID)
	if reloadErr != nil {
		return false, reloadErr
	}
	if storedLatest := openRouterCredentialsFromTenant(latest); storedLatest != nil && strings.TrimSpace(storedLatest.KeyHash) != "" && latest.PlanStatus != "refunded" && latest.PlanStatus != "chargeback" {
		if syncErr := s.syncTenantOpenRouterDesiredLimit(ctx, latest); syncErr != nil {
			return false, syncErr
		}
	}
	if err == nil && !applied && eventID != "" {
		if latest.PaddleLastEventID == eventID {
			return true, nil
		}
	}
	return false, err
}

func (s *entitlementService) syncTenantOpenRouterDesiredLimit(ctx context.Context, tenant *types.Tenant) error {
	if tenant == nil || tenant.ID == 0 {
		return nil
	}

	// Database state is the source of truth, while OpenRouter cannot join the
	// tenant transaction. Re-read before each provider write and verify after
	// it. If a newer Paddle event or operations grant commits while the write is
	// in flight, the same request immediately converges to that newer target
	// instead of returning after restoring its stale one.
	const maxAttempts = 3
	for attempt := 0; attempt < maxAttempts; attempt++ {
		before, err := s.repo.GetTenantEntitlement(ctx, tenant.ID)
		if err != nil {
			return err
		}
		keyHash, desiredLimit, ok := openRouterDesiredTarget(before)
		if !ok {
			return nil
		}
		if err := s.syncOpenRouterLimitToDesired(ctx, keyHash, desiredLimit, nil); err != nil {
			return err
		}

		after, err := s.repo.GetTenantEntitlement(ctx, tenant.ID)
		if err != nil {
			return err
		}
		afterKeyHash, afterDesiredLimit, afterOK := openRouterDesiredTarget(after)
		if !afterOK || (afterKeyHash == keyHash && afterDesiredLimit == desiredLimit) {
			return nil
		}
	}
	return fmt.Errorf("OpenRouter tenant desired limit changed repeatedly during provider synchronization")
}

func openRouterDesiredTarget(tenant *types.Tenant) (keyHash string, desiredLimitMicrousd int64, ok bool) {
	stored := openRouterCredentialsFromTenant(tenant)
	if tenant == nil || stored == nil || strings.TrimSpace(stored.KeyHash) == "" ||
		tenant.PlanStatus == "refunded" || tenant.PlanStatus == "chargeback" || tenant.OpenRouterDesiredLimitMicrousd <= 0 {
		return "", 0, false
	}
	return strings.TrimSpace(stored.KeyHash), tenant.OpenRouterDesiredLimitMicrousd, true
}

func (s *entitlementService) syncOpenRouterLimitToDesired(ctx context.Context, keyHash string, desiredLimitMicrousd int64, info *modelopenrouter.KeyInfo) error {
	if s.keys == nil {
		return fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured; cannot synchronize the tenant spend limit")
	}
	if strings.TrimSpace(keyHash) == "" {
		return fmt.Errorf("OpenRouter tenant key hash is required")
	}
	if desiredLimitMicrousd <= 0 {
		return fmt.Errorf("OpenRouter tenant desired limit is unavailable")
	}
	if info == nil {
		var err error
		info, err = s.keys.GetKey(ctx, keyHash)
		if err != nil {
			return fmt.Errorf("read OpenRouter tenant key for durable restore: %w", err)
		}
		if info == nil {
			return fmt.Errorf("OpenRouter tenant key lookup returned no state")
		}
	}
	if info.LimitMicrousd == desiredLimitMicrousd && !info.MonthlyReset {
		return nil
	}
	if err := s.keys.UpdateKeyLimit(ctx, keyHash, desiredLimitMicrousd, false); err != nil {
		return fmt.Errorf("restore OpenRouter tenant key limit from durable desired value: %w", err)
	}
	return nil
}

func (s *entitlementService) RefreshPaidAllowance(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, periodEnd time.Time) (bool, error) {
	unlock := s.lockAllowance(tenantID)
	defer unlock()
	tenant, err := s.repo.GetTenantEntitlement(ctx, tenantID)
	if err != nil {
		return false, err
	}
	plan = types.NormalizeConsumerPlan(plan)
	if eventID == "" || periodEnd.IsZero() || !periodEnd.After(occurredAt) || (billingPeriod != "monthly" && billingPeriod != "yearly") {
		return false, fmt.Errorf("Paddle recurring transaction has an invalid billing period")
	}
	if strings.TrimSpace(tenant.PaddleCustomerID) != strings.TrimSpace(customerID) ||
		strings.TrimSpace(tenant.PaddleSubscriptionID) != strings.TrimSpace(subscriptionID) {
		return false, fmt.Errorf("Paddle recurring transaction does not match the active tenant subscription")
	}
	periodEnd = periodEnd.UTC()
	if tenant.PlanStatus == "refunded" || tenant.PlanStatus == "chargeback" {
		return s.applyConsumerPlanLocked(ctx, tenantID, plan, "active", billingPeriod, eventID, occurredAt, customerID, subscriptionID, &periodEnd)
	}
	if plan == types.ConsumerPlanFree {
		return false, fmt.Errorf("Paddle recurring transaction does not match a paid plan")
	}
	if types.EffectiveConsumerPlan(tenant) != plan || tenant.PaddleBillingPeriod != billingPeriod {
		// Webhooks are delivered out of order. A signed recurring transaction
		// contains the price and paid period that actually renewed, so it can
		// converge a delayed subscription.updated plan change before advancing
		// allowance. This avoids permanently dropping an upgrade when renewal
		// (T3) is processed before the lifecycle event that caused it (T2).
		if _, applyErr := s.applyConsumerPlanLocked(
			ctx, tenantID, plan, "active", billingPeriod, eventID, occurredAt,
			customerID, subscriptionID, &periodEnd,
		); applyErr != nil {
			return false, applyErr
		}
		tenant, err = s.repo.GetTenantEntitlement(ctx, tenantID)
		if err != nil {
			return false, err
		}
		if types.EffectiveConsumerPlan(tenant) != plan || tenant.PaddleBillingPeriod != billingPeriod {
			// A newer lifecycle event may already supersede this renewal. It is
			// stale, not a retryable provider failure.
			if tenant.PaddleLastEventAt != nil && !occurredAt.After(tenant.PaddleLastEventAt.UTC()) {
				return false, nil
			}
			return false, fmt.Errorf("Paddle recurring transaction could not converge the active plan")
		}
	}
	if billingPeriod == "yearly" {
		applied, err := s.repo.AdvancePaddleCurrentPeriod(ctx, tenantID, plan, customerID, subscriptionID, "yearly", eventID, occurredAt, periodEnd)
		if err != nil {
			return false, err
		}
		if !applied {
			latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenantID)
			if reloadErr != nil {
				return false, reloadErr
			}
			if latest.PlanStatus == "refunded" || latest.PlanStatus == "chargeback" {
				return s.applyConsumerPlanLocked(ctx, tenantID, plan, "active", billingPeriod, eventID, occurredAt, customerID, subscriptionID, &periodEnd)
			}
		}
		logger.Infof(ctx, "Annual paid term confirmed tenant_id=%d event_id=%s period_end=%s applied=%t", tenantID, eventID, periodEnd.Format(time.RFC3339), applied)
		return applied, nil
	}
	if tenant.OpenRouterCreditPeriodEnd != nil && !periodEnd.After(tenant.OpenRouterCreditPeriodEnd.UTC()) {
		logger.Infof(ctx, "Paid allowance event ignored for existing billing period tenant_id=%d event_id=%s", tenantID, eventID)
		return false, nil
	}

	stored := openRouterCredentialsFromTenant(tenant)
	var priorInfo *modelopenrouter.KeyInfo
	desiredLimit := tenant.OpenRouterDesiredLimitMicrousd
	if stored != nil && strings.TrimSpace(stored.KeyHash) != "" {
		if s.keys == nil {
			return false, fmt.Errorf("OPENROUTER_MANAGEMENT_API_KEY is not configured; cannot refresh the tenant spend limit")
		}
		priorInfo, err = s.keys.GetKey(ctx, stored.KeyHash)
		if err != nil {
			return false, fmt.Errorf("read OpenRouter tenant key before allowance refresh: %w", err)
		}
		if priorInfo == nil {
			return false, fmt.Errorf("OpenRouter tenant key lookup returned no state")
		}
		allowance := types.LimitsForConsumerPlan(plan).MonthlyOpenRouterMicrousd
		desiredLimit = priorInfo.UsageMicrousd + allowance
	}

	// Persist the period and its absolute provider target before mutating
	// OpenRouter. A provider failure leaves a durable value that Current or
	// OpenRouterAPIKey can replay safely.
	applied, err := s.repo.AdvanceOpenRouterCreditPeriod(ctx, tenantID, plan, "monthly", eventID, occurredAt, customerID, subscriptionID, periodEnd, desiredLimit)
	if err != nil {
		return false, err
	}
	if applied && stored != nil && strings.TrimSpace(stored.KeyHash) != "" {
		if syncErr := s.syncTenantOpenRouterDesiredLimit(ctx, tenant); syncErr != nil {
			return false, syncErr
		}
	}
	if !applied {
		latest, reloadErr := s.repo.GetTenantEntitlement(ctx, tenantID)
		if reloadErr != nil {
			return false, reloadErr
		}
		if latest.PlanStatus == "refunded" || latest.PlanStatus == "chargeback" {
			restored, restoreErr := s.applyConsumerPlanLocked(ctx, tenantID, plan, "active", billingPeriod, eventID, occurredAt, customerID, subscriptionID, &periodEnd)
			if restoreErr != nil || restored {
				return restored, restoreErr
			}
		}
		if storedLatest := openRouterCredentialsFromTenant(latest); storedLatest != nil && strings.TrimSpace(storedLatest.KeyHash) != "" && latest.PlanStatus != "refunded" && latest.PlanStatus != "chargeback" {
			if syncErr := s.syncTenantOpenRouterDesiredLimit(ctx, latest); syncErr != nil {
				return false, syncErr
			}
		}
	}
	logger.Infof(ctx, "Paid allowance event processed tenant_id=%d event_id=%s period_end=%s applied=%t", tenantID, eventID, periodEnd.Format(time.RFC3339), applied)
	return applied, nil
}

func entitlementResetAt(tenant *types.Tenant, plan types.ConsumerPlan, at time.Time) *time.Time {
	if tenant != nil && tenant.OpenRouterCreditPeriodEnd != nil {
		value := tenant.OpenRouterCreditPeriodEnd.UTC()
		return &value
	}
	value := initialCreditPeriodEnd(tenant, plan, "", at, nil)
	return &value
}

func paidPlanAccessUnavailable(tenant *types.Tenant, plan types.ConsumerPlan, at time.Time) bool {
	if tenant == nil {
		return false
	}
	if complimentary, active := types.ActiveComplimentaryPlanAt(tenant, at); active && complimentary == plan &&
		types.PaddleEffectiveConsumerPlanAt(tenant, at) == types.ConsumerPlanFree {
		return false
	}
	// A persisted paid plan without a provider status is incomplete state. Do
	// not grant access or allowance until a signed Paddle lifecycle event fills
	// the status; this keeps corrupt/partially migrated rows fail-closed.
	if types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree && strings.TrimSpace(tenant.PlanStatus) == "" {
		return true
	}
	// Refunds and chargebacks revoke access immediately. Keep the provider
	// limit frozen with the durable desired value so an authoritative reversal
	// can restore the exact same paid entitlement without minting credit.
	if tenant.PlanStatus == "refunded" || tenant.PlanStatus == "chargeback" {
		return true
	}
	if plan == types.ConsumerPlanFree {
		return types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree && tenant.PlanStatus == "past_due" &&
			(tenant.PaddleCurrentPeriodEnd == nil || !tenant.PaddleCurrentPeriodEnd.After(at.UTC()))
	}
	switch tenant.PaddleBillingPeriod {
	case "monthly":
		return tenant.OpenRouterCreditPeriodEnd == nil || !tenant.OpenRouterCreditPeriodEnd.After(at.UTC())
	case "yearly":
		return tenant.PaddleCurrentPeriodEnd == nil || !tenant.PaddleCurrentPeriodEnd.After(at.UTC())
	default:
		return true
	}
}

func nextPaddlePeriodEnd(targetPlan types.ConsumerPlan, eventPeriodEnd *time.Time) *time.Time {
	if targetPlan == types.ConsumerPlanFree {
		return nil
	}
	if eventPeriodEnd != nil && !eventPeriodEnd.IsZero() {
		value := eventPeriodEnd.UTC()
		return &value
	}
	return nil
}

func nextCreditPeriodEnd(tenant *types.Tenant, targetPlan types.ConsumerPlan, billingPeriod string, at time.Time, eventPeriodEnd *time.Time) *time.Time {
	if tenant != nil && types.EffectiveConsumerPlan(tenant) != types.ConsumerPlanFree && targetPlan != types.ConsumerPlanFree && tenant.OpenRouterCreditPeriodEnd != nil {
		value := tenant.OpenRouterCreditPeriodEnd.UTC()
		return &value
	}
	value := initialCreditPeriodEnd(tenant, targetPlan, billingPeriod, at, eventPeriodEnd)
	return &value
}

func initialCreditPeriodEnd(tenant *types.Tenant, plan types.ConsumerPlan, billingPeriod string, at time.Time, eventPeriodEnd *time.Time) time.Time {
	at = at.UTC()
	if plan != types.ConsumerPlanFree && billingPeriod == "monthly" && eventPeriodEnd != nil && !eventPeriodEnd.IsZero() {
		return eventPeriodEnd.UTC()
	}
	anchor := at
	if plan == types.ConsumerPlanFree && tenant != nil && !tenant.CreatedAt.IsZero() {
		anchor = tenant.CreatedAt.UTC()
	}
	return monthlyBoundaryAfter(anchor, at)
}

func nextPersonalCreditPeriodEnd(currentEnd, at time.Time) time.Time {
	return monthlyBoundaryAfter(currentEnd.UTC(), at.UTC())
}

// monthlyBoundaryAfter returns the first registration/activation anniversary
// strictly after at. Free plans always use the tenant creation timestamp as the
// original anchor, avoiding January/February drift without a scheduler.
func monthlyBoundaryAfter(anchor, at time.Time) time.Time {
	anchor = anchor.UTC()
	at = at.UTC()
	months := (at.Year()-anchor.Year())*12 + int(at.Month()-anchor.Month())
	if months < 1 {
		months = 1
	}
	candidate := addMonthsClamped(anchor, months)
	if !candidate.After(at) {
		candidate = addMonthsClamped(anchor, months+1)
	}
	return candidate
}

func addMonthsClamped(anchor time.Time, months int) time.Time {
	first := time.Date(anchor.Year(), anchor.Month()+time.Month(months), 1, anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), time.UTC)
	lastDay := time.Date(first.Year(), first.Month()+1, 0, anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), time.UTC).Day()
	day := anchor.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(first.Year(), first.Month(), day, anchor.Hour(), anchor.Minute(), anchor.Second(), anchor.Nanosecond(), time.UTC)
}

func complimentaryPeriodEnd(at, expiresAt time.Time) time.Time {
	end := addMonthsClamped(at.UTC(), 1)
	if expiresAt.UTC().Before(end) {
		return expiresAt.UTC()
	}
	return end
}

func validComplimentaryGrantID(value string) bool {
	if len(value) < 16 || len(value) > 64 {
		return false
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' {
			continue
		}
		return false
	}
	return true
}

func keyLimitForPlanChange(tenant *types.Tenant, targetPlan types.ConsumerPlan, billingPeriod string, info *modelopenrouter.KeyInfo) (int64, bool) {
	targetAllowance := types.LimitsForConsumerPlan(targetPlan).MonthlyOpenRouterMicrousd
	if info == nil {
		return targetAllowance, false
	}
	oldPlan := types.EffectiveConsumerPlan(tenant)
	oldAllowance := types.LimitsForConsumerPlan(oldPlan).MonthlyOpenRouterMicrousd
	// A free-to-paid activation starts with one full target allowance. Paid plan
	// changes keep the amount already consumed, including downgrades.
	if oldPlan == types.ConsumerPlanFree && targetPlan != types.ConsumerPlanFree {
		return info.UsageMicrousd + targetAllowance, false
	}
	used := oldAllowance - clampMicrousd(info.LimitRemainingMicrousd, 0, oldAllowance)
	if info.MonthlyReset {
		used = clampMicrousd(info.UsageMonthlyMicrousd, 0, oldAllowance)
	}
	remaining := targetAllowance - used
	if remaining < 0 {
		remaining = 0
	}
	return info.UsageMicrousd + remaining, false
}

func clampMicrousd(value, minimum, maximum int64) int64 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func nonNegativeMicrousd(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}
