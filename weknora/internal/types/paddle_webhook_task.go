package types

import (
	"fmt"
	"strings"
	"time"
)

// TypePaddleWebhook is the internal task type for already-authenticated Paddle
// events. The HTTP handler is responsible for signature verification and event
// projection; workers only receive this canonical, secret-free projection.
const TypePaddleWebhook = "paddle:webhook"

const (
	PaddleWebhookTaskMaxRetry = 5
	PaddleWebhookTaskTimeout  = 30 * time.Second
)

// PaddleWebhookTaskOperation selects the one entitlement mutation a worker
// should perform. Keeping this explicit prevents workers from having to carry
// or reinterpret the provider's raw event body.
type PaddleWebhookTaskOperation string

const (
	PaddleWebhookTaskOperationApplyConsumerPlan    PaddleWebhookTaskOperation = "apply_consumer_plan"
	PaddleWebhookTaskOperationRefreshPaidAllowance PaddleWebhookTaskOperation = "refresh_paid_allowance"
)

// PaddleWebhookTaskPayload is the canonical projection of the fields needed by
// EntitlementService. It deliberately contains no Paddle signature, request
// headers, API key, webhook secret, or raw provider payload.
//
// EventID and OccurredAt remain in the task so the existing entitlement service
// and repository enforce durable idempotency. Queue task IDs are deliberately
// not reused: Paddle redelivery must remain executable after an earlier task
// exhausted retries and was archived.
type PaddleWebhookTaskPayload struct {
	TenantID             uint64                     `json:"tenant_id"`
	Operation            PaddleWebhookTaskOperation `json:"operation"`
	Plan                 ConsumerPlan               `json:"plan"`
	Status               string                     `json:"status,omitempty"`
	BillingPeriod        string                     `json:"billing_period,omitempty"`
	EventID              string                     `json:"event_id"`
	OccurredAt           time.Time                  `json:"occurred_at"`
	CustomerID           string                     `json:"customer_id,omitempty"`
	SubscriptionID       string                     `json:"subscription_id,omitempty"`
	TransactionID        string                     `json:"transaction_id,omitempty"`
	PriceID              string                     `json:"price_id,omitempty"`
	EventType            string                     `json:"event_type,omitempty"`
	BillingOperationType PaddleBillingOperationType `json:"billing_operation_type,omitempty"`
	BillingOperationKey  string                     `json:"billing_operation_key,omitempty"`
	EventPeriodEnd       *time.Time                 `json:"event_period_end,omitempty"`
}

// Validate checks the worker contract without reaching the database or Paddle.
// Provider-specific lifecycle rules remain in EntitlementService so the HTTP
// and asynchronous paths share exactly one idempotent business authority.
func (p PaddleWebhookTaskPayload) Validate() error {
	if p.TenantID == 0 {
		return fmt.Errorf("paddle webhook task tenant_id is required")
	}
	if strings.TrimSpace(p.EventID) == "" {
		return fmt.Errorf("paddle webhook task event_id is required")
	}
	if p.OccurredAt.IsZero() {
		return fmt.Errorf("paddle webhook task occurred_at is required")
	}
	switch p.Operation {
	case PaddleWebhookTaskOperationApplyConsumerPlan:
		if strings.TrimSpace(p.Status) == "" {
			return fmt.Errorf("paddle webhook task status is required for plan application")
		}
		if p.Plan != ConsumerPlanFree && p.Plan != ConsumerPlanPlus && p.Plan != ConsumerPlanPro && p.Plan != ConsumerPlanMax {
			return fmt.Errorf("paddle webhook task plan is invalid")
		}
		if p.Plan != ConsumerPlanFree && p.BillingPeriod != "monthly" && p.BillingPeriod != "yearly" {
			return fmt.Errorf("paddle webhook task billing_period is invalid")
		}
		if p.BillingOperationType != "" {
			if p.BillingOperationType != PaddleBillingOperationCheckout && p.BillingOperationType != PaddleBillingOperationUpgrade {
				return fmt.Errorf("paddle webhook task billing operation type is invalid")
			}
			if strings.TrimSpace(p.PriceID) == "" {
				return fmt.Errorf("paddle webhook task price_id is required for operation completion")
			}
			if strings.TrimSpace(p.BillingOperationKey) == "" {
				return fmt.Errorf("paddle webhook task billing operation key is required for operation completion")
			}
			if strings.TrimSpace(p.SubscriptionID) == "" {
				return fmt.Errorf("paddle webhook task subscription_id is required for operation completion")
			}
			if p.BillingOperationType == PaddleBillingOperationCheckout &&
				(p.EventType != "subscription.created" || strings.TrimSpace(p.TransactionID) == "" ||
					p.EventPeriodEnd == nil || p.EventPeriodEnd.IsZero() || !p.EventPeriodEnd.After(p.OccurredAt)) {
				return fmt.Errorf("paddle webhook checkout completion requires subscription.created with transaction_id and confirmed period")
			}
		}
	case PaddleWebhookTaskOperationRefreshPaidAllowance:
		if p.Plan != ConsumerPlanPlus && p.Plan != ConsumerPlanPro && p.Plan != ConsumerPlanMax {
			return fmt.Errorf("paddle webhook task refresh plan is invalid")
		}
		if p.BillingPeriod != "monthly" && p.BillingPeriod != "yearly" {
			return fmt.Errorf("paddle webhook task refresh billing_period is invalid")
		}
		if strings.TrimSpace(p.CustomerID) == "" || strings.TrimSpace(p.SubscriptionID) == "" {
			return fmt.Errorf("paddle webhook task refresh subscription binding is incomplete")
		}
		if p.EventPeriodEnd == nil || p.EventPeriodEnd.IsZero() || !p.EventPeriodEnd.After(p.OccurredAt) {
			return fmt.Errorf("paddle webhook task event_period_end is invalid")
		}
	default:
		return fmt.Errorf("paddle webhook task operation %q is invalid", p.Operation)
	}
	return nil
}
