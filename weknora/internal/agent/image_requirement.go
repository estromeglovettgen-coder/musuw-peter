package agent

import (
	"strings"

	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/searchutil"
	"github.com/Tencent/WeKnora/internal/types"
)

const agentRetrievedImageRequirementMarker = "## 检索图片输出要求"

const agentRetrievedImageSystemRequirement = `

## 检索图片输出要求
本轮检索结果包含 Markdown 图片，默认将片段附带的图片视为相关。
- 除非用户明确要求纯文字，或全部检索图片显然无关，最终回答必须包含至少一张从工具结果逐字复制的相关 Markdown 图片。
- 完整保留 Markdown 图片语法和 URL，不得创造、缩短、规范化或替换 URL。
- 必须使用 ASCII 半角括号，格式为 ![alt](url)，不得用全角（或）。
- 图片紧接其支持的段落。
- 多张图片支持不同章节时，分布在相应章节，不要只使用第一张。
- 结束前自行检查：要求适用时，回答确实含有 Markdown 图片。`

func stepContainsMarkdownImage(step types.AgentStep) bool {
	for _, toolCall := range step.ToolCalls {
		if toolCall.Result != nil &&
			toolCall.Result.Success &&
			searchutil.MarkdownImageRegex.MatchString(toolCall.Result.Output) {
			return true
		}
	}
	return false
}

func appendAgentRetrievedImageRequirement(messages []chat.Message) []chat.Message {
	for i := range messages {
		if messages[i].Role != "system" {
			continue
		}
		if !strings.Contains(messages[i].Content, agentRetrievedImageRequirementMarker) {
			messages[i].Content = strings.TrimRight(messages[i].Content, " \t\r\n") + agentRetrievedImageSystemRequirement
		}
		break
	}
	return messages
}
