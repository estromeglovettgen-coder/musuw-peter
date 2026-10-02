package handler

import (
	"context"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"text/template"
	"unicode/utf8"

	"github.com/Tencent/WeKnora/internal/agent"
	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/application/service/memory"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

type systemPromptItem struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Group          string   `json:"group"`
	Description    string   `json:"description"`
	Content        string   `json:"content"`
	DefaultContent string   `json:"default_content"`
	Variables      []string `json:"variables"`
	Customized     bool     `json:"customized"`
}

var promptAction = regexp.MustCompile(`\{\{([\s\S]*?)\}\}`)
var promptField = regexp.MustCompile(`(?:^|[\s(])(\.[a-zA-Z_][a-zA-Z0-9_]*)`)
var promptPlainVariable = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func promptVariables(content string) []string {
	seen := map[string]bool{}
	for _, action := range promptAction.FindAllStringSubmatch(content, -1) {
		body := strings.TrimSpace(action[1])
		if promptPlainVariable.MatchString(body) {
			switch body {
			case "end", "else", "break", "continue":
				continue
			}
			seen["{{"+body+"}}"] = true
		}
		for _, field := range promptField.FindAllStringSubmatch(body, -1) {
			seen["{{"+field[1]+"}}"] = true
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

// Only list prompts whose generation call sites resolve workspace overrides.
func systemPromptCatalog(cfg *config.Config) []systemPromptItem {
	items := []systemPromptItem{}
	add := func(id, name, group, description, content string) {
		if strings.TrimSpace(content) == "" {
			return
		}
		items = append(items, systemPromptItem{ID: id, Name: name, Group: group, Description: description, Content: content, DefaultContent: content, Variables: promptVariables(content)})
	}
	if cfg != nil && cfg.Conversation != nil {
		c := cfg.Conversation
		if c.Summary != nil {
			add("conversation.system", "普通问答系统规则", "对话", "普通问答的默认回答规则；智能体已填写的回答规则优先。", c.Summary.Prompt)
			add("conversation.context", "资料上下文模板", "对话", "将检索结果与问题组合成模型上下文。", c.Summary.ContextTemplate)
		}
		add("conversation.rewrite_system", "问题改写规则", "对话", "把多轮问题改写为适合检索的完整问题。", c.RewritePromptSystem)
		add("conversation.rewrite_user", "问题改写输入", "对话", "传递当前问题和历史对话，保留数据变量。", c.RewritePromptUser)
		add("conversation.fallback", "无资料时的回答", "对话", "模型兜底模式使用的默认提示词。", c.FallbackPrompt)
		add("conversation.session_title", "对话标题", "对话", "为新对话生成标题。", c.GenerateSessionTitlePrompt)
		add("conversation.document_summary", "文件摘要", "资料处理", "生成文件卡片和详情中的摘要；知识库内容要求控制总结范围。", c.GenerateSummaryPrompt)
		add("conversation.questions", "推荐问题生成", "资料处理", "从文件片段生成检索问题。", c.GenerateQuestionsPrompt)
	}
	if cfg != nil && cfg.ExtractManager != nil && cfg.ExtractManager.ExtractGraph != nil {
		add("graph.extraction", "图谱实体与关系提取", "关系提取", "从资料中提取实体、属性和关系；关系类型、示例及结构输出由知识库配置提供。", strings.ReplaceAll(cfg.ExtractManager.ExtractGraph.Description, "%s", "{{relation_types}}"))
	}
	if a := types.GetBuiltinAgent(types.BuiltinSmartReasoningID, 0); a != nil {
		add("agent.smart", "智能推理系统规则", "对话", "默认智能推理的底层规则；智能体自行修改的提示词优先。", a.Config.SystemPrompt)
	}
	add("agent.rag", "知识检索推理规则", "对话", "智能推理未填写自定义提示词时的规则。", agent.GetProgressiveRAGSystemPrompt(cfg))
	add("agent.pure", "独立助手默认规则", "对话", "不关联知识库的智能推理默认规则。", agent.GetPureAgentSystemPrompt(cfg))
	for _, p := range []struct{ id, name, description, content string }{
		{"wiki_summary", "Wiki 文件总结", "为每份资料生成 Wiki 摘要页。", agent.WikiSummaryPrompt},
		{"wiki_knowledge_extract", "Wiki 知识提取", "提取实体、概念及其事实。", agent.WikiKnowledgeExtractPrompt},
		{"wiki_candidate_slug", "Wiki 候选条目", "筛选需要建立的实体和概念条目。", agent.WikiCandidateSlugPrompt},
		{"wiki_chunk_citation", "Wiki 引用匹配", "将条目与原始片段匹配。", agent.WikiChunkCitationPrompt},
		{"wiki_page_modify_system", "Wiki 页面整理规则", "新增和合并条目的稳定规则。", agent.WikiPageModifySystemPrompt},
		{"wiki_page_modify", "Wiki 页面整理输入", "向模型传递原页面、新资料及变更要求。", agent.WikiPageModifyUserPrompt},
		{"wiki_taxonomy_plan", "Wiki 目录规划", "将条目整理成目录。", agent.WikiTaxonomyPlanPrompt},
		{"wiki_deduplication", "Wiki 条目去重", "判断同名或相似条目是否应合并。", agent.WikiDeduplicationPrompt},
		{"wiki_index_intro", "Wiki 首页介绍", "生成知识库 Wiki 首页介绍。", agent.WikiIndexIntroPrompt},
		{"wiki_index_intro_update", "Wiki 首页更新", "更新首页介绍。", agent.WikiIndexIntroUpdatePrompt},
	} {
		add(p.id, p.name, "Wiki 与客户分析", p.description, p.content)
	}
	labels := map[string]string{"memory.extract": "长期记忆提取", "memory.consolidate": "长期记忆合并", "memory.topic_adjudication": "记忆主题整理", "image.ocr": "图片文字识别", "image.scanned_pdf": "扫描件文字识别", "image.caption": "图片描述", "video.understanding": "视频理解", "chat.suggestions": "追问建议", "table.description": "表格摘要", "table.columns": "字段说明"}
	defaults := service.DefaultServiceSystemPrompts()
	for id, content := range memory.DefaultSystemPrompts() {
		defaults[id] = content
	}
	ids := make([]string, 0, len(defaults))
	for id := range defaults {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		add(id, labels[id], "理解与记忆", "对应处理流程的默认规则；现有资料不会自动重写。", defaults[id])
	}
	return items
}

func (h *TenantHandler) getSystemPrompts(c *gin.Context) {
	tenant, _ := types.TenantInfoFromContext(c.Request.Context())
	if tenant == nil {
		c.Error(errors.NewBadRequestError("未选择工作区"))
		return
	}
	items := systemPromptCatalog(h.config)
	for i := range items {
		items[i].Content = types.ResolveSystemPrompt(c.Request.Context(), items[i].ID, items[i].DefaultContent)
		items[i].Customized = strings.TrimSpace(tenant.SystemPromptConfig[items[i].ID]) != ""
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items}})
}

func validateSystemPrompt(item systemPromptItem, content string) error {
	if utf8.RuneCountInString(content) > 40000 {
		return errors.NewBadRequestError("提示词不能超过 40000 字")
	}
	if content == "" {
		return nil
	}
	// Existing templates use either Go template data fields or {{lower_case}}
	// renderer variables. Validate Go syntax without interpreting renderer fields as functions.
	normalized := regexp.MustCompile(`\{\{\s*([a-z_][a-zA-Z0-9_]*)\s*\}\}`).ReplaceAllStringFunc(content, func(action string) string {
		name := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(action, "{{"), "}}"))
		switch name {
		case "end", "else", "break", "continue":
			return action
		}
		return "{{." + name + "}}"
	})
	if _, err := template.New("prompt").Parse(normalized); err != nil {
		return errors.NewBadRequestError("变量或模板语法不正确：" + err.Error())
	}
	available := map[string]bool{}
	for _, v := range item.Variables {
		available[v] = true
	}
	for _, v := range promptVariables(content) {
		if !available[v] {
			return errors.NewBadRequestError("此模板不支持变量 " + v)
		}
	}
	// Every advertised runtime input must survive editing, including conditional
	// Wiki payloads. Otherwise saving succeeds but the model receives no source.
	used := map[string]bool{}
	for _, variable := range promptVariables(content) {
		used[variable] = true
	}
	for _, variable := range item.Variables {
		if !used[variable] {
			return errors.NewBadRequestError("请保留模板变量 " + variable)
		}
	}

	return nil
}

