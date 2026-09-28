package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	paddleerr "github.com/PaddleHQ/paddle-go-sdk/v5/pkg/paddleerr"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
)

const paddleSignatureTolerance = 5 * time.Second

const paddleAdjustmentReconcileTimeout = 3 * time.Second

const paddleMutationTimeout = 15 * time.Second

const paddleCheckoutRecoveryDelay = 2 * time.Minute

const paddleUpgradeRecoveryDelay = 10 * time.Minute

type PaddleConfig struct {
	Environment   string
	APIKey        string
	ClientToken   string
	WebhookSecret string
	Prices        map[types.ConsumerPlan]map[string]string
}

func loadPaddleConfig() PaddleConfig {
	prices := map[types.ConsumerPlan]map[string]string{}
	for _, item := range []struct {
		plan   types.ConsumerPlan
		period string
		keys   []string
	}{
		{types.ConsumerPlanPlus, "monthly", []string{"MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID", "MUSNOW_PADDLE_PERSONAL_MONTHLY_PRICE_ID"}},
		{types.ConsumerPlanPlus, "yearly", []string{"MUSUW_PADDLE_PLUS_YEARLY_PRICE_ID", "MUSNOW_PADDLE_PERSONAL_YEARLY_PRICE_ID"}},
		{types.ConsumerPlanPro, "monthly", []string{"MUSUW_PADDLE_PRO_MONTHLY_PRICE_ID", "MUSNOW_PADDLE_PRO_MONTHLY_PRICE_ID"}},
		{types.ConsumerPlanPro, "yearly", []string{"MUSUW_PADDLE_PRO_YEARLY_PRICE_ID", "MUSNOW_PADDLE_PRO_YEARLY_PRICE_ID"}},
		{types.ConsumerPlanMax, "monthly", []string{"MUSUW_PADDLE_MAX_MONTHLY_PRICE_ID"}},
		{types.ConsumerPlanMax, "yearly", []string{"MUSUW_PADDLE_MAX_YEARLY_PRICE_ID"}},
	} {
		if price := firstEnv(item.keys...); price != "" {
			if prices[item.plan] == nil {
				prices[item.plan] = map[string]string{}
			}
			prices[item.plan][item.period] = price
		}
	}
	return PaddleConfig{
		Environment:   firstEnv("MUSUW_PADDLE_ENVIRONMENT", "MUSNOW_PADDLE_ENVIRONMENT"),
		APIKey:        firstEnv("MUSUW_PADDLE_API_KEY", "MUSNOW_PADDLE_API_KEY"),
		ClientToken:   firstEnv("MUSUW_PADDLE_CLIENT_TOKEN", "MUSNOW_PADDLE_CLIENT_TOKEN"),
		WebhookSecret: firstEnv("MUSUW_PADDLE_WEBHOOK_SECRET", "MUSNOW_PADDLE_WEBHOOK_SECRET"),
		Prices:        prices,
	}
}

