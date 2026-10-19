package session

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

// One reservation covers the whole native turn, not each model/tool call.
type questionAllowanceBilling interface {
	BeginQuestion(context.Context, string, string) (string, error)
	SettleQuestion(context.Context, string, bool) error
}

func (h *Handler) reserveQuestionAllowance(req *qaRequestContext) (string, bool) {
	if !firebilling.Enabled() || h.questionBilling == nil {
		return "", true
	}
	id, err := h.questionBilling.BeginQuestion(req.ctx, req.assistantMessage.ID, req.sessionID)
	if err == nil {
		return id, true
	}
	status, message := http.StatusServiceUnavailable, "问答服务暂不可用，请重试"
	var access *firebilling.AccessError
	if errors.As(err, &access) {
		status, message = access.HTTPStatus(), access.Error()
	}
	// Native message creation happens before this gate. Leave a completed
	// failure, rather than a permanently streaming empty assistant on reload.
	req.assistantMessage.IsCompleted = true
	req.assistantMessage.IsFallback = true
	req.assistantMessage.Content = message
	if h.messageService != nil {
		if updateErr := h.messageService.UpdateMessage(context.WithoutCancel(req.ctx), req.assistantMessage); updateErr != nil {
			logger.Errorf(req.ctx, "[FireBilling] failed to persist question denial: %v", updateErr)
		}
	}
	req.c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message, "error": message})
	return "", false
}

func (h *Handler) settleQuestionAllowance(ctx context.Context, id string, answer *types.Message) {
	if id == "" || h.questionBilling == nil {
		return
	}
	// Stop/cancel must not cancel the commit. Only visible answer text counts;
	// tool traces, thinking and an error/fallback placeholder do not.
	delivered := answer != nil && strings.TrimSpace(answer.Content) != "" && !answer.IsFallback
	settleCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	if err := h.questionBilling.SettleQuestion(settleCtx, id, delivered); err != nil {
		logger.Errorf(settleCtx, "[FireBilling] question settlement failed; pending recovery will retry: %v", err)
	}
}
