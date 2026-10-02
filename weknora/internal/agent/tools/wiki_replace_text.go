package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type wikiReplaceTextTool struct {
	BaseTool
	wikiPageService  interfaces.WikiPageService
	knowledgeService interfaces.KnowledgeService
	kbIDs            []string
	routes           *WikiRouteResolver
	searchTargets    types.SearchTargets
	scopeEnforced    bool
}

// NewWikiReplaceTextTool creates a new wiki_replace_text tool
func NewWikiReplaceTextTool(
	wikiPageService interfaces.WikiPageService,
	kbIDs []string,
	knowledgeService interfaces.KnowledgeService,
	routes ...*WikiRouteResolver,
) *wikiReplaceTextTool {
	return &wikiReplaceTextTool{
		BaseTool: NewBaseTool(
			ToolWikiReplaceText,
			`精确替换 Wiki 页面中指定文本的全部出现位置，适合统一修正小问题。`,
			json.RawMessage(`{
				"type": "object",
				"properties": {
					"slug": {
						"type": "string",
						"description": "Wiki 页面 slug。"
					},
					"old_text": {
						"type": "string",
						"description": "需要精确查找并替换的文本。"
					},
					"new_text": {
						"type": "string",
						"description": "替换后的新文本。"
					},
					"source_refs": {
						"type": "array",
						"items": {"type": "string"},
						"description": "可选：支撑修改的来源文档短 dN ID 数组，提供时完整替换已有 source_refs。"
					}
				},
				"required": ["slug", "old_text", "new_text"]
			}`),
		),
		wikiPageService:  wikiPageService,
		knowledgeService: knowledgeService,
		kbIDs:            kbIDs,
		routes:           firstWikiRoute(routes),
	}
}

// WithSearchTargets enables the Agent authorization boundary for source_refs.
// An Agent turn with no search target must reject every source document.
func (t *wikiReplaceTextTool) WithSearchTargets(searchTargets types.SearchTargets) *wikiReplaceTextTool {
	t.searchTargets = searchTargets
	t.scopeEnforced = true
	return t
}

func (t *wikiReplaceTextTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	// Attribute every page write performed by this tool to the agent so
	// revision history distinguishes agent edits from pipeline/user ones.
	ctx = types.WithWikiEditSource(ctx, types.WikiEditSourceAgent)
	var params struct {
		Slug       string    `json:"slug"`
		OldText    string    `json:"old_text"`
		NewText    string    `json:"new_text"`
		SourceRefs *[]string `json:"source_refs"`
	}

	if err := json.Unmarshal(args, &params); err != nil {
		return &types.ToolResult{Success: false, Error: "Failed to parse arguments: " + err.Error()}, nil
	}

	if len(t.kbIDs) == 0 {
		return &types.ToolResult{Success: false, Error: "No knowledge bases available for editing"}, nil
	}
	if params.OldText == "" {
		return &types.ToolResult{Success: false, Error: "old_text is required"}, nil
	}
	normalizedSlug, slugErr := normalizeAndValidateWikiSlug(params.Slug)
	if slugErr != nil {
		return &types.ToolResult{Success: false, Error: slugErr.Error()}, nil
	}
	params.Slug = normalizedSlug

	// Get the existing page
	existingPage, _, err := resolveUniqueWikiPage(ctx, t.wikiPageService, params.Slug, t.kbIDs, t.routes)
	if err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("Failed to fetch page %s: %v", params.Slug, err)}, nil
	}

	replacementCount := strings.Count(existingPage.Content, params.OldText)
	if replacementCount == 0 {
		return &types.ToolResult{Success: false, Error: "old_text not found in the current page content. Ensure you copy it exactly as it appears."}, nil
	}

	existingPage.Content = strings.ReplaceAll(existingPage.Content, params.OldText, params.NewText)

	if params.SourceRefs != nil {
		if t.scopeEnforced {
			resolvedRefs, scopeErr := resolveAuthorizedSourceRefs(ctx, t.searchTargets, *params.SourceRefs, t.knowledgeService)
			if scopeErr != nil {
				return &types.ToolResult{Success: false, Error: "Invalid source_refs: " + scopeErr.Error()}, nil
			}
			existingPage.SourceRefs = resolvedRefs
		} else {
			existingPage.SourceRefs = resolveSourceRefs(ctx, t.knowledgeService, *params.SourceRefs)
		}
	}

	_, err = t.wikiPageService.UpdatePage(ctx, existingPage)
	if err != nil {
		return &types.ToolResult{Success: false, Error: "Failed to update page: " + err.Error()}, nil
	}

	oldPreview := truncateRunes(params.OldText, 80)
	newPreview := truncateRunes(params.NewText, 80)

	output := fmt.Sprintf("Successfully replaced %d occurrence(s) on page [[%s]].\n- Old: %s\n- New: %s", replacementCount, params.Slug, oldPreview, newPreview)

	return &types.ToolResult{
		Success: true,
		Output:  output,
		Data: map[string]interface{}{
			"display_type":      "wiki_replace_text",
			"slug":              params.Slug,
			"title":             existingPage.Title,
			"old_text":          oldPreview,
			"new_text":          newPreview,
			"replacement_count": replacementCount,
		},
	}, nil
}
