package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

var todoWriteTool = BaseTool{
	name: ToolTodoWrite,
	description: `创建并管理检索和研究任务的结构化清单，用于组织复杂任务、跟踪进度。

## 仅跟踪检索与研究
包括查知识库、读文档、收集资料、比较对象。不要加入“总结发现”“生成最终回答”“综合结果”，这些由 thinking 处理。

## 使用场景
任务需要至少 3 个步骤、需要规划或多次操作、用户明确要求清单、提出多个任务，或有新指令需要记录时使用。开始工作前标记 in_progress；完成后立即标记 completed，再加入新发现的后续任务。
单个简单任务、无组织收益的琐事、纯对话或一般说明不需要清单。

## 示例
- 比较 Peter 与 LangChain、LlamaIndex：分别检索 Peter 特性与架构、另两个框架的文档，再取得具体比较依据；全部检索完后由 thinking 综合。
- 研究 RAG 向量数据库：检索知识库、最新技术、性能比较和集成方法，清单只跟踪检索。
- Python 输出 Hello World 或解释 git status：一步能完成，不建清单。

## 状态和管理
- pending：尚未开始。
- in_progress：正在执行，同一时间最多一个。
- completed：已经完整完成。
工作中及时更新，完成后立即标记，不集中补标。完成当前任务再开始下一项，无关任务直接移除。
存在失败、部分完成、未解决错误、缺失文件或依赖时不能标记完成；保留 in_progress，并增加解决阻塞的任务。
任务要具体、可执行，以要检索什么为中心；复杂检索拆成可管理步骤。清单跟踪检索，thinking 负责综合与呈现。
不确定复杂任务是否需清单时，优先使用，确保检索要求完整完成。`,
	schema: utils.GenerateSchema[TodoWriteInput](),
}

// TodoWriteTool implements a planning tool for complex tasks
// This is an optional tool that helps organize multi-step research
type TodoWriteTool struct {
	BaseTool
}

// TodoWriteInput defines the input parameters for todo_write tool
type TodoWriteInput struct {
	Task  string     `json:"task,omitempty" jsonschema:"需要规划的复杂任务或问题。"`
	Steps []PlanStep `json:"steps" jsonschema:"带状态跟踪的研究步骤数组。"`
}

// PlanStep represents a single step in the research plan
type PlanStep struct {
	ID          string `json:"id" jsonschema:"步骤唯一标识，例如 step1、step2。"`
	Description string `json:"description" jsonschema:"明确描述本步骤要调查或完成什么。"`
	Status      string `json:"status" jsonschema:"当前状态：pending（未开始）、in_progress（执行中）、completed（已完成）。"`
}

// NewTodoWriteTool creates a new todo_write tool instance
func NewTodoWriteTool() *TodoWriteTool {
	return &TodoWriteTool{
		BaseTool: todoWriteTool,
	}
}

// Execute executes the todo_write tool
func (t *TodoWriteTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	// Parse args from json.RawMessage
	var input TodoWriteInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, err
	}

	if input.Task == "" {
		input.Task = "No task description provided"
	}

	// Parse plan steps
	planSteps := input.Steps

	// Generate formatted output
	output := generatePlanOutput(input.Task, planSteps)

	// Prepare structured data for response
	stepsJSON, _ := json.Marshal(planSteps)

	return &types.ToolResult{
		Success: true,
		Output:  output,
		Data: map[string]interface{}{
			"task":         input.Task,
			"steps":        planSteps,
			"steps_json":   string(stepsJSON),
			"total_steps":  len(planSteps),
			"plan_created": true,
			"display_type": "plan",
		},
	}, nil
}

// Helper function to safely get string field from map
func getStringField(m map[string]interface{}, key string) string {
	if val, ok := m[key].(string); ok {
		return val
	}
	return ""
}

