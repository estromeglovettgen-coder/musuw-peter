package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type graphPromptTenantRepo struct {
	interfaces.TenantRepository
	tenant *types.Tenant
	err    error
	calls  int
}

func (r *graphPromptTenantRepo) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	r.calls++
	return r.tenant, r.err
}

type graphPromptModelService struct {
	interfaces.ModelService
	model chat.Chat
}

func (s graphPromptModelService) GetChatModel(context.Context, string) (chat.Chat, error) {
	return s.model, nil
}

type graphPromptChunkRepo struct {
	interfaces.ChunkRepository
}

func (graphPromptChunkRepo) GetChunkByID(context.Context, uint64, string) (*types.Chunk, error) {
	return &types.Chunk{ID: "chunk", KnowledgeID: "document", KnowledgeBaseID: "kb", Content: "Peter 为 Alex 介绍课程，Alex 确认购买。"}, nil
}

type graphPromptKBRepo struct {
	interfaces.KnowledgeBaseRepository
}

func (graphPromptKBRepo) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{ID: "kb", ExtractConfig: &types.ExtractConfig{
		Enabled: true, Tags: []string{"成交"}, CustomInstructions: "只提取销售关系",
		Text:      "Peter 向 Ben 销售课程。",
		Nodes:     []*types.GraphNode{{Name: "Peter", Attributes: []string{"销售"}}, {Name: "Ben"}},
		Relations: []*types.GraphRelation{{Node1: "Peter", Node2: "Ben", Type: "成交"}},
	}}, nil
}

type graphPromptKnowledgeRepo struct {
	graphFinalizationRecorder
}

func (*graphPromptKnowledgeRepo) GetKnowledgeByIDOnly(context.Context, string) (*types.Knowledge, error) {
	return nil, nil
}

type graphPromptGraphRepo struct {
	interfaces.RetrieveGraphRepository
	graphs []*types.GraphData
}

func (r *graphPromptGraphRepo) AddGraph(_ context.Context, _ types.NameSpace, graphs []*types.GraphData) error {
	r.graphs = graphs
	return nil
}

func graphPromptTask(t *testing.T, tenantID uint64) *asynq.Task {
	t.Helper()
	payload, err := json.Marshal(types.ExtractChunkPayload{TenantID: tenantID, ChunkID: "chunk", ModelID: "model", KnowledgeID: "document"})
	require.NoError(t, err)
	return asynq.NewTask(types.TypeChunkExtract, payload)
}

func TestGraphExtractionWorkerRestoresWorkspacePromptAndPreservesStructuredPayload(t *testing.T) {
	base := &types.PromptTemplateStructured{Description: "默认图谱规则；允许关系：%s"}
	for _, tenantID := range []uint64{1, 2} {
		for _, customized := range []bool{true, false} {
			workspace := &types.Tenant{ID: tenantID, SystemPromptConfig: types.SystemPromptConfig{}}
			if customized {
				workspace.SystemPromptConfig["graph.extraction"] = "仅依据来源提取，100% 保留事实。关系类型：{{relation_types}}"
			}
			tenants := &graphPromptTenantRepo{tenant: workspace}
			model := &summaryContentCaptureChat{response: `[{"entity":"Peter","entity_attributes":["销售"]},{"entity":"Alex"},{"entity1":"Peter","entity2":"Alex","relation":"成交"}]`}
			graphs := &graphPromptGraphRepo{}
			repo := &graphPromptKnowledgeRepo{}
			handler := NewChunkExtractService(&config.Config{ExtractManager: &config.ExtractManagerConfig{ExtractGraph: base}}, tenants,
				graphPromptModelService{model: model}, graphPromptKBRepo{}, repo, graphPromptChunkRepo{}, graphs, nil)
			// A worker may inherit an unrelated snapshot; the queued workspace owns this task.
			ctx := context.WithValue(context.Background(), types.TenantInfoContextKey, &types.Tenant{ID: 999, SystemPromptConfig: types.SystemPromptConfig{"graph.extraction": "其他工作区的秘密规则"}})
			require.NoError(t, handler.Handle(ctx, graphPromptTask(t, tenantID)))
			require.Equal(t, 1, tenants.calls)
			require.Len(t, model.messages, 2)
			system := model.messages[0].Content
			require.Contains(t, system, `["成交"]`)
			require.Contains(t, system, "只提取销售关系")
			require.Contains(t, system, "Peter 向 Ben 销售课程")
			for _, key := range []string{"entity", "entity_attributes", "entity1", "entity2", "relation"} {
				require.Contains(t, system, key)
			}
			require.NotContains(t, system, "其他工作区的秘密规则")
			require.NotContains(t, system, "{{relation_types}}")
			require.NotContains(t, system, "%!")
			if customized {
				require.Contains(t, system, "100% 保留事实")
				require.NotContains(t, system, "默认图谱规则")
			} else {
				require.Contains(t, system, "默认图谱规则")
			}
			require.Contains(t, model.messages[1].Content, "Alex 确认购买")
			require.Len(t, graphs.graphs, 1)
			require.Len(t, graphs.graphs[0].Node, 2)
			require.Equal(t, []string{"chunk"}, graphs.graphs[0].Node[0].Chunks)
			require.Len(t, graphs.graphs[0].Relation, 1)
			require.Equal(t, 1, repo.finalizeCalls)
		}
	}
	require.Equal(t, "默认图谱规则；允许关系：%s", base.Description)
}

func TestGraphExtractionWorkerDoesNotUseDefaultsWhenWorkspaceCannotLoad(t *testing.T) {
	for _, lookup := range []*graphPromptTenantRepo{{err: errors.New("database unavailable")}, {tenant: &types.Tenant{ID: 2}}} {
		model := &summaryContentCaptureChat{}
		repo := &graphPromptKnowledgeRepo{}
		handler := NewChunkExtractService(&config.Config{ExtractManager: &config.ExtractManagerConfig{ExtractGraph: &types.PromptTemplateStructured{Description: "默认规则"}}}, lookup,
			graphPromptModelService{model: model}, graphPromptKBRepo{}, repo, graphPromptChunkRepo{}, &graphPromptGraphRepo{}, nil)
		require.Error(t, handler.Handle(context.Background(), graphPromptTask(t, 1)))
		require.Empty(t, model.messages)
		require.Zero(t, repo.finalizeCalls)
	}
}
