package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type entitlementRepoStub struct {
	mu            sync.Mutex
	tenant        *types.Tenant
	getTenantErr  error
	grantPlanErr  error
	revokePlanErr error
}

func (s *entitlementRepoStub) GetTenantEntitlement(context.Context, uint64) (*types.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.getTenantErr != nil {
		return nil, s.getTenantErr
	}
	copy := *s.tenant
	if s.tenant.Credentials != nil {
		credentials := *s.tenant.Credentials
		if s.tenant.Credentials.OpenRouter != nil {
			openrouter := *s.tenant.Credentials.OpenRouter
			credentials.OpenRouter = &openrouter
		}
		copy.Credentials = &credentials
	}
	return &copy, nil
}

func (s *entitlementRepoStub) ResolvePaddleSubscription(_ context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tenant.PaddleCustomerID != customerID || s.tenant.PaddleSubscriptionID != subscriptionID {
		return nil, nil
	}
	return &types.PaddleSubscriptionBinding{
		TenantID:       s.tenant.ID,
		Plan:           types.NormalizeConsumerPlan(s.tenant.Plan),
		Status:         s.tenant.PlanStatus,
		BillingPeriod:  s.tenant.PaddleBillingPeriod,
		CustomerID:     s.tenant.PaddleCustomerID,
		SubscriptionID: s.tenant.PaddleSubscriptionID,
	}, nil
}

func (s *entitlementRepoStub) SetOpenRouterCredentialsIfAbsent(_ context.Context, _ uint64, credentials *types.OpenRouterCredentials, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tenant.Credentials != nil && s.tenant.Credentials.OpenRouter != nil {
		return false, nil
	}
	if s.tenant.Credentials == nil {
		s.tenant.Credentials = &types.CredentialsConfig{}
	}
	copy := *credentials
	s.tenant.Credentials.OpenRouter = &copy
	value := creditPeriodEnd.UTC()
	s.tenant.OpenRouterCreditPeriodEnd = &value
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) SetOpenRouterDesiredLimit(_ context.Context, _ uint64, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit must be positive")
	}
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) SetOpenRouterDesiredLimitIfUnset(_ context.Context, _ uint64, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if desiredLimitMicrousd <= 0 {
		return false, fmt.Errorf("OpenRouter tenant desired limit must be positive")
	}
	if s.tenant.OpenRouterDesiredLimitMicrousd > 0 {
		return false, nil
	}
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) GrantComplimentaryPlan(_ context.Context, _ uint64, plan types.ConsumerPlan, grantID string, at, expiresAt, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.grantPlanErr != nil {
		return false, s.grantPlanErr
	}
	if s.tenant.ComplimentaryGrantID == grantID {
		if s.tenant.ComplimentaryPlan == plan && s.tenant.ComplimentaryExpiresAt != nil && s.tenant.ComplimentaryExpiresAt.Equal(expiresAt) {
			return false, nil
		}
		return false, fmt.Errorf("complimentary grant ID was already used")
	}
	if _, active := types.ActiveComplimentaryPlanAt(s.tenant, at); active {
		return false, fmt.Errorf("an active complimentary grant must be revoked before replacement")
	}
	if types.NormalizeConsumerPlan(s.tenant.Plan) != types.ConsumerPlanFree || s.tenant.PaddleCustomerID != "" || s.tenant.PaddleSubscriptionID != "" {
		return false, fmt.Errorf("complimentary grants require a Paddle-unbound Free tenant")
	}
	s.tenant.ComplimentaryPlan = plan
	s.tenant.ComplimentaryGrantID = grantID
	expires := expiresAt.UTC()
	s.tenant.ComplimentaryExpiresAt = &expires
	period := creditPeriodEnd.UTC()
	s.tenant.OpenRouterCreditPeriodEnd = &period
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) RevokeComplimentaryPlan(_ context.Context, _ uint64, grantID string, at, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.revokePlanErr != nil {
		return false, s.revokePlanErr
	}
	if s.tenant.ComplimentaryGrantID != grantID {
		return false, fmt.Errorf("complimentary grant ID does not match")
	}
	if s.tenant.ComplimentaryPlan == "" || s.tenant.ComplimentaryExpiresAt == nil {
		return false, nil
	}
	s.tenant.ComplimentaryPlan = ""
	s.tenant.ComplimentaryExpiresAt = nil
	period := creditPeriodEnd.UTC()
	s.tenant.OpenRouterCreditPeriodEnd = &period
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) AdvanceComplimentaryCreditPeriod(_ context.Context, _ uint64, grantID string, at time.Time, expectedPlan types.ConsumerPlan, periodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tenant.ComplimentaryGrantID != grantID || types.EffectiveConsumerPlanAt(s.tenant, at) != expectedPlan {
		return false, nil
	}
	if expectedPlan == types.ConsumerPlanFree && (s.tenant.ComplimentaryExpiresAt == nil || s.tenant.ComplimentaryExpiresAt.After(at)) {
		return false, nil
	}
	if expectedPlan != types.ConsumerPlanFree && s.tenant.ComplimentaryExpiresAt != nil && periodEnd.After(*s.tenant.ComplimentaryExpiresAt) {
		return false, nil
	}
	if s.tenant.OpenRouterCreditPeriodEnd != nil && !periodEnd.After(*s.tenant.OpenRouterCreditPeriodEnd) {
		return false, nil
	}
	period := periodEnd.UTC()
	s.tenant.OpenRouterCreditPeriodEnd = &period
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	return true, nil
}

func (s *entitlementRepoStub) ApplyConsumerPlan(_ context.Context, _ uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, creditPeriodEnd, paddlePeriodEnd *time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if eventID != "" {
		if s.tenant.PaddleLastEventID == eventID || (s.tenant.PaddleLastEventAt != nil && !occurredAt.After(s.tenant.PaddleLastEventAt.UTC())) ||
			(s.tenant.PaddleLastRenewalAt != nil && !occurredAt.After(s.tenant.PaddleLastRenewalAt.UTC())) {
			return false, nil
		}
	}
	s.tenant.Plan = plan
	if status == "" {
		status = "active"
	}
	s.tenant.PlanStatus = status
	s.tenant.PaddleBillingPeriod = billingPeriod
	s.tenant.PaddleCustomerID = customerID
	s.tenant.PaddleSubscriptionID = subscriptionID
	if types.EffectiveConsumerPlan(s.tenant) == types.ConsumerPlanFree && status != "paused" && status != "refunded" && status != "chargeback" {
		s.tenant.PaddleCurrentPeriodEnd = nil
	} else if paddlePeriodEnd != nil && (s.tenant.PaddleCurrentPeriodEnd == nil || paddlePeriodEnd.After(s.tenant.PaddleCurrentPeriodEnd.UTC())) {
		value := paddlePeriodEnd.UTC()
		s.tenant.PaddleCurrentPeriodEnd = &value
	}
	s.tenant.OpenRouterCreditPeriodEnd = creditPeriodEnd
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	if types.EffectiveConsumerPlan(s.tenant) != types.ConsumerPlanFree && (status == "active" || status == "trialing" || status == "past_due") {
		s.tenant.ComplimentaryPlan = ""
		s.tenant.ComplimentaryExpiresAt = nil
	}
	if eventID != "" {
		s.tenant.PaddleLastEventID = eventID
		value := occurredAt.UTC()
		s.tenant.PaddleLastEventAt = &value
	}
	return true, nil
}

func TestGrantComplimentaryPlanSynchronizesExistingKeyAndIsReplaySafe(t *testing.T) {
	now := time.Now().UTC()
	freePeriodEnd := now.Add(12 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -2, 0),
		OpenRouterCreditPeriodEnd: &freePeriodEnd, OpenRouterDesiredLimitMicrousd: 400_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-1", UsageMicrousd: 250_000, LimitMicrousd: 400_000, LimitRemainingMicrousd: 150_000,
	}}
	svc := newEntitlementService(repo, keys)
	expires := now.AddDate(0, 2, 0)

	current, applied, err := svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPro, expires, "grant-1234567890")
	require.NoError(t, err)
	require.True(t, applied)
	require.NotNil(t, current)
	assert.Equal(t, types.ConsumerPlanPro, current.Plan)
	assert.Equal(t, "complimentary", current.PlanStatus)
	assert.Equal(t, "complimentary", current.PlanSource)
	assert.Equal(t, int64(2_750_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, int64(2_750_000), keys.updateLimit)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.True(t, repo.tenant.OpenRouterCreditPeriodEnd.After(now))
	assert.False(t, repo.tenant.OpenRouterCreditPeriodEnd.After(expires))

	updates := keys.updateCalls
	current, applied, err = svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPro, expires, "grant-1234567890")
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, updates, keys.updateCalls, "exact replay must not mint or resynchronize another allowance")
	assert.Equal(t, types.ConsumerPlanPro, current.Plan)
}

