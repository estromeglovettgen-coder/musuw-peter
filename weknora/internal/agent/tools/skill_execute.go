package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

// Tool name constant for execute_skill_script

var executeSkillScriptTool = BaseTool{
	name: ToolExecuteSkillScript,
	description: `使用技能自己的解释器和依赖执行脚本。

## 用法
- script_path 为技能内路径（如 scripts/analyze.py），或刚用 write_sandbox_file 写入的绝对会话路径（如 /workspace/output/generate_ppt.py），后者仍使用技能虚拟环境和 node_modules。
- 不把 /workspace/input 作为 script_path；附件通过 args 作为输入。
- 从当前 <sandbox_attachments> 取得用户附件的绝对 /workspace/input/... 路径，经 args 传入接受文件的脚本。
- /workspace/input 只读；生成文件只写 $WEKNORA_SKILL_OUTPUT_DIR，方便收集下载。
- Python 使用技能虚拟环境，Node 根据脚本位置解析 node_modules。系统 python3 -c 或 node -e 导入失败，不能证明该工具不能运行。
- 技能目录安装后冻结；会话中不运行 install_deps.py、python -m pip、ensurepip 修改 .venv。缺包时用系统 python3 -m pip install --target 安装到 /workspace/.skill-packages/<skill_name>，再调用本工具，PYTHONPATH 已包含该目录。

## 使用场景
技能要求运行脚本；write_sandbox_file / edit_sandbox_file 定制了脚本且仍需要 python-pptx、pandas 等技能依赖；需要自动化、数据处理，或执行比临时生成代码更可靠的确定性操作。
不需要技能依赖的独立 /workspace 脚本使用 shell_exec。

## 环境与输出
脚本在权限有限沙箱执行，网络默认关闭。内置脚本在技能目录，会话脚本在 /workspace 内但不能在 /workspace/input。
返回 stdout、stderr 和 exit_code；0 成功，非 0 失败。`,
	schema: utils.GenerateSchema[ExecuteSkillScriptInput](),
}

// ExecuteSkillScriptInput defines the input parameters for the execute_skill_script tool
type ExecuteSkillScriptInput struct {
	SkillName  string   `json:"skill_name" jsonschema:"脚本所属技能名称。"`
	ScriptPath string   `json:"script_path" jsonschema:"技能内相对路径（如 scripts/analyze.py）或 write_sandbox_file 创建的绝对 /workspace/... 路径，不使用 /workspace/input。"`
	Args       []string `json:"args,omitempty" jsonschema:"可选命令行参数。文件参数使用当前 <sandbox_attachments> 中的绝对 /workspace/input/... 路径；内存数据用 input。"`
	Input      string   `json:"input,omitempty" jsonschema:"可选：通过 stdin 传入脚本的数据，例如内存中的 JSON，等价于将数据管道传入脚本。"`
}

