package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/Tencent/WeKnora/internal/utils"
)

var webSearchTool = BaseTool{
	name: ToolWebSearch,
	description: `搜索互联网中的最新信息和新闻，补充知识库可能没有的内容。

## 知识库优先
必须先完成 grep_chunks 和 knowledge_search，不能跳过。只有两者都没有足够结果时才能使用网络搜索。

## 能力与用法
- 搜索实时信息，自动压缩和提取相关内容。
- 会话范围内缓存，避免重复建立索引。
- 适合知识库不足时查询新闻、事件、更新、近期发展或趋势，以及核验、补充知识库信息。
- query 为必填搜索字符串。
返回标题、短 wN 网页 ID、摘要和正文，最多 %d 条。

## 示例
{"query":"人工智能的最新进展"}
{"query":"Python 3.12 发布说明"}

## 证据与降级
标题、URL、摘要和正文片段都可作为搜索摘要证据。只有摘要不足或需要全文核验时才用 web_fetch。
web_fetch 失败后保留搜索证据，说明网页正文未核验，对动态事实降低确定性；不能仅因网页抓取失败就反复做等价搜索。
请优化搜索词，提高相关性，并遵循最多 %d 条结果的限制。`,
	schema: utils.GenerateSchema[WebSearchInput](),
}

// WebSearchInput defines the input parameters for web search tool
type WebSearchInput struct {
	Query string `json:"query" jsonschema:"搜索问题或关键词。"`
}

// WebSearchTool performs web searches and returns results
type WebSearchTool struct {
	BaseTool
	webSearchService      interfaces.WebSearchService
	knowledgeBaseService  interfaces.KnowledgeBaseService
	knowledgeService      interfaces.KnowledgeService
	webSearchStateService interfaces.WebSearchStateService
	sessionID             string
	maxResults            int
	providerID            string // WebSearchProviderEntity ID (resolved from agent config or tenant default)
}

// NewWebSearchTool creates a new web search tool
func NewWebSearchTool(
	webSearchService interfaces.WebSearchService,
	knowledgeBaseService interfaces.KnowledgeBaseService,
	knowledgeService interfaces.KnowledgeService,
	webSearchStateService interfaces.WebSearchStateService,
	sessionID string,
	maxResults int,
	providerID string,
) *WebSearchTool {
	tool := webSearchTool
	tool.description = fmt.Sprintf(tool.description, maxResults, maxResults)

	return &WebSearchTool{
		BaseTool:              tool,
		webSearchService:      webSearchService,
		knowledgeBaseService:  knowledgeBaseService,
		knowledgeService:      knowledgeService,
		webSearchStateService: webSearchStateService,
		sessionID:             sessionID,
		maxResults:            maxResults,
		providerID:            providerID,
	}
}

