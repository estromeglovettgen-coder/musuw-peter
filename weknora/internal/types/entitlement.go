package types

import "time"

// ConsumerPlan is the single persisted identifier for a tenant's current plan.
type ConsumerPlan string

type OpenRouterCreditsStatus string

const (
	ConsumerPlanFree ConsumerPlan = "free"
	ConsumerPlanPlus ConsumerPlan = "plus"
	ConsumerPlanPro  ConsumerPlan = "pro"
	ConsumerPlanMax  ConsumerPlan = "max"

	OpenRouterCreditsAvailable     OpenRouterCreditsStatus = "available"
	OpenRouterCreditsUnavailable   OpenRouterCreditsStatus = "unavailable"
	OpenRouterCreditsUnprovisioned OpenRouterCreditsStatus = "unprovisioned"
	OpenRouterCreditsPending       OpenRouterCreditsStatus = "pending"

	CheapestChatModelID            = "builtin-deepseek-v4-flash"
	CheapestEmbeddingModelID       = PlatformKnowledgeBaseEmbeddingModelID
	CheapestRerankModelID          = "builtin-openrouter-rerank"
	CheapestVisionModelID          = PlatformKnowledgeBaseVLMModelID
	CheapestSpeechModelID          = PlatformKnowledgeBaseASRModelID
	consumerGiB              int64 = 1024 * 1024 * 1024
)

// ConsumerPlanLimits is deliberately current-state only. Zero content limits
// mean "no plan-specific cap"; existing platform and storage checks still apply.
type ConsumerPlanLimits struct {
	Plan                      ConsumerPlan `json:"plan"`
	StorageBytes              int64        `json:"storage_bytes"`
	MonthlyOpenRouterMicrousd int64        `json:"monthly_openrouter_microusd"`
	MaxKnowledgeBases         int64        `json:"max_knowledge_bases"`
	MaxDocumentsPerKB         int64        `json:"max_documents_per_kb"`
	VideoUpload               bool         `json:"video_upload"`
}

type ConsumerEntitlement struct {
	ConsumerPlanLimits
	PlanStatus                  string       `json:"plan_status"`
	PlanSource                  string       `json:"plan_source"`
	ComplimentaryPlan           ConsumerPlan `json:"complimentary_plan,omitempty"`
	ComplimentaryExpiresAt      *time.Time   `json:"complimentary_expires_at,omitempty"`
	StorageUsed                 int64        `json:"storage_used"`
	OpenRouterUsedMicrousd      int64        `json:"openrouter_used_microusd"`
	OpenRouterRemainingMicrousd int64        `json:"openrouter_remaining_microusd"`
	// Provider-backed usage is kept separate from the consumer-facing
	// allowance projection. OpenRouter reports lifetime key usage/remaining;
	// the consumer fields above are the current plan period after our plan
	// boundary is applied. These fields are intentionally not serialized by
	// generic entitlement responses; operator projections may expose them
	// under explicit provider_* names.
	OpenRouterProviderUsedMicrousd      int64                   `json:"-"`
	OpenRouterProviderRemainingMicrousd int64                   `json:"-"`
	OpenRouterResetsAt                  *time.Time              `json:"openrouter_resets_at,omitempty"`
	OpenRouterCreditsStatus             OpenRouterCreditsStatus `json:"openrouter_credits_status"`
	PaddleCustomerID                    string                  `json:"-"`
	PaddleSubscriptionID                string                  `json:"-"`
	PaddleBillingPeriod                 string                  `json:"-"`
	PaddleCurrentPeriodEnd              *time.Time              `json:"-"`
	OpenRouterCreditPeriodEnd           *time.Time              `json:"-"`
}

// PaddleSubscriptionBinding is the minimum durable provider identity needed
// to route adjustment events back to the existing tenant entitlement mirror.
// It is not a billing ledger and deliberately carries no payment or secret
// data.
type PaddleSubscriptionBinding struct {
	TenantID       uint64
	Plan           ConsumerPlan
	Status         string
	BillingPeriod  string
	CustomerID     string
	SubscriptionID string
}

func NormalizeConsumerPlan(plan ConsumerPlan) ConsumerPlan {
	switch plan {
	case ConsumerPlanPlus, ConsumerPlanPro, ConsumerPlanMax:
		return plan
	default:
		return ConsumerPlanFree
	}
}

func LimitsForConsumerPlan(plan ConsumerPlan) ConsumerPlanLimits {
	switch NormalizeConsumerPlan(plan) {
	case ConsumerPlanPlus:
		return ConsumerPlanLimits{Plan: ConsumerPlanPlus, StorageBytes: 10 * consumerGiB, MonthlyOpenRouterMicrousd: 1_250_000, VideoUpload: true}
	case ConsumerPlanPro:
		return ConsumerPlanLimits{Plan: ConsumerPlanPro, StorageBytes: 30 * consumerGiB, MonthlyOpenRouterMicrousd: 2_500_000, VideoUpload: true}
	case ConsumerPlanMax:
		return ConsumerPlanLimits{Plan: ConsumerPlanMax, StorageBytes: 100 * consumerGiB, MonthlyOpenRouterMicrousd: 5_000_000, VideoUpload: true}
	default:
		return ConsumerPlanLimits{Plan: ConsumerPlanFree, StorageBytes: consumerGiB, MonthlyOpenRouterMicrousd: 400_000, MaxKnowledgeBases: 1, MaxDocumentsPerKB: 10}
	}
}

