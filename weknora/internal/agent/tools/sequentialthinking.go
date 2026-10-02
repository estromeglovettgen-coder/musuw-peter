package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
)

var sequentialThinkingTool = BaseTool{
	name: ToolThinking,
	description: `通过动态、可调整的分析帮助解决复杂问题。每一步可以建立在、质疑或修正之前的判断，也可以分支和回溯。
适合拆解复杂问题、可修订规划、需要纠正方向、初始范围不明、多步骤解决、保持上下文以及过滤无关信息。

## 参数
- thought：当前分析，包括正常分析、修订、质疑先前决定、发现需补充分析、调整方法、提出和核验假设。
- next_thought_needed：是否还需下一步分析。
- thought_number：当前序号，可超过最初估计。
- total_thoughts：当前预计总步骤，可增减。
- is_revision：是否修订先前分析。
- revises_thought：被修订的序号。
- branch_from_thought / branch_id：分支起点和标识。
- needs_more_thoughts：原以为结束但发现仍需分析。

## 面向用户的表达
thought 使用自然、易懂的语言，不提 grep_chunks、knowledge_search、web_search 等内部工具名。说“我先在知识库查找关键术语，再探索相关概念”，不要说“我要用 grep_chunks”；说“找到相关文档后，再查找语义相关内容”，不要介绍工具步骤。重点解释寻找什么、为什么寻找，而非使用何种工具。

## 用法
先估计步数，随进展调整；可以质疑、修订并追加步骤，表达不确定性，标记修订和分支，过滤无关内容。适当提出解决假设，用分析证据核验，必要时重复。
只有分析确实完成且答案充分时，next_thought_needed 才设为 false。不要把最终答案放在 thought 中；分析完成后输出完整用户回答并停止，不再调用工具。`,
	schema: json.RawMessage(`{
  "type": "object",
  "properties": {
    "thought": {
      "type": "string",
      "description": "当前分析步骤。使用自然、易懂的语言，不提内部工具名；描述要查找什么及原因，而非工具实现。"
    },
    "next_thought_needed": {
      "type": "boolean",
      "description": "是否还需要下一步分析。"
    },
    "thought_number": {
      "type": "integer",
      "description": "当前分析步骤序号，如 1、2、3。",
      "minimum": 1
    },
    "total_thoughts": {
      "type": "integer",
      "description": "预计总分析步数，如 5、10。",
      "minimum": 1
    },
    "is_revision": {
      "type": "boolean",
      "description": "是否修订先前的分析。"
    },
    "revises_thought": {
      "type": "integer",
      "description": "需要重新考虑的步骤序号。",
      "minimum": 1
    },
    "branch_from_thought": {
      "type": "integer",
      "description": "分支起点的步骤序号。",
      "minimum": 1
    },
    "branch_id": {
      "type": "string",
      "description": "当前分支标识。"
    },
    "needs_more_thoughts": {
      "type": "boolean",
      "description": "是否发现还需要更多分析。"
    }
  },
  "required": ["thought", "next_thought_needed", "thought_number", "total_thoughts"]
}`),
}

// SequentialThinkingTool is a dynamic and reflective problem-solving tool
// This tool helps analyze problems through a flexible thinking process that can adapt and evolve
type SequentialThinkingTool struct {
	BaseTool
	thoughtHistory []SequentialThinkingInput
	branches       map[string][]SequentialThinkingInput
}

// SequentialThinkingInput defines the input parameters for sequential thinking tool
type SequentialThinkingInput struct {
	Thought           string `json:"thought"`
	NextThoughtNeeded bool   `json:"next_thought_needed"`
	ThoughtNumber     int    `json:"thought_number"`
	TotalThoughts     int    `json:"total_thoughts"`
	IsRevision        bool   `json:"is_revision,omitempty"`
	RevisesThought    *int   `json:"revises_thought,omitempty"`
	BranchFromThought *int   `json:"branch_from_thought,omitempty"`
	BranchID          string `json:"branch_id,omitempty"`
	NeedsMoreThoughts bool   `json:"needs_more_thoughts,omitempty"`
}

// NewSequentialThinkingTool creates a new sequential thinking tool instance
func NewSequentialThinkingTool() *SequentialThinkingTool {
	return &SequentialThinkingTool{
		BaseTool:       sequentialThinkingTool,
		thoughtHistory: make([]SequentialThinkingInput, 0),
		branches:       make(map[string][]SequentialThinkingInput),
	}
}

// Execute executes the sequential thinking tool
func (t *SequentialThinkingTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][SequentialThinking] Execute started")

	// Parse args from json.RawMessage
	var input SequentialThinkingInput
	if err := json.Unmarshal(args, &input); err != nil {
		logger.Errorf(ctx, "[Tool][SequentialThinking] Failed to parse args: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, err
	}

	// Validate and parse input
	if err := t.validate(input); err != nil {
		logger.Errorf(ctx, "[Tool][SequentialThinking] Validation failed: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Validation failed: %v", err),
		}, err
	}

	// Adjust totalThoughts if thoughtNumber exceeds it
	if input.ThoughtNumber > input.TotalThoughts {
		input.TotalThoughts = input.ThoughtNumber
	}

	// Add to thought history
	t.thoughtHistory = append(t.thoughtHistory, input)

	// Handle branching
	if input.BranchFromThought != nil && input.BranchID != "" {
		if t.branches[input.BranchID] == nil {
			t.branches[input.BranchID] = make([]SequentialThinkingInput, 0)
		}
		t.branches[input.BranchID] = append(t.branches[input.BranchID], input)
	}

	logger.Debugf(ctx, "[Tool][SequentialThinking] %s", input.Thought)

	// Prepare response data
	branchKeys := make([]string, 0, len(t.branches))
	for k := range t.branches {
		branchKeys = append(branchKeys, k)
	}

	incomplete := input.NextThoughtNeeded || input.NeedsMoreThoughts ||
		input.ThoughtNumber < input.TotalThoughts

	responseData := map[string]interface{}{
		"thought_number":         input.ThoughtNumber,
		"total_thoughts":         input.TotalThoughts,
		"next_thought_needed":    input.NextThoughtNeeded,
		"branches":               branchKeys,
		"thought_history_length": len(t.thoughtHistory),
		"display_type":           "thinking",
		"thought":                input.Thought,
		"incomplete_steps":       incomplete,
	}

	logger.Infof(
		ctx,
		"[Tool][SequentialThinking] Execute completed - Thought %d/%d",
		input.ThoughtNumber,
		input.TotalThoughts,
	)

	outputMsg := "已记录思考过程"
	if incomplete {
		outputMsg = "已记录思考过程，仍有未完成步骤，请继续探索并调用工具"
	}

	return &types.ToolResult{
		Success: true,
		Output:  outputMsg,
		Data:    responseData,
	}, nil
}

// validate validates the input thought data
func (t *SequentialThinkingTool) validate(data SequentialThinkingInput) error {
	// Validate thought (required)
	if data.Thought == "" {
		return fmt.Errorf("invalid thought: must be a non-empty string")
	}

	// Validate thoughtNumber (required)
	if data.ThoughtNumber < 1 {
		return fmt.Errorf("invalid thoughtNumber: must be >= 1")
	}

	// Validate totalThoughts (required)
	if data.TotalThoughts < 1 {
		return fmt.Errorf("invalid totalThoughts: must be >= 1")
	}

	return nil
}
