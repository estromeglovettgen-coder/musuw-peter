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

// Tool name constant for read_skill

var readSkillTool = BaseTool{
	name: ToolReadSkill,
	description: `按需读取技能规则及专门能力。
- 调用 read_skill(skill_name=...)，不传 file_path，读取 SKILL.md 和脚本、文档、参考资料的文件列表，据此发现 scripts/generate_ppt.py 等文件。
- 随后可用 read_skill(skill_name=..., file_path="scripts/...") 读取单个文件。file_path 是技能内相对路径，不是 /opt/weknora/tenant/skills/... 绝对路径。
- 不用 list_sandbox_files、read_sandbox_file 或 ls 探查技能安装目录；沙箱文件工具只读 /workspace/output 和 /workspace/input，技能目录还含 .venv / node_modules。
系统显示匹配技能、执行技能描述对应任务前，或需要查技能文档、模板、脚本时使用。
返回技能规则、可用文件列表及已安装技能的解释器位置；提供 file_path 时返回文件内容。`,
	schema: utils.GenerateSchema[ReadSkillInput](),
}

// ReadSkillInput defines the input parameters for the read_skill tool
type ReadSkillInput struct {
	SkillName string `json:"skill_name" jsonschema:"要读取的技能名称。"`
	FilePath  string `json:"file_path,omitempty" jsonschema:"可选：技能内相对路径，如 scripts/generate_ppt.py；不传则读取 SKILL.md 并列出文件。不要传 /opt/weknora/tenant/skills/... 或 /workspace 路径。"`
}

// ReadSkillTool allows the agent to read skill content on demand
type ReadSkillTool struct {
	BaseTool
	skillManager *skills.Manager
}

// NewReadSkillTool creates a new read_skill tool instance
func NewReadSkillTool(skillManager *skills.Manager) *ReadSkillTool {
	return &ReadSkillTool{
		BaseTool:     readSkillTool,
		skillManager: skillManager,
	}
}

// Execute executes the read_skill tool
func (t *ReadSkillTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][ReadSkill] Execute started")

	// Parse input
	var input ReadSkillInput
	if err := json.Unmarshal(args, &input); err != nil {
		logger.Errorf(ctx, "[Tool][ReadSkill] Failed to parse args: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, nil
	}

	// Validate skill name
	if input.SkillName == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "skill_name is required",
		}, nil
	}

	// Check if skill manager is available
	if t.skillManager == nil || !t.skillManager.IsEnabled() {
		return &types.ToolResult{
			Success: false,
			Error:   "Skills are not enabled",
		}, nil
	}

	var builder strings.Builder
	var resultData = make(map[string]interface{})

	if input.FilePath != "" {
		rel, err := skillRelativeFilePath(input.SkillName, input.FilePath)
		if err != nil {
			return &types.ToolResult{
				Success: false,
				Error:   err.Error(),
			}, nil
		}
		input.FilePath = rel
		if input.FilePath == "" {
			return &types.ToolResult{
				Success: false,
				Error: fmt.Sprintf(
					"file_path is the skill directory; omit file_path and call read_skill(skill_name=%q) to list files",
					input.SkillName,
				),
			}, nil
		}
		// Read a specific file from the skill directory
		content, err := t.skillManager.ReadSkillFile(ctx, input.SkillName, input.FilePath)
		if err != nil {
			logger.Errorf(ctx, "[Tool][ReadSkill] Failed to read skill file: %v", err)
			return &types.ToolResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to read skill file: %v", err),
			}, nil
		}

		builder.WriteString(fmt.Sprintf("=== Skill File: %s/%s ===\n\n", input.SkillName, input.FilePath))
		builder.WriteString(content)

		resultData["skill_name"] = input.SkillName
		resultData["file_path"] = input.FilePath
		resultData["content"] = content
		resultData["content_length"] = len(content)

	} else {
		// Read the main skill instructions (SKILL.md)
		skill, err := t.skillManager.LoadSkill(ctx, input.SkillName)
		if err != nil {
			logger.Errorf(ctx, "[Tool][ReadSkill] Failed to load skill: %v", err)
			return &types.ToolResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to load skill: %v", err),
			}, nil
		}

		// List available files in the skill directory
		files, err := t.skillManager.ListSkillFiles(ctx, input.SkillName)
		if err != nil {
			files = []string{} // Non-fatal error
		}

		builder.WriteString(fmt.Sprintf("=== Skill: %s ===\n\n", skill.Name))
		builder.WriteString(fmt.Sprintf("**Description**: %s\n\n", skill.Description))
		builder.WriteString("## Instructions\n\n")
		builder.WriteString(skill.Instructions)

		// Add available files section
		if len(files) > 1 { // More than just SKILL.md
			builder.WriteString("\n\n## Available Files\n\n")
			builder.WriteString("以下文件位于此技能目录中。使用 `read_skill` 的 `file_path` 读取文件（相对路径，例如 scripts/foo.py）。不要使用 `list_sandbox_files` 或 `ls` 列出技能目录：\n\n")
			for _, file := range files {
				if file != skills.SkillFileName { // Don't list SKILL.md again
					if skills.IsScript(file) {
						builder.WriteString(fmt.Sprintf("- `%s` (script - can be executed)\n", file))
					} else {
						builder.WriteString(fmt.Sprintf("- `%s`\n", file))
					}
				}
			}
		}

		resultData["skill_name"] = skill.Name
		resultData["description"] = skill.Description
		resultData["instructions"] = skill.Instructions
		resultData["instructions_length"] = len(skill.Instructions)
		resultData["files"] = files

		if dir, ok := t.skillManager.SandboxSkillDir(skill.Name); ok {
			builder.WriteString(skillEnvironmentSection(dir))
			resultData["skill_dir"] = dir
			resultData["skill_python"] = sandbox.SkillVenvPython(dir)
		}
	}

	logger.Infof(ctx, "[Tool][ReadSkill] Successfully read skill: %s", input.SkillName)

	return &types.ToolResult{
		Success: true,
		Output:  builder.String(),
		Data:    resultData,
	}, nil
}

