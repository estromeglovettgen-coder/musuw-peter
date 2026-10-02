package tools

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type wikiReadIssueTool struct {
	BaseTool
	wikiService interfaces.WikiPageService
	kbIDs       []string
}

func NewWikiReadIssueTool(wikiService interfaces.WikiPageService, kbIDs []string) types.Tool {
	return &wikiReadIssueTool{
		BaseTool: NewBaseTool(
			ToolWikiReadIssue,
			`读取指定 Wiki 问题详情，或列出某页的待处理问题。`,
			json.RawMessage(`{
  "type": "object",
  "properties": {
    "issue_id": {
      "type": "string",
      "description": "可选：先前 wiki_read_issue 返回的问题短 iN ID。"
    },
    "slug": {
      "type": "string",
      "description": "可选：需要列出待处理问题的页面 slug。"
    }
  },
  "description": "提供 issue_id 或 slug 之一以读取问题。"
}`),
		),
		wikiService: wikiService,
		kbIDs:       kbIDs,
	}
}

func (t *wikiReadIssueTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	var params struct {
		IssueID string `json:"issue_id"`
		Slug    string `json:"slug"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return &types.ToolResult{Success: false, Error: "Invalid parameters: " + err.Error()}, nil
	}

	issueID := strings.TrimSpace(params.IssueID)
	slug := strings.TrimSpace(params.Slug)

	if issueID == "" && slug == "" {
		return &types.ToolResult{Success: false, Error: "Either issue_id or slug is required"}, nil
	}

	if len(t.kbIDs) == 0 {
		return &types.ToolResult{Success: false, Error: "No knowledge bases available"}, nil
	}

	if issueID != "" {
		issue, err := resolveWikiIssue(ctx, t.wikiService, issueID, t.kbIDs)
		if err != nil {
			return &types.ToolResult{Success: false, Error: err.Error()}, nil
		}
		out, _ := json.MarshalIndent(issue, "", "  ")
		return &types.ToolResult{Success: true, Output: string(out)}, nil
	}

	var issues []*types.WikiPageIssue
	for _, kbID := range dedupNonEmptyStrings(t.kbIDs) {
		kbIssues, err := t.wikiService.ListIssues(ctx, kbID, slug, "pending")
		if err != nil {
			return &types.ToolResult{Success: false, Error: "Failed to list issues: " + err.Error()}, nil
		}
		for _, issue := range kbIssues {
			if issue != nil && issue.KnowledgeBaseID != "" && issue.KnowledgeBaseID != kbID {
				return &types.ToolResult{
					Success: false,
					Error: "Issue result returned knowledge base " + issue.KnowledgeBaseID +
						" while resolving allowed scope " + kbID,
				}, nil
			}
		}
		issues = append(issues, kbIssues...)
	}

	if len(issues) == 0 {
		return &types.ToolResult{Success: true, Output: "No pending issues found for slug: " + slug}, nil
	}

	out, _ := json.MarshalIndent(issues, "", "  ")
	return &types.ToolResult{Success: true, Output: string(out)}, nil
}
