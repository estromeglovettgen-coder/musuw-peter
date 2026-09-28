package service

import (
	"context"
	"errors"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
)

func (s *marketplaceService) Library(ctx context.Context) ([]*types.MarketplaceLibraryEntry, error) {
	tenant, _, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	// This existing uncapped list retains completed payment history even when
	// a later unpaid retry replaces the current subscription for a product.
	subscriptions, err := s.repo.ListBillingSubscriptions(ctx, tenant)
	if err != nil {
		return nil, err
	}
	rows := []*types.MarketplaceLibraryEntry{}
	seen := map[string]bool{}
	for _, historical := range subscriptions {
		if historical.LastPaymentAt == nil || seen[historical.ProductID] {
			continue
		}
		seen[historical.ProductID] = true
		product, err := s.repo.GetProduct(ctx, historical.ProductID)
		if errors.Is(err, types.ErrMarketplaceNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if product.IsFree() || product.PublishedTenantID == 0 {
			continue
		}
		current, err := s.repo.CurrentSubscription(ctx, tenant, product.ID)
		if err != nil {
			return nil, err
		}
		_, accessErr := s.AuthorizeAccess(ctx, tenant, product.ID, time.Now().UTC())
		if accessErr != nil && !errors.Is(accessErr, types.ErrMarketplaceForbidden) &&
			!errors.Is(accessErr, types.ErrMarketplaceNotFound) {
			return nil, accessErr
		}
		canChat := accessErr == nil && current.LastPaymentAt != nil
		agentName := product.AgentName
		if agentName == "" {
			agentName = product.Title
		}
		for i, kbID := range product.PlatformKnowledgeBaseIDs {
			name := product.Title
			if i < len(product.KnowledgeBaseNames) {
				name = product.KnowledgeBaseNames[i]
			}
			kb, err := s.knowledgeBases.GetKnowledgeBaseByID(ctx, kbID)
			owned := err == nil && kb != nil && kb.TenantID == product.PublishedTenantID
			rows = append(rows, &types.MarketplaceLibraryEntry{
				ProductID: product.ID, ProductTitle: product.Title, AgentID: product.PlatformAgentID,
				AgentName: agentName, CanChat: canChat,
				KnowledgeBaseID: kbID, Name: name, Description: product.Description,
				WikiEnabled:       owned && kb.IsWikiEnabled(),
				CanRead:           canChat && owned,
				Status:            current.Status,
				PaidThrough:       current.PaidThrough,
				CancelAtPeriodEnd: current.CancelAtPeriodEnd,
			})
		}
	}
	return rows, nil
}
