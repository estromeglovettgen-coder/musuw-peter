package types

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestAllShippedAgentDefaultsUseFiftyIterations(t *testing.T) {
	builtinPath := filepath.Join("..", "..", "config", "builtin_agents.yaml")
	builtinData, err := os.ReadFile(builtinPath)
	require.NoError(t, err)

	var builtins builtinAgentsFile
	require.NoError(t, yaml.Unmarshal(builtinData, &builtins))
	require.NotEmpty(t, builtins.BuiltinAgents)
	for _, entry := range builtins.BuiltinAgents {
		assert.Equalf(t, 50, entry.Config.MaxIterations,
			"builtin agent %s must default to fifty iterations", entry.ID)
	}

	presetPath := filepath.Join("..", "..", "config", "agent_type_presets.yaml")
	presetData, err := os.ReadFile(presetPath)
	require.NoError(t, err)

	var presets agentTypePresetsFile
	require.NoError(t, yaml.Unmarshal(presetData, &presets))
	require.NotEmpty(t, presets.Presets)
	for _, entry := range presets.Presets {
		if entry.Config == nil {
			continue
		}
		assert.Equalf(t, 50, entry.Config.MaxIterations,
			"agent type preset %s must default to fifty iterations", entry.ID)
	}
}

func TestBuiltinQuickAnswerUsesUpstreamModeNameWithManagedModelDefaults(t *testing.T) {
	configPath := filepath.Join("..", "..", "config", "builtin_agents.yaml")
	data, err := os.ReadFile(configPath)
	require.NoError(t, err)

	var file builtinAgentsFile
	require.NoError(t, yaml.Unmarshal(data, &file))

	var quick *BuiltinAgentEntry
	for i := range file.BuiltinAgents {
		if file.BuiltinAgents[i].ID == BuiltinQuickAnswerID {
			quick = &file.BuiltinAgents[i]
			break
		}
	}
	require.NotNil(t, quick)

	for locale, expectedName := range map[string]string{
		"default": "Quick Answer",
		"zh-CN":   "快速问答",
		"zh-TW":   "快速問答",
		"ja-JP":   "クイック回答",
		"ko-KR":   "빠른 답변",
	} {
		assert.Equalf(t, expectedName, quick.I18n[locale].Name, "locale %s must expose the upstream quick-answer mode name", locale)
	}

	cfg := quick.Config
	assert.Equal(t, AgentModeQuickAnswer, cfg.AgentMode)
	assert.Equal(t, CheapestChatModelID, cfg.ModelID)
	assert.Equal(t, CheapestChatModelID, cfg.QueryUnderstandModelID)
	require.NotNil(t, cfg.Thinking)
	assert.False(t, *cfg.Thinking)

	assert.Equal(t, "default_kb", cfg.SystemPromptID)
	assert.Empty(t, cfg.SystemPrompt, "the existing prompt template must be referenced, not copied into builtin_agents.yaml")

	assert.True(t, cfg.MultiTurnEnabled)
	assert.Equal(t, 20, cfg.HistoryTurns)
	require.NotNil(t, cfg.MemoryEnabled)
	assert.True(t, *cfg.MemoryEnabled)
	assert.Equal(t, "all", cfg.KBSelectionMode)
	assert.False(t, cfg.RetrieveKBOnlyWhenMentioned)

	assert.True(t, cfg.WebSearchEnabled)
	assert.Equal(t, 5, cfg.WebSearchMaxResults)
	assert.True(t, cfg.WebFetchEnabled)
	assert.Equal(t, 2, cfg.WebFetchTopN)

	assert.True(t, cfg.EnableQueryExpansion)
	assert.Equal(t, 10, cfg.EmbeddingTopK)
	assert.InDelta(t, 0.30, cfg.KeywordThreshold, 0.0001)
	assert.InDelta(t, 0.50, cfg.VectorThreshold, 0.0001)

	assert.True(t, cfg.ImageUploadEnabled)
	assert.True(t, cfg.AudioUploadEnabled)
	assert.True(t, cfg.AttachmentImageUnderstanding)
	assert.Equal(t, "builtin-openrouter-vlm", cfg.VLMModelID)
	assert.Equal(t, "builtin-openrouter-asr", cfg.ASRModelID)
	require.NotNil(t, cfg.CitationEnabled)
	assert.True(t, *cfg.CitationEnabled)
}

