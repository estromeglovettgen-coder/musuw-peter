package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type defaultModelRepo struct {
	model         *types.Model
	clearedTenant uint
	clearedType   types.ModelType
	excludedID    string
	created       bool
	updated       bool
}

func (r *defaultModelRepo) Create(_ context.Context, _ *types.Model) error {
	r.created = true
	return nil
}

func (r *defaultModelRepo) GetByID(_ context.Context, _ uint64, id string) (*types.Model, error) {
	if r.model != nil && r.model.ID == id {
		return r.model, nil
	}
	return nil, nil
}

func (r *defaultModelRepo) List(context.Context, uint64, types.ModelType, types.ModelSource) ([]*types.Model, error) {
	return nil, nil
}

func (r *defaultModelRepo) Update(_ context.Context, _ *types.Model) error {
	r.updated = true
	return nil
}

func (r *defaultModelRepo) Delete(context.Context, uint64, string) error { return nil }

func (r *defaultModelRepo) ClearDefaultByType(
	_ context.Context,
	tenantID uint,
	modelType types.ModelType,
	excludeID string,
) error {
	r.clearedTenant = tenantID
	r.clearedType = modelType
	r.excludedID = excludeID
	return nil
}

func TestDefaultModelClearsPreviousDefaultForSameTenantAndType(t *testing.T) {
	t.Run("create", func(t *testing.T) {
		repo := &defaultModelRepo{}
		svc := NewModelService(repo, nil, nil, nil, nil, nil)
		model := &types.Model{
			TenantID:  42,
			Type:      types.ModelTypeKnowledgeQA,
			Source:    types.ModelSourceRemote,
			IsDefault: true,
		}

		require.NoError(t, svc.CreateModel(context.Background(), model))
		require.True(t, repo.created)
		require.Equal(t, uint(42), repo.clearedTenant)
		require.Equal(t, types.ModelTypeKnowledgeQA, repo.clearedType)
		require.Empty(t, repo.excludedID)
	})

	t.Run("update", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))
		model := &types.Model{
			ID:        "chat-model",
			TenantID:  42,
			Type:      types.ModelTypeKnowledgeQA,
			Source:    types.ModelSourceRemote,
			IsDefault: true,
		}
		repo := &defaultModelRepo{model: model}
		svc := NewModelService(repo, nil, nil, nil, nil, nil)

		require.NoError(t, svc.UpdateModel(ctx, model))
		require.True(t, repo.updated)
		require.Equal(t, uint(42), repo.clearedTenant)
		require.Equal(t, types.ModelTypeKnowledgeQA, repo.clearedType)
		require.Equal(t, "chat-model", repo.excludedID)
	})
}
