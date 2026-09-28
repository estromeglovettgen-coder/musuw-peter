package handler

import (
	"errors"
	"net/http"
	"strconv"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

// MarketplaceHandler serves buyer, creator and platform review endpoints.
type MarketplaceHandler struct {
	service interfaces.MarketplaceService
	billing *EntitlementHandler
	tasks   interfaces.TaskEnqueuer
}

// NewMarketplaceHandler connects marketplace endpoints to verified Paddle webhook dispatch.
func NewMarketplaceHandler(
	service interfaces.MarketplaceService,
	billing *EntitlementHandler,
	tasks interfaces.TaskEnqueuer,
) *MarketplaceHandler {
	h := &MarketplaceHandler{service: service, billing: billing, tasks: tasks}
	if billing != nil {
		billing.marketplace = h
	}
	return h
}

func marketplaceHTTPError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, types.ErrMarketplaceNotFound):
		_ = c.Error(apperrors.NewNotFoundError("marketplace resource not found"))
	case errors.Is(err, types.ErrMarketplaceForbidden):
		_ = c.Error(apperrors.NewForbiddenError(err.Error()))
	case errors.Is(err, types.ErrMarketplaceInvalid):
		_ = c.Error(apperrors.NewBadRequestError(err.Error()))
	case errors.Is(err, types.ErrMarketplaceConflict):
		_ = c.Error(apperrors.NewConflictError(err.Error()))
	default:
		logger.Errorf(c.Request.Context(), "Marketplace operation failed: %v", err)
		_ = c.Error(apperrors.NewServiceUnavailableError("marketplace operation is temporarily unavailable"))
	}
}

func (h *MarketplaceHandler) list(c *gin.Context, creator, admin bool) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	offset, _ := strconv.Atoi(c.Query("offset"))
	products, total, err := h.service.ListProducts(
		c.Request.Context(),
		interfaces.MarketplaceCatalogQuery{
			Query:    c.Query("q"),
			Category: c.Query("category"),
			Status:   c.Query("status"),
			Limit:    limit,
			Offset:   offset,
		},
		creator,
		admin,
	)
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": products, "total": total})
}

// ListProducts returns the published buyer catalog.
func (h *MarketplaceHandler) ListProducts(c *gin.Context) { h.list(c, false, false) }

// ListCreatorProducts returns the current creator's submissions.
func (h *MarketplaceHandler) ListCreatorProducts(c *gin.Context) { h.list(c, true, false) }

// ListAdminProducts returns the platform review catalog.
func (h *MarketplaceHandler) ListAdminProducts(c *gin.Context) { h.list(c, false, true) }

// GetProduct returns one product and its buyer access projection.
func (h *MarketplaceHandler) GetProduct(c *gin.Context) {
	p, err := h.service.GetProduct(c.Request.Context(), c.Param("id"))
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": p})
}

// Preview returns public directory metadata and curated final answers only.
func (h *MarketplaceHandler) Preview(c *gin.Context) {
	p, err := h.service.Preview(c.Request.Context(), c.Param("id"))
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"data": p})
}

func (h *MarketplaceHandler) save(c *gin.Context, id string, admin bool) {
	limit := int64(64 * 1024)
	if admin {
		limit = 384 * 1024
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
	var input types.MarketplaceProductInput
	if err := c.ShouldBindJSON(&input); err != nil {
		marketplaceHTTPError(c, types.ErrMarketplaceInvalid)
		return
	}
	p, err := h.service.SaveProduct(c.Request.Context(), id, input, admin)
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

// CreateCreatorProduct creates a draft submission.
func (h *MarketplaceHandler) CreateCreatorProduct(c *gin.Context) { h.save(c, "", false) }

// UpdateCreatorProduct updates an editable draft owned by the current creator.
func (h *MarketplaceHandler) UpdateCreatorProduct(c *gin.Context) { h.save(c, c.Param("id"), false) }

// UpdateAdminProduct updates a product through platform administration.
func (h *MarketplaceHandler) UpdateAdminProduct(c *gin.Context) { h.save(c, c.Param("id"), true) }

// SubmitProduct sends a complete draft for platform review.
func (h *MarketplaceHandler) SubmitProduct(c *gin.Context) {
	p, err := h.service.SubmitProduct(c.Request.Context(), c.Param("id"))
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

// ReviewProduct applies a system administrator's publication decision.
func (h *MarketplaceHandler) ReviewProduct(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32*1024)
	var input types.MarketplaceReviewInput
	if err := c.ShouldBindJSON(&input); err != nil {
		marketplaceHTTPError(c, types.ErrMarketplaceInvalid)
		return
	}
	p, err := h.service.ReviewProduct(c.Request.Context(), c.Param("id"), input)
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": p})
}

// Orders returns the current buyer's product subscriptions and invoices.
func (h *MarketplaceHandler) Orders(c *gin.Context) {
	orders, err := h.service.Orders(c.Request.Context())
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, orders)
}

// Checkout creates or recovers a server-bound product checkout.
func (h *MarketplaceHandler) Checkout(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	var input struct {
		BillingPeriod string `json:"billing_period"`
		OperationKey  string `json:"operation_key"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		marketplaceHTTPError(c, types.ErrMarketplaceInvalid)
		return
	}
	result, err := h.service.Checkout(c.Request.Context(), c.Param("id"), input.BillingPeriod, input.OperationKey)
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, result)
}

// Portal mints a management session for a subscription owned by the current buyer.
func (h *MarketplaceHandler) Portal(c *gin.Context) {
	result, err := h.service.Portal(c.Request.Context(), c.Param("id"))
	if err != nil {
		marketplaceHTTPError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"authorization_url": result})
}
