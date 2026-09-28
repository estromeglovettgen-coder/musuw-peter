package repository

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetTenantEntitlementMapsMissingTenant(t *testing.T) {
	repo := NewEntitlementRepository(setupTestDB(t))
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	periodEnd := now.AddDate(0, 1, 0)
	tests := []struct {
		name string
		call func() error
	}{
		{name: "read", call: func() error {
			_, err := repo.GetTenantEntitlement(context.Background(), 999999)
			return err
		}},
		{name: "plan lifecycle write", call: func() error {
			_, err := repo.ApplyConsumerPlan(context.Background(), 999999, types.ConsumerPlanPro, "active", "monthly", "evt_missing", now, "ctm_missing", "sub_missing", &periodEnd, &periodEnd, 2_500_000)
			return err
		}},
		{name: "monthly allowance write", call: func() error {
			_, err := repo.AdvanceOpenRouterCreditPeriod(context.Background(), 999999, types.ConsumerPlanPro, "monthly", "evt_missing", now, "ctm_missing", "sub_missing", periodEnd, 2_500_000)
			return err
		}},
		{name: "yearly period write", call: func() error {
			_, err := repo.AdvancePaddleCurrentPeriod(context.Background(), 999999, types.ConsumerPlanPro, "ctm_missing", "sub_missing", "yearly", "evt_missing", now, periodEnd)
			return err
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.call()
			require.Error(t, err)
			assert.True(t, errors.Is(err, ErrTenantNotFound), "error = %v", err)
		})
	}
}

func TestApplyConsumerPlanUpdatesQuotaAndIgnoresOlderBillingEvent(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	tenant := &types.Tenant{Name: "subscriber", Status: "active"}
	require.NoError(t, db.Create(tenant).Error)

	periodEnd := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	applied, err := repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "active", "monthly", "evt-new", time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC), "ctm_1", "sub_1", &periodEnd, &periodEnd, 2_500_000)
	require.NoError(t, err)
	assert.True(t, applied)

	applied, err = repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanFree, "canceled", "", "evt-old", time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC), "ctm_1", "sub_1", nil, nil, 0)
	require.NoError(t, err)
	assert.False(t, applied)

	var stored types.Tenant
	stored = types.Tenant{}
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanPro).StorageBytes, stored.StorageQuota)
	assert.Equal(t, int64(2_500_000), stored.OpenRouterDesiredLimitMicrousd)
	require.NotNil(t, stored.PaddleCurrentPeriodEnd)
	assert.Equal(t, periodEnd, stored.PaddleCurrentPeriodEnd.UTC())
}

func TestApplyConsumerPlanCannotReplaceConcurrentInitialSubscription(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	tenant := &types.Tenant{Name: "subscriber", Status: "active"}
	require.NoError(t, db.Create(tenant).Error)

	firstAt := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	firstEnd := firstAt.AddDate(0, 1, 0)
	applied, err := repo.ApplyConsumerPlan(
		context.Background(), tenant.ID, types.ConsumerPlanPlus, "active", "monthly",
		"evt-first", firstAt, "ctm_1", "sub_first", &firstEnd, &firstEnd, 1_250_000,
	)
	require.NoError(t, err)
	require.True(t, applied)

	secondAt := firstAt.Add(time.Second)
	secondEnd := secondAt.AddDate(0, 1, 0)
	applied, err = repo.ApplyConsumerPlan(
		context.Background(), tenant.ID, types.ConsumerPlanPro, "active", "monthly",
		"evt-second", secondAt, "ctm_1", "sub_second", &secondEnd, &secondEnd, 2_500_000,
	)
	require.NoError(t, err)
	assert.False(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPlus, stored.Plan)
	assert.Equal(t, "sub_first", stored.PaddleSubscriptionID)
	assert.Equal(t, "evt-first", stored.PaddleLastEventID)
}

