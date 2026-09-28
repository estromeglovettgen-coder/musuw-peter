package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestAccountErasureInventoriesAllMarketplaceSubscriptions(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	require.NoError(t, db.AutoMigrate(&types.MarketplaceSubscription{}))
	for i := 0; i < 205; i++ {
		sub := types.MarketplaceSubscription{
			ID:                   fmt.Sprintf("s-%d", i),
			TenantID:             1,
			UserID:               "u-1",
			ProductID:            "p",
			OperationKey:         fmt.Sprintf("op-%d", i),
			PaddleCustomerID:     fmt.Sprintf("ctm-%d", i),
			PaddleSubscriptionID: fmt.Sprintf("sub-%d", i),
			Status:               "active",
		}
		require.NoError(t, db.Create(&sub).Error)
	}
	target, err := NewAccountErasureRepository(db).Preflight(context.Background(), "u-1")
	require.NoError(t, err)
	require.Len(t, target.MarketplaceBilling, 205, "erasure cannot use the 200-order UI page limit")
}

func TestAccountErasureMinimizesMarketRecordsAndKeepsPublishedAssets(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	require.NoError(t, db.Exec("DELETE FROM tenant_members WHERE user_id = 'u-2' AND tenant_id = 1").Error)
	require.NoError(t, db.AutoMigrate(
		&types.MarketplaceProduct{}, &types.MarketplaceSubscription{},
		&types.MarketplaceTransaction{}, &types.MarketplaceProcessedEvent{},
	))
	product := types.MarketplaceProduct{
		ID:                       "product",
		CreatorTenantID:          1,
		CreatorUserID:            "u-1",
		CreatorName:              "Alice",
		Contact:                  "alice@example.com",
		Authorization:            "private author agreement",
		PublishedTenantID:        9,
		PlatformAgentID:          "approved-agent",
		PlatformKnowledgeBaseIDs: types.StringArray{"approved-kb"},
		AgentID:                  "source-agent",
		KnowledgeBaseIDs:         types.StringArray{"source-kb"},
		KnowledgeBaseNames:       types.StringArray{"private source"},
		SampleQuestions:          types.StringArray{},
		Status:                   "published",
	}
	require.NoError(t, db.Create(&product).Error)
	sub := types.MarketplaceSubscription{
		ID:                    "purchase",
		TenantID:              1,
		UserID:                "u-1",
		ProductID:             "product",
		OperationKey:          "private-key",
		Status:                "canceled",
		PaddleCustomerID:      "ctm-private",
		PaddleSubscriptionID:  "sub-private",
		CheckoutTransactionID: "txn-private",
		LastError:             "private-details",
		CreatedAt:             time.Now(),
	}
	require.NoError(t, db.Create(&sub).Error)
	transaction := types.MarketplaceTransaction{
		ID:             "txn-private",
		TenantID:       1,
		SubscriptionID: "purchase",
		ProductID:      "product",
		Status:         "completed",
		Currency:       "USD",
		Amount:         "500",
	}
	require.NoError(t, db.Create(&transaction).Error)
	require.NoError(t, NewAccountErasureRepository(db).Purge(context.Background(),
		&types.AccountErasureTarget{UserID: "u-1", TenantID: 1}))
	var after types.MarketplaceProduct
	require.NoError(t, db.First(&after, "id = ?", "product").Error)
	require.Empty(t, after.Contact)
	require.Empty(t, after.Authorization)
	require.Empty(t, after.CreatorUserID)
	require.Zero(t, after.CreatorTenantID)
	require.Empty(t, after.KnowledgeBaseIDs)
	require.Equal(t, "published", after.Status)
	require.Equal(t, uint64(9), after.PublishedTenantID)
	require.Equal(t, "approved-agent", after.PlatformAgentID)
	require.Equal(t, types.StringArray{"approved-kb"}, after.PlatformKnowledgeBaseIDs)
	var remaining types.MarketplaceSubscription
	require.NoError(t, db.First(&remaining, "id = ?", "purchase").Error)
	require.Zero(t, remaining.TenantID)
	require.Empty(t, remaining.UserID)
	require.Empty(t, remaining.PaddleCustomerID)
	require.Empty(t, remaining.PaddleSubscriptionID)
	require.Empty(t, remaining.CheckoutTransactionID)
	require.Empty(t, remaining.LastError)
	require.NotEqual(t, "private-key", remaining.OperationKey)
	var invoice types.MarketplaceTransaction
	require.NoError(t, db.First(&invoice, "id = ?", "txn-private").Error)
	require.Zero(t, invoice.TenantID)
	require.Equal(t, "500", invoice.Amount)
}

func TestAccountErasureTwoBuyersWithDelayedCancelWebhook(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	require.NoError(t, db.Exec("DELETE FROM tenant_members WHERE role <> 'owner'").Error)
	require.NoError(t, db.Exec("DELETE FROM organization_tenant_members").Error)
	require.NoError(t, db.Exec("DELETE FROM organizations").Error)
	require.NoError(t, db.Exec(`INSERT INTO users(id,username,email,tenant_id)
 VALUES ('u-2','second','second@example.com',2)`).Error)
	require.NoError(t, db.Exec("INSERT INTO tenants(id) VALUES (2)").Error)
	require.NoError(t, db.Exec(`INSERT INTO tenant_members(user_id,tenant_id,role,status)
 VALUES ('u-2',2,'owner','active')`).Error)
	migration, err := os.ReadFile("../../../migrations/sqlite/000024_creator_marketplace.up.sql")
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(migration)).Error)
	require.NoError(t, db.Exec(`INSERT INTO marketplace_products
 (id,creator_tenant_id,creator_user_id,title,agent_id,monthly_amount,yearly_amount)
 VALUES ('product',9,'platform','shared','a',100,1000)`).Error)
	for i := 1; i <= 2; i++ {
		require.NoError(t, db.Exec(`INSERT INTO marketplace_subscriptions
 (id,tenant_id,user_id,product_id,product_title,operation_key,billing_period,price_id,currency,amount,status)
 VALUES (?,?,?,'product','shared',?,'monthly','pri','USD',100,'active')`,
			fmt.Sprintf("s-%d", i), i, fmt.Sprintf("u-%d", i), fmt.Sprintf("op-%d", i)).Error)
	}
	repo := NewAccountErasureRepository(db)
	for i := 1; i <= 2; i++ {
		require.NoError(t, repo.Purge(context.Background(),
			&types.AccountErasureTarget{UserID: fmt.Sprintf("u-%d", i), TenantID: uint64(i)}))
	}
	var rows []types.MarketplaceSubscription
	require.NoError(t, db.Find(&rows).Error)
	require.Len(t, rows, 2)
	for _, row := range rows {
		require.Zero(t, row.TenantID)
		require.Equal(t, "canceled", row.Status)
	}
}
