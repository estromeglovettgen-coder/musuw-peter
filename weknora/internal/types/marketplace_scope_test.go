package types

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

// These tests exercise the trusted execution scope consumed by native QA.
// A scope selects source resources without changing the caller's billing identity.
func TestMarketplaceScopePreservesBuyerAndRestrictsResources(t *testing.T) {
	buyer := &Tenant{ID: 41}
	ctx := context.WithValue(context.Background(), TenantIDContextKey, buyer.ID)
	ctx = context.WithValue(ctx, TenantInfoContextKey, buyer)
	access := &MarketplaceAccess{
		ProductID: "product", SourceTenantID: 99,
		Agent: &CustomAgent{ID: "agent", TenantID: 99}, KnowledgeBaseIDs: []string{"kb-a"},
	}
	ctx = WithMarketplaceScope(ctx, buyer.ID, access)
	scope, ok := MarketplaceScopeFromContext(ctx)
	require.True(t, ok)
	require.Equal(t, uint64(41), MustTenantIDFromContext(ctx))
	require.Same(t, buyer, ctx.Value(TenantInfoContextKey))
	require.True(t, scope.AllowsAgent(access.Agent, buyer.ID))
	require.False(t, scope.AllowsAgent(&CustomAgent{ID: "other", TenantID: 99}, buyer.ID))
	require.False(t, scope.AllowsAgent(access.Agent, 42))
	require.True(t, scope.AllowsKnowledgeBase("kb-a", 99))
	require.False(t, scope.AllowsKnowledgeBase("kb-b", 99))
	require.False(t, scope.AllowsKnowledgeBase("kb-a", 41))
	access.KnowledgeBaseIDs[0] = "kb-b"
	require.True(t, scope.AllowsKnowledgeBase("kb-a", 99), "authorization must not alias mutable product metadata")
	clone, declared := ContextCloneDecision(MarketplaceScopeContextKey)
	require.True(t, declared)
	require.True(t, clone, "native SSE detachment must retain the same narrow scope")
}

func TestMarketplaceScopeCannotBeReusedAsAnotherBuyer(t *testing.T) {
	ctx := context.WithValue(context.Background(), TenantIDContextKey, uint64(41))
	ctx = WithMarketplaceScope(ctx, 41, &MarketplaceAccess{
		ProductID: "p", SourceTenantID: 99,
		Agent: &CustomAgent{ID: "a", TenantID: 99}, KnowledgeBaseIDs: []string{"kb"},
	})
	_, ok := MarketplaceScopeFromContext(context.WithValue(ctx, TenantIDContextKey, uint64(42)))
	require.False(t, ok)
}
