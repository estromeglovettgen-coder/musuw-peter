package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type entitlementRepository struct {
	db *gorm.DB
}

func entitlementTenantError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrTenantNotFound
	}
	return err
}

// ErrComplimentaryPlanConflict marks a durable complimentary-entitlement
// state conflict.  Callers may safely map this sentinel to HTTP 409; database
// and infrastructure errors intentionally remain unclassified so they can be
// retried instead of being reported as caller conflicts.
var ErrComplimentaryPlanConflict = errors.New("complimentary plan state conflict")

func NewEntitlementRepository(db *gorm.DB) interfaces.EntitlementRepository {
	return &entitlementRepository{db: db}
}

func (r *entitlementRepository) GetTenantEntitlement(ctx context.Context, tenantID uint64) (*types.Tenant, error) {
	var tenant types.Tenant
	if err := r.db.WithContext(ctx).First(&tenant, tenantID).Error; err != nil {
		return nil, entitlementTenantError(err)
	}
	return &tenant, nil
}

func (r *entitlementRepository) ResolvePaddleSubscription(ctx context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, error) {
	customerID = strings.TrimSpace(customerID)
	subscriptionID = strings.TrimSpace(subscriptionID)
	if customerID == "" || subscriptionID == "" {
		return nil, nil
	}
	var tenants []types.Tenant
	if err := r.db.WithContext(ctx).
		Where("paddle_customer_id = ? AND paddle_subscription_id = ?", customerID, subscriptionID).
		Limit(2).
		Find(&tenants).Error; err != nil {
		return nil, err
	}
	if len(tenants) == 0 {
		return nil, nil
	}
	if len(tenants) != 1 {
		return nil, fmt.Errorf("Paddle customer/subscription binding is ambiguous")
	}
	tenant := tenants[0]
	return &types.PaddleSubscriptionBinding{
		TenantID:       tenant.ID,
		Plan:           types.NormalizeConsumerPlan(tenant.Plan),
		Status:         tenant.PlanStatus,
		BillingPeriod:  tenant.PaddleBillingPeriod,
		CustomerID:     tenant.PaddleCustomerID,
		SubscriptionID: tenant.PaddleSubscriptionID,
	}, nil
}

// SetOpenRouterCredentialsIfAbsent installs the first provider-managed key for
// a tenant without replacing any other provider credentials. The row lock makes
// first-use provisioning safe when multiple requests or replicas race.
func (r *entitlementRepository) SetOpenRouterCredentialsIfAbsent(ctx context.Context, tenantID uint64, credentials *types.OpenRouterCredentials, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	if credentials == nil || credentials.APIKey == "" || credentials.KeyHash == "" {
		return false, fmt.Errorf("OpenRouter tenant credentials are incomplete")
	}
	if desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit must be positive")
	}
	inserted := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if tenant.Credentials != nil && tenant.Credentials.OpenRouter != nil {
			return nil
		}
		merged := types.CredentialsConfig{}
		if tenant.Credentials != nil {
			merged = *tenant.Credentials
		}
		copy := *credentials
		merged.OpenRouter = &copy
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(map[string]any{
			"credentials":                        &merged,
			"open_router_credit_period_end":      creditPeriodEnd.UTC(),
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}).Error; err != nil {
			return err
		}
		inserted = true
		return nil
	})
	return inserted, err
}

// SetOpenRouterDesiredLimit changes the one durable absolute target for an
// existing managed key. The provider mutation is intentionally performed by
// the service after this write commits, so a failed provider call can be
// replayed by any later entitlement read.
func (r *entitlementRepository) SetOpenRouterDesiredLimit(ctx context.Context, tenantID uint64, desiredLimitMicrousd int64) (bool, error) {
	if desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit must be positive")
	}
	result := r.db.WithContext(ctx).Model(&types.Tenant{}).Where("id = ?", tenantID).
		Update("open_router_desired_limit_microusd", desiredLimitMicrousd)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// SetOpenRouterDesiredLimitIfUnset bootstraps a legacy row exactly once. The
// row lock means concurrent readers cannot overwrite the first observed
// provider limit with a different value.
func (r *entitlementRepository) SetOpenRouterDesiredLimitIfUnset(ctx context.Context, tenantID uint64, desiredLimitMicrousd int64) (bool, error) {
	if desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit must be positive")
	}
	inserted := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if tenant.OpenRouterDesiredLimitMicrousd > 0 {
			return nil
		}
		result := tx.Model(&types.Tenant{}).Where("id = ? AND open_router_desired_limit_microusd = 0", tenantID).
			Update("open_router_desired_limit_microusd", desiredLimitMicrousd)
		if result.Error != nil {
			return result.Error
		}
		inserted = result.RowsAffected == 1
		return nil
	})
	return inserted, err
}

