package chat

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// Custom agents and background consumers still pass legacy Thinking=false.
// Exercise the saved-model factory and the final request, not just a strategy
// constructed by the test: the model capability must survive both boundaries.
func TestSavedOpenRouterModelPreservesMandatoryReasoning(t *testing.T) {
	cases := []struct {
		name      string
		mandatory bool
		opts      *ChatOptions
		want      string
	}{
		{"mandatory legacy off uses configured minimum", true, &ChatOptions{Thinking: ptrBool(false)}, "low"},
		{"mandatory explicit none uses configured minimum", true, &ChatOptions{ReasoningEffort: "none"}, "low"},
		{"mandatory normalized none uses configured minimum", true, &ChatOptions{ReasoningEffort: " NONE "}, "low"},
		{"mandatory absent options uses configured minimum", true, nil, "low"},
		{"mandatory empty options uses configured minimum", true, &ChatOptions{}, "low"},
		{
			"explicit effort wins over legacy off", true,
			&ChatOptions{Thinking: ptrBool(false), ReasoningEffort: "low"}, "low",
		},
		{"mandatory legacy on remains enabled", true, &ChatOptions{Thinking: ptrBool(true)}, "low"},
		{"optional default is the configured minimum", false, &ChatOptions{}, "low"},
		{"optional enabled is the configured minimum", false, &ChatOptions{Thinking: ptrBool(true)}, "low"},
		{"optional legacy off remains disabled", false, &ChatOptions{Thinking: ptrBool(false)}, "none"},
		{"optional explicit none remains disabled", false, &ChatOptions{ReasoningEffort: "none"}, "none"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			model := &types.Model{
				ID: "saved-reasoning-model", Name: "openai/gpt-6-astra", Source: types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					Reasoning: types.ReasoningParameters{
						Supported: true, Mandatory: tc.mandatory, DefaultEffort: "low",
					},
				},
			}
			client, err := NewRemoteAPIChat(ConfigFromModel(model, "", ""))
			require.NoError(t, err)
			var original ChatOptions
			if tc.opts != nil {
				original = *tc.opts
			}
			for _, stream := range []bool{false, true} {
				body, _, _, err := client.buildOutbound([]Message{{Role: "user", Content: "reply OK"}}, tc.opts, stream)
				require.NoError(t, err)
				request, ok := body.(map[string]any)
				require.True(t, ok)
				if tc.want == "" {
					assert.NotContains(t, request, "reasoning", "use the mandatory model's own default")
				} else {
					assert.Equal(t, map[string]any{"effort": tc.want}, request["reasoning"])
				}
				if tc.opts != nil {
					assert.Equal(t, original, *tc.opts, "shared caller options must not be mutated")
				}
			}
		})
	}
}

// A stable saved model ID can point to a newer provider generation after a
// catalog refresh. Old session/agent efforts must obey the new capability list
// at the HTTP boundary, including clients that have not refreshed their UI.
func TestSavedOpenRouterModelNormalizesRetiredReasoningEfforts(t *testing.T) {
	for _, tc := range []struct {
		name      string
		effort    string
		supported []string
		want      string
	}{
		{"retired Nano minimal becomes low", "minimal", []string{"xhigh", "high", "medium", "low", "none"}, "low"},
		{"new Nano xhigh is preserved", "xhigh", []string{"xhigh", "high", "medium", "low", "none"}, "xhigh"},
		{"explicit off remains off", "none", []string{"xhigh", "high", "medium", "low", "none"}, "none"},
		{"manual model without capabilities retains its requested effort", "minimal", nil, "minimal"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			model := &types.Model{
				ID: "builtin-openrouter-gpt-5-nano", Name: "openai/gpt-5.4-nano", Source: types.ModelSourceRemote,
				Parameters: types.ModelParameters{Provider: "openrouter", Reasoning: types.ReasoningParameters{
					Supported: true, SupportedEfforts: tc.supported, DefaultEffort: "low",
				}},
			}
			client, err := NewRemoteAPIChat(ConfigFromModel(model, "", ""))
			require.NoError(t, err)
			opts := &ChatOptions{ReasoningEffort: tc.effort}
			for _, stream := range []bool{false, true} {
				body, _, _, err := client.buildOutbound([]Message{{Role: "user", Content: "reply OK"}}, opts, stream)
				require.NoError(t, err)
				request, ok := body.(map[string]any)
				require.True(t, ok)
				assert.Equal(t, "openai/gpt-5.4-nano", request["model"])
				assert.Equal(t, map[string]any{"effort": tc.want}, request["reasoning"])
				assert.Equal(t, tc.effort, opts.ReasoningEffort, "do not mutate saved caller options")
			}
		})
	}
}

// Read the shipped catalog through the same saved-model factory used by the
// service. This proves the retained ID resolves to the new wire model and
// DeepSeek's newly supported image content survives request shaping.
func TestRefreshedCatalogBuildsCompatibleChatRequests(t *testing.T) {
	raw, err := os.ReadFile("../../../config/builtin_models.yaml")
	require.NoError(t, err)
	var catalog struct {
		Models []types.BuiltinModelEntry `yaml:"builtin_models"`
	}
	require.NoError(t, yaml.Unmarshal(raw, &catalog))
	expected := map[string]string{
		"builtin-deepseek-v4-flash":         "deepseek/deepseek-v4.1-flash",
		"builtin-openrouter-gpt-5-nano":     "openai/gpt-5.4-nano",
		"builtin-openrouter-qwen-3-7-flash": "qwen/qwen3.8-flash",
	}
	seen := 0
	for _, entry := range catalog.Models {
		slug, selected := expected[entry.ID]
		if !selected {
			continue
		}
		seen++
		t.Run(entry.ID, func(t *testing.T) {
			saved := &types.Model{ID: entry.ID, Name: entry.Name, Source: entry.Source, Parameters: entry.Parameters}
			client, err := NewRemoteAPIChat(ConfigFromModel(saved, "", ""))
			require.NoError(t, err)
			for _, stream := range []bool{false, true} {
				body, _, _, err := client.buildOutbound([]Message{{
					Role: "user", Content: "What color?", Images: []string{"data:image/png;base64,aW1hZ2U="},
				}}, &ChatOptions{ReasoningEffort: "minimal"}, stream)
				require.NoError(t, err)
				encoded, err := json.Marshal(body)
				require.NoError(t, err)
				var request map[string]any
				require.NoError(t, json.Unmarshal(encoded, &request))
				assert.Equal(t, slug, request["model"])
				assert.Equal(t, map[string]any{"effort": "low"}, request["reasoning"])
				messages := request["messages"].([]any)
				content := messages[0].(map[string]any)["content"].([]any)
				assert.Equal(t, "image_url", content[0].(map[string]any)["type"])
				assert.Equal(t,
					map[string]any{"url": "data:image/png;base64,aW1hZ2U=", "detail": "auto"},
					content[0].(map[string]any)["image_url"],
				)
			}
		})
	}
	require.Equal(t, len(expected), seen)
}
