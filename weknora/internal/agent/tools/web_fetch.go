package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"

	webfetch "github.com/Tencent/WeKnora/internal/infrastructure/web_fetch"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

var webFetchTool = BaseTool{
	name: ToolWebFetch,
	description: `获取 web_search 返回网页的详细正文，再用模型分析。
- 接受一个或多个 {url:"wN", prompt}。字段仍叫 url，值必须是短网页 ID。
- 每页独立抓取并返回结构化状态；部分失败不影响其他成功页。
- 搜索片段不足或事实需要全文核验时使用。
- 抓取失败时，搜索标题、URL、片段仍可作为证据。
- 不重复抓取不可重试的 URL，不在全部抓取失败后无止境扩大搜索。
- 无法核验网页时，依据搜索摘要作答并说明限制，对动态事实降低确定性。`,
	schema: utils.GenerateSchema[WebFetchInput](),
}

// WebFetchInput defines the input parameters for web fetch tool.
type WebFetchInput struct {
	Items []WebFetchItem `json:"items" jsonschema:"批量抓取任务，每项包含短 wN 网页 ID 和分析提示。"`
}

// WebFetchItem represents a single web fetch task.
type WebFetchItem struct {
	URL    string `json:"url" jsonschema:"web_search 返回的短 wN 网页 ID。"`
	Prompt string `json:"prompt" jsonschema:"用于分析抓取正文的提示词。"`
}

type webContentFetcher interface {
	Fetch(context.Context, string) (string, error)
}

type webFetchItemResult struct {
	output string
	data   map[string]interface{}
	status string
}

// WebFetchTool fetches web page content and summarizes it using an LLM.
type WebFetchTool struct {
	BaseTool
	fetcher   webContentFetcher
	chatModel chat.Chat
}

// NewWebFetchTool creates a new web_fetch tool instance.
func NewWebFetchTool(chatModel chat.Chat) *WebFetchTool {
	return newWebFetchTool(chatModel, webfetch.NewFetcher())
}

func newWebFetchTool(chatModel chat.Chat, fetcher webContentFetcher) *WebFetchTool {
	return &WebFetchTool{
		BaseTool:  webFetchTool,
		fetcher:   fetcher,
		chatModel: chatModel,
	}
}

// Execute runs web_fetch and preserves successful items when a batch partially fails.
func (t *WebFetchTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][WebFetch] Execute started")
	var input WebFetchInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("failed to parse args: %v", err)}, err
	}
	if len(input.Items) == 0 {
		return &types.ToolResult{Success: false, Error: "missing required parameter: items"}, nil
	}

	results := make([]*webFetchItemResult, len(input.Items))
	seenURLs := make(map[string]struct{}, len(input.Items))
	var waitGroup sync.WaitGroup
	for index, item := range input.Items {
		canonicalURL := canonicalFetchURL(item.URL)
		if _, duplicate := seenURLs[canonicalURL]; duplicate {
			results[index] = duplicateWebFetchResult(item)
			continue
		}
		seenURLs[canonicalURL] = struct{}{}
		waitGroup.Add(1)
		go func(resultIndex int, fetchItem WebFetchItem) {
			defer waitGroup.Done()
			results[resultIndex] = t.fetchItem(ctx, fetchItem)
		}(index, item)
	}
	waitGroup.Wait()

	return buildWebFetchToolResult(ctx, results), nil
}

func (t *WebFetchTool) fetchItem(ctx context.Context, item WebFetchItem) *webFetchItemResult {
	displayURL := strings.TrimSpace(item.URL)
	if strings.TrimSpace(item.Prompt) == "" {
		return failedWebFetchResult(displayURL, false, "invalid_arguments", "prompt is required")
	}

	fetchURL := normalizeGitHubURL(displayURL)
	content, err := t.fetcher.Fetch(ctx, fetchURL)
	if err != nil {
		code, retryable, message := webfetch.ErrorDetails(err)
		logger.Warnf(ctx, "[Tool][WebFetch] fetch failed url=%s code=%s retryable=%v err=%v", displayURL, code, retryable, err)
		return failedWebFetchResult(displayURL, retryable, string(code), message)
	}

	data := map[string]interface{}{
		"url":            displayURL,
		"status":         "success",
		"retryable":      false,
		"prompt":         item.Prompt,
		"raw_content":    content,
		"content_length": len(content),
		"evidence_type":  "fetched_page",
		"summary_status": "not_requested",
	}
	summary, summaryErr := t.processWithLLM(ctx, item, content)
	if summaryErr != nil {
		data["summary_status"] = "failed"
		data["summary_error_code"] = "summary_failed"
		data["summary_error_message"] = summaryErr.Error()
		logger.Warnf(ctx, "[Tool][WebFetch] summary failed url=%s err=%v", displayURL, summaryErr)
	} else if summary != "" {
		data["summary_status"] = "success"
		data["summary"] = summary
	}

	return &webFetchItemResult{
		output: buildWebFetchOutput(item, content, summary, summaryErr),
		data:   data,
		status: "success",
	}
}

