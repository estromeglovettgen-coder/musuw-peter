package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKnowledgePostProcessDropsSupersededAttemptBeforeReadingState(t *testing.T) {
	tracker := multimodalFailureSpanTracker{SpanTracker: noopSpanTracker{}, latest: 2}
	service := &KnowledgePostProcessService{spanTracker: tracker}
	payload, err := json.Marshal(types.KnowledgePostProcessPayload{
		KnowledgeID: "knowledge-1",
		Attempt:     1,
	})
	require.NoError(t, err)

	require.NoError(t, service.Handle(
		context.Background(), asynq.NewTask(types.TypeKnowledgePostProcess, payload)))
}

func TestFinishRunningMultimodalStage_PreservesSkippedStage(t *testing.T) {
	tracker, db := setupSpanTrackerTest(t)
	ctx := context.Background()

	_, attempt, err := tracker.OpenAttempt(ctx, "kid-multimodal-disabled", "")
	require.NoError(t, err)
	mm := tracker.BeginStage(ctx, "kid-multimodal-disabled", attempt, types.StageMultimodal, nil)
	require.NotNil(t, mm)
	tracker.SkipSpan(ctx, mm, "skipped")

	service := &KnowledgePostProcessService{spanTracker: tracker}
	service.finishRunningMultimodalStage(ctx, "kid-multimodal-disabled", attempt)

	var row types.KnowledgeProcessingSpan
	require.NoError(t, db.Table("knowledge_processing_spans").
		Where("knowledge_id = ? AND attempt = ? AND name = ?",
			"kid-multimodal-disabled", attempt, types.StageMultimodal).
		First(&row).Error)
	assert.Equal(t, types.SpanStatusSkipped, row.Status)
	assert.Equal(t, int64(0), row.DurationMs)
}

func TestFinishRunningMultimodalStage_CompletesRunningStage(t *testing.T) {
	tracker, db := setupSpanTrackerTest(t)
	ctx := context.Background()

	_, attempt, err := tracker.OpenAttempt(ctx, "kid-multimodal-enabled", "")
	require.NoError(t, err)
	mm := tracker.BeginStage(ctx, "kid-multimodal-enabled", attempt, types.StageMultimodal, nil)
	require.NotNil(t, mm)

	service := &KnowledgePostProcessService{spanTracker: tracker}
	service.finishRunningMultimodalStage(ctx, "kid-multimodal-enabled", attempt)

	var row types.KnowledgeProcessingSpan
	require.NoError(t, db.Table("knowledge_processing_spans").
		Where("knowledge_id = ? AND attempt = ? AND name = ?",
			"kid-multimodal-enabled", attempt, types.StageMultimodal).
		First(&row).Error)
	assert.Equal(t, types.SpanStatusDone, row.Status)
	assert.NotNil(t, row.FinishedAt)
	assert.GreaterOrEqual(t, row.DurationMs, int64(0))
}
