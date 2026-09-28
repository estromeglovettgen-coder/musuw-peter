package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type marketplaceWebhookServiceStub struct {
	interfaces.MarketplaceService
	sub          *types.MarketplaceSubscription
	known        bool
	resolveCalls int
}

func (s *marketplaceWebhookServiceStub) ResolveBillingSubscription(
	context.Context,
	string,
	string,
) (*types.MarketplaceSubscription, error) {
	s.resolveCalls++
	if s.known {
		return s.sub, nil
	}
	return nil, types.ErrMarketplaceNotFound
}

func (s *marketplaceWebhookServiceStub) GetBillingSubscription(
	_ context.Context,
	id string,
) (*types.MarketplaceSubscription, error) {
	if id == s.sub.ID {
		return s.sub, nil
	}
	return nil, types.ErrMarketplaceNotFound
}

func TestMarketplaceWebhookRequiresRawSignatureAndServerBindingBeforeQueueing(t *testing.T) {
	config := PaddleConfig{
		Environment:   "sandbox",
		ClientToken:   "test_unit",
		WebhookSecret: "unit-secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {
				"monthly": "pri_plus_month",
				"yearly":  "pri_plus_year",
			},
			types.ConsumerPlanPro: {"monthly": "pri_pro_month", "yearly": "pri_pro_year"},
			types.ConsumerPlanMax: {"monthly": "pri_max_month", "yearly": "pri_max_year"},
		},
	}
	sub := &types.MarketplaceSubscription{
		ID:           "local",
		TenantID:     7,
		ProductID:    "product",
		PriceID:      "pri_market",
		OperationKey: "operation",
	}
	now := time.Now().UTC()
	end := now.AddDate(0, 1, 0)
	for _, test := range []struct {
		name      string
		signature bool
		binding   bool
		known     bool
	}{
		{"unsigned", false, true, false},
		{"tampered binding", true, false, false},
		{"first verified subscription", true, true, false},
		{"known renewal without metadata", true, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			local := *sub
			if test.known {
				local.PaddleCustomerID = "ctm_buyer"
				local.PaddleSubscriptionID = "sub_product"
			}
			svc := &marketplaceWebhookServiceStub{sub: &local, known: test.known}
			queue := &recordingPaddleWebhookEnqueuer{}
			h := &EntitlementHandler{paddle: config, tasks: queue}
			NewMarketplaceHandler(svc, h, queue)
			custom := marketplaceCheckoutCustomData(config, sub)
			if !test.binding {
				custom["musuw_marketplace_binding"] = "invalid"
			}
			if test.known {
				custom = nil
			}
			body, err := json.Marshal(
				map[string]any{
					"event_id":    "evt_market",
					"event_type":  "subscription.created",
					"occurred_at": now,
					"data": map[string]any{
						"id":                     "sub_product",
						"customer_id":            "ctm_buyer",
						"status":                 "active",
						"custom_data":            custom,
						"current_billing_period": map[string]any{"starts_at": now, "ends_at": end},
						"items": []any{
							map[string]any{
								"quantity":  1,
								"recurring": true,
								"price":     map[string]any{"id": "pri_market"},
							},
						},
					},
				},
			)
			require.NoError(t, err)
			c, recorder := signedPaddleWebhookTestContext(t, config.WebhookSecret, body)
			if !test.signature {
				c.Request.Header.Del("Paddle-Signature")
			}
			h.PaddleWebhook(c)
			if !test.signature {
				require.NotEmpty(t, c.Errors)
				require.Zero(t, svc.resolveCalls)
				require.Nil(t, queue.task)
				return
			}
			if !test.binding && !test.known {
				require.NotEmpty(t, c.Errors)
				require.Contains(t, c.Errors[0].Error(), "marketplace access denied")
				require.Nil(t, queue.task)
				return
			}
			require.Empty(t, c.Errors)
			require.Equal(t, http.StatusOK, recorder.Code)
			require.NotNil(t, queue.task)
			require.Equal(t, types.TypeMarketplaceWebhook, queue.task.Type())
			var payload types.MarketplaceBillingEvent
			require.NoError(t, json.Unmarshal(queue.task.Payload(), &payload))
			require.Equal(t, local.ID, payload.SubscriptionID)
			require.Equal(t, "pri_market", payload.PriceID)
			require.Equal(t, end, payload.PeriodEndsAt.UTC())
			require.NotContains(t, string(queue.task.Payload()), "musuw_marketplace_binding")
		})
	}
}
