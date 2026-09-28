package router

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type paddleWebhookEntitlementStub struct {
	interfaces.EntitlementService
	applyCalls         int
	refreshCalls       int
	applyPayload       types.PaddleWebhookTaskPayload
	refreshPayload     types.PaddleWebhookTaskPayload
	applyResult        *bool
	applyErr           error
	refreshErr         error
	resolvedBinding    *types.PaddleSubscriptionBinding
	resolvedBindingErr error
}

type paddleWebhookBillingOperationStub struct {
	finishCalls        int
	finishTenantID     uint64
	finishOperationKey string
	finishPriceID      string
	finishTransaction  string
	finishSubscription string
	finishStatus       types.PaddleBillingOperationStatus
	finishMismatch     bool
	foundOperation     *types.PaddleBillingOperation
}

func (*paddleWebhookBillingOperationStub) Claim(context.Context, types.PaddleBillingOperationIntent) (*types.PaddleBillingOperation, types.PaddleBillingOperationClaimDisposition, error) {
	return nil, "", errors.New("Claim is not used by the webhook worker test")
}

func (s *paddleWebhookBillingOperationStub) FindByKey(context.Context, uint64, string) (*types.PaddleBillingOperation, bool, error) {
	return s.foundOperation, s.foundOperation != nil, nil
}

func (*paddleWebhookBillingOperationStub) MarkInFlight(context.Context, uint64) (bool, error) {
	return false, errors.New("MarkInFlight is not used by the webhook worker test")
}

func (*paddleWebhookBillingOperationStub) FailPendingWithoutProviderWrite(context.Context, uint64, string) (bool, error) {
	return false, errors.New("FailPendingWithoutProviderWrite is not used by the webhook worker test")
}

func (*paddleWebhookBillingOperationStub) RecordPaddleTransaction(context.Context, uint64, string) error {
	return errors.New("RecordPaddleTransaction is not used by the webhook worker test")
}

func (*paddleWebhookBillingOperationStub) Finish(context.Context, uint64, types.PaddleBillingOperationStatus, string, string) error {
	return errors.New("Finish is not used by the webhook worker test")
}

func (s *paddleWebhookBillingOperationStub) FinishMatchingActive(
	_ context.Context,
	tenantID uint64,
	_ types.PaddleBillingOperationType,
	operationKey, priceID, transactionID, subscriptionID string,
	status types.PaddleBillingOperationStatus,
	_ string,
	_ string,
) (bool, error) {
	s.finishCalls++
	s.finishTenantID = tenantID
	s.finishOperationKey = operationKey
	s.finishPriceID = priceID
	s.finishTransaction = transactionID
	s.finishSubscription = subscriptionID
	s.finishStatus = status
	return !s.finishMismatch, nil
}

func (s *paddleWebhookEntitlementStub) ApplyConsumerPlan(
	_ context.Context,
	tenantID uint64,
	plan types.ConsumerPlan,
	status, billingPeriod, eventID string,
	occurredAt time.Time,
	customerID, subscriptionID string,
	eventPeriodEnd *time.Time,
) (bool, error) {
	s.applyCalls++
	s.applyPayload = types.PaddleWebhookTaskPayload{
		TenantID: tenantID, Plan: plan, Status: status, BillingPeriod: billingPeriod,
		EventID: eventID, OccurredAt: occurredAt, CustomerID: customerID,
		SubscriptionID: subscriptionID, EventPeriodEnd: eventPeriodEnd,
	}
	if s.applyErr != nil {
		return false, s.applyErr
	}
	if s.applyResult != nil {
		return *s.applyResult, nil
	}
	return true, nil
}

func (s *paddleWebhookEntitlementStub) ResolvePaddleSubscription(
	_ context.Context, _, _ string,
) (*types.PaddleSubscriptionBinding, error) {
	return s.resolvedBinding, s.resolvedBindingErr
}

func (s *paddleWebhookEntitlementStub) RefreshPaidAllowance(
	_ context.Context,
	tenantID uint64,
	plan types.ConsumerPlan,
	billingPeriod string,
	eventID string,
	occurredAt time.Time,
	customerID, subscriptionID string,
	periodEnd time.Time,
) (bool, error) {
	s.refreshCalls++
	s.refreshPayload = types.PaddleWebhookTaskPayload{
		TenantID: tenantID, Plan: plan, BillingPeriod: billingPeriod, EventID: eventID, OccurredAt: occurredAt,
		CustomerID: customerID, SubscriptionID: subscriptionID,
		EventPeriodEnd: &periodEnd,
	}
	return s.refreshErr == nil, s.refreshErr
}

