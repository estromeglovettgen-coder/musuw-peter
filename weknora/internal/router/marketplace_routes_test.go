package router

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLiteMarketplaceRoutesExposeOnlyCatalogAndReviewSurface(t *testing.T) {
	for _, item := range []struct{ method, path string }{
		{"GET", "/api/v1/creator-marketplace/products"},
		{"GET", "/api/v1/creator-marketplace/products/product/preview"},
		{"POST", "/api/v1/creator-marketplace/products/product/checkout"},
		{"GET", "/api/v1/creator-marketplace/orders"},
		{"GET", "/api/v1/system/creator-marketplace/products"},
		{"PUT", "/api/v1/system/creator-marketplace/products/product"},
		{"POST", "/api/v1/system/creator-marketplace/products/product/review"},
	} {
		require.False(t, liteProductRouteBlocked(item.method, item.path), "%s %s", item.method, item.path)
	}
	for _, item := range []struct{ method, path string }{
		{"DELETE", "/api/v1/system/creator-marketplace/products/product"},
		{"POST", "/api/v1/system/creator-marketplace/products/product/anything"},
		{"GET", "/api/v1/system/admin/settings"},
	} {
		require.True(t, liteProductRouteBlocked(item.method, item.path), "%s %s", item.method, item.path)
	}
}
