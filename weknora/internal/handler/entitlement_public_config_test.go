package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPaddlePublicConfigReturnsOnlyPaddleJSRuntimeValues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &EntitlementHandler{paddle: completePublicPaddleConfig()}

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/billing/paddle/public-config", nil)

	h.PaddlePublicConfig(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{
		"configured": true,
		"environment": "sandbox",
		"client_token": "test_public_client_token"
	}`, recorder.Body.String())
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	assert.NotContains(t, recorder.Body.String(), "server_secret")
	assert.NotContains(t, recorder.Body.String(), "pri_server_only")
	assert.NotContains(t, recorder.Body.String(), "tenant")
	assert.NotContains(t, recorder.Body.String(), "binding")
}

func TestPaddlePublicConfigFailsClosedUntilServerFulfillmentIsConfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tt := range []struct {
		name   string
		mutate func(*PaddleConfig)
	}{
		{name: "missing API key", mutate: func(c *PaddleConfig) { c.APIKey = "" }},
		{name: "missing webhook secret", mutate: func(c *PaddleConfig) { c.WebhookSecret = "" }},
		{name: "missing catalog price", mutate: func(c *PaddleConfig) {
			delete(c.Prices[types.ConsumerPlanMax], "yearly")
		}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			config := completePublicPaddleConfig()
			tt.mutate(&config)
			h := &EntitlementHandler{paddle: config}
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/billing/paddle/public-config", nil)

			h.PaddlePublicConfig(c)

			require.Equal(t, http.StatusOK, recorder.Code)
			assert.JSONEq(t, `{"configured":false}`, recorder.Body.String())
		})
	}
}

func TestPaddlePublicConfigFailsClosedForUnknownMissingOrMismatchedValues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tt := range []struct {
		name        string
		environment string
		token       string
	}{
		{name: "missing environment", token: "test_public_client_token"},
		{name: "missing token", environment: "sandbox"},
		{name: "unknown environment", environment: "staging", token: "test_public_client_token"},
		{name: "sandbox with live token", environment: "sandbox", token: "live_public_client_token"},
		{name: "live with sandbox token", environment: "live", token: "test_public_client_token"},
		{name: "bare sandbox prefix", environment: "sandbox", token: "test_"},
		{name: "bare live prefix", environment: "live", token: "live_"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			h := &EntitlementHandler{paddle: PaddleConfig{
				Environment:   tt.environment,
				ClientToken:   tt.token,
				APIKey:        "pdl_secret_must_not_leak",
				WebhookSecret: "webhook_secret_must_not_leak",
			}}
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/billing/paddle/public-config", nil)

			h.PaddlePublicConfig(c)

			require.Equal(t, http.StatusOK, recorder.Code)
			var response map[string]any
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, map[string]any{"configured": false}, response)
			assert.NotContains(t, recorder.Body.String(), "secret")
		})
	}
}

func completePublicPaddleConfig() PaddleConfig {
	return PaddleConfig{
		Environment:   " sandbox ",
		APIKey:        "pdl_sdbx_apikey_server_secret",
		ClientToken:   "test_public_client_token",
		WebhookSecret: "pdl_ntfset_server_secret",
		Prices: map[types.ConsumerPlan]map[string]string{
			types.ConsumerPlanPlus: {"monthly": "pri_plus_monthly_server_only", "yearly": "pri_plus_yearly_server_only"},
			types.ConsumerPlanPro:  {"monthly": "pri_pro_monthly_server_only", "yearly": "pri_pro_yearly_server_only"},
			types.ConsumerPlanMax:  {"monthly": "pri_max_monthly_server_only", "yearly": "pri_max_yearly_server_only"},
		},
	}
}
