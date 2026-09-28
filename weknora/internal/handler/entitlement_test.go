package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	paddleerr "github.com/PaddleHQ/paddle-go-sdk/v5/pkg/paddleerr"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type entitlementHandlerServiceStub struct {
	current          *types.ConsumerEntitlement
	paddleBinding    *types.PaddleSubscriptionBinding
	paddleBindingErr error
	applyCalls       *int
	refreshCalls     *int
	capturePeriodEnd func(*time.Time)
	applyErr         error
}

type paddlePortalSessionCreatorStub struct {
	customerID      string
	subscriptionIDs []string
}

type emptyPaddlePortalSessionCreatorStub struct{}

type recordingPaddleWebhookEnqueuer struct {
	task *asynq.Task
}

type paddleBillingOperationRepoStub struct {
	operation           *types.PaddleBillingOperation
	claimDisposition    types.PaddleBillingOperationClaimDisposition
	finishStatus        types.PaddleBillingOperationStatus
	recordedTransaction string
	recordErr           error
	failPendingResult   bool
	failPendingCalls    int
	findCalls           int
	terminalOnFindCall  int
}

func (s *paddleBillingOperationRepoStub) Claim(_ context.Context, intent types.PaddleBillingOperationIntent) (*types.PaddleBillingOperation, types.PaddleBillingOperationClaimDisposition, error) {
	if s.operation != nil {
		if s.operation.Status == types.PaddleBillingOperationSucceeded || s.operation.Status == types.PaddleBillingOperationFailed {
			s.operation = nil
		} else {
			disposition := s.claimDisposition
			if disposition == "" {
				if s.operation.OperationKey == intent.OperationKey {
					disposition = types.PaddleBillingOperationClaimExisting
				} else {
					disposition = types.PaddleBillingOperationClaimActive
				}
			}
			return s.operation, disposition, nil
		}
	}
	s.operation = &types.PaddleBillingOperation{
		ID: 1, TenantID: intent.TenantID, OperationKey: intent.OperationKey,
		OperationType: intent.OperationType, RequestFingerprint: intent.RequestFingerprint,
		Plan: intent.Plan, BillingPeriod: intent.BillingPeriod, PriceID: intent.PriceID,
		SubscriptionID: intent.SubscriptionID, Status: types.PaddleBillingOperationPending,
	}
	return s.operation, types.PaddleBillingOperationClaimCreated, nil
}
func (s *paddleBillingOperationRepoStub) FindByKey(_ context.Context, tenantID uint64, operationKey string) (*types.PaddleBillingOperation, bool, error) {
	s.findCalls++
	if s.terminalOnFindCall > 0 && s.findCalls == s.terminalOnFindCall && s.operation != nil {
		s.operation.Status = types.PaddleBillingOperationSucceeded
	}
	if s.operation == nil || s.operation.TenantID != tenantID || s.operation.OperationKey != operationKey {
		return nil, false, nil
	}
	return s.operation, true, nil
}

func (s *paddleBillingOperationRepoStub) MarkInFlight(context.Context, uint64) (bool, error) {
	if s.operation.Status == types.PaddleBillingOperationInFlight {
		return false, nil
	}
	s.operation.Status = types.PaddleBillingOperationInFlight
	return true, nil
}
func (s *paddleBillingOperationRepoStub) FailPendingWithoutProviderWrite(_ context.Context, _ uint64, _ string) (bool, error) {
	s.failPendingCalls++
	if s.failPendingResult {
		s.operation.Status = types.PaddleBillingOperationFailed
	}
	return s.failPendingResult, nil
}
func (s *paddleBillingOperationRepoStub) RecordPaddleTransaction(_ context.Context, _ uint64, transactionID string) error {
	if s.recordErr != nil {
		return s.recordErr
	}
	s.recordedTransaction = transactionID
	s.operation.PaddleTransactionID = transactionID
	return nil
}
func (s *paddleBillingOperationRepoStub) Finish(_ context.Context, _ uint64, status types.PaddleBillingOperationStatus, _, _ string) error {
	s.operation.Status = status
	s.finishStatus = status
	return nil
}
func (*paddleBillingOperationRepoStub) FinishMatchingActive(context.Context, uint64, types.PaddleBillingOperationType, string, string, string, string, types.PaddleBillingOperationStatus, string, string) (bool, error) {
	return true, nil
}

func (e *recordingPaddleWebhookEnqueuer) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	e.task = task
	return &asynq.TaskInfo{ID: "queued-paddle-event", Queue: "billing", Type: task.Type()}, nil
}

type paddleSubscriptionUpdaterStub struct {
	subscription *paddle.Subscription
	getErr       error
	preview      *paddle.SubscriptionPreview
	previewReq   *paddle.PreviewSubscriptionUpdateRequest
	updateReq    *paddle.UpdateSubscriptionRequest
	updateCalls  int
}

func (s *paddleSubscriptionUpdaterStub) GetSubscription(context.Context, *paddle.GetSubscriptionRequest) (*paddle.Subscription, error) {
	return s.subscription, s.getErr
}

func (s *paddleSubscriptionUpdaterStub) PreviewSubscriptionUpdate(_ context.Context, request *paddle.PreviewSubscriptionUpdateRequest) (*paddle.SubscriptionPreview, error) {
	s.previewReq = request
	return s.preview, nil
}

func (s *paddleSubscriptionUpdaterStub) UpdateSubscription(_ context.Context, request *paddle.UpdateSubscriptionRequest) (*paddle.Subscription, error) {
	s.updateCalls++
	s.updateReq = request
	return s.subscription, nil
}

type paddleTransactionClientStub struct {
	transaction  *paddle.Transaction
	createErr    error
	createCalls  int
	createReq    *paddle.CreateTransactionRequest
	updateReq    *paddle.UpdateTransactionRequest
	updateResult *paddle.Transaction
	updateErr    error
	updateCalls  int
	getResult    *paddle.Transaction
	getErr       error
	getCalls     int
	getResults   []*paddle.Transaction
	getErrs      []error
	listResult   *paddle.Collection[*paddle.Transaction]
	listErr      error
	listReq      *paddle.ListTransactionsRequest
	listCalls    int
}

func (s *paddleTransactionClientStub) CreateTransaction(_ context.Context, request *paddle.CreateTransactionRequest) (*paddle.Transaction, error) {
	s.createCalls++
	s.createReq = request
	return s.transaction, s.createErr
}

func (s *paddleTransactionClientStub) GetTransaction(_ context.Context, _ *paddle.GetTransactionRequest) (*paddle.Transaction, error) {
	s.getCalls++
	if s.getCalls <= len(s.getResults) {
		var err error
		if s.getCalls <= len(s.getErrs) {
			err = s.getErrs[s.getCalls-1]
		}
		return s.getResults[s.getCalls-1], err
	}
	if s.getResult != nil || s.getErr != nil {
		return s.getResult, s.getErr
	}
	return s.transaction, nil
}

func (s *paddleTransactionClientStub) UpdateTransaction(_ context.Context, request *paddle.UpdateTransactionRequest) (*paddle.Transaction, error) {
	s.updateCalls++
	s.updateReq = request
	if s.updateResult != nil || s.updateErr != nil {
		return s.updateResult, s.updateErr
	}
	return s.transaction, nil
}

func (s *paddleTransactionClientStub) ListTransactions(_ context.Context, request *paddle.ListTransactionsRequest) (*paddle.Collection[*paddle.Transaction], error) {
	s.listCalls++
	s.listReq = request
	return s.listResult, s.listErr
}

func paddleTransactionCollection(t *testing.T, transactions ...*paddle.Transaction) *paddle.Collection[*paddle.Transaction] {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"data": transactions,
		"meta": map[string]any{"pagination": map[string]any{
			"per_page": len(transactions), "estimated_total": len(transactions), "has_more": false, "next": "",
		}},
	})
	require.NoError(t, err)
	var collection paddle.Collection[*paddle.Transaction]
	require.NoError(t, json.Unmarshal(body, &collection))
	return &collection
}

func (emptyPaddlePortalSessionCreatorStub) CreateCustomerPortalSession(context.Context, *paddle.CreateCustomerPortalSessionRequest) (*paddle.CustomerPortalSession, error) {
	return nil, nil
}

func (s *paddlePortalSessionCreatorStub) CreateCustomerPortalSession(_ context.Context, request *paddle.CreateCustomerPortalSessionRequest) (*paddle.CustomerPortalSession, error) {
	s.customerID = request.CustomerID
	s.subscriptionIDs = append([]string(nil), request.SubscriptionIDs...)
	return &paddle.CustomerPortalSession{
		ID:         "cpls_server_only",
		CustomerID: request.CustomerID,
		URLs: paddle.CustomerPortalSessionURLs{
			General: paddle.CustomerPortalSessionGeneralURLs{Overview: "https://customer-portal.paddle.com/session-token"},
		},
	}, nil
}

func TestValidPaddleOperationKeyAcceptsBoundedOpaqueKeys(t *testing.T) {
	assert.True(t, validPaddleOperationKey("00000000-0000-4000-8000-000000000001"))
	assert.True(t, validPaddleOperationKey("checkout-1780000000000-deadbeef1234"))
	assert.False(t, validPaddleOperationKey("too-short"))
	assert.False(t, validPaddleOperationKey("checkout/../../other-tenant"))
}

