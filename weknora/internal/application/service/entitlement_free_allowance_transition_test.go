package service

import (
	"testing"
	"time"

	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestFreeKeyWithoutPersistedPeriodKeepsAlreadyIssuedProviderGrant(t *testing.T) {
	repo := &entitlementRepoStub{tenant: &types.Tenant{
		ID:         7,
		Plan:       types.ConsumerPlanFree,
		PlanStatus: "active",
		CreatedAt:  time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC),
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey:  "sk-child",
			KeyHash: "hash-7",
		}},
	}}
	manager := &keyManagerStub{info: &modelopenrouter.KeyInfo{
		Hash:                   "hash-7",
		LimitMicrousd:          1_000_000,
		LimitRemainingMicrousd: 900_000,
		UsageMicrousd:          100_000,
		MonthlyReset:           true,
	}}
	svc := newEntitlementService(repo, manager)

	_, err := svc.Current(entitlementContext(7, "user-123"), time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, int64(1_000_000), manager.updateLimit, "an existing current provider grant must not be clawed back")
	require.Equal(t, 1, manager.updateCalls)
	require.False(t, manager.monthlyReset)
	require.NotNil(t, repo.tenant.OpenRouterCreditPeriodEnd)
}
