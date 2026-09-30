package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type graphFinalizationRecorder struct {
	interfaces.KnowledgeRepository
	failCalls     int
	finalizeCalls int
	attempt       int
	message       string
}

func (r *graphFinalizationRecorder) FailKnowledgeEnrichmentAttempt(
	_ context.Context, _ string, attempt int, message string,
) (bool, error) {
	r.failCalls++
	r.attempt = attempt
	r.message = message
	return true, nil
}

func (r *graphFinalizationRecorder) FinalizeSubtask(context.Context, string) (int, bool, error) {
	r.finalizeCalls++
	return 0, true, nil
}

func TestFinalizeGraphExtractSubtaskDetached(t *testing.T) {
	ctx := context.Background()

	t.Run("terminal failure records a failed document instead of completing it", func(t *testing.T) {
		repo := &graphFinalizationRecorder{}
		finalizeGraphExtractSubtaskDetached(ctx, repo, "knowledge-1", 3, 0, errors.New("private model error"), false, true)
		assert.Equal(t, 1, repo.failCalls)
		assert.Zero(t, repo.finalizeCalls)
		assert.Equal(t, 3, repo.attempt)
		require.NotEmpty(t, repo.message)
		assert.NotContains(t, repo.message, "private model error")
	})

	t.Run("retriable failure keeps the pending slot", func(t *testing.T) {
		repo := &graphFinalizationRecorder{}
		finalizeGraphExtractSubtaskDetached(ctx, repo, "knowledge-1", 3, 0, errors.New("retry"), false, false)
		assert.Zero(t, repo.failCalls)
		assert.Zero(t, repo.finalizeCalls)
	})

	t.Run("successful retry drains and completes normally", func(t *testing.T) {
		repo := &graphFinalizationRecorder{}
		finalizeGraphExtractSubtaskDetached(ctx, repo, "knowledge-1", 3, 0, nil, false, false)
		assert.Zero(t, repo.failCalls)
		assert.Equal(t, 1, repo.finalizeCalls)
	})

	t.Run("superseded attempt cannot affect the new document attempt", func(t *testing.T) {
		repo := &graphFinalizationRecorder{}
		finalizeGraphExtractSubtaskDetached(ctx, repo, "knowledge-1", 3, 0, errors.New("stale"), true, true)
		assert.Zero(t, repo.failCalls)
		assert.Zero(t, repo.finalizeCalls)
	})
}
