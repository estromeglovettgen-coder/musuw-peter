package agent

import (
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
)

// formatFileSize formats file size in human-readable format
func formatFileSize(size int64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)

	if size < KB {
		return fmt.Sprintf("%d B", size)
	} else if size < MB {
		return fmt.Sprintf("%.2f KB", float64(size)/KB)
	} else if size < GB {
		return fmt.Sprintf("%.2f MB", float64(size)/MB)
	}
	return fmt.Sprintf("%.2f GB", float64(size)/GB)
}

// formatDocSummary cleans and truncates document summaries for table display
func formatDocSummary(summary string, maxLen int) string {
	cleaned := strings.TrimSpace(summary)
	if cleaned == "" {
		return "-"
	}
	cleaned = strings.ReplaceAll(cleaned, "\n", " ")
	cleaned = strings.ReplaceAll(cleaned, "\r", " ")
	cleaned = strings.Join(strings.Fields(cleaned), " ")

	runes := []rune(cleaned)
	if len(runes) <= maxLen {
		return cleaned
	}
	return strings.TrimSpace(string(runes[:maxLen])) + "..."
}

// RecentDocInfo contains brief information about a recently added document
type RecentDocInfo struct {
	ChunkID             string
	KnowledgeBaseID     string
	KnowledgeID         string
	Title               string
	Description         string
	FileName            string
	FileSize            int64
	Type                string
	CreatedAt           string // Formatted time string
	FAQStandardQuestion string
	FAQSimilarQuestions []string
	FAQAnswers          []string
}

// SelectedDocumentInfo contains summary information about a user-selected document (via @ mention).
// Injected into the user message runtime_context (pinned_documents); content is fetched via tools.
type SelectedDocumentInfo struct {
	KnowledgeID     string // Knowledge ID
	KnowledgeBaseID string // Knowledge base ID
	Title           string // Document title
	FileName        string // Original file name
	FileType        string // File type (pdf, docx, etc.)
}

// PinnedMCPServiceInfo describes an MCP service explicitly @mentioned for this turn.
type PinnedMCPServiceInfo struct {
	ID          string
	Name        string
	Description string
	ToolNames   []string // Registered tool.function names for this service (mcp_{service}_{tool})
}

// PinnedSkillInfo describes a preloaded skill explicitly @mentioned for this turn.
type PinnedSkillInfo struct {
	Name        string
	Description string
}

// KnowledgeBaseInfo contains essential information about a knowledge base for agent prompt
type KnowledgeBaseInfo struct {
	ID          string
	Name        string
	Type        string // Knowledge base type: "document" or "faq"
	Description string
	DocCount    int
	// Capabilities lists the retrieval surfaces this KB exposes. Any subset of
	// {"wiki", "chunks"}. "chunks" is present when the KB has vector and/or
	// keyword (BM25) indexing enabled. This is the *deterministic* source of
	// truth the agent should consult before picking a retrieval strategy —
	// significantly more reliable than running probing searches.
	Capabilities []string
	RecentDocs   []RecentDocInfo // Recently added documents (up to 10)
}

