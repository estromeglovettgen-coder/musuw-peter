package chatpipeline

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

// syncEventBus is a thread-safe recorder; the stream plugin emits from a
// background goroutine so the test must guard concurrent appends.
type syncEventBus struct {
	mu     sync.Mutex
	events []types.Event
}

func (b *syncEventBus) On(types.EventType, types.EventHandler) {}

func (b *syncEventBus) Emit(_ context.Context, evt types.Event) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events = append(b.events, evt)
	return nil
}

func (b *syncEventBus) finalAnswerContents() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []string
	for _, evt := range b.events {
		if evt.Type != types.EventType(event.EventAgentFinalAnswer) {
			continue
		}
		if data, ok := evt.Data.(event.AgentFinalAnswerData); ok {
			out = append(out, data.Content)
		}
	}
	return out
}

func (b *syncEventBus) finalAnswerEvents() []event.AgentFinalAnswerData {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []event.AgentFinalAnswerData
	for _, evt := range b.events {
		if evt.Type != types.EventType(event.EventAgentFinalAnswer) {
			continue
		}
		if data, ok := evt.Data.(event.AgentFinalAnswerData); ok {
			out = append(out, data)
		}
	}
	return out
}

func (b *syncEventBus) errorEvents() []event.ErrorData {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []event.ErrorData
	for _, evt := range b.events {
		if evt.Type != types.EventType(event.EventError) {
			continue
		}
		if data, ok := evt.Data.(event.ErrorData); ok {
			out = append(out, data)
		}
	}
	return out
}

// openStreamChat returns a buffered channel preloaded with chunks and never
// closes it, so the stream plugin blocks on the channel until ctx is cancelled
// — deterministically exercising the ctx.Done() branch.
type openStreamChat struct {
	chunks      []types.StreamResponse
	closeStream bool
	streamErr   error
}

func (m *openStreamChat) Chat(context.Context, []chat.Message, *chat.ChatOptions) (*types.ChatResponse, error) {
	return nil, nil
}

func (m *openStreamChat) ChatStream(
	context.Context, []chat.Message, *chat.ChatOptions,
) (<-chan types.StreamResponse, error) {
	if m.streamErr != nil {
		return nil, m.streamErr
	}
	ch := make(chan types.StreamResponse, len(m.chunks))
	for _, c := range m.chunks {
		ch <- c
	}
	if m.closeStream {
		close(ch)
	}
	return ch, nil
}

func (m *openStreamChat) GetModelName() string { return "mock" }
func (m *openStreamChat) GetModelID() string   { return "mock" }

// stubModelService only needs GetChatModel; the rest is unused for this test.
type stubModelService struct {
	interfaces.ModelService
	model chat.Chat
}

func (s *stubModelService) GetChatModel(context.Context, string) (chat.Chat, error) {
	return s.model, nil
}

// TestStreamDropsIncompleteHandleOnCancel verifies that cancellation cannot
// leak a model-context protocol fragment to the client.
func TestStreamDropsIncompleteHandleOnCancel(t *testing.T) {
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"
	bus := &syncEventBus{}
	model := &openStreamChat{chunks: []types.StreamResponse{
		// Ends with a partial alias prefix ("res://0"), so the stream decoder
		// holds it back waiting for the rest that never arrives before cancel.
		{ResponseType: types.ResponseTypeAnswer, Content: "hello res://0"},
	}}

	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-cancel"
	chatManage.UserContent = ref // seeds the registry so res://0001 becomes a known alias
	chatManage.EventBus = bus

	ctx, cancel := context.WithCancel(context.Background())
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}
	require.Nil(t, plugin.OnEvent(ctx, types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil }))

	// Wait until the pre-hold content has been emitted, then cancel.
	require.Eventually(t, func() bool {
		for _, c := range bus.finalAnswerContents() {
			if c == "hello " {
				return true
			}
		}
		return false
	}, 2*time.Second, 5*time.Millisecond)

	cancel()

	// Give the cancellation path time to flush, then assert that only the
	// meaningful prefix was emitted; the incomplete private handle is dropped.
	require.Eventually(t, func() bool { return len(bus.finalAnswerContents()) >= 1 }, 2*time.Second, 5*time.Millisecond)
	time.Sleep(20 * time.Millisecond)
	require.Equal(t, []string{"hello "}, bus.finalAnswerContents())
}

func TestStreamIgnoresDuplicateTerminalAnswer(t *testing.T) {
	bus := &syncEventBus{}
	model := &openStreamChat{closeStream: true, chunks: []types.StreamResponse{
		{ResponseType: types.ResponseTypeAnswer, Content: "hello"},
		{ResponseType: types.ResponseTypeAnswer, Done: true},
		// Some providers repeat the same terminal response when their EOF
		// sentinel is received after finish_reason.
		{ResponseType: types.ResponseTypeAnswer, Done: true},
	}}

	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-duplicate-done"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}
	require.Nil(t, plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil }))

	require.Eventually(t, func() bool {
		bus.mu.Lock()
		defer bus.mu.Unlock()
		return len(bus.events) == 2
	}, 2*time.Second, 5*time.Millisecond)

	bus.mu.Lock()
	defer bus.mu.Unlock()
	var answerEvents []event.AgentFinalAnswerData
	for _, evt := range bus.events {
		if evt.Type == types.EventType(event.EventAgentFinalAnswer) {
			answerEvents = append(answerEvents, evt.Data.(event.AgentFinalAnswerData))
		}
	}
	require.Equal(t, []event.AgentFinalAnswerData{{Content: "hello"}, {Done: true}}, answerEvents)
}

