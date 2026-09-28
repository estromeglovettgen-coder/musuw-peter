package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func marketplaceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(
		t,
		db.AutoMigrate(
			&types.MarketplaceProduct{},
			&types.MarketplaceSubscription{},
			&types.MarketplaceTransaction{},
			&types.MarketplaceProcessedEvent{},
			&types.User{},
		),
	)
	require.NoError(
		t,
		db.Create(
			&types.User{ID: "buyer", Username: "buyer", Email: "buyer@example.test", TenantID: 7, IsActive: true},
		).Error,
	)
	require.NoError(
		t,
		db.Exec(
			"CREATE UNIQUE INDEX ux_marketplace_current_product ON marketplace_subscriptions(tenant_id, product_id) "+
				"WHERE status NOT IN ('canceled','failed')",
		).Error,
	)
	return db
}

func TestMarketplaceRefundOnlyRevokesTheAdjustedPaidTerm(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	ctx := context.Background()
	at := time.Date(2026, 9, 22, 1, 0, 0, 0, time.UTC)
	firstEnd := at.AddDate(0, 1, 0)
	secondEnd := firstEnd.AddDate(0, 1, 0)
	sub := &types.MarketplaceSubscription{
		ID:                   "local",
		TenantID:             7,
		UserID:               "buyer",
		ProductID:            "one",
		ProductTitle:         "One",
		OperationKey:         "one",
		BillingPeriod:        "monthly",
		PriceID:              "pri_one",
		Currency:             "USD",
		Status:               "active",
		PaddleCustomerID:     "ctm_one",
		PaddleSubscriptionID: "sub_one",
		PaidThrough:          &firstEnd,
	}
	require.NoError(t, db.Create(sub).Error)
	first := types.MarketplaceBillingEvent{
		EventID:              "evt_first",
		EventType:            "transaction.completed",
		OccurredAt:           at,
		SubscriptionID:       sub.ID,
		PaddleSubscriptionID: "sub_one",
		CustomerID:           "ctm_one",
		TransactionID:        "txn_first",
		PriceID:              "pri_one",
		Status:               "completed",
		PeriodStartsAt:       &at,
		PeriodEndsAt:         &firstEnd,
	}
	_, err := repo.ApplyBillingEvent(ctx, first)
	require.NoError(t, err)
	second := first
	second.EventID = "evt_second"
	second.TransactionID = "txn_second"
	second.OccurredAt = firstEnd
	second.PeriodStartsAt = &firstEnd
	second.PeriodEndsAt = &secondEnd
	_, err = repo.ApplyBillingEvent(ctx, second)
	require.NoError(t, err)
	refund := first
	refund.EventID = "evt_old_refund"
	refund.EventType = "adjustment.updated"
	refund.Status = "approved"
	refund.Action = "refund"
	refund.AdjustmentType = "full"
	refund.OccurredAt = firstEnd.Add(time.Hour)
	_, err = repo.ApplyBillingEvent(ctx, refund)
	require.NoError(t, err)
	current, err := repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.True(t, current.HasAccess(refund.OccurredAt))
	require.Equal(t, secondEnd, current.PaidThrough.UTC())
	refund.EventID = "evt_current_partial"
	refund.TransactionID = "txn_second"
	refund.AdjustmentType = "partial"
	refund.OccurredAt = firstEnd.Add(2 * time.Hour)
	_, err = repo.ApplyBillingEvent(ctx, refund)
	require.NoError(t, err)
	current, err = repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.True(t, current.HasAccess(refund.OccurredAt))
	refund.EventID = "evt_current_refund"
	refund.AdjustmentType = "full"
	refund.OccurredAt = firstEnd.Add(3 * time.Hour)
	_, err = repo.ApplyBillingEvent(ctx, refund)
	require.NoError(t, err)
	current, err = repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.Equal(t, "refunded", current.Status)
	require.False(t, current.HasAccess(refund.OccurredAt))
	lifecycle := second
	lifecycle.EventID = "evt_active_after_refund"
	lifecycle.EventType = "subscription.updated"
	lifecycle.Status = "active"
	lifecycle.OccurredAt = firstEnd.Add(4 * time.Hour)
	_, err = repo.ApplyBillingEvent(ctx, lifecycle)
	require.NoError(t, err)
	current, err = repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.Equal(t, "refunded", current.Status)
	thirdEnd := secondEnd.AddDate(0, 1, 0)
	third := second
	third.EventID = "evt_new_paid_term"
	third.TransactionID = "txn_third"
	third.OccurredAt = secondEnd
	third.PeriodStartsAt = &secondEnd
	third.PeriodEndsAt = &thirdEnd
	_, err = repo.ApplyBillingEvent(ctx, third)
	require.NoError(t, err)
	current, err = repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.True(t, current.HasAccess(secondEnd))
	require.Equal(t, thirdEnd, current.PaidThrough.UTC())
}