// PlaceholderDefinition defines a placeholder exposed to UI/configuration
// Deprecated: Use types.PromptPlaceholder instead
type PlaceholderDefinition struct {
	Name        string `json:"name"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// AvailablePlaceholders lists all supported prompt placeholders for UI hints
// This returns agent mode specific placeholders
func AvailablePlaceholders() []PlaceholderDefinition {
	// Use centralized placeholder definitions from types package
	placeholders := types.PlaceholdersByField(types.PromptFieldAgentSystemPrompt)
	result := make([]PlaceholderDefinition, len(placeholders))
	for i, p := range placeholders {
		result[i] = PlaceholderDefinition{
			Name:        p.Name,
			Label:       p.Label,
			Description: p.Description,
		}
	}
	return result
}

// formatKnowledgeBaseList formats knowledge base information as XML for the prompt
func formatKnowledgeBaseList(kbInfos []*KnowledgeBaseInfo) string {
	if len(kbInfos) == 0 {
		return "<knowledge_bases />"
	}

	var b strings.Builder
	b.WriteString("<knowledge_bases>\n")
	for _, kb := range kbInfos {
		kbType := kb.Type
		if kbType == "" {
			kbType = "document"
		}
		capsAttr := ""
		if len(kb.Capabilities) > 0 {
			capsAttr = fmt.Sprintf(" capabilities=\"%s\"", strings.Join(kb.Capabilities, ","))
		}
		b.WriteString(fmt.Sprintf("<knowledge_base id=\"%s\" name=\"%s\" type=\"%s\" doc_count=\"%d\"%s>\n",
			kb.ID, kb.Name, kbType, kb.DocCount, capsAttr))
		if kb.Description != "" {
			b.WriteString(fmt.Sprintf("<description>%s</description>\n", kb.Description))
		}

		if len(kb.RecentDocs) > 0 {
			if kbType == "faq" {
				b.WriteString("<faq_entries>\n")
				for j, doc := range kb.RecentDocs {
					if j >= 10 {
						break
					}
					question := doc.FAQStandardQuestion
					if question == "" {
						question = doc.FileName
					}
					b.WriteString(fmt.Sprintf("<faq chunk_id=\"%s\" knowledge_id=\"%s\" created_at=\"%s\">\n",
						doc.ChunkID, doc.KnowledgeID, doc.CreatedAt))
					b.WriteString(fmt.Sprintf("<question>%s</question>\n", question))
					if len(doc.FAQAnswers) > 0 {
						for _, ans := range doc.FAQAnswers {
							b.WriteString(fmt.Sprintf("<answer>%s</answer>\n", ans))
						}
					}
					b.WriteString("</faq>\n")
				}
				b.WriteString("</faq_entries>\n")
			} else {
				b.WriteString("<recent_documents>\n")
				for j, doc := range kb.RecentDocs {
					if j >= 2 {
						break
					}
					docName := doc.Title
					if docName == "" {
						docName = doc.FileName
					}
					fileSize := formatFileSize(doc.FileSize)
					b.WriteString(fmt.Sprintf("<document knowledge_id=\"%s\" type=\"%s\" file_size=\"%s\" created_at=\"%s\">\n",
						doc.KnowledgeID, doc.Type, fileSize, doc.CreatedAt))
					b.WriteString(fmt.Sprintf("<name>%s</name>\n", docName))
					if doc.Description != "" {
						summary := formatDocSummary(doc.Description, 120)
						b.WriteString(fmt.Sprintf("<summary>%s</summary>\n", summary))
					}
					b.WriteString("</document>\n")
				}
				b.WriteString("</recent_documents>\n")
			}
		}
		b.WriteString("</knowledge_base>\n")
	}
	b.WriteString("</knowledge_bases>")
	return b.String()
}

// renderPromptPlaceholders renders placeholders in the prompt template.
//
// Supported placeholders:
//   - {{knowledge_bases}} - Historically expanded to the full bound-KB XML
//     block. Since that block now lives in the user message's
//     `<runtime_context>` (see observe.buildRuntimeContextBlock), the
//     placeholder is expanded to a short pointer so legacy / custom
//     templates that still reference `{{knowledge_bases}}` degrade
//     gracefully instead of dumping the detail twice.
//   - `<must_use>` is NOT a placeholder — when the user @mentions MCP/Skill,
//     observe.buildMustUseBlock injects it as a sibling block in the user
//     message; system prompts document it by convention (see agent_system_prompt.yaml).
func renderPromptPlaceholders(template string, knowledgeBases []*KnowledgeBaseInfo) string {
	result := template

	if strings.Contains(result, "{{knowledge_bases}}") {
		var replacement string
		if len(knowledgeBases) == 0 {
			replacement = "（本会话未关联知识库）"
		} else {
			replacement = "（当前关联知识库及其能力见用户消息 <runtime_context> 中的 <bound_knowledge_bases>）"
		}
		result = strings.ReplaceAll(result, "{{knowledge_bases}}", replacement)
	}

	return result
}

// formatSkillsMetadata formats skills metadata for the system prompt (Level 1 - Progressive Disclosure)
// This is a lightweight representation that only includes skill name and description
func formatSkillsMetadata(skillsMetadata []*skills.SkillMetadata, shellExecEnabled bool) string {
	if len(skillsMetadata) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("\n### 可用技能（重要，请仔细阅读）\n\n")
	builder.WriteString("**每次处理用户请求时，都必须主动判断是否应使用这些技能。**\n\n")

	builder.WriteString("#### 技能匹配流程（必须遵守）\n\n")
	builder.WriteString("回答任何用户问题前，执行以下检查：\n\n")
	builder.WriteString("1. **浏览**：阅读下面每个技能的说明和触发条件\n")
	builder.WriteString("2. **匹配**：检查用户意图是否符合任一技能的关键词、场景或任务类型\n")
	builder.WriteString("3. **加载**：匹配时，必须先调用 `read_skill(skill_name=\"...\")` 再生成回答\n")
	builder.WriteString("4. **应用**：遵循技能要求，提供更好的结构化回答\n\n")

	builder.WriteString("**⚠️ 关键**：适用时必须使用技能，不能为了节省时间或 token 而跳过。\n\n")

	builder.WriteString("#### 可用技能\n\n")
	for i, skill := range skillsMetadata {
		builder.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, skill.Name))
		builder.WriteString(fmt.Sprintf("   %s\n\n", skill.Description))
	}

	builder.WriteString("#### 工具参考\n\n")
	builder.WriteString("- `read_skill(skill_name)`：加载 SKILL.md 并列出技能文件。通过它发现脚本，不要用 `list_sandbox_files` 或 `ls` 查看 `/opt/weknora/tenant/skills/...`\n")
	builder.WriteString("- `read_skill(skill_name, file_path)`：读取技能中的文件，`file_path` 是相对路径，例如 `scripts/generate_ppt.py`\n")
	builder.WriteString("- `execute_skill_script(skill_name, script_path, args, input)`：使用该技能自己的解释器和依赖运行脚本\n")
	builder.WriteString("  - `script_path`：技能内的相对路径（`scripts/foo.py`），或由 `write_sandbox_file` / `edit_sandbox_file` 创建的 `/workspace/...` 绝对路径（不能是 `/workspace/input`）\n")
	builder.WriteString("  - `input`：通过标准输入直接传递数据，适用于已有内存数据，例如 JSON 字符串\n")
	builder.WriteString("  - `args`：命令行参数；用户上传文件使用 <sandbox_attachments> 中的 `/workspace/input/...` 绝对路径\n")
	builder.WriteString("  - `/workspace/input` 必须只读，生成文件只能写入 `$WEKNORA_SKILL_OUTPUT_DIR`\n")
	builder.WriteString(sandboxArtifactReferenceGuidance())
	builder.WriteString("  - 每个技能有独立依赖（virtualenv 或 node_modules）；")
	builder.WriteString("本工具已使用正确环境运行脚本。裸用 `python3 -c` / `node -e` ")
	builder.WriteString("看不到这些依赖，不能据此判断技能无法运行。")
	builder.WriteString("技能安装后目录只读，不得运行 install_deps.py、")
	builder.WriteString("chown、ensurepip，或在 `/opt/weknora/tenant/skills` 中执行 pip。")
	builder.WriteString("需要额外依赖时：执行 `python3 -m pip install --target /workspace/.skill-packages/<skill> <package>`，")
	builder.WriteString("然后使用 execute_skill_script；也可请用户重新安装技能，使额外依赖随安装包含\n")
	if shellExecEnabled {
		builder.WriteString("- `shell_exec(command, work_dir, timeout_sec, max_output_bytes, max_stderr_bytes, env)`：自由执行 shell 命令，探索当前会话隔离的 Cube 沙箱\n")
		builder.WriteString("  - 用户上传文件恢复到 `/workspace/input`，在 <sandbox_attachments> 中列出\n")
		builder.WriteString("  - 使用 `find`、`ls` 查找文件；`cat`、`head`、`tail`、`sed` 查看文字；`grep`、`awk` 搜索和处理内容；未知类型用 `file` 判断\n")
		builder.WriteString("  - 不要用 `ls` / `find` / `cat` / `file` 扫描 `/opt/weknora/tenant/skills` 寻找脚本。`read_skill(skill_name)` 已列出文件，该目录还包含 `.venv` / `node_modules`\n")
		builder.WriteString("  - shell 管道、重定向、脚本、包管理器、编译器或其他已安装命令是最直接的方法时，可以使用\n")
		builder.WriteString("  - 不要用 `python3 -c` 检查技能生成的 Office 文件，系统 Python 没有 python-docx/pptx。用 `write_sandbox_file` 写短脚本，再用 `execute_skill_script` 运行；不要将相同代码粘贴到 `.venv/bin/python -c`\n")
		builder.WriteString("  - 修改已写文件的几行时使用 `edit_sandbox_file`，不要重写整个文件\n")
		builder.WriteString("  - Python 字符串：绝不能在 `\"...\"` 中嵌套未转义的 ASCII `\"`（或在 `'...'` 中嵌套 `'`）；使用另一种引号，中文引用使用「」\n")
		builder.WriteString("  - 大段文字可将每个流的 `max_output_bytes` 提高至 65536，或用 `sed`/`head`/`tail` 查看特定部分\n")
		builder.WriteString("  - 二进制输出会被隐藏；将结果写入 `/workspace/output`，让 ArtifactCollector 收集为可下载附件\n")
		builder.WriteString("  - 会话状态在后续 `shell_exec` 和 `execute_skill_script` 调用间持续保留\n")
		builder.WriteString("  - 非零退出码是正常结果而非工具错误；检查 stderr 后决定下一步\n")
	}

	return builder.String()
}

