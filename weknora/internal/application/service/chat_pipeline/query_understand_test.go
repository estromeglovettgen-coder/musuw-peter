package chatpipeline

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestQueryUnderstandChatOptions_ReasoningCapability(t *testing.T) {
	tests := []struct {
		name            string
		reasoning       types.ReasoningParameters
		wantEffort      string
		wantThinkingNil bool
	}{
		{
			name: "mandatory uses configured default effort",
			reasoning: types.ReasoningParameters{
				Supported:        true,
				Mandatory:        true,
				SupportedEfforts: []string{"xhigh", "high", "low"},
				DefaultEffort:    "high",
			},
			wantEffort:      "high",
			wantThinkingNil: true,
		},
		{
			name: "mandatory falls back to first supported effort",
			reasoning: types.ReasoningParameters{
				Supported:        true,
				Mandatory:        true,
				SupportedEfforts: []string{"medium", "low"},
			},
			wantEffort:      "medium",
			wantThinkingNil: true,
		},
		{
			name: "mandatory without an effort omits thinking override",
			reasoning: types.ReasoningParameters{
				Supported: true,
				Mandatory: true,
			},
			wantEffort:      "",
			wantThinkingNil: true,
		},
		{
			name: "non mandatory keeps explicit thinking disabled",
			reasoning: types.ReasoningParameters{
				Supported:        true,
				Mandatory:        false,
				SupportedEfforts: []string{"high", "none"},
				DefaultEffort:    "high",
			},
			wantEffort:      "",
			wantThinkingNil: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			model := &types.Model{Parameters: types.ModelParameters{Reasoning: tt.reasoning}}
			got := queryUnderstandChatOptions(150, model)
			if got.MaxCompletionTokens != 150 {
				t.Fatalf("MaxCompletionTokens = %d, want 150", got.MaxCompletionTokens)
			}
			if got.ReasoningEffort != tt.wantEffort {
				t.Errorf("ReasoningEffort = %q, want %q", got.ReasoningEffort, tt.wantEffort)
			}
			if (got.Thinking == nil) != tt.wantThinkingNil {
				t.Errorf("Thinking nil = %v, want %v", got.Thinking == nil, tt.wantThinkingNil)
			}
			if got.Thinking != nil && *got.Thinking {
				t.Error("non-mandatory query understanding must keep Thinking=false")
			}
		})
	}
}

func TestQueryUnderstandChatOptions_MandatoryDefaultMustBeSupported(t *testing.T) {
	model := &types.Model{Parameters: types.ModelParameters{Reasoning: types.ReasoningParameters{
		Supported:        true,
		Mandatory:        true,
		SupportedEfforts: []string{"medium", "low"},
		DefaultEffort:    "none",
	}}}

	got := queryUnderstandChatOptions(150, model)
	if got.ReasoningEffort != "medium" {
		t.Fatalf("ReasoningEffort = %q, want first supported effort medium", got.ReasoningEffort)
	}
	if got.Thinking != nil {
		t.Fatal("mandatory model must not send an explicit Thinking override")
	}
}

func TestQueryUnderstandChatOptions_NilModelOmitsThinkingOverride(t *testing.T) {
	got := queryUnderstandChatOptions(150, nil)
	if got.Thinking != nil {
		t.Fatalf("nil model Thinking = %#v, want nil", got.Thinking)
	}
	if got.ReasoningEffort != "" {
		t.Fatalf("nil model ReasoningEffort = %q, want empty", got.ReasoningEffort)
	}
}

func TestApplyIntentPromptOverride_AgentOverrideWins(t *testing.T) {
	cm := &types.ChatManage{
		PipelineRequest: types.PipelineRequest{
			IntentPromptOverrides: map[string]string{"chitchat": "agent prompt"},
		},
		PipelineState: types.PipelineState{Intent: types.IntentChitchat},
	}
	global := map[string]string{"chitchat": "global prompt"}

	if !applyIntentPromptOverride(cm, global) {
		t.Fatal("expected applied=true")
	}
	if cm.SystemPromptOverride != "agent prompt" {
		t.Errorf("override: got %q, want %q", cm.SystemPromptOverride, "agent prompt")
	}
}

func TestApplyIntentPromptOverride_PreservesAgentWhitespace(t *testing.T) {
	// Agent-supplied prompts with surrounding whitespace must reach the model
	// verbatim; trim is only used for emptiness detection.
	raw := "  agent prompt with trailing newline\n"
	cm := &types.ChatManage{
		PipelineRequest: types.PipelineRequest{
			IntentPromptOverrides: map[string]string{"chitchat": raw},
		},
		PipelineState: types.PipelineState{Intent: types.IntentChitchat},
	}

	if !applyIntentPromptOverride(cm, nil) {
		t.Fatal("expected applied=true")
	}
	if cm.SystemPromptOverride != raw {
		t.Errorf("override: got %q, want %q", cm.SystemPromptOverride, raw)
	}
}