func (c PaddleConfig) PortalConfigured() bool {
	switch strings.ToLower(strings.TrimSpace(c.Environment)) {
	case "sandbox":
		return strings.HasPrefix(c.APIKey, "pdl_sdbx_apikey_")
	case "live":
		return strings.HasPrefix(c.APIKey, "pdl_live_apikey_")
	default:
		return false
	}
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func (c PaddleConfig) Configured() bool {
	environment := strings.ToLower(strings.TrimSpace(c.Environment))
	if c.WebhookSecret == "" || (environment != "sandbox" && environment != "live") {
		return false
	}
	if (environment == "sandbox" && !strings.HasPrefix(c.ClientToken, "test_")) ||
		(environment == "live" && !strings.HasPrefix(c.ClientToken, "live_")) {
		return false
	}
	for _, plan := range []types.ConsumerPlan{types.ConsumerPlanPlus, types.ConsumerPlanPro, types.ConsumerPlanMax} {
		if c.Prices[plan]["monthly"] == "" || c.Prices[plan]["yearly"] == "" {
			return false
		}
	}
	return true
}

func (c PaddleConfig) planForPrice(priceID string) (types.ConsumerPlan, bool) {
	plan, _, ok := c.planAndPeriodForPrice(priceID)
	return plan, ok
}

func (c PaddleConfig) planAndPeriodForPrice(priceID string) (types.ConsumerPlan, string, bool) {
	priceID = strings.TrimSpace(priceID)
	for _, plan := range []types.ConsumerPlan{types.ConsumerPlanPlus, types.ConsumerPlanPro, types.ConsumerPlanMax} {
		for _, period := range []string{"monthly", "yearly"} {
			mapped := c.Prices[plan][period]
			if mapped == priceID {
				return plan, period, true
			}
		}
	}
	return "", "", false
}

func paddleCheckoutBindingWithKey(key []byte, tenantID uint64, priceID string) string {
	if len(key) == 0 {
		return ""
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(fmt.Sprintf("musuw-paddle-checkout-v1\x00%d\x00%s", tenantID, priceID)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (c PaddleConfig) checkoutBinding(tenantID uint64, priceID string) string {
	key := utils.SystemHMACKey()
	if len(key) == 0 {
		// Generic deployments historically used the destination secret. Fixed
		// production always supplies SYSTEM_AES_KEY, so a destination rotation
		// cannot invalidate the long-lived tenant/price binding copied by Paddle.
		key = []byte(c.WebhookSecret)
	}
	return paddleCheckoutBindingWithKey(key, tenantID, priceID)
}

func validEncodedPaddleCheckoutBinding(wantEncoded, gotEncoded string) bool {
	want, err := hex.DecodeString(wantEncoded)
	if err != nil || len(want) == 0 {
		return false
	}
	got, err := hex.DecodeString(strings.TrimSpace(gotEncoded))
	return err == nil && hmac.Equal(want, got)
}

func (c PaddleConfig) validCheckoutBinding(tenantID uint64, priceID, binding string) bool {
	if validEncodedPaddleCheckoutBinding(c.checkoutBinding(tenantID, priceID), binding) {
		return true
	}
	// Accept bindings minted by the prior generic adapter while its original
	// destination secret remains installed. New production bindings use the
	// stable system key and therefore survive destination-secret rotation.
	if len(utils.SystemHMACKey()) > 0 {
		return validEncodedPaddleCheckoutBinding(
			paddleCheckoutBindingWithKey([]byte(c.WebhookSecret), tenantID, priceID),
			binding,
		)
	}
	return false
}

func (c PaddleConfig) billingResponse(tenantID uint64, plan types.ConsumerPlan, portalAvailable bool) gin.H {
	configured := c.Configured() && c.PortalConfigured()
	response := gin.H{
		"configured":       configured,
		"environment":      strings.ToLower(strings.TrimSpace(c.Environment)),
		"portal_available": portalAvailable,
	}
	if !configured || tenantID == 0 {
		return response
	}
	catalog := map[string]map[string]gin.H{}
	for _, paidPlan := range []types.ConsumerPlan{types.ConsumerPlanPlus, types.ConsumerPlanPro, types.ConsumerPlanMax} {
		catalog[string(paidPlan)] = map[string]gin.H{}
		for _, period := range []string{"monthly", "yearly"} {
			catalog[string(paidPlan)][period] = gin.H{"price_id": c.Prices[paidPlan][period]}
		}
	}
	response["client_token"] = c.ClientToken
	response["catalog"] = catalog
	return response
}

func paddleCustomerIDForRetain(value string) string {
	value = strings.TrimSpace(value)
	if len(value) != len("ctm_")+26 || !strings.HasPrefix(value, "ctm_") {
		return ""
	}
	for _, char := range value[len("ctm_"):] {
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') {
			return ""
		}
	}
	return value
}

type paddlePortalSessionCreator interface {
	CreateCustomerPortalSession(context.Context, *paddle.CreateCustomerPortalSessionRequest) (*paddle.CustomerPortalSession, error)
}

type paddleSubscriptionUpdater interface {
	GetSubscription(context.Context, *paddle.GetSubscriptionRequest) (*paddle.Subscription, error)
	PreviewSubscriptionUpdate(context.Context, *paddle.PreviewSubscriptionUpdateRequest) (*paddle.SubscriptionPreview, error)
	UpdateSubscription(context.Context, *paddle.UpdateSubscriptionRequest) (*paddle.Subscription, error)
}

type paddleTransactionClient interface {
	CreateTransaction(context.Context, *paddle.CreateTransactionRequest) (*paddle.Transaction, error)
	GetTransaction(context.Context, *paddle.GetTransactionRequest) (*paddle.Transaction, error)
	UpdateTransaction(context.Context, *paddle.UpdateTransactionRequest) (*paddle.Transaction, error)
	ListTransactions(context.Context, *paddle.ListTransactionsRequest) (*paddle.Collection[*paddle.Transaction], error)
}

type EntitlementHandler struct {
	prices        paddleMarketplacePriceReader
	marketplace   *MarketplaceHandler
	service       interfaces.EntitlementService
	paddle        PaddleConfig
	portal        paddlePortalSessionCreator
	subscriptions paddleSubscriptionUpdater
	transactions  paddleTransactionClient
	tasks         interfaces.TaskEnqueuer
	operations    interfaces.PaddleBillingOperationRepository
}

func NewEntitlementHandler(service interfaces.EntitlementService, tasks interfaces.TaskEnqueuer, operations interfaces.PaddleBillingOperationRepository) *EntitlementHandler {
	config := loadPaddleConfig()
	handler := &EntitlementHandler{service: service, paddle: config, tasks: tasks, operations: operations}
	if !config.PortalConfigured() {
		return handler
	}
	var (
		sdk *paddle.SDK
		err error
	)
	if strings.EqualFold(config.Environment, "sandbox") {
		sdk, err = paddle.NewSandbox(config.APIKey)
	} else {
		sdk, err = paddle.New(config.APIKey)
	}
	if err != nil {
		logger.Errorf(context.Background(), "Paddle client initialization failed: %v", err)
		return handler
	}
	handler.portal = sdk
	handler.subscriptions = sdk
	handler.transactions = sdk
	handler.prices = sdk
	return handler
}

func (h *EntitlementHandler) Current(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	current, err := h.service.Current(c.Request.Context(), time.Now())
	if err != nil {
		_ = c.Error(err)
		return
	}
	tenantID, _ := types.TenantIDFromContext(c.Request.Context())
	portalAvailable := h.portal != nil && strings.TrimSpace(current.PaddleCustomerID) != ""
	billing := h.paddle.billingResponse(tenantID, current.Plan, portalAvailable)
	// Keep a stable, non-sensitive recovery signal for the plans UI. A tenant
	// whose effective plan has fallen back to Free during Paddle dunning must
	// still be sent to the customer portal instead of starting a second
	// checkout. Paid entitlements retain the existing customer-portal behavior
	// even if an older record does not have a subscription id.
	subscriptionID := strings.TrimSpace(current.PaddleSubscriptionID)
	effectivePlan := types.NormalizeConsumerPlan(current.Plan)
	canManageBilling := portalAvailable && (effectivePlan != types.ConsumerPlanFree ||
		(subscriptionID != "" && !strings.EqualFold(strings.TrimSpace(current.PlanStatus), "canceled")))
	billing["can_manage_billing"] = canManageBilling
	if customerID := paddleCustomerIDForRetain(current.PaddleCustomerID); tenantID != 0 && customerID != "" && h.paddle.Configured() && h.paddle.PortalConfigured() {
		// Paddle Retain requires the authenticated customer's Paddle ID in the
		// browser. This value is derived from signed provider state, never from
		// request input, and grants no billing or entitlement authority.
		billing["pw_customer_id"] = customerID
	}
	c.JSON(http.StatusOK, gin.H{"data": current, "billing": billing})
}

// PaddlePublicConfig exposes only the client-side values required to
// initialize Paddle.js on Paddle's public default-payment-link page.
func (h *EntitlementHandler) PaddlePublicConfig(c *gin.Context) {
	environment := strings.ToLower(strings.TrimSpace(h.paddle.Environment))
	clientToken := strings.TrimSpace(h.paddle.ClientToken)
	configured := h.paddle.Configured() && h.paddle.PortalConfigured() &&
		((environment == "sandbox" && len(clientToken) > len("test_")) ||
			(environment == "live" && len(clientToken) > len("live_")))
	c.Header("Cache-Control", "no-store")
	if !configured {
		c.JSON(http.StatusOK, gin.H{"configured": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"configured":   true,
		"environment":  environment,
		"client_token": clientToken,
	})
}

func (h *EntitlementHandler) PaddlePortalSession(c *gin.Context) {
	tenantID, ok := types.TenantIDFromContext(c.Request.Context())
	if !ok || tenantID == 0 {
		_ = c.Error(apperrors.NewUnauthorizedError("authentication required"))
		return
	}
	if h.portal == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle customer portal is not configured"))
		return
	}
	current, err := h.service.Current(c.Request.Context(), time.Now())
	if err != nil {
		_ = c.Error(err)
		return
	}
	customerID := strings.TrimSpace(current.PaddleCustomerID)
	if customerID == "" {
		_ = c.Error(apperrors.NewBadRequestError("Paddle customer is unavailable"))
		return
	}
	request := &paddle.CreateCustomerPortalSessionRequest{CustomerID: customerID}
	if subscriptionID := strings.TrimSpace(current.PaddleSubscriptionID); subscriptionID != "" {
		request.SubscriptionIDs = []string{subscriptionID}
	}
	session, err := h.portal.CreateCustomerPortalSession(c.Request.Context(), request)
	if err != nil {
		logger.Errorf(c.Request.Context(), "Paddle portal session creation failed tenant_id=%d: %v", tenantID, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle customer portal is temporarily unavailable"))
		return
	}
	if session == nil {
		logger.Errorf(c.Request.Context(), "Paddle portal session returned an empty response tenant_id=%d", tenantID)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle customer portal is temporarily unavailable"))
		return
	}
	overview := strings.TrimSpace(session.URLs.General.Overview)
	parsed, parseErr := url.Parse(overview)
	if parseErr != nil || parsed.Scheme != "https" || parsed.Host == "" {
		logger.Errorf(c.Request.Context(), "Paddle portal session returned an invalid overview URL tenant_id=%d", tenantID)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle customer portal is temporarily unavailable"))
		return
	}
	// Reuse the HTTP logger's existing authorization_url redaction. This URL
	// contains a temporary bearer token and must never appear in access logs.
	c.JSON(http.StatusOK, gin.H{"authorization_url": overview})
}

type paddleSubscriptionUpgradeRequest struct {
	Plan         types.ConsumerPlan `json:"plan" binding:"required"`
	OperationKey string             `json:"operation_key"`
}

type paddleCheckoutIntentRequest struct {
	Plan          types.ConsumerPlan `json:"plan" binding:"required"`
	BillingPeriod string             `json:"billing_period" binding:"required"`
	OperationKey  string             `json:"operation_key"`
}

func validPaddleOperationKey(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) < 16 || len(value) > 128 {
		return false
	}
	for _, char := range value {
		if !((char >= '0' && char <= '9') ||
			(char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			char == '-' || char == '_') {
			return false
		}
	}
	return true
}

func paddleBillingOperationFingerprint(operationType types.PaddleBillingOperationType, plan types.ConsumerPlan, period, priceID, subscriptionID string) string {
	canonical := strings.Join([]string{string(operationType), string(plan), period, priceID, subscriptionID}, "\x00")
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:])
}

func paddleReconciliationEventID(operation *types.PaddleBillingOperation, providerUpdatedAt string) string {
	if operation == nil {
		return ""
	}
	sum := sha256.Sum256([]byte(strings.Join([]string{
		"musuw-paddle-reconcile-v1", strconv.FormatUint(operation.TenantID, 10),
		operation.OperationKey, strings.TrimSpace(providerUpdatedAt),
	}, "\x00")))
	// Keep the durable event ID below the existing VARCHAR(64) contract.
	return "reconcile_" + hex.EncodeToString(sum[:24])
}

func samePaddleBillingOperation(operation *types.PaddleBillingOperation, intent types.PaddleBillingOperationIntent) bool {
	if operation == nil {
		return false
	}
	// Rows created before request_fingerprint was introduced are still bound by
	// the same immutable fields. Treat only an empty legacy fingerprint as
	// compatible; a populated mismatch is always a conflict.
	fingerprintMatches := operation.RequestFingerprint == "" || intent.RequestFingerprint == "" ||
		operation.RequestFingerprint == intent.RequestFingerprint
	// A second browser tab may use another operation key for the same immutable
	// provider intent. Reuse that one active operation instead of creating or
	// canceling equivalent Paddle work; its original key remains authoritative.
	return operation.OperationType == intent.OperationType &&
		fingerprintMatches && operation.Plan == intent.Plan &&
		operation.BillingPeriod == intent.BillingPeriod && operation.PriceID == intent.PriceID &&
		operation.SubscriptionID == intent.SubscriptionID
}

func paddleRequestDefinitelyRejected(err error) bool {
	if err == nil {
		return false
	}
	var providerErr *paddleerr.Error
	if !errors.As(err, &providerErr) {
		return false
	}
	// Only an explicit non-retryable HTTP response proves rejection. The SDK
	// also emits status 0 for malformed 502 responses, so status 0 must remain
	// uncertain even when the error has Paddle's typed shape.
	switch providerErr.Status {
	case http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity:
		return true
	case http.StatusConflict:
		// Paddle uses these conflict codes for deterministic subscription
		// locking states. The requested update was not accepted and is safe to
		// release; an unknown 409 may still represent an accepted write.
		switch strings.ToLower(strings.TrimSpace(providerErr.Code)) {
		case "subscription_locked_processing", "subscription_locked_pending_changes":
			return true
		default:
			return false
		}
	default:
		// 408/425/429 and every 5xx remain uncertain. Conservatively treating
		// them as possibly accepted is cheaper than creating a duplicate charge.
		return false
	}
}

func paddleCustomDataString(data paddle.CustomData, key string) string {
	value, _ := data[key].(string)
	return strings.TrimSpace(value)
}

func (h *EntitlementHandler) paddleTransactionMatchesOperation(
	transaction *paddle.Transaction,
	operation *types.PaddleBillingOperation,
	origin paddle.TransactionOrigin,
) bool {
	if transaction == nil || operation == nil || transaction.Origin != origin || len(transaction.Items) != 1 ||
		transaction.Items[0].Quantity != 1 || strings.TrimSpace(transaction.Items[0].Price.ID) != strings.TrimSpace(operation.PriceID) {
		return false
	}
	if paddleCustomDataString(transaction.CustomData, "tenant_id") != strconv.FormatUint(operation.TenantID, 10) ||
		paddleCustomDataString(transaction.CustomData, "musuw_billing_operation_key") != strings.TrimSpace(operation.OperationKey) ||
		!h.paddle.validCheckoutBinding(operation.TenantID, operation.PriceID, paddleCustomDataString(transaction.CustomData, "musuw_checkout_binding")) {
		return false
	}
	if operation.OperationType == types.PaddleBillingOperationUpgrade {
		return transaction.SubscriptionID != nil && strings.TrimSpace(*transaction.SubscriptionID) == strings.TrimSpace(operation.SubscriptionID)
	}
	return true
}

// findPaddleOperationTransactions implements Paddle's documented recovery
// rule for non-idempotent API calls: list provider entities before retrying.
// It reads at most a bounded recent window and accepts only the exact
// server-generated operation key, tenant MAC, catalog price, and provider
// relationship. No local timer guesses that a Paddle write succeeded.
func (h *EntitlementHandler) findPaddleOperationTransactions(
	ctx context.Context,
	operation *types.PaddleBillingOperation,
	origin paddle.TransactionOrigin,
) ([]*paddle.Transaction, error) {
	if h.transactions == nil || operation == nil {
		return nil, errors.New("Paddle transaction inventory is unavailable")
	}
	orderBy := "created_at[DESC]"
	perPage := 30
	request := &paddle.ListTransactionsRequest{
		Origin:  []string{string(origin)},
		OrderBy: &orderBy,
		PerPage: &perPage,
	}
	if operation.OperationType == types.PaddleBillingOperationUpgrade && strings.TrimSpace(operation.SubscriptionID) != "" {
		request.SubscriptionID = []string{strings.TrimSpace(operation.SubscriptionID)}
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	collection, err := h.transactions.ListTransactions(providerCtx, request)
	if err != nil || collection == nil {
		if err == nil {
			err = errors.New("Paddle returned no transaction collection")
		}
		return nil, err
	}

	var matches []*paddle.Transaction
	oldestRelevant := operation.CreatedAt.UTC().Add(-5 * time.Minute)
	err = collection.Iter(providerCtx, func(transaction *paddle.Transaction) (bool, error) {
		if transaction == nil {
			return true, nil
		}
		if !operation.CreatedAt.IsZero() {
			createdAt, parseErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(transaction.CreatedAt))
			if parseErr != nil {
				return false, fmt.Errorf("parse Paddle transaction created_at: %w", parseErr)
			}
			if createdAt.Before(oldestRelevant) {
				return false, nil
			}
		}
		if h.paddleTransactionMatchesOperation(transaction, operation, origin) {
			matches = append(matches, transaction)
			if len(matches) > 1 {
				return false, nil
			}
		}
		return true, nil
	})
	if err != nil {
		return nil, err
	}
	if len(matches) > 1 {
		return nil, errors.New("multiple Paddle transactions matched one billing operation")
	}
	return matches, nil
}

func paddleBillingOperationReadyForRecovery(operation *types.PaddleBillingOperation, delay time.Duration) bool {
	if operation == nil {
		return false
	}
	anchor := operation.UpdatedAt
	if anchor.IsZero() {
		anchor = operation.CreatedAt
	}
	return !anchor.IsZero() && time.Since(anchor.UTC()) >= delay
}

func (h *EntitlementHandler) recoverMissingPaddleCheckoutTransaction(ctx context.Context, operation *types.PaddleBillingOperation) (string, error) {
	if operation == nil || operation.OperationType != types.PaddleBillingOperationCheckout {
		return "", apperrors.NewConflictError("checkout operation cannot be recovered")
	}
	if !paddleBillingOperationReadyForRecovery(operation, paddleCheckoutRecoveryDelay) {
		return "", apperrors.NewServiceUnavailableError("Paddle checkout is being prepared; retry shortly")
	}
	matches, err := h.findPaddleOperationTransactions(ctx, operation, paddle.TransactionOriginAPI)
	if err != nil {
		return "", apperrors.NewServiceUnavailableError("Paddle checkout reconciliation is temporarily unavailable")
	}
	if len(matches) == 1 {
		transactionID := strings.TrimSpace(matches[0].ID)
		if transactionID == "" || h.operations.RecordPaddleTransaction(ctx, operation.ID, transactionID) != nil {
			return "", apperrors.NewServiceUnavailableError("Paddle checkout reconciliation is temporarily unavailable")
		}
		operation.PaddleTransactionID = transactionID
		return h.reconcilePaddleCheckoutTransaction(ctx, operation)
	}
	// After the recovery delay, the exhaustive official inventory is the
	// documented retry boundary for Paddle mutations without an idempotency
	// key. No exact transaction means this operation cannot be resumed safely;
	// release it so a new checkout intent can be created. A concurrent signed
	// event may win the row lock first, in which case Finish returns an error
	// and the caller keeps the operation recoverable instead of opening a
	// second checkout.
	if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "Paddle checkout was not found after exhaustive recovery"); err != nil {
		return "", apperrors.NewServiceUnavailableError("Paddle checkout reconciliation is temporarily unavailable")
	}
	return "", apperrors.NewConflictError("Paddle checkout was not found; retry with a new operation")
}

func (h *EntitlementHandler) cancelUnpaidPaddleCheckout(ctx context.Context, operation *types.PaddleBillingOperation) error {
	if operation == nil || operation.OperationType != types.PaddleBillingOperationCheckout || strings.TrimSpace(operation.PaddleTransactionID) == "" {
		return apperrors.NewConflictError("another billing operation is already in progress")
	}
	// Re-read the durable operation immediately before touching Paddle. The
	// caller may be holding a stale snapshot that was already settled by a
	// signed webhook or another tab; terminal operations must never be
	// canceled, even when their old provider transaction is still draft.
	current, found, findErr := h.operations.FindByKey(ctx, operation.TenantID, operation.OperationKey)
	if findErr != nil {
		return apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable")
	}
	if !found || current == nil ||
		(current.Status != types.PaddleBillingOperationPending && current.Status != types.PaddleBillingOperationInFlight && current.Status != types.PaddleBillingOperationUncertain) ||
		strings.TrimSpace(current.PaddleTransactionID) != strings.TrimSpace(operation.PaddleTransactionID) {
		return apperrors.NewConflictError("another billing operation is already in progress")
	}
	operation = current
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	transaction, err := h.transactions.GetTransaction(providerCtx, &paddle.GetTransactionRequest{TransactionID: operation.PaddleTransactionID})
	if err != nil || transaction == nil || strings.TrimSpace(transaction.ID) != strings.TrimSpace(operation.PaddleTransactionID) {
		_ = h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationUncertain, `{}`, "previous checkout state could not be confirmed")
		return apperrors.NewServiceUnavailableError("the previous Paddle checkout is still being reconciled")
	}
	if transaction.Status == paddle.TransactionStatusCanceled {
		if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "previous Paddle checkout was already canceled"); err != nil {
			return apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable")
		}
		return nil
	}
	if transaction.Status != paddle.TransactionStatusDraft && transaction.Status != paddle.TransactionStatusReady {
		// Completed or otherwise finalizing transactions must wait for Paddle's
		// signed subscription event; never replace them with a second checkout.
		return apperrors.NewServiceUnavailableError("the previous Paddle checkout is being finalized")
	}
	// Close the remaining local TOCTOU window after the provider read. A signed
	// event may have completed the operation while GetTransaction was in flight;
	// never issue a cancellation from that stale snapshot.
	current, found, findErr = h.operations.FindByKey(ctx, operation.TenantID, operation.OperationKey)
	if findErr != nil {
		return apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable")
	}
	if !found || current == nil ||
		(current.Status != types.PaddleBillingOperationPending && current.Status != types.PaddleBillingOperationInFlight && current.Status != types.PaddleBillingOperationUncertain) ||
		strings.TrimSpace(current.PaddleTransactionID) != strings.TrimSpace(operation.PaddleTransactionID) {
		return apperrors.NewConflictError("another billing operation is already in progress")
	}
	cancelStatus := paddle.TransactionStatusCanceled
	transaction, err = h.transactions.UpdateTransaction(providerCtx, &paddle.UpdateTransactionRequest{
		TransactionID: operation.PaddleTransactionID,
		Status:        paddle.NewPatchField(cancelStatus),
	})
	if err != nil || transaction == nil || transaction.Status != paddle.TransactionStatusCanceled {
		// A concurrent caller may have canceled the same draft after our initial
		// read. Confirm the official state before treating this as an unknown
		// outcome; a canceled transaction is safe to replace exactly once.
		confirmCtx, confirmCancel := context.WithTimeout(ctx, paddleMutationTimeout)
		confirmed, confirmErr := h.transactions.GetTransaction(confirmCtx, &paddle.GetTransactionRequest{TransactionID: operation.PaddleTransactionID})
		confirmCancel()
		if confirmErr == nil && confirmed != nil &&
			strings.TrimSpace(confirmed.ID) == strings.TrimSpace(operation.PaddleTransactionID) &&
			confirmed.Status == paddle.TransactionStatusCanceled {
			if finishErr := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "previous Paddle checkout was canceled"); finishErr != nil {
				return apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable")
			}
			return nil
		}
		_ = h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationUncertain, `{}`, "previous checkout cancellation was not confirmed")
		return apperrors.NewServiceUnavailableError("the previous Paddle checkout is still being reconciled")
	}
	if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "replaced by another unpaid checkout selection"); err != nil {
		return apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable")
	}
	return nil
}

