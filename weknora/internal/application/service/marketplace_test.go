package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type marketplaceEntitlementStub struct {
	interfaces.EntitlementService
	plan types.ConsumerPlan
}

type marketplaceGatewayStub struct {
	createCalls  int
	recovery     *types.MarketplaceCheckoutRecovery
	createErr    error
	portalCalls  int
	cancelCalls  int
	cancelErr    error
	cancelHook   func()
	createdPrice string
}

func (g *marketplaceGatewayStub) Config() types.MarketplaceCheckoutConfig {
	return types.MarketplaceCheckoutConfig{
		Environment:      "sandbox",
		ClientToken:      "test_unit",
		Configured:       true,
		PortalConfigured: true,
	}
}

func (g *marketplaceGatewayStub) ValidateCatalog(context.Context, *types.MarketplaceProduct) error {
	return nil
}

func (g *marketplaceGatewayStub) CreateCheckout(_ context.Context, sub *types.MarketplaceSubscription) (string, error) {
	g.createCalls++
	g.createdPrice = sub.PriceID
	if g.createErr != nil {
		return "", g.createErr
	}
	return "txn_created", nil
}

func (g *marketplaceGatewayStub) RecoverCheckout(
	context.Context,
	*types.MarketplaceSubscription,
) (*types.MarketplaceCheckoutRecovery, error) {
	return g.recovery, nil
}

func (g *marketplaceGatewayStub) CreatePortal(context.Context, *types.MarketplaceSubscription) (string, error) {
	g.portalCalls++
	return "https://sandbox-customer-portal.paddle.com/session", nil
}

func (g *marketplaceGatewayStub) CancelCheckout(context.Context, *types.MarketplaceSubscription) error {
	g.cancelCalls++
	if g.cancelHook != nil {
		g.cancelHook()
	}
	return g.cancelErr
}

func TestMarketplaceCheckoutCanSwitchUnpaidMonthlyToYearlyWithoutDuplicateCharge(t *testing.T) {
	for _, test := range []struct {
		name, status, transactionID, providerSubscription string
		old, sameKey, racePaid                            bool
		cancelErr                                         error
		wantSuccess                                       bool
		wantCancel                                        int
	}{
		{
			name: "unpaid monthly transaction", status: "checkout_created",
			transactionID: "txn_monthly", wantSuccess: true, wantCancel: 1,
		},
		{name: "pending provider write not started", status: "pending", wantSuccess: true},
		{
			name: "bound paid subscription", status: "active",
			transactionID: "txn_monthly", providerSubscription: "sub_paid",
		},
		{
			name: "provider completed before webhook", status: "checkout_created",
			transactionID: "txn_monthly", cancelErr: types.ErrMarketplaceConflict, wantCancel: 1,
		},
		{name: "recent unknown write waits", status: "uncertain"},
		{
			name: "old unknown write unrecovered", status: "uncertain", old: true,
			cancelErr: errors.New("recovery pending"), wantCancel: 1,
		},
		{
			name: "old unknown write recovered and canceled", status: "uncertain",
			old: true, wantSuccess: true, wantCancel: 1,
		},
		{
			name: "same key changed payload rejected", status: "checkout_created",
			transactionID: "txn_monthly", sameKey: true,
		},
		{
			name: "webhook wins state transition", status: "checkout_created",
			transactionID: "txn_monthly", racePaid: true, wantCancel: 1,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := marketplaceServiceTestDB(t)
			repo := repository.NewMarketplaceRepository(db)
			gateway := &marketplaceGatewayStub{cancelErr: test.cancelErr}
			svc := NewMarketplaceService(
				repo,
				&marketplaceEntitlementStub{plan: types.ConsumerPlanFree},
				nil,
				nil,
				gateway,
			)
			require.NoError(
				t,
				db.Create(
					&types.MarketplaceProduct{
						ID:                       "product",
						CreatorTenantID:          2,
						CreatorUserID:            "creator",
						Title:                    "Product",
						AgentID:                  "agent",
						KnowledgeBaseIDs:         types.StringArray{},
						KnowledgeBaseNames:       types.StringArray{},
						PlatformKnowledgeBaseIDs: types.StringArray{},
						SampleQuestions:          types.StringArray{},
						MonthlyAmount:            100,
						YearlyAmount:             1000,
						MonthlyPriceID:           "pri_monthly",
						YearlyPriceID:            "pri_yearly",
						Currency:                 "USD",
						Status:                   "published",
					},
				).Error,
			)
			at := time.Now().UTC()
			if test.old {
				at = at.Add(-5 * time.Minute)
			}
			previous := &types.MarketplaceSubscription{
				ID:                    "monthly",
				TenantID:              7,
				UserID:                "buyer",
				ProductID:             "product",
				ProductTitle:          "Product",
				OperationKey:          "monthly-operation-key",
				BillingPeriod:         "monthly",
				PriceID:               "pri_monthly",
				Currency:              "USD",
				Amount:                100,
				Status:                test.status,
				CheckoutTransactionID: test.transactionID,
				PaddleSubscriptionID:  test.providerSubscription,
				CreatedAt:             at,
				UpdatedAt:             at,
			}
			require.NoError(t, db.Create(previous).Error)
			if test.racePaid {
				gateway.cancelHook = func() {
					require.NoError(
						t,
						db.Model(&types.MarketplaceSubscription{}).
							Where("id = ?", previous.ID).
							Updates(map[string]any{"status": "active", "paddle_subscription_id": "sub_paid"}).
							Error,
					)
				}
			}
			key := "yearly-operation-key"
			if test.sameKey {
				key = previous.OperationKey
			}
			result, err := svc.Checkout(marketplaceIdentity(7, "buyer", false), "product", "yearly", key)
			require.Equal(t, test.wantCancel, gateway.cancelCalls)
			if !test.wantSuccess {
				require.Error(t, err)
				require.Nil(t, result)
				require.Zero(t, gateway.createCalls)
				return
			}
			require.NoError(t, err)
			require.NotEqual(t, previous.ID, result.SubscriptionID)
			require.Equal(t, 1, gateway.createCalls)
			require.Equal(t, "pri_yearly", gateway.createdPrice)
			stored, err := repo.GetSubscription(context.Background(), previous.ID)
			require.NoError(t, err)
			require.Equal(t, "failed", stored.Status)
			current, err := repo.GetSubscription(context.Background(), result.SubscriptionID)
			require.NoError(t, err)
			require.Equal(t, "yearly", current.BillingPeriod)
			require.Equal(t, "checkout_created", current.Status)
			_, err = svc.Checkout(marketplaceIdentity(7, "buyer", false), "product", "yearly", previous.OperationKey)
			require.ErrorIs(t, err, types.ErrMarketplaceConflict)
			require.Equal(t, 1, gateway.createCalls)
		})
	}
}