func TestMarketplaceLateCurrentInvoiceRefundWinsOverOrdinarySubscriptionUpdate(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	ctx := context.Background()
	at := time.Date(2026, 9, 22, 1, 0, 0, 0, time.UTC)
	end := at.AddDate(0, 1, 0)
	sub := &types.MarketplaceSubscription{
		ID:                   "local",
		TenantID:             7,
		UserID:               "buyer",
		ProductID:            "one",
		ProductTitle:         "One",
		OperationKey:         "one",
		BillingPeriod:        "monthly",
		PriceID:              "pri_one",
		Currency:             "USD",
		Status:               "active",
		PaddleCustomerID:     "ctm_one",
		PaddleSubscriptionID: "sub_one",
		PaidThrough:          &end,
	}
	require.NoError(t, db.Create(sub).Error)
	paid := types.MarketplaceBillingEvent{
		EventID:              "evt_paid",
		EventType:            "transaction.completed",
		OccurredAt:           at,
		SubscriptionID:       sub.ID,
		PaddleSubscriptionID: "sub_one",
		CustomerID:           "ctm_one",
		TransactionID:        "txn_paid",
		PriceID:              "pri_one",
		Status:               "completed",
		PeriodStartsAt:       &at,
		PeriodEndsAt:         &end,
	}
	_, err := repo.ApplyBillingEvent(ctx, paid)
	require.NoError(t, err)
	updated := paid
	updated.EventID, updated.EventType, updated.Status = "evt_scheduled_cancel", "subscription.updated", "active"
	updated.OccurredAt, updated.CancelAtPeriodEnd, updated.ScheduledChangeAt = at.Add(3*time.Hour), true, &end
	_, err = repo.ApplyBillingEvent(ctx, updated)
	require.NoError(t, err)
	refund := paid
	refund.EventID, refund.EventType, refund.Status = "evt_late_refund", "adjustment.updated", "approved"
	refund.Action, refund.AdjustmentType, refund.OccurredAt = "refund", "full", at.Add(2*time.Hour)
	_, err = repo.ApplyBillingEvent(ctx, refund)
	require.NoError(t, err)
	current, err := repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.Equal(t, "refunded", current.Status)
	require.False(t, current.HasAccess(updated.OccurredAt))
	require.True(t, current.CancelAtPeriodEnd)
	require.Equal(t, updated.OccurredAt, current.LastEventAt.UTC(), "refund must not rewind the lifecycle cursor")
	orders, err := repo.ListOrders(ctx, 7)
	require.NoError(t, err)
	require.Equal(t, "refunded", orders.Transactions[0].Status)
}