func (r *entitlementRepository) GrantComplimentaryPlan(
	ctx context.Context,
	tenantID uint64,
	plan types.ConsumerPlan,
	grantID string,
	at, expiresAt, creditPeriodEnd time.Time,
	desiredLimitMicrousd int64,
) (bool, error) {
	plan = types.NormalizeConsumerPlan(plan)
	grantID = strings.TrimSpace(grantID)
	at, expiresAt, creditPeriodEnd = at.UTC(), expiresAt.UTC(), creditPeriodEnd.UTC()
	if plan == types.ConsumerPlanFree {
		return false, fmt.Errorf("complimentary plan must be plus, pro, or max")
	}
	if grantID == "" {
		return false, fmt.Errorf("complimentary grant ID is required")
	}
	if !expiresAt.After(at) {
		return false, fmt.Errorf("complimentary expiration must be in the future")
	}
	if !creditPeriodEnd.After(at) || creditPeriodEnd.After(expiresAt) {
		return false, fmt.Errorf("complimentary credit period must end after now and no later than expiration")
	}
	if desiredLimitMicrousd < 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit cannot be negative")
	}

	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if tenant.ComplimentaryGrantID == grantID {
			if tenant.ComplimentaryPlan == plan && tenant.ComplimentaryExpiresAt != nil && tenant.ComplimentaryExpiresAt.UTC().Equal(expiresAt) {
				return nil
			}
			return fmt.Errorf("%w: complimentary grant ID was already used", ErrComplimentaryPlanConflict)
		}
		if _, active := types.ActiveComplimentaryPlanAt(&tenant, at); active {
			return fmt.Errorf("%w: an active complimentary grant must be revoked before replacement", ErrComplimentaryPlanConflict)
		}
		if types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree ||
			strings.TrimSpace(tenant.PaddleCustomerID) != "" || strings.TrimSpace(tenant.PaddleSubscriptionID) != "" {
			return fmt.Errorf("%w: complimentary grants require a Paddle-unbound Free tenant", ErrComplimentaryPlanConflict)
		}
		updates := map[string]any{
			"complimentary_plan":                 plan,
			"complimentary_expires_at":           expiresAt,
			"complimentary_grant_id":             grantID,
			"open_router_credit_period_end":      creditPeriodEnd,
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}

func (r *entitlementRepository) RevokeComplimentaryPlan(
	ctx context.Context,
	tenantID uint64,
	grantID string,
	at, creditPeriodEnd time.Time,
	desiredLimitMicrousd int64,
) (bool, error) {
	grantID = strings.TrimSpace(grantID)
	at, creditPeriodEnd = at.UTC(), creditPeriodEnd.UTC()
	if grantID == "" {
		return false, fmt.Errorf("complimentary grant ID is required")
	}
	if creditPeriodEnd.Before(at) {
		return false, fmt.Errorf("revoked credit period cannot end before revoke time")
	}
	if desiredLimitMicrousd < 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit cannot be negative")
	}

	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if tenant.ComplimentaryGrantID != grantID {
			return fmt.Errorf("%w: complimentary grant ID does not match", ErrComplimentaryPlanConflict)
		}
		// A signed Paddle activation clears the overlay but retains this ID.
		// Delayed revoke is therefore an idempotent no-op, never a paid-plan write.
		if tenant.ComplimentaryPlan == "" || tenant.ComplimentaryExpiresAt == nil {
			return nil
		}
		updates := map[string]any{
			"complimentary_plan":                 nil,
			"complimentary_expires_at":           nil,
			"open_router_credit_period_end":      creditPeriodEnd,
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}