func paddleWebhookTestPayload(operation types.PaddleWebhookTaskOperation) types.PaddleWebhookTaskPayload {
	periodEnd := time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC)
	return types.PaddleWebhookTaskPayload{
		TenantID:       7,
		Operation:      operation,
		Plan:           types.ConsumerPlanPro,
		Status:         "active",
		BillingPeriod:  "monthly",
		EventID:        "evt_test",
		OccurredAt:     time.Date(2026, time.August, 25, 0, 0, 0, 0, time.UTC),
		CustomerID:     "ctm_test",
		SubscriptionID: "sub_test",
		EventPeriodEnd: &periodEnd,
	}
}

func TestPaddleWebhookTaskHandlerAppliesConsumerPlan(t *testing.T) {
	stub := &paddleWebhookEntitlementStub{}
	handler := NewPaddleWebhookTaskHandler(stub)
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body)); err != nil {
		t.Fatalf("Handle returned error: %v", err)
	}
	if stub.applyCalls != 1 || stub.refreshCalls != 0 {
		t.Fatalf("calls = apply:%d refresh:%d", stub.applyCalls, stub.refreshCalls)
	}
	if stub.applyPayload.EventID != payload.EventID || stub.applyPayload.Plan != payload.Plan {
		t.Fatalf("unexpected apply payload: %+v", stub.applyPayload)
	}
}

func TestPaddleWebhookTaskHandlerDoesNotFinishOperationWhenEntitlementWasNotApplied(t *testing.T) {
	notApplied := false
	entitlements := &paddleWebhookEntitlementStub{applyResult: &notApplied}
	operations := &paddleWebhookBillingOperationStub{foundOperation: &types.PaddleBillingOperation{
		TenantID:       7,
		OperationKey:   "upgrade-operation-key",
		OperationType:  types.PaddleBillingOperationUpgrade,
		Plan:           types.ConsumerPlanPro,
		BillingPeriod:  "monthly",
		PriceID:        "pri_pro_monthly",
		SubscriptionID: "sub_test",
		Status:         types.PaddleBillingOperationFailed,
	}}
	handler := NewPaddleWebhookTaskHandler(entitlements, operations)
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.BillingOperationType = types.PaddleBillingOperationUpgrade
	payload.BillingOperationKey = "upgrade-operation-key"
	payload.PriceID = "pri_pro_monthly"
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body)); err == nil {
		t.Fatal("an unapplied entitlement must be retried instead of settling the billing operation")
	}
	if operations.finishCalls != 0 {
		t.Fatalf("FinishMatchingActive calls = %d, want 0", operations.finishCalls)
	}
}

func TestPaddleWebhookTaskHandlerAcknowledgesStaleLifecycleEventForSucceededOperation(t *testing.T) {
	notApplied := false
	entitlements := &paddleWebhookEntitlementStub{applyResult: &notApplied}
	operations := &paddleWebhookBillingOperationStub{foundOperation: &types.PaddleBillingOperation{
		TenantID:      7,
		OperationKey:  "upgrade-operation-key",
		OperationType: types.PaddleBillingOperationCheckout,
		Plan:          types.ConsumerPlanPlus,
		BillingPeriod: "monthly",
		PriceID:       "pri_plus_monthly",
		Status:        types.PaddleBillingOperationSucceeded,
	}}
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.EventType = "subscription.updated"
	payload.BillingOperationType = types.PaddleBillingOperationUpgrade
	payload.BillingOperationKey = "upgrade-operation-key"
	payload.PriceID = "pri_pro_monthly"
	payload.SubscriptionID = "sub_lifecycle"
	payload.TransactionID = "" // Lifecycle updates commonly omit transaction IDs.
	body, err := json.Marshal(payload)
	require.NoError(t, err)

	err = NewPaddleWebhookTaskHandler(entitlements, operations).Handle(
		context.Background(), asynq.NewTask(types.TypePaddleWebhook, body),
	)
	require.NoError(t, err)
	assert.Zero(t, operations.finishCalls)
}

