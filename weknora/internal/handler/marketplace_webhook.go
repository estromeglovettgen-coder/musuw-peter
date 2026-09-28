package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
)

func marketplaceEventCustomData(event paddleEvent) paddle.CustomData {
	var custom paddle.CustomData
	if len(event.Data.CustomData) > 0 {
		_ = json.Unmarshal(event.Data.CustomData, &custom)
	}
	return custom
}

func (h *MarketplaceHandler) enqueueMarketplaceEvent(c *gin.Context, event types.MarketplaceBillingEvent) bool {
	if h.tasks == nil {
		marketplaceHTTPError(c, fmt.Errorf("marketplace billing queue is unavailable"))
		return false
	}
	if err := event.Validate(); err != nil {
		marketplaceHTTPError(c, err)
		return false
	}
	body, err := json.Marshal(event)
	if err != nil {
		marketplaceHTTPError(c, err)
		return false
	}
	_, err = h.tasks.Enqueue(
		asynq.NewTask(types.TypeMarketplaceWebhook, body),
		asynq.Queue(types.QueueBilling),
		asynq.MaxRetry(types.PaddleWebhookTaskMaxRetry),
		asynq.Timeout(types.PaddleWebhookTaskTimeout),
	)
	if err != nil {
		marketplaceHTTPError(c, err)
		return false
	}
	return true
}

// handleVerifiedWebhook is reached exclusively after PaddleWebhook verifies
// the untouched request body. Its bool says whether this is a marketplace event.
func (h *MarketplaceHandler) handleVerifiedWebhook(c *gin.Context, event paddleEvent) bool {
	if h.service == nil || h.billing == nil {
		return false
	}
	custom := marketplaceEventCustomData(event)
	localID := paddleCustomDataString(custom, "musuw_marketplace_subscription_id")
	providerID := strings.TrimSpace(event.Data.SubscriptionID)
	if strings.HasPrefix(event.EventType, "subscription.") {
		providerID = strings.TrimSpace(event.Data.ID)
	}
	transactionID := strings.TrimSpace(event.Data.TransactionID)
	if strings.HasPrefix(event.EventType, "transaction.") {
		transactionID = strings.TrimSpace(event.Data.ID)
	}
	sub, err := h.service.ResolveBillingSubscription(c.Request.Context(), providerID, transactionID)
	known := err == nil && sub != nil
	if err != nil && !errors.Is(err, types.ErrMarketplaceNotFound) {
		marketplaceHTTPError(c, err)
		return true
	}
	if !known {
		if localID == "" {
			return false
		}
		sub, err = h.service.GetBillingSubscription(c.Request.Context(), localID)
		if err != nil {
			marketplaceHTTPError(c, err)
			return true
		}
		if paddleCustomDataString(custom, "tenant_id") != strconv.FormatUint(sub.TenantID, 10) ||
			paddleCustomDataString(custom, "musuw_marketplace_product_id") != sub.ProductID ||
			!validEncodedPaddleCheckoutBinding(
				marketplaceCheckoutBinding(h.billing.paddle, sub),
				paddleCustomDataString(custom, "musuw_marketplace_binding"),
			) {
			marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
			return true
		}
	} else if localID != "" && localID != sub.ID {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		return true
	}
	if event.EventType != "transaction.completed" && !isEntitlementPaddleEvent(event.EventType) &&
		!isAdjustmentPaddleEvent(event.EventType) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
		return true
	}
	// Unknown provider IDs can only acquire the local row through its server MAC.
	// Once bound, both provider IDs must continue to agree with that exact row.
	if providerID == "" || event.Data.CustomerID == "" ||
		(sub.PaddleSubscriptionID != "" && sub.PaddleSubscriptionID != providerID) ||
		(sub.PaddleCustomerID != "" && sub.PaddleCustomerID != event.Data.CustomerID) {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		return true
	}
	payload := types.MarketplaceBillingEvent{
		EventID:              event.EventID,
		EventType:            event.EventType,
		OccurredAt:           event.OccurredAt,
		SubscriptionID:       sub.ID,
		PaddleSubscriptionID: providerID,
		CustomerID:           event.Data.CustomerID,
		TransactionID:        transactionID,
		Status:               event.Data.Status,
		Action:               event.Data.Action,
		AdjustmentType:       event.Data.Type,
		Currency:             event.Data.CurrencyCode,
		Amount:               event.Data.Details.Totals.Total,
	}
	if isAdjustmentPaddleEvent(event.EventType) {
		decision := decidePaddleAdjustment(event.Data.Action, event.Data.Type, event.Data.Status)
		if decision == paddleAdjustmentIgnore {
			c.JSON(http.StatusOK, gin.H{"ok": true, "applied": false})
			return true
		}
		// Reconcile the exact adjusted invoice first. An out-of-order refund must
		// never guess which purchased term it removes.
		resolved := *sub
		resolved.PaddleCustomerID = event.Data.CustomerID
		resolved.PaddleSubscriptionID = providerID
		recovered, err := h.recoverMarketplaceTransaction(c.Request.Context(), &resolved, transactionID)
		if err != nil {
			marketplaceHTTPError(c, err)
			return true
		}
		if !h.enqueueMarketplaceEvent(c, *recovered) {
			return true
		}
		if decision == paddleAdjustmentReconcile {
			if h.billing.subscriptions == nil {
				marketplaceHTTPError(c, fmt.Errorf("paddle subscription reconciliation is unavailable"))
				return true
			}
			providerCtx, cancel := context.WithTimeout(c.Request.Context(), paddleMutationTimeout)
			defer cancel()
			current, err := h.billing.subscriptions.GetSubscription(
				providerCtx,
				&paddle.GetSubscriptionRequest{SubscriptionID: providerID},
			)
			if err != nil {
				marketplaceHTTPError(c, err)
				return true
			}
			if current == nil || current.ID != providerID || current.CustomerID != event.Data.CustomerID ||
				!paddleSubscriptionHasOneRecurringItem(current) ||
				current.Items[0].Price.ID != sub.PriceID {
				marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
				return true
			}
			payload.ReconciledStatus = string(current.Status)
		}
	} else {
		if len(event.Data.Items) != 1 || event.Data.Items[0].Quantity != 1 ||
			event.Data.Items[0].Price.ID != sub.PriceID ||
			(strings.HasPrefix(event.EventType, "subscription.") && !event.Data.Items[0].Recurring) {
			marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
			return true
		}
		payload.PriceID = sub.PriceID
		period := event.Data.BillingPeriod
		if strings.HasPrefix(event.EventType, "subscription.") {
			period = event.Data.CurrentBillingPeriod
		}
		if period != nil {
			start, end := period.StartsAt.UTC(), period.EndsAt.UTC()
			if !start.IsZero() {
				payload.PeriodStartsAt = &start
			}
			if !end.IsZero() {
				payload.PeriodEndsAt = &end
			}
		}
		if event.Data.ScheduledChange != nil {
			payload.CancelAtPeriodEnd = event.Data.ScheduledChange.Action == "cancel"
			if !event.Data.ScheduledChange.EffectiveAt.IsZero() {
				at := event.Data.ScheduledChange.EffectiveAt.UTC()
				payload.ScheduledChangeAt = &at
			}
		}
	}
	if !h.enqueueMarketplaceEvent(c, payload) {
		return true
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "queued": true})
	return true
}