// Helper function to safely get string array field from map
func getStringArrayField(m map[string]interface{}, key string) []string {
	if val, ok := m[key].([]interface{}); ok {
		result := make([]string, 0, len(val))
		for _, item := range val {
			if str, ok := item.(string); ok {
				result = append(result, str)
			}
		}
		return result
	}
	// Handle legacy string format for backward compatibility
	if val, ok := m[key].(string); ok && val != "" {
		return []string{val}
	}
	return []string{}
}

// generatePlanOutput generates a formatted plan output
func generatePlanOutput(task string, steps []PlanStep) string {
	output := "已创建计划\n\n"
	output += fmt.Sprintf("**任务**： %s\n\n", task)

	if len(steps) == 0 {
		output += "提示：尚未提供具体步骤。建议创建 3–7 个检索任务，进行系统研究。\n\n"
		output += "建议的检索流程（只包含检索任务，不包括总结）：\n"
		output += "1. 使用 grep_chunks 搜索关键词并定位相关文档\n"
		output += "2. 使用 knowledge_search 进行语义检索，获取相关内容\n"
		output += "3. 使用 list_knowledge_chunks 获取关键文档的完整内容\n"
		output += "4. 必要时使用 web_search 获取补充信息\n"
		output += "\n提示：归纳与综合由思考工具完成。不要在此添加总结任务。\n"
		return output
	}

	// Count task statuses
	pendingCount := 0
	inProgressCount := 0
	completedCount := 0
	for _, step := range steps {
		switch step.Status {
		case "pending":
			pendingCount++
		case "in_progress":
			inProgressCount++
		case "completed":
			completedCount++
		}
	}
	totalCount := len(steps)
	remainingCount := pendingCount + inProgressCount

	output += "**计划步骤**：\n\n"

	// Display all steps in order
	for i, step := range steps {
		output += formatPlanStep(i+1, step)
	}

	// Add summary and emphasis on remaining tasks
	output += "\n=== 任务进度 ===\n"
	output += fmt.Sprintf("共 %d 个任务\n", totalCount)
	output += fmt.Sprintf("✅ 已完成：%d\n", completedCount)
	output += fmt.Sprintf("🔄 进行中：%d\n", inProgressCount)
	output += fmt.Sprintf("⏳ 待处理：%d\n", pendingCount)

	output += "\n=== ⚠️ 重要提醒 ===\n"
	if remainingCount > 0 {
		output += fmt.Sprintf("**还有 %d 个任务未完成！**\n\n", remainingCount)
		output += "**完成所有任务后才能总结或下结论。**\n\n"
		output += "接下来：\n"
		if inProgressCount > 0 {
			output += "- 继续完成进行中的任务\n"
		}
		if pendingCount > 0 {
			output += fmt.Sprintf("- 开始处理 %d 个待处理任务\n", pendingCount)
			output += "- 按顺序完成每个任务，不要跳过\n"
		}
		output += "- 每完成一个任务，使用 todo_write 将其标记为 completed\n"
		output += "- 所有任务完成后再生成最终总结\n"
	} else {
		output += "✅ **所有任务已完成！**\n\n"
		output += "现在可以：\n"
		output += "- 综合所有任务的发现\n"
		output += "- 生成完整的最终回答或报告\n"
		output += "- 确认各方面都已充分研究\n"
	}

	return output
}

// formatPlanStep formats a single plan step for output
func formatPlanStep(index int, step PlanStep) string {
	statusEmoji := map[string]string{
		"pending":     "⏳",
		"in_progress": "🔄",
		"completed":   "✅",
		"skipped":     "⏭️",
	}

	emoji, ok := statusEmoji[step.Status]
	if !ok {
		emoji = "⏳"
	}

	output := fmt.Sprintf("  %d. %s [%s] %s\n", index, emoji, step.Status, step.Description)

	// if len(step.ToolsToUse) > 0 {
	// 	output += fmt.Sprintf("     工具: %s\n", strings.Join(step.ToolsToUse, ", "))
	// }

	return output
}