func TestPaddleRequestRejectionClassificationKeepsUnknownGatewayOutcome(t *testing.T) {
	assert.False(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: 0, Type: paddleerr.ErrorTypeRequestError, Code: "bad_gateway",
	}))
	assert.False(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: http.StatusTooManyRequests, Type: paddleerr.ErrorTypeAPIError, Code: "too_many_requests",
	}))
	assert.True(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: http.StatusBadRequest, Type: paddleerr.ErrorTypeRequestError, Code: "bad_request",
	}))
	assert.True(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: http.StatusConflict, Type: paddleerr.ErrorTypeAPIError, Code: "subscription_locked_processing",
	}))
	assert.True(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: http.StatusConflict, Type: paddleerr.ErrorTypeAPIError, Code: "subscription_locked_pending_changes",
	}))
	assert.False(t, paddleRequestDefinitelyRejected(&paddleerr.Error{
		Status: http.StatusConflict, Type: paddleerr.ErrorTypeAPIError, Code: "unknown_conflict",
	}))
}

func TestPaddleCheckoutBindingUsesStableSystemKeyAcrossDestinationRotation(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	before := PaddleConfig{WebhookSecret: "pdl_ntfset_before"}
	after := PaddleConfig{WebhookSecret: "pdl_ntfset_after"}

	binding := before.checkoutBinding(42, "pri_plus_monthly")
	require.NotEmpty(t, binding)
	assert.Equal(t, binding, after.checkoutBinding(42, "pri_plus_monthly"))
	assert.True(t, after.validCheckoutBinding(42, "pri_plus_monthly", binding))

	legacyMAC := hmac.New(sha256.New, []byte(before.WebhookSecret))
	_, _ = legacyMAC.Write([]byte("musuw-paddle-checkout-v1\x0042\x00pri_plus_monthly"))
	legacyBinding := hex.EncodeToString(legacyMAC.Sum(nil))
	assert.True(t, before.validCheckoutBinding(42, "pri_plus_monthly", legacyBinding))
	assert.False(t, after.validCheckoutBinding(42, "pri_plus_monthly", legacyBinding))
}

func (s entitlementHandlerServiceStub) Current(context.Context, time.Time) (*types.ConsumerEntitlement, error) {
	return s.current, nil
}

func (s entitlementHandlerServiceStub) CurrentForTenant(context.Context, uint64, time.Time) (*types.ConsumerEntitlement, error) {
	return s.current, nil
}

func (entitlementHandlerServiceStub) OpenRouterAPIKey(context.Context) (string, error) {
	return "", nil
}

func (entitlementHandlerServiceStub) OpenRouterUserID(context.Context) string { return "" }

func (s entitlementHandlerServiceStub) SetOpenRouterRemainingForTenant(context.Context, uint64, int64) (*types.ConsumerEntitlement, error) {
	return s.current, nil
}

func (s entitlementHandlerServiceStub) GrantComplimentaryPlan(context.Context, uint64, types.ConsumerPlan, time.Time, string) (*types.ConsumerEntitlement, bool, error) {
	return s.current, false, nil
}

func (s entitlementHandlerServiceStub) RevokeComplimentaryPlan(context.Context, uint64, string) (*types.ConsumerEntitlement, bool, error) {
	return s.current, false, nil
}

func (s entitlementHandlerServiceStub) ResolvePaddleSubscription(context.Context, string, string) (*types.PaddleSubscriptionBinding, error) {
	return s.paddleBinding, s.paddleBindingErr
}

func (s entitlementHandlerServiceStub) ApplyConsumerPlan(_ context.Context, _ uint64, plan types.ConsumerPlan, status, billingPeriod, _ string, _ time.Time, customerID, subscriptionID string, periodEnd *time.Time) (bool, error) {
	if s.applyCalls != nil {
		(*s.applyCalls)++
	}
	if s.capturePeriodEnd != nil {
		s.capturePeriodEnd(periodEnd)
	}
	if s.applyErr != nil {
		return false, s.applyErr
	}
	if s.current != nil {
		s.current.ConsumerPlanLimits = types.LimitsForConsumerPlan(plan)
		s.current.PlanStatus = status
		s.current.PaddleBillingPeriod = billingPeriod
		s.current.PaddleCustomerID = customerID
		s.current.PaddleSubscriptionID = subscriptionID
	}
	return true, nil
}

func (s entitlementHandlerServiceStub) RefreshPaidAllowance(context.Context, uint64, types.ConsumerPlan, string, string, time.Time, string, string, time.Time) (bool, error) {
	if s.refreshCalls != nil {
		(*s.refreshCalls)++
	}
	return true, nil
}