func (h *MarketplaceHandler) recoverMarketplaceTransaction(
	ctx context.Context,
	sub *types.MarketplaceSubscription,
	transactionID string,
) (*types.MarketplaceBillingEvent, error) {
	if transactionID == "" || h.billing.transactions == nil {
		return nil, fmt.Errorf("adjusted Paddle invoice is unavailable")
	}
	providerCtx, cancel := context.WithTimeout(ctx, paddleMutationTimeout)
	defer cancel()
	txn, err := h.billing.transactions.GetTransaction(
		providerCtx,
		&paddle.GetTransactionRequest{TransactionID: transactionID},
	)
	if err != nil {
		return nil, err
	}
	if txn == nil || txn.ID != transactionID || txn.SubscriptionID == nil ||
		*txn.SubscriptionID != sub.PaddleSubscriptionID ||
		txn.CustomerID == nil ||
		*txn.CustomerID != sub.PaddleCustomerID ||
		txn.Status != paddle.TransactionStatusCompleted ||
		len(txn.Items) != 1 ||
		txn.Items[0].Quantity != 1 ||
		txn.Items[0].Price.ID != sub.PriceID {
		return nil, types.ErrMarketplaceForbidden
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, txn.CreatedAt)
	if err != nil {
		return nil, err
	}
	event := &types.MarketplaceBillingEvent{
		EventID:              "marketplace-recovery:" + transactionID,
		EventType:            "transaction.completed",
		OccurredAt:           occurredAt,
		SubscriptionID:       sub.ID,
		PaddleSubscriptionID: *txn.SubscriptionID,
		CustomerID:           *txn.CustomerID,
		TransactionID:        transactionID,
		PriceID:              sub.PriceID,
		Status:               "completed",
		Currency:             string(txn.CurrencyCode),
		Amount:               txn.Details.Totals.Total,
	}
	if txn.BillingPeriod != nil {
		start, err := time.Parse(time.RFC3339Nano, txn.BillingPeriod.StartsAt)
		if err != nil {
			return nil, err
		}
		end, err := time.Parse(time.RFC3339Nano, txn.BillingPeriod.EndsAt)
		if err != nil {
			return nil, err
		}
		event.PeriodStartsAt = &start
		event.PeriodEndsAt = &end
	}
	return event, nil
}

type marketplaceWebhookTaskHandler struct{ service interfaces.MarketplaceService }

// NewMarketplaceWebhookTaskHandler processes verified events on the billing queue.
func NewMarketplaceWebhookTaskHandler(service interfaces.MarketplaceService) interfaces.TaskHandler {
	return &marketplaceWebhookTaskHandler{service: service}
}

func (h *marketplaceWebhookTaskHandler) Handle(ctx context.Context, task *asynq.Task) error {
	if h == nil || h.service == nil || task == nil {
		return fmt.Errorf("marketplace billing worker is unavailable")
	}
	var payload types.MarketplaceBillingEvent
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return err
	}
	if err := payload.Validate(); err != nil {
		return err
	}
	_, err := h.service.ProcessBillingEvent(ctx, payload)
	return err
}