func TestStreamForwardsTerminalUsageToFinalAnswer(t *testing.T) {
	bus := &syncEventBus{}
	usage := &types.TokenUsage{PromptTokens: 12, CompletionTokens: 3, TotalTokens: 15}
	model := &openStreamChat{closeStream: true, chunks: []types.StreamResponse{
		{ResponseType: types.ResponseTypeAnswer, Content: "hello"},
		{ResponseType: types.ResponseTypeAnswer, Done: true},
		{ResponseType: types.ResponseTypeAnswer, Done: true, Usage: usage},
	}}

	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-usage"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}
	require.Nil(t, plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil }))

	require.Eventually(t, func() bool { return len(bus.finalAnswerEvents()) == 2 }, 2*time.Second, 5*time.Millisecond)
	answerEvents := bus.finalAnswerEvents()
	got, ok := answerEvents[1].Usage.(*types.TokenUsage)
	require.True(t, ok, "terminal answer must carry typed token usage")
	require.Equal(t, usage, got)
}

func TestStreamCreditExhaustionPreservesPartialAnswerAndTerminates(t *testing.T) {
	bus := &syncEventBus{}
	model := &openStreamChat{closeStream: true, chunks: []types.StreamResponse{
		{ResponseType: types.ResponseTypeAnswer, Content: "partial answer"},
		{ResponseType: types.ResponseTypeError, Content: `{"error":{"code":402,"message":"Insufficient credits"}}`},
		{ResponseType: types.ResponseTypeAnswer, Content: " must not be emitted", Done: true},
	}}

	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-credit-exhausted"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}
	require.Nil(t, plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil }))

	require.Eventually(t, func() bool { return len(bus.errorEvents()) == 1 }, 2*time.Second, 5*time.Millisecond)
	answerEvents := bus.finalAnswerEvents()
	require.NotEmpty(t, answerEvents)
	var answer strings.Builder
	doneCount := 0
	for _, answerEvent := range answerEvents {
		answer.WriteString(answerEvent.Content)
		if answerEvent.Done {
			doneCount++
		}
	}
	require.Equal(t, "partial answer", answer.String())
	require.Equal(t, 1, doneCount)
	require.True(t, answerEvents[len(answerEvents)-1].Done)
	require.Equal(t, []event.ErrorData{{
		Error:     "Monthly AI Credits exhausted",
		ErrorCode: openrouter.CreditExhaustedCode,
		Stage:     "chat_completion_stream",
		SessionID: "sess-credit-exhausted",
	}}, bus.errorEvents())
}

func TestStreamInitialCreditExhaustionUsesDedicatedPipelineError(t *testing.T) {
	bus := &syncEventBus{}
	model := &openStreamChat{streamErr: &openrouter.CreditExhaustedError{StatusCode: 402}}
	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-credit-exhausted-initial"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}

	err := plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil })
	require.NotNil(t, err)
	require.Equal(t, openrouter.CreditExhaustedCode, err.ErrorType)
	require.True(t, openrouter.IsCreditExhausted(err.Err))
}

func TestStreamInitialAllowanceRenewalPendingUsesDedicatedPipelineError(t *testing.T) {
	bus := &syncEventBus{}
	model := &openStreamChat{streamErr: fmt.Errorf("chat transport: %w", openrouter.ErrAllowanceRenewalPending)}
	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-renewal-pending-initial"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}

	err := plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil })
	require.NotNil(t, err)
	require.Equal(t, openrouter.AllowanceRenewalPendingCode, err.ErrorType)
	require.True(t, openrouter.IsAllowanceRenewalPending(err.Err))
}

func TestStreamStructuredAllowanceRenewalPendingPreservesErrorCode(t *testing.T) {
	bus := &syncEventBus{}
	model := &openStreamChat{closeStream: true, chunks: []types.StreamResponse{
		{ResponseType: types.ResponseTypeError, Content: "billing boundary", ErrorCode: openrouter.AllowanceRenewalPendingCode},
	}}
	chatManage := &types.ChatManage{}
	chatManage.SessionID = "sess-renewal-pending-in-channel"
	chatManage.EventBus = bus
	plugin := &PluginChatCompletionStream{modelService: &stubModelService{model: model}}
	require.Nil(t, plugin.OnEvent(context.Background(), types.CHAT_COMPLETION_STREAM, chatManage, func() *PluginError { return nil }))

	require.Eventually(t, func() bool { return len(bus.errorEvents()) == 1 }, 2*time.Second, 5*time.Millisecond)
	require.Equal(t, []event.ErrorData{{
		Error:     "billing boundary",
		ErrorCode: openrouter.AllowanceRenewalPendingCode,
		Stage:     "chat_completion_stream",
		SessionID: "sess-renewal-pending-in-channel",
	}}, bus.errorEvents())
}
