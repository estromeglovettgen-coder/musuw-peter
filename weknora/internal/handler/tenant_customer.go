package handler

import (
	"net/http"

	"github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

func (h *TenantHandler) getCustomerConfig(c *gin.Context) {
	tenant, _ := types.TenantInfoFromContext(c.Request.Context())
	if tenant == nil {
		c.Error(errors.NewBadRequestError("Workspace is empty"))
		return
	}
	config := tenant.CustomerConfig
	if config == nil {
		config = types.DefaultCustomerConfig()
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}

// The existing tenant KV route requires workspace admin access for writes.
func (h *TenantHandler) updateCustomerConfig(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2*1024*1024)
	var config types.CustomerConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.Error(errors.NewValidationError("Invalid customer settings"))
		return
	}
	tenant, _ := types.TenantInfoFromContext(c.Request.Context())
	if tenant == nil {
		c.Error(errors.NewBadRequestError("Workspace is empty"))
		return
	}
	// Older choice-only clients omit templates; an explicit [] deletes them.
	if config.Templates == nil && tenant.CustomerConfig != nil {
		config.Templates = tenant.CustomerConfig.Templates
	}
	if err := config.Validate(); err != nil {
		c.Error(errors.NewBadRequestError(err.Error()))
		return
	}
	// Use a sparse native update so saving choices cannot overwrite concurrent
	// changes to unrelated workspace configuration or usage counters.
	if _, err := h.service.UpdateTenant(c.Request.Context(), &types.Tenant{ID: tenant.ID, CustomerConfig: &config}); err != nil {
		c.Error(errors.NewInternalServerError("Failed to save customer settings").WithDetails(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}