func TestPaddlePortalSessionUsesAuthenticatedTenantBillingIdentityAndReturnsOnlyURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	portal := &paddlePortalSessionCreatorStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:   types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:           "canceled",
			PaddleCustomerID:     "ctm_owned_by_tenant",
			PaddleSubscriptionID: "sub_owned_by_tenant",
		}},
		paddle: PaddleConfig{Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test"},
		portal: portal,
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/portal-session", strings.NewReader(`{"customer_id":"ctm_attacker_supplied"}`))
	req = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	c.Request = req

	h.PaddlePortalSession(c)

	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"authorization_url":"https://customer-portal.paddle.com/session-token"}`, recorder.Body.String())
	assert.Equal(t, "ctm_owned_by_tenant", portal.customerID)
	assert.Equal(t, []string{"sub_owned_by_tenant"}, portal.subscriptionIDs)
	assert.NotContains(t, recorder.Body.String(), "ctm_owned_by_tenant")
	assert.NotContains(t, recorder.Body.String(), "cpls_server_only")
}

func TestPaddlePortalSessionRejectsMissingAuthenticatedTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	portal := &paddlePortalSessionCreatorStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{PaddleCustomerID: "ctm_owned_by_tenant"}},
		portal:  portal,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/portal-session", nil)

	h.PaddlePortalSession(c)

	require.NotEmpty(t, c.Errors)
	assert.Empty(t, portal.customerID)
}

func TestPaddlePortalSessionRejectsTenantWithoutPaddleCustomer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	portal := &paddlePortalSessionCreatorStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{}},
		portal:  portal,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/portal-session", nil)
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddlePortalSession(c)

	require.NotEmpty(t, c.Errors)
	assert.Empty(t, portal.customerID)
}

func TestPaddlePortalSessionFailsClosedOnEmptyProviderResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{PaddleCustomerID: "ctm_owned_by_tenant"}},
		portal:  emptyPaddlePortalSessionCreatorStub{},
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/portal-session", nil)
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	assert.NotPanics(t, func() { h.PaddlePortalSession(c) })
	require.NotEmpty(t, c.Errors)
}

func TestPaddleSubscriptionUpgradeUsesOwnedSubscriptionAndServerPrice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment:   "sandbox",
		APIKey:        "pdl_sdbx_apikey_test",
		ClientToken:   "test_client_token",
		WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	subscription := &paddle.Subscription{
		ID:         "sub_owned_by_tenant",
		CustomerID: "ctm_owned_by_tenant",
		Status:     paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{
			Quantity:  1,
			Recurring: true,
			Price:     paddle.Price{ID: "pri_plus_monthly"},
		}},
	}
	nextBilledAt := "2026-09-20T17:20:07.682697Z"
	provider := &paddleSubscriptionUpdaterStub{
		subscription: subscription,
		preview: &paddle.SubscriptionPreview{
			NextBilledAt: &nextBilledAt,
			UpdateSummary: &paddle.SubscriptionPreviewUpdateSummary{
				Result: paddle.UpdateSummaryResult{Action: paddle.UpdateSummaryResultActionCharge, Amount: "900", CurrencyCode: paddle.CurrencyCodeCNY},
			},
			ImmediateTransaction: &paddle.NextTransaction{Details: paddle.TransactionDetailsPreview{Totals: paddle.TransactionTotals{
				Subtotal: "820", Tax: "80", Total: "900", Balance: "900", CurrencyCode: paddle.CurrencyCodeCNY,
			}}},
			RecurringTransactionDetails: paddle.TransactionDetailsPreview{Totals: paddle.TransactionTotals{
				Subtotal: "5900", Tax: "0", Total: "5900", Balance: "5900", CurrencyCode: paddle.CurrencyCodeCNY,
			}},
		},
	}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:   types.LimitsForConsumerPlan(types.ConsumerPlanPlus),
			PlanStatus:           "active",
			PaddleCustomerID:     "ctm_owned_by_tenant",
			PaddleSubscriptionID: "sub_owned_by_tenant",
		}},
		paddle:        config,
		subscriptions: provider,
		operations:    &paddleBillingOperationRepoStub{},
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade/preview", strings.NewReader(`{"plan":"pro","subscription_id":"sub_attacker"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleSubscriptionUpgradePreview(c)

	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{
		"plan":"pro",
		"period":"monthly",
		"action":"charge",
		"prorated_subtotal":"820",
		"prorated_tax":"80",
		"due_today":"900",
		"recurring_total":"5900",
		"currency_code":"CNY",
		"next_billed_at":"2026-09-20T17:20:07.682697Z"
	}`, recorder.Body.String())
	require.NotNil(t, provider.previewReq)
	assert.Equal(t, "sub_owned_by_tenant", provider.previewReq.SubscriptionID)
	require.NotNil(t, provider.previewReq.Items)
	previewItems := *provider.previewReq.Items.Value()
	require.Len(t, previewItems, 1)
	assert.Equal(t, "pri_pro_monthly", previewItems[0].SubscriptionUpdateItemFromCatalog.PriceID)
	assert.Equal(t, 1, previewItems[0].SubscriptionUpdateItemFromCatalog.Quantity)
	assert.Equal(t, paddle.ProrationBillingModeProratedImmediately, *provider.previewReq.ProrationBillingMode.Value())
	assert.Equal(t, paddle.SubscriptionOnPaymentFailurePreventChange, *provider.previewReq.OnPaymentFailure.Value())

	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"00000000-0000-4000-8000-000000000001","customer_id":"ctm_attacker"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleSubscriptionUpgrade(c)

	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusAccepted, recorder.Code)
	assert.JSONEq(t, `{"pending":true,"plan":"pro"}`, recorder.Body.String())
	require.NotNil(t, provider.updateReq)
	assert.Equal(t, "sub_owned_by_tenant", provider.updateReq.SubscriptionID)
	updateItems := *provider.updateReq.Items.Value()
	require.Len(t, updateItems, 1)
	assert.Equal(t, "pri_pro_monthly", updateItems[0].SubscriptionUpdateItemFromCatalog.PriceID)
	customData := *provider.updateReq.CustomData.Value()
	assert.Equal(t, "42", customData["tenant_id"])
	assert.Equal(t, config.checkoutBinding(42, "pri_pro_monthly"), customData["musuw_checkout_binding"])
	assert.Equal(t, "00000000-0000-4000-8000-000000000001", customData["musuw_billing_operation_key"])
	assert.Equal(t, paddle.ProrationBillingModeProratedImmediately, *provider.updateReq.ProrationBillingMode.Value())
	assert.Equal(t, paddle.SubscriptionOnPaymentFailurePreventChange, *provider.updateReq.OnPaymentFailure.Value())
	assert.Equal(t, 1, provider.updateCalls)

	// A retry with the same key reuses the accepted operation even if Paddle
	// already reflects the target before the signed webhook reaches Musuw.
	provider.subscription.Items[0].Price.ID = "pri_pro_monthly"
	provider.subscription.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"00000000-0000-4000-8000-000000000001"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	h.PaddleSubscriptionUpgrade(c)
	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusAccepted, recorder.Code)
	assert.JSONEq(t, `{"pending":true,"plan":"pro"}`, recorder.Body.String())
	assert.Equal(t, 1, provider.updateCalls)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, h.operations.(*paddleBillingOperationRepoStub).finishStatus)
}

func TestPaddleSubscriptionUpgradeReconciliationNeverBlindlyRepeatsMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operationKey := "00000000-0000-4000-8000-000000000001"
	operations := &paddleBillingOperationRepoStub{operation: &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: operationKey, OperationType: types.PaddleBillingOperationUpgrade,
		Plan: types.ConsumerPlanPro, BillingPeriod: "monthly", PriceID: "pri_pro_monthly",
		SubscriptionID: "sub_owned_by_tenant", Status: types.PaddleBillingOperationUncertain,
	}}
	provider := &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
		ID: "sub_owned_by_tenant", CustomerID: "ctm_owned_by_tenant", Status: paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_plus_monthly"}}},
	}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
			PaddleCustomerID: "ctm_owned_by_tenant", PaddleSubscriptionID: "sub_owned_by_tenant",
		}},
		paddle: config, subscriptions: provider, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"`+operationKey+`"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleSubscriptionUpgrade(c)

	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusAccepted, recorder.Code)
	assert.Empty(t, operations.finishStatus, "an unchanged provider read is not proof that the mutation failed")
	assert.Zero(t, provider.updateCalls)

	operations.operation.Status = types.PaddleBillingOperationUncertain
	operations.finishStatus = ""
	provider.getErr = errors.New("provider lookup unavailable")
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"`+operationKey+`"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	h.PaddleSubscriptionUpgrade(c)
	require.NotEmpty(t, c.Errors)
	assert.Empty(t, operations.finishStatus, "a failed provider read must keep the operation recoverable")
	assert.Zero(t, provider.updateCalls)
}

func TestPaddleSubscriptionUpgradeDoesNotReleasePendingSnapshotAfterConcurrentAdvance(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operationKey := "00000000-0000-4000-8000-000000000001"
	operations := &paddleBillingOperationRepoStub{
		claimDisposition: types.PaddleBillingOperationClaimActive,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000009",
			OperationType: types.PaddleBillingOperationUpgrade, Plan: types.ConsumerPlanPlus,
			BillingPeriod: "monthly", PriceID: "pri_plus_monthly", SubscriptionID: "sub_owned",
			Status: types.PaddleBillingOperationPending,
		},
	}
	provider := &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
		ID: "sub_owned", CustomerID: "ctm_owned", Status: paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_plus_monthly"}}},
	}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
			PaddleCustomerID: "ctm_owned", PaddleSubscriptionID: "sub_owned",
		}},
		paddle: config, subscriptions: provider, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"`+operationKey+`"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleSubscriptionUpgrade(c)

	require.NotEmpty(t, c.Errors)
	assert.Equal(t, 1, operations.failPendingCalls)
	assert.Zero(t, provider.updateCalls, "a failed pending CAS must not authorize a replacement Paddle update")
}

func TestPaddleSubscriptionUpgradeRecoversAgedDifferentTargetBeforeRetry(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	old := time.Now().UTC().Add(-paddleUpgradeRecoveryDelay - time.Minute)
	operations := &paddleBillingOperationRepoStub{
		claimDisposition: types.PaddleBillingOperationClaimActive,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000009",
			OperationType: types.PaddleBillingOperationUpgrade, Plan: types.ConsumerPlanMax,
			BillingPeriod: "monthly", PriceID: "pri_max_monthly", SubscriptionID: "sub_owned",
			Status: types.PaddleBillingOperationUncertain, CreatedAt: old, UpdatedAt: old,
		},
	}
	provider := &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
		ID: "sub_owned", CustomerID: "ctm_owned", Status: paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_plus_monthly"}}},
	}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
			PaddleCustomerID: "ctm_owned", PaddleSubscriptionID: "sub_owned",
		}},
		paddle: config, subscriptions: provider,
		transactions: &paddleTransactionClientStub{listResult: paddleTransactionCollection(t)}, operations: operations,
	}
	request := func() *gin.Context {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade", strings.NewReader(`{"plan":"pro","operation_key":"00000000-0000-4000-8000-000000000001"}`))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
		return c
	}

	first := request()
	h.PaddleSubscriptionUpgrade(first)
	require.NotEmpty(t, first.Errors)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
	assert.Zero(t, provider.updateCalls)

	second := request()
	h.PaddleSubscriptionUpgrade(second)
	require.Empty(t, second.Errors)
	assert.Equal(t, 1, provider.updateCalls, "the released old target allows one newly claimed official update")
}

func TestPaddleSubscriptionUpgradeAgedFailureUsesOfficialInventory(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operationKey := "00000000-0000-4000-8000-000000000001"
	old := time.Now().UTC().Add(-paddleUpgradeRecoveryDelay - time.Minute)
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: operationKey, OperationType: types.PaddleBillingOperationUpgrade,
		Plan: types.ConsumerPlanPro, BillingPeriod: "monthly", PriceID: "pri_pro_monthly",
		SubscriptionID: "sub_owned", Status: types.PaddleBillingOperationUncertain,
		CreatedAt: old, UpdatedAt: old,
	}
	subscriptionID := operation.SubscriptionID
	providerTransaction := &paddle.Transaction{
		ID: "txn_failed_upgrade", Status: paddle.TransactionStatusPastDue,
		Origin: paddle.TransactionOriginSubscriptionUpdate, SubscriptionID: &subscriptionID,
		CreatedAt: old.Add(time.Minute).Format(time.RFC3339Nano),
		CustomData: paddle.CustomData{
			"tenant_id": "42", "musuw_billing_operation_key": operationKey,
			"musuw_checkout_binding": config.checkoutBinding(42, operation.PriceID),
		},
		Items: []paddle.TransactionItem{{Quantity: 1, Price: paddle.Price{ID: operation.PriceID}}},
	}
	transactions := &paddleTransactionClientStub{listResult: paddleTransactionCollection(t, providerTransaction)}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
			PaddleCustomerID: "ctm_owned", PaddleSubscriptionID: operation.SubscriptionID,
		}},
		paddle: config,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
			ID: operation.SubscriptionID, CustomerID: "ctm_owned", Status: paddle.SubscriptionStatusActive,
			Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_plus_monthly"}}},
		}},
		transactions: transactions, operations: operations,
	}

	err := h.reconcilePaddleUpgradeOperation(context.Background(), 42, operation)
	require.Error(t, err)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
	require.NotNil(t, transactions.listReq)
	assert.Equal(t, []string{string(paddle.TransactionOriginSubscriptionUpdate)}, transactions.listReq.Origin)
	assert.Equal(t, []string{operation.SubscriptionID}, transactions.listReq.SubscriptionID)
}

func TestPaddleSubscriptionUpgradeAgedNoMatchReleasesOperation(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	old := time.Now().UTC().Add(-paddleUpgradeRecoveryDelay - time.Minute)
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationUpgrade, Plan: types.ConsumerPlanPro,
		BillingPeriod: "monthly", PriceID: "pri_pro_monthly", SubscriptionID: "sub_owned",
		Status: types.PaddleBillingOperationUncertain, CreatedAt: old, UpdatedAt: old,
	}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
			PaddleCustomerID: "ctm_owned", PaddleSubscriptionID: operation.SubscriptionID,
		}},
		paddle: config, operations: operations,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
			ID: operation.SubscriptionID, CustomerID: "ctm_owned", Status: paddle.SubscriptionStatusActive,
			Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_plus_monthly"}}},
		}},
		transactions: &paddleTransactionClientStub{listResult: paddleTransactionCollection(t)},
	}

	err := h.reconcilePaddleUpgradeOperation(context.Background(), 42, operation)

	require.Error(t, err)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
}

func TestPaddleSubscriptionUpgradeProviderSnapshotMustConvergeEntitlementBeforeFinish(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
		},
	}
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationUpgrade, Plan: types.ConsumerPlanPro,
		BillingPeriod: "monthly", PriceID: "pri_pro_monthly", SubscriptionID: "sub_owned",
		Status: types.PaddleBillingOperationUncertain,
	}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{
			current: &types.ConsumerEntitlement{
				ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus), PlanStatus: "active",
				PaddleCustomerID: "ctm_owned", PaddleSubscriptionID: "sub_owned",
			},
			applyErr: errors.New("OpenRouter temporarily unavailable"),
		},
		paddle: config,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
			ID: "sub_owned", CustomerID: "ctm_owned", Status: paddle.SubscriptionStatusActive,
			UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
			Items:     []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_pro_monthly"}}},
		}},
		operations: operations,
	}

	err := h.reconcilePaddleUpgradeOperation(context.Background(), 42, operation)
	require.Error(t, err)
	assert.Empty(t, operations.finishStatus, "provider state alone must not hide failed entitlement convergence")
}

func TestPaddleSubscriptionUpgradeRejectsDowngradeAndProviderOwnershipMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment:   "sandbox",
		APIKey:        "pdl_sdbx_apikey_test",
		ClientToken:   "test_client_token",
		WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	provider := &paddleSubscriptionUpdaterStub{subscription: &paddle.Subscription{
		ID:         "sub_owned_by_tenant",
		CustomerID: "ctm_different_customer",
		Status:     paddle.SubscriptionStatusActive,
		Items:      []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_pro_monthly"}}},
	}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:   types.LimitsForConsumerPlan(types.ConsumerPlanPro),
			PlanStatus:           "active",
			PaddleCustomerID:     "ctm_owned_by_tenant",
			PaddleSubscriptionID: "sub_owned_by_tenant",
		}},
		paddle:        config,
		subscriptions: provider,
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade/preview", strings.NewReader(`{"plan":"plus"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	h.PaddleSubscriptionUpgradePreview(c)
	require.NotEmpty(t, c.Errors)
	assert.Nil(t, provider.previewReq)

	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/subscription-upgrade/preview", strings.NewReader(`{"plan":"max"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	h.PaddleSubscriptionUpgradePreview(c)
	require.NotEmpty(t, c.Errors)
	assert.Nil(t, provider.previewReq)
	assert.Nil(t, provider.updateReq)
}

func TestPaddleCheckoutIntentCreatesOneOfficialTransactionAcrossTabs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_server_owned", Status: paddle.TransactionStatusDraft}}
	operations := &paddleBillingOperationRepoStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	for _, operationKey := range []string{"00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		body := fmt.Sprintf(`{"plan":"plus","billing_period":"monthly","operation_key":%q}`, operationKey)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
		h.PaddleCheckoutIntent(c)
		require.Empty(t, c.Errors)
		assert.JSONEq(t, `{"transaction_id":"txn_server_owned","pending":true}`, recorder.Body.String())
	}
	require.Equal(t, 1, transactions.createCalls)
	require.Equal(t, 1, transactions.getCalls, "the reused transaction must be confirmed with Paddle")
	require.NotNil(t, transactions.createReq)
	require.Len(t, transactions.createReq.Items, 1)
	assert.Equal(t, "pri_plus_monthly", transactions.createReq.Items[0].TransactionItemFromCatalog.PriceID)
	assert.Equal(t, 1, transactions.createReq.Items[0].TransactionItemFromCatalog.Quantity)
	assert.Equal(t, "42", transactions.createReq.CustomData["tenant_id"])
	assert.Equal(t, config.checkoutBinding(42, "pri_plus_monthly"), transactions.createReq.CustomData["musuw_checkout_binding"])
	assert.Equal(t, "00000000-0000-4000-8000-000000000001", transactions.createReq.CustomData["musuw_billing_operation_key"])
	assert.Equal(t, "txn_server_owned", operations.recordedTransaction)
}