// UnmarshalJSON accepts args as either the documented string array or a single
// command-line string. Some model providers emit a string for a single tool
// argument; accepting it here keeps that malformed-but-unambiguous call from
// failing before the script can run.
func (i *ExecuteSkillScriptInput) UnmarshalJSON(data []byte) error {
	var raw struct {
		SkillName  string          `json:"skill_name"`
		ScriptPath string          `json:"script_path"`
		Args       json.RawMessage `json:"args"`
		Input      string          `json:"input"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	i.SkillName = raw.SkillName
	i.ScriptPath = raw.ScriptPath
	i.Input = raw.Input
	i.Args = nil

	if len(raw.Args) == 0 || string(raw.Args) == "null" {
		return nil
	}

	if err := json.Unmarshal(raw.Args, &i.Args); err == nil {
		return nil
	}

	var argsString string
	if err := json.Unmarshal(raw.Args, &argsString); err != nil {
		return fmt.Errorf("args must be a string or an array of strings: %w", err)
	}

	// A string is interpreted as a conventional space-separated command line.
	// The tool schema continues to advertise []string, so well-formed calls are
	// unaffected; this is only a compatibility fallback for model output.
	i.Args = strings.Fields(argsString)
	return nil
}

// ExecuteSkillScriptTool allows the agent to execute skill scripts in a sandbox
type ExecuteSkillScriptTool struct {
	BaseTool
	skillManager *skills.Manager
}

// NewExecuteSkillScriptTool creates a new execute_skill_script tool instance
func NewExecuteSkillScriptTool(skillManager *skills.Manager) *ExecuteSkillScriptTool {
	return &ExecuteSkillScriptTool{
		BaseTool:     executeSkillScriptTool,
		skillManager: skillManager,
	}
}

// Execute executes the execute_skill_script tool
func (t *ExecuteSkillScriptTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][ExecuteSkillScript] Execute started")

	// Parse input
	var input ExecuteSkillScriptInput
	if err := json.Unmarshal(args, &input); err != nil {
		logger.Errorf(ctx, "[Tool][ExecuteSkillScript] Failed to parse args: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, nil
	}

	// Validate required fields
	if input.SkillName == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "skill_name is required",
		}, nil
	}

	if input.ScriptPath == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "script_path is required",
		}, nil
	}

	if _, ok := sandbox.RunnableWorkspaceScript(input.ScriptPath); !ok {
		rel, err := skillRelativeFilePath(input.SkillName, input.ScriptPath)
		if err != nil {
			return &types.ToolResult{
				Success: false,
				Error:   err.Error(),
			}, nil
		}
		if rel == "" {
			return &types.ToolResult{
				Success: false,
				Error:   "script_path is the skill directory; pass a relative script such as scripts/generate_ppt.py",
			}, nil
		}
		input.ScriptPath = rel
	}

	// Check if skill manager is available
	if t.skillManager == nil || !t.skillManager.IsEnabled() {
		return &types.ToolResult{
			Success: false,
			Error:   "Skills are not enabled",
		}, nil
	}

	// Execute the script in sandbox
	logger.Infof(ctx, "[Tool][ExecuteSkillScript] Executing script: %s/%s with args: %v, input length: %d",
		input.SkillName, input.ScriptPath, input.Args, len(input.Input))

	result, err := t.skillManager.ExecuteScript(ctx, input.SkillName, input.ScriptPath, input.Args, input.Input)
	if err != nil {
		logger.Errorf(ctx, "[Tool][ExecuteSkillScript] Script execution failed: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Script execution failed: %v", err),
		}, nil
	}

	// Build output
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("=== Script Execution: %s/%s ===\n\n", input.SkillName, input.ScriptPath))

	if len(input.Args) > 0 {
		builder.WriteString(fmt.Sprintf("**Arguments**: %v\n", input.Args))
	}

	builder.WriteString(fmt.Sprintf("**Exit Code**: %d\n", result.ExitCode))
	builder.WriteString(fmt.Sprintf("**Duration**: %v\n\n", result.Duration))

	if result.Killed {
		builder.WriteString("**Warning**: Script was terminated (timeout or killed)\n\n")
	}

	if result.Stdout != "" {
		builder.WriteString("## Standard Output\n\n")
		builder.WriteString("```\n")
		builder.WriteString(result.Stdout)
		if !strings.HasSuffix(result.Stdout, "\n") {
			builder.WriteString("\n")
		}
		builder.WriteString("```\n\n")
	}

	if result.Stderr != "" {
		builder.WriteString("## Standard Error\n\n")
		builder.WriteString("```\n")
		builder.WriteString(result.Stderr)
		if !strings.HasSuffix(result.Stderr, "\n") {
			builder.WriteString("\n")
		}
		builder.WriteString("```\n\n")
	}

	if result.Error != "" {
		builder.WriteString("## Error\n\n")
		builder.WriteString(result.Error)
		builder.WriteString("\n")
	}

	if hint := skillOnDemandInstallHint(input.SkillName, input.ScriptPath, result.Stdout, result.Stderr); hint != "" {
		builder.WriteString(hint)
		builder.WriteString("\n")
	} else if !result.IsSuccess() {
		if hint := pythonSyntaxErrorHint(result.Stderr); hint != "" {
			builder.WriteString(hint)
			builder.WriteString("\n")
		} else if hint := skillMissingPackageHint(input.SkillName, result.Stderr); hint != "" {
			builder.WriteString(hint)
			builder.WriteString("\n")
		}
	}

	// Determine success based on exit code
	success := result.IsSuccess()

	resultData := map[string]interface{}{
		"display_type": "shell_exec",
		"command":      skillScriptCommand(input),
		"skill_name":   input.SkillName,
		"script_path":  input.ScriptPath,
		"args":         input.Args,
		"exit_code":    result.ExitCode,
		"stdout":       result.Stdout,
		"stderr":       result.Stderr,
		"duration_ms":  result.Duration.Milliseconds(),
		"killed":       result.Killed,
	}

	logger.Infof(ctx, "[Tool][ExecuteSkillScript] Script completed with exit code: %d", result.ExitCode)

	return &types.ToolResult{
		Success: success,
		Output:  builder.String(),
		Data:    resultData,
		Error: func() string {
			if !success {
				if result.Error != "" {
					return result.Error
				}
				return fmt.Sprintf("Script exited with code %d", result.ExitCode)
			}
			return ""
		}(),
	}, nil
}

func skillScriptCommand(input ExecuteSkillScriptInput) string {
	parts := make([]string, 0, 1+len(input.Args))
	script := strings.TrimSpace(input.ScriptPath)
	switch {
	case strings.HasPrefix(path.Clean(script), "/workspace/"):
		parts = append(parts, script)
	case input.SkillName != "" && script != "":
		parts = append(parts, input.SkillName+"/"+script)
	case script != "":
		parts = append(parts, script)
	}
	parts = append(parts, input.Args...)
	return strings.Join(parts, " ")
}

// Cleanup releases any resources
func (t *ExecuteSkillScriptTool) Cleanup(ctx context.Context) error {
	return nil
}
