package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type generatedTitleChatModel struct {
	response     string
	err          error
	beforeReturn func()
	options      *chat.ChatOptions
	callPurpose  string
}

func (m *generatedTitleChatModel) Chat(
	ctx context.Context,
	_ []chat.Message,
	options *chat.ChatOptions,
) (*types.ChatResponse, error) {
	m.options = options
	m.callPurpose, _ = types.LLMCallMetadataFromContext(ctx)
	if m.beforeReturn != nil {
		m.beforeReturn()
	}
	return &types.ChatResponse{Content: m.response}, m.err
}

func (*generatedTitleChatModel) ChatStream(
	context.Context,
	[]chat.Message,
	*chat.ChatOptions,
) (<-chan types.StreamResponse, error) {
	return nil, nil
}

func (*generatedTitleChatModel) GetModelName() string { return "generated-title-test" }
func (*generatedTitleChatModel) GetModelID() string   { return "generated-title-test" }

type generatedTitleModelService struct {
	interfaces.ModelService
	model         chat.Chat
	modelInfo     *types.Model
	getChatErr    error
	listModelsErr error
}

func (s *generatedTitleModelService) GetChatModel(context.Context, string) (chat.Chat, error) {
	return s.model, s.getChatErr
}

func (s *generatedTitleModelService) GetModelByID(context.Context, string) (*types.Model, error) {
	return s.modelInfo, nil
}

func (s *generatedTitleModelService) ListModels(context.Context) ([]*types.Model, error) {
	return nil, s.listModelsErr
}

type generatedTitleSessionRepository struct {
	interfaces.SessionRepository
	updated      *types.Session
	currentTitle string
}

func (r *generatedTitleSessionRepository) Update(
	_ context.Context,
	session *types.Session,
	_ string,
) (int64, error) {
	copy := *session
	r.updated = &copy
	r.currentTitle = session.Title
	return 1, nil
}

func (r *generatedTitleSessionRepository) UpdateTitleIfEmpty(
	_ context.Context,
	_ uint64,
	_ string,
	_ string,
	title string,
) (int64, error) {
	if r.currentTitle != "" {
		return 0, nil
	}
	r.currentTitle = title
	r.updated = &types.Session{Title: title}
	return 1, nil
}

func (r *generatedTitleSessionRepository) Get(
	_ context.Context,
	_ uint64,
	_ string,
	_ string,
) (*types.Session, error) {
	return &types.Session{Title: r.currentTitle}, nil
}

func TestGenerateTitleFallsBackWhenModelAnswersWithCitation(t *testing.T) {
	t.Parallel()

	const query = "只根据选中的知识库回答：1）校准短语是什么？2）Q0104 对应的疾病、基因和检测方法是什么？答案必须分别附上可打开的来源引用。"
	repo := &generatedTitleSessionRepository{}
	svc := &sessionService{
		cfg: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSessionTitlePrompt: "Return only a short title.",
		}},
		sessionRepo: repo,
		modelService: &generatedTitleModelService{model: &generatedTitleChatModel{response: strings.Join([]string{
			"1）**校准短语**是指在特定上下文中用于调整模型输出的一组标准表达。",
			"来源引用：[知识库文档A，第3页](https://example.com)",
		}, "\n")}},
	}
	session := &types.Session{ID: "session-1", UserID: "user-1"}

	title, err := svc.GenerateTitle(context.Background(), session, []types.Message{{
		Role:    "user",
		Content: query,
	}}, "model-1")
	if err != nil {
		t.Fatalf("GenerateTitle() error = %v", err)
	}

	const want = "只根据选中的知识库回答：1）校准短语是什么"
	if title != want {
		t.Fatalf("GenerateTitle() = %q, want safe query fallback %q", title, want)
	}
	if repo.updated == nil || repo.updated.Title != want {
		t.Fatalf("persisted title = %#v, want %q", repo.updated, want)
	}
}