func (h *EntitlementHandler) reconcilePaddleCheckoutTransaction(ctx context.Context, operation *types.PaddleBillingOperation) (string, error) {
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	transaction, err := h.transactions.GetTransaction(providerCtx, &paddle.GetTransactionRequest{TransactionID: operation.PaddleTransactionID})
	if err != nil || transaction == nil || strings.TrimSpace(transaction.ID) != strings.TrimSpace(operation.PaddleTransactionID) {
		return "", apperrors.NewServiceUnavailableError("Paddle checkout reconciliation is temporarily unavailable")
	}
	switch transaction.Status {
	case paddle.TransactionStatusDraft, paddle.TransactionStatusReady, paddle.TransactionStatusPastDue:
		// A declined initial payment leaves Paddle's provider-owned transaction
		// past_due. Reopening that exact transaction lets the customer correct the
		// payment method without creating a duplicate checkout or granting access.
		// Only the later signed subscription event can activate entitlement.
		return strings.TrimSpace(transaction.ID), nil
	case paddle.TransactionStatusCanceled:
		_ = h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "Paddle checkout transaction is canceled")
		return "", apperrors.NewConflictError("Paddle checkout was canceled; retry with a new operation")
	default:
		// A paid/completed transaction must wait for its signed subscription
		// event. Returning it to Checkout could never grant entitlement sooner.
		return "", apperrors.NewServiceUnavailableError("Paddle checkout is being finalized")
	}
}