func TestPaddleWebhookTaskHandlerSettlesStaleCheckoutAfterActivatedBinding(t *testing.T) {
	notApplied := false
	entitlements := &paddleWebhookEntitlementStub{
		applyResult: &notApplied,
		resolvedBinding: &types.PaddleSubscriptionBinding{
			TenantID: 7, Plan: types.ConsumerPlanMax, Status: "active", BillingPeriod: "monthly",
			CustomerID: "ctm_test", SubscriptionID: "sub_test",
		},
	}
	operations := &paddleWebhookBillingOperationStub{}
	handler := NewPaddleWebhookTaskHandler(entitlements, operations)
	periodEnd := time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC)
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.Plan = types.ConsumerPlanMax
	payload.Status = "active"
	payload.PriceID = "pri_max_monthly"
	payload.EventType = "subscription.created"
	payload.TransactionID = "txn_test"
	payload.EventPeriodEnd = &periodEnd
	payload.BillingOperationType = types.PaddleBillingOperationCheckout
	payload.BillingOperationKey = "checkout-operation-key"
	payload.CustomerID = "ctm_test"
	payload.SubscriptionID = "sub_test"
	body, err := json.Marshal(payload)
	require.NoError(t, err)

	// The activated event has already applied the entitlement and advanced its
	// lifecycle cursor, so the later created event is stale. Its exact durable
	// tenant/subscription binding still permits settling the matching checkout.
	err = handler.Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body))
	require.NoError(t, err)
	assert.Equal(t, 1, operations.finishCalls)
	assert.Equal(t, payload.TenantID, operations.finishTenantID)
	assert.Equal(t, payload.BillingOperationKey, operations.finishOperationKey)
	assert.Equal(t, payload.PriceID, operations.finishPriceID)
	assert.Equal(t, payload.TransactionID, operations.finishTransaction)
	assert.Equal(t, payload.SubscriptionID, operations.finishSubscription)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, operations.finishStatus)
}

func TestPaddleWebhookTaskHandlerDoesNotSettleStaleCheckoutForWrongBinding(t *testing.T) {
	notApplied := false
	entitlements := &paddleWebhookEntitlementStub{
		applyResult: &notApplied,
		resolvedBinding: &types.PaddleSubscriptionBinding{
			// The event's signed coordinates belong to a previous subscription;
			// never settle its operation against this tenant's current state.
			TenantID: 7, Plan: types.ConsumerPlanMax, Status: "active", BillingPeriod: "monthly",
			CustomerID: "ctm_test", SubscriptionID: "sub_previous",
		},
	}
	operations := &paddleWebhookBillingOperationStub{}
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.Plan = types.ConsumerPlanMax
	payload.Status = "active"
	payload.PriceID = "pri_max_monthly"
	payload.EventType = "subscription.created"
	payload.TransactionID = "txn_test"
	payload.BillingOperationType = types.PaddleBillingOperationCheckout
	payload.BillingOperationKey = "checkout-operation-key"
	payload.CustomerID = "ctm_test"
	payload.SubscriptionID = "sub_current"
	periodEnd := time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC)
	payload.EventPeriodEnd = &periodEnd
	body, err := json.Marshal(payload)
	require.NoError(t, err)

	err = NewPaddleWebhookTaskHandler(entitlements, operations).Handle(
		context.Background(), asynq.NewTask(types.TypePaddleWebhook, body),
	)
	if err == nil {
		t.Fatal("a stale checkout with a non-current subscription binding must be retried")
	}
	assert.Zero(t, operations.finishCalls)
}

func TestPaddleWebhookTaskHandlerFinishesMatchingOperationAfterEntitlementApplied(t *testing.T) {
	entitlements := &paddleWebhookEntitlementStub{}
	operations := &paddleWebhookBillingOperationStub{}
	handler := NewPaddleWebhookTaskHandler(entitlements, operations)
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.BillingOperationType = types.PaddleBillingOperationUpgrade
	payload.BillingOperationKey = "upgrade-operation-key"
	payload.PriceID = "pri_pro_monthly"
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body)); err != nil {
		t.Fatalf("Handle returned error: %v", err)
	}
	if operations.finishCalls != 1 {
		t.Fatalf("FinishMatchingActive calls = %d, want 1", operations.finishCalls)
	}
	if operations.finishTenantID != payload.TenantID ||
		operations.finishOperationKey != payload.BillingOperationKey ||
		operations.finishPriceID != payload.PriceID ||
		operations.finishSubscription != payload.SubscriptionID ||
		operations.finishStatus != types.PaddleBillingOperationSucceeded {
		t.Fatalf("unexpected operation completion: %+v", operations)
	}
}

func TestPaddleWebhookTaskHandlerRetriesMismatchedActiveOperation(t *testing.T) {
	entitlements := &paddleWebhookEntitlementStub{}
	operations := &paddleWebhookBillingOperationStub{finishMismatch: true}
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	payload.BillingOperationType = types.PaddleBillingOperationUpgrade
	payload.BillingOperationKey = "old-upgrade-operation"
	payload.PriceID = "pri_pro_monthly"
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	err = NewPaddleWebhookTaskHandler(entitlements, operations).Handle(
		context.Background(), asynq.NewTask(types.TypePaddleWebhook, body),
	)
	if err == nil {
		t.Fatal("mismatched active operation must be retried instead of silently acknowledged")
	}
	if operations.finishCalls != 1 {
		t.Fatalf("FinishMatchingActive calls = %d, want 1", operations.finishCalls)
	}
}