func EffectiveConsumerPlan(tenant *Tenant) ConsumerPlan {
	if tenant == nil {
		return ConsumerPlanFree
	}
	plan := NormalizeConsumerPlan(tenant.Plan)
	if plan == ConsumerPlanFree {
		return plan
	}
	if tenant.PlanStatus == "active" || tenant.PlanStatus == "trialing" || tenant.PlanStatus == "past_due" {
		return plan
	}
	return ConsumerPlanFree
}

// EffectiveConsumerPlanAt applies the time-bounded part of Paddle's past_due
// grace policy. A failed renewal keeps paid access only through the last
// provider-confirmed paid term; it can never extend that boundary by itself.
func EffectiveConsumerPlanAt(tenant *Tenant, at time.Time) ConsumerPlan {
	plan := PaddleEffectiveConsumerPlanAt(tenant, at)
	// A verified Paddle entitlement always wins. Complimentary state is a
	// bounded overlay for otherwise-Free, Paddle-unbound workspaces.
	if plan != ConsumerPlanFree {
		return plan
	}
	if complimentary, ok := ActiveComplimentaryPlanAt(tenant, at); ok {
		return complimentary
	}
	return ConsumerPlanFree
}

// PaddleEffectiveConsumerPlanAt resolves only the billing-owned base state.
// Billing and grant code use this helper to avoid treating an operations
// overlay as a real subscription.
func PaddleEffectiveConsumerPlanAt(tenant *Tenant, at time.Time) ConsumerPlan {
	plan := EffectiveConsumerPlan(tenant)
	if plan != ConsumerPlanFree && tenant != nil && tenant.PlanStatus == "past_due" {
		var paidTermEnd *time.Time
		switch tenant.PaddleBillingPeriod {
		case "monthly":
			paidTermEnd = tenant.OpenRouterCreditPeriodEnd
		case "yearly":
			paidTermEnd = tenant.PaddleCurrentPeriodEnd
		}
		if paidTermEnd == nil || !paidTermEnd.After(at.UTC()) {
			plan = ConsumerPlanFree
		}
	}
	return plan
}

// ActiveComplimentaryPlanAt returns only a complete, unexpired paid-plan
// overlay. Exact expiry is exclusive, so the tenant is Free at expires_at.
func ActiveComplimentaryPlanAt(tenant *Tenant, at time.Time) (ConsumerPlan, bool) {
	if tenant == nil || NormalizeConsumerPlan(tenant.Plan) != ConsumerPlanFree ||
		tenant.ComplimentaryExpiresAt == nil || tenant.ComplimentaryGrantID == "" ||
		!tenant.ComplimentaryExpiresAt.After(at.UTC()) {
		return ConsumerPlanFree, false
	}
	switch tenant.ComplimentaryPlan {
	case ConsumerPlanPlus, ConsumerPlanPro, ConsumerPlanMax:
		return tenant.ComplimentaryPlan, true
	default:
		return ConsumerPlanFree, false
	}
}

// EffectiveStorageQuotaAt derives the admission limit from the same tenant
// snapshot that owns storage_used. Callers that enforce quota inside a
// transaction should pass the row they locked in that transaction, so a
// concurrent complimentary revoke or expiry cannot leave a stale paid quota
// on an in-flight upload.
func EffectiveStorageQuotaAt(tenant *Tenant, at time.Time) int64 {
	if tenant == nil {
		return 0
	}
	quota := tenant.StorageQuota
	if complimentary, active := ActiveComplimentaryPlanAt(tenant, at); active &&
		PaddleEffectiveConsumerPlanAt(tenant, at) == ConsumerPlanFree {
		giftQuota := LimitsForConsumerPlan(complimentary).StorageBytes
		if quota < giftQuota {
			return giftQuota
		}
		return quota
	}
	if EffectiveConsumerPlan(tenant) != ConsumerPlanFree && EffectiveConsumerPlanAt(tenant, at) == ConsumerPlanFree {
		freeQuota := LimitsForConsumerPlan(ConsumerPlanFree).StorageBytes
		if quota <= 0 || quota > freeQuota {
			return freeQuota
		}
	}
	return quota
}

func ConsumerPlanAllowsModel(plan ConsumerPlan, model *Model) bool {
	if model == nil {
		return false
	}
	if NormalizeConsumerPlan(plan) != ConsumerPlanFree {
		return true
	}
	allowedID := map[ModelType]string{
		ModelTypeKnowledgeQA: CheapestChatModelID,
		ModelTypeEmbedding:   CheapestEmbeddingModelID,
		ModelTypeRerank:      CheapestRerankModelID,
		ModelTypeVLLM:        CheapestVisionModelID,
		ModelTypeASR:         CheapestSpeechModelID,
	}[model.Type]
	return allowedID != "" && model.ID == allowedID
}