func TestApplyIntentPromptOverride_BlankAgentFallsBackToGlobal(t *testing.T) {
	cm := &types.ChatManage{
		PipelineRequest: types.PipelineRequest{
			IntentPromptOverrides: map[string]string{"chitchat": "   \n\t  "},
		},
		PipelineState: types.PipelineState{Intent: types.IntentChitchat},
	}
	global := map[string]string{"chitchat": "global prompt"}

	if !applyIntentPromptOverride(cm, global) {
		t.Fatal("expected applied=true")
	}
	if cm.SystemPromptOverride != "global prompt" {
		t.Errorf("override: got %q, want %q", cm.SystemPromptOverride, "global prompt")
	}
}

func TestApplyIntentPromptOverride_NoOverrideAndNoGlobal(t *testing.T) {
	cm := &types.ChatManage{
		PipelineState: types.PipelineState{Intent: types.IntentChitchat},
	}

	if applyIntentPromptOverride(cm, nil) {
		t.Fatal("expected applied=false")
	}
	if cm.SystemPromptOverride != "" {
		t.Errorf("override should remain empty, got %q", cm.SystemPromptOverride)
	}
}

func TestApplyIntentPromptOverride_GlobalOnly(t *testing.T) {
	cm := &types.ChatManage{
		PipelineState: types.PipelineState{Intent: types.IntentGreeting},
	}
	global := map[string]string{"greeting": "hi there"}

	if !applyIntentPromptOverride(cm, global) {
		t.Fatal("expected applied=true")
	}
	if cm.SystemPromptOverride != "hi there" {
		t.Errorf("override: got %q, want %q", cm.SystemPromptOverride, "hi there")
	}
}

// TestParseOutput_UnparsableFallsBackToOriginalQuery pins the degradation
// contract for query understanding: when the LLM returns output that cannot be
// parsed as the structured {"rewrite_query","intent",...} JSON, RewriteQuery
// must remain the original user query (which OnEvent sets before calling
// parseOutput) instead of leaking the raw model text into the downstream
// retrieval query.
func TestParseOutput_UnparsableFallsBackToOriginalQuery(t *testing.T) {
	p := &PluginQueryUnderstand{}
	cm := &types.ChatManage{
		PipelineState: types.PipelineState{
			RewriteQuery: "original user query",
			Intent:       types.IntentKBSearch,
		},
	}

	p.parseOutput(cm, "The answer is: check the admin console")

	if cm.RewriteQuery != "original user query" {
		t.Fatalf("RewriteQuery = %q, want original user query", cm.RewriteQuery)
	}
	if cm.Intent != types.IntentKBSearch {
		t.Errorf("Intent = %q, want kb_search", cm.Intent)
	}
}

// TestParseOutput_UnparsableBlankDoesNotRewrite verifies that empty LLM output
// also leaves the original query untouched.
func TestParseOutput_UnparsableBlankDoesNotRewrite(t *testing.T) {
	p := &PluginQueryUnderstand{}
	cm := &types.ChatManage{
		PipelineState: types.PipelineState{
			RewriteQuery: "original user query",
			Intent:       types.IntentKBSearch,
		},
	}

	p.parseOutput(cm, "   \n\t  ")

	if cm.RewriteQuery != "original user query" {
		t.Fatalf("RewriteQuery = %q, want original user query", cm.RewriteQuery)
	}
}

// TestParseOutput_ValidJSONStillAppliesRewrite guards the happy path: a
// well-formed structured output still overrides RewriteQuery and Intent.
func TestParseOutput_ValidJSONStillAppliesRewrite(t *testing.T) {
	p := &PluginQueryUnderstand{}
	cm := &types.ChatManage{
		PipelineState: types.PipelineState{
			RewriteQuery: "original user query",
			Intent:       types.IntentKBSearch,
		},
	}

	p.parseOutput(cm, `{"rewrite_query":"rewritten query","intent":"summarize"}`)

	if cm.RewriteQuery != "rewritten query" {
		t.Fatalf("RewriteQuery = %q, want rewritten query", cm.RewriteQuery)
	}
	if cm.Intent != types.IntentSummarize {
		t.Errorf("Intent = %q, want summarize", cm.Intent)
	}
}
