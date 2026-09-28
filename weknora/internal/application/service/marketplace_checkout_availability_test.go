package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
)

// Exercise the public catalog projection and actual checkout claim against the
// same durable subscription, including the legitimate canceled repurchase path.
func TestMarketplaceCheckoutAvailabilityMatchesBoundSubscriptionFence(t *testing.T) {
	for _, status := range []string{"refunded", "chargeback", "paused", "past_due", "active", "canceled", "failed"} {
		t.Run(status, func(t *testing.T) {
			db := marketplaceServiceTestDB(t)
			repo := repository.NewMarketplaceRepository(db)
			gateway := &marketplaceGatewayStub{}
			svc := NewMarketplaceService(
				repo, &marketplaceEntitlementStub{plan: types.ConsumerPlanFree}, nil, nil, gateway,
			)
			product := &types.MarketplaceProduct{
				ID: "product", CreatorTenantID: 99, CreatorUserID: "creator", Title: "Product",
				AgentID: "agent", KnowledgeBaseIDs: types.StringArray{}, KnowledgeBaseNames: types.StringArray{},
				PlatformKnowledgeBaseIDs: types.StringArray{}, SampleQuestions: types.StringArray{},
				MonthlyAmount: 100, YearlyAmount: 1000, MonthlyPriceID: "pri_monthly", YearlyPriceID: "pri_yearly",
				Currency: "USD", Status: "published", PublishedTenantID: 99,
			}
			require.NoError(t, db.Create(product).Error)
			paidThrough := time.Now().Add(time.Hour)
			if status == "active" || status == "past_due" {
				paidThrough = time.Now().Add(-time.Hour)
			}
			existing := &types.MarketplaceSubscription{
				ID: "existing", TenantID: 7, UserID: "buyer", ProductID: product.ID, ProductTitle: product.Title,
				OperationKey: "original-yearly-operation", BillingPeriod: "yearly", PriceID: "pri_yearly",
				Currency: "USD", Amount: 1000, Status: status, PaddleSubscriptionID: "sub_existing",
				PaddleCustomerID: "ctm_existing", PaidThrough: &paidThrough, CancelAtPeriodEnd: status == "refunded",
			}
			require.NoError(t, db.Create(existing).Error)
			ctx := marketplaceIdentity(7, "buyer", false)
			view, err := svc.GetProduct(ctx, product.ID)
			require.NoError(t, err)
			require.False(t, view.Access.CanChat)
			require.True(t, view.Access.PortalAvailable)
			require.Equal(t, existing.ID, view.Access.SubscriptionID)
			require.Equal(t, status, view.Access.Status)
			canReplace := status == "canceled" || status == "failed"
			require.Equal(t, canReplace, view.CheckoutAvailable)

			checkout, err := svc.Checkout(ctx, product.ID, "monthly", "new-monthly-operation")
			if canReplace {
				require.NoError(t, err)
				require.NotEqual(t, existing.ID, checkout.SubscriptionID)
				require.Equal(t, 1, gateway.createCalls)
				require.Equal(t, "pri_monthly", gateway.createdPrice)
			} else {
				require.ErrorIs(t, err, types.ErrMarketplaceConflict)
				require.Nil(t, checkout)
				_, err = svc.Checkout(ctx, product.ID, "yearly", "new-yearly-operation")
				require.ErrorIs(t, err, types.ErrMarketplaceConflict)
				require.Zero(t, gateway.createCalls)
				require.Zero(t, gateway.cancelCalls)
			}
		})
	}
}