func TestProviderSynchronizationConvergesWhenPaddleSupersedesGrantDuringWrite(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(24 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active",
		ComplimentaryPlan: types.ConsumerPlanPro, ComplimentaryGrantID: "grant-race-123456", ComplimentaryExpiresAt: &expires,
		OpenRouterDesiredLimitMicrousd: 2_500_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-or-v1", KeyHash: "hash-1",
		}},
	}}
	keys := &blockingLimitKeyManager{
		info:    &modelopenrouter.KeyInfo{Hash: "hash-1", LimitMicrousd: 400_000, LimitRemainingMicrousd: 400_000},
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	svc := newEntitlementService(repo, keys).(*entitlementService)

	done := make(chan error, 1)
	go func() {
		done <- svc.syncTenantOpenRouterDesiredLimit(context.Background(), repo.tenant)
	}()
	<-keys.started

	// Simulate a signed Paddle activation committing while the older grant
	// provider write is blocked. The old writer must notice the new durable
	// target and repair its own stale write before returning.
	repo.mu.Lock()
	repo.tenant.Plan = types.ConsumerPlanPro
	repo.tenant.PlanStatus = "active"
	repo.tenant.PaddleCustomerID = "ctm_paid"
	repo.tenant.PaddleSubscriptionID = "sub_paid"
	repo.tenant.ComplimentaryPlan = ""
	repo.tenant.ComplimentaryExpiresAt = nil
	repo.tenant.OpenRouterDesiredLimitMicrousd = 4_000_000
	repo.mu.Unlock()
	close(keys.release)

	require.NoError(t, <-done)
	assert.Equal(t, []int64{2_500_000, 4_000_000}, keys.updateLimits())
	assert.Equal(t, int64(4_000_000), keys.info.LimitMicrousd)
}

func TestGrantComplimentaryPlanSupportsEveryPaidTierWithoutEagerKeyCreation(t *testing.T) {
	for _, plan := range []types.ConsumerPlan{types.ConsumerPlanPlus, types.ConsumerPlanPro, types.ConsumerPlanMax} {
		t.Run(string(plan), func(t *testing.T) {
			now := time.Now().UTC()
			repo := &entitlementRepoStub{tenant: &types.Tenant{
				ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -1, 0),
			}}
			keys := &keyManagerStub{}
			svc := newEntitlementService(repo, keys)

			current, applied, err := svc.GrantComplimentaryPlan(
				context.Background(), 7, plan, now.Add(48*time.Hour), "grant-"+string(plan)+"-1234567890",
			)

			require.NoError(t, err)
			require.True(t, applied)
			assert.Equal(t, plan, current.Plan)
			assert.Equal(t, "complimentary", current.PlanSource)
			assert.Zero(t, keys.createCalls, "granting must not create a second or eager provider key")
			assert.Zero(t, keys.updateCalls)
		})
	}
}

func TestGrantComplimentaryPlanPreservesTransientRepositoryErrors(t *testing.T) {
	now := time.Now().UTC()
	dbErr := errors.New("database temporarily unavailable")

	t.Run("lookup", func(t *testing.T) {
		repo := &entitlementRepoStub{getTenantErr: dbErr}
		svc := newEntitlementService(repo, &keyManagerStub{})

		current, applied, err := svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPro, now.Add(time.Hour), "grant-transient-123")

		require.ErrorIs(t, err, dbErr)
		assert.Nil(t, current)
		assert.False(t, applied)
		_, isAppError := err.(*apperrors.AppError)
		assert.False(t, isAppError, "transient repository errors must not be classified as conflicts")
	})

	t.Run("mutation", func(t *testing.T) {
		repo := &entitlementRepoStub{
			tenant:       &types.Tenant{ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active"},
			grantPlanErr: dbErr,
		}
		svc := newEntitlementService(repo, &keyManagerStub{})

		current, applied, err := svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPro, now.Add(time.Hour), "grant-transient-123")

		require.ErrorIs(t, err, dbErr)
		assert.Nil(t, current)
		assert.False(t, applied)
		_, isAppError := err.(*apperrors.AppError)
		assert.False(t, isAppError, "transient repository errors must not be classified as conflicts")
	})
}

func TestComplimentaryPlanRefreshesOneMonthlyAllowanceAndCapsNextBoundaryAtExpiry(t *testing.T) {
	now := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	previousBoundary := now.Add(-24 * time.Hour)
	expires := now.Add(10 * 24 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -4, 0),
		ComplimentaryPlan: types.ConsumerPlanMax, ComplimentaryGrantID: "grant-refresh-123", ComplimentaryExpiresAt: &expires,
		OpenRouterCreditPeriodEnd: &previousBoundary, OpenRouterDesiredLimitMicrousd: 5_100_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-1", UsageMicrousd: 1_200_000, LimitMicrousd: 5_100_000, LimitRemainingMicrousd: 3_900_000,
	}}
	svc := newEntitlementService(repo, keys)

	current, err := svc.CurrentForTenant(context.Background(), 7, now)

	require.NoError(t, err)
	assert.Equal(t, types.ConsumerPlanMax, current.Plan)
	assert.Equal(t, int64(6_200_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, int64(6_200_000), keys.updateLimit)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, expires, repo.tenant.OpenRouterCreditPeriodEnd.UTC(), "the final grant period must never cross custom expiration")
}

func TestGrantComplimentaryPlanKeepsDurableTargetWhenProviderSyncFails(t *testing.T) {
	now := time.Now().UTC()
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -1, 0),
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{
		info:      &modelopenrouter.KeyInfo{Hash: "hash-1", UsageMicrousd: 300_000, LimitMicrousd: 400_000, LimitRemainingMicrousd: 100_000},
		updateErr: errors.New("provider unavailable"),
	}
	svc := newEntitlementService(repo, keys)

	current, applied, err := svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPlus, now.Add(24*time.Hour), "grant-provider-123")

	require.Error(t, err)
	assert.Nil(t, current)
	assert.True(t, applied, "the caller must know the durable transition committed before provider failure")
	assert.Equal(t, types.ConsumerPlanPlus, repo.tenant.ComplimentaryPlan)
	assert.Equal(t, int64(1_550_000), repo.tenant.OpenRouterDesiredLimitMicrousd)

	current, applied, err = svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPlus, now.Add(24*time.Hour), "grant-provider-123")
	require.Error(t, err, "an exact retry must keep reporting unavailable until the durable target converges")
	assert.Nil(t, current)
	assert.False(t, applied)

	keys.updateErr = nil
	current, applied, err = svc.GrantComplimentaryPlan(context.Background(), 7, types.ConsumerPlanPlus, now.Add(24*time.Hour), "grant-provider-123")
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, types.ConsumerPlanPlus, current.Plan)
}

func TestComplimentaryPlanExpiresAndConvergesProviderToFree(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(-time.Second)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -2, 0),
		ComplimentaryPlan: types.ConsumerPlanMax, ComplimentaryGrantID: "grant-expired-123", ComplimentaryExpiresAt: &expires,
		OpenRouterCreditPeriodEnd: &expires, OpenRouterDesiredLimitMicrousd: 5_100_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-1", UsageMicrousd: 100_000, LimitMicrousd: 5_100_000, LimitRemainingMicrousd: 5_000_000,
	}}
	svc := newEntitlementService(repo, keys)

	current, err := svc.CurrentForTenant(context.Background(), 7, now)
	require.NoError(t, err)
	assert.Equal(t, types.ConsumerPlanFree, current.Plan)
	assert.Equal(t, int64(500_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, int64(500_000), keys.updateLimit)
	assert.Equal(t, int64(400_000), current.OpenRouterRemainingMicrousd)
}