func TestPaddleCheckoutIntentAllowsPaddleUnboundComplimentaryTenantToPurchase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_gift_purchase", Status: paddle.TransactionStatusDraft}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPro),
			PlanStatus:         "complimentary",
			PlanSource:         "complimentary",
		}},
		paddle: config, transactions: transactions, operations: &paddleBillingOperationRepoStub{},
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"max","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000003"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.Empty(t, c.Errors)
	assert.Equal(t, 1, transactions.createCalls)
	assert.JSONEq(t, `{"transaction_id":"txn_gift_purchase","pending":true}`, recorder.Body.String())
}

func TestPaddleCheckoutIntentDoesNotCancelProviderTransactionWhenLocalPersistenceFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_provider_owned", Status: paddle.TransactionStatusDraft}}
	operations := &paddleBillingOperationRepoStub{recordErr: errors.New("database temporarily unavailable")}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000001"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.NotEmpty(t, c.Errors)
	assert.Equal(t, types.PaddleBillingOperationUncertain, operations.finishStatus)
	assert.Zero(t, transactions.updateCalls, "local persistence failure must not trigger a second provider mutation")
}

func TestPaddleCheckoutIntentUsesClaimedKeyWhenAnotherTabStartsProviderWrite(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	claimedKey := "00000000-0000-4000-8000-000000000001"
	operations := &paddleBillingOperationRepoStub{
		claimDisposition:  types.PaddleBillingOperationClaimActive,
		failPendingResult: true,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: claimedKey, OperationType: types.PaddleBillingOperationCheckout,
			Plan: types.ConsumerPlanPlus, BillingPeriod: "monthly", PriceID: "pri_plus_monthly",
			RequestFingerprint: paddleBillingOperationFingerprint(types.PaddleBillingOperationCheckout, types.ConsumerPlanPlus, "monthly", "pri_plus_monthly", ""),
			Status:             types.PaddleBillingOperationPending,
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_owned", Status: paddle.TransactionStatusDraft}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.Empty(t, c.Errors)
	require.NotNil(t, transactions.createReq)
	assert.Equal(t, claimedKey, transactions.createReq.CustomData["musuw_billing_operation_key"])
}

func TestPaddleCheckoutIntentReleasesOnlyPreCallPendingSelection(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operations := &paddleBillingOperationRepoStub{
		claimDisposition:  types.PaddleBillingOperationClaimActive,
		failPendingResult: true,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
			OperationType: types.PaddleBillingOperationCheckout, Plan: types.ConsumerPlanPlus,
			BillingPeriod: "monthly", PriceID: "pri_plus_monthly", Status: types.PaddleBillingOperationPending,
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_new_selection", Status: paddle.TransactionStatusDraft}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"pro","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.Empty(t, c.Errors)
	assert.Equal(t, 1, transactions.createCalls)
	assert.Equal(t, 0, transactions.updateCalls, "no provider transaction exists to cancel")
	require.NotNil(t, operations.operation)
	assert.Equal(t, types.ConsumerPlanPro, operations.operation.Plan)
	assert.Equal(t, 1, operations.failPendingCalls)
}

func TestPaddleCheckoutIntentDoesNotReleasePendingSnapshotAfterConcurrentAdvance(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operations := &paddleBillingOperationRepoStub{
		claimDisposition: types.PaddleBillingOperationClaimActive,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
			OperationType: types.PaddleBillingOperationCheckout, Plan: types.ConsumerPlanPlus,
			BillingPeriod: "monthly", PriceID: "pri_plus_monthly", Status: types.PaddleBillingOperationPending,
		},
	}
	transactions := &paddleTransactionClientStub{transaction: &paddle.Transaction{ID: "txn_should_not_create", Status: paddle.TransactionStatusDraft}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"pro","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.NotEmpty(t, c.Errors)
	assert.Equal(t, 1, operations.failPendingCalls)
	assert.Zero(t, transactions.createCalls, "a failed pending CAS must not authorize a replacement Paddle transaction")
}

func TestPaddleCheckoutIntentRecoversAgedDifferentSelectionBeforeRetry(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	old := time.Now().UTC().Add(-paddleCheckoutRecoveryDelay - time.Minute)
	operations := &paddleBillingOperationRepoStub{
		claimDisposition: types.PaddleBillingOperationClaimActive,
		operation: &types.PaddleBillingOperation{
			ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000009",
			OperationType: types.PaddleBillingOperationCheckout, Plan: types.ConsumerPlanPlus,
			BillingPeriod: "monthly", PriceID: "pri_plus_monthly", Status: types.PaddleBillingOperationUncertain,
			CreatedAt: old, UpdatedAt: old,
		},
	}
	transactions := &paddleTransactionClientStub{
		transaction: &paddle.Transaction{ID: "txn_new_selection", Status: paddle.TransactionStatusDraft},
		listResult:  paddleTransactionCollection(t),
	}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	request := func() *gin.Context {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"pro","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000001"}`))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
		return c
	}

	first := request()
	h.PaddleCheckoutIntent(first)
	require.NotEmpty(t, first.Errors)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
	assert.Zero(t, transactions.createCalls)

	second := request()
	h.PaddleCheckoutIntent(second)
	require.Empty(t, second.Errors)
	assert.Equal(t, 1, transactions.createCalls, "the released old selection allows one newly claimed official checkout")
}

func TestRecoverMissingPaddleCheckoutTransactionUsesExactOfficialInventory(t *testing.T) {
	config := PaddleConfig{WebhookSecret: "pdl_ntfset_secret"}
	old := time.Now().UTC().Add(-paddleCheckoutRecoveryDelay - time.Minute)
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout, Plan: types.ConsumerPlanPlus,
		BillingPeriod: "monthly", PriceID: "pri_plus_monthly", Status: types.PaddleBillingOperationUncertain,
		CreatedAt: old, UpdatedAt: old,
	}
	providerTransaction := &paddle.Transaction{
		ID: "txn_recovered", Status: paddle.TransactionStatusDraft, Origin: paddle.TransactionOriginAPI,
		CreatedAt: old.Add(time.Minute).Format(time.RFC3339Nano),
		CustomData: paddle.CustomData{
			"tenant_id": "42", "musuw_billing_operation_key": operation.OperationKey,
			"musuw_checkout_binding": config.checkoutBinding(42, operation.PriceID),
		},
		Items: []paddle.TransactionItem{{Quantity: 1, Price: paddle.Price{ID: operation.PriceID}}},
	}
	transactions := &paddleTransactionClientStub{
		listResult: paddleTransactionCollection(t, providerTransaction),
		getResult:  providerTransaction,
	}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{paddle: config, transactions: transactions, operations: operations}

	transactionID, err := h.recoverMissingPaddleCheckoutTransaction(context.Background(), operation)

	require.NoError(t, err)
	assert.Equal(t, providerTransaction.ID, transactionID)
	assert.Equal(t, providerTransaction.ID, operations.recordedTransaction)
	assert.Equal(t, 1, transactions.listCalls)
	assert.Equal(t, []string{string(paddle.TransactionOriginAPI)}, transactions.listReq.Origin)
}

func TestMissingPaddleCheckoutInventoryReleasesUnknownCreateAfterExhaustiveSearch(t *testing.T) {
	old := time.Now().UTC().Add(-paddleCheckoutRecoveryDelay - time.Minute)
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout, Plan: types.ConsumerPlanPlus,
		BillingPeriod: "monthly", PriceID: "pri_plus_monthly", Status: types.PaddleBillingOperationUncertain,
		CreatedAt: old, UpdatedAt: old,
	}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{
		paddle:       PaddleConfig{WebhookSecret: "pdl_ntfset_secret"},
		transactions: &paddleTransactionClientStub{listResult: paddleTransactionCollection(t)},
		operations:   operations,
	}

	_, err := h.recoverMissingPaddleCheckoutTransaction(context.Background(), operation)

	require.Error(t, err)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
}

func TestCancelUnpaidPaddleCheckoutAcceptsConcurrentOfficialCancellation(t *testing.T) {
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout, PaddleTransactionID: "txn_cancel_once",
		Status: types.PaddleBillingOperationInFlight,
	}
	transactions := &paddleTransactionClientStub{
		getResults: []*paddle.Transaction{
			{ID: operation.PaddleTransactionID, Status: paddle.TransactionStatusDraft},
			{ID: operation.PaddleTransactionID, Status: paddle.TransactionStatusCanceled},
		},
		updateErr: errors.New("concurrent cancellation"),
	}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{transactions: transactions, operations: operations}

	require.NoError(t, h.cancelUnpaidPaddleCheckout(context.Background(), operation))
	assert.Equal(t, 2, transactions.getCalls)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
}

func TestCancelUnpaidPaddleCheckoutRefusesTerminalOperationBeforeProviderWrite(t *testing.T) {
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout, PaddleTransactionID: "txn_already_settled",
		Status: types.PaddleBillingOperationSucceeded,
	}
	transactions := &paddleTransactionClientStub{getResult: &paddle.Transaction{ID: operation.PaddleTransactionID, Status: paddle.TransactionStatusDraft}}
	operations := &paddleBillingOperationRepoStub{operation: operation}
	h := &EntitlementHandler{transactions: transactions, operations: operations}

	err := h.cancelUnpaidPaddleCheckout(context.Background(), operation)

	require.Error(t, err)
	assert.Zero(t, transactions.getCalls, "terminal operations must not be canceled from a stale HTTP snapshot")
	assert.Zero(t, transactions.updateCalls)
}

func TestCancelUnpaidPaddleCheckoutRefusesOperationSettledDuringProviderRead(t *testing.T) {
	operation := &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout, PaddleTransactionID: "txn_settling",
		Status: types.PaddleBillingOperationInFlight,
	}
	transactions := &paddleTransactionClientStub{getResult: &paddle.Transaction{ID: operation.PaddleTransactionID, Status: paddle.TransactionStatusDraft}}
	operations := &paddleBillingOperationRepoStub{operation: operation, terminalOnFindCall: 2}
	h := &EntitlementHandler{transactions: transactions, operations: operations}

	err := h.cancelUnpaidPaddleCheckout(context.Background(), operation)

	require.Error(t, err)
	assert.Equal(t, 2, operations.findCalls)
	assert.Equal(t, 1, transactions.getCalls)
	assert.Zero(t, transactions.updateCalls, "a locally settled operation must not cancel its provider transaction")
}

func TestPaddleCheckoutIntentReconcilesCanceledProviderTransactionBeforeReuse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operations := &paddleBillingOperationRepoStub{operation: &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout,
		Plan:          types.ConsumerPlanPlus, BillingPeriod: "monthly", PriceID: "pri_plus_monthly",
		RequestFingerprint:  paddleBillingOperationFingerprint(types.PaddleBillingOperationCheckout, types.ConsumerPlanPlus, "monthly", "pri_plus_monthly", ""),
		PaddleTransactionID: "txn_canceled", Status: types.PaddleBillingOperationInFlight,
	}}
	transactions := &paddleTransactionClientStub{getResult: &paddle.Transaction{ID: "txn_canceled", Status: paddle.TransactionStatusCanceled}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.NotEmpty(t, c.Errors)
	assert.Equal(t, 1, transactions.getCalls)
	assert.Equal(t, 0, transactions.createCalls)
	assert.Equal(t, types.PaddleBillingOperationFailed, operations.finishStatus)
}

func TestPaddleCheckoutIntentReusesPastDueProviderTransactionAfterDecline(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operations := &paddleBillingOperationRepoStub{operation: &types.PaddleBillingOperation{
		ID: 1, TenantID: 42, OperationKey: "00000000-0000-4000-8000-000000000001",
		OperationType: types.PaddleBillingOperationCheckout,
		Plan:          types.ConsumerPlanPlus, BillingPeriod: "monthly", PriceID: "pri_plus_monthly",
		RequestFingerprint:  paddleBillingOperationFingerprint(types.PaddleBillingOperationCheckout, types.ConsumerPlanPlus, "monthly", "pri_plus_monthly", ""),
		PaddleTransactionID: "txn_declined", Status: types.PaddleBillingOperationInFlight,
	}}
	transactions := &paddleTransactionClientStub{getResult: &paddle.Transaction{ID: "txn_declined", Status: paddle.TransactionStatusPastDue}}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"transaction_id":"txn_declined","pending":true}`, recorder.Body.String())
	assert.Equal(t, 1, transactions.getCalls)
	assert.Zero(t, transactions.createCalls, "a declined transaction must be retried in Paddle instead of duplicated")
	assert.Zero(t, transactions.updateCalls)
	assert.Empty(t, operations.finishStatus, "a declined checkout must remain pending until a signed success event")
}

func TestPaddleCheckoutIntentReplacesOnlyThePreviousUnpaidTransaction(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	transactions := &paddleTransactionClientStub{
		transaction:  &paddle.Transaction{ID: "txn_server_owned", Status: paddle.TransactionStatusDraft},
		updateResult: &paddle.Transaction{ID: "txn_server_owned", Status: paddle.TransactionStatusCanceled},
	}
	operations := &paddleBillingOperationRepoStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, transactions: transactions, operations: operations,
	}
	for index, body := range []string{
		`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000001"}`,
		`{"plan":"pro","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000002"}`,
	} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
		h.PaddleCheckoutIntent(c)
		require.Empty(t, c.Errors, "request %d", index+1)
	}
	assert.Equal(t, 2, transactions.createCalls)
	assert.Equal(t, 1, transactions.updateCalls)
	require.NotNil(t, transactions.updateReq)
	assert.Equal(t, paddle.TransactionStatusCanceled, *transactions.updateReq.Status.Value())
	assert.Equal(t, types.ConsumerPlanPro, operations.operation.Plan)
}