func (h *EntitlementHandler) PaddleCheckoutIntent(c *gin.Context) {
	tenantID, ok := types.TenantIDFromContext(c.Request.Context())
	if !ok || tenantID == 0 {
		_ = c.Error(apperrors.NewUnauthorizedError("authentication required"))
		return
	}
	if !h.paddle.Configured() || !h.paddle.PortalConfigured() || h.transactions == nil || h.operations == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is not configured"))
		return
	}
	var request paddleCheckoutIntentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		_ = c.Error(apperrors.NewBadRequestError("a paid plan and billing period are required"))
		return
	}
	request.Plan = types.NormalizeConsumerPlan(request.Plan)
	request.BillingPeriod = strings.ToLower(strings.TrimSpace(request.BillingPeriod))
	request.OperationKey = strings.TrimSpace(request.OperationKey)
	if request.Plan == types.ConsumerPlanFree || request.BillingPeriod != "monthly" && request.BillingPeriod != "yearly" || !validPaddleOperationKey(request.OperationKey) {
		_ = c.Error(apperrors.NewBadRequestError("a paid plan and billing period are required"))
		return
	}
	current, err := h.service.Current(c.Request.Context(), time.Now())
	if err != nil {
		_ = c.Error(err)
		return
	}
	// A complimentary overlay is not a Paddle subscription. Keep checkout open
	// so a gifted user can purchase normally; the signed activation will clear
	// the overlay atomically. Any real/current Paddle entitlement still blocks a
	// second checkout exactly as before.
	if (current.Plan != types.ConsumerPlanFree && current.PlanSource != "complimentary") ||
		(strings.TrimSpace(current.PaddleSubscriptionID) != "" && current.PlanStatus != "canceled") {
		_ = c.Error(apperrors.NewConflictError("an existing paid subscription must be managed instead of opening another checkout"))
		return
	}
	priceID := strings.TrimSpace(h.paddle.Prices[request.Plan][request.BillingPeriod])
	if priceID == "" {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle price is not configured"))
		return
	}
	intent := types.PaddleBillingOperationIntent{
		TenantID: tenantID, OperationKey: request.OperationKey,
		OperationType: types.PaddleBillingOperationCheckout, Plan: request.Plan,
		BillingPeriod: request.BillingPeriod, PriceID: priceID,
	}
	intent.RequestFingerprint = paddleBillingOperationFingerprint(intent.OperationType, intent.Plan, intent.BillingPeriod, intent.PriceID, "")
	operation, disposition, err := h.operations.Claim(c.Request.Context(), intent)
	if errors.Is(err, interfaces.ErrPaddleBillingOperationKeyConflict) {
		_ = c.Error(apperrors.NewConflictError("checkout operation key was already used for another request"))
		return
	}
	if err != nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
		return
	}
	if !samePaddleBillingOperation(operation, intent) {
		// A newly selected plan replaces only an unpaid provider transaction.
		// Paddle performs the cancellation; Musuw never cancels a subscription.
		if disposition != types.PaddleBillingOperationClaimActive {
			_ = c.Error(apperrors.NewConflictError("another billing operation is already in progress"))
			return
		}
		if operation.Status == types.PaddleBillingOperationPending && strings.TrimSpace(operation.PaddleTransactionID) == "" {
			// Pending proves no provider write started. A process may have stopped
			// between the local claim and MarkInFlight, so release that empty claim
			// instead of making a different plan permanently unreachable. The
			// predicate is evaluated under the row lock so a concurrent caller
			// cannot be mistaken for a pre-call pending operation.
			released, finishErr := h.operations.FailPendingWithoutProviderWrite(c.Request.Context(), operation.ID, "checkout selection changed before Paddle was called")
			if finishErr != nil {
				_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
				return
			}
			if !released {
				_ = c.Error(apperrors.NewConflictError("another billing operation is already in progress"))
				return
			}
		} else {
			if strings.TrimSpace(operation.PaddleTransactionID) == "" &&
				(operation.Status == types.PaddleBillingOperationInFlight || operation.Status == types.PaddleBillingOperationUncertain) {
				transactionID, recoverErr := h.recoverMissingPaddleCheckoutTransaction(c.Request.Context(), operation)
				if recoverErr != nil {
					_ = c.Error(recoverErr)
					return
				}
				operation.PaddleTransactionID = transactionID
			}
			if cancelErr := h.cancelUnpaidPaddleCheckout(c.Request.Context(), operation); cancelErr != nil {
				_ = c.Error(cancelErr)
				return
			}
		}
		operation, disposition, err = h.operations.Claim(c.Request.Context(), intent)
		if err != nil || !samePaddleBillingOperation(operation, intent) || disposition != types.PaddleBillingOperationClaimCreated {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
			return
		}
	}
	if transactionID := strings.TrimSpace(operation.PaddleTransactionID); transactionID != "" {
		if operation.Status == types.PaddleBillingOperationPending || operation.Status == types.PaddleBillingOperationInFlight || operation.Status == types.PaddleBillingOperationUncertain {
			// Existing retries always verify the provider transaction. This keeps an
			// abandoned, provider-canceled checkout from occupying the tenant slot
			// forever while still reusing every live transaction across tabs.
			if disposition != types.PaddleBillingOperationClaimCreated || operation.Status == types.PaddleBillingOperationUncertain {
				reconciledID, reconcileErr := h.reconcilePaddleCheckoutTransaction(c.Request.Context(), operation)
				if reconcileErr != nil {
					_ = c.Error(reconcileErr)
					return
				}
				transactionID = reconciledID
			}
			c.JSON(http.StatusOK, gin.H{"transaction_id": transactionID, "pending": true})
			return
		}
		_ = c.Error(apperrors.NewConflictError("checkout operation is already complete"))
		return
	}
	if operation.Status == types.PaddleBillingOperationInFlight || operation.Status == types.PaddleBillingOperationUncertain {
		transactionID, recoverErr := h.recoverMissingPaddleCheckoutTransaction(c.Request.Context(), operation)
		if recoverErr != nil {
			_ = c.Error(recoverErr)
			return
		}
		c.JSON(http.StatusOK, gin.H{"transaction_id": transactionID, "pending": true})
		return
	}
	// A process may stop after Claim commits but before the provider request is
	// started. Pending is the only existing state that is safe to resume: the
	// atomic transition below elects exactly one caller to perform the write.
	if disposition != types.PaddleBillingOperationClaimCreated && operation.Status != types.PaddleBillingOperationPending {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is being prepared; retry shortly"))
		return
	}
	started, err := h.operations.MarkInFlight(c.Request.Context(), operation.ID)
	if err != nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
		return
	}
	if !started {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is being prepared; retry shortly"))
		return
	}
	providerCtx, cancel := context.WithTimeout(c.Request.Context(), paddleMutationTimeout)
	defer cancel()
	transaction, err := h.transactions.CreateTransaction(providerCtx, &paddle.CreateTransactionRequest{
		Items: []paddle.CreateTransactionItems{*paddle.NewCreateTransactionItemsTransactionItemFromCatalog(&paddle.TransactionItemFromCatalog{
			PriceID: priceID, Quantity: 1,
		})},
		CustomData: paddle.CustomData{
			"tenant_id":                   strconv.FormatUint(tenantID, 10),
			"musuw_checkout_binding":      h.paddle.checkoutBinding(tenantID, priceID),
			"musuw_billing_operation_key": operation.OperationKey,
		},
	})
	if err != nil || transaction == nil || strings.TrimSpace(transaction.ID) == "" ||
		(transaction.Status != paddle.TransactionStatusDraft && transaction.Status != paddle.TransactionStatusReady) {
		failure := "Paddle returned an incomplete checkout transaction"
		if err != nil {
			failure = err.Error()
		}
		status := types.PaddleBillingOperationUncertain
		if paddleRequestDefinitelyRejected(err) {
			status = types.PaddleBillingOperationFailed
		}
		// Paddle exposes no client idempotency key for CreateTransaction. Unknown
		// network outcomes stay occupied until official inventory or the exact
		// signed subscription.created event identifies the provider transaction.
		_ = h.operations.Finish(c.Request.Context(), operation.ID, status, `{}`, failure)
		logger.Errorf(c.Request.Context(), "Paddle checkout transaction creation failed tenant_id=%d: %v", tenantID, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
		return
	}
	transactionID := strings.TrimSpace(transaction.ID)
	if err := h.operations.RecordPaddleTransaction(c.Request.Context(), operation.ID, transactionID); err != nil {
		// The provider write succeeded, so its outcome must never be "repaired"
		// with a second provider mutation. A signed subscription event can bind
		// the still-empty operation directly, and the official transaction
		// inventory is the recovery path if the HTTP response was not persisted.
		// Keeping the tenant slot occupied is deliberately fail-closed and avoids
		// racing a payment that may already be completing in Paddle Checkout.
		_ = h.operations.Finish(c.Request.Context(), operation.ID, types.PaddleBillingOperationUncertain, `{}`, "checkout transaction was created but its ID could not be persisted")
		logger.Errorf(c.Request.Context(), "Paddle checkout transaction persistence failed tenant_id=%d: %v", tenantID, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle checkout is temporarily unavailable"))
		return
	}
	// Paddle owns payment collection. Musuw exposes exactly one provider-owned
	// transaction; only the signed subscription webhook grants entitlement.
	c.JSON(http.StatusOK, gin.H{"transaction_id": transactionID, "pending": true})
}

type paddleSubscriptionUpgradeTarget struct {
	plan           types.ConsumerPlan
	period         string
	priceID        string
	subscriptionID string
}

func paddleSubscriptionHasOneRecurringItem(subscription *paddle.Subscription) bool {
	return subscription != nil && len(subscription.Items) == 1 &&
		subscription.Items[0].Quantity == 1 && subscription.Items[0].Recurring
}

func consumerPlanRank(plan types.ConsumerPlan) int {
	switch plan {
	case types.ConsumerPlanPlus:
		return 1
	case types.ConsumerPlanPro:
		return 2
	case types.ConsumerPlanMax:
		return 3
	default:
		return 0
	}
}

func (h *EntitlementHandler) paddleSubscriptionUpgradeTarget(ctx context.Context, tenantID uint64, targetPlan types.ConsumerPlan) (*paddleSubscriptionUpgradeTarget, error) {
	if h.subscriptions == nil || !h.paddle.Configured() {
		return nil, apperrors.NewServiceUnavailableError("Paddle subscription upgrades are not configured")
	}
	current, err := h.service.Current(ctx, time.Now())
	if err != nil {
		return nil, err
	}
	currentPlan := current.Plan
	if consumerPlanRank(currentPlan) == 0 || consumerPlanRank(targetPlan) <= consumerPlanRank(currentPlan) {
		return nil, apperrors.NewBadRequestError("target plan must be higher than the current paid plan")
	}
	if !strings.EqualFold(strings.TrimSpace(current.PlanStatus), string(paddle.SubscriptionStatusActive)) {
		return nil, apperrors.NewBadRequestError("only active subscriptions can be upgraded")
	}
	customerID := strings.TrimSpace(current.PaddleCustomerID)
	subscriptionID := strings.TrimSpace(current.PaddleSubscriptionID)
	if customerID == "" || subscriptionID == "" {
		return nil, apperrors.NewBadRequestError("Paddle subscription is unavailable")
	}
	subscription, err := h.subscriptions.GetSubscription(ctx, &paddle.GetSubscriptionRequest{SubscriptionID: subscriptionID})
	if err != nil {
		logger.Errorf(ctx, "Paddle subscription lookup failed tenant_id=%d: %v", tenantID, err)
		return nil, apperrors.NewServiceUnavailableError("Paddle subscription is temporarily unavailable")
	}
	if subscription == nil || strings.TrimSpace(subscription.ID) != subscriptionID || strings.TrimSpace(subscription.CustomerID) != customerID {
		return nil, apperrors.NewConflictError("Paddle subscription ownership does not match the authenticated account")
	}
	if subscription.Status != paddle.SubscriptionStatusActive || !paddleSubscriptionHasOneRecurringItem(subscription) {
		return nil, apperrors.NewBadRequestError("Paddle subscription cannot be upgraded automatically")
	}
	providerPlan, period, ok := h.paddle.planAndPeriodForPrice(subscription.Items[0].Price.ID)
	if !ok || providerPlan != currentPlan {
		return nil, apperrors.NewConflictError("Paddle subscription does not match the current plan")
	}
	priceID := strings.TrimSpace(h.paddle.Prices[targetPlan][period])
	if priceID == "" {
		return nil, apperrors.NewServiceUnavailableError("target Paddle price is not configured")
	}
	return &paddleSubscriptionUpgradeTarget{plan: targetPlan, period: period, priceID: priceID, subscriptionID: subscriptionID}, nil
}

func paddlePreviewUpgradeRequest(tenantID uint64, config PaddleConfig, target *paddleSubscriptionUpgradeTarget) *paddle.PreviewSubscriptionUpdateRequest {
	items := []paddle.PreviewSubscriptionUpdateItems{*paddle.NewPreviewSubscriptionUpdateItemsSubscriptionUpdateItemFromCatalog(&paddle.SubscriptionUpdateItemFromCatalog{
		PriceID:  target.priceID,
		Quantity: 1,
	})}
	customData := paddle.CustomData{
		"tenant_id":              strconv.FormatUint(tenantID, 10),
		"musuw_checkout_binding": config.checkoutBinding(tenantID, target.priceID),
	}
	return &paddle.PreviewSubscriptionUpdateRequest{
		SubscriptionID:       target.subscriptionID,
		Items:                paddle.NewPatchField(items),
		CustomData:           paddle.NewPatchField(customData),
		ProrationBillingMode: paddle.NewPatchField(paddle.ProrationBillingModeProratedImmediately),
		OnPaymentFailure:     paddle.NewPatchField(paddle.SubscriptionOnPaymentFailurePreventChange),
	}
}

func paddleApplyUpgradeRequest(tenantID uint64, config PaddleConfig, target *paddleSubscriptionUpgradeTarget, operationKey string) *paddle.UpdateSubscriptionRequest {
	items := []paddle.UpdateSubscriptionItems{*paddle.NewUpdateSubscriptionItemsSubscriptionUpdateItemFromCatalog(&paddle.SubscriptionUpdateItemFromCatalog{
		PriceID:  target.priceID,
		Quantity: 1,
	})}
	customData := paddle.CustomData{
		"tenant_id":                   strconv.FormatUint(tenantID, 10),
		"musuw_checkout_binding":      config.checkoutBinding(tenantID, target.priceID),
		"musuw_billing_operation_key": strings.TrimSpace(operationKey),
	}
	return &paddle.UpdateSubscriptionRequest{
		SubscriptionID:       target.subscriptionID,
		Items:                paddle.NewPatchField(items),
		CustomData:           paddle.NewPatchField(customData),
		ProrationBillingMode: paddle.NewPatchField(paddle.ProrationBillingModeProratedImmediately),
		OnPaymentFailure:     paddle.NewPatchField(paddle.SubscriptionOnPaymentFailurePreventChange),
	}
}

func (h *EntitlementHandler) reconcilePaddleUpgradeOperation(ctx context.Context, tenantID uint64, operation *types.PaddleBillingOperation) error {
	if operation == nil || operation.OperationType != types.PaddleBillingOperationUpgrade || operation.TenantID != tenantID {
		return apperrors.NewConflictError("subscription upgrade operation does not match this account")
	}
	switch operation.Status {
	case types.PaddleBillingOperationSucceeded:
		return nil
	case types.PaddleBillingOperationFailed:
		return apperrors.NewConflictError("subscription upgrade did not complete; retry with a new operation")
	case types.PaddleBillingOperationPending, types.PaddleBillingOperationInFlight, types.PaddleBillingOperationUncertain:
	default:
		return apperrors.NewConflictError("subscription upgrade operation is invalid")
	}
	if h.subscriptions == nil {
		return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is unavailable")
	}
	current, err := h.service.Current(ctx, time.Now())
	if err != nil {
		return err
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	subscription, err := h.subscriptions.GetSubscription(providerCtx, &paddle.GetSubscriptionRequest{SubscriptionID: operation.SubscriptionID})
	if err != nil {
		return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
	}
	if subscription == nil || strings.TrimSpace(subscription.ID) != operation.SubscriptionID ||
		strings.TrimSpace(current.PaddleSubscriptionID) != operation.SubscriptionID ||
		strings.TrimSpace(subscription.CustomerID) != strings.TrimSpace(current.PaddleCustomerID) || !paddleSubscriptionHasOneRecurringItem(subscription) {
		return apperrors.NewConflictError("Paddle subscription no longer matches this account")
	}
	if subscription.Status != paddle.SubscriptionStatusActive {
		_ = h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "Paddle subscription is no longer active")
		return apperrors.NewConflictError("Paddle subscription is no longer active")
	}
	providerPriceID := strings.TrimSpace(subscription.Items[0].Price.ID)
	if providerPriceID == operation.PriceID {
		providerUpdatedAt, parseErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(subscription.UpdatedAt))
		if parseErr != nil {
			return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
		}
		providerPlan, providerPeriod, known := h.paddle.planAndPeriodForPrice(providerPriceID)
		if !known || providerPlan != operation.Plan || providerPeriod != operation.BillingPeriod {
			return apperrors.NewConflictError("Paddle subscription price cannot be reconciled automatically")
		}
		// The authenticated Paddle API is an authoritative full subscription
		// snapshot. Reuse the one entitlement path before releasing the local
		// operation, so a lost/exhausted webhook cannot leave Paddle and Musuw
		// on different plans.
		var providerPeriodEnd *time.Time
		if subscription.CurrentBillingPeriod != nil {
			if parsed, periodErr := time.Parse(time.RFC3339Nano, strings.TrimSpace(subscription.CurrentBillingPeriod.EndsAt)); periodErr == nil && parsed.After(providerUpdatedAt) {
				value := parsed.UTC()
				providerPeriodEnd = &value
			}
		}
		if _, applyErr := h.service.ApplyConsumerPlan(
			ctx, tenantID, providerPlan, string(subscription.Status), providerPeriod,
			paddleReconciliationEventID(operation, subscription.UpdatedAt), providerUpdatedAt.UTC(),
			subscription.CustomerID, subscription.ID, providerPeriodEnd,
		); applyErr != nil {
			return apperrors.NewServiceUnavailableError("Paddle entitlement reconciliation is temporarily unavailable")
		}
		converged, currentErr := h.service.Current(ctx, time.Now())
		if currentErr != nil || converged == nil || converged.Plan != providerPlan ||
			strings.TrimSpace(converged.PaddleCustomerID) != strings.TrimSpace(subscription.CustomerID) ||
			strings.TrimSpace(converged.PaddleSubscriptionID) != strings.TrimSpace(subscription.ID) ||
			converged.PaddleBillingPeriod != providerPeriod {
			return apperrors.NewServiceUnavailableError("Paddle entitlement reconciliation is temporarily unavailable")
		}
		result, _ := json.Marshal(map[string]string{"subscription_id": subscription.ID, "price_id": providerPriceID})
		if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationSucceeded, string(result), ""); err != nil {
			return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
		}
		return nil
	}
	if _, period, known := h.paddle.planAndPeriodForPrice(providerPriceID); !known || period != operation.BillingPeriod {
		return apperrors.NewConflictError("Paddle subscription price cannot be reconciled automatically")
	}
	// A recent unchanged read is not proof that a mutation failed: Paddle may
	// still be processing the immediate charge. Never submit a second update.
	if !paddleBillingOperationReadyForRecovery(operation, paddleUpgradeRecoveryDelay) {
		return nil
	}
	// Paddle recommends GET/list-before-retry for operations without a client
	// idempotency key. For an immediate upgrade, Paddle creates a
	// subscription_update transaction and copies subscription custom_data to
	// it. The exact server operation key and MAC distinguish this request.
	matches, inventoryErr := h.findPaddleOperationTransactions(ctx, operation, paddle.TransactionOriginSubscriptionUpdate)
	if inventoryErr != nil {
		return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
	}
	if len(matches) == 1 {
		switch matches[0].Status {
		case paddle.TransactionStatusCanceled, paddle.TransactionStatusPastDue:
			if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "Paddle did not apply the subscription upgrade"); err != nil {
				return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
			}
			return apperrors.NewConflictError("subscription upgrade did not complete; retry with a new operation")
		default:
			// A matching nonterminal/paid transaction proves Paddle accepted work.
			// Keep waiting for the authoritative subscription.updated state.
			return nil
		}
	}
	// After the recovery delay, Paddle's exhaustive list-before-retry check is
	// the boundary for this non-idempotent update. No exact transaction means
	// this operation cannot be resumed safely; release it so a new upgrade can
	// be attempted. If a concurrent signed webhook already won the row lock,
	// Finish returns an error and the operation remains recoverable.
	if err := h.operations.Finish(ctx, operation.ID, types.PaddleBillingOperationFailed, `{}`, "Paddle subscription upgrade was not found after exhaustive recovery"); err != nil {
		return apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable")
	}
	return apperrors.NewConflictError("subscription upgrade was not found; retry with a new operation")
}