func TestRevokeComplimentaryPlanRestoresFreeWithoutTouchingPaddle(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -2, 0),
		ComplimentaryPlan: types.ConsumerPlanPlus, ComplimentaryGrantID: "grant-revoke-123", ComplimentaryExpiresAt: &expires,
		OpenRouterCreditPeriodEnd: &expires, OpenRouterDesiredLimitMicrousd: 1_350_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-1", UsageMicrousd: 100_000, LimitMicrousd: 1_350_000, LimitRemainingMicrousd: 1_250_000,
	}}
	svc := newEntitlementService(repo, keys)

	current, applied, err := svc.RevokeComplimentaryPlan(context.Background(), 7, "grant-revoke-123")
	require.NoError(t, err)
	require.True(t, applied)
	assert.Equal(t, types.ConsumerPlanFree, current.Plan)
	assert.Empty(t, repo.tenant.ComplimentaryPlan)
	assert.Nil(t, repo.tenant.ComplimentaryExpiresAt)
	assert.Equal(t, int64(500_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, int64(500_000), keys.updateLimit)
}

func TestRevokeComplimentaryPlanPreservesTransientRepositoryErrors(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(time.Hour)
	dbErr := errors.New("database temporarily unavailable")

	t.Run("lookup", func(t *testing.T) {
		repo := &entitlementRepoStub{getTenantErr: dbErr}
		svc := newEntitlementService(repo, &keyManagerStub{})

		current, applied, err := svc.RevokeComplimentaryPlan(context.Background(), 7, "grant-transient-123")

		require.ErrorIs(t, err, dbErr)
		assert.Nil(t, current)
		assert.False(t, applied)
		_, isAppError := err.(*apperrors.AppError)
		assert.False(t, isAppError, "transient repository errors must not be classified as conflicts")
	})

	t.Run("mutation", func(t *testing.T) {
		repo := &entitlementRepoStub{
			tenant: &types.Tenant{
				ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active",
				ComplimentaryPlan: types.ConsumerPlanPro, ComplimentaryGrantID: "grant-transient-123", ComplimentaryExpiresAt: &expires,
			},
			revokePlanErr: dbErr,
		}
		svc := newEntitlementService(repo, &keyManagerStub{})

		current, applied, err := svc.RevokeComplimentaryPlan(context.Background(), 7, "grant-transient-123")

		require.ErrorIs(t, err, dbErr)
		assert.Nil(t, current)
		assert.False(t, applied)
		_, isAppError := err.(*apperrors.AppError)
		assert.False(t, isAppError, "transient repository errors must not be classified as conflicts")
	})
}

func TestRevokeComplimentaryPlanReportsCommittedProviderSyncFailure(t *testing.T) {
	now := time.Now().UTC()
	expires := now.Add(time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: now.AddDate(0, -2, 0),
		ComplimentaryPlan: types.ConsumerPlanMax, ComplimentaryGrantID: "grant-revoke-fail", ComplimentaryExpiresAt: &expires,
		OpenRouterCreditPeriodEnd: &expires, OpenRouterDesiredLimitMicrousd: 5_100_000,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-or-v1", KeyHash: "hash-1"}},
	}}
	keys := &keyManagerStub{
		info:      &modelopenrouter.KeyInfo{Hash: "hash-1", UsageMicrousd: 100_000, LimitMicrousd: 5_100_000, LimitRemainingMicrousd: 5_000_000},
		updateErr: errors.New("provider unavailable"),
	}
	svc := newEntitlementService(repo, keys)

	current, applied, err := svc.RevokeComplimentaryPlan(context.Background(), 7, "grant-revoke-fail")

	require.Error(t, err)
	assert.Nil(t, current)
	assert.True(t, applied)
	assert.Empty(t, repo.tenant.ComplimentaryPlan)
	assert.Nil(t, repo.tenant.ComplimentaryExpiresAt)
	assert.Equal(t, int64(500_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
}

func (s *entitlementRepoStub) AdvanceOpenRouterCreditPeriod(_ context.Context, _ uint64, plan types.ConsumerPlan, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, periodEnd time.Time, desiredLimitMicrousd int64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if eventID != "" {
		if types.EffectiveConsumerPlan(s.tenant) != plan || billingPeriod != "monthly" || s.tenant.PaddleBillingPeriod != billingPeriod ||
			s.tenant.PaddleCustomerID != customerID || s.tenant.PaddleSubscriptionID != subscriptionID {
			return false, nil
		}
		if s.tenant.PaddleLastRenewalAt != nil && !occurredAt.After(s.tenant.PaddleLastRenewalAt.UTC()) {
			return false, nil
		}
	}
	if s.tenant.OpenRouterCreditPeriodEnd != nil && !periodEnd.After(*s.tenant.OpenRouterCreditPeriodEnd) {
		return false, nil
	}
	value := periodEnd.UTC()
	s.tenant.OpenRouterCreditPeriodEnd = &value
	s.tenant.OpenRouterDesiredLimitMicrousd = desiredLimitMicrousd
	if eventID != "" && (s.tenant.PaddleLastRenewalAt == nil || occurredAt.After(s.tenant.PaddleLastRenewalAt.UTC())) {
		value := occurredAt.UTC()
		s.tenant.PaddleLastRenewalAt = &value
	}
	return true, nil
}

func (s *entitlementRepoStub) AdvancePaddleCurrentPeriod(_ context.Context, _ uint64, plan types.ConsumerPlan, customerID, subscriptionID, billingPeriod, eventID string, occurredAt, periodEnd time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if types.EffectiveConsumerPlan(s.tenant) != plan || s.tenant.PaddleCustomerID != customerID ||
		s.tenant.PaddleSubscriptionID != subscriptionID || s.tenant.PaddleBillingPeriod != billingPeriod {
		return false, nil
	}
	if eventID != "" && s.tenant.PaddleLastRenewalAt != nil && !occurredAt.After(s.tenant.PaddleLastRenewalAt.UTC()) {
		return false, nil
	}
	if s.tenant.PaddleCurrentPeriodEnd != nil && !periodEnd.After(s.tenant.PaddleCurrentPeriodEnd.UTC()) {
		return false, nil
	}
	value := periodEnd.UTC()
	s.tenant.PaddleCurrentPeriodEnd = &value
	if eventID != "" && (s.tenant.PaddleLastRenewalAt == nil || occurredAt.After(s.tenant.PaddleLastRenewalAt.UTC())) {
		value := occurredAt.UTC()
		s.tenant.PaddleLastRenewalAt = &value
	}
	return true, nil
}

type keyManagerStub struct {
	mu           sync.Mutex
	created      *modelopenrouter.ManagedKey
	info         *modelopenrouter.KeyInfo
	getDelay     time.Duration
	createCalls  int
	updateLimit  int64
	updateCalls  int
	monthlyReset bool
	createReset  bool
	createLimit  int64
	updateErr    error
}

func (s *keyManagerStub) CreateKey(_ context.Context, _ string, limit int64, monthlyReset bool) (*modelopenrouter.ManagedKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.createCalls++
	s.createLimit = limit
	s.createReset = monthlyReset
	if s.info == nil {
		s.info = &modelopenrouter.KeyInfo{Hash: s.created.Hash, LimitMicrousd: limit, LimitRemainingMicrousd: limit, MonthlyReset: monthlyReset}
	}
	return s.created, nil
}
func (s *keyManagerStub) UpdateKeyLimit(_ context.Context, _ string, limit int64, monthlyReset bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.updateCalls++
	s.updateLimit = limit
	s.monthlyReset = monthlyReset
	if s.updateErr != nil {
		return s.updateErr
	}
	if s.info != nil {
		s.info.LimitMicrousd = limit
		remaining := limit - s.info.UsageMicrousd
		if remaining < 0 {
			remaining = 0
		}
		s.info.LimitRemainingMicrousd = remaining
		s.info.MonthlyReset = monthlyReset
	}
	return nil
}

type blockingLimitKeyManager struct {
	mu      sync.Mutex
	info    *modelopenrouter.KeyInfo
	started chan struct{}
	release chan struct{}
	once    sync.Once
	updates []int64
}

func (m *blockingLimitKeyManager) CreateKey(context.Context, string, int64, bool) (*modelopenrouter.ManagedKey, error) {
	return nil, errors.New("not implemented")
}

func (m *blockingLimitKeyManager) GetKey(context.Context, string) (*modelopenrouter.KeyInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	copy := *m.info
	return &copy, nil
}

func (m *blockingLimitKeyManager) UpdateKeyLimit(_ context.Context, _ string, limit int64, monthlyReset bool) error {
	block := false
	m.once.Do(func() {
		block = true
		close(m.started)
	})
	if block {
		<-m.release
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.updates = append(m.updates, limit)
	m.info.LimitMicrousd = limit
	m.info.LimitRemainingMicrousd = nonNegativeMicrousd(limit - m.info.UsageMicrousd)
	m.info.MonthlyReset = monthlyReset
	return nil
}

func (m *blockingLimitKeyManager) DeleteKey(context.Context, string) error { return nil }

func (m *blockingLimitKeyManager) updateLimits() []int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]int64(nil), m.updates...)
}