func TestMarketplaceBillingRejectsAnotherProviderIdentityWithoutConsumingEvent(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	require.NoError(
		t,
		db.Create(
			&types.MarketplaceSubscription{
				ID:                   "local",
				TenantID:             7,
				UserID:               "buyer",
				ProductID:            "one",
				ProductTitle:         "One",
				OperationKey:         "one",
				BillingPeriod:        "monthly",
				PriceID:              "pri_one",
				Currency:             "USD",
				Status:               "active",
				PaddleCustomerID:     "ctm_owned",
				PaddleSubscriptionID: "sub_owned",
			},
		).Error,
	)
	event := types.MarketplaceBillingEvent{
		EventID:              "evt_mismatch",
		EventType:            "subscription.canceled",
		OccurredAt:           time.Now(),
		SubscriptionID:       "local",
		PaddleSubscriptionID: "sub_other",
		CustomerID:           "ctm_other",
		PriceID:              "pri_one",
		Status:               "canceled",
	}
	_, err := repo.ApplyBillingEvent(context.Background(), event)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	var count int64
	require.NoError(t, db.Model(&types.MarketplaceProcessedEvent{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestMarketplaceSQLiteMigrationSupportsActualRepositoryRoundTrip(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	migration, err := os.ReadFile("../../../migrations/sqlite/000024_creator_marketplace.up.sql")
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(migration)).Error)
	previewMigration, err := os.ReadFile("../../../migrations/sqlite/000026_marketplace_preview_examples.up.sql")
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(previewMigration)).Error)
	repo := NewMarketplaceRepository(db)
	product := &types.MarketplaceProduct{
		ID:                       "product",
		CreatorTenantID:          7,
		CreatorUserID:            "creator",
		Title:                    "Test",
		AgentID:                  "agent",
		KnowledgeBaseIDs:         types.StringArray{"kb"},
		KnowledgeBaseNames:       types.StringArray{"Knowledge"},
		PlatformKnowledgeBaseIDs: types.StringArray{},
		SampleQuestions:          types.StringArray{"Question?"},
		SampleConversations:      []types.MarketplaceExample{{Question: "Real question", Answer: "Curated answer"}},
		DefaultModelID:           types.CheapestChatModelID,
		Currency:                 "USD",
		MonthlyAmount:            100,
		YearlyAmount:             1000,
		Status:                   "draft",
	}
	require.NoError(t, repo.SaveProduct(context.Background(), product, time.Time{}))
	loaded, err := repo.GetProduct(context.Background(), product.ID)
	require.NoError(t, err)
	require.Equal(t, types.StringArray{"kb"}, loaded.KnowledgeBaseIDs)
	require.Equal(t, types.StringArray{"Question?"}, loaded.SampleQuestions)
	require.Equal(t, product.SampleConversations, loaded.SampleConversations)
	downgrade, err := os.ReadFile("../../../migrations/sqlite/000024_creator_marketplace.down.sql")
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(downgrade)).Error)
}

func TestMarketplaceRenewalIsIdempotentAndDoesNotChangeAnotherProduct(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	ctx := context.Background()
	at := time.Date(2026, 9, 22, 1, 0, 0, 0, time.UTC)
	end := at.AddDate(0, 1, 0)
	first := &types.MarketplaceSubscription{
		ID:                   "sub-local-one",
		TenantID:             7,
		UserID:               "buyer",
		ProductID:            "one",
		ProductTitle:         "One",
		OperationKey:         "one",
		BillingPeriod:        "monthly",
		PriceID:              "pri_one",
		Currency:             "USD",
		Status:               "active",
		PaddleCustomerID:     "ctm_one",
		PaddleSubscriptionID: "sub_one",
		PaidThrough:          &end,
	}
	second := *first
	second.ID = "sub-local-two"
	second.ProductID = "two"
	second.OperationKey = "two"
	second.PaddleSubscriptionID = "sub_two"
	require.NoError(t, db.Create(first).Error)
	require.NoError(t, db.Create(&second).Error)
	renewed := end.AddDate(0, 1, 0)
	event := types.MarketplaceBillingEvent{
		EventID:              "evt_renew",
		EventType:            "transaction.completed",
		OccurredAt:           end,
		SubscriptionID:       first.ID,
		PaddleSubscriptionID: "sub_one",
		CustomerID:           "ctm_one",
		TransactionID:        "txn_renew",
		PriceID:              "pri_one",
		Status:               "completed",
		Currency:             "USD",
		Amount:               "500",
		PeriodStartsAt:       &end,
		PeriodEndsAt:         &renewed,
	}
	applied, err := repo.ApplyBillingEvent(ctx, event)
	require.NoError(t, err)
	require.True(t, applied)
	applied, err = repo.ApplyBillingEvent(ctx, event)
	require.NoError(t, err)
	require.False(t, applied)
	one, err := repo.GetSubscription(ctx, first.ID)
	require.NoError(t, err)
	require.Equal(t, renewed, one.PaidThrough.UTC())
	two, err := repo.GetSubscription(ctx, second.ID)
	require.NoError(t, err)
	require.Equal(t, end, two.PaidThrough.UTC())
	orders, err := repo.ListOrders(ctx, 7)
	require.NoError(t, err)
	require.Len(t, orders.Transactions, 1)
	event.EventID = "evt_unpaid_updated"
	event.EventType = "subscription.updated"
	event.Status = "active"
	event.OccurredAt = end.Add(time.Minute)
	notPaid := renewed.AddDate(0, 1, 0)
	event.PeriodEndsAt = &notPaid
	_, err = repo.ApplyBillingEvent(ctx, event)
	require.NoError(t, err)
	one, err = repo.GetSubscription(ctx, first.ID)
	require.NoError(t, err)
	require.Equal(t, renewed, one.PaidThrough.UTC())
}