func TestPaddleWebhookTaskHandlerRefreshesPaidAllowance(t *testing.T) {
	stub := &paddleWebhookEntitlementStub{}
	handler := NewPaddleWebhookTaskHandler(stub)
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationRefreshPaidAllowance)
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	if err := handler.Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body)); err != nil {
		t.Fatalf("Handle returned error: %v", err)
	}
	if stub.applyCalls != 0 || stub.refreshCalls != 1 {
		t.Fatalf("calls = apply:%d refresh:%d", stub.applyCalls, stub.refreshCalls)
	}
	if stub.refreshPayload.EventID != payload.EventID || stub.refreshPayload.EventPeriodEnd == nil {
		t.Fatalf("unexpected refresh payload: %+v", stub.refreshPayload)
	}
}

func TestPaddleWebhookTaskHandlerPropagatesServiceError(t *testing.T) {
	want := errors.New("temporary entitlement failure")
	stub := &paddleWebhookEntitlementStub{applyErr: want}
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}

	err = NewPaddleWebhookTaskHandler(stub).Handle(context.Background(), asynq.NewTask(types.TypePaddleWebhook, body))
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
}

func TestPaddleWebhookTaskHandlerAcknowledgesLateEventAfterTenantErasure(t *testing.T) {
	tests := []struct {
		name      string
		operation types.PaddleWebhookTaskOperation
		eventType string
	}{
		{name: "lifecycle", operation: types.PaddleWebhookTaskOperationApplyConsumerPlan, eventType: "subscription.updated"},
		{name: "renewal", operation: types.PaddleWebhookTaskOperationRefreshPaidAllowance, eventType: "transaction.completed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			entitlements := &paddleWebhookEntitlementStub{
				applyErr:   apprepo.ErrTenantNotFound,
				refreshErr: apprepo.ErrTenantNotFound,
			}
			operations := &paddleWebhookBillingOperationStub{}
			payload := paddleWebhookTestPayload(test.operation)
			payload.EventType = test.eventType
			payload.BillingOperationType = types.PaddleBillingOperationUpgrade
			payload.BillingOperationKey = "erased-account-operation"
			payload.PriceID = "pri_erased_account"
			body, err := json.Marshal(payload)
			require.NoError(t, err)

			err = NewPaddleWebhookTaskHandler(entitlements, operations).Handle(
				context.Background(), asynq.NewTask(types.TypePaddleWebhook, body),
			)
			require.NoError(t, err)
			assert.Zero(t, operations.finishCalls)
		})
	}
}

func TestPaddleWebhookTaskHandlerRejectsMalformedPayload(t *testing.T) {
	stub := &paddleWebhookEntitlementStub{}
	err := NewPaddleWebhookTaskHandler(stub).Handle(
		context.Background(),
		asynq.NewTask(types.TypePaddleWebhook, []byte(`{"tenant_id":7,"event_id":"evt_test"}`)),
	)
	if err == nil {
		t.Fatal("expected malformed payload error")
	}
	if stub.applyCalls != 0 || stub.refreshCalls != 0 {
		t.Fatal("malformed payload must not call entitlement service")
	}
}

func TestNewPaddleWebhookTaskUsesBillingQueueAndBoundedRetry(t *testing.T) {
	payload := paddleWebhookTestPayload(types.PaddleWebhookTaskOperationApplyConsumerPlan)
	task, err := NewPaddleWebhookTask(payload)
	if err != nil {
		t.Fatalf("NewPaddleWebhookTask returned error: %v", err)
	}
	if task.Type() != types.TypePaddleWebhook {
		t.Fatalf("task type = %q", task.Type())
	}

	options := PaddleWebhookTaskOptions(payload)
	var queue string
	var maxRetry *int
	var timeout time.Duration
	for _, option := range options {
		switch option.Type() {
		case asynq.QueueOpt:
			queue, _ = option.Value().(string)
		case asynq.MaxRetryOpt:
			value, _ := option.Value().(int)
			maxRetry = &value
		case asynq.TimeoutOpt:
			timeout, _ = option.Value().(time.Duration)
		}
	}
	if queue != types.QueueBilling {
		t.Fatalf("queue = %q, want %q", queue, types.QueueBilling)
	}
	if maxRetry == nil || *maxRetry <= 0 || *maxRetry > PaddleWebhookTaskMaxRetry {
		t.Fatalf("max retry = %v, want bounded positive retry", maxRetry)
	}
	if timeout <= 0 || timeout > PaddleWebhookTaskTimeout {
		t.Fatalf("timeout = %s, want bounded timeout", timeout)
	}
	if string(task.Payload()) == "" {
		t.Fatal("expected serialized payload")
	}
}