func TestFreeAllowanceRefreshesOnRegistrationAnniversaryWithoutStacking(t *testing.T) {
	createdAt := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	previousPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID:                        7,
		Plan:                      types.ConsumerPlanFree,
		PlanStatus:                "active",
		CreatedAt:                 createdAt,
		OpenRouterCreditPeriodEnd: &previousPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash:                   "hash-7",
		LimitMicrousd:          1_000_000,
		LimitRemainingMicrousd: 700_000,
		UsageMicrousd:          300_000,
	}}
	svc := newEntitlementService(repo, manager)

	// Returning after several missed boundaries grants one current allowance,
	// not one allowance for every inactive month.
	current, err := svc.Current(entitlementContext(7, "user-123"), time.Date(2026, 12, 15, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	assert.Equal(t, int64(700_000), manager.updateLimit)
	assert.Equal(t, 1, manager.updateCalls)
	assert.Equal(t, int64(400_000), current.OpenRouterRemainingMicrousd)
	assert.Zero(t, current.OpenRouterUsedMicrousd)
	require.NotNil(t, current.OpenRouterResetsAt)
	assert.Equal(t, time.Date(2026, 12, 28, 9, 30, 0, 0, time.UTC), current.OpenRouterResetsAt.UTC())
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, time.Date(2026, 12, 28, 9, 30, 0, 0, time.UTC), repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func TestFreeAllowanceKeepsEndOfMonthRegistrationAnchor(t *testing.T) {
	createdAt := time.Date(2026, 1, 31, 8, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 2, 28, 8, 0, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: createdAt,
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 1_000_000, UsageMicrousd: 250_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.Current(entitlementContext(7, "user-123"), time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, time.Date(2026, 3, 31, 8, 0, 0, 0, time.UTC), repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func TestMonthlyPaidAllowanceWaitsForConfirmedRenewal(t *testing.T) {
	periodEnd := time.Now().UTC().Add(-time.Minute)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 500_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
	assert.Zero(t, manager.updateCalls)
}

func TestOpenRouterKeyUseCapsCrashDriftToDurablePlan(t *testing.T) {
	periodEnd := time.Now().UTC().Add(time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd:      &periodEnd,
		OpenRouterDesiredLimitMicrousd: 2_150_000,
		Credentials:                    &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", UsageMicrousd: 900_000,
		LimitMicrousd: 3_400_000, LimitRemainingMicrousd: 1_600_000,
	}}
	svc := newEntitlementService(repo, manager)

	key, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))

	require.NoError(t, err)
	assert.Equal(t, "sk-child", key)
	assert.Equal(t, 1, manager.updateCalls)
	assert.Equal(t, int64(2_150_000), manager.updateLimit)
	assert.Equal(t, int64(1_250_000), manager.info.LimitRemainingMicrousd)
}

func TestCurrentMarksAllowanceRenewalAsPending(t *testing.T) {
	periodEnd := time.Now().UTC().Add(-time.Minute)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 500_000}}
	svc := newEntitlementService(repo, manager)

	current, err := svc.Current(entitlementContext(7, "user-123"), time.Now().UTC())
	require.NoError(t, err)
	require.NotNil(t, current)
	assert.Equal(t, types.OpenRouterCreditsPending, current.OpenRouterCreditsStatus)
	assert.Zero(t, current.OpenRouterRemainingMicrousd)
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanPro).MonthlyOpenRouterMicrousd, current.OpenRouterUsedMicrousd)
	assert.Zero(t, manager.updateCalls)
}

func TestAnnualPaidAllowanceStopsAtVerifiedPaidTermEnd(t *testing.T) {
	now := time.Now().UTC()
	creditPeriodEnd := now.Add(24 * time.Hour)
	paidTermEnd := now.Add(-time.Minute)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "yearly",
		PaddleCurrentPeriodEnd: &paidTermEnd, OpenRouterCreditPeriodEnd: &creditPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 500_000,
	}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
	assert.Zero(t, manager.updateCalls)
}

func TestAnnualPaidAllowanceWithUnknownPaidTermFailsClosed(t *testing.T) {
	now := time.Now().UTC()
	creditPeriodEnd := now.Add(24 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "yearly",
		OpenRouterCreditPeriodEnd: &creditPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 500_000,
	}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
	assert.Zero(t, manager.updateCalls)
}

func TestPaidAllowanceWithUnknownBillingPeriodFailsClosedBeforeCreditBoundary(t *testing.T) {
	creditPeriodEnd := time.Now().UTC().Add(24 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active",
		OpenRouterCreditPeriodEnd: &creditPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 2_500_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
}

func TestAnnualPaidAllowanceRefreshesInsideVerifiedPaidTerm(t *testing.T) {
	at := time.Date(2026, 9, 29, 9, 30, 0, 0, time.UTC)
	creditPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	paidTermEnd := time.Date(2027, 8, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "yearly",
		PaddleCurrentPeriodEnd: &paidTermEnd, OpenRouterCreditPeriodEnd: &creditPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 100_000, UsageMicrousd: 900_000,
	}}
	svc := newEntitlementService(repo, manager)

	current, err := svc.Current(entitlementContext(7, "user-123"), at)
	require.NoError(t, err)
	assert.Equal(t, int64(3_400_000), manager.updateLimit)
	assert.Equal(t, int64(2_500_000), current.OpenRouterRemainingMicrousd)
	assert.Equal(t, 1, manager.updateCalls)
}

func TestApplyAnnualConsumerPlanPersistsVerifiedPaidTerm(t *testing.T) {
	activatedAt := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	paidTermEnd := time.Date(2027, 8, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active",
	}}
	svc := newEntitlementService(repo, nil)

	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "active", "yearly", "evt-annual", activatedAt, "ctm_1", "sub_1", &paidTermEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Equal(t, paidTermEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC), repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func TestApplyConsumerPlanIgnoresInitialPaidStateWithoutConfirmedPeriod(t *testing.T) {
	now := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active",
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		UsageMicrousd: 600_000, LimitMicrousd: 1_000_000, LimitRemainingMicrousd: 400_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.ApplyConsumerPlan(
		context.Background(), 7, types.ConsumerPlanPro, "active", "monthly",
		"evt-unconfirmed", now, "ctm_new", "sub_new", nil,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Zero(t, manager.updateCalls)
	assert.Equal(t, types.ConsumerPlanFree, repo.tenant.Plan)
	assert.Empty(t, repo.tenant.PaddleCustomerID)
	assert.Empty(t, repo.tenant.PaddleSubscriptionID)
	assert.Empty(t, repo.tenant.PaddleBillingPeriod)
	assert.Nil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Nil(t, repo.tenant.OpenRouterCreditPeriodEnd)
}

func TestApplyConsumerPlanTreatsExactDurableEventReplayAsHandled(t *testing.T) {
	now := time.Now().UTC()
	periodEnd := now.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		PaddleLastEventID: "evt-applied", PaddleLastEventAt: &now,
		OpenRouterCreditPeriodEnd: &periodEnd,
	}}
	svc := newEntitlementService(repo, nil)

	handled, err := svc.ApplyConsumerPlan(
		context.Background(), 7, types.ConsumerPlanPlus, "active", "monthly",
		"evt-applied", now, "ctm_1", "sub_1", &periodEnd,
	)
	require.NoError(t, err)
	assert.True(t, handled, "worker retry must be able to finish the matching billing operation after the event committed")
}