func TestMarketplaceCheckoutRecoversUncertainWriteWithoutChargingTwice(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	gateway := &marketplaceGatewayStub{
		recovery: &types.MarketplaceCheckoutRecovery{TransactionID: "txn_recovered", Status: "ready"},
	}
	svc := NewMarketplaceService(
		repo,
		&marketplaceEntitlementStub{plan: types.ConsumerPlanFree},
		repository.NewKnowledgeBaseRepository(db),
		repository.NewCustomAgentRepository(db),
		gateway,
	)
	require.NoError(
		t,
		db.Create(
			&types.MarketplaceProduct{
				ID:                       "product",
				CreatorTenantID:          2,
				CreatorUserID:            "creator",
				Title:                    "Product",
				AgentID:                  "agent",
				KnowledgeBaseIDs:         types.StringArray{},
				KnowledgeBaseNames:       types.StringArray{},
				PlatformKnowledgeBaseIDs: types.StringArray{},
				SampleQuestions:          types.StringArray{},
				MonthlyAmount:            500,
				YearlyAmount:             5000,
				MonthlyPriceID:           "pri_monthly",
				YearlyPriceID:            "pri_yearly",
				Currency:                 "USD",
				Status:                   "published",
			},
		).Error,
	)
	ago := time.Now().Add(-5 * time.Minute)
	pending := &types.MarketplaceSubscription{
		ID:            "local",
		TenantID:      7,
		UserID:        "buyer",
		ProductID:     "product",
		ProductTitle:  "Product",
		OperationKey:  "operation-recovery-0001",
		BillingPeriod: "monthly",
		PriceID:       "pri_monthly",
		Currency:      "USD",
		Amount:        500,
		Status:        "uncertain",
		CreatedAt:     ago,
		UpdatedAt:     ago,
	}
	require.NoError(t, db.Create(pending).Error)
	result, err := svc.Checkout(marketplaceIdentity(7, "buyer", false), "product", "monthly", pending.OperationKey)
	require.NoError(t, err)
	require.Equal(t, "txn_recovered", result.TransactionID)
	require.Zero(t, gateway.createCalls)
	result, err = svc.Checkout(marketplaceIdentity(7, "buyer", false), "product", "monthly", pending.OperationKey)
	require.NoError(t, err)
	require.Equal(t, "txn_recovered", result.TransactionID)
	require.Zero(t, gateway.createCalls)
	gateway.recovery.Status = "canceled"
	_, err = svc.Checkout(marketplaceIdentity(7, "buyer", false), "product", "monthly", pending.OperationKey)
	require.ErrorIs(t, err, types.ErrMarketplaceConflict)
	stored, err := repo.GetSubscription(context.Background(), pending.ID)
	require.NoError(t, err)
	require.Equal(t, "failed", stored.Status)
}

