package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type wikiFlagIssueTool struct {
	BaseTool
	wikiService      interfaces.WikiPageService
	kbIDs            []string
	routes           *WikiRouteResolver
	knowledgeService interfaces.KnowledgeService
	searchTargets    types.SearchTargets
	scopeEnforced    bool
}

func NewWikiFlagIssueTool(
	wikiService interfaces.WikiPageService,
	kbIDs []string,
	routes ...*WikiRouteResolver,
) *wikiFlagIssueTool {
	return &wikiFlagIssueTool{
		BaseTool: NewBaseTool(
			ToolWikiFlagIssue,
			`发现或被用户指出 Wiki 页有事实错误、混合实体或过时信息时提交问题，供人工复核或自动维护。例如一页错误混入两个不同产品。`,
			json.RawMessage(`{
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "description": "存在问题的 Wiki 页面 slug，例如 entity/hunyuan-damoxing。"
    },
    "issue_type": {
      "type": "string",
      "enum": ["mixed_entities", "contradictory_facts", "out_of_date", "other"],
      "description": "问题类别。"
    },
    "description": {
      "type": "string",
      "description": "详细说明页面哪里有问题，以及应当修复什么。"
    },
    "suspected_knowledge_ids": {
      "type": "array",
      "items": { "type": "string" },
      "description": "可选：疑似造成污染或错误的 <sources> 来源文档短 dN ID 数组。"
    }
  },
  "required": ["slug", "issue_type", "description"]
}`),
		),
		wikiService: wikiService,
		kbIDs:       kbIDs,
		routes:      firstWikiRoute(routes),
	}
}

func (t *wikiFlagIssueTool) WithKnowledgeScope(
	knowledgeService interfaces.KnowledgeService,
	searchTargets types.SearchTargets,
) *wikiFlagIssueTool {
	t.knowledgeService = knowledgeService
	t.searchTargets = searchTargets
	t.scopeEnforced = true
	return t
}

func (t *wikiFlagIssueTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	var params struct {
		Slug                  string   `json:"slug"`
		IssueType             string   `json:"issue_type"`
		Description           string   `json:"description"`
		SuspectedKnowledgeIDs []string `json:"suspected_knowledge_ids"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return &types.ToolResult{Success: false, Error: "Invalid parameters: " + err.Error()}, nil
	}

	slug := strings.TrimSpace(params.Slug)
	normalizedSlug, slugErr := normalizeAndValidateWikiSlug(slug)
	if slugErr != nil {
		return &types.ToolResult{Success: false, Error: slugErr.Error()}, nil
	}
	slug = normalizedSlug

	if len(t.kbIDs) == 0 {
		return &types.ToolResult{Success: false, Error: "No knowledge bases available for issue tracking"}, nil
	}

	page, kbID, err := resolveUniqueWikiPage(ctx, t.wikiService, slug, t.kbIDs, t.routes)
	if err != nil {
		return &types.ToolResult{Success: false, Error: err.Error()}, nil
	}
	suspectedKnowledgeIDs := params.SuspectedKnowledgeIDs
	if t.scopeEnforced && len(suspectedKnowledgeIDs) > 0 {
		resolved, scopeErr := resolveAuthorizedSourceRefs(
			ctx, t.searchTargets, suspectedKnowledgeIDs, t.knowledgeService,
		)
		if scopeErr != nil {
			return &types.ToolResult{Success: false, Error: "Invalid suspected_knowledge_ids: " + scopeErr.Error()}, nil
		}
		suspectedKnowledgeIDs = make([]string, 0, len(resolved))
		for _, ref := range resolved {
			suspectedKnowledgeIDs = append(suspectedKnowledgeIDs, strings.SplitN(ref, "|", 2)[0])
		}
	}

	issue := &types.WikiPageIssue{
		TenantID:              page.TenantID,
		KnowledgeBaseID:       kbID,
		Slug:                  slug,
		IssueType:             params.IssueType,
		Description:           params.Description,
		SuspectedKnowledgeIDs: suspectedKnowledgeIDs,
		ReportedBy:            "wiki-researcher-agent",
		Status:                "pending",
	}

	_, err = t.wikiService.CreateIssue(ctx, issue)
	if err != nil {
		return &types.ToolResult{Success: false, Error: "Failed to create issue: " + err.Error()}, nil
	}

	return &types.ToolResult{
		Success: true,
		Output:  fmt.Sprintf("Successfully flagged issue for %s. A maintenance ticket has been created for review.", slug),
	}, nil
}
