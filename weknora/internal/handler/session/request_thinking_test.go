package session

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildQARequestCarriesExplicitThinkingOverride(t *testing.T) {
	disabled := false
	req := (&qaRequestContext{
		thinking:         &disabled,
		assistantMessage: &types.Message{},
	}).buildQARequest()

	require.NotNil(t, req.Thinking)
	assert.False(t, *req.Thinking)
}

func TestTitleModelIDUsesSelectedCatalogModelForPlatformAnswerMode(t *testing.T) {
	req := &qaRequestContext{
		summaryModelID: "builtin-openrouter-qwen-flash",
		customAgent: &types.CustomAgent{
			ID: types.BuiltinSmartReasoningID,
			Config: types.CustomAgentConfig{
				ModelID: "builtin-deepseek-v4-pro",
			},
		},
	}

	assert.Equal(t, "builtin-openrouter-qwen-flash", titleModelIDForRequest(req))
}

func TestTitleModelIDKeepsCustomAgentConfiguration(t *testing.T) {
	req := &qaRequestContext{
		summaryModelID: "request-override",
		customAgent: &types.CustomAgent{
			ID: "custom-agent",
			Config: types.CustomAgentConfig{
				ModelID: "custom-agent-model",
			},
		},
	}

	assert.Equal(t, "custom-agent-model", titleModelIDForRequest(req))
}