func TestPaddleCheckoutIntentKeepsClaimUncertainWhenProviderCreationMayHaveSucceeded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	config := PaddleConfig{
		Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	operations := &paddleBillingOperationRepoStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree)}},
		paddle:  config, operations: operations,
		transactions: &paddleTransactionClientStub{createErr: errors.New("provider unavailable")},
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly","operation_key":"00000000-0000-4000-8000-000000000001"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.PaddleCheckoutIntent(c)

	require.NotEmpty(t, c.Errors)
	assert.Equal(t, types.PaddleBillingOperationUncertain, operations.finishStatus)
}

func TestPaddleCheckoutIntentRejectsExistingPastDueSubscriptionAfterGrace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:   types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:           "past_due",
			PaddleSubscriptionID: "sub_existing",
		}},
		paddle: PaddleConfig{
			Environment: "sandbox", APIKey: "pdl_sdbx_apikey_test", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
			Prices: map[types.ConsumerPlan]map[string]string{
				types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
				types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
				types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
			},
		},
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/checkout-intent", strings.NewReader(`{"plan":"plus","billing_period":"monthly"}`))
	req.Header.Set("Content-Type", "application/json")
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	h.PaddleCheckoutIntent(c)
	require.NotEmpty(t, c.Errors)
}

func TestCurrentReturnsOnlyServerCatalogForCheckoutIntent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	portal := &paddlePortalSessionCreatorStub{}
	paddleCustomerID := "ctm_" + strings.Repeat("a", 26)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:         "active",
			PaddleCustomerID:   paddleCustomerID,
		}},
		paddle: PaddleConfig{
			Environment:   "sandbox",
			APIKey:        "pdl_sdbx_apikey_test",
			ClientToken:   "test_client_token",
			WebhookSecret: "pdl_ntfset_secret",
			Prices: map[types.ConsumerPlan]map[string]string{
				types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
				types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
				types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
			},
		},
		portal: portal,
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest("GET", "/api/v1/entitlements/current", nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))
	c.Request = req

	h.Current(c)
	require.Equal(t, 200, recorder.Code)
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	var response struct {
		Billing struct {
			Configured       bool   `json:"configured"`
			PortalAvailable  bool   `json:"portal_available"`
			CanManageBilling bool   `json:"can_manage_billing"`
			Environment      string `json:"environment"`
			ClientToken      string `json:"client_token"`
			PWCustomerID     string `json:"pw_customer_id"`
			Catalog          map[string]map[string]struct {
				PriceID string `json:"price_id"`
			} `json:"catalog"`
		} `json:"billing"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Billing.Configured)
	assert.True(t, response.Billing.PortalAvailable)
	assert.False(t, response.Billing.CanManageBilling, "an effective Free tenant without a Paddle subscription cannot manage billing")
	assert.Equal(t, "sandbox", response.Billing.Environment)
	assert.Equal(t, "test_client_token", response.Billing.ClientToken)
	assert.Equal(t, paddleCustomerID, response.Billing.PWCustomerID)
	option := response.Billing.Catalog["plus"]["monthly"]
	assert.Equal(t, "pri_plus_monthly", option.PriceID)
	assert.NotContains(t, recorder.Body.String(), "checkout_binding")
	assert.NotContains(t, recorder.Body.String(), "tenant_id")
}

func TestCurrentExposesBillingRecoveryForExpiredPastDueSubscription(t *testing.T) {
	gin.SetMode(gin.TestMode)
	portal := &paddlePortalSessionCreatorStub{}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:   types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:           "past_due",
			PaddleCustomerID:     "ctm_owned_by_tenant",
			PaddleSubscriptionID: "sub_expired_past_due",
		}},
		paddle: PaddleConfig{
			Environment:   "sandbox",
			APIKey:        "pdl_sdbx_apikey_test",
			ClientToken:   "test_client_token",
			WebhookSecret: "pdl_ntfset_secret",
			Prices: map[types.ConsumerPlan]map[string]string{
				types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
				types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
				types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
			},
		},
		portal: portal,
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/entitlements/current", nil)
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.Current(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Billing struct {
			CanManageBilling bool `json:"can_manage_billing"`
		} `json:"billing"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Billing.CanManageBilling)
	assert.NotContains(t, recorder.Body.String(), "sub_expired_past_due", "the recovery signal must not expose provider identifiers")
}