func (h *EntitlementHandler) PaddleSubscriptionUpgradePreview(c *gin.Context) {
	tenantID, ok := types.TenantIDFromContext(c.Request.Context())
	if !ok || tenantID == 0 {
		_ = c.Error(apperrors.NewUnauthorizedError("authentication required"))
		return
	}
	var request paddleSubscriptionUpgradeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		_ = c.Error(apperrors.NewBadRequestError("target plan is required"))
		return
	}
	target, err := h.paddleSubscriptionUpgradeTarget(c.Request.Context(), tenantID, request.Plan)
	if err != nil {
		_ = c.Error(err)
		return
	}
	preview, err := h.subscriptions.PreviewSubscriptionUpdate(c.Request.Context(), paddlePreviewUpgradeRequest(tenantID, h.paddle, target))
	if err != nil {
		logger.Errorf(c.Request.Context(), "Paddle subscription upgrade preview failed tenant_id=%d target_plan=%s: %v", tenantID, target.plan, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle upgrade preview is temporarily unavailable"))
		return
	}
	if preview == nil || preview.UpdateSummary == nil || preview.ImmediateTransaction == nil || preview.NextBilledAt == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle returned an incomplete upgrade preview"))
		return
	}
	immediate := preview.ImmediateTransaction.Details.Totals
	recurring := preview.RecurringTransactionDetails.Totals
	currency := recurring.CurrencyCode
	if strings.TrimSpace(immediate.Subtotal) == "" || strings.TrimSpace(immediate.Tax) == "" || strings.TrimSpace(immediate.Balance) == "" ||
		strings.TrimSpace(recurring.Total) == "" ||
		currency == "" || immediate.CurrencyCode != currency || preview.UpdateSummary.Result.CurrencyCode != currency || strings.TrimSpace(*preview.NextBilledAt) == "" {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle returned an incomplete upgrade preview"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"plan":              target.plan,
		"period":            target.period,
		"action":            preview.UpdateSummary.Result.Action,
		"prorated_subtotal": immediate.Subtotal,
		"prorated_tax":      immediate.Tax,
		"due_today":         immediate.Balance,
		"recurring_total":   recurring.Total,
		"currency_code":     currency,
		"next_billed_at":    *preview.NextBilledAt,
	})
}