func TestBuiltinSmartReasoningPromptUsesMusuwAsItsPublicIdentity(t *testing.T) {
	promptPath := filepath.Join("..", "..", "config", "prompt_templates", "agent_system_prompt.yaml")
	data, err := os.ReadFile(promptPath)
	require.NoError(t, err)

	var file struct {
		Templates []struct {
			ID   string `yaml:"id"`
			Mode string `yaml:"mode"`
			I18n map[string]struct {
				Name string `yaml:"name"`
			} `yaml:"i18n"`
			Content string `yaml:"content"`
		} `yaml:"templates"`
	}
	require.NoError(t, yaml.Unmarshal(data, &file))

	for _, template := range file.Templates {
		if template.ID != "hybrid_rag_wiki_agent" {
			continue
		}
		assert.Equal(t, "smart-reasoning", template.Mode)
		assert.Equal(t, "Wiki + RAG 混合智能体", template.I18n["zh-CN"].Name)
		assert.Contains(t, template.Content, "<role>\nYou are Musuw. For identity questions, reply exactly: “我是 Musuw。”")
		assert.NotContains(t, template.Content, "You are Musuw Hybrid Researcher")
		return
	}
	t.Fatal("hybrid_rag_wiki_agent prompt template not found")
}

func TestBuiltinSmartReasoningUsesUpstreamModeNameWithManagedModelDefaults(t *testing.T) {
	configPath := filepath.Join("..", "..", "config", "builtin_agents.yaml")
	data, err := os.ReadFile(configPath)
	require.NoError(t, err)

	var file builtinAgentsFile
	require.NoError(t, yaml.Unmarshal(data, &file))

	var smart *BuiltinAgentEntry
	for i := range file.BuiltinAgents {
		if file.BuiltinAgents[i].ID == BuiltinSmartReasoningID {
			smart = &file.BuiltinAgents[i]
			break
		}
	}
	require.NotNil(t, smart)
	for locale, expectedName := range map[string]string{
		"default": "Smart Reasoning",
		"zh-CN":   "智能推理",
		"zh-TW":   "智能推理",
		"ja-JP":   "スマート推論",
		"ko-KR":   "스마트 추론",
	} {
		assert.Equalf(t, expectedName, smart.I18n[locale].Name, "locale %s must expose the upstream smart-reasoning mode name", locale)
	}

	cfg := smart.Config
	assert.Equal(t, AgentModeSmartReasoning, cfg.AgentMode)
	assert.Equal(t, "builtin-deepseek-v4-flash", cfg.ModelID)
	assert.Equal(t, "builtin-deepseek-v4-flash", cfg.QueryUnderstandModelID)
	require.NotNil(t, cfg.Thinking)
	assert.True(t, *cfg.Thinking)
	assert.Equal(t, "hybrid_rag_wiki_agent", cfg.SystemPromptID)
	assert.Empty(t, cfg.SystemPrompt)
	require.NotNil(t, cfg.CitationEnabled)
	assert.True(t, *cfg.CitationEnabled)
	assert.True(t, cfg.WebSearchEnabled)
	assert.Equal(t, 5, cfg.WebSearchMaxResults)
	assert.True(t, cfg.WebFetchEnabled)
	assert.Equal(t, 2, cfg.WebFetchTopN)
	assert.Equal(t, "all", cfg.MCPSelectionMode)
	assert.Equal(t, "all", cfg.SkillsSelectionMode)
	assert.Equal(t, "all", cfg.KBSelectionMode)
	assert.False(t, cfg.RetrieveKBOnlyWhenMentioned)
	require.NotNil(t, cfg.MemoryEnabled)
	assert.True(t, *cfg.MemoryEnabled)
	assert.True(t, cfg.ImageUploadEnabled)
	assert.True(t, cfg.AudioUploadEnabled)
	assert.True(t, cfg.AttachmentImageUnderstanding)
	assert.Equal(t, "builtin-openrouter-vlm", cfg.VLMModelID)
	assert.Equal(t, "builtin-openrouter-asr", cfg.ASRModelID)

	for _, tool := range []string{
		"thinking", "todo_write",
		"knowledge_search", "grep_chunks", "list_knowledge_chunks",
		"query_knowledge_graph", "get_document_info", "database_query",
		"data_analysis", "data_schema",
		"wiki_search", "wiki_read_page", "wiki_read_source_doc", "wiki_read_issue",
	} {
		assert.Contains(t, smart.Config.AllowedTools, tool)
	}
	assert.NotContains(t, cfg.AllowedTools, "search_conversations")
	for _, writeTool := range []string{
		"wiki_flag_issue", "wiki_update_issue", "wiki_write_page",
		"wiki_replace_text", "wiki_rename_page", "wiki_delete_page",
	} {
		assert.Contains(t, cfg.AllowedTools, writeTool)
	}
	assert.NotContains(t, cfg.AllowedTools, "execute_skill_script", "skill scripts are enabled by skills_selection_mode, not the regular tool whitelist")
}