func TestCurrentOmitsRetainCustomerWithoutAuthenticatedTenantOwnedPaddleCustomer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:         "active",
		}},
		paddle: PaddleConfig{
			Environment:   "sandbox",
			APIKey:        "pdl_sdbx_apikey_test",
			ClientToken:   "test_client_token",
			WebhookSecret: "pdl_ntfset_secret",
			Prices: map[types.ConsumerPlan]map[string]string{
				types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
				types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
				types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
			},
		},
	}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/entitlements/current", nil)
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, uint64(42)))

	h.Current(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "pw_customer_id")
}

func TestPaddleCustomerIDForRetainAcceptsOnlyOfficialCustomerIDs(t *testing.T) {
	valid := "ctm_" + strings.Repeat("a", 26)
	assert.Equal(t, valid, paddleCustomerIDForRetain("  "+valid+"  "))
	for _, invalid := range []string{
		"",
		"ctm_" + strings.Repeat("a", 25),
		"ctm_" + strings.Repeat("a", 27),
		"ctm_" + strings.Repeat("A", 26),
		"sub_" + strings.Repeat("a", 26),
		"tenant-owned-id",
	} {
		assert.Empty(t, paddleCustomerIDForRetain(invalid))
	}
}

func TestPaddleWebhookRejectsUnsignedCheckoutBinding(t *testing.T) {
	calls := 0
	config := PaddleConfig{
		Environment:   "sandbox",
		ClientToken:   "test_client_token",
		WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{applyCalls: &calls},
		paddle:  config,
	}
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_unbound",
		"event_type":"subscription.created",
		"occurred_at":%q,
		"data":{
			"id":"sub_unbound",
			"status":"active",
			"customer_id":"ctm_unbound",
			"custom_data":{"tenant_id":"42"},
			"items":[{"quantity":1,"recurring":true,"price":{"id":"pri_plus_monthly"}}]
		}
	}`, time.Now().UTC().Format(time.RFC3339Nano)))
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(h.paddle.WebhookSecret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))
	header := fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil)))

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest("POST", "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	req.Header.Set("Paddle-Signature", header)
	c.Request = req

	h.PaddleWebhook(c)
	assert.Zero(t, calls)
	assert.NotEmpty(t, c.Errors)
}

func TestPaddleWebhookAppliesServerBoundSubscription(t *testing.T) {
	calls := 0
	queue := &recordingPaddleWebhookEnqueuer{}
	var capturedPeriodEnd *time.Time
	config := PaddleConfig{
		Environment:   "sandbox",
		ClientToken:   "test_client_token",
		WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	binding := config.checkoutBinding(42, "pri_plus_yearly")
	periodStart := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2027, 8, 21, 12, 0, 0, 0, time.UTC)
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_bound",
		"event_type":"subscription.created",
		"occurred_at":%q,
		"data":{
			"id":"sub_bound",
			"transaction_id":"txn_server_owned",
			"status":"active",
			"customer_id":"ctm_bound",
			"custom_data":{"tenant_id":"42","musuw_checkout_binding":%q,"musuw_billing_operation_key":"00000000-0000-4000-8000-000000000001"},
			"current_billing_period":{"starts_at":%q,"ends_at":%q},
			"items":[{"quantity":1,"recurring":true,"price":{"id":"pri_plus_yearly"}}]
		}
	}`, time.Now().UTC().Format(time.RFC3339Nano), binding, periodStart.Format(time.RFC3339Nano), periodEnd.Format(time.RFC3339Nano)))
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(config.WebhookSecret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest("POST", "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	req.Header.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil))))
	c.Request = req

	h := &EntitlementHandler{service: entitlementHandlerServiceStub{
		applyCalls: &calls,
		capturePeriodEnd: func(value *time.Time) {
			capturedPeriodEnd = value
		},
	}, paddle: config, tasks: queue}
	h.PaddleWebhook(c)
	assert.Empty(t, c.Errors)
	assert.Equal(t, 0, calls)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	require.NotNil(t, payload.EventPeriodEnd)
	assert.Equal(t, periodEnd, payload.EventPeriodEnd.UTC())
	assert.Equal(t, types.PaddleBillingOperationCheckout, payload.BillingOperationType)
	assert.Equal(t, "00000000-0000-4000-8000-000000000001", payload.BillingOperationKey)
	assert.Equal(t, "txn_server_owned", payload.TransactionID)
	assert.Nil(t, capturedPeriodEnd)
}

func TestPaddleWebhookQueuesVerifiedWorkBeforeAcknowledging(t *testing.T) {
	applyCalls := 0
	queue := &recordingPaddleWebhookEnqueuer{}
	config := PaddleConfig{
		Environment:   "sandbox",
		APIKey:        "pdl_sdbx_apikey_test",
		ClientToken:   "test_client_token",
		WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	binding := config.checkoutBinding(42, "pri_plus_monthly")
	now := time.Now().UTC()
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_queued",
		"event_type":"subscription.created",
		"occurred_at":%q,
		"data":{
			"id":"sub_queued",
			"status":"active",
			"customer_id":"ctm_queued",
			"custom_data":{"tenant_id":"42","musuw_checkout_binding":%q},
			"current_billing_period":{"starts_at":%q,"ends_at":%q},
			"items":[{"quantity":1,"recurring":true,"price":{"id":"pri_plus_monthly"}}]
		}
	}`, now.Format(time.RFC3339Nano), binding, now.Format(time.RFC3339Nano), now.AddDate(0, 1, 0).Format(time.RFC3339Nano)))
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(config.WebhookSecret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	req.Header.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil))))
	c.Request = req

	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{applyCalls: &applyCalls},
		paddle:  config,
		tasks:   queue,
	}
	h.PaddleWebhook(c)

	require.Empty(t, c.Errors)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"ok":true,"queued":true}`, recorder.Body.String())
	assert.Zero(t, applyCalls, "provider and database work must not run before the webhook response")
	require.NotNil(t, queue.task)
	assert.Equal(t, types.TypePaddleWebhook, queue.task.Type())
	assert.NotContains(t, string(queue.task.Payload()), config.WebhookSecret)
	assert.NotContains(t, string(queue.task.Payload()), "Paddle-Signature")
}

func TestPastDueSubscriptionCannotAdvancePaidTerm(t *testing.T) {
	periodEnd := time.Date(2027, 8, 21, 12, 0, 0, 0, time.UTC)
	period := &paddleBillingPeriod{EndsAt: periodEnd}
	assert.Nil(t, entitledPaddlePeriodEnd("subscription.past_due", "past_due", period))
	assert.Nil(t, entitledPaddlePeriodEnd("subscription.updated", "active", period))
	require.NotNil(t, entitledPaddlePeriodEnd("subscription.created", "active", period))
}