func (h *EntitlementHandler) PaddleSubscriptionUpgrade(c *gin.Context) {
	tenantID, ok := types.TenantIDFromContext(c.Request.Context())
	if !ok || tenantID == 0 {
		_ = c.Error(apperrors.NewUnauthorizedError("authentication required"))
		return
	}
	var request paddleSubscriptionUpgradeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		_ = c.Error(apperrors.NewBadRequestError("target plan is required"))
		return
	}
	if !validPaddleOperationKey(request.OperationKey) || h.operations == nil {
		_ = c.Error(apperrors.NewBadRequestError("a valid upgrade operation key is required"))
		return
	}
	request.Plan = types.NormalizeConsumerPlan(request.Plan)
	operationKey := strings.TrimSpace(request.OperationKey)
	existing, found, err := h.operations.FindByKey(c.Request.Context(), tenantID, operationKey)
	if err != nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable"))
		return
	}
	if found && existing.Status != types.PaddleBillingOperationPending {
		if existing.OperationType != types.PaddleBillingOperationUpgrade || existing.Plan != request.Plan {
			_ = c.Error(apperrors.NewConflictError("upgrade operation key was already used for another request"))
			return
		}
		if err := h.reconcilePaddleUpgradeOperation(c.Request.Context(), tenantID, existing); err != nil {
			_ = c.Error(err)
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"pending": true, "plan": existing.Plan})
		return
	}
	target, err := h.paddleSubscriptionUpgradeTarget(c.Request.Context(), tenantID, request.Plan)
	if err != nil {
		_ = c.Error(err)
		return
	}
	intent := types.PaddleBillingOperationIntent{
		TenantID: tenantID, OperationKey: operationKey,
		OperationType: types.PaddleBillingOperationUpgrade, Plan: target.plan,
		BillingPeriod: target.period, PriceID: target.priceID, SubscriptionID: target.subscriptionID,
	}
	intent.RequestFingerprint = paddleBillingOperationFingerprint(intent.OperationType, intent.Plan, intent.BillingPeriod, intent.PriceID, intent.SubscriptionID)
	operation := existing
	disposition := types.PaddleBillingOperationClaimExisting
	if !found {
		operation, disposition, err = h.operations.Claim(c.Request.Context(), intent)
		if errors.Is(err, interfaces.ErrPaddleBillingOperationKeyConflict) {
			_ = c.Error(apperrors.NewConflictError("upgrade operation key was already used for another request"))
			return
		}
		if err != nil {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable"))
			return
		}
	}
	if !samePaddleBillingOperation(operation, intent) {
		if disposition != types.PaddleBillingOperationClaimActive {
			_ = c.Error(apperrors.NewConflictError("another billing operation is already in progress"))
			return
		}
		if operation.Status == types.PaddleBillingOperationInFlight || operation.Status == types.PaddleBillingOperationUncertain {
			// A retry may choose a different target after an ambiguous provider
			// response. Reconcile the already-started official mutation first; never
			// let another operation key bypass it or leave an unknown row permanent.
			// Whether the old mutation is still pending, succeeded, or was released,
			// the caller must reload once before deriving a new target from Paddle.
			if err := h.reconcilePaddleUpgradeOperation(c.Request.Context(), tenantID, operation); err != nil {
				_ = c.Error(err)
				return
			}
			_ = c.Error(apperrors.NewConflictError("the previous subscription change is still being reconciled; reload before choosing another plan"))
			return
		}
		if operation.Status != types.PaddleBillingOperationPending {
			_ = c.Error(apperrors.NewConflictError("another billing operation is already in progress"))
			return
		}
		// No Paddle update can exist while the row is pending. Release a stale
		// pre-call claim so the user can choose another upgrade target. The
		// repository checks the status and empty transaction binding atomically;
		// a false result means another caller already started the mutation.
		released, finishErr := h.operations.FailPendingWithoutProviderWrite(c.Request.Context(), operation.ID, "upgrade selection changed before Paddle was called")
		if finishErr != nil {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable"))
			return
		}
		if !released {
			_ = c.Error(apperrors.NewConflictError("another billing operation is already in progress"))
			return
		}
		operation, disposition, err = h.operations.Claim(c.Request.Context(), intent)
		if err != nil || disposition != types.PaddleBillingOperationClaimCreated || !samePaddleBillingOperation(operation, intent) {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable"))
			return
		}
	}
	if operation.Status != types.PaddleBillingOperationPending {
		if err := h.reconcilePaddleUpgradeOperation(c.Request.Context(), tenantID, operation); err != nil {
			_ = c.Error(err)
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"pending": true, "plan": target.plan})
		return
	}
	// Pending proves that no provider write has started. The atomic transition
	// elects one retry/caller to perform the non-idempotent Paddle update.
	started, err := h.operations.MarkInFlight(c.Request.Context(), operation.ID)
	if err != nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable"))
		return
	}
	if !started {
		if err := h.reconcilePaddleUpgradeOperation(c.Request.Context(), tenantID, operation); err != nil {
			_ = c.Error(err)
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"pending": true, "plan": target.plan})
		return
	}
	providerCtx, cancel := context.WithTimeout(c.Request.Context(), paddleMutationTimeout)
	defer cancel()
	updated, err := h.subscriptions.UpdateSubscription(providerCtx, paddleApplyUpgradeRequest(tenantID, h.paddle, target, operation.OperationKey))
	if err != nil {
		status := types.PaddleBillingOperationUncertain
		if paddleRequestDefinitelyRejected(err) {
			status = types.PaddleBillingOperationFailed
		}
		_ = h.operations.Finish(c.Request.Context(), operation.ID, status, `{}`, err.Error())
		logger.Errorf(c.Request.Context(), "Paddle subscription upgrade failed tenant_id=%d target_plan=%s: %v", tenantID, target.plan, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription upgrade is temporarily unavailable; retrying will not submit another change"))
		return
	}
	if updated == nil || strings.TrimSpace(updated.ID) != target.subscriptionID {
		_ = h.operations.Finish(c.Request.Context(), operation.ID, types.PaddleBillingOperationUncertain, `{}`, "Paddle returned an incomplete subscription update")
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle returned an incomplete subscription update"))
		return
	}
	logger.Infof(c.Request.Context(), "Paddle subscription upgrade accepted tenant_id=%d target_plan=%s", tenantID, target.plan)
	// The signed subscription.updated webhook remains the only authority that
	// updates the plan and the existing OpenRouter child-key spend limit.
	c.JSON(http.StatusAccepted, gin.H{"pending": true, "plan": target.plan})
}