func TestComplimentaryPlanGrantReplayConflictAndRevokeCAS(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	tenant := &types.Tenant{Name: "gift", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	require.NoError(t, db.Create(tenant).Error)

	at := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	expires := at.AddDate(0, 2, 0)
	periodEnd := at.AddDate(0, 1, 0)
	applied, err := repo.GrantComplimentaryPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "grant-1234567890", at, expires, periodEnd, 2_750_000)
	require.NoError(t, err)
	require.True(t, applied)

	// Exact replay is a no-op even if a stale caller computed another provider target.
	applied, err = repo.GrantComplimentaryPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "grant-1234567890", at, expires, periodEnd, 9_999_999)
	require.NoError(t, err)
	assert.False(t, applied)

	_, err = repo.GrantComplimentaryPlan(context.Background(), tenant.ID, types.ConsumerPlanMax, "grant-1234567890", at, expires, periodEnd, 5_000_000)
	require.ErrorIs(t, err, ErrComplimentaryPlanConflict)
	_, err = repo.GrantComplimentaryPlan(context.Background(), tenant.ID, types.ConsumerPlanMax, "grant-another-1234", at, expires, periodEnd, 5_000_000)
	require.ErrorIs(t, err, ErrComplimentaryPlanConflict)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.ComplimentaryPlan)
	assert.Equal(t, "grant-1234567890", stored.ComplimentaryGrantID)
	require.NotNil(t, stored.ComplimentaryExpiresAt)
	assert.Equal(t, expires, stored.ComplimentaryExpiresAt.UTC())
	assert.Equal(t, int64(2_750_000), stored.OpenRouterDesiredLimitMicrousd)

	_, err = repo.RevokeComplimentaryPlan(context.Background(), tenant.ID, "grant-wrong-123456", at, at, 0)
	require.ErrorIs(t, err, ErrComplimentaryPlanConflict)
	applied, err = repo.RevokeComplimentaryPlan(context.Background(), tenant.ID, "grant-1234567890", at, at, 0)
	require.NoError(t, err)
	require.True(t, applied)
	applied, err = repo.RevokeComplimentaryPlan(context.Background(), tenant.ID, "grant-1234567890", at, at, 0)
	require.NoError(t, err)
	assert.False(t, applied)

	stored = types.Tenant{}
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Empty(t, stored.ComplimentaryPlan)
	assert.Nil(t, stored.ComplimentaryExpiresAt)
	assert.Equal(t, "grant-1234567890", stored.ComplimentaryGrantID)
	assert.Zero(t, stored.OpenRouterDesiredLimitMicrousd)

	// A revoked operation ID can never reactivate access.
	_, err = repo.GrantComplimentaryPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "grant-1234567890", at, expires, periodEnd, 2_500_000)
	assert.Error(t, err)
}

