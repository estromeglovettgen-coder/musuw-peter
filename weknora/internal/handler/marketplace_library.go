package handler

import (
	"net/http"
	"slices"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

// Library retains safe cards for purchased knowledge bases, including expired terms.
func (h *MarketplaceHandler) Library(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	rows, err := h.service.Library(c.Request.Context())
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// AuthorizeLibraryKnowledgeBase permits only the explicit read aliases. It
// issues the existing exact-resource grant without replacing buyer identity.
func (h *MarketplaceHandler) AuthorizeLibraryKnowledgeBase(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	ctx := c.Request.Context()
	tenant, ok := types.TenantIDFromContext(ctx)
	if !ok || c.Request.Method != http.MethodGet {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		c.Abort()
		return
	}
	at := time.Now().UTC()
	access, err := h.service.AuthorizeAccess(ctx, tenant, c.Param("id"), at)
	if err != nil {
		marketplaceHTTPError(c, err)
		c.Abort()
		return
	}
	if access == nil || access.SubscriptionID == "" || !slices.Contains(access.KnowledgeBaseIDs, c.Param("kb_id")) {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		c.Abort()
		return
	}
	// Free chat access has no purchased-library entitlement. Read the existing
	// authorized subscription rather than materializing a separate grant.
	subscription, err := h.service.GetBillingSubscription(ctx, access.SubscriptionID)
	if err != nil {
		marketplaceHTTPError(c, err)
		c.Abort()
		return
	}
	if subscription == nil || subscription.TenantID != tenant || subscription.ProductID != access.ProductID ||
		subscription.LastPaymentAt == nil || !subscription.HasAccess(at) {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		c.Abort()
		return
	}
	ctx = types.WithMarketplaceScope(ctx, tenant, access)
	if _, ok := types.MarketplaceScopeFromContext(ctx); !ok {
		marketplaceHTTPError(c, types.ErrMarketplaceForbidden)
		c.Abort()
		return
	}
	c.Request = c.Request.WithContext(ctx)
	c.Next()
}
