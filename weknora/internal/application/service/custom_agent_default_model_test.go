package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type createAgentCaptureRepo struct {
	interfaces.CustomAgentRepository
	created *types.CustomAgent
}

func (r *createAgentCaptureRepo) CreateAgent(_ context.Context, agent *types.CustomAgent) error {
	r.created = agent
	return nil
}

func TestCreateAgentDefaultsMissingChatModelsToFlash(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	repo := &createAgentCaptureRepo{}
	svc := &customAgentService{repo: repo}
	agent := &types.CustomAgent{Name: "My agent"}

	created, err := svc.CreateAgent(ctx, agent)
	require.NoError(t, err)
	require.NotNil(t, repo.created)
	require.Equal(t, types.CheapestChatModelID, repo.created.Config.ModelID)
	require.Equal(t, types.CheapestChatModelID, repo.created.Config.QueryUnderstandModelID)
	require.Equal(t, types.CheapestChatModelID, created.Config.ModelID)
	require.Equal(t, types.CheapestChatModelID, created.Config.QueryUnderstandModelID)
}

func TestCreateAgentPreservesExplicitChatModels(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	repo := &createAgentCaptureRepo{}
	svc := &customAgentService{repo: repo}
	agent := &types.CustomAgent{
		Name: "My agent",
		Config: types.CustomAgentConfig{
			ModelID:                "explicit-chat-model",
			QueryUnderstandModelID: "explicit-rewrite-model",
		},
	}

	created, err := svc.CreateAgent(ctx, agent)
	require.NoError(t, err)
	require.Equal(t, "explicit-chat-model", created.Config.ModelID)
	require.Equal(t, "explicit-rewrite-model", created.Config.QueryUnderstandModelID)
}

func TestCreateAgentDefaultsMissingRewriteModelToExplicitChatModel(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	repo := &createAgentCaptureRepo{}
	svc := &customAgentService{repo: repo}
	agent := &types.CustomAgent{
		Name: "My agent",
		Config: types.CustomAgentConfig{
			ModelID: "explicit-chat-model",
		},
	}

	created, err := svc.CreateAgent(ctx, agent)
	require.NoError(t, err)
	require.Equal(t, "explicit-chat-model", created.Config.ModelID)
	require.Equal(t, "explicit-chat-model", created.Config.QueryUnderstandModelID)
}
