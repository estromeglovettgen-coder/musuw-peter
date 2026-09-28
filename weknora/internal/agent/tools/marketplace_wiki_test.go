package tools

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestMarketplaceWikiKeepsModelBodyPrivateFromStreamAndHistory(t *testing.T) {
	page := newTestWikiPage("kb", "concept/example")
	page.Content = "private-full-wiki-body"
	svc := &fakeWikiPageService{pages: map[string]*types.WikiPage{wikiPageKey("kb", page.Slug): page}}
	tool := NewWikiReadPageTool(svc, nil, []WikiScope{{KnowledgeBaseID: "kb"}}, nil)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = types.WithMarketplaceScope(ctx, 7, &types.MarketplaceAccess{
		ProductID: "product", SourceTenantID: 9,
		Agent: &types.CustomAgent{ID: "agent", TenantID: 9}, KnowledgeBaseIDs: []string{"kb"},
	})
	args := json.RawMessage(`{"slugs":["concept/example"]}`)
	result, err := tool.Execute(ctx, args)
	require.NoError(t, err)
	require.True(t, result.Success)
	require.Contains(t, result.Output, page.Content, "model must still read the complete approved source")
	public, err := json.Marshal(SanitizeToolResultForClient(ToolWikiReadPage, result))
	require.NoError(t, err)
	require.NotContains(t, string(public), page.Content)
	steps := SanitizeAgentStepsForStorage([]types.AgentStep{{
		ToolCalls: []types.ToolCall{{Name: ToolWikiReadPage, Result: result}},
	}})
	stored, err := json.Marshal(steps)
	require.NoError(t, err)
	require.NotContains(t, string(stored), page.Content)
	require.Contains(t, result.Output, page.Content, "sanitizing must not mutate model input")
	ordinary, err := tool.Execute(context.Background(), args)
	require.NoError(t, err)
	require.Contains(
		t, SanitizeToolResultForClient(ToolWikiReadPage, ordinary)["output"], page.Content,
		"ordinary upstream behavior remains unchanged",
	)
}
