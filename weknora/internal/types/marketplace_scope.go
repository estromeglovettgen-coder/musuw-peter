package types

import "context"

// MarketplaceScopeContextKey carries the server-issued reviewed-resource grant.
const MarketplaceScopeContextKey ContextKey = "marketplace_scope"

// MarketplaceScope is a request-local grant issued only after product access
// verification. It is not a replacement tenant identity and cannot be supplied
// in JSON. Native retrieval consumes its exact approved resource set.
type MarketplaceScope struct {
	productID      string
	buyerTenantID  uint64
	sourceTenantID uint64
	agentID        string
	knowledgeBases map[string]struct{}
}

// WithMarketplaceScope must only be called with a server-authorized access
// result. Copy the resource set because product/config snapshots may be mutable.
func WithMarketplaceScope(ctx context.Context, buyerTenantID uint64, access *MarketplaceAccess) context.Context {
	if access == nil || access.Agent == nil || access.ProductID == "" || buyerTenantID == 0 ||
		access.SourceTenantID == 0 || access.Agent.TenantID != access.SourceTenantID ||
		len(access.KnowledgeBaseIDs) == 0 {
		return ctx
	}
	scope := &MarketplaceScope{
		productID: access.ProductID, buyerTenantID: buyerTenantID,
		sourceTenantID: access.SourceTenantID, agentID: access.Agent.ID, knowledgeBases: make(map[string]struct{}),
	}
	for _, id := range access.KnowledgeBaseIDs {
		if id != "" {
			scope.knowledgeBases[id] = struct{}{}
		}
	}
	return context.WithValue(ctx, MarketplaceScopeContextKey, scope)
}

// MarketplaceScopeFromContext validates that the grant still belongs to the caller.
func MarketplaceScopeFromContext(ctx context.Context) (*MarketplaceScope, bool) {
	scope, ok := ctx.Value(MarketplaceScopeContextKey).(*MarketplaceScope)
	buyerID, _ := TenantIDFromContext(ctx)
	return scope, ok && scope != nil && buyerID == scope.buyerTenantID
}

// ProductID identifies the reviewed service for this turn.
func (s *MarketplaceScope) ProductID() string { return s.productID }

// SourceTenantID is used only for approved retrieval, never caller model billing.
func (s *MarketplaceScope) SourceTenantID() uint64 { return s.sourceTenantID }

// AllowsAgent requires both the approved agent and the original buyer identity.
func (s *MarketplaceScope) AllowsAgent(agent *CustomAgent, buyerTenantID uint64) bool {
	return s != nil && agent != nil && s.buyerTenantID == buyerTenantID &&
		agent.ID == s.agentID && agent.TenantID == s.sourceTenantID
}

// AllowsKnowledgeBase restricts retrieval to the reviewed source tenant and IDs.
func (s *MarketplaceScope) AllowsKnowledgeBase(id string, sourceTenantID uint64) bool {
	if s == nil || sourceTenantID != s.sourceTenantID {
		return false
	}
	_, ok := s.knowledgeBases[id]
	return ok
}