func TestPaddleWebhookRoutesBoundRecurringCompletionToAllowanceRefresh(t *testing.T) {
	config := PaddleConfig{
		Environment: "sandbox", ClientToken: "test_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	for _, period := range []string{"monthly", "yearly"} {
		t.Run(period, func(t *testing.T) {
			applyCalls, refreshCalls := 0, 0
			queue := &recordingPaddleWebhookEnqueuer{}
			priceID := "pri_plus_" + period
			binding := config.checkoutBinding(42, priceID)
			now := time.Now().UTC()
			body := []byte(fmt.Sprintf(`{
		"event_id":"evt_renewal",
		"event_type":"transaction.completed",
		"occurred_at":%q,
		"data":{
			"id":"txn_renewal",
			"status":"completed",
			"origin":"subscription_recurring",
			"customer_id":"ctm_bound",
			"subscription_id":"sub_bound",
			"custom_data":{"tenant_id":"42","musuw_checkout_binding":%q},
			"billing_period":{"starts_at":%q,"ends_at":%q},
			"items":[{"quantity":1,"price":{"id":%q}}]
		}
	}`, now.Format(time.RFC3339Nano), binding, now.Add(-time.Minute).Format(time.RFC3339Nano), now.AddDate(0, 1, 0).Format(time.RFC3339Nano), priceID))
			ts := time.Now().Unix()
			mac := hmac.New(sha256.New, []byte(config.WebhookSecret))
			_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))

			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
			req.Header.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil))))
			c.Request = req

			h := &EntitlementHandler{service: entitlementHandlerServiceStub{applyCalls: &applyCalls, refreshCalls: &refreshCalls}, paddle: config, tasks: queue}
			h.PaddleWebhook(c)
			require.Empty(t, c.Errors)
			assert.Equal(t, 0, applyCalls)
			assert.Equal(t, 0, refreshCalls)
			require.NotNil(t, queue.task)
			var payload types.PaddleWebhookTaskPayload
			require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
			assert.Equal(t, types.PaddleWebhookTaskOperationRefreshPaidAllowance, payload.Operation)
			assert.JSONEq(t, `{"ok":true,"queued":true}`, recorder.Body.String())
		})
	}
}

func TestPaddleWebhookRoutesRecurringCompletionWithoutCustomDataFromDurableBinding(t *testing.T) {
	config := PaddleConfig{
		Environment: "live", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	queue := &recordingPaddleWebhookEnqueuer{}
	now := time.Now().UTC()
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_renewal_without_custom_data",
		"event_type":"transaction.completed",
		"occurred_at":%q,
		"data":{
			"id":"txn_renewal",
			"status":"completed",
			"origin":"subscription_recurring",
			"customer_id":"ctm_bound",
			"subscription_id":"sub_bound",
			"custom_data":null,
			"billing_period":{"starts_at":%q,"ends_at":%q},
			"items":[{"quantity":1,"price":{"id":"pri_pro_monthly"}}]
		}
	}`, now.Format(time.RFC3339Nano), now.Add(-time.Minute).Format(time.RFC3339Nano), now.AddDate(0, 1, 0).Format(time.RFC3339Nano)))
	c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{paddleBinding: &types.PaddleSubscriptionBinding{
			TenantID: 42, Plan: types.ConsumerPlanPro, Status: "active", BillingPeriod: "monthly",
			CustomerID: "ctm_bound", SubscriptionID: "sub_bound",
		}},
		paddle: config, tasks: queue,
	}

	h.PaddleWebhook(c)

	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	assert.Equal(t, uint64(42), payload.TenantID)
	assert.Equal(t, types.PaddleWebhookTaskOperationRefreshPaidAllowance, payload.Operation)
}

func TestPaddleWebhookDefersRecurringRestorationDecisionToTheWorker(t *testing.T) {
	config := PaddleConfig{
		Environment: "live", APIKey: "pdl_live_apikey_test", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	queue := &recordingPaddleWebhookEnqueuer{}
	now := time.Now().UTC()
	periodEnd := now.AddDate(0, 1, 0)
	binding := config.checkoutBinding(42, "pri_pro_monthly")
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_paid_after_refund",
		"event_type":"transaction.completed",
		"occurred_at":%q,
		"data":{
			"id":"txn_paid_after_refund",
			"status":"completed",
			"origin":"subscription_recurring",
			"customer_id":"ctm_current",
			"subscription_id":"sub_current",
			"custom_data":{"tenant_id":"42","musuw_checkout_binding":%q},
			"billing_period":{"starts_at":%q,"ends_at":%q},
			"items":[{"quantity":1,"price":{"id":"pri_pro_monthly"}}]
		}
	}`, now.Format(time.RFC3339Nano), binding, now.Format(time.RFC3339Nano), periodEnd.Format(time.RFC3339Nano)))
	c, _ := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{service: entitlementHandlerServiceStub{}, paddle: config, tasks: queue}
	h.PaddleWebhook(c)
	require.Empty(t, c.Errors)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	assert.Equal(t, types.PaddleWebhookTaskOperationRefreshPaidAllowance, payload.Operation)
	assert.Equal(t, types.ConsumerPlanPro, payload.Plan)
	assert.Equal(t, "monthly", payload.BillingPeriod)
	require.NotNil(t, payload.EventPeriodEnd)
	assert.Equal(t, periodEnd, payload.EventPeriodEnd.UTC())
}

func signedPaddleWebhookTestContext(t *testing.T, secret string, body []byte) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	req.Header.Set("Paddle-Signature", fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil))))
	c.Request = req
	return c, recorder
}

func TestPaddleAdjustmentDecisionRevokesOnlyFullFinalLoss(t *testing.T) {
	tests := []struct {
		name   string
		action string
		kind   string
		status string
		want   paddleAdjustmentDecision
	}{
		{name: "approved full refund", action: "refund", kind: "full", status: "approved", want: paddleAdjustmentRevoke},
		{name: "approved full chargeback", action: "chargeback", kind: "full", status: "approved", want: paddleAdjustmentRevoke},
		{name: "chargeback reversal", action: "chargeback_reverse", kind: "full", status: "approved", want: paddleAdjustmentReconcile},
		{name: "pending refund", action: "refund", kind: "full", status: "pending_approval", want: paddleAdjustmentIgnore},
		{name: "rejected refund", action: "refund", kind: "full", status: "rejected", want: paddleAdjustmentIgnore},
		{name: "partial refund", action: "refund", kind: "partial", status: "approved", want: paddleAdjustmentIgnore},
		{name: "credit", action: "credit", kind: "full", status: "approved", want: paddleAdjustmentIgnore},
		{name: "chargeback warning", action: "chargeback_warning", kind: "full", status: "approved", want: paddleAdjustmentIgnore},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, decidePaddleAdjustment(test.action, test.kind, test.status))
		})
	}
}

func TestPaddleWebhookQueuesCurrentSubscriptionFullRefundRevocation(t *testing.T) {
	queue := &recordingPaddleWebhookEnqueuer{}
	config := PaddleConfig{
		Environment: "live", APIKey: "pdl_live_apikey_test", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	now := time.Now().UTC()
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_refund_approved",
		"event_type":"adjustment.updated",
		"occurred_at":%q,
		"data":{
			"id":"adj_refund",
			"action":"refund",
			"type":"full",
			"status":"approved",
			"customer_id":"ctm_current",
			"subscription_id":"sub_current"
		}
	}`, now.Format(time.RFC3339Nano)))
	c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{paddleBinding: &types.PaddleSubscriptionBinding{
			TenantID: 42, Plan: types.ConsumerPlanPro, Status: "active", BillingPeriod: "monthly",
			CustomerID: "ctm_current", SubscriptionID: "sub_current",
		}},
		paddle: config,
		tasks:  queue,
	}
	h.PaddleWebhook(c)
	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	assert.Equal(t, types.PaddleWebhookTaskOperationApplyConsumerPlan, payload.Operation)
	assert.Equal(t, types.ConsumerPlanPro, payload.Plan)
	assert.Equal(t, "refunded", payload.Status)
	assert.Equal(t, uint64(42), payload.TenantID)
	assert.Equal(t, "ctm_current", payload.CustomerID)
	assert.Equal(t, "sub_current", payload.SubscriptionID)
	assert.JSONEq(t, `{"ok":true,"queued":true}`, recorder.Body.String())
}

func TestPaddleWebhookRecoversOutOfOrderAdjustmentBindingFromOfficialSubscription(t *testing.T) {
	queue := &recordingPaddleWebhookEnqueuer{}
	config := PaddleConfig{
		Environment: "live", APIKey: "pdl_live_apikey_test", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	now := time.Now().UTC()
	subscription := &paddle.Subscription{
		ID: "sub_current", CustomerID: "ctm_current", Status: paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_pro_monthly"}}},
		CustomData: paddle.CustomData{
			"tenant_id":              "42",
			"musuw_checkout_binding": config.checkoutBinding(42, "pri_pro_monthly"),
		},
	}
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_out_of_order_refund",
		"event_type":"adjustment.updated",
		"occurred_at":%q,
		"data":{
			"id":"adj_out_of_order_refund",
			"action":"refund",
			"type":"full",
			"status":"approved",
			"customer_id":"ctm_current",
			"subscription_id":"sub_current"
		}
	}`, now.Format(time.RFC3339Nano)))
	c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{
		service:       entitlementHandlerServiceStub{},
		paddle:        config,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: subscription},
		tasks:         queue,
	}
	h.PaddleWebhook(c)
	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	assert.Equal(t, uint64(42), payload.TenantID)
	assert.Equal(t, types.ConsumerPlanPro, payload.Plan)
	assert.Equal(t, "refunded", payload.Status)
	assert.Equal(t, "ctm_current", payload.CustomerID)
	assert.Equal(t, "sub_current", payload.SubscriptionID)
}

