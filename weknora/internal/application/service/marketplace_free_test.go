package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

// The public service lifecycle proves a free product needs neither Paddle nor a
// subscription while retaining the ordinary creator and publication boundaries.
func TestMarketplaceFreePublicationUsesReviewedScopeWithoutSubscription(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	entitlement := &marketplaceEntitlementStub{plan: types.ConsumerPlanMax}
	svc := NewMarketplaceService(repo, entitlement, repository.NewKnowledgeBaseRepository(db),
		repository.NewCustomAgentRepository(db), nil)
	for _, agent := range []*types.CustomAgent{
		{ID: "source-agent", TenantID: 7, Name: "Creator agent", CreatedBy: "creator"},
		{ID: "platform-agent", TenantID: 99, Name: "Approved agent", Config: types.CustomAgentConfig{
			SystemPrompt: "Private reviewed persona", ModelID: "private-model", MCPSelectionMode: "all",
		}},
	} {
		require.NoError(t, db.Create(agent).Error)
	}
	for _, kb := range []*types.KnowledgeBase{
		{ID: "source-kb", TenantID: 7, Name: "Creator knowledge"},
		{
			ID: "platform-kb", TenantID: 99, Name: "Approved knowledge",
			EmbeddingModelID: types.PlatformKnowledgeBaseEmbeddingModelID,
		},
	} {
		require.NoError(t, db.Create(kb).Error)
	}
	creator := marketplaceIdentity(7, "creator", false)
	input := types.MarketplaceProductInput{
		Title: "Free example", Description: "A reviewed free example", AgentID: "source-agent",
		KnowledgeBaseIDs: []string{"source-kb"}, MonthlyAmount: 0, Contact: "Private contact",
		Authorization: "I authorize publication", AuthorizationConfirmed: true,
	}
	p, err := svc.SaveProduct(creator, "", input, false)
	require.NoError(t, err)
	require.Zero(t, p.YearlyAmount)
	_, err = svc.SubmitProduct(creator, p.ID)
	require.NoError(t, err)
	admin := marketplaceIdentity(99, "operator", true)
	review := types.MarketplaceReviewInput{
		Action: "approve", PlatformAgentID: "platform-agent",
		PlatformKnowledgeBaseIDs: []string{"platform-kb"},
	}
	_, err = svc.ReviewProduct(creator, p.ID, review)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	invalidReview := review
	invalidReview.PlatformKnowledgeBaseIDs = []string{"source-kb"}
	_, err = svc.ReviewProduct(admin, p.ID, invalidReview)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	invalidReview = review
	invalidReview.PaddleProductID = "pro_should_not_be_bound"
	_, err = svc.ReviewProduct(admin, p.ID, invalidReview)
	require.ErrorIs(t, err, types.ErrMarketplaceInvalid)
	_, err = svc.ReviewProduct(admin, p.ID, review)
	require.NoError(t, err)

	entitlement.plan = types.ConsumerPlanFree
	buyer := marketplaceIdentity(8, "buyer", false)
	view, err := svc.GetProduct(buyer, p.ID)
	require.NoError(t, err)
	require.True(t, view.Access.CanChat)
	require.Equal(t, "free", view.Access.Status)
	require.Empty(t, view.Access.SubscriptionID)
	require.Nil(t, view.Access.PaidThrough)
	require.False(t, view.Access.PortalAvailable)
	require.False(t, view.CheckoutAvailable)
	require.Empty(t, view.Contact)
	require.Empty(t, view.Authorization)
	access, err := svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.NoError(t, err)
	require.Empty(t, access.SubscriptionID)
	require.Equal(t, uint64(99), access.SourceTenantID)
	require.Equal(t, []string{"platform-kb"}, access.KnowledgeBaseIDs)
	require.Equal(t, types.MarketplaceDefaultModelID, access.Agent.Config.ModelID)
	require.Equal(t, "none", access.Agent.Config.MCPSelectionMode)
	scoped := types.WithMarketplaceScope(buyer, 8, access)
	require.Equal(t, uint64(8), types.MustTenantIDFromContext(scoped))
	scope, ok := types.MarketplaceScopeFromContext(scoped)
	require.True(t, ok)
	require.True(t, scope.AllowsKnowledgeBase("platform-kb", 99))
	require.False(t, scope.AllowsKnowledgeBase("source-kb", 7))
	_, err = svc.AuthorizeAccess(context.Background(), 8, p.ID, time.Now())
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	_, err = svc.AuthorizeAccess(buyer, 9, p.ID, time.Now())
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	_, err = svc.Checkout(buyer, p.ID, "monthly", "free-checkout-operation")
	require.ErrorIs(t, err, types.ErrMarketplaceInvalid)
	orders, err := svc.Orders(buyer)
	require.NoError(t, err)
	require.Empty(t, orders.Subscriptions)
	require.Empty(t, orders.Transactions)
	require.Equal(t, types.ConsumerPlanFree, entitlement.plan)
	_, err = svc.SaveProduct(creator, "", input, false)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	require.NoError(t, db.Model(&types.KnowledgeBase{}).Where("id = ?", "platform-kb").Update("tenant_id", 100).Error)
	_, err = svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	require.NoError(t, db.Model(&types.KnowledgeBase{}).Where("id = ?", "platform-kb").Update("tenant_id", 99).Error)
	_, err = svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.NoError(t, err)

	_, err = svc.ReviewProduct(admin, p.ID, types.MarketplaceReviewInput{Action: "unpublish"})
	require.NoError(t, err)
	_, err = svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	_, err = svc.GetProduct(buyer, p.ID)
	require.ErrorIs(t, err, types.ErrMarketplaceNotFound)
}

func TestMarketplaceReviewedProductsCannotChangeBetweenFreeAndPaid(t *testing.T) {
	for _, amount := range []int64{0, 100} {
		for _, reviewed := range []bool{false, true} {
			t.Run(fmt.Sprintf("amount_%d_reviewed_%t", amount, reviewed), func(t *testing.T) {
				db := marketplaceServiceTestDB(t)
				svc := NewMarketplaceService(repository.NewMarketplaceRepository(db), nil,
					repository.NewKnowledgeBaseRepository(db), repository.NewCustomAgentRepository(db), nil)
				require.NoError(t, db.Create(&types.CustomAgent{ID: "agent", TenantID: 99, Name: "Agent"}).Error)
				require.NoError(t, db.Create(&types.KnowledgeBase{ID: "kb", TenantID: 99, Name: "Knowledge"}).Error)
				admin := marketplaceIdentity(99, "operator", true)
				input := types.MarketplaceProductInput{
					Title: "Product", Description: "Description", AgentID: "agent", KnowledgeBaseIDs: []string{"kb"},
					MonthlyAmount: amount,
				}
				p, err := svc.SaveProduct(admin, "", input, true)
				require.NoError(t, err)
				if reviewed {
					require.NoError(t, db.Model(p).Update("reviewed_at", time.Now()).Error)
					// An administrative edit resets the draft status, but must retain
					// the historical payment mode guard across subsequent edits.
					_, err = svc.SaveProduct(admin, p.ID, input, true)
					require.NoError(t, err)
				}
				input.MonthlyAmount = 100 - amount
				_, err = svc.SaveProduct(admin, p.ID, input, true)
				if reviewed {
					require.ErrorIs(t, err, types.ErrMarketplaceConflict)
				} else {
					require.NoError(t, err)
				}
			})
		}
	}
}
