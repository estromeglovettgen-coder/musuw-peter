package agent

import (
	"context"
	"fmt"
	"testing"

	agenttools "github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

// Exercise the real loop through its limit and observe the external model and
// completion-event boundaries. The synthesis parameter contract is taken from
// Tencent/WeKnora v0.8.0 (1edcd54), rather than inferred from local defaults.
func TestIterationLimitSynthesizesWithUpstreamThinkingPolicy(t *testing.T) {
	for _, rounds := range []int{10, 50} {
		t.Run(fmt.Sprintf("%d_rounds", rounds), func(t *testing.T) {
			model := &mockChat{}
			for round := 0; round < rounds; round++ {
				model.responses = append(model.responses, mockResponse{chunks: []types.StreamResponse{{
					ResponseType: types.ResponseTypeAnswer,
					ToolCalls: []types.LLMToolCall{{
						ID: fmt.Sprintf("call-%d", round), Type: "function",
						Function: types.FunctionCall{Name: "test_lookup", Arguments: `{}`},
					}},
					Done: true, FinishReason: "tool_calls",
				}}})
			}
			model.responses = append(model.responses, mockResponse{chunks: []types.StreamResponse{
				{ResponseType: types.ResponseTypeAnswer, Content: "根据检索资料整理的完整答案。"},
				{
					ResponseType: types.ResponseTypeAnswer, Done: true, FinishReason: "stop",
					Usage: &types.TokenUsage{PromptTokens: 100, CompletionTokens: 20, TotalTokens: 120},
				},
			}})
			thinking := true
			engine := newTestEngine(t, model, withMaxIterations(rounds), func(cfg *types.AgentConfig) {
				cfg.Thinking = &thinking
				cfg.ReasoningEffort = "max"
			})
			tool := newCountingTool("test_lookup")
			engine.toolRegistry = agenttools.NewToolRegistry()
			engine.toolRegistry.RegisterTool(tool)
			var completed []event.AgentCompleteData
			engine.eventBus.On(event.EventAgentComplete, func(_ context.Context, evt event.Event) error {
				completed = append(completed, evt.Data.(event.AgentCompleteData))
				return nil
			})

			state, err := engine.executeLoop(context.Background(), &types.AgentState{}, "请整理资料",
				emptyMessages(), emptyTools(), "session", "message")
			require.NoError(t, err)
			require.Equal(t, rounds, tool.calls)
			require.Len(t, model.opts, rounds+1, "reaching the limit must trigger synthesis")
			for _, opts := range model.opts[:rounds] {
				require.NotNil(t, opts.Thinking)
				require.True(t, *opts.Thinking, "research rounds retain the user's setting")
				require.Equal(t, "max", opts.ReasoningEffort)
			}
			finalOptions := model.opts[rounds]
			require.Nil(t, finalOptions.Thinking, "v0.8.0 synthesis leaves thinking unspecified")
			require.Empty(t, finalOptions.ReasoningEffort, "synthesis must not inherit max effort")
			require.Empty(t, finalOptions.Tools, "synthesis produces an answer without more tools")
			require.Equal(t, "根据检索资料整理的完整答案。", state.FinalAnswer)
			require.True(t, state.IsComplete)
			require.Len(t, completed, 1)
			require.Equal(t, state.FinalAnswer, completed[0].FinalAnswer)
			require.NotNil(t, completed[0].Usage)
			usage, ok := completed[0].Usage.(*types.TokenUsage)
			require.True(t, ok)
			require.Equal(t, 120, usage.TotalTokens)
		})
	}
}

func TestFinalSynthesisRespectsUpstreamContextBudget(t *testing.T) {
	for _, tc := range []struct {
		name      string
		remaining int
		want      int
	}{
		{name: "ample_space", remaining: 10000, want: 4096},
		{name: "limited_space", remaining: 128, want: 128},
		{name: "exhausted_space", remaining: -100, want: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := mockResponse{chunks: []types.StreamResponse{{
				ResponseType: types.ResponseTypeAnswer, Content: "final answer", Done: true,
			}}}
			model := &mockChat{responses: []mockResponse{response, response}}
			engine := newTestEngine(t, model)
			require.NoError(t, engine.streamFinalAnswerToEventBus(
				context.Background(), "query", &types.AgentState{}, "session"))
			require.Equal(t, 4096, model.opts[0].MaxCompletionTokens, "unconfigured window keeps the existing budget")
			// Reserve the upstream 4096-token safety margin around the actual
			// synthesis prompt; the remaining output allowance is the fixture.
			promptTokens := engine.tokenEstimator.EstimateMessages(model.calls[0])
			engine.config.MaxContextTokens = promptTokens + 4096 + tc.remaining
			require.NoError(t, engine.streamFinalAnswerToEventBus(
				context.Background(), "query", &types.AgentState{}, "session"))
			require.Equal(t, tc.want, model.opts[1].MaxTokens)
			require.Equal(t, tc.want, model.opts[1].MaxCompletionTokens)
		})
	}
}