// skillEnvironmentSection tells the model where the skill's dependencies are.
//
// Every skill keeps its dependencies to itself — Python in its own virtualenv,
// Node in its own node_modules — so a bare interpreter started anywhere else
// sees none of them. A model that probes with `python3 -c "import pandas"` or
// `node -e "require('echarts')"` therefore reads the failure as "this skill
// cannot run" and answers it by installing the packages again, into a session
// sandbox that is thrown away: the image stays untouched and the next session
// repeats the whole thing.
//
// The two languages fail for different reasons, which is why the advice below
// is per-language. Python needs the virtualenv's own interpreter named
// explicitly. Node resolves from the importing file's directory, so running a
// script by absolute path already finds the skill's node_modules — it is only
// `node -e` and friends, which have no file to resolve from, that need the
// working directory moved into the skill.
func skillEnvironmentSection(skillDir string) string {
	return fmt.Sprintf(`

## Execution Environment

- This skill is installed at `+"`%s`"+` inside the sandbox, and its
  dependencies live there with it, not in the sandbox's system interpreters.
- `+"`execute_skill_script`"+` already runs its scripts the right way, including
  `+"`/workspace/...`"+` files you wrote that still need this skill's packages. Prefer
  it over invoking them yourself with a bare interpreter.
- Do NOT paste a program into `+"`python3 -c`"+` or into `+"`%s -c`"+`.
  Write it with `+"`write_sandbox_file`"+`, then
  `+"`execute_skill_script(skill_name=..., script_path=/workspace/output/....py)`"+`.
- Do NOT list or read that directory with `+"`list_sandbox_files`"+` /
  `+"`read_sandbox_file`"+` / `+"`ls`"+`: those tools only see `+"`/workspace/output`"+`
  and `+"`/workspace/input`"+`, and the skill tree includes `+"`.venv`"+` /
  `+"`node_modules`"+`. Call `+"`read_skill`"+` without `+"`file_path`"+` to list
  files, or with `+"`file_path`"+` to read one.
- Do NOT decide from a system interpreter whether this skill can run, and do
  NOT reinstall its dependencies with `+"`pip install`"+` / `+"`npm install`"+`
  into `+"`%s`"+` (that tree is frozen; `+"`uv venv`"+` often has no pip):
  `+"`chown`"+` / `+"`ensurepip`"+` / `+"`pip install`"+` there is rejected.
  On-demand extras (`+"`install_deps.py --word`"+`, python-docx, …) go to
  `+"`python3 -m pip install --target %s <package>`"+`, then
  `+"`execute_skill_script`"+` (PYTHONPATH already includes that directory).
  Or ask the user to reinstall the skill so extras are baked into the image.
`, skillDir, sandbox.SkillVenvPython(skillDir), skillDir, sandbox.SessionSkillPackageDir(path.Base(skillDir)))
}

// skillRelativeFilePath maps a model-supplied path onto a relative path
// inside skillName. Absolute /opt/weknora/tenant/skills/<name>/... paths and
// a redundant "<name>/..." prefix are accepted so a copied ls line still
// works. Workspace paths are rejected here; they belong to other tools.
func skillRelativeFilePath(skillName, filePath string) (string, error) {
	trimmed := strings.TrimSpace(filePath)
	if trimmed == "" {
		return "", nil
	}
	clean := path.Clean(trimmed)
	if path.IsAbs(trimmed) {
		dir, err := sandbox.SkillDirFor(skillName)
		if err == nil {
			if clean == dir {
				return "", nil
			}
			if strings.HasPrefix(clean, dir+"/") {
				return strings.TrimPrefix(clean, dir+"/"), nil
			}
		}
		if other, inImage := sandbox.SkillNameFromImagePath(clean); inImage && other != "" && other != skillName {
			return "", fmt.Errorf(
				"file_path 属于技能 %q，请调用 read_skill(skill_name=%q, file_path=...)",
				other, other,
			)
		}
		return "", fmt.Errorf(
			"file_path 必须为技能内的相对路径（例如 scripts/generate_ppt.py），不能为 %s",
			filePath,
		)
	}
	prefix := skillName + "/"
	if strings.HasPrefix(clean, prefix) {
		return strings.TrimPrefix(clean, prefix), nil
	}
	return clean, nil
}

// Cleanup releases any resources (implements Tool interface if needed)
func (t *ReadSkillTool) Cleanup(ctx context.Context) error {
	return nil
}