type paddleEvent struct {
	EventID    string          `json:"event_id"`
	EventType  string          `json:"event_type"`
	OccurredAt time.Time       `json:"occurred_at"`
	Data       paddleEventData `json:"data"`
}

type paddleEventData struct {
	CurrencyCode string `json:"currency_code"`
	Details      struct {
		Totals struct {
			Total string `json:"total"`
		} `json:"totals"`
	} `json:"details"`
	ScheduledChange *struct {
		Action      string    `json:"action"`
		EffectiveAt time.Time `json:"effective_at"`
	} `json:"scheduled_change"`
	ID                   string               `json:"id"`
	Status               string               `json:"status"`
	Action               string               `json:"action"`
	Type                 string               `json:"type"`
	Origin               string               `json:"origin"`
	CustomerID           string               `json:"customer_id"`
	SubscriptionID       string               `json:"subscription_id"`
	TransactionID        string               `json:"transaction_id"`
	CustomData           json.RawMessage      `json:"custom_data"`
	BillingPeriod        *paddleBillingPeriod `json:"billing_period"`
	CurrentBillingPeriod *paddleBillingPeriod `json:"current_billing_period"`
	Items                []paddleEventItem    `json:"items"`
}

type paddleEventItem struct {
	Quantity  int  `json:"quantity"`
	Recurring bool `json:"recurring"`
	Price     struct {
		ID string `json:"id"`
	} `json:"price"`
}

type paddleAdjustmentDecision uint8

const (
	paddleAdjustmentIgnore paddleAdjustmentDecision = iota
	paddleAdjustmentRevoke
	paddleAdjustmentReconcile
)

func decidePaddleAdjustment(action, adjustmentType, status string) paddleAdjustmentDecision {
	if strings.TrimSpace(adjustmentType) != "full" || strings.TrimSpace(status) != "approved" {
		return paddleAdjustmentIgnore
	}
	switch strings.TrimSpace(action) {
	case "refund", "chargeback":
		return paddleAdjustmentRevoke
	case "chargeback_reverse":
		return paddleAdjustmentReconcile
	default:
		return paddleAdjustmentIgnore
	}
}

func isAdjustmentPaddleEvent(eventType string) bool {
	return eventType == "adjustment.created" || eventType == "adjustment.updated"
}

func (h *EntitlementHandler) enqueuePaddleWebhook(c *gin.Context, payload types.PaddleWebhookTaskPayload) bool {
	if h.tasks == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle event queue is unavailable"))
		return false
	}
	if err := payload.Validate(); err != nil {
		_ = c.Error(apperrors.NewBadRequestError("Paddle event shape is invalid"))
		return false
	}
	taskBody, err := json.Marshal(payload)
	if err != nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle event queue is unavailable"))
		return false
	}
	options := []asynq.Option{
		asynq.Queue(types.QueueBilling),
		asynq.MaxRetry(types.PaddleWebhookTaskMaxRetry),
		asynq.Timeout(types.PaddleWebhookTaskTimeout),
	}
	_, err = h.tasks.Enqueue(asynq.NewTask(types.TypePaddleWebhook, taskBody), options...)
	if err != nil {
		logger.Errorf(c.Request.Context(), "Paddle billing event enqueue failed event_id=%s: %v", payload.EventID, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle event queue is temporarily unavailable"))
		return false
	}
	logger.Infof(c.Request.Context(), "Paddle billing event queued event_id=%s event_type=%s tenant_id=%d", payload.EventID, payload.EventType, payload.TenantID)
	return true
}

type paddleBillingPeriod struct {
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
}

func (h *EntitlementHandler) PaddleWebhook(c *gin.Context) {
	if !h.paddle.Configured() {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle billing is not configured"))
		return
	}
	if err := verifyPaddleRequest(h.paddle.WebhookSecret, c.Request); err != nil {
		_ = c.Error(apperrors.NewUnauthorizedError("invalid Paddle signature"))
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1024*1024+1))
	if err != nil || len(body) > 1024*1024 {
		_ = c.Error(apperrors.NewBadRequestError("invalid Paddle webhook body"))
		return
	}
	var event paddleEvent
	if err := json.Unmarshal(body, &event); err != nil || event.EventID == "" || event.OccurredAt.IsZero() {
		_ = c.Error(apperrors.NewBadRequestError("invalid Paddle event"))
		return
	}
	// Marketplace subscriptions have their own durable entitlement records.
	// Dispatch only after the same Paddle signature verification used above.
	if h.marketplace != nil && h.marketplace.handleVerifiedWebhook(c, event) {
		return
	}
	if isAdjustmentPaddleEvent(event.EventType) {
		h.handlePaddleAdjustment(c, event)
		return
	}
	isSubscriptionEvent := isEntitlementPaddleEvent(event.EventType)
	isRecurringCompletion := event.EventType == "transaction.completed" && event.Data.Status == "completed" && event.Data.Origin == "subscription_recurring"
	if !isSubscriptionEvent && !isRecurringCompletion {
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
		return
	}
	plan, status, priceID, billingPeriod, err := h.paddle.planForEvent(event)
	if err != nil {
		_ = c.Error(err)
		return
	}
	subscriptionID := event.Data.SubscriptionID
	if subscriptionID == "" && strings.HasPrefix(event.EventType, "subscription.") {
		subscriptionID = event.Data.ID
	}
	// Once a subscription is bound, the signed Paddle customer/subscription
	// identity is the durable routing key. Recurring transactions may legally
	// omit custom_data, so never make renewals depend on browser-era metadata.
	// Initial subscription.created has no binding yet and therefore falls back
	// to the server-issued tenant/price MAC carried through Checkout.
	var tenantID uint64
	if h.service != nil && strings.TrimSpace(event.Data.CustomerID) != "" && strings.TrimSpace(subscriptionID) != "" {
		binding, resolveErr := h.service.ResolvePaddleSubscription(c.Request.Context(), event.Data.CustomerID, subscriptionID)
		if resolveErr != nil {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription binding is temporarily unavailable"))
			return
		}
		if binding != nil && binding.TenantID != 0 &&
			strings.TrimSpace(binding.CustomerID) == strings.TrimSpace(event.Data.CustomerID) &&
			strings.TrimSpace(binding.SubscriptionID) == strings.TrimSpace(subscriptionID) {
			tenantID = binding.TenantID
		}
	}
	if tenantID == 0 {
		tenantID, err = paddleTenantID(event.Data.CustomData)
		if err != nil {
			if isRecurringCompletion {
				// The initial subscription event may still be ahead in the billing
				// queue. A retry lets the durable binding become visible without
				// discarding a paid renewal.
				_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription binding is not ready"))
			} else {
				_ = c.Error(apperrors.NewBadRequestError("Paddle event has no valid tenant_id"))
			}
			return
		}
		if !h.paddle.validCheckoutBinding(tenantID, priceID, paddleCheckoutBinding(event.Data.CustomData)) {
			_ = c.Error(apperrors.NewUnauthorizedError("Paddle checkout binding is invalid"))
			return
		}
	}
	payload := types.PaddleWebhookTaskPayload{
		TenantID: tenantID, Plan: plan, Status: status, BillingPeriod: billingPeriod,
		EventID: event.EventID, EventType: event.EventType, OccurredAt: event.OccurredAt,
		CustomerID: event.Data.CustomerID, SubscriptionID: subscriptionID, TransactionID: event.Data.TransactionID, PriceID: priceID,
	}
	if isRecurringCompletion {
		if event.Data.BillingPeriod == nil || event.Data.BillingPeriod.EndsAt.IsZero() {
			_ = c.Error(apperrors.NewBadRequestError("Paddle recurring transaction has no billing period"))
			return
		}
		periodEnd := event.Data.BillingPeriod.EndsAt.UTC()
		payload.EventPeriodEnd = &periodEnd
		// The worker decides whether this is a normal period advance or a
		// post-adjustment restoration while holding the tenant allowance lock.
		payload.Operation = types.PaddleWebhookTaskOperationRefreshPaidAllowance
	} else {
		payload.Operation = types.PaddleWebhookTaskOperationApplyConsumerPlan
		payload.EventPeriodEnd = entitledPaddlePeriodEnd(event.EventType, status, event.Data.CurrentBillingPeriod)
		if operationKey := paddleBillingOperationKey(event.Data.CustomData); validPaddleOperationKey(operationKey) {
			switch event.EventType {
			case "subscription.created":
				payload.BillingOperationKey = operationKey
				payload.BillingOperationType = types.PaddleBillingOperationCheckout
			case "subscription.updated":
				payload.BillingOperationKey = operationKey
				payload.BillingOperationType = types.PaddleBillingOperationUpgrade
			}
		}
	}
	if !h.enqueuePaddleWebhook(c, payload) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "queued": true})
}

