package handler

import (
	"context"
	"errors"
	"testing"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type marketplacePriceReaderStub struct{ prices map[string]*paddle.Price }

func (s *marketplacePriceReaderStub) GetPrice(_ context.Context, r *paddle.GetPriceRequest) (*paddle.Price, error) {
	return s.prices[r.PriceID], nil
}

func TestMarketplaceCancelCheckoutConfirmsProviderOutcomeAndRejectsPaidOrForeignTransactions(t *testing.T) {
	config := PaddleConfig{Environment: "sandbox", WebhookSecret: "unit-marketplace-binding"}
	sub := &types.MarketplaceSubscription{
		ID:                    "local",
		TenantID:              7,
		ProductID:             "product",
		PriceID:               "pri_market",
		OperationKey:          "operation",
		CheckoutTransactionID: "txn_market",
	}
	ready := &paddle.Transaction{
		ID:         "txn_market",
		Status:     paddle.TransactionStatusReady,
		Items:      []paddle.TransactionItem{{Quantity: 1, Price: paddle.Price{ID: sub.PriceID}}},
		CustomData: marketplaceCheckoutCustomData(config, sub),
	}
	canceled := *ready
	canceled.Status = paddle.TransactionStatusCanceled
	t.Run("unknown update confirmed canceled", func(t *testing.T) {
		provider := &paddleTransactionClientStub{
			getResults: []*paddle.Transaction{ready, ready, &canceled},
			updateErr:  errors.New("network timeout"),
		}
		gateway := NewMarketplacePaymentGateway(&EntitlementHandler{paddle: config, transactions: provider})
		require.NoError(t, gateway.CancelCheckout(context.Background(), sub))
		require.Equal(t, 1, provider.updateCalls)
		require.Equal(t, paddle.TransactionStatusCanceled, *provider.updateReq.Status.Value())
	})
	for _, status := range []paddle.TransactionStatus{paddle.TransactionStatusPaid, paddle.TransactionStatusCompleted} {
		t.Run(string(status), func(t *testing.T) {
			txn := *ready
			txn.Status = status
			provider := &paddleTransactionClientStub{transaction: &txn}
			gateway := NewMarketplacePaymentGateway(&EntitlementHandler{paddle: config, transactions: provider})
			require.ErrorIs(t, gateway.CancelCheckout(context.Background(), sub), types.ErrMarketplaceConflict)
			require.Zero(t, provider.updateCalls)
		})
	}
	t.Run("foreign binding", func(t *testing.T) {
		txn := *ready
		txn.CustomData = paddle.CustomData{"musuw_marketplace_subscription_id": "other"}
		provider := &paddleTransactionClientStub{transaction: &txn}
		gateway := NewMarketplacePaymentGateway(&EntitlementHandler{paddle: config, transactions: provider})
		require.ErrorIs(t, gateway.CancelCheckout(context.Background(), sub), types.ErrMarketplaceForbidden)
		require.Zero(t, provider.updateCalls)
	})
}

func TestMarketplacePaddleCatalogChecksProviderProductCurrencyAndTenMonthAnnualPrice(t *testing.T) {
	monthly := &paddle.Price{
		ID:           "pri_monthly",
		ProductID:    "pro_market",
		Status:       paddle.StatusActive,
		BillingCycle: &paddle.Duration{Interval: paddle.IntervalMonth, Frequency: 1},
		UnitPrice:    paddle.Money{Amount: "500", CurrencyCode: paddle.CurrencyCodeUSD},
		Quantity:     paddle.PriceQuantity{Minimum: 1, Maximum: 1},
		Product:      paddle.Product{ID: "pro_market", Status: paddle.StatusActive},
	}
	yearly := *monthly
	yearly.ID = "pri_yearly"
	yearly.UnitPrice.Amount = "5000"
	yearly.BillingCycle = &paddle.Duration{Interval: paddle.IntervalYear, Frequency: 1}
	h := &EntitlementHandler{
		paddle: PaddleConfig{Environment: "sandbox", APIKey: "pdl_sdbx_apikey_unit"},
		prices: &marketplacePriceReaderStub{
			prices: map[string]*paddle.Price{"pri_monthly": monthly, "pri_yearly": &yearly},
		},
	}
	gateway := NewMarketplacePaymentGateway(h)
	product := &types.MarketplaceProduct{
		PaddleProductID: "pro_market",
		MonthlyPriceID:  "pri_monthly",
		YearlyPriceID:   "pri_yearly",
		MonthlyAmount:   500,
		YearlyAmount:    5000,
		Currency:        "USD",
	}
	require.NoError(t, gateway.ValidateCatalog(context.Background(), product))
	yearly.UnitPrice.Amount = "6000"
	require.ErrorIs(t, gateway.ValidateCatalog(context.Background(), product), types.ErrMarketplaceInvalid)
	yearly.UnitPrice.Amount = "5000"
	yearly.ProductID = "pro_foreign"
	require.ErrorIs(t, gateway.ValidateCatalog(context.Background(), product), types.ErrMarketplaceInvalid)
	yearly.ProductID = "pro_market"
	yearly.TrialPeriod = &paddle.TrialPeriod{Frequency: 14, Interval: paddle.IntervalDay}
	require.ErrorIs(t, gateway.ValidateCatalog(context.Background(), product), types.ErrMarketplaceInvalid)
}