func (h *TenantHandler) updateSystemPrompt(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256*1024)
	var request struct {
		ID      string  `json:"id"`
		Content *string `json:"content"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Content == nil {
		c.Error(errors.NewBadRequestError("请提供提示词编号和正文"))
		return
	}
	tenant, _ := types.TenantInfoFromContext(c.Request.Context())
	if tenant == nil {
		c.Error(errors.NewBadRequestError("未选择工作区"))
		return
	}
	content := strings.TrimSpace(*request.Content)
	for _, item := range systemPromptCatalog(h.config) {
		if item.ID != request.ID {
			continue
		}
		if err := validateSystemPrompt(item, content); err != nil {
			c.Error(err)
			return
		}
		if err := h.service.UpdateSystemPrompt(c.Request.Context(), tenant.ID, request.ID, content); err != nil {
			c.Error(errors.NewInternalServerError("保存系统提示词失败").WithDetails(err.Error()))
			return
		}
		fresh, err := h.service.GetTenantByID(c.Request.Context(), tenant.ID)
		if err != nil {
			c.Error(errors.NewInternalServerError("读取已保存的提示词失败"))
			return
		}
		ctx := context.WithValue(c.Request.Context(), types.TenantInfoContextKey, fresh)
		c.Request = c.Request.WithContext(ctx)
		h.getSystemPrompts(c)
		return
	}
	c.Error(errors.NewBadRequestError("未知的系统提示词编号"))
}
