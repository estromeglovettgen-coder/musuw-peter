package router

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
)

const openRouterCreditExhaustedMessage = "本周期 AI 额度已用尽；升级套餐或额度恢复后可重试"

type openRouterCreditTaskPayload struct {
	KnowledgeID string `json:"knowledge_id,omitempty"`
	Attempt     int    `json:"attempt,omitempty"`
}

// openRouterCreditExhaustionMiddleware converts provider budget exhaustion to
// a terminal queue attempt. Retrying cannot succeed until the monthly budget
// resets or the tenant's plan changes.
func openRouterCreditExhaustionMiddleware(
	ks interfaces.KnowledgeService,
	tracker service.SpanTracker,
) asynq.MiddlewareFunc {
	return func(next asynq.Handler) asynq.Handler {
		return asynq.HandlerFunc(func(ctx context.Context, t *asynq.Task) error {
			err := next.ProcessTask(ctx, t)
			// A specialized ingestion path may already have published a safer,
			// product-specific terminal state and attached SkipRetry. Preserve it
			// instead of replacing it with provider credit terminology.
			if err == nil || errors.Is(err, asynq.SkipRetry) || !openrouter.IsCreditExhausted(err) {
				return err
			}

			markKnowledgeCreditExhausted(ctx, ks, tracker, t)
			return errors.Join(asynq.SkipRetry, err)
		})
	}
}

func markKnowledgeCreditExhausted(
	ctx context.Context,
	ks interfaces.KnowledgeService,
	tracker service.SpanTracker,
	t *asynq.Task,
) {
	if ks == nil || t == nil || !creditExhaustionAffectsKnowledgeStatus(t.Type()) {
		return
	}
	repo := ks.GetRepository()
	if repo == nil {
		return
	}

	var payload openRouterCreditTaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil || payload.KnowledgeID == "" {
		return
	}

	// Reuse WeKnora's native failed state. Do not clear StorageKey or delete the
	// source object; the existing reparse flow resets this row after credits are
	// restored, without adding a parallel document lifecycle.
	stateCtx := context.Background()
	if err := repo.UpdateKnowledgeColumns(stateCtx, payload.KnowledgeID, map[string]interface{}{
		"parse_status":  types.ParseStatusFailed,
		"error_message": openRouterCreditExhaustedMessage,
	}); err != nil {
		logger.Warnf(ctx, "openrouter credits: failed to mark knowledge %s failed: %v", payload.KnowledgeID, err)
		return
	}

	if tracker != nil && payload.Attempt > 0 {
		tracker.FinalizeAttempt(
			stateCtx,
			payload.KnowledgeID,
			payload.Attempt,
			types.SpanStatusFailed,
			nil,
			openrouter.CreditExhaustedCode,
			openRouterCreditExhaustedMessage,
		)
	}
	logger.Infof(ctx, "openrouter credits: paused knowledge %s without retry (task=%s)", payload.KnowledgeID, t.Type())
}

// Later enrichment jobs also skip retry when they return a credit error, but
// only ingestion stages are allowed to move the document into failed.
func creditExhaustionAffectsKnowledgeStatus(taskType string) bool {
	switch taskType {
	case types.TypeDocumentProcess,
		types.TypeManualProcess,
		types.TypeChunkExtract,
		types.TypeDataTableSummary,
		types.TypeImageMultimodal,
		types.TypeKnowledgePostProcess:
		return true
	default:
		return false
	}
}
