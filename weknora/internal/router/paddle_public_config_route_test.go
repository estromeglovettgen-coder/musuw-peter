package router

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPaddlePublicConfigRouteIsPreciselyAnonymousAndReadOnly(t *testing.T) {
	source, err := os.ReadFile("router.go")
	require.NoError(t, err)
	text := string(source)
	route := `r.GET("/api/v1/billing/paddle/public-config", params.EntitlementHandler.PaddlePublicConfig)`
	routeIndex := strings.Index(text, route)
	authIndex := strings.Index(text, "r.Use(middleware.Auth(")

	require.NotEqual(t, -1, routeIndex, "public Paddle.js config GET must be registered")
	require.NotEqual(t, -1, authIndex, "authentication middleware must remain registered")
	require.Less(t, routeIndex, authIndex, "the payment-link config must be reachable without login")
	require.Equal(t, 1, strings.Count(text, "/api/v1/billing/paddle/public-config"))
	require.NotContains(t, text, `r.POST("/api/v1/billing/paddle/public-config"`)
}

func TestPaddleBillingMutationRoutesRequireTenantAdmin(t *testing.T) {
	source, err := os.ReadFile("router.go")
	require.NoError(t, err)
	text := string(source)

	// These endpoints either create a hosted billing-management session,
	// return a checkout intent, or mutate/preview a subscription. Keep the
	// existing entitlement read available to every authenticated member, but
	// require the shared Owner-or-Admin guard for each billing action.
	routes := []string{
		`v1.POST("/billing/paddle/portal-session", rbacGuards.Admin(), params.EntitlementHandler.PaddlePortalSession)`,
		`v1.POST("/billing/paddle/checkout-intent", rbacGuards.Admin(), params.EntitlementHandler.PaddleCheckoutIntent)`,
		`v1.POST("/billing/paddle/subscription-upgrade/preview", rbacGuards.Admin(), params.EntitlementHandler.PaddleSubscriptionUpgradePreview)`,
		`v1.POST("/billing/paddle/subscription-upgrade", rbacGuards.Admin(), params.EntitlementHandler.PaddleSubscriptionUpgrade)`,
	}
	for _, route := range routes {
		require.Equal(t, 1, strings.Count(text, route), "billing route must have exactly one Admin guard: %s", route)
	}
	require.Contains(t, text, `v1.GET("/entitlements/current", params.EntitlementHandler.Current)`,
		"entitlement reads should remain authenticated-member readable")
}
