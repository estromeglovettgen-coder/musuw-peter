package types

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSystemPromptsRespectWorkspaceAndExplicitAgentRules(t *testing.T) {
	entries := map[string]*BuiltinAgentEntry{}
	registry := BuiltinAgentRegistry
	BuiltinAgentRegistry = map[string]func(uint64) *CustomAgent{}
	for _, id := range []string{BuiltinQuickAnswerID, BuiltinSmartReasoningID} {
		entries[id] = &BuiltinAgentEntry{ID: id, IsBuiltin: true, Config: CustomAgentConfig{SystemPrompt: "原默认规则"}}
		agentID := id
		BuiltinAgentRegistry[id] = func(tenantID uint64) *CustomAgent { return buildAgentFromEntry(agentID, tenantID, "") }
	}
	restore := OverrideBuiltinAgentEntriesForTest(entries)
	t.Cleanup(func() { restore(); BuiltinAgentRegistry = registry })
	tenant := &Tenant{ID: 7, SystemPromptConfig: SystemPromptConfig{"conversation.system": "仅按工作区资料回答", "agent.smart": "采用工作区推理规则"}}
	ctx := context.WithValue(context.Background(), TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, TenantInfoContextKey, tenant)
	require.Equal(t, "仅按工作区资料回答", ResolveSystemPrompt(ctx, "conversation.system", "默认"))
	other := context.WithValue(ctx, TenantIDContextKey, uint64(8))
	require.Equal(t, "默认", ResolveSystemPrompt(other, "conversation.system", "默认"))
	require.Equal(t, "默认", ResolveSystemPrompt(context.Background(), "conversation.system", "默认"))
	for _, id := range []string{BuiltinQuickAnswerID, BuiltinSmartReasoningID} {
		a := GetBuiltinAgentWithContext(ctx, id, 7)
		require.NotNil(t, a)
		require.Contains(t, a.Config.SystemPrompt, "工作区")
		a.Config.SystemPrompt = "Peter 自己编写的智能体规则"
		ApplyBuiltinAgentSystemPrompts(ctx, a)
		require.Equal(t, "Peter 自己编写的智能体规则", a.Config.SystemPrompt)
	}
}

func TestSystemPromptConfigRoundTrip(t *testing.T) {
	config := SystemPromptConfig{"wiki_summary": "只整理姓名"}
	encoded, err := config.Value()
	require.NoError(t, err)
	var decoded SystemPromptConfig
	require.NoError(t, decoded.Scan(encoded))
	require.Equal(t, config, decoded)
	require.NoError(t, decoded.Scan(nil))
	require.Empty(t, decoded)
}
