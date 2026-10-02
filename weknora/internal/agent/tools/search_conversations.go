package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// searchConversationsMaxResults bounds how much conversation history one call
// can pull into the context window. Past conversations are verbose and the
// agent is usually looking for one exchange, not a reading list.
const searchConversationsMaxResults = 8

// searchConversationsSnippetRunes truncates each side of a recalled exchange.
const searchConversationsSnippetRunes = 400

var searchConversationsTool = BaseTool{
	name: ToolSearchConversations,
	description: `搜索当前用户与助手的历史会话。
用户提到当前对话没有的旧内容时使用，例如“上次你给我的那个配置”“我们上个月聊过这个”“我之前问过的那个报错”。
答案在文档时用 knowledge_search；当前对话已有信息或没有提到过去的一般问题不使用。
返回匹配交流，含会话标题、日期、用户问题和助手回答。
只搜索当前用户自己的会话，不搜索同事会话。旧答案可能过时，与当前文档冲突时优先当前文档并说明，不将旧答案重复当成事实。`,
	schema: json.RawMessage(`{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "按用户原话描述要在历史会话中查找什么。"
    },
    "limit": {
      "type": "integer",
      "description": "最多返回的历史交流数，默认 5，最多 8。"
    }
  },
  "required": ["query"]
}`),
}

// SearchConversationsInput defines the input parameters for the tool.
type SearchConversationsInput struct {
	Query string `json:"query"`
	Limit int    `json:"limit,omitempty"`
}

// SearchConversationsTool lets the agent look things up in the user's own chat
// history.
//
// A long-term memory feature that distils conversations into a few dozen
// sentences will always lose detail — the exact config someone was given three
// weeks ago is not a durable fact about them, and storing it would be the wrong
// shape. Keeping the transcripts searchable and letting the agent go back for
// them is the same division of labour MemGPT uses: a small always-present
// summary plus retrieval into the full history on demand.
type SearchConversationsTool struct {
	BaseTool
	messageService interfaces.MessageService
	// ownerID is the person whose history may be searched. It is captured when
	// the tool is built rather than read from the model's arguments, so no
	// prompt can talk the agent into reading someone else's conversations.
	ownerID string
	// currentSessionID is excluded from results: the model already has this
	// conversation, and returning it wastes context and invites loops.
	currentSessionID string
}

// NewSearchConversationsTool creates the conversation history search tool.
func NewSearchConversationsTool(
	messageService interfaces.MessageService, ownerID, currentSessionID string,
) *SearchConversationsTool {
	return &SearchConversationsTool{
		BaseTool:         searchConversationsTool,
		messageService:   messageService,
		ownerID:          ownerID,
		currentSessionID: currentSessionID,
	}
}

// Execute searches the user's own past conversations.
func (t *SearchConversationsTool) Execute(
	ctx context.Context, args json.RawMessage,
) (*types.ToolResult, error) {
	var input SearchConversationsInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, err
	}
	query := strings.TrimSpace(input.Query)
	if query == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "query is required",
		}, fmt.Errorf("missing query")
	}
	if t.messageService == nil {
		return &types.ToolResult{
			Success: false,
			Error:   "conversation history search is not available",
		}, fmt.Errorf("no message service")
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 5
	}
	if limit > searchConversationsMaxResults {
		limit = searchConversationsMaxResults
	}

	result, err := t.messageService.SearchMessages(ctx, &types.MessageSearchParams{
		Query: query,
		Mode:  types.MessageSearchModeHybrid,
		// Over-fetch so dropping the current session cannot empty the result.
		Limit:   limit + 2,
		OwnerID: t.ownerID,
	})
	if err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Conversation search failed: %v", err),
		}, err
	}

	var b strings.Builder
	b.WriteString("<past_conversations>\n")
	found := 0
	for _, item := range result.Items {
		if item == nil || found >= limit {
			continue
		}
		if item.SessionID == t.currentSessionID {
			continue
		}
		found++
		fmt.Fprintf(&b, "<exchange session=\"%s\" date=\"%s\">\n",
			xmlEscape(item.SessionTitle), item.CreatedAt.Format("2006-01-02"))
		if question := snippet(item.QueryContent, searchConversationsSnippetRunes); question != "" {
			fmt.Fprintf(&b, "<user>%s</user>\n", xmlEscape(question))
		}
		if answer := snippet(item.AnswerContent, searchConversationsSnippetRunes); answer != "" {
			fmt.Fprintf(&b, "<assistant>%s</assistant>\n", xmlEscape(answer))
		}
		b.WriteString("</exchange>\n")
	}
	b.WriteString("</past_conversations>")

	if found == 0 {
		return &types.ToolResult{
			Success: true,
			Output: "<past_conversations />\n" +
				"该用户的历史对话中没有匹配内容。不要假定此前讨论过。",
			Data: map[string]interface{}{"query": query, "matches": 0},
		}, nil
	}

	return &types.ToolResult{
		Success: true,
		Output:  b.String(),
		Data:    map[string]interface{}{"query": query, "matches": found},
	}, nil
}

// snippet trims and truncates one side of an exchange.
func snippet(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}
	return string(runes[:maxRunes]) + "…"
}