func TestComplimentaryGrantRejectsPaddleStateAndPaddleActivationSupersedesGrant(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	at := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	expires := at.AddDate(0, 2, 0)
	periodEnd := at.AddDate(0, 1, 0)

	bound := &types.Tenant{Name: "bound", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active", PaddleCustomerID: "ctm_old"}
	require.NoError(t, db.Create(bound).Error)
	_, err := repo.GrantComplimentaryPlan(context.Background(), bound.ID, types.ConsumerPlanPlus, "grant-bound-123456", at, expires, periodEnd, 1_250_000)
	require.ErrorIs(t, err, ErrComplimentaryPlanConflict)

	free := &types.Tenant{Name: "free", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	require.NoError(t, db.Create(free).Error)
	applied, err := repo.GrantComplimentaryPlan(context.Background(), free.ID, types.ConsumerPlanMax, "grant-paddle-1234", at, expires, periodEnd, 5_000_000)
	require.NoError(t, err)
	require.True(t, applied)

	paidEnd := at.AddDate(0, 1, 0)
	applied, err = repo.ApplyConsumerPlan(context.Background(), free.ID, types.ConsumerPlanPro, "active", "monthly", "evt-paid", at.Add(time.Second), "ctm_new", "sub_new", &paidEnd, &paidEnd, 2_500_000)
	require.NoError(t, err)
	require.True(t, applied)

	var stored types.Tenant
	stored = types.Tenant{}
	require.NoError(t, db.First(&stored, free.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Empty(t, stored.ComplimentaryPlan)
	assert.Nil(t, stored.ComplimentaryExpiresAt)
	assert.Equal(t, "grant-paddle-1234", stored.ComplimentaryGrantID)
	assert.Equal(t, "sub_new", stored.PaddleSubscriptionID)

	// A delayed revoke for the superseded grant cannot change Paddle state.
	applied, err = repo.RevokeComplimentaryPlan(context.Background(), free.ID, "grant-paddle-1234", at.Add(2*time.Second), at.Add(2*time.Second), 0)
	require.NoError(t, err)
	assert.False(t, applied)
	stored = types.Tenant{}
	require.NoError(t, db.First(&stored, free.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Equal(t, "sub_new", stored.PaddleSubscriptionID)
}

func TestResolvePaddleSubscriptionRequiresExactUnambiguousBinding(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	bound := &types.Tenant{
		Name: "bound", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "yearly", PaddleCustomerID: "ctm_bound", PaddleSubscriptionID: "sub_bound",
	}
	require.NoError(t, db.Create(bound).Error)

	binding, err := repo.ResolvePaddleSubscription(context.Background(), "ctm_bound", "sub_bound")
	require.NoError(t, err)
	require.NotNil(t, binding)
	assert.Equal(t, bound.ID, binding.TenantID)
	assert.Equal(t, types.ConsumerPlanPro, binding.Plan)
	assert.Equal(t, "yearly", binding.BillingPeriod)

	binding, err = repo.ResolvePaddleSubscription(context.Background(), "ctm_other", "sub_bound")
	require.NoError(t, err)
	assert.Nil(t, binding)

	duplicate := &types.Tenant{
		Name: "duplicate", Status: "active", Plan: types.ConsumerPlanPlus, PlanStatus: "active",
		PaddleBillingPeriod: "monthly", PaddleCustomerID: "ctm_bound", PaddleSubscriptionID: "sub_bound",
	}
	require.NoError(t, db.Create(duplicate).Error)
	binding, err = repo.ResolvePaddleSubscription(context.Background(), "ctm_bound", "sub_bound")
	assert.Error(t, err)
	assert.Nil(t, binding)
}

func TestApplyCanceledConsumerPlanRestoresFreeStorageQuota(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	paidTermEnd := time.Now().UTC().AddDate(1, 0, 0)
	tenant := &types.Tenant{Name: "subscriber", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleCurrentPeriodEnd: &paidTermEnd}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "canceled", "", "evt-canceled", time.Now(), "ctm_1", "sub_1", nil, nil, 0)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Equal(t, "canceled", stored.PlanStatus)
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanFree).StorageBytes, stored.StorageQuota)
	assert.Nil(t, stored.PaddleCurrentPeriodEnd)
}

func TestPausedAnnualPlanPreservesConfirmedTermForResume(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	paidTermEnd := time.Now().UTC().AddDate(0, 6, 0)
	tenant := &types.Tenant{
		Name: "subscriber", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "yearly", PaddleCurrentPeriodEnd: &paidTermEnd,
	}
	require.NoError(t, db.Create(tenant).Error)

	pausedAt := time.Now().UTC()
	applied, err := repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "paused", "yearly", "evt-paused", pausedAt, "ctm_1", "sub_1", nil, nil, 0)
	require.NoError(t, err)
	assert.True(t, applied)

	resumedAt := pausedAt.Add(time.Second)
	applied, err = repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "active", "yearly", "evt-resumed", resumedAt, "ctm_1", "sub_1", nil, nil, 0)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, types.EffectiveConsumerPlan(&stored))
	require.NotNil(t, stored.PaddleCurrentPeriodEnd)
	assert.Equal(t, paidTermEnd, stored.PaddleCurrentPeriodEnd.UTC())
}