func TestGenerateTitleDoesNotOverwriteManualRenameThatWinsDuringModelCall(t *testing.T) {
	t.Parallel()

	const manualTitle = "Manual title wins"
	repo := &generatedTitleSessionRepository{}
	svc := &sessionService{
		cfg: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSessionTitlePrompt: "Return only a short title.",
		}},
		sessionRepo: repo,
		modelService: &generatedTitleModelService{model: &generatedTitleChatModel{
			response: "Late generated title",
			beforeReturn: func() {
				// Deterministically model the manual rename that completes while the
				// title model request is still in flight.
				repo.currentTitle = manualTitle
			},
		}},
	}
	session := &types.Session{ID: "session-race", TenantID: 7, UserID: "user-1"}

	title, err := svc.GenerateTitle(context.Background(), session, []types.Message{{
		Role:    "user",
		Content: "Give this chat an automatic title",
	}}, "model-1")
	if err != nil {
		t.Fatalf("GenerateTitle() error = %v", err)
	}
	if title != manualTitle {
		t.Fatalf("GenerateTitle() = %q, want concurrent manual title %q", title, manualTitle)
	}
	if repo.currentTitle != manualTitle {
		t.Fatalf("persisted title = %q, want concurrent manual title %q", repo.currentTitle, manualTitle)
	}
}

func TestGenerateTitleHonorsMandatoryReasoningModel(t *testing.T) {
	t.Parallel()

	model := &generatedTitleChatModel{response: "轻松闲聊"}
	svc := &sessionService{
		cfg: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSessionTitlePrompt: "Return only a short title.",
		}},
		sessionRepo: &generatedTitleSessionRepository{},
		modelService: &generatedTitleModelService{
			model: model,
			modelInfo: &types.Model{Parameters: types.ModelParameters{Reasoning: types.ReasoningParameters{
				Supported:        true,
				Mandatory:        true,
				SupportedEfforts: []string{"low", "high"},
				DefaultEffort:    "low",
			}}},
		},
	}

	_, err := svc.GenerateTitle(context.Background(), &types.Session{
		ID: "session-mandatory-reasoning", UserID: "user-1",
	}, []types.Message{{Role: "user", Content: "随便聊两句"}}, "model-1")
	if err != nil {
		t.Fatalf("GenerateTitle() error = %v", err)
	}
	if model.options == nil {
		t.Fatal("title model options are nil")
	}
	if model.options.Thinking != nil {
		t.Fatal("mandatory reasoning model must not receive Thinking=false")
	}
	if model.options.ReasoningEffort != "low" {
		t.Fatalf("ReasoningEffort = %q, want low", model.options.ReasoningEffort)
	}
	if model.callPurpose != "session_title" {
		t.Fatalf("call purpose = %q, want session_title", model.callPurpose)
	}
}

func TestGenerateTitleFallsBackToQueryWhenModelCallFails(t *testing.T) {
	t.Parallel()

	const query = "  晚上想简单放松一下。再给我很多细节  "
	repo := &generatedTitleSessionRepository{}
	svc := &sessionService{
		cfg: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSessionTitlePrompt: "Return only a short title.",
		}},
		sessionRepo: repo,
		modelService: &generatedTitleModelService{
			model: &generatedTitleChatModel{err: errors.New("provider unavailable")},
		},
	}

	title, err := svc.GenerateTitle(context.Background(), &types.Session{
		ID: "session-provider-error", UserID: "user-1",
	}, []types.Message{{Role: "user", Content: query}}, "model-1")
	if err != nil {
		t.Fatalf("GenerateTitle() error = %v", err)
	}
	if want := "晚上想简单放松一下。再给我很多细节"; title != want {
		t.Fatalf("GenerateTitle() = %q, want %q", title, want)
	}
	if repo.currentTitle != title {
		t.Fatalf("persisted title = %q, want %q", repo.currentTitle, title)
	}
}