func TestApplyConsumerPlanDoesNotInitializePaidPlanFromFreeAnniversaryWithoutProviderPeriod(t *testing.T) {
	now := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	freePeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	for _, eventName := range []string{"subscription.updated", "subscription.resumed"} {
		t.Run(eventName, func(t *testing.T) {
			repo := &entitlementRepoStub{tenant: &types.Tenant{
				ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", PaddleBillingPeriod: "",
				PaddleCustomerID: "ctm_current", PaddleSubscriptionID: "sub_current",
				OpenRouterCreditPeriodEnd: &freePeriodEnd,
			}}
			svc := newEntitlementService(repo, nil)

			applied, err := svc.ApplyConsumerPlan(
				context.Background(), 7, types.ConsumerPlanPlus, "active", "monthly",
				"evt-"+eventName, now, "ctm_current", "sub_current", nil,
			)
			require.NoError(t, err)
			assert.False(t, applied)
			assert.Equal(t, types.ConsumerPlanFree, repo.tenant.Plan)
			assert.Equal(t, "active", repo.tenant.PlanStatus)
			assert.Equal(t, "sub_current", repo.tenant.PaddleSubscriptionID)
			require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
			assert.Equal(t, freePeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
		})
	}
}

func TestApplyConsumerPlanDoesNotResumeCanceledPaidPlanWithoutProviderPeriod(t *testing.T) {
	now := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	freePeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "canceled", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_current", PaddleSubscriptionID: "sub_current",
		OpenRouterCreditPeriodEnd: &freePeriodEnd,
	}}
	svc := newEntitlementService(repo, nil)

	applied, err := svc.ApplyConsumerPlan(
		context.Background(), 7, types.ConsumerPlanPro, "active", "monthly",
		"evt-subscription-resumed", now, "ctm_current", "sub_current", nil,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
	assert.Equal(t, "canceled", repo.tenant.PlanStatus)
	assert.Equal(t, "sub_current", repo.tenant.PaddleSubscriptionID)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, freePeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func TestApplyConsumerPlanIgnoresLifecycleEventFromNonCurrentSubscription(t *testing.T) {
	now := time.Now().UTC()
	creditPeriodEnd := now.AddDate(0, 1, 0)
	paidPeriodEnd := now.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_current",
		OpenRouterCreditPeriodEnd: &creditPeriodEnd, PaddleCurrentPeriodEnd: &paidPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		UsageMicrousd: 100_000, LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 2_400_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.ApplyConsumerPlan(
		context.Background(), 7, types.ConsumerPlanFree, "canceled", "monthly",
		"evt-old-canceled", now, "ctm_1", "sub_old", nil,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Zero(t, manager.updateCalls)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
	assert.Equal(t, "active", repo.tenant.PlanStatus)
	assert.Equal(t, "sub_current", repo.tenant.PaddleSubscriptionID)
	assert.Equal(t, "monthly", repo.tenant.PaddleBillingPeriod)
}

func TestApplyConsumerPlanAllowsNewSubscriptionAfterFreeOrCanceledState(t *testing.T) {
	now := time.Now().UTC()
	periodEnd := now.AddDate(0, 1, 0)
	for _, test := range []struct {
		name      string
		plan      types.ConsumerPlan
		status    string
		oldSubID  string
		oldCustID string
	}{
		{name: "free", plan: types.ConsumerPlanFree, status: "active", oldSubID: "sub_old_free", oldCustID: "ctm_free"},
		{name: "canceled", plan: types.ConsumerPlanPro, status: "canceled", oldSubID: "sub_old_canceled", oldCustID: "ctm_canceled"},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := &entitlementRepoStub{tenant: &types.Tenant{
				ID: 7, Plan: test.plan, PlanStatus: test.status,
				PaddleCustomerID: test.oldCustID, PaddleSubscriptionID: test.oldSubID,
			}}
			svc := newEntitlementService(repo, nil)

			applied, err := svc.ApplyConsumerPlan(
				context.Background(), 7, types.ConsumerPlanPlus, "active", "monthly",
				"evt-new-activation", now, "ctm_new", "sub_new", &periodEnd,
			)
			require.NoError(t, err)
			assert.True(t, applied)
			assert.Equal(t, types.ConsumerPlanPlus, repo.tenant.Plan)
			assert.Equal(t, "active", repo.tenant.PlanStatus)
			assert.Equal(t, "ctm_new", repo.tenant.PaddleCustomerID)
			assert.Equal(t, "sub_new", repo.tenant.PaddleSubscriptionID)
			assert.Equal(t, "monthly", repo.tenant.PaddleBillingPeriod)
			require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
			assert.Equal(t, periodEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())
		})
	}
}

func TestApplyConsumerPlanRejectsNonInitialEventsFromFreeOrCanceledState(t *testing.T) {
	now := time.Now().UTC()
	for _, test := range []struct {
		name            string
		plan            types.ConsumerPlan
		status          string
		incomingPlan    types.ConsumerPlan
		incomingStatus  string
		billingPeriod   string
		confirmedPeriod bool
	}{
		{name: "free_updated", plan: types.ConsumerPlanFree, status: "active", incomingPlan: types.ConsumerPlanPlus, incomingStatus: "active", billingPeriod: "monthly"},
		{name: "canceled_resumed", plan: types.ConsumerPlanPro, status: "canceled", incomingPlan: types.ConsumerPlanPlus, incomingStatus: "active", billingPeriod: "monthly"},
		{name: "canceled_past_due", plan: types.ConsumerPlanPro, status: "canceled", incomingPlan: types.ConsumerPlanPlus, incomingStatus: "past_due", billingPeriod: "monthly"},
		{name: "paused_activation", plan: types.ConsumerPlanPro, status: "paused", incomingPlan: types.ConsumerPlanPlus, incomingStatus: "active", billingPeriod: "monthly", confirmedPeriod: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			creditPeriodEnd := now.AddDate(0, 1, 0)
			var eventPeriodEnd *time.Time
			if test.confirmedPeriod {
				value := now.AddDate(0, 1, 0)
				eventPeriodEnd = &value
			}
			repo := &entitlementRepoStub{tenant: &types.Tenant{
				ID: 7, Plan: test.plan, PlanStatus: test.status,
				PaddleCustomerID: "ctm_old", PaddleSubscriptionID: "sub_old",
				OpenRouterCreditPeriodEnd: &creditPeriodEnd,
			}}
			svc := newEntitlementService(repo, nil)

			applied, err := svc.ApplyConsumerPlan(
				context.Background(), 7, test.incomingPlan, test.incomingStatus, test.billingPeriod,
				"evt-non-initial", now, "ctm_new", "sub_new", eventPeriodEnd,
			)
			require.NoError(t, err)
			assert.False(t, applied)
			assert.Equal(t, test.plan, repo.tenant.Plan)
			assert.Equal(t, test.status, repo.tenant.PlanStatus)
			assert.Equal(t, "sub_old", repo.tenant.PaddleSubscriptionID)
		})
	}
}

func TestPausedAnnualResumePreservesAllowanceAndPaidTerm(t *testing.T) {
	now := time.Now().UTC()
	creditPeriodEnd := now.AddDate(0, 1, 0)
	paidTermEnd := now.AddDate(1, 0, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "yearly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		OpenRouterCreditPeriodEnd: &creditPeriodEnd, PaddleCurrentPeriodEnd: &paidTermEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 1_000_000}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "paused", "yearly", "evt-paused", now, "ctm_1", "sub_1", nil)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanFree, types.EffectiveConsumerPlan(repo.tenant))
	assert.Equal(t, 0, manager.updateCalls)
	_, err = svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errSubscriptionPaused)

	applied, err = svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "active", "yearly", "evt-resumed", now.Add(time.Second), "ctm_1", "sub_1", nil)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, types.EffectiveConsumerPlan(repo.tenant))
	assert.Equal(t, 0, manager.updateCalls)
	key, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.NoError(t, err)
	assert.Equal(t, "sk-child", key)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, creditPeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
	require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Equal(t, paidTermEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())
}