func TestAdvancePaddleCurrentPeriodOnlyMovesForward(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	initial := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	tenant := &types.Tenant{Name: "annual", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "past_due", PaddleCurrentPeriodEnd: &initial}
	require.NoError(t, db.Create(tenant).Error)

	newer := initial.AddDate(1, 0, 0)
	tenant.PaddleCustomerID = "ctm_1"
	tenant.PaddleSubscriptionID = "sub_1"
	tenant.PaddleBillingPeriod = "yearly"
	require.NoError(t, db.Save(tenant).Error)
	applied, err := repo.AdvancePaddleCurrentPeriod(context.Background(), tenant.ID, types.ConsumerPlanPro, "ctm_1", "sub_1", "yearly", "", time.Time{}, newer)
	require.NoError(t, err)
	assert.True(t, applied)

	applied, err = repo.AdvancePaddleCurrentPeriod(context.Background(), tenant.ID, types.ConsumerPlanPro, "ctm_1", "sub_1", "yearly", "", time.Time{}, initial)
	require.NoError(t, err)
	assert.False(t, applied)

	applied, err = repo.AdvancePaddleCurrentPeriod(context.Background(), tenant.ID, types.ConsumerPlanPro, "ctm_1", "sub_replaced", "yearly", "", time.Time{}, newer.AddDate(1, 0, 0))
	require.NoError(t, err)
	assert.False(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	require.NotNil(t, stored.PaddleCurrentPeriodEnd)
	assert.Equal(t, newer, stored.PaddleCurrentPeriodEnd.UTC())
}

func TestNewerRecurringPeriodPreventsOlderRefundRollback(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	newPeriodEnd := oldPeriodEnd.AddDate(0, 1, 0)
	tenant := &types.Tenant{
		Name: "subscriber", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "monthly", PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		OpenRouterCreditPeriodEnd: &oldPeriodEnd,
	}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.AdvanceOpenRouterCreditPeriod(
		context.Background(), tenant.ID, types.ConsumerPlanPro, "monthly", "evt-renewed", renewedAt,
		"ctm_1", "sub_1", newPeriodEnd, 2_500_000,
	)
	require.NoError(t, err)
	assert.True(t, applied)

	olderRefundAt := renewedAt.Add(-time.Minute)
	applied, err = repo.ApplyConsumerPlan(
		context.Background(), tenant.ID, types.ConsumerPlanFree, "refunded", "", "evt-old-refund", olderRefundAt,
		"ctm_1", "sub_1", nil, nil, 0,
	)
	require.NoError(t, err)
	assert.False(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Equal(t, "active", stored.PlanStatus)
	assert.Empty(t, stored.PaddleLastEventID, "renewals must not advance the lifecycle cursor")
	require.NotNil(t, stored.PaddleLastRenewalAt)
	assert.Equal(t, renewedAt, stored.PaddleLastRenewalAt.UTC())
	require.NotNil(t, stored.OpenRouterCreditPeriodEnd)
	assert.Equal(t, newPeriodEnd, stored.OpenRouterCreditPeriodEnd.UTC())
}

func TestRenewalIgnoresNewerLifecycleCursor(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	lifecycleAt := renewedAt.Add(time.Hour)
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	newPeriodEnd := oldPeriodEnd.AddDate(0, 1, 0)
	tenant := &types.Tenant{
		Name: "monthly", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "monthly", PaddleCustomerID: "ctm_monthly", PaddleSubscriptionID: "sub_monthly",
		PaddleLastEventID: "evt-lifecycle", PaddleLastEventAt: &lifecycleAt,
		OpenRouterCreditPeriodEnd: &oldPeriodEnd,
	}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.AdvanceOpenRouterCreditPeriod(
		context.Background(), tenant.ID, types.ConsumerPlanPro, "monthly", "evt-renewal", renewedAt,
		"ctm_monthly", "sub_monthly", newPeriodEnd, 2_500_000,
	)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, "evt-lifecycle", stored.PaddleLastEventID)
	require.NotNil(t, stored.PaddleLastEventAt)
	assert.Equal(t, lifecycleAt, stored.PaddleLastEventAt.UTC())
	require.NotNil(t, stored.PaddleLastRenewalAt)
	assert.Equal(t, renewedAt, stored.PaddleLastRenewalAt.UTC())
	assert.Equal(t, newPeriodEnd, stored.OpenRouterCreditPeriodEnd.UTC())
}

func TestAnnualRenewalIgnoresNewerLifecycleCursor(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	lifecycleAt := renewedAt.Add(time.Hour)
	oldPeriodEnd := time.Date(2026, 9, 28, 9, 30, 0, 0, time.UTC)
	newPeriodEnd := oldPeriodEnd.AddDate(1, 0, 0)
	tenant := &types.Tenant{
		Name: "annual", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "yearly", PaddleCustomerID: "ctm_annual", PaddleSubscriptionID: "sub_annual",
		PaddleLastEventID: "evt-lifecycle", PaddleLastEventAt: &lifecycleAt,
		PaddleCurrentPeriodEnd: &oldPeriodEnd,
	}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.AdvancePaddleCurrentPeriod(
		context.Background(), tenant.ID, types.ConsumerPlanPro, "ctm_annual", "sub_annual", "yearly", "evt-renewal", renewedAt, newPeriodEnd,
	)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, "evt-lifecycle", stored.PaddleLastEventID)
	require.NotNil(t, stored.PaddleLastRenewalAt)
	assert.Equal(t, renewedAt, stored.PaddleLastRenewalAt.UTC())
	assert.Equal(t, newPeriodEnd, stored.PaddleCurrentPeriodEnd.UTC())
}