func TestGenerateTitleFallsBackWhenModelCannotBeResolved(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		modelID      string
		modelService *generatedTitleModelService
	}{
		{
			name:    "specified model cannot be created",
			modelID: "model-1",
			modelService: &generatedTitleModelService{
				getChatErr: errors.New("temporary model construction failure"),
			},
		},
		{
			name:         "specified model resolves to nil",
			modelID:      "model-1",
			modelService: &generatedTitleModelService{},
		},
		{
			name:    "default model list is unavailable",
			modelID: "",
			modelService: &generatedTitleModelService{
				listModelsErr: errors.New("temporary model list failure"),
			},
		},
		{
			name:         "default model is unavailable",
			modelID:      "",
			modelService: &generatedTitleModelService{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &generatedTitleSessionRepository{}
			svc := &sessionService{
				cfg: &config.Config{Conversation: &config.ConversationConfig{
					GenerateSessionTitlePrompt: "Return only a short title.",
				}},
				sessionRepo:  repo,
				modelService: tt.modelService,
			}

			title, err := svc.GenerateTitle(context.Background(), &types.Session{
				ID: "session-model-resolution", UserID: "user-1",
			}, []types.Message{{Role: "user", Content: "今天想早点休息"}}, tt.modelID)
			if err != nil {
				t.Fatalf("GenerateTitle() error = %v", err)
			}
			if title != "今天想早点休息" || repo.currentTitle != title {
				t.Fatalf("title=%q persisted=%q, want deterministic fallback", title, repo.currentTitle)
			}
		})
	}
}

func TestSanitizeGeneratedTitle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		raw          string
		want         string
		wantRejected bool
	}{
		{
			name: "plain title is kept as is",
			raw:  "保单理赔流程咨询",
			want: "保单理赔流程咨询",
		},
		{
			name: "thinking prefix and surrounding whitespace are dropped",
			raw:  "<think>\n\n</think>  Claim filing steps \n",
			want: "Claim filing steps",
		},
		{
			name:         "over-long ascii completion is rejected",
			raw:          strings.Repeat("a", 300),
			wantRejected: true,
		},
		{
			name:         "over-long cjk completion is rejected by rune count",
			raw:          strings.Repeat("保", 300),
			wantRejected: true,
		},
		{
			name: "title exactly at the limit is not truncated",
			raw:  strings.Repeat("保", maxSessionTitleRunes),
			want: strings.Repeat("保", maxSessionTitleRunes),
		},
		{
			name:         "empty completion is rejected",
			raw:          "   ",
			wantRejected: true,
		},
		{
			name:         "multiline answer is rejected",
			raw:          "校准短语说明\n来源：知识库文档",
			wantRejected: true,
		},
		{
			name:         "markdown link is rejected",
			raw:          "[校准短语](https://example.com)",
			wantRejected: true,
		},
		{
			name:         "bare URL is rejected",
			raw:          "校准短语 https://example.com",
			wantRejected: true,
		},
		{
			name:         "model self-introduction is rejected",
			raw:          "我是DeepSeek，由深度求索公司创造的AI助手。很高兴认识你！有什么我可以帮你的吗？",
			wantRejected: true,
		},
		{
			name: "outer quotes are removed",
			raw:  "“校准短语与基因检测”",
			want: "校准短语与基因检测",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, rejected := sanitizeGeneratedTitle(tt.raw)
			if got != tt.want {
				t.Fatalf("title = %q, want %q", got, tt.want)
			}
			if rejected != tt.wantRejected {
				t.Fatalf("rejected = %v, want %v", rejected, tt.wantRejected)
			}
			if len([]rune(got)) > maxSessionTitleRunes {
				t.Fatalf("title still exceeds %d runes: %d", maxSessionTitleRunes, len([]rune(got)))
			}
		})
	}
}

func TestFallbackSessionTitleUsesFirstQuestionAndBoundsRunes(t *testing.T) {
	t.Parallel()

	if got, want := fallbackSessionTitle("  How   do I file a claim? Include every source. "), "How do I file a claim"; got != want {
		t.Fatalf("fallbackSessionTitle() = %q, want %q", got, want)
	}
	if got := fallbackSessionTitle(strings.Repeat("保", maxSessionTitleRunes+20)); len([]rune(got)) != maxSessionTitleRunes {
		t.Fatalf("fallbackSessionTitle() rune length = %d, want %d", len([]rune(got)), maxSessionTitleRunes)
	}
}

// The database column is VARCHAR(255) in every shipped migration; guard the
// constant so nobody raises it past what the column can hold.
func TestMaxSessionTitleRunesFitsColumn(t *testing.T) {
	t.Parallel()
	// Worst case for UTF-8 is 4 bytes per rune, but the column counts characters
	// in PostgreSQL and bytes in some engines, so keep a conservative bound.
	if maxSessionTitleRunes > 255 {
		t.Fatalf("maxSessionTitleRunes=%d exceeds the sessions.title column limit", maxSessionTitleRunes)
	}
}
