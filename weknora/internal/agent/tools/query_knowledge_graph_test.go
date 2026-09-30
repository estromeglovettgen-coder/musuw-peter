package tools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubKnowledgeBaseService struct {
	kb      *types.KnowledgeBase
	results []*types.SearchResult
}

func (s *stubKnowledgeBaseService) CreateKnowledgeBase(context.Context, *types.KnowledgeBase) (*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

func (s *stubKnowledgeBaseService) GetKnowledgeBaseByIDOnly(context.Context, string) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

func (s *stubKnowledgeBaseService) GetKnowledgeBasesByIDsOnly(context.Context, []string) ([]*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) FillKnowledgeBaseCounts(context.Context, *types.KnowledgeBase) error {
	return nil
}

func (s *stubKnowledgeBaseService) ListKnowledgeBases(context.Context) ([]*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) ListKnowledgeBasesByTenantID(context.Context, uint64) ([]*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) UpdateKnowledgeBase(
	context.Context,
	string,
	string,
	string,
	*types.KnowledgeBaseConfig,
) (*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) DeleteKnowledgeBase(context.Context, string) error {
	return nil
}

func (s *stubKnowledgeBaseService) TogglePinKnowledgeBase(context.Context, string) (*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) HybridSearch(context.Context, string, types.SearchParams) ([]*types.SearchResult, error) {
	return s.results, nil
}

func (s *stubKnowledgeBaseService) GetQueryEmbedding(context.Context, string, string) ([]float32, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) ResolveEmbeddingModelKeys(context.Context, []*types.KnowledgeBase) map[string]string {
	return nil
}

func (s *stubKnowledgeBaseService) CopyKnowledgeBase(
	context.Context,
	string,
	string,
) (*types.KnowledgeBase, *types.KnowledgeBase, error) {
	return nil, nil, nil
}

func (s *stubKnowledgeBaseService) DuplicateKnowledgeBase(
	context.Context,
	string,
) (*types.KnowledgeBase, error) {
	return nil, nil
}

func (s *stubKnowledgeBaseService) GetRepository() interfaces.KnowledgeBaseRepository {
	return nil
}

func (s *stubKnowledgeBaseService) ProcessKBDelete(context.Context, *asynq.Task) error {
	return nil
}

func TestQueryKnowledgeGraphReportsConfiguredEntityAndRelationTypes(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{
		Node:     []*types.GraphNode{{Name: "合同"}, {Name: "法务部门"}},
		Relation: []*types.GraphRelation{{Node1: "合同", Node2: "法务部门", Type: "管理"}},
	}}
	tool := NewQueryKnowledgeGraphTool(&stubKnowledgeBaseService{
		kb: &types.KnowledgeBase{
			ID:               "kb-1",
			IndexingStrategy: types.IndexingStrategy{GraphEnabled: true},
			ExtractConfig: &types.ExtractConfig{
				Enabled: true,
				Nodes: []*types.GraphNode{
					{Name: "合同"}, {Name: "法务部门"}, {Name: "审批流程"}, {Name: "合同"}, nil,
				},
				Relations: []*types.GraphRelation{
					{Type: "属于"}, {Type: "管理"}, {Type: "审批"}, {Type: "管理"}, nil,
				},
			},
		},
	}, repo)

	args, err := json.Marshal(QueryKnowledgeGraphInput{
		KnowledgeBaseIDs: []string{"kb-1"},
		Query:            "合同与法务部门的关系",
	})
	require.NoError(t, err)
	result, err := tool.Execute(context.Background(), args)
	require.NoError(t, err)
	require.True(t, result.Success)
	assert.Contains(t, result.Output, "合同")
	assert.Contains(t, result.Output, "法务部门")
	assert.Contains(t, result.Output, "管理")
	graphConfig, ok := result.Data["graph_config"].(map[string]interface{})
	require.True(t, ok)
	assert.ElementsMatch(t, []string{"合同", "审批流程", "法务部门"}, graphConfig["nodes"])
	assert.ElementsMatch(t, []string{"属于", "审批", "管理"}, graphConfig["relations"])
}