func (r *entitlementRepository) AdvanceComplimentaryCreditPeriod(
	ctx context.Context,
	tenantID uint64,
	grantID string,
	at time.Time,
	expectedPlan types.ConsumerPlan,
	periodEnd time.Time,
	desiredLimitMicrousd int64,
) (bool, error) {
	grantID = strings.TrimSpace(grantID)
	at, periodEnd = at.UTC(), periodEnd.UTC()
	expectedPlan = types.NormalizeConsumerPlan(expectedPlan)
	if grantID == "" || !periodEnd.After(at) || desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("invalid complimentary credit-period transition")
	}
	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if tenant.ComplimentaryGrantID != grantID || types.NormalizeConsumerPlan(tenant.Plan) != types.ConsumerPlanFree ||
			strings.TrimSpace(tenant.PaddleCustomerID) != "" || strings.TrimSpace(tenant.PaddleSubscriptionID) != "" {
			return nil
		}
		actualPlan := types.EffectiveConsumerPlanAt(&tenant, at)
		if actualPlan != expectedPlan {
			return nil
		}
		if expectedPlan != types.ConsumerPlanFree {
			if grantPlan, active := types.ActiveComplimentaryPlanAt(&tenant, at); !active || grantPlan != expectedPlan ||
				(tenant.ComplimentaryExpiresAt != nil && periodEnd.After(tenant.ComplimentaryExpiresAt.UTC())) {
				return nil
			}
		} else if tenant.ComplimentaryExpiresAt == nil || tenant.ComplimentaryExpiresAt.After(at) {
			return nil
		}
		if tenant.OpenRouterCreditPeriodEnd != nil && !periodEnd.After(tenant.OpenRouterCreditPeriodEnd.UTC()) {
			return nil
		}
		updates := map[string]any{
			"open_router_credit_period_end":      periodEnd,
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}

func (r *entitlementRepository) ApplyConsumerPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, creditPeriodEnd, paddlePeriodEnd *time.Time, desiredLimitMicrousd int64) (bool, error) {
	if desiredLimitMicrousd < 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit cannot be negative")
	}
	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if eventID != "" {
			if tenant.PaddleLastEventID == eventID || (tenant.PaddleLastEventAt != nil && !occurredAt.After(*tenant.PaddleLastEventAt)) {
				return nil
			}
			// Renewal events have their own monotonic cursor. Lifecycle and
			// adjustment webhooks may advance PaddleLastEventAt, but must not
			// suppress a valid recurring payment that belongs to this period.
			if tenant.PaddleLastRenewalAt != nil && !occurredAt.After(tenant.PaddleLastRenewalAt.UTC()) {
				return nil
			}
		}
		plan = types.NormalizeConsumerPlan(plan)
		if status == "" {
			status = "active"
		}
		effectivePlan := types.EffectiveConsumerPlan(&types.Tenant{Plan: plan, PlanStatus: status})
		currentCustomerID := strings.TrimSpace(tenant.PaddleCustomerID)
		currentSubscriptionID := strings.TrimSpace(tenant.PaddleSubscriptionID)
		incomingCustomerID := strings.TrimSpace(customerID)
		incomingSubscriptionID := strings.TrimSpace(subscriptionID)
		newInitialPaidActivation := (types.NormalizeConsumerPlan(tenant.Plan) == types.ConsumerPlanFree || tenant.PlanStatus == "canceled") &&
			effectivePlan != types.ConsumerPlanFree && status == "active" && incomingCustomerID != "" && incomingSubscriptionID != "" &&
			paddlePeriodEnd != nil && !paddlePeriodEnd.IsZero() && paddlePeriodEnd.After(occurredAt)
		// Repeat the service ownership check while the tenant row is locked. Two
		// replicas may both observe a free tenant before either initial webhook
		// commits; the later event must not replace the first bound subscription.
		if !newInitialPaidActivation &&
			((currentCustomerID != "" && incomingCustomerID != currentCustomerID) ||
				(currentSubscriptionID != "" && incomingSubscriptionID != currentSubscriptionID)) {
			return nil
		}
		limits := types.LimitsForConsumerPlan(effectivePlan)
		// Revocation is an access-state change, not a new allowance grant. Keep
		// the last paid absolute target durable even if an older caller still
		// sends plan=free/desired=0; the provider remains untouched and an
		// authoritative reversal can replay this exact target later.
		if (status == "refunded" || status == "chargeback") && tenant.OpenRouterDesiredLimitMicrousd > 0 {
			desiredLimitMicrousd = tenant.OpenRouterDesiredLimitMicrousd
		}
		updates := map[string]any{
			"plan":                               plan,
			"plan_status":                        status,
			"storage_quota":                      limits.StorageBytes,
			"paddle_customer_id":                 customerID,
			"paddle_subscription_id":             subscriptionID,
			"paddle_billing_period":              billingPeriod,
			"open_router_credit_period_end":      creditPeriodEnd,
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}
		if effectivePlan != types.ConsumerPlanFree && (status == "active" || status == "trialing" || status == "past_due") {
			updates["complimentary_plan"] = nil
			updates["complimentary_expires_at"] = nil
		}
		if effectivePlan == types.ConsumerPlanFree && status != "paused" && status != "refunded" && status != "chargeback" {
			updates["paddle_current_period_end"] = nil
		} else if paddlePeriodEnd != nil && !paddlePeriodEnd.IsZero() &&
			(tenant.PaddleCurrentPeriodEnd == nil || paddlePeriodEnd.After(tenant.PaddleCurrentPeriodEnd.UTC())) {
			value := paddlePeriodEnd.UTC()
			updates["paddle_current_period_end"] = &value
		}
		if eventID != "" {
			updates["paddle_last_event_id"] = eventID
			updates["paddle_last_event_at"] = occurredAt.UTC()
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}

