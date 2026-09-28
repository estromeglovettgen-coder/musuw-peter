package handler

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type paddleMarketplacePriceReader interface {
	GetPrice(context.Context, *paddle.GetPriceRequest) (*paddle.Price, error)
}
type marketplacePaymentGateway struct{ billing *EntitlementHandler }

// NewMarketplacePaymentGateway reuses the application's selected environment,
// official SDK clients and server signing key. It never creates provider prices.
func NewMarketplacePaymentGateway(billing *EntitlementHandler) interfaces.MarketplacePaymentGateway {
	return &marketplacePaymentGateway{billing: billing}
}

func (g *marketplacePaymentGateway) Config() types.MarketplaceCheckoutConfig {
	if g == nil || g.billing == nil {
		return types.MarketplaceCheckoutConfig{}
	}
	h := g.billing
	return types.MarketplaceCheckoutConfig{
		Environment: strings.ToLower(h.paddle.Environment),
		ClientToken: h.paddle.ClientToken,
		Configured: h.paddle.Configured() && h.paddle.PortalConfigured() && h.transactions != nil &&
			h.prices != nil,
		PortalConfigured: h.paddle.PortalConfigured() && h.portal != nil,
	}
}

func (g *marketplacePaymentGateway) ValidateCatalog(ctx context.Context, p *types.MarketplaceProduct) error {
	if g == nil || g.billing == nil || g.billing.prices == nil || !g.billing.paddle.PortalConfigured() {
		return fmt.Errorf("paddle catalog verification is unavailable")
	}
	if p == nil || p.MonthlyAmount <= 0 || p.YearlyAmount/10 != p.MonthlyAmount || p.YearlyAmount%10 != 0 ||
		p.Currency != "USD" ||
		!strings.HasPrefix(p.PaddleProductID, "pro_") ||
		!strings.HasPrefix(p.MonthlyPriceID, "pri_") ||
		!strings.HasPrefix(p.YearlyPriceID, "pri_") ||
		p.MonthlyPriceID == p.YearlyPriceID {
		return types.ErrMarketplaceInvalid
	}
	for _, id := range []string{p.MonthlyPriceID, p.YearlyPriceID} {
		if _, known := g.billing.paddle.planForPrice(id); known {
			return fmt.Errorf(
				"%w: membership prices cannot be assigned to marketplace products",
				types.ErrMarketplaceInvalid,
			)
		}
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	for _, expected := range []struct {
		id       string
		interval paddle.Interval
		amount   int64
	}{
		{p.MonthlyPriceID, paddle.IntervalMonth, p.MonthlyAmount},
		{p.YearlyPriceID, paddle.IntervalYear, p.YearlyAmount},
	} {
		price, err := g.billing.prices.GetPrice(
			providerCtx,
			&paddle.GetPriceRequest{PriceID: expected.id, IncludeProduct: true},
		)
		if err != nil {
			return fmt.Errorf("paddle price verification failed: %w", err)
		}
		if price == nil || price.ID != expected.id || price.ProductID != p.PaddleProductID ||
			price.Status != paddle.StatusActive ||
			price.Product.ID != p.PaddleProductID ||
			price.Product.Status != paddle.StatusActive ||
			price.BillingCycle == nil ||
			price.BillingCycle.Interval != expected.interval ||
			price.BillingCycle.Frequency != 1 ||
			price.TrialPeriod != nil ||
			string(price.UnitPrice.CurrencyCode) != p.Currency ||
			price.UnitPrice.Amount != strconv.FormatInt(expected.amount, 10) ||
			price.Quantity.Minimum > 1 ||
			price.Quantity.Maximum < 1 {
			return fmt.Errorf(
				"%w: price must match the approved product, currency, amount and recurrence without a trial",
				types.ErrMarketplaceInvalid,
			)
		}
	}
	return nil
}

func marketplaceCheckoutBinding(config PaddleConfig, sub *types.MarketplaceSubscription) string {
	return config.checkoutBinding(sub.TenantID, "marketplace\x00"+sub.ProductID+"\x00"+sub.ID+"\x00"+sub.PriceID)
}

func marketplaceCheckoutCustomData(config PaddleConfig, sub *types.MarketplaceSubscription) paddle.CustomData {
	return paddle.CustomData{
		"tenant_id":                         strconv.FormatUint(sub.TenantID, 10),
		"musuw_marketplace_subscription_id": sub.ID,
		"musuw_marketplace_product_id":      sub.ProductID,
		"musuw_marketplace_binding":         marketplaceCheckoutBinding(config, sub),
		"musuw_billing_operation_key":       sub.OperationKey,
	}
}

func (g *marketplacePaymentGateway) CreateCheckout(
	ctx context.Context,
	sub *types.MarketplaceSubscription,
) (string, error) {
	if !g.Config().Configured || sub == nil {
		return "", fmt.Errorf("paddle checkout is unavailable")
	}
	request := &paddle.CreateTransactionRequest{
		Items: []paddle.CreateTransactionItems{
			*paddle.NewCreateTransactionItemsTransactionItemFromCatalog(
				&paddle.TransactionItemFromCatalog{PriceID: sub.PriceID, Quantity: 1},
			),
		},
		CustomData: marketplaceCheckoutCustomData(g.billing.paddle, sub),
	}
	if sub.PaddleCustomerID != "" {
		customerID := sub.PaddleCustomerID
		request.CustomerID = &customerID
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	transaction, err := g.billing.transactions.CreateTransaction(providerCtx, request)
	if err != nil {
		if paddleRequestDefinitelyRejected(err) {
			return "", fmt.Errorf("%w: %v", types.ErrMarketplaceCheckoutRejected, err)
		}
		return "", err
	}
	if transaction == nil || transaction.ID == "" ||
		(transaction.Status != paddle.TransactionStatusDraft && transaction.Status != paddle.TransactionStatusReady) {
		return "", fmt.Errorf("paddle returned an incomplete checkout transaction")
	}
	return transaction.ID, nil
}

func (g *marketplacePaymentGateway) matchesTransaction(
	transaction *paddle.Transaction,
	sub *types.MarketplaceSubscription,
) bool {
	if transaction == nil || len(transaction.Items) != 1 || transaction.Items[0].Quantity != 1 ||
		transaction.Items[0].Price.ID != sub.PriceID {
		return false
	}
	custom := transaction.CustomData
	if paddleCustomDataString(custom, "tenant_id") != strconv.FormatUint(sub.TenantID, 10) ||
		paddleCustomDataString(custom, "musuw_marketplace_subscription_id") != sub.ID ||
		paddleCustomDataString(custom, "musuw_marketplace_product_id") != sub.ProductID ||
		paddleCustomDataString(custom, "musuw_billing_operation_key") != sub.OperationKey {
		return false
	}
	return validEncodedPaddleCheckoutBinding(
		marketplaceCheckoutBinding(g.billing.paddle, sub),
		paddleCustomDataString(custom, "musuw_marketplace_binding"),
	)
}

func (g *marketplacePaymentGateway) RecoverCheckout(
	ctx context.Context,
	sub *types.MarketplaceSubscription,
) (*types.MarketplaceCheckoutRecovery, error) {
	if g == nil || g.billing == nil || g.billing.transactions == nil || sub == nil {
		return nil, fmt.Errorf("paddle checkout recovery is unavailable")
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	if sub.CheckoutTransactionID != "" {
		transaction, err := g.billing.transactions.GetTransaction(
			providerCtx,
			&paddle.GetTransactionRequest{TransactionID: sub.CheckoutTransactionID},
		)
		if err != nil {
			return nil, err
		}
		if !g.matchesTransaction(transaction, sub) {
			return nil, types.ErrMarketplaceForbidden
		}
		return &types.MarketplaceCheckoutRecovery{
			TransactionID: transaction.ID,
			Status:        string(transaction.Status),
		}, nil
	}
	order := "created_at[DESC]"
	perPage := 50
	request := &paddle.ListTransactionsRequest{Origin: []string{"api"}, OrderBy: &order, PerPage: &perPage}
	if sub.PaddleCustomerID != "" {
		request.CustomerID = []string{sub.PaddleCustomerID}
	}
	collection, err := g.billing.transactions.ListTransactions(providerCtx, request)
	if err != nil {
		return nil, err
	}
	if collection == nil {
		return nil, fmt.Errorf("paddle returned no transaction collection")
	}
	var found *types.MarketplaceCheckoutRecovery
	count := 0
	err = collection.Iter(providerCtx, func(transaction *paddle.Transaction) (bool, error) {
		count++
		if count > 500 {
			return false, fmt.Errorf("paddle transaction recovery inventory exceeded its bounded window")
		}
		if transaction == nil {
			return true, nil
		}
		createdAt, err := time.Parse(time.RFC3339Nano, transaction.CreatedAt)
		if err != nil {
			return false, err
		}
		if !sub.CreatedAt.IsZero() && createdAt.Before(sub.CreatedAt.Add(-5*time.Minute)) {
			return false, nil
		}
		if g.matchesTransaction(transaction, sub) {
			if found != nil {
				return false, errors.New("multiple Paddle transactions match one marketplace checkout")
			}
			found = &types.MarketplaceCheckoutRecovery{
				TransactionID: transaction.ID,
				Status:        string(transaction.Status),
			}
		}
		return true, nil
	})
	return found, err
}

func (g *marketplacePaymentGateway) CreatePortal(
	ctx context.Context,
	sub *types.MarketplaceSubscription,
) (string, error) {
	if g == nil || g.billing == nil || g.billing.portal == nil || sub == nil || sub.PaddleCustomerID == "" ||
		sub.PaddleSubscriptionID == "" {
		return "", types.ErrMarketplaceConflict
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	session, err := g.billing.portal.CreateCustomerPortalSession(
		providerCtx,
		&paddle.CreateCustomerPortalSessionRequest{
			CustomerID:      sub.PaddleCustomerID,
			SubscriptionIDs: []string{sub.PaddleSubscriptionID},
		},
	)
	if err != nil {
		return "", err
	}
	if session == nil {
		return "", fmt.Errorf("paddle returned no portal session")
	}
	parsed, err := url.Parse(strings.TrimSpace(session.URLs.General.Overview))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", fmt.Errorf("paddle returned an invalid portal URL")
	}
	return parsed.String(), nil
}

// Cancellation is only for an unpaid, server-bound initial transaction. A paid
// transaction must first bind through the signed webhook and then be handled by
// the existing subscription cancellation guard.
func (g *marketplacePaymentGateway) CancelCheckout(ctx context.Context, sub *types.MarketplaceSubscription) error {
	if sub == nil || sub.PaddleSubscriptionID != "" {
		return types.ErrMarketplaceConflict
	}
	recovered, err := g.RecoverCheckout(ctx, sub)
	if err != nil {
		return err
	}
	if recovered == nil {
		return fmt.Errorf("marketplace checkout cancellation awaits transaction recovery")
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	transaction, err := g.billing.transactions.GetTransaction(
		providerCtx,
		&paddle.GetTransactionRequest{TransactionID: recovered.TransactionID},
	)
	if err != nil {
		return err
	}
	if !g.matchesTransaction(transaction, sub) || transaction.ID != recovered.TransactionID {
		return types.ErrMarketplaceForbidden
	}
	if transaction.SubscriptionID != nil && strings.TrimSpace(*transaction.SubscriptionID) != "" {
		return types.ErrMarketplaceConflict
	}
	if transaction.Status == paddle.TransactionStatusCanceled {
		return nil
	}
	if transaction.Status != paddle.TransactionStatusDraft && transaction.Status != paddle.TransactionStatusReady &&
		transaction.Status != paddle.TransactionStatusPastDue {
		return fmt.Errorf("%w: marketplace payment is being finalized", types.ErrMarketplaceConflict)
	}
	result, updateErr := g.billing.transactions.UpdateTransaction(
		providerCtx,
		&paddle.UpdateTransactionRequest{
			TransactionID: transaction.ID,
			Status:        paddle.NewPatchField(paddle.TransactionStatusCanceled),
		},
	)
	if updateErr == nil && result != nil && result.ID == transaction.ID &&
		result.Status == paddle.TransactionStatusCanceled {
		return nil
	}
	// A timeout or concurrent cancellation can still have succeeded. Confirm
	// the exact official transaction before releasing the deletion fence.
	confirmCtx, confirmCancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer confirmCancel()
	confirmed, confirmErr := g.billing.transactions.GetTransaction(
		confirmCtx,
		&paddle.GetTransactionRequest{TransactionID: transaction.ID},
	)
	if confirmErr == nil && confirmed != nil && confirmed.ID == transaction.ID &&
		confirmed.Status == paddle.TransactionStatusCanceled {
		return nil
	}
	return fmt.Errorf("marketplace checkout cancellation is not confirmed")
}