func TestLifecycleEventAtOrBeforeRenewalIsIgnored(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	renewedAt := time.Date(2026, 9, 28, 10, 0, 0, 0, time.UTC)
	creditPeriodEnd := renewedAt.AddDate(0, 1, 0)
	tenant := &types.Tenant{
		Name: "subscriber", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		PaddleBillingPeriod: "monthly", PaddleCustomerID: "ctm_1", PaddleSubscriptionID: "sub_1",
		PaddleLastRenewalAt: &renewedAt, OpenRouterCreditPeriodEnd: &creditPeriodEnd,
	}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.ApplyConsumerPlan(
		context.Background(), tenant.ID, types.ConsumerPlanPro, "past_due", "monthly", "evt-old-lifecycle", renewedAt,
		"ctm_1", "sub_1", nil, nil, 0,
	)
	require.NoError(t, err)
	assert.False(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanPro, stored.Plan)
	assert.Equal(t, "active", stored.PlanStatus)
	assert.Empty(t, stored.PaddleLastEventID)
}

func TestApplyConsumerPlanCannotRollBackConfirmedPaidTerm(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	oldTermEnd := time.Date(2026, 8, 28, 9, 30, 0, 0, time.UTC)
	newTermEnd := oldTermEnd.AddDate(1, 0, 0)
	tenant := &types.Tenant{Name: "annual", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active", PaddleCurrentPeriodEnd: &newTermEnd}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "active", "yearly", "evt-updated", time.Now().UTC(), "ctm_1", "sub_1", nil, nil, 2_500_000)
	require.NoError(t, err)
	assert.True(t, applied)

	evenLaterEvent := time.Now().UTC().Add(time.Second)
	applied, err = repo.ApplyConsumerPlan(context.Background(), tenant.ID, types.ConsumerPlanPro, "active", "yearly", "evt-old-period", evenLaterEvent, "ctm_1", "sub_1", nil, &oldTermEnd, 2_500_000)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	require.NotNil(t, stored.PaddleCurrentPeriodEnd)
	assert.Equal(t, newTermEnd, stored.PaddleCurrentPeriodEnd.UTC())
}

func TestOpenRouterDesiredLimitBootstrapsExactlyOnce(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	tenant := &types.Tenant{Name: "legacy", Status: "active"}
	require.NoError(t, db.Create(tenant).Error)

	inserted, err := repo.SetOpenRouterDesiredLimitIfUnset(context.Background(), tenant.ID, 1_750_000)
	require.NoError(t, err)
	assert.True(t, inserted)
	inserted, err = repo.SetOpenRouterDesiredLimitIfUnset(context.Background(), tenant.ID, 2_500_000)
	require.NoError(t, err)
	assert.False(t, inserted)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, int64(1_750_000), stored.OpenRouterDesiredLimitMicrousd)
}

func TestOpenRouterDesiredLimitCanBeUpdatedForOperatorReplay(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	tenant := &types.Tenant{Name: "operator", Status: "active", OpenRouterDesiredLimitMicrousd: 1_250_000}
	require.NoError(t, db.Create(tenant).Error)

	updated, err := repo.SetOpenRouterDesiredLimit(context.Background(), tenant.ID, 2_150_000)
	require.NoError(t, err)
	assert.True(t, updated)
	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, int64(2_150_000), stored.OpenRouterDesiredLimitMicrousd)
}

func TestRevocationKeepsExistingOpenRouterDesiredLimit(t *testing.T) {
	db := setupTestDB(t)
	repo := NewEntitlementRepository(db)
	paidThrough := time.Now().UTC().AddDate(0, 1, 0)
	tenant := &types.Tenant{
		Name: "revoked", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active",
		OpenRouterDesiredLimitMicrousd: 2_150_000, PaddleCurrentPeriodEnd: &paidThrough,
	}
	require.NoError(t, db.Create(tenant).Error)

	applied, err := repo.ApplyConsumerPlan(
		context.Background(), tenant.ID, types.ConsumerPlanFree, "refunded", "", "evt-refund",
		time.Now().UTC(), "ctm_1", "sub_1", nil, nil, 0,
	)
	require.NoError(t, err)
	assert.True(t, applied)

	var stored types.Tenant
	require.NoError(t, db.First(&stored, tenant.ID).Error)
	assert.Equal(t, types.ConsumerPlanFree, types.EffectiveConsumerPlan(&stored))
	assert.Equal(t, "refunded", stored.PlanStatus)
	assert.Equal(t, int64(2_150_000), stored.OpenRouterDesiredLimitMicrousd)
	require.NotNil(t, stored.PaddleCurrentPeriodEnd)
	assert.Equal(t, paidThrough.Unix(), stored.PaddleCurrentPeriodEnd.Unix())
}
