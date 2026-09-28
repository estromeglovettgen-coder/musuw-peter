package handler

import (
	"errors"
	"net/http"

	"github.com/Tencent/WeKnora/internal/application/service"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type AccountErasureHandler struct {
	service interfaces.AccountErasureService
}

func NewAccountErasureHandler(service interfaces.AccountErasureService) *AccountErasureHandler {
	return &AccountErasureHandler{service: service}
}

// DeleteManagedAccount accepts the route-selected user only from the
// SystemAdmin group. The group guard and platform-key capability policy are
// the authority; the browser never supplies tenant/provider coordinates.
func (h *AccountErasureHandler) DeleteManagedAccount(c *gin.Context) {
	if h == nil || h.service == nil {
		_ = c.Error(apperrors.NewServiceUnavailableError("account deletion is temporarily unavailable"))
		return
	}
	err := h.service.Request(c.Request.Context(), c.Param("user_id"))
	switch {
	case err == nil:
		c.JSON(http.StatusAccepted, gin.H{"accepted": true})
	case errors.Is(err, service.ErrAccountBillingActionRequired):
		_ = c.Error(apperrors.NewConflictError("the Paddle subscription cannot yet be canceled; resolve its billing state and retry account deletion").
			WithDetails(gin.H{"code": "billing_action_required"}))
	case errors.Is(err, service.ErrAccountBillingUnavailable):
		_ = c.Error(apperrors.NewServiceUnavailableError("billing state could not be verified"))
	case errors.Is(err, service.ErrAccountErasureIneligible):
		_ = c.Error(apperrors.NewConflictError("account ownership must be resolved before deletion").
			WithDetails(gin.H{"code": "account_not_eligible"}))
	case errors.Is(err, service.ErrAccountIdentityBindingRequired):
		_ = c.Error(apperrors.NewConflictError("the external identity binding must be reconciled before managed deletion").
			WithDetails(gin.H{"code": "identity_binding_required"}))
	case errors.Is(err, service.ErrAccountIdentityDeletionUnavailable):
		_ = c.Error(apperrors.NewServiceUnavailableError("external identity deletion is not configured").
			WithDetails(gin.H{"code": "identity_deletion_unavailable"}))
	default:
		_ = c.Error(apperrors.NewInternalServerError("account deletion could not be accepted"))
	}
}
