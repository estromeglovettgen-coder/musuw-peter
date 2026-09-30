package tools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type graphQueryRepository struct {
	namespaces []types.NameSpace
	graph      *types.GraphData
}

func (r *graphQueryRepository) AddGraph(context.Context, types.NameSpace, []*types.GraphData) error {
	return nil
}
func (r *graphQueryRepository) DelGraph(context.Context, []types.NameSpace) error { return nil }
func (r *graphQueryRepository) SearchNode(_ context.Context, namespace types.NameSpace, _ []string) (*types.GraphData, error) {
	r.namespaces = append(r.namespaces, namespace)
	return r.graph, nil
}

type graphScopeKnowledgeService struct {
	interfaces.KnowledgeService
	taggedIDs []string
}

func (s *graphScopeKnowledgeService) ListKnowledgeIDsByTagIDs(_ context.Context, _ uint64, _ string, _ []string) ([]string, error) {
	return s.taggedIDs, nil
}

func graphQueryArgs(kbIDs ...string) json.RawMessage {
	value, _ := json.Marshal(QueryKnowledgeGraphInput{KnowledgeBaseIDs: kbIDs, Query: "Alice and Bob relationship"})
	return value
}

func graphEnabledKB(id string) *types.KnowledgeBase {
	return &types.KnowledgeBase{
		ID:               id,
		TenantID:         7,
		IndexingStrategy: types.IndexingStrategy{GraphEnabled: true},
		ExtractConfig: &types.ExtractConfig{Enabled: true,
			Nodes:     []*types.GraphNode{{Name: "Person"}},
			Relations: []*types.GraphRelation{{Type: "knows"}},
		},
	}
}

func TestGraphOnlyKBSatisfiesGraphToolRequirement(t *testing.T) {
	caps := graphEnabledKB("kb-1").Capabilities()
	require.False(t, caps.Vector)
	require.False(t, caps.Keyword)
	require.True(t, KBSatisfiesToolRequirements(caps, []string{ToolQueryKnowledgeGraph}))
	require.False(t, KBSatisfiesToolRequirements(caps, []string{ToolKnowledgeSearch}))
}

func TestQueryKnowledgeGraphReadsRealRelationshipsForGraphOnlyKB(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{
		Node:     []*types.GraphNode{{Name: "Alice"}, {Name: "Bob"}},
		Relation: []*types.GraphRelation{{Node1: "Alice", Node2: "Bob", Type: "knows"}},
	}}
	tool := NewQueryKnowledgeGraphTool(
		&stubKnowledgeBaseService{kb: graphEnabledKB("kb-1")}, repo,
		types.SearchTargets{{Type: types.SearchTargetTypeKnowledgeBase, KnowledgeBaseID: "kb-1", TenantID: 7}},
	).WithKnowledgeScope(&graphScopeKnowledgeService{})

	result, err := tool.Execute(context.Background(), graphQueryArgs("kb-1"))
	require.NoError(t, err)
	require.True(t, result.Success)
	require.Equal(t, []types.NameSpace{{KnowledgeBase: "kb-1"}}, repo.namespaces)
	require.Contains(t, result.Output, "Alice")
	require.Contains(t, result.Output, "Bob")
	require.Contains(t, result.Output, "knows")
	graphData := result.Data["graph_data"].(map[string]interface{})
	require.Equal(t, 2, graphData["total_nodes"])
	require.Equal(t, 1, graphData["total_edges"])
}

func TestQueryKnowledgeGraphRejectsOutOfScopeKBBeforeReadingGraph(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{}}
	tool := NewQueryKnowledgeGraphTool(
		&stubKnowledgeBaseService{kb: graphEnabledKB("kb-other")}, repo,
		types.SearchTargets{{Type: types.SearchTargetTypeKnowledgeBase, KnowledgeBaseID: "kb-allowed", TenantID: 7}},
	)
	result, err := tool.Execute(context.Background(), graphQueryArgs("kb-allowed", "kb-other"))
	require.Error(t, err)
	require.False(t, result.Success)
	require.Empty(t, repo.namespaces)
}

func TestQueryKnowledgeGraphRejectsEmptyKBID(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{}}
	tool := NewQueryKnowledgeGraphTool(&stubKnowledgeBaseService{}, repo)
	result, err := tool.Execute(context.Background(), graphQueryArgs(""))
	require.Error(t, err)
	require.False(t, result.Success)
	require.Empty(t, repo.namespaces)
}

func TestQueryKnowledgeGraphUsesDocumentNamespaceForNarrowScope(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{
		Node:     []*types.GraphNode{{Name: "Alice"}, {Name: "Bob"}},
		Relation: []*types.GraphRelation{{Node1: "Alice", Node2: "Bob", Type: "knows"}},
	}}
	tool := NewQueryKnowledgeGraphTool(
		&stubKnowledgeBaseService{kb: graphEnabledKB("kb-1")}, repo,
		types.SearchTargets{{Type: types.SearchTargetTypeKnowledge, KnowledgeBaseID: "kb-1", TenantID: 7, KnowledgeIDs: []string{"doc-allowed"}}},
	).WithKnowledgeScope(&graphScopeKnowledgeService{})
	result, err := tool.Execute(context.Background(), graphQueryArgs("kb-1"))
	require.NoError(t, err)
	require.True(t, result.Success)
	require.Equal(t, []types.NameSpace{{KnowledgeBase: "kb-1", Knowledge: "doc-allowed"}}, repo.namespaces)
}

func TestQueryKnowledgeGraphResolvesTagScopeToDocuments(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{}}
	tool := NewQueryKnowledgeGraphTool(
		&stubKnowledgeBaseService{kb: graphEnabledKB("kb-1")}, repo,
		types.SearchTargets{{Type: types.SearchTargetTypeKnowledge, KnowledgeBaseID: "kb-1", TenantID: 7, TagIDs: []string{"tag-1"}}},
	).WithKnowledgeScope(&graphScopeKnowledgeService{taggedIDs: []string{"doc-tagged"}})
	_, err := tool.Execute(context.Background(), graphQueryArgs("kb-1"))
	require.NoError(t, err)
	require.Equal(t, []types.NameSpace{{KnowledgeBase: "kb-1", Knowledge: "doc-tagged"}}, repo.namespaces)
}

func TestQueryKnowledgeGraphRejectsStaleTenantScope(t *testing.T) {
	repo := &graphQueryRepository{graph: &types.GraphData{}}
	tool := NewQueryKnowledgeGraphTool(
		&stubKnowledgeBaseService{kb: graphEnabledKB("kb-1")}, repo,
		types.SearchTargets{{Type: types.SearchTargetTypeKnowledgeBase, KnowledgeBaseID: "kb-1", TenantID: 99}},
	)
	result, err := tool.Execute(context.Background(), graphQueryArgs("kb-1"))
	require.Error(t, err)
	require.False(t, result.Success)
	require.Empty(t, repo.namespaces)
}