// sandboxArtifactReferenceGuidance tells the model how to point at a file it
// generated in the sandbox from its final answer.
//
// Without this, models improvise a Markdown image with the bare file name
// (`![评分](市场画像评分.html)`), which the browser cannot resolve — the answer
// renders a broken image icon. The `sandbox:` prefix makes the intent explicit
// so the server can bind the name to the artifact index it hands the client.
func sandboxArtifactReferenceGuidance() string {
	var builder strings.Builder
	builder.WriteString("  - 要在回答中展示生成文件，使用 ")
	builder.WriteString("`![说明](sandbox:<文件名>)`，文件名必须准确且不带目录路径\n")
	builder.WriteString("    - 图片直接显示；图表、表格和文档")
	builder.WriteString("显示为可点击预览的卡片\n")
	builder.WriteString("    - 不得直接引用沙箱路径（`/workspace/output/...`）")
	builder.WriteString("或裸文件名，浏览器无法解析它们\n")
	builder.WriteString("    - 输出文件名尽量不含空格或括号，")
	builder.WriteString("避免引用歧义\n")
	return builder.String()
}

// renderPromptPlaceholdersWithStatus renders placeholders including web search status
// Supported placeholders:
//   - {{knowledge_bases}}
//   - {{web_search_status}} -> "已启用" or "未启用"
//   - {{current_time}} -> current time string
//   - {{language}} -> user language name (e.g. "Chinese (Simplified)", "English")
//   - {{skills}} -> formatted skills metadata (if any)
func renderPromptPlaceholdersWithStatus(
	template string,
	knowledgeBases []*KnowledgeBaseInfo,
	webSearchEnabled bool,
	currentTime string,
	language string,
) string {
	// Knowledge bases need special formatting, so handle it first
	result := renderPromptPlaceholders(template, knowledgeBases)

	status := "未启用"
	if webSearchEnabled {
		status = "已启用"
	}

	result = types.RenderPromptPlaceholders(result, types.PlaceholderValues{
		"web_search_status": status,
		"current_time":      currentTime,
		"language":          language,
		"skills":            "", // Remove {{skills}} placeholder; skills are appended separately if present
	})
	return result
}