// Execute executes the web search tool
func (t *WebSearchTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][WebSearch] Execute started")

	// Parse args from json.RawMessage
	var input WebSearchInput
	if err := json.Unmarshal(args, &input); err != nil {
		logger.Errorf(ctx, "[Tool][WebSearch] Failed to parse args: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, err
	}

	// Parse query
	query := input.Query
	ok := query != ""
	if !ok || query == "" {
		logger.Errorf(ctx, "[Tool][WebSearch] Query is required")
		return &types.ToolResult{
			Success: false,
			Error:   "query parameter is required",
		}, fmt.Errorf("query parameter is required")
	}

	logger.Infof(ctx, "[Tool][WebSearch] Searching with query: %s, max_results: %d", query, t.maxResults)

	// Get tenant ID from context
	tenantID := uint64(0)
	if tid, ok := ctx.Value(types.TenantIDContextKey).(uint64); ok {
		tenantID = tid
	}

	if tenantID == 0 {
		logger.Errorf(ctx, "[Tool][WebSearch] Workspace ID not found in context")
		return &types.ToolResult{
			Success: false,
			Error:   "workspace ID not found in context",
		}, fmt.Errorf("workspace ID not found in context")
	}

	// Get tenant info from context (same approach as search.go)
	var tenant *types.Tenant
	if tenantValue := ctx.Value(types.TenantInfoContextKey); tenantValue != nil {
		tenant, _ = tenantValue.(*types.Tenant)
	}

	// Resolve provider ID: tool-level (set from agent config, which already resolved default)
	resolvedProviderID := t.providerID

	// Create a copy of the effective web search config with maxResults from agent config.
	searchConfig := types.EffectiveWebSearchConfig(nil)
	if tenant != nil {
		searchConfig = types.EffectiveWebSearchConfig(tenant.WebSearchConfig)
	}
	searchConfig.MaxResults = t.maxResults

	// Perform web search
	logger.Infof(
		ctx,
		"[Tool][WebSearch] Performing web search with providerID: %s, maxResults: %d",
		resolvedProviderID,
		searchConfig.MaxResults,
	)
	webResults, err := t.webSearchService.Search(ctx, resolvedProviderID, searchConfig, query)
	if err != nil {
		logger.Errorf(ctx, "[Tool][WebSearch] Web search failed: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("web search failed: %v", err),
		}, fmt.Errorf("web search failed: %w", err)
	}

	logger.Infof(ctx, "[Tool][WebSearch] Web search returned %d results", len(webResults))

	// Apply RAG compression if configured
	if len(webResults) > 0 && searchConfig.CompressionMethod != "none" &&
		searchConfig.CompressionMethod != "" {
		// Load session-scoped temp KB state from Redis using WebSearchStateRepository
		tempKBID, seen, ids := t.webSearchStateService.GetWebSearchTempKBState(ctx, t.sessionID)

		// Build questions for RAG compression
		questions := []string{strings.TrimSpace(query)}

		logger.Infof(ctx, "[Tool][WebSearch] Applying RAG compression")
		compressed, kbID, newSeen, newIDs, err := t.webSearchService.CompressWithRAG(
			ctx, t.sessionID, tempKBID, questions, webResults, searchConfig,
			t.knowledgeBaseService, t.knowledgeService, seen, ids,
		)
		if err != nil {
			logger.Warnf(ctx, "[Tool][WebSearch] RAG compression failed, using raw results: %v", err)
		} else {
			webResults = compressed
			// Persist temp KB state back into Redis using WebSearchStateRepository
			t.webSearchStateService.SaveWebSearchTempKBState(ctx, t.sessionID, kbID, newSeen, newIDs)
			logger.Infof(ctx, "[Tool][WebSearch] RAG compression completed, %d results", len(webResults))
		}
	}

	// Format output
	if len(webResults) == 0 {
		return &types.ToolResult{
			Success: true,
			Output:  fmt.Sprintf("No web search results found for query: %s", query),
			Data: map[string]interface{}{
				"query":   query,
				"results": []interface{}{},
				"count":   0,
			},
		}, nil
	}

	// Build output text
	output := "=== Web Search Results ===\n"
	output += fmt.Sprintf("Query: %s\n", query)
	output += fmt.Sprintf("Found %d result(s)\n\n", len(webResults))

	// Format results
	formattedResults := make([]map[string]interface{}, 0, len(webResults))
	for i, result := range webResults {
		output += fmt.Sprintf("Result #%d:\n", i+1)
		output += fmt.Sprintf("  Title: %s\n", result.Title)
		output += fmt.Sprintf("  URL: %s\n", result.URL)
		if result.Snippet != "" {
			output += fmt.Sprintf("  Snippet: %s\n", result.Snippet)
		}
		if result.Content != "" {
			// Truncate content if too long
			content := result.Content
			if len(content) > 500 {
				content = content[:500] + "..."
			}
			output += fmt.Sprintf("  Content: %s\n", content)
		}
		if result.PublishedAt != nil {
			output += fmt.Sprintf("  Published: %s\n", result.PublishedAt.Format(time.RFC3339))
		}
		output += "\n"

		resultData := map[string]interface{}{
			"result_index":  i + 1,
			"title":         result.Title,
			"url":           result.URL,
			"snippet":       result.Snippet,
			"content":       result.Content,
			"source":        result.Source,
			"evidence_type": "search_summary",
			"page_verified": false,
		}
		if result.PublishedAt != nil {
			resultData["published_at"] = result.PublishedAt.Format(time.RFC3339)
		}
		formattedResults = append(formattedResults, resultData)
	}

	// Add guidance for next steps
	output += "\n=== 下一步 ===\n"
	if len(webResults) > 0 {
		output += "- 标题、链接、摘要及正文片段可以作为搜索摘要证据。\n"
		output += "- 证据充分时直接回答。仅在需要核实完整网页中的信息时调用 web_fetch。\n"
		output += "- 如果抓取失败，保留这些结果，说明未核实网页正文，不要将动态信息描述为确定事实。\n"
	} else {
		output += "- 没有找到网页搜索结果。可以考虑：\n"
		output += "  - 更换搜索问题或关键词\n"
		output += "  - 检查是否能根据知识库回答\n"
		output += "  - 确认该主题是否需要实时信息\n"
	}

	return &types.ToolResult{
		Success: true,
		Output:  output,
		Data: map[string]interface{}{
			"query":        query,
			"results":      formattedResults,
			"count":        len(webResults),
			"display_type": "web_search_results",
		},
	}, nil
}