func failedWebFetchResult(rawURL string, retryable bool, code, message string) *webFetchItemResult {
	data := map[string]interface{}{
		"url":           rawURL,
		"status":        "failed",
		"retryable":     retryable,
		"error_code":    code,
		"error_message": message,
	}
	return &webFetchItemResult{
		output: fmt.Sprintf("URL: %s\nStatus: failed\nRetryable: %t\nError code: %s\nError: %s\n",
			rawURL, retryable, code, message),
		data:   data,
		status: "failed",
	}
}

func duplicateWebFetchResult(item WebFetchItem) *webFetchItemResult {
	message := "duplicate URL skipped in this batch"
	return &webFetchItemResult{
		output: fmt.Sprintf("URL: %s\nStatus: skipped\nRetryable: false\nReason: %s\n", item.URL, message),
		data: map[string]interface{}{
			"url":           item.URL,
			"status":        "skipped",
			"retryable":     false,
			"error_code":    "duplicate_url",
			"error_message": message,
		},
		status: "skipped",
	}
}

func buildWebFetchToolResult(ctx context.Context, results []*webFetchItemResult) *types.ToolResult {
	var builder strings.Builder
	builder.WriteString("=== Web Fetch Results ===\n\n")
	aggregated := make([]map[string]interface{}, 0, len(results))
	successCount, failedCount, skippedCount := 0, 0, 0
	for index, result := range results {
		if result == nil {
			result = failedWebFetchResult("", false, "internal_error", "fetch item returned no result")
		}
		builder.WriteString(fmt.Sprintf("#%d:\n%s\n", index+1, result.output))
		aggregated = append(aggregated, result.data)
		switch result.status {
		case "success":
			successCount++
		case "failed":
			failedCount++
		case "skipped":
			skippedCount++
		}
	}

	allFailed := successCount == 0 && failedCount > 0
	builder.WriteString("=== 下一步 ===\n")
	switch {
	case allFailed:
		builder.WriteString("- 所有网页抓取均失败。停止继续扩大搜索，根据已有 web_search 的标题、链接及摘要回答。\n")
		builder.WriteString("- 明确说明网页正文未被核实。价格、库存等动态信息应视为不确定。\n")
	case failedCount > 0:
		builder.WriteString("- 结合抓取成功的正文与已有搜索摘要回答；个别链接失败不会使成功的证据失效。\n")
		builder.WriteString("- 不要重试不可重试的错误。证据充分时直接回答。\n")
	default:
		builder.WriteString("- 综合抓取到的证据，在充分时作答。\n")
	}

	logger.Infof(ctx, "[Tool][WebFetch] completed success=%d failed=%d skipped=%d", successCount, failedCount, skippedCount)
	toolResult := &types.ToolResult{
		Success: successCount > 0,
		Output:  builder.String(),
		Data: map[string]interface{}{
			"results":          aggregated,
			"count":            len(aggregated),
			"successful_count": successCount,
			"failed_count":     failedCount,
			"skipped_count":    skippedCount,
			"all_failed":       allFailed,
			"display_type":     "web_fetch_results",
		},
	}
	if allFailed {
		toolResult.Error = "all page fetches failed"
	}
	return toolResult
}

func (t *WebFetchTool) processWithLLM(ctx context.Context, item WebFetchItem, content string) (string, error) {
	if t.chatModel == nil {
		return "", fmt.Errorf("chat model not available for web_fetch summary")
	}
	messages := []chat.Message{
		{
			Role:    "system",
			Content: "根据提供的网页正文回答用户需求，不得编造页面中不存在的信息。",
		},
		{
			Role:    "user",
			Content: fmt.Sprintf("用户需求：\n%s\n\n网页正文：\n%s", item.Prompt, content),
		},
	}
	modelCtx := types.WithLLMCallMetadata(ctx, "web_fetch_summary", "")
	response, err := t.chatModel.Chat(modelCtx, messages, &chat.ChatOptions{Temperature: 0.3, MaxTokens: 1024})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(response.Content), nil
}

func buildWebFetchOutput(item WebFetchItem, content, summary string, summaryErr error) string {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("URL: %s\nStatus: success\nPrompt: %s\n", item.URL, item.Prompt))
	if summary != "" {
		builder.WriteString("Summary:\n")
		builder.WriteString(summary)
		builder.WriteString("\n")
		return builder.String()
	}
	if summaryErr != nil {
		builder.WriteString(fmt.Sprintf("Summary status: failed (%s); fetched page content remains usable.\n", summaryErr))
	}
	builder.WriteString("Content Preview:\n")
	builder.WriteString(content)
	builder.WriteString("\n")
	return builder.String()
}

func canonicalFetchURL(rawURL string) string {
	trimmed := normalizeGitHubURL(strings.TrimSpace(rawURL))
	parsedURL, err := url.Parse(trimmed)
	if err != nil || parsedURL.Host == "" {
		return trimmed
	}
	parsedURL.Fragment = ""
	parsedURL.Host = strings.ToLower(parsedURL.Host)
	return parsedURL.String()
}

func normalizeGitHubURL(source string) string {
	if strings.Contains(source, "github.com") && strings.Contains(source, "/blob/") {
		source = strings.Replace(source, "github.com", "raw.githubusercontent.com", 1)
		source = strings.Replace(source, "/blob/", "/", 1)
	}
	return source
}