func TestCancelAfterPauseStartsFullFreeAllowance(t *testing.T) {
	now := time.Now().UTC()
	creditPeriodEnd := now.AddDate(0, 1, 0)
	paidTermEnd := now.AddDate(1, 0, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "paused", PaddleBillingPeriod: "yearly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		OpenRouterCreditPeriodEnd: &creditPeriodEnd, PaddleCurrentPeriodEnd: &paidTermEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		UsageMicrousd: 2_000_000, LimitMicrousd: 2_200_000, LimitRemainingMicrousd: 200_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanFree, "canceled", "yearly", "evt-canceled", now, "ctm_1", "sub_1", nil)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, int64(2_400_000), manager.updateLimit)
	assert.Equal(t, 1, manager.updateCalls)
	assert.Nil(t, repo.tenant.PaddleCurrentPeriodEnd)
}

func TestRecurringAllowanceIgnoresNewerLifecycleCursor(t *testing.T) {
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	lifecycleAt := renewedAt.Add(time.Hour)
	newPeriodEnd := oldPeriodEnd.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		PaddleLastEventID: "evt-lifecycle", PaddleLastEventAt: &lifecycleAt,
		OpenRouterCreditPeriodEnd: &oldPeriodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 100_000, UsageMicrousd: 900_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-renew", renewedAt, "ctm_1", "sub_1", newPeriodEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, int64(3_400_000), manager.updateLimit)
	assert.Equal(t, 1, manager.updateCalls)
	assert.Equal(t, "evt-lifecycle", repo.tenant.PaddleLastEventID)
	require.NotNil(t, repo.tenant.PaddleLastRenewalAt)
	assert.Equal(t, renewedAt, repo.tenant.PaddleLastRenewalAt.UTC())
}

func TestRecurringAllowanceConvergesPlanWhenUpgradeWebhookArrivesLate(t *testing.T) {
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	upgradeAt := time.Date(2026, 9, 28, 9, 45, 0, 0, time.UTC)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	newPeriodEnd := oldPeriodEnd.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		PaddleLastEventID: "evt-before-upgrade", PaddleLastEventAt: &upgradeAt,
		OpenRouterCreditPeriodEnd: &oldPeriodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 1_250_000, LimitRemainingMicrousd: 100_000, UsageMicrousd: 900_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.RefreshPaidAllowance(
		context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-renew-pro", renewedAt,
		"ctm_1", "sub_1", newPeriodEnd,
	)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
	assert.Equal(t, "active", repo.tenant.PlanStatus)
	assert.Equal(t, "monthly", repo.tenant.PaddleBillingPeriod)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, newPeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
	require.NotNil(t, repo.tenant.PaddleLastRenewalAt)
	assert.Equal(t, renewedAt, repo.tenant.PaddleLastRenewalAt.UTC())
	assert.Equal(t, int64(3_400_000), manager.updateLimit)

	// The delayed T2 lifecycle event is now safely stale: T3 already supplied
	// the same provider plan and paid period.
	applied, err = svc.ApplyConsumerPlan(
		context.Background(), 7, types.ConsumerPlanPro, "active", "monthly", "evt-upgrade-late", upgradeAt,
		"ctm_1", "sub_1", &oldPeriodEnd,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
}

func TestPaidAllowanceWithUnknownBillingPeriodFailsClosed(t *testing.T) {
	periodEnd := time.Now().UTC().Add(-time.Minute)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanMax, PlanStatus: "active",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 5_000_000, LimitRemainingMicrousd: 500_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
	assert.Zero(t, manager.updateCalls)
}

func TestPaidAllowanceWithEmptyPlanStatusFailsClosed(t *testing.T) {
	periodEnd := time.Now().UTC().Add(time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 500_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.ErrorIs(t, err, errAllowanceRenewalPending)
	assert.Zero(t, manager.updateCalls)
}

func TestRecurringPaidAllowanceRefreshesOncePerPeriod(t *testing.T) {
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	newPeriodEnd := time.Date(2026, 10, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1", OpenRouterCreditPeriodEnd: &oldPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 100_000, UsageMicrousd: 900_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-renew", oldPeriodEnd, "ctm_1", "sub_1", newPeriodEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, int64(3_400_000), manager.updateLimit)
	assert.Equal(t, 1, manager.updateCalls)

	applied, err = svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-renew-duplicate", oldPeriodEnd, "ctm_1", "sub_1", newPeriodEnd)
	require.NoError(t, err)
	assert.False(t, applied)
	assert.Equal(t, 1, manager.updateCalls)
}

func TestAnnualRecurringCompletionAdvancesPaidTermWithoutGrantingAllowance(t *testing.T) {
	oldPaidTermEnd := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	newPaidTermEnd := time.Date(2027, 8, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "yearly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1", PaddleCurrentPeriodEnd: &oldPaidTermEnd,
	}}
	svc := newEntitlementService(repo, nil)

	applied, err := svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "yearly", "evt-renew", oldPaidTermEnd, "ctm_1", "sub_1", newPaidTermEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Equal(t, newPaidTermEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())

	applied, err = svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "yearly", "evt-renew-duplicate", oldPaidTermEnd, "ctm_1", "sub_1", newPaidTermEnd)
	require.NoError(t, err)
	assert.False(t, applied)
}

func TestConcurrentRecurringDeliveriesMutateProviderOnlyOnce(t *testing.T) {
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	newPeriodEnd := time.Date(2026, 10, 28, 9, 30, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1", OpenRouterCreditPeriodEnd: &oldPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{
		info: &modelopenrouter.KeyInfo{
			LimitMicrousd: 2_500_000, LimitRemainingMicrousd: 100_000, UsageMicrousd: 900_000,
		},
		getDelay: 20 * time.Millisecond,
	}
	svc := newEntitlementService(repo, manager)

	const deliveries = 12
	var wg sync.WaitGroup
	results := make(chan bool, deliveries)
	errs := make(chan error, deliveries)
	for i := 0; i < deliveries; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			applied, err := svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "monthly", fmt.Sprintf("evt-renew-%d", index), oldPeriodEnd, "ctm_1", "sub_1", newPeriodEnd)
			results <- applied
			errs <- err
		}(i)
	}
	wg.Wait()
	close(results)
	close(errs)

	appliedCount := 0
	for applied := range results {
		if applied {
			appliedCount++
		}
	}
	for err := range errs {
		require.NoError(t, err)
	}
	assert.Equal(t, 1, appliedCount)
	assert.Equal(t, 1, manager.updateCalls)
}

func TestRecurringCompletionRestoresAdjustedCurrentSubscription(t *testing.T) {
	refundedAt := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	paidAt := refundedAt.Add(time.Hour)
	periodEnd := paidAt.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "refunded",
		PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		PaddleLastEventID: "evt-refund", PaddleLastEventAt: &refundedAt,
	}}
	svc := newEntitlementService(repo, nil)

	applied, err := svc.RefreshPaidAllowance(context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-paid", paidAt, "ctm_1", "sub_1", periodEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
	assert.Equal(t, "active", repo.tenant.PlanStatus)
	assert.Equal(t, "monthly", repo.tenant.PaddleBillingPeriod)
	assert.Equal(t, "evt-paid", repo.tenant.PaddleLastEventID)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, periodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func (s *keyManagerStub) GetKey(context.Context, string) (*modelopenrouter.KeyInfo, error) {
	time.Sleep(s.getDelay)
	s.mu.Lock()
	defer s.mu.Unlock()
	copy := *s.info
	return &copy, nil
}
func (s *keyManagerStub) DeleteKey(context.Context, string) error { return nil }

func entitlementContext(tenantID uint64, userID string) context.Context {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenantID)
	return context.WithValue(ctx, types.UserIDContextKey, userID)
}

func TestEntitlementServiceReportsUnprovisionedWhenProviderKeyIsAbsent(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID:          7,
		Plan:        types.ConsumerPlanPlus,
		PlanStatus:  "active",
		StorageUsed: 123,
	}}
	svc := newEntitlementService(repo, nil)
	ctx := entitlementContext(7, "user-123")

	current, err := svc.Current(ctx, now)
	require.NoError(t, err)
	assert.Equal(t, types.ConsumerPlanPlus, current.Plan)
	assert.Equal(t, types.OpenRouterCreditsUnprovisioned, current.OpenRouterCreditsStatus)
	assert.Zero(t, current.OpenRouterUsedMicrousd)
	assert.Zero(t, current.OpenRouterRemainingMicrousd)
}

