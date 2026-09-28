package types

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestPlanLimits(t *testing.T) {
	tests := []struct {
		plan          ConsumerPlan
		storageGiB    int64
		creditsMicros int64
		maxKBs        int64
		maxDocs       int64
		video         bool
	}{
		{ConsumerPlanFree, 1, 400_000, 1, 10, false},
		{ConsumerPlanPlus, 10, 1_250_000, 0, 0, true},
		{ConsumerPlanPro, 30, 2_500_000, 0, 0, true},
		{ConsumerPlanMax, 100, 5_000_000, 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(string(tt.plan), func(t *testing.T) {
			got := LimitsForConsumerPlan(tt.plan)
			assert.Equal(t, tt.storageGiB*1024*1024*1024, got.StorageBytes)
			assert.Equal(t, tt.creditsMicros, got.MonthlyOpenRouterMicrousd)
			assert.Equal(t, tt.maxKBs, got.MaxKnowledgeBases)
			assert.Equal(t, tt.maxDocs, got.MaxDocumentsPerKB)
			assert.Equal(t, tt.video, got.VideoUpload)
		})
	}

	unknown := LimitsForConsumerPlan(ConsumerPlan("unknown"))
	assert.Equal(t, int64(1*1024*1024*1024), unknown.StorageBytes)
	assert.Equal(t, int64(400_000), unknown.MonthlyOpenRouterMicrousd)
}

func TestFreeModelAllowlist(t *testing.T) {
	assert.True(t, ConsumerPlanAllowsModel(ConsumerPlanFree, &Model{ID: CheapestChatModelID, Type: ModelTypeKnowledgeQA}))
	assert.True(t, ConsumerPlanAllowsModel(ConsumerPlanFree, &Model{ID: PlatformKnowledgeBaseEmbeddingModelID, Type: ModelTypeEmbedding}))
	assert.False(t, ConsumerPlanAllowsModel(ConsumerPlanFree, &Model{ID: "builtin-deepseek-v4-pro", Type: ModelTypeKnowledgeQA}))
	assert.True(t, ConsumerPlanAllowsModel(ConsumerPlanPlus, &Model{ID: "builtin-deepseek-v4-pro", Type: ModelTypeKnowledgeQA}))
}

func TestEffectiveConsumerPlanAtBoundsPastDueGraceByConfirmedTerm(t *testing.T) {
	now := time.Now().UTC()
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)
	assert.Equal(t, ConsumerPlanPro, EffectiveConsumerPlanAt(&Tenant{
		Plan: ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "yearly", PaddleCurrentPeriodEnd: &future,
	}, now))
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(&Tenant{
		Plan: ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "yearly", PaddleCurrentPeriodEnd: &past,
	}, now))
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(&Tenant{
		Plan: ConsumerPlanPro, PlanStatus: "past_due",
	}, now))
	assert.Equal(t, ConsumerPlanPro, EffectiveConsumerPlanAt(&Tenant{
		Plan: ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "monthly",
		PaddleCurrentPeriodEnd: &past, OpenRouterCreditPeriodEnd: &future,
	}, now))
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(&Tenant{
		Plan: ConsumerPlanPro, PlanStatus: "past_due", PaddleBillingPeriod: "monthly",
		PaddleCurrentPeriodEnd: &future, OpenRouterCreditPeriodEnd: &past,
	}, now))
}

func TestEffectiveConsumerPlanRejectsPaidPlanWithoutProviderStatus(t *testing.T) {
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlan(&Tenant{Plan: ConsumerPlanPro}))
	assert.Equal(t, ConsumerPlanPro, EffectiveConsumerPlan(&Tenant{Plan: ConsumerPlanPro, PlanStatus: "active"}))
}

func TestEffectiveConsumerPlanAtUsesBoundedComplimentaryPlan(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	expires := now.Add(time.Hour)
	tenant := &Tenant{
		Plan:                   ConsumerPlanFree,
		PlanStatus:             "active",
		ComplimentaryPlan:      ConsumerPlanPro,
		ComplimentaryExpiresAt: &expires,
		ComplimentaryGrantID:   "grant-1234567890",
	}

	plan, ok := ActiveComplimentaryPlanAt(tenant, now)
	assert.True(t, ok)
	assert.Equal(t, ConsumerPlanPro, plan)
	assert.Equal(t, ConsumerPlanPro, EffectiveConsumerPlanAt(tenant, now))
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(tenant, expires))
	assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(tenant, expires.Add(time.Nanosecond)))
}

func TestEffectiveConsumerPlanAtPrefersVerifiedPaddleAndRejectsMalformedGift(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	expires := now.Add(time.Hour)
	paid := &Tenant{
		Plan: ConsumerPlanPlus, PlanStatus: "active", PaddleBillingPeriod: "monthly",
		ComplimentaryPlan: ConsumerPlanMax, ComplimentaryExpiresAt: &expires, ComplimentaryGrantID: "grant-1234567890",
	}
	assert.Equal(t, ConsumerPlanPlus, EffectiveConsumerPlanAt(paid, now))

	for _, tenant := range []*Tenant{
		{Plan: ConsumerPlanFree, PlanStatus: "active", ComplimentaryPlan: ConsumerPlanFree, ComplimentaryExpiresAt: &expires, ComplimentaryGrantID: "grant-1234567890"},
		{Plan: ConsumerPlanFree, PlanStatus: "active", ComplimentaryPlan: ConsumerPlan("unknown"), ComplimentaryExpiresAt: &expires, ComplimentaryGrantID: "grant-1234567890"},
		{Plan: ConsumerPlanFree, PlanStatus: "active", ComplimentaryPlan: ConsumerPlanPro, ComplimentaryGrantID: "grant-1234567890"},
		{Plan: ConsumerPlanFree, PlanStatus: "active", ComplimentaryPlan: ConsumerPlanPro, ComplimentaryExpiresAt: &expires},
		{Plan: ConsumerPlanPro, PlanStatus: "refunded", ComplimentaryPlan: ConsumerPlanMax, ComplimentaryExpiresAt: &expires, ComplimentaryGrantID: "grant-1234567890"},
	} {
		_, ok := ActiveComplimentaryPlanAt(tenant, now)
		assert.False(t, ok)
		assert.Equal(t, ConsumerPlanFree, EffectiveConsumerPlanAt(tenant, now))
	}
}