// AdvanceOpenRouterCreditPeriod is the only local allowance-period marker.
// Recurring payment events use PaddleLastRenewalAt rather than the lifecycle
// cursor, so unrelated webhooks cannot suppress a valid renewal.
func (r *entitlementRepository) AdvanceOpenRouterCreditPeriod(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, periodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	if desiredLimitMicrousd < 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit cannot be negative")
	}
	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		if eventID != "" {
			plan = types.NormalizeConsumerPlan(plan)
			if plan == types.ConsumerPlanFree || types.EffectiveConsumerPlan(&tenant) != plan ||
				billingPeriod != "monthly" || tenant.PaddleBillingPeriod != billingPeriod ||
				strings.TrimSpace(tenant.PaddleCustomerID) != strings.TrimSpace(customerID) ||
				strings.TrimSpace(tenant.PaddleSubscriptionID) != strings.TrimSpace(subscriptionID) {
				return nil
			}
			if tenant.PaddleLastRenewalAt != nil && !occurredAt.After(tenant.PaddleLastRenewalAt.UTC()) {
				return nil
			}
		}
		periodEnd = periodEnd.UTC()
		if tenant.OpenRouterCreditPeriodEnd != nil && !periodEnd.After(tenant.OpenRouterCreditPeriodEnd.UTC()) {
			return nil
		}
		updates := map[string]any{
			"open_router_credit_period_end":      periodEnd,
			"open_router_desired_limit_microusd": desiredLimitMicrousd,
		}
		if eventID != "" && (tenant.PaddleLastRenewalAt == nil || occurredAt.After(tenant.PaddleLastRenewalAt.UTC())) {
			updates["paddle_last_renewal_at"] = occurredAt.UTC()
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}

// AdvancePaddleCurrentPeriod records only a newer provider-confirmed service
// period and advances the independent renewal cursor in the same row
// transaction. No local billing ledger is needed.
func (r *entitlementRepository) AdvancePaddleCurrentPeriod(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, customerID, subscriptionID, billingPeriod, eventID string, occurredAt, periodEnd time.Time) (bool, error) {
	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant types.Tenant
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&tenant, tenantID).Error; err != nil {
			return entitlementTenantError(err)
		}
		plan = types.NormalizeConsumerPlan(plan)
		if plan == types.ConsumerPlanFree || types.EffectiveConsumerPlan(&tenant) != plan ||
			tenant.PaddleBillingPeriod != billingPeriod || billingPeriod != "yearly" ||
			strings.TrimSpace(tenant.PaddleCustomerID) != strings.TrimSpace(customerID) ||
			strings.TrimSpace(tenant.PaddleSubscriptionID) != strings.TrimSpace(subscriptionID) {
			return nil
		}
		if eventID != "" && tenant.PaddleLastRenewalAt != nil && !occurredAt.After(tenant.PaddleLastRenewalAt.UTC()) {
			return nil
		}
		periodEnd = periodEnd.UTC()
		if tenant.PaddleCurrentPeriodEnd != nil && !periodEnd.After(tenant.PaddleCurrentPeriodEnd.UTC()) {
			return nil
		}
		updates := map[string]any{"paddle_current_period_end": periodEnd}
		if eventID != "" && (tenant.PaddleLastRenewalAt == nil || occurredAt.After(tenant.PaddleLastRenewalAt.UTC())) {
			updates["paddle_last_renewal_at"] = occurredAt.UTC()
		}
		if err := tx.Model(&types.Tenant{}).Where("id = ?", tenantID).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}