func TestMarketplaceUnknownCheckoutOutcomeKeepsFenceAndPortalChecksBuyer(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	gateway := &marketplaceGatewayStub{createErr: errors.New("provider timeout")}
	svc := NewMarketplaceService(
		repo,
		&marketplaceEntitlementStub{plan: types.ConsumerPlanFree},
		repository.NewKnowledgeBaseRepository(db),
		repository.NewCustomAgentRepository(db),
		gateway,
	)
	require.NoError(
		t,
		db.Create(
			&types.MarketplaceProduct{
				ID:                       "product",
				CreatorTenantID:          2,
				CreatorUserID:            "creator",
				Title:                    "Product",
				AgentID:                  "agent",
				KnowledgeBaseIDs:         types.StringArray{},
				KnowledgeBaseNames:       types.StringArray{},
				PlatformKnowledgeBaseIDs: types.StringArray{},
				SampleQuestions:          types.StringArray{},
				MonthlyAmount:            100,
				YearlyAmount:             1000,
				MonthlyPriceID:           "pri_monthly",
				YearlyPriceID:            "pri_yearly",
				Currency:                 "USD",
				Status:                   "published",
			},
		).Error,
	)
	ctx := marketplaceIdentity(7, "buyer", false)
	_, err := svc.Checkout(ctx, "product", "monthly", "operation-timeout-0001")
	require.Error(t, err)
	_, err = svc.Checkout(ctx, "product", "monthly", "operation-timeout-0001")
	require.ErrorIs(t, err, types.ErrMarketplaceConflict)
	require.Equal(t, 1, gateway.createCalls)
	sub, err := repo.CurrentSubscription(ctx, 7, "product")
	require.NoError(t, err)
	orders, err := svc.Orders(ctx)
	require.NoError(t, err)
	require.False(t, orders.Subscriptions[0].PortalAvailable)
	require.NoError(
		t,
		db.Model(sub).
			Updates(map[string]any{
				"paddle_customer_id": "ctm_owned", "paddle_subscription_id": "sub_owned", "status": "past_due",
			}).
			Error,
	)
	_, err = svc.Portal(marketplaceIdentity(8, "other", false), sub.ID)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	require.Zero(t, gateway.portalCalls)
	portal, err := svc.Portal(ctx, sub.ID)
	require.NoError(t, err)
	require.Contains(t, portal, "https://")
	require.Equal(t, 1, gateway.portalCalls)
	orders, err = svc.Orders(ctx)
	require.NoError(t, err)
	require.True(t, orders.Subscriptions[0].PortalAvailable)
}

func TestMarketplaceAccountDeletionRetriesUnknownCheckoutAndSkipsBoundSubscriptions(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	gateway := &marketplaceGatewayStub{cancelErr: errors.New("provider outcome unknown")}
	svc := NewMarketplaceService(repo, nil, nil, nil, gateway)
	ago := time.Now().Add(-5 * time.Minute)
	rows := []*types.MarketplaceSubscription{
		{
			ID:           "never-sent",
			TenantID:     7,
			UserID:       "buyer",
			ProductID:    "one",
			OperationKey: "one",
			Status:       "pending",
			CreatedAt:    ago,
			UpdatedAt:    ago,
		},
		{
			ID:           "unknown",
			TenantID:     7,
			UserID:       "buyer",
			ProductID:    "two",
			OperationKey: "two",
			Status:       "uncertain",
			CreatedAt:    ago,
			UpdatedAt:    ago,
		},
		{
			ID:                   "bound",
			TenantID:             7,
			UserID:               "buyer",
			ProductID:            "three",
			OperationKey:         "three",
			Status:               "active",
			PaddleCustomerID:     "ctm_bound",
			PaddleSubscriptionID: "sub_bound",
			CreatedAt:            ago,
			UpdatedAt:            ago,
		},
	}
	require.NoError(t, db.Create(rows).Error)
	ctx := context.Background()
	require.Error(t, svc.EnsureAccountTerminal(ctx, 7))
	require.Error(t, svc.PrepareAccountDeletion(ctx, 7))
	neverSent, err := repo.GetSubscription(ctx, "never-sent")
	require.NoError(t, err)
	require.Equal(t, "failed", neverSent.Status)
	unknown, err := repo.GetSubscription(ctx, "unknown")
	require.NoError(t, err)
	require.Equal(t, "uncertain", unknown.Status)
	gateway.cancelErr = nil
	require.NoError(t, svc.PrepareAccountDeletion(ctx, 7))
	require.NoError(t, svc.EnsureAccountTerminal(ctx, 7))
	require.Equal(t, 2, gateway.cancelCalls)
	bound, err := repo.GetSubscription(ctx, "bound")
	require.NoError(t, err)
	require.Equal(t, "active", bound.Status)
}