func TestMarketplaceCheckoutIsIndependentPerProductAndRejectsChangedReplay(t *testing.T) {
	repo := NewMarketplaceRepository(marketplaceTestDB(t))
	ctx := context.Background()
	first := &types.MarketplaceSubscription{
		ID:            "first",
		TenantID:      7,
		UserID:        "buyer",
		ProductID:     "one",
		ProductTitle:  "One",
		OperationKey:  "key-one",
		BillingPeriod: "monthly",
		PriceID:       "pri_one",
		Currency:      "USD",
		Amount:        500,
		Status:        "pending",
	}
	saved, created, err := repo.ClaimCheckout(ctx, first)
	require.NoError(t, err)
	require.True(t, created)
	require.Equal(t, "first", saved.ID)
	second := *first
	second.ID = "second"
	second.ProductID = "two"
	second.OperationKey = "key-two"
	_, created, err = repo.ClaimCheckout(ctx, &second)
	require.NoError(t, err)
	require.True(t, created)
	duplicate := *first
	duplicate.ID = "duplicate"
	duplicate.OperationKey = "retry-key"
	saved, created, err = repo.ClaimCheckout(ctx, &duplicate)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, "first", saved.ID)
	changed := *first
	changed.ID = "changed"
	changed.ProductID = "two"
	_, _, err = repo.ClaimCheckout(ctx, &changed)
	require.ErrorIs(t, err, types.ErrMarketplaceConflict)
}