func TestPaddleWebhookRejectsOutOfOrderAdjustmentWithTamperedSubscriptionBinding(t *testing.T) {
	queue := &recordingPaddleWebhookEnqueuer{}
	config := PaddleConfig{
		Environment: "live", APIKey: "pdl_live_apikey_test", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	now := time.Now().UTC()
	subscription := &paddle.Subscription{
		ID: "sub_current", CustomerID: "ctm_current", Status: paddle.SubscriptionStatusActive,
		Items: []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_pro_monthly"}}},
		CustomData: paddle.CustomData{
			"tenant_id":              "42",
			"musuw_checkout_binding": "tampered",
		},
	}
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_tampered_out_of_order_refund",
		"event_type":"adjustment.updated",
		"occurred_at":%q,
		"data":{
			"id":"adj_tampered_out_of_order_refund",
			"action":"refund",
			"type":"full",
			"status":"approved",
			"customer_id":"ctm_current",
			"subscription_id":"sub_current"
		}
	}`, now.Format(time.RFC3339Nano)))
	c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{
		service:       entitlementHandlerServiceStub{},
		paddle:        config,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: subscription},
		tasks:         queue,
	}
	h.PaddleWebhook(c)
	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Nil(t, queue.task)
	assert.JSONEq(t, `{"ok":true,"applied":false}`, recorder.Body.String())
}

func TestPaddleWebhookIgnoresPartialOrPendingAdjustment(t *testing.T) {
	config := PaddleConfig{
		Environment: "live", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	for _, body := range [][]byte{
		[]byte(fmt.Sprintf(`{"event_id":"evt_partial","event_type":"adjustment.created","occurred_at":%q,"data":{"id":"adj_partial","action":"refund","type":"partial","status":"approved","customer_id":"ctm_current","subscription_id":"sub_current"}}`, time.Now().UTC().Format(time.RFC3339Nano))),
		[]byte(fmt.Sprintf(`{"event_id":"evt_pending","event_type":"adjustment.created","occurred_at":%q,"data":{"id":"adj_pending","action":"refund","type":"full","status":"pending_approval","customer_id":"ctm_current","subscription_id":"sub_current"}}`, time.Now().UTC().Format(time.RFC3339Nano))),
	} {
		queue := &recordingPaddleWebhookEnqueuer{}
		c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
		h := &EntitlementHandler{service: entitlementHandlerServiceStub{}, paddle: config, tasks: queue}
		h.PaddleWebhook(c)
		require.Empty(t, c.Errors)
		assert.Nil(t, queue.task)
		assert.JSONEq(t, `{"ok":true,"applied":false}`, recorder.Body.String())
	}
}

func TestPaddleWebhookReconcilesChargebackReversalFromOfficialSubscription(t *testing.T) {
	queue := &recordingPaddleWebhookEnqueuer{}
	config := PaddleConfig{
		Environment: "live", APIKey: "pdl_live_apikey_test", ClientToken: "live_client_token", WebhookSecret: "pdl_ntfset_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly", "yearly": "pri_plus_yearly"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly", "yearly": "pri_pro_yearly"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly", "yearly": "pri_max_yearly"},
		},
	}
	now := time.Now().UTC()
	periodEnd := now.AddDate(0, 1, 0)
	subscription := &paddle.Subscription{
		ID: "sub_current", CustomerID: "ctm_current", Status: paddle.SubscriptionStatusActive,
		CurrentBillingPeriod: &paddle.TimePeriod{StartsAt: now.Format(time.RFC3339Nano), EndsAt: periodEnd.Format(time.RFC3339Nano)},
		Items:                []paddle.SubscriptionItem{{Quantity: 1, Recurring: true, Price: paddle.Price{ID: "pri_pro_monthly"}}},
	}
	body := []byte(fmt.Sprintf(`{
		"event_id":"evt_chargeback_reversed",
		"event_type":"adjustment.created",
		"occurred_at":%q,
		"data":{
			"id":"adj_chargeback_reverse",
			"action":"chargeback_reverse",
			"type":"full",
			"status":"approved",
			"customer_id":"ctm_current",
			"subscription_id":"sub_current"
		}
	}`, now.Format(time.RFC3339Nano)))
	c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
	h := &EntitlementHandler{
		service: entitlementHandlerServiceStub{paddleBinding: &types.PaddleSubscriptionBinding{
			TenantID: 42, Plan: types.ConsumerPlanFree, Status: "chargeback",
			CustomerID: "ctm_current", SubscriptionID: "sub_current",
		}},
		paddle:        config,
		subscriptions: &paddleSubscriptionUpdaterStub{subscription: subscription},
		tasks:         queue,
	}
	h.PaddleWebhook(c)
	require.Empty(t, c.Errors)
	assert.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, queue.task)
	var payload types.PaddleWebhookTaskPayload
	require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
	assert.Equal(t, types.ConsumerPlanPro, payload.Plan)
	assert.Equal(t, "active", payload.Status)
	assert.Equal(t, "monthly", payload.BillingPeriod)
	require.NotNil(t, payload.EventPeriodEnd)
	assert.Equal(t, periodEnd, payload.EventPeriodEnd.UTC())
}

func TestVerifyPaddleRequestPreservesTheSignedBody(t *testing.T) {
	secret := "pdl_secret"
	body := []byte(`{"event_id":"evt_1"}`)
	ts := time.Now().Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d:%s", ts, body)))
	header := fmt.Sprintf("ts=%d;h1=%s", ts, hex.EncodeToString(mac.Sum(nil)))

	req := httptest.NewRequest("POST", "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	req.Header.Set("Paddle-Signature", header)
	assert.NoError(t, verifyPaddleRequest(secret, req))
	restored, err := io.ReadAll(req.Body)
	require.NoError(t, err)
	assert.Equal(t, body, restored)

	bad := httptest.NewRequest("POST", "/api/v1/billing/paddle/webhook", bytes.NewReader(body))
	bad.Header.Set("Paddle-Signature", header[:len(header)-1]+"x")
	assert.Error(t, verifyPaddleRequest(secret, bad))
}

func TestPaddlePlanMappingRequiresKnownServerPrice(t *testing.T) {
	config := PaddleConfig{Prices: map[types.ConsumerPlan]map[string]string{types.ConsumerPlanPlus: {"monthly": "pri_plus"}}}
	plan, ok := config.planForPrice("pri_plus")
	assert.True(t, ok)
	assert.Equal(t, "plus", string(plan))

	_, ok = config.planForPrice("pri_attacker")
	assert.False(t, ok)
}

func TestOnlySubscriptionEventsCanChangeConsumerEntitlements(t *testing.T) {
	assert.False(t, isEntitlementPaddleEvent("transaction.completed"))
	for _, eventType := range []string{
		"subscription.created",
		"subscription.activated",
		"subscription.trialing",
		"subscription.past_due",
		"subscription.updated",
		"subscription.paused",
		"subscription.resumed",
		"subscription.canceled",
	} {
		assert.True(t, isEntitlementPaddleEvent(eventType), eventType)
	}
}

func TestPaddleCancellationStillRequiresKnownServerPrice(t *testing.T) {
	config := PaddleConfig{Prices: map[types.ConsumerPlan]map[string]string{types.ConsumerPlanPlus: {"monthly": "pri_plus"}}}
	event := paddleEvent{EventType: "subscription.canceled"}
	event.Data.Items = append(event.Data.Items, paddleEventItem{Quantity: 1, Recurring: true})
	event.Data.Items[0].Price.ID = "pri_attacker"
	_, _, _, _, err := config.planForEvent(event)
	assert.Error(t, err)

	event.Data.Items[0].Price.ID = "pri_plus"
	plan, status, priceID, period, err := config.planForEvent(event)
	assert.NoError(t, err)
	assert.Equal(t, "free", string(plan))
	assert.Equal(t, "canceled", status)
	assert.Equal(t, "pri_plus", priceID)
	assert.Equal(t, "monthly", period)

	event.EventType = "subscription.paused"
	plan, status, _, period, err = config.planForEvent(event)
	assert.NoError(t, err)
	assert.Equal(t, "plus", string(plan))
	assert.Equal(t, "paused", status)
	assert.Equal(t, "monthly", period)
}

func TestPaddlePlanMappingRejectsMultipleOrUnknownItems(t *testing.T) {
	config := PaddleConfig{Prices: map[types.ConsumerPlan]map[string]string{types.ConsumerPlanPlus: {"monthly": "pri_plus"}}}
	event := paddleEvent{EventType: "subscription.created"}
	item := paddleEventItem{Quantity: 1, Recurring: true}
	item.Price.ID = "pri_plus"
	event.Data.Items = []paddleEventItem{item, item}
	_, _, _, _, err := config.planForEvent(event)
	assert.Error(t, err)
	event.Data.Items = event.Data.Items[:1]
	event.Data.Items[0].Price.ID = "pri_unknown"
	_, _, _, _, err = config.planForEvent(event)
	assert.Error(t, err)
	event.Data.Items[0].Price.ID = "pri_plus"
	event.Data.Items[0].Quantity = 2
	_, _, _, _, err = config.planForEvent(event)
	assert.Error(t, err)
	event.Data.Items[0].Quantity = 1
	event.Data.Items[0].Recurring = false
	_, _, _, _, err = config.planForEvent(event)
	assert.Error(t, err)
}
