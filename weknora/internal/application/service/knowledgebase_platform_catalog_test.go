package service

import (
	"context"
	"errors"
	"testing"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// platformCatalogStub only implements the lookup used while creating a
// platform-managed knowledge base. Embedding the interface keeps the fake
// narrow while making any unexpected service call fail fast.
type platformCatalogStub struct {
	interfaces.ModelService
	models map[string]*types.Model
	err    error
}

func (s *platformCatalogStub) GetModelByID(_ context.Context, id string) (*types.Model, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.models[id], nil
}

func readyPlatformKnowledgeBaseModels() map[string]*types.Model {
	return map[string]*types.Model{
		types.PlatformKnowledgeBaseChatModelID: {
			ID:        types.PlatformKnowledgeBaseChatModelID,
			Type:      types.ModelTypeKnowledgeQA,
			IsBuiltin: true,
			Status:    types.ModelStatusActive,
		},
		types.PlatformKnowledgeBaseEmbeddingModelID: {
			ID:        types.PlatformKnowledgeBaseEmbeddingModelID,
			Type:      types.ModelTypeEmbedding,
			IsBuiltin: true,
			Status:    types.ModelStatusActive,
		},
		types.PlatformKnowledgeBaseVLMModelID: {
			ID:        types.PlatformKnowledgeBaseVLMModelID,
			Type:      types.ModelTypeVLLM,
			IsBuiltin: true,
			Status:    types.ModelStatusActive,
		},
		types.PlatformKnowledgeBaseASRModelID: {
			ID:        types.PlatformKnowledgeBaseASRModelID,
			Type:      types.ModelTypeASR,
			IsBuiltin: true,
			Status:    types.ModelStatusActive,
		},
	}
}

func TestCreateKnowledgeBaseRejectsUnavailablePlatformCatalogBeforePersisting(t *testing.T) {
	repo := newFakeKBRepo()
	models := readyPlatformKnowledgeBaseModels()
	delete(models, types.PlatformKnowledgeBaseVLMModelID)
	svc := &knowledgeBaseService{
		repo:         repo,
		modelService: &platformCatalogStub{models: models},
	}

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{Name: "research"})
	require.Error(t, err)
	appErr, ok := apperrors.IsAppError(err)
	require.True(t, ok)
	assert.Equal(t, apperrors.ErrServiceUnavailable, appErr.Code)
	assert.Empty(t, repo.rows, "a partially configured KB must never be persisted")
}

func TestCreateKnowledgeBasePersistsWhenPlatformCatalogIsReady(t *testing.T) {
	repo := newFakeKBRepo()
	svc := &knowledgeBaseService{
		repo:         repo,
		modelService: &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
	}

	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{Name: "research"})
	require.NoError(t, err)
	require.NotNil(t, kb)
	assert.Len(t, repo.rows, 1)
	assert.Equal(t, types.PlatformKnowledgeBaseChatModelID, kb.SummaryModelID)
	assert.Equal(t, types.PlatformKnowledgeBaseEmbeddingModelID, kb.EmbeddingModelID)
}

func TestCreateKnowledgeBaseTreatsCatalogLookupFailureAsTemporary(t *testing.T) {
	repo := newFakeKBRepo()
	svc := &knowledgeBaseService{
		repo:         repo,
		modelService: &platformCatalogStub{err: errors.New("database temporarily unavailable")},
	}

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{Name: "research"})
	require.Error(t, err)
	appErr, ok := apperrors.IsAppError(err)
	require.True(t, ok)
	assert.Equal(t, apperrors.ErrServiceUnavailable, appErr.Code)
	assert.Empty(t, repo.rows)
}