func TestEntitlementServiceReadsAnotherTenantThroughPlatformContext(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly", StorageUsed: 321,
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", LimitMicrousd: 1_250_000, LimitRemainingMicrousd: 900_000, UsageMicrousd: 350_000,
	}}
	svc := newEntitlementService(repo, manager)

	current, err := svc.CurrentForTenant(context.Background(), 7, now)
	require.NoError(t, err)
	assert.Equal(t, int64(321), current.StorageUsed)
	assert.Equal(t, int64(350_000), current.OpenRouterUsedMicrousd)
	assert.Equal(t, int64(900_000), current.OpenRouterRemainingMicrousd)
	assert.Equal(t, int64(350_000), current.OpenRouterProviderUsedMicrousd)
	assert.Equal(t, int64(900_000), current.OpenRouterProviderRemainingMicrousd)
}

func TestEntitlementServiceAdjustsProviderRemainingWithoutLocalLedger(t *testing.T) {
	now := time.Now().UTC()
	periodEnd := now.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", LimitMicrousd: 1_250_000, LimitRemainingMicrousd: 900_000, UsageMicrousd: 350_000,
	}}
	svc := newEntitlementService(repo, manager)

	current, err := svc.SetOpenRouterRemainingForTenant(context.Background(), 7, 700_000)
	require.NoError(t, err)
	assert.Equal(t, int64(1_050_000), manager.updateLimit)
	assert.False(t, manager.monthlyReset)
	assert.Equal(t, int64(700_000), current.OpenRouterRemainingMicrousd)
	assert.Equal(t, int64(550_000), current.OpenRouterUsedMicrousd)
	assert.Equal(t, int64(1_050_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
}

func TestEntitlementServiceRejectsRemainingAboveCurrentPlanAllowance(t *testing.T) {
	periodEnd := time.Now().UTC().AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{Hash: "hash-7", LimitMicrousd: 1_250_000, LimitRemainingMicrousd: 1_250_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.SetOpenRouterRemainingForTenant(context.Background(), 7, 5_000_000)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "current plus plan allowance")
	assert.Zero(t, manager.updateCalls)
}

func TestEntitlementServiceRejectsRemainingAboveCurrentPlanAllowanceWithSmallOverflow(t *testing.T) {
	periodEnd := time.Now().UTC().AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{Hash: "hash-7", LimitMicrousd: 1_250_000, LimitRemainingMicrousd: 1_250_000}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.SetOpenRouterRemainingForTenant(context.Background(), 7, 5_000_001)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "cannot exceed the current plus plan allowance")
	assert.Zero(t, manager.updateCalls)
}

func TestEntitlementServiceProvisionsProviderLimitedTenantKey(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	previousLogFormat := os.Getenv("LOG_FORMAT")
	t.Setenv("LOG_FORMAT", "%msg")
	logger.ConfigureFromEnv()
	var logs bytes.Buffer
	logger.SetOutput(&logs)
	t.Cleanup(func() {
		_ = os.Setenv("LOG_FORMAT", previousLogFormat)
		logger.ConfigureFromEnv()
	})
	paidPeriodEnd := time.Now().UTC().AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly", OpenRouterCreditPeriodEnd: &paidPeriodEnd,
	}}
	manager := &keyManagerStub{created: &modelopenrouter.ManagedKey{Key: "sk-child", Hash: "hash-7"}}
	svc := newEntitlementService(repo, manager)
	ctx := entitlementContext(7, "user-123")

	key, err := svc.OpenRouterAPIKey(ctx)
	require.NoError(t, err)
	assert.Equal(t, "sk-child", key)
	require.NotNil(t, repo.tenant.Credentials)
	require.NotNil(t, repo.tenant.Credentials.OpenRouter)
	assert.Equal(t, "hash-7", repo.tenant.Credentials.OpenRouter.KeyHash)
	assert.Equal(t, "sk-child", repo.tenant.Credentials.OpenRouter.APIKey)
	assert.Equal(t, 1, manager.createCalls)
	assert.False(t, manager.createReset)
	assert.Equal(t, int64(1_250_000), manager.createLimit)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Contains(t, logs.String(), "OpenRouter tenant key provisioning started tenant_id=7 monthly_limit_microusd=1250000")
	assert.Contains(t, logs.String(), "OpenRouter tenant key provisioning completed tenant_id=7")
	assert.NotContains(t, logs.String(), "sk-child")
	assert.NotContains(t, logs.String(), "hash-7")

	key, err = svc.OpenRouterAPIKey(ctx)
	require.NoError(t, err)
	assert.Equal(t, "sk-child", key)
	assert.Equal(t, 1, manager.createCalls)
}

func TestMonthlyPaidFirstModelUseKeepsPaddleCreditBoundary(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	paidPeriodEnd := time.Now().UTC().Add(20 * 24 * time.Hour)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCurrentPeriodEnd: &paidPeriodEnd, OpenRouterCreditPeriodEnd: &paidPeriodEnd,
	}}
	manager := &keyManagerStub{created: &modelopenrouter.ManagedKey{Key: "sk-child", Hash: "hash-7"}}
	svc := newEntitlementService(repo, manager)
	ctx := entitlementContext(7, "user-123")

	_, err := svc.OpenRouterAPIKey(ctx)
	require.NoError(t, err)
	current, err := svc.Current(ctx, time.Now().UTC())
	require.NoError(t, err)
	require.NotNil(t, current.OpenRouterResetsAt)
	assert.Equal(t, paidPeriodEnd, current.OpenRouterResetsAt.UTC())
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, paidPeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}

func TestEntitlementServiceProvisionsFreeKeyAtNewAllowance(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanFree, PlanStatus: "active", CreatedAt: time.Now().UTC(),
	}}
	manager := &keyManagerStub{created: &modelopenrouter.ManagedKey{Key: "sk-child", Hash: "hash-7"}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	require.NoError(t, err)
	assert.Equal(t, int64(400_000), manager.createLimit)
	assert.False(t, manager.createReset)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
}

func TestEntitlementServiceUsesProviderUsageAndSynchronizesPlanLimit(t *testing.T) {
	paidPeriodEnd := time.Now().UTC().AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly", OpenRouterCreditPeriodEnd: &paidPeriodEnd,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash:                   "hash-7",
		LimitMicrousd:          1_250_000,
		LimitRemainingMicrousd: 1_000_000,
		UsageMonthlyMicrousd:   250_000,
	}}
	svc := newEntitlementService(repo, manager)
	ctx := entitlementContext(7, "user-123")

	current, err := svc.Current(ctx, time.Now())
	require.NoError(t, err)
	assert.Equal(t, types.OpenRouterCreditsAvailable, current.OpenRouterCreditsStatus)
	assert.Equal(t, int64(250_000), current.OpenRouterUsedMicrousd)
	assert.Equal(t, int64(1_000_000), current.OpenRouterRemainingMicrousd)
	assert.Equal(t, int64(1_250_000), current.MonthlyOpenRouterMicrousd)

	periodEnd := time.Now().AddDate(0, 1, 0)
	_, err = svc.ApplyConsumerPlan(ctx, 7, types.ConsumerPlanPro, "active", "monthly", "evt-1", time.Now(), "customer", "sub", &periodEnd)
	require.NoError(t, err)
	assert.Equal(t, int64(2_250_000), manager.updateLimit)
}

