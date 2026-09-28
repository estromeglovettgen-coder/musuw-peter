package interfaces

import (
	"context"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
)

type EntitlementRepository interface {
	GetTenantEntitlement(ctx context.Context, tenantID uint64) (*types.Tenant, error)
	ResolvePaddleSubscription(ctx context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, error)
	SetOpenRouterCredentialsIfAbsent(ctx context.Context, tenantID uint64, credentials *types.OpenRouterCredentials, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error)
	// ApplyConsumerPlan persists the Paddle plan shape and the one absolute
	// OpenRouter limit in the same row transaction. The provider update is
	// deliberately performed by the service only after this commit.
	ApplyConsumerPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, creditPeriodEnd, paddlePeriodEnd *time.Time, desiredLimitMicrousd int64) (bool, error)
	// AdvanceOpenRouterCreditPeriod persists a new personal allowance period
	// and its absolute provider limit atomically. desiredLimitMicrousd may be
	// zero only when the tenant has no managed key yet.
	AdvanceOpenRouterCreditPeriod(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, periodEnd time.Time, desiredLimitMicrousd int64) (bool, error)
	// SetOpenRouterDesiredLimit changes the durable desired provider limit for
	// an existing managed key. It is used by the operator adjustment path before
	// the provider mutation so a failed provider call can be replayed safely.
	SetOpenRouterDesiredLimit(ctx context.Context, tenantID uint64, desiredLimitMicrousd int64) (bool, error)
	// SetOpenRouterDesiredLimitIfUnset bootstraps legacy rows exactly once from
	// the provider-observed absolute limit. A false result means another writer
	// already chose the durable value.
	SetOpenRouterDesiredLimitIfUnset(ctx context.Context, tenantID uint64, desiredLimitMicrousd int64) (bool, error)
	// GrantComplimentaryPlan installs one operations-owned paid-plan overlay on
	// an otherwise Free, Paddle-unbound tenant. Exact replays return applied=false.
	GrantComplimentaryPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, grantID string, at, expiresAt, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error)
	// RevokeComplimentaryPlan clears only the matching overlay. The grant ID is
	// retained for stale-request compare-and-set protection.
	RevokeComplimentaryPlan(ctx context.Context, tenantID uint64, grantID string, at, creditPeriodEnd time.Time, desiredLimitMicrousd int64) (bool, error)
	// AdvanceComplimentaryCreditPeriod validates the overlay source again under
	// the tenant row lock before advancing an active grant or its expired Free
	// convergence period.
	AdvanceComplimentaryCreditPeriod(ctx context.Context, tenantID uint64, grantID string, at time.Time, expectedPlan types.ConsumerPlan, periodEnd time.Time, desiredLimitMicrousd int64) (bool, error)
	AdvancePaddleCurrentPeriod(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, customerID, subscriptionID, billingPeriod, eventID string, occurredAt, periodEnd time.Time) (bool, error)
}

type EntitlementService interface {
	Current(ctx context.Context, at time.Time) (*types.ConsumerEntitlement, error)
	// CurrentForTenant is the same provider-backed snapshot for a platform
	// operator targeting an explicit tenant. It never returns provider
	// credentials or creates a second usage ledger.
	CurrentForTenant(ctx context.Context, tenantID uint64, at time.Time) (*types.ConsumerEntitlement, error)
	OpenRouterAPIKey(ctx context.Context) (string, error)
	OpenRouterUserID(ctx context.Context) string
	// SetOpenRouterRemainingForTenant changes only the existing provider-managed
	// child key's remaining allowance. The provider lifetime usage remains the
	// authority; callers cannot exceed the current effective plan allowance.
	SetOpenRouterRemainingForTenant(ctx context.Context, tenantID uint64, remainingMicrousd int64) (*types.ConsumerEntitlement, error)
	GrantComplimentaryPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, expiresAt time.Time, grantID string) (*types.ConsumerEntitlement, bool, error)
	RevokeComplimentaryPlan(ctx context.Context, tenantID uint64, grantID string) (*types.ConsumerEntitlement, bool, error)
	ResolvePaddleSubscription(ctx context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, error)
	ApplyConsumerPlan(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, status, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, creditPeriodEnd *time.Time) (bool, error)
	RefreshPaidAllowance(ctx context.Context, tenantID uint64, plan types.ConsumerPlan, billingPeriod, eventID string, occurredAt time.Time, customerID, subscriptionID string, periodEnd time.Time) (bool, error)
}