func TestMarketplaceDeletionFenceRejectsBothNewCheckoutAndClaimedCheckoutStart(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	ctx := context.Background()
	candidate := &types.MarketplaceSubscription{
		ID:            "pending",
		TenantID:      7,
		UserID:        "buyer",
		ProductID:     "one",
		ProductTitle:  "One",
		OperationKey:  "operation",
		BillingPeriod: "monthly",
		PriceID:       "pri_one",
		Currency:      "USD",
		Status:        "pending",
	}
	_, created, err := repo.ClaimCheckout(ctx, candidate)
	require.NoError(t, err)
	require.True(t, created)
	require.NoError(
		t,
		db.Model(&types.User{}).Where("id = ?", "buyer").Update("deletion_requested_at", time.Now()).Error,
	)
	_, err = repo.UpdateCheckout(ctx, candidate.ID, []string{"pending"}, "in_flight", "", "")
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	candidate.ID, candidate.ProductID, candidate.OperationKey = "later", "two", "later-operation"
	_, _, err = repo.ClaimCheckout(ctx, candidate)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	var count int64
	require.NoError(t, db.Model(&types.MarketplaceSubscription{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestMarketplaceQueuedEventCannotReidentifyOrReactivateErasedSubscription(t *testing.T) {
	db := marketplaceTestDB(t)
	repo := NewMarketplaceRepository(db)
	ctx := context.Background()
	at := time.Now().UTC()
	end := at.AddDate(0, 1, 0)
	sub := &types.MarketplaceSubscription{
		ID:            "erased",
		TenantID:      0,
		UserID:        "",
		ProductID:     "one",
		ProductTitle:  "One",
		OperationKey:  "erased",
		BillingPeriod: "monthly",
		PriceID:       "pri_one",
		Currency:      "USD",
		Status:        "canceled",
	}
	require.NoError(t, db.Create(sub).Error)
	event := types.MarketplaceBillingEvent{
		EventID:              "evt_before_erasure",
		EventType:            "transaction.completed",
		OccurredAt:           at,
		SubscriptionID:       sub.ID,
		PaddleSubscriptionID: "sub_previous",
		CustomerID:           "ctm_previous",
		TransactionID:        "txn_previous",
		PriceID:              "pri_one",
		Status:               "completed",
		PeriodStartsAt:       &at,
		PeriodEndsAt:         &end,
	}
	applied, err := repo.ApplyBillingEvent(ctx, event)
	require.NoError(t, err)
	require.True(t, applied)
	applied, err = repo.ApplyBillingEvent(ctx, event)
	require.NoError(t, err)
	require.False(t, applied)
	stored, err := repo.GetSubscription(ctx, sub.ID)
	require.NoError(t, err)
	require.Equal(t, "canceled", stored.Status)
	require.Empty(t, stored.PaddleCustomerID)
	require.Empty(t, stored.PaddleSubscriptionID)
	require.Nil(t, stored.PaidThrough)
	var invoiceCount, eventCount int64
	require.NoError(t, db.Model(&types.MarketplaceTransaction{}).Count(&invoiceCount).Error)
	require.NoError(t, db.Model(&types.MarketplaceProcessedEvent{}).Count(&eventCount).Error)
	require.Zero(t, invoiceCount)
	require.EqualValues(t, 1, eventCount)
}

func TestMarketplaceCheckoutReplacementCASCompetesWithStartingProviderWrite(t *testing.T) {
	for _, startFirst := range []bool{false, true} {
		t.Run(fmt.Sprintf("provider-starts-first-%t", startFirst), func(t *testing.T) {
			repo := NewMarketplaceRepository(marketplaceTestDB(t))
			ctx := context.Background()
			monthly := &types.MarketplaceSubscription{
				ID:            "monthly",
				TenantID:      7,
				UserID:        "buyer",
				ProductID:     "one",
				ProductTitle:  "One",
				OperationKey:  "monthly-key",
				BillingPeriod: "monthly",
				PriceID:       "pri_month",
				Currency:      "USD",
				Status:        "pending",
			}
			_, created, err := repo.ClaimCheckout(ctx, monthly)
			require.NoError(t, err)
			require.True(t, created)
			first, second := "failed", "in_flight"
			if startFirst {
				first, second = second, first
			}
			changed, err := repo.UpdateCheckout(ctx, monthly.ID, []string{"pending"}, first, "", "")
			require.NoError(t, err)
			require.True(t, changed)
			changed, err = repo.UpdateCheckout(ctx, monthly.ID, []string{"pending"}, second, "", "")
			require.NoError(t, err)
			require.False(t, changed)
			yearly := *monthly
			yearly.ID = "yearly"
			yearly.OperationKey = "yearly-key"
			yearly.BillingPeriod = "yearly"
			yearly.PriceID = "pri_year"
			current, created, err := repo.ClaimCheckout(ctx, &yearly)
			require.NoError(t, err)
			require.Equal(t, !startFirst, created)
			if startFirst {
				require.Equal(t, monthly.ID, current.ID)
			} else {
				require.Equal(t, yearly.ID, current.ID)
			}
			yearly.OperationKey = monthly.OperationKey
			_, _, err = repo.ClaimCheckout(ctx, &yearly)
			require.ErrorIs(t, err, types.ErrMarketplaceConflict)
		})
	}
}