func (h *EntitlementHandler) handlePaddleAdjustment(c *gin.Context, event paddleEvent) {
	decision := decidePaddleAdjustment(event.Data.Action, event.Data.Type, event.Data.Status)
	if decision == paddleAdjustmentIgnore {
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
		return
	}
	if h.service == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle entitlement service is unavailable"))
		return
	}
	customerID := strings.TrimSpace(event.Data.CustomerID)
	subscriptionID := strings.TrimSpace(event.Data.SubscriptionID)
	if customerID == "" || subscriptionID == "" {
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
		return
	}
	binding, err := h.service.ResolvePaddleSubscription(c.Request.Context(), customerID, subscriptionID)
	if err != nil {
		logger.Errorf(c.Request.Context(), "Paddle adjustment binding lookup failed event_id=%s: %v", event.EventID, err)
		_ = c.Error(apperrors.NewServiceUnavailableError("Paddle adjustment binding is temporarily unavailable"))
		return
	}
	var providerSubscription *paddle.Subscription
	if binding == nil {
		binding, providerSubscription, err = h.recoverPaddleAdjustmentBinding(c.Request.Context(), customerID, subscriptionID)
		if err != nil {
			logger.Errorf(c.Request.Context(), "Paddle adjustment binding recovery failed event_id=%s: %v", event.EventID, err)
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle adjustment binding is temporarily unavailable"))
			return
		}
	}
	if binding == nil || binding.TenantID == 0 ||
		strings.TrimSpace(binding.CustomerID) != customerID ||
		strings.TrimSpace(binding.SubscriptionID) != subscriptionID {
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
		return
	}

	payload := types.PaddleWebhookTaskPayload{
		TenantID:  binding.TenantID,
		Operation: types.PaddleWebhookTaskOperationApplyConsumerPlan,
		// Keep the provider-confirmed paid plan as the durable identity while
		// status withdraws access. This lets an authoritative reversal restore
		// the same entitlement without inventing a fresh allowance or keeping a
		// second adjustment ledger.
		Plan:           types.NormalizeConsumerPlan(binding.Plan),
		BillingPeriod:  binding.BillingPeriod,
		EventID:        event.EventID,
		EventType:      event.EventType,
		OccurredAt:     event.OccurredAt,
		CustomerID:     binding.CustomerID,
		SubscriptionID: binding.SubscriptionID,
	}
	if decision == paddleAdjustmentRevoke {
		if payload.Plan == types.ConsumerPlanFree {
			// A bound paid subscription must always retain its known paid price.
			// Unknown legacy rows are safer to retry than to erase the plan needed
			// for a later authoritative reversal.
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle adjustment plan binding is unavailable"))
			return
		}
		if strings.TrimSpace(event.Data.Action) == "chargeback" {
			payload.Status = "chargeback"
		} else {
			payload.Status = "refunded"
		}
	} else {
		if h.subscriptions == nil {
			_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is unavailable"))
			return
		}
		subscription := providerSubscription
		if subscription == nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), paddleAdjustmentReconcileTimeout)
			defer cancel()
			var lookupErr error
			subscription, lookupErr = h.subscriptions.GetSubscription(ctx, &paddle.GetSubscriptionRequest{SubscriptionID: binding.SubscriptionID})
			if lookupErr != nil {
				logger.Errorf(c.Request.Context(), "Paddle adjustment reconciliation lookup failed event_id=%s: %v", event.EventID, lookupErr)
				_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription reconciliation is temporarily unavailable"))
				return
			}
		}
		if subscription == nil || strings.TrimSpace(subscription.ID) != binding.SubscriptionID ||
			strings.TrimSpace(subscription.CustomerID) != binding.CustomerID || !paddleSubscriptionHasOneRecurringItem(subscription) {
			c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
			return
		}
		plan, billingPeriod, ok := h.paddle.planAndPeriodForPrice(subscription.Items[0].Price.ID)
		if !ok {
			c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
			return
		}
		payload.PriceID = subscription.Items[0].Price.ID
		payload.Status = string(subscription.Status)
		switch subscription.Status {
		case paddle.SubscriptionStatusActive, paddle.SubscriptionStatusTrialing:
			if subscription.CurrentBillingPeriod == nil {
				_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription has no current billing period"))
				return
			}
			periodEnd, parseErr := time.Parse(time.RFC3339Nano, subscription.CurrentBillingPeriod.EndsAt)
			if parseErr != nil || !periodEnd.After(event.OccurredAt) {
				_ = c.Error(apperrors.NewServiceUnavailableError("Paddle subscription billing period is invalid"))
				return
			}
			periodEnd = periodEnd.UTC()
			payload.Plan = plan
			payload.BillingPeriod = billingPeriod
			payload.EventPeriodEnd = &periodEnd
		case paddle.SubscriptionStatusPastDue, paddle.SubscriptionStatusPaused:
			payload.Plan = plan
			payload.BillingPeriod = billingPeriod
		case paddle.SubscriptionStatusCanceled:
			payload.Plan = types.ConsumerPlanFree
			payload.BillingPeriod = ""
		default:
			c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
			return
		}
	}
	if !h.enqueuePaddleWebhook(c, payload) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "queued": true})
}

// recoverPaddleAdjustmentBinding handles the one safe out-of-order case where
// Paddle delivers a final adjustment before the subscription webhook worker
// has persisted its local customer/subscription binding. Paddle copies checkout
// custom_data to the subscription, so the existing tenant/price HMAC remains
// the ownership authority; unknown or unbound subscriptions are ignored.
func (h *EntitlementHandler) recoverPaddleAdjustmentBinding(ctx context.Context, customerID, subscriptionID string) (*types.PaddleSubscriptionBinding, *paddle.Subscription, error) {
	if h.subscriptions == nil {
		return nil, nil, fmt.Errorf("Paddle subscription reconciliation is unavailable")
	}
	lookupCtx, cancel := context.WithTimeout(ctx, paddleAdjustmentReconcileTimeout)
	defer cancel()
	subscription, err := h.subscriptions.GetSubscription(lookupCtx, &paddle.GetSubscriptionRequest{SubscriptionID: subscriptionID})
	if err != nil {
		return nil, nil, err
	}
	if subscription == nil || strings.TrimSpace(subscription.ID) != subscriptionID ||
		strings.TrimSpace(subscription.CustomerID) != customerID || !paddleSubscriptionHasOneRecurringItem(subscription) {
		return nil, nil, nil
	}
	priceID := strings.TrimSpace(subscription.Items[0].Price.ID)
	plan, billingPeriod, ok := h.paddle.planAndPeriodForPrice(priceID)
	if !ok {
		return nil, nil, nil
	}
	customData, err := json.Marshal(subscription.CustomData)
	if err != nil {
		return nil, nil, nil
	}
	tenantID, err := paddleTenantID(customData)
	if err != nil || !h.paddle.validCheckoutBinding(tenantID, priceID, paddleCheckoutBinding(customData)) {
		return nil, nil, nil
	}
	return &types.PaddleSubscriptionBinding{
		TenantID:       tenantID,
		Plan:           plan,
		Status:         string(subscription.Status),
		BillingPeriod:  billingPeriod,
		CustomerID:     customerID,
		SubscriptionID: subscriptionID,
	}, subscription, nil
}

// Paddle sends subscription.updated at the start of renewal, before payment is
// collected, and past_due already points at that unpaid period. Only initial
// creation/activation (or an intentional trial) may seed the boundary here;
// successful recurring transactions advance renewals separately above.
func entitledPaddlePeriodEnd(eventType, status string, period *paddleBillingPeriod) *time.Time {
	if period == nil || period.EndsAt.IsZero() {
		return nil
	}
	if eventType != "subscription.created" && eventType != "subscription.activated" && eventType != "subscription.trialing" {
		return nil
	}
	if status != "active" && status != "trialing" {
		return nil
	}
	value := period.EndsAt.UTC()
	return &value
}

func isEntitlementPaddleEvent(eventType string) bool {
	switch eventType {
	case "subscription.created", "subscription.activated", "subscription.trialing", "subscription.past_due", "subscription.resumed", "subscription.updated", "subscription.canceled", "subscription.paused":
		return true
	default:
		return false
	}
}

func (c PaddleConfig) planForEvent(event paddleEvent) (types.ConsumerPlan, string, string, string, error) {
	if len(event.Data.Items) != 1 {
		return "", "", "", "", apperrors.NewBadRequestError("Paddle subscription must contain exactly one known price")
	}
	item := event.Data.Items[0]
	if item.Quantity != 1 || (strings.HasPrefix(event.EventType, "subscription.") && !item.Recurring) {
		return "", "", "", "", apperrors.NewBadRequestError("Paddle subscription must contain one recurring unit")
	}
	matchedPrice := strings.TrimSpace(item.Price.ID)
	matchedPlan, matchedPeriod, ok := c.planAndPeriodForPrice(matchedPrice)
	if !ok {
		return "", "", "", "", apperrors.NewBadRequestError("Paddle event contains no known price")
	}
	status := event.Data.Status
	if event.EventType == "subscription.canceled" {
		if status == "" {
			status = strings.TrimPrefix(event.EventType, "subscription.")
		}
		return types.ConsumerPlanFree, status, matchedPrice, matchedPeriod, nil
	}
	if status == "" {
		if event.EventType == "subscription.paused" {
			status = "paused"
		} else {
			status = "active"
		}
	}
	return matchedPlan, status, matchedPrice, matchedPeriod, nil
}

func paddleCheckoutBinding(raw json.RawMessage) string {
	var custom struct {
		CheckoutBinding string `json:"musuw_checkout_binding"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &custom) != nil {
		return ""
	}
	return strings.TrimSpace(custom.CheckoutBinding)
}

func paddleBillingOperationKey(raw json.RawMessage) string {
	var custom struct {
		OperationKey string `json:"musuw_billing_operation_key"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &custom) != nil {
		return ""
	}
	return strings.TrimSpace(custom.OperationKey)
}

func paddleTenantID(raw json.RawMessage) (uint64, error) {
	var custom struct {
		TenantID json.RawMessage `json:"tenant_id"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &custom) != nil || len(custom.TenantID) == 0 {
		return 0, fmt.Errorf("missing custom data")
	}
	var text string
	if err := json.Unmarshal(custom.TenantID, &text); err != nil {
		text = string(custom.TenantID)
	}
	text = strings.TrimSpace(text)
	id, err := strconv.ParseUint(text, 10, 64)
	if err != nil || id == 0 {
		return 0, fmt.Errorf("invalid tenant_id")
	}
	return id, nil
}

func verifyPaddleRequest(secret string, request *http.Request) error {
	if strings.TrimSpace(secret) == "" {
		return fmt.Errorf("Paddle webhook secret is missing")
	}
	verified, err := paddle.NewWebhookVerifier(
		secret,
		paddle.VerifierWithTimestampTolerance(paddleSignatureTolerance),
	).Verify(request)
	if err != nil {
		return err
	}
	if !verified {
		return fmt.Errorf("Paddle signature mismatch")
	}
	return nil
}