// BuildSystemPromptOptions contains optional parameters for BuildSystemPrompt
type BuildSystemPromptOptions struct {
	SkillsMetadata   []*skills.SkillMetadata
	ShellExecEnabled bool
	Language         string         // User language name for {{language}} placeholder (e.g. "Chinese (Simplified)")
	Config           *config.Config // Config for reading prompt templates; nil falls back to hardcoded defaults
}

// BuildSystemPrompt builds the progressive RAG system prompt
// This is the main function to use - it uses a unified template with dynamic web search status
func BuildSystemPrompt(
	knowledgeBases []*KnowledgeBaseInfo,
	webSearchEnabled bool,
	systemPromptTemplate ...string,
) string {
	return BuildSystemPromptWithOptions(knowledgeBases, webSearchEnabled, nil, systemPromptTemplate...)
}

// BuildSystemPromptWithOptions builds the system prompt with additional options like skills
func BuildSystemPromptWithOptions(
	knowledgeBases []*KnowledgeBaseInfo,
	webSearchEnabled bool,
	options *BuildSystemPromptOptions,
	systemPromptTemplate ...string,
) string {
	var basePrompt string
	var template string

	// Determine template to use
	if len(systemPromptTemplate) > 0 && systemPromptTemplate[0] != "" {
		template = systemPromptTemplate[0]
	} else if len(knowledgeBases) == 0 {
		var cfg *config.Config
		if options != nil {
			cfg = options.Config
		}
		template = GetPureAgentSystemPrompt(cfg)
	} else {
		var cfg *config.Config
		if options != nil {
			cfg = options.Config
		}
		template = GetProgressiveRAGSystemPrompt(cfg)
	}

	currentTime := time.Now().Format(time.RFC3339)
	language := ""
	if options != nil {
		language = options.Language
	}
	basePrompt = renderPromptPlaceholdersWithStatus(template, knowledgeBases, webSearchEnabled, currentTime, language)

	// Append skills metadata if available (Level 1 - Progressive Disclosure)
	if options != nil && len(options.SkillsMetadata) > 0 {
		basePrompt += formatSkillsMetadata(options.SkillsMetadata, options.ShellExecEnabled)
	}

	return basePrompt
}

// GetPureAgentSystemPrompt returns the Pure Agent system prompt from config templates.
// The template must be defined in config/prompt_templates/agent_system_prompt.yaml
// with mode "pure". Returns empty string if config is nil or template not found.
func GetPureAgentSystemPrompt(cfg *config.Config) string {
	if cfg != nil && cfg.PromptTemplates != nil {
		if t := config.DefaultTemplateByMode(cfg.PromptTemplates.AgentSystemPrompt, "pure"); t != nil && t.Content != "" {
			return t.Content
		}
	}
	return ""
}

// GetProgressiveRAGSystemPrompt returns the Progressive RAG Agent system prompt from config templates.
// The template must be defined in config/prompt_templates/agent_system_prompt.yaml
// with mode "rag". Returns empty string if config is nil or template not found.
func GetProgressiveRAGSystemPrompt(cfg *config.Config) string {
	if cfg != nil && cfg.PromptTemplates != nil {
		if t := config.DefaultTemplateByMode(cfg.PromptTemplates.AgentSystemPrompt, "rag"); t != nil && t.Content != "" {
			return t.Content
		}
	}
	return ""
}