func TestMarketplaceApprovalUsesPlatformSnapshotAndHidesSubmissionSecrets(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	svc := NewMarketplaceService(
		repo,
		&marketplaceEntitlementStub{plan: types.ConsumerPlanMax},
		repository.NewKnowledgeBaseRepository(db),
		repository.NewCustomAgentRepository(db),
		&marketplaceGatewayStub{},
	)
	require.NoError(
		t,
		db.Create(&types.CustomAgent{ID: "source-agent", TenantID: 7, Name: "Source", CreatedBy: "creator"}).Error,
	)
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "source-kb", TenantID: 7, Name: "Source KB"}).Error)
	require.NoError(
		t,
		db.Create(
			&types.CustomAgent{
				ID:       "platform-agent",
				TenantID: 99,
				Name:     "Reviewed agent",
				Config: types.CustomAgentConfig{
					SystemPrompt:        "Reviewed private prompt",
					ModelID:             "private-model",
					RerankModelID:       "private-rerank",
					MCPSelectionMode:    "all",
					SkillsSelectionMode: "all",
					SandboxConfigID:     "private-sandbox",
				},
			},
		).Error,
	)
	require.NoError(
		t,
		db.Create(
			&types.KnowledgeBase{
				ID:               "platform-kb",
				TenantID:         99,
				Name:             "Reviewed knowledge",
				EmbeddingModelID: types.PlatformKnowledgeBaseEmbeddingModelID,
			},
		).Error,
	)
	creator := marketplaceIdentity(7, "creator", false)
	p, err := svc.SaveProduct(
		creator,
		"",
		types.MarketplaceProductInput{
			Title:                  "Reviewed service",
			Description:            "A reviewed knowledge service",
			AgentID:                "source-agent",
			KnowledgeBaseIDs:       []string{"source-kb"},
			MonthlyAmount:          500,
			Contact:                "private@example.com",
			Authorization:          "Private contract text",
			AuthorizationConfirmed: true,
		},
		false,
	)
	require.NoError(t, err)
	_, err = svc.SubmitProduct(creator, p.ID)
	require.NoError(t, err)
	review := types.MarketplaceReviewInput{
		Action:                   "approve",
		PlatformAgentID:          "platform-agent",
		PlatformKnowledgeBaseIDs: []string{"platform-kb"},
		PaddleProductID:          "pro_reviewed",
		MonthlyPriceID:           "pri_monthly",
		YearlyPriceID:            "pri_yearly",
		ReviewNote:               "private internal review",
	}
	_, err = svc.ReviewProduct(creator, p.ID, review)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	approved, err := svc.ReviewProduct(marketplaceIdentity(99, "operator", true), p.ID, review)
	require.NoError(t, err)
	require.Equal(t, "published", approved.Status)
	buyer := marketplaceIdentity(8, "buyer", false)
	public, err := svc.GetProduct(buyer, p.ID)
	require.NoError(t, err)
	require.Equal(t, "platform-agent", public.AgentID)
	require.Equal(t, types.StringArray{"platform-kb"}, public.KnowledgeBaseIDs)
	raw, err := json.Marshal(public)
	require.NoError(t, err)
	for _, secret := range []string{
		"private@example.com", "Private contract text", "private internal review", "Reviewed private prompt",
		"creator_tenant_id", "creator_name", "source-agent", "source-kb",
	} {
		require.NotContains(t, string(raw), secret)
	}
	end := time.Now().Add(time.Hour)
	require.NoError(
		t,
		db.Create(
			&types.MarketplaceSubscription{
				ID:            "paid",
				TenantID:      8,
				UserID:        "buyer",
				ProductID:     p.ID,
				ProductTitle:  p.Title,
				OperationKey:  "purchase",
				BillingPeriod: "monthly",
				PriceID:       "pri_monthly",
				Currency:      "USD",
				Amount:        500,
				Status:        "active",
				PaidThrough:   &end,
			},
		).Error,
	)
	access, err := svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.NoError(t, err)
	require.Equal(t, uint64(99), access.SourceTenantID)
	require.Equal(t, types.CheapestRerankModelID, access.Agent.Config.RerankModelID)
	require.Equal(t, "none", access.Agent.Config.MCPSelectionMode)
	require.Empty(t, access.Agent.Config.SandboxConfigID)
	require.NoError(
		t,
		db.Model(&types.CustomAgent{}).
			Where("id = ? AND tenant_id = ?", "platform-agent", 99).
			Update("config", types.CustomAgentConfig{SystemPrompt: "Unreviewed later edit"}).
			Error,
	)
	access, err = svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.NoError(t, err)
	require.Equal(t, "Reviewed private prompt", access.Agent.Config.SystemPrompt)
	_, err = svc.ReviewProduct(marketplaceIdentity(99, "operator", true), p.ID,
		types.MarketplaceReviewInput{Action: "unpublish"})
	require.NoError(t, err)
	access, err = svc.AuthorizeAccess(buyer, 8, p.ID, time.Now())
	require.NoError(t, err, "paid buyers retain the purchased term after unlisting")
	require.Equal(t, "paid", access.SubscriptionID)
	_, err = svc.AuthorizeAccess(buyer, 8, p.ID, end)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
}