func TestKeyLimitForPlanChangeKeepsPaidUsageOnDowngrade(t *testing.T) {
	info := &modelopenrouter.KeyInfo{
		UsageMicrousd:          900_000,
		LimitMicrousd:          2_500_000,
		LimitRemainingMicrousd: 1_600_000,
		UsageMonthlyMicrousd:   900_000,
		MonthlyReset:           false,
	}
	tenant := &types.Tenant{Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly"}

	limit, monthlyReset := keyLimitForPlanChange(tenant, types.ConsumerPlanPlus, "monthly", info)
	assert.Equal(t, int64(1_250_000), limit, "900k already consumed leaves 350k of the Plus allowance")
	assert.False(t, monthlyReset)
}

func TestKeyLimitForPlanChangeStartsFullAllowanceOnlyForFreeToPaid(t *testing.T) {
	info := &modelopenrouter.KeyInfo{
		UsageMicrousd:          300_000,
		LimitMicrousd:          400_000,
		LimitRemainingMicrousd: 100_000,
	}
	freeTenant := &types.Tenant{Plan: types.ConsumerPlanFree, PlanStatus: "active"}

	limit, monthlyReset := keyLimitForPlanChange(freeTenant, types.ConsumerPlanPro, "monthly", info)
	assert.Equal(t, int64(2_800_000), limit)
	assert.False(t, monthlyReset)

	paidLimit, paidReset := keyLimitForPlanChange(&types.Tenant{Plan: types.ConsumerPlanPro, PlanStatus: "active"}, types.ConsumerPlanFree, "", info)
	assert.Equal(t, int64(300_000), paidLimit, "paid-to-free must not mint a fresh allowance")
	assert.False(t, paidReset)
}

func TestApplyConsumerPlanDoesNotGrantPlanWhenProviderLimitUpdateFails(t *testing.T) {
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID:         7,
		Plan:       types.ConsumerPlanFree,
		PlanStatus: "active",
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-child", KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{
		info:      &modelopenrouter.KeyInfo{LimitMicrousd: 1_000_000, LimitRemainingMicrousd: 1_000_000, MonthlyReset: true},
		updateErr: errors.New("provider unavailable"),
	}
	svc := newEntitlementService(repo, manager)

	periodEnd := time.Now().AddDate(0, 1, 0)
	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "active", "monthly", "evt-1", time.Now(), "customer", "sub", &periodEnd)
	require.Error(t, err)
	assert.False(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan, "DB-first persistence keeps a replayable desired target")
	assert.Equal(t, int64(2_500_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanPro).MonthlyOpenRouterMicrousd, manager.updateLimit)
	manager.updateErr = nil
	applied, err = svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "active", "monthly", "evt-1", repo.tenant.PaddleLastEventAt.UTC(), "customer", "sub", &periodEnd)
	require.NoError(t, err, "the queue retry must replay the durable provider target")
	assert.True(t, applied)
	assert.Equal(t, int64(2_500_000), manager.info.LimitMicrousd)
}

func TestEntitlementServiceOpenRouterUserIDIsStableAcrossTenants(t *testing.T) {
	repo := &entitlementRepoStub{tenant: &types.Tenant{ID: 7}}
	svc := newEntitlementService(repo, nil)
	const userID = "same-user"
	a := svc.OpenRouterUserID(entitlementContext(7, userID))
	b := svc.OpenRouterUserID(entitlementContext(99, userID))

	assert.NotEmpty(t, a)
	assert.Equal(t, a, b)
	assert.NotContains(t, a, userID)
	assert.Contains(t, a, "musuw_")
	assert.Empty(t, svc.OpenRouterUserID(entitlementContext(7, "")))
}

func TestOpenRouterDesiredLimitHealsBothProviderDriftDirections(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	const desired = int64(2_150_000)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd, OpenRouterDesiredLimitMicrousd: desired,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", UsageMicrousd: 900_000, LimitMicrousd: 3_400_000, LimitRemainingMicrousd: 2_500_000,
	}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.Current(entitlementContext(7, "user-123"), now)
	require.NoError(t, err)
	assert.Equal(t, desired, manager.info.LimitMicrousd, "provider-above-desired must be reduced")
	assert.Equal(t, 1, manager.updateCalls)

	manager.info.LimitMicrousd = 1_000_000
	manager.info.LimitRemainingMicrousd = 100_000
	_, err = svc.Current(entitlementContext(7, "user-123"), now)
	require.NoError(t, err)
	assert.Equal(t, desired, manager.info.LimitMicrousd, "provider-below-desired must be restored")
	assert.Equal(t, 2, manager.updateCalls)
	assert.Equal(t, desired, repo.tenant.OpenRouterDesiredLimitMicrousd)
}

func TestOpenRouterDesiredLimitBootstrapsLegacyRowFromProviderOnce(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		OpenRouterCreditPeriodEnd: &periodEnd,
		Credentials:               &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", UsageMicrousd: 300_000, LimitMicrousd: 1_750_000, LimitRemainingMicrousd: 1_450_000,
	}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.Current(entitlementContext(7, "user-123"), now)
	require.NoError(t, err)
	assert.Equal(t, int64(1_750_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Zero(t, manager.updateCalls, "bootstrap must not invent a new provider limit")

	manager.info.LimitMicrousd = 900_000
	_, err = svc.Current(entitlementContext(7, "user-123"), now)
	require.NoError(t, err)
	assert.Equal(t, int64(1_750_000), manager.info.LimitMicrousd)
	assert.Equal(t, 1, manager.updateCalls)
}

func TestRefundFreezesDesiredLimitAndFailsClosed(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	const desired = int64(2_500_000)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm-1", PaddleSubscriptionID: "sub-1", PaddleCurrentPeriodEnd: &periodEnd, OpenRouterCreditPeriodEnd: &periodEnd,
		OpenRouterDesiredLimitMicrousd: desired,
		Credentials:                    &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{Hash: "hash-7", LimitMicrousd: desired, LimitRemainingMicrousd: desired}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanFree, "refunded", "", "evt-refund", now, "ctm-1", "sub-1", nil)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan, "refund must preserve the paid plan for reversal")
	assert.Equal(t, "refunded", repo.tenant.PlanStatus)
	assert.Equal(t, "monthly", repo.tenant.PaddleBillingPeriod)
	require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Equal(t, periodEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())
	assert.Equal(t, desired, repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Zero(t, manager.updateCalls, "refund does not rewrite the provider target")

	_, err = svc.OpenRouterAPIKey(entitlementContext(7, "user-123"))
	assert.ErrorIs(t, err, errAllowanceRenewalPending)
}

func TestRefundReversalReusesFrozenDesiredLimit(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	const desired = int64(2_500_000)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "refunded", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm-1", PaddleSubscriptionID: "sub-1", PaddleCurrentPeriodEnd: &periodEnd, OpenRouterCreditPeriodEnd: &periodEnd,
		OpenRouterDesiredLimitMicrousd: desired,
		Credentials:                    &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{Hash: "hash-7", UsageMicrousd: 900_000, LimitMicrousd: 900_000, LimitRemainingMicrousd: 0}}
	svc := newEntitlementService(repo, manager)
	activeEnd := now.AddDate(0, 1, 0)

	applied, err := svc.ApplyConsumerPlan(context.Background(), 7, types.ConsumerPlanPro, "active", "monthly", "evt-reversal", now, "ctm-1", "sub-1", &activeEnd)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, types.ConsumerPlanPro, repo.tenant.Plan)
	assert.Equal(t, "active", repo.tenant.PlanStatus)
	assert.Equal(t, desired, repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, desired, manager.updateLimit, "reversal must restore the frozen absolute target")
	assert.Equal(t, 1, manager.updateCalls)
}

func TestPaidRenewalAfterRefundStartsExactlyOneNewAllowance(t *testing.T) {
	now := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	oldPeriodEnd := now.AddDate(0, 1, 0)
	newPeriodEnd := oldPeriodEnd.AddDate(0, 1, 0)
	const frozenDesired = int64(2_500_000)
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID: 7, Plan: types.ConsumerPlanPro, PlanStatus: "refunded", PaddleBillingPeriod: "monthly",
		PaddleCustomerID: "ctm-1", PaddleSubscriptionID: "sub-1", PaddleCurrentPeriodEnd: &oldPeriodEnd, OpenRouterCreditPeriodEnd: &oldPeriodEnd,
		OpenRouterDesiredLimitMicrousd: frozenDesired,
		Credentials:                    &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash: "hash-7", UsageMicrousd: 900_000, LimitMicrousd: frozenDesired, LimitRemainingMicrousd: 1_600_000,
	}}
	svc := newEntitlementService(repo, manager)

	applied, err := svc.RefreshPaidAllowance(
		context.Background(), 7, types.ConsumerPlanPro, "monthly", "evt-new-paid-period",
		oldPeriodEnd.Add(time.Minute), "ctm-1", "sub-1", newPeriodEnd,
	)
	require.NoError(t, err)
	assert.True(t, applied)
	assert.Equal(t, int64(3_400_000), repo.tenant.OpenRouterDesiredLimitMicrousd)
	assert.Equal(t, int64(3_400_000), manager.updateLimit)
	require.NotNil(t, repo.tenant.PaddleCurrentPeriodEnd)
	assert.Equal(t, newPeriodEnd, repo.tenant.PaddleCurrentPeriodEnd.UTC())
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
	assert.Equal(t, newPeriodEnd, repo.tenant.OpenRouterCreditPeriodEnd.UTC())
}