func TestBuiltinAgentsUseFlashAsTheirChatModelDefault(t *testing.T) {
	configPath := filepath.Join("..", "..", "config", "builtin_agents.yaml")
	data, err := os.ReadFile(configPath)
	require.NoError(t, err)

	var file builtinAgentsFile
	require.NoError(t, yaml.Unmarshal(data, &file))

	for _, entry := range file.BuiltinAgents {
		// The internal skill installer intentionally resolves its model through
		// the active catalog and therefore has no chat model field in YAML.
		if entry.Config.ModelID == "" {
			continue
		}
		assert.Equalf(t, CheapestChatModelID, entry.Config.ModelID,
			"builtin agent %s must default to V4 Flash", entry.ID)
		assert.Equalf(t, CheapestChatModelID, entry.Config.QueryUnderstandModelID,
			"builtin agent %s must use V4 Flash for query understanding", entry.ID)
	}
}

func TestSpecialistBuiltinsStayOutOfTheConsumerAgentList(t *testing.T) {
	allIDs := GetBuiltinAgentIDs()
	visibleIDs := GetUserVisibleBuiltinAgentIDs()
	assert.Contains(t, allIDs, BuiltinWikiResearcherID,
		"runtime/session compatibility must retain the specialist builtin ID")
	assert.Contains(t, allIDs, BuiltinDataAnalystID,
		"runtime/session compatibility must retain the specialist builtin ID")
	assert.NotContains(t, visibleIDs, BuiltinWikiResearcherID)
	assert.NotContains(t, visibleIDs, BuiltinDataAnalystID)
	assert.Contains(t, visibleIDs, BuiltinQuickAnswerID)
	assert.Contains(t, visibleIDs, BuiltinSmartReasoningID)
	assert.True(t, IsHiddenBuiltinAgentID(BuiltinWikiResearcherID))
	assert.True(t, IsHiddenBuiltinAgentID(BuiltinDataAnalystID))
	assert.True(t, IsHiddenBuiltinAgentID(BuiltinWikiFixerID))
	assert.True(t, IsHiddenBuiltinAgentID(BuiltinSkillInstallerID))
	assert.False(t, IsHiddenBuiltinAgentID(BuiltinQuickAnswerID))
	assert.False(t, IsHiddenBuiltinAgentID("tenant-custom-agent"))
}
