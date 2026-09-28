package router

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type imageDeadLetterRepo struct {
	interfaces.KnowledgeRepository
	id      string
	attempt int
	message string
}

func (r *imageDeadLetterRepo) FailKnowledgeParseAttempt(
	_ context.Context, id string, attempt int, message string,
) (bool, error) {
	r.id, r.attempt, r.message = id, attempt, message
	return true, nil
}

type imageDeadLetterKnowledgeService struct {
	interfaces.KnowledgeService
	repo interfaces.KnowledgeRepository
}

func (s imageDeadLetterKnowledgeService) GetRepository() interfaces.KnowledgeRepository {
	return s.repo
}

func TestImageMultimodalDeadLetterUsesGuardedParentFailure(t *testing.T) {
	repo := &imageDeadLetterRepo{}
	callback := newDeadLetterKnowledgeFailer(imageDeadLetterKnowledgeService{repo: repo}, nil)
	require.NotNil(t, callback)
	payload, err := json.Marshal(types.ImageMultimodalPayload{KnowledgeID: "knowledge-1", Attempt: 3})
	require.NoError(t, err)

	callback(context.Background(), asynq.NewTask(types.TypeImageMultimodal, payload), errors.New("provider failed"))

	require.Equal(t, "knowledge-1", repo.id)
	require.Equal(t, 3, repo.attempt)
	require.Equal(t, service.ImageParseFailedPublicMessage, repo.message)
}