func (s *marketplaceEntitlementStub) Current(context.Context, time.Time) (*types.ConsumerEntitlement, error) {
	return &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(s.plan)}, nil
}

func marketplaceServiceTestDB(t *testing.T) *gorm.DB {
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
			&types.KnowledgeBase{},
			&types.CustomAgent{},
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

func marketplaceIdentity(tenant uint64, user string, admin bool) context.Context {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenant)
	ctx = context.WithValue(ctx, types.UserIDContextKey, user)
	return context.WithValue(ctx, types.SystemAdminContextKey, admin)
}

func TestMarketplaceOnlyMaxCanCreateOwnedSubmissionAndYearCostsTenMonths(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	ent := &marketplaceEntitlementStub{plan: types.ConsumerPlanPro}
	svc := NewMarketplaceService(
		repository.NewMarketplaceRepository(db),
		ent,
		repository.NewKnowledgeBaseRepository(db),
		repository.NewCustomAgentRepository(db),
		nil,
	)
	ctx := marketplaceIdentity(7, "creator", false)
	require.NoError(
		t,
		db.Create(&types.CustomAgent{ID: "agent", TenantID: 7, Name: "Creator agent", CreatedBy: "creator"}).Error,
	)
	require.NoError(
		t,
		db.Create(&types.KnowledgeBase{ID: "kb", TenantID: 7, Name: "Creator knowledge", CreatorID: "creator"}).Error,
	)
	input := types.MarketplaceProductInput{
		Title:                  "Reviewed knowledge",
		Description:            "A useful curated source",
		Category:               "learning",
		AgentID:                "agent",
		KnowledgeBaseIDs:       []string{"kb"},
		MonthlyAmount:          500,
		Contact:                "creator@example.com",
		Authorization:          "I own and authorize this content.",
		AuthorizationConfirmed: true,
	}
	_, err := svc.SaveProduct(ctx, "", input, false)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	ent.plan = types.ConsumerPlanMax
	product, err := svc.SaveProduct(ctx, "", input, false)
	require.NoError(t, err)
	require.Equal(t, int64(5000), product.YearlyAmount)
	require.Equal(t, "draft", product.Status)
	require.Equal(t, types.CheapestChatModelID, product.DefaultModelID)
	submitted, err := svc.SubmitProduct(ctx, product.ID)
	require.NoError(t, err)
	require.Equal(t, "pending", submitted.Status)
	_, err = svc.SaveProduct(ctx, product.ID, input, false)
	require.ErrorIs(t, err, types.ErrMarketplaceConflict)
	input.KnowledgeBaseIDs = []string{"foreign"}
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "foreign", TenantID: 99, Name: "Private"}).Error)
	_, err = svc.SaveProduct(ctx, "", input, false)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
}
