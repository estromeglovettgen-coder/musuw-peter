package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func (h *SystemHandler) createFireAccount(c *gin.Context, ctx context.Context, req *types.AdminCreateUserRequest) {
	if h.fireBilling == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "开户套餐服务暂不可用"})
		return
	}
	var membership *firebilling.Status
	var membershipErr error
	result, err := h.fireWorkspace.CreateAccount(ctx, req, func(tx *gorm.DB, user *types.User) error {
		membership, membershipErr = firebilling.NewService(tx).Apply(ctx, user.ID, firebilling.Mutation{
			OperationID: "account:" + req.OperationID, Kind: "grant", PlanID: req.FirePlanID,
			DurationDays: req.FireDurationDays, Tokens: req.FireTokens, Questions: req.FireQuestions, Note: "后台开户",
		})
		return membershipErr
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrFireProvisionForbidden), errors.Is(err, firebilling.ErrForbidden):
			c.JSON(http.StatusForbidden, gin.H{"error": "只有系统管理员可以开户"})
		case errors.Is(err, service.ErrFireCreateConflict), errors.Is(err, firebilling.ErrConflict):
			c.JSON(http.StatusConflict, gin.H{"error": "开户操作或账号已存在，请刷新后重试"})
		case errors.Is(err, service.ErrPasswordPolicy), errors.Is(err, service.ErrFireInvalidRequest):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case membershipErr != nil:
			c.JSON(http.StatusBadRequest, gin.H{"error": "套餐设置失败，请检查套餐、天数和额度后重试"})
		default:
			logger.Error(ctx, "Fire account provisioning failed; transaction rolled back", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "开户未完成，所有变更已回滚，请重试"})
		}
		return
	}
	if result.Existing {
		membership, err = h.fireBilling.Status(ctx, result.User.ID)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "账号已创建，套餐信息暂不可用，请重试"})
			return
		}
	}
	h.emitAdminAudit(ctx, types.AuditActionSystemUserCreated, result.User, map[string]any{
		"target_username": result.User.Username, "target_email": result.User.Email,
		"password_generated": result.GeneratedPassword != "", "idempotent": result.Existing,
		"operation_id": req.OperationID, "managed_course_access": true,
	})
	status := http.StatusCreated
	if result.Existing {
		status = http.StatusOK
	}
	c.JSON(status, CreateSystemUserResponse{User: result.User.ToUserInfo(), GeneratedPassword: result.GeneratedPassword, Membership: membership})
}
