package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/models/rerank"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type agentQARerankModelService struct {
	stubModelService
	rerankIDs []string
}

func (s *agentQARerankModelService) GetRerankModel(_ context.Context, modelID string) (rerank.Reranker, error) {
	s.rerankIDs = append(s.rerankIDs, modelID)
	return &agentQARerankCapture{}, nil
}

type agentQARerankCapture struct{}

func (*agentQARerankCapture) Rerank(context.Context, string, []string) ([]rerank.RankResult, error) {
	return nil, nil
}

func (*agentQARerankCapture) GetModelName() string { return "capture-rerank" }
func (*agentQARerankCapture) GetModelID() string   { return "capture-rerank" }

type agentQARerankTenantService struct {
	interfaces.TenantService
	tenant       *types.Tenant
	requestedIDs []uint64
}

func (s *agentQARerankTenantService) GetTenantByID(_ context.Context, id uint64) (*types.Tenant, error) {
	s.requestedIDs = append(s.requestedIDs, id)
	return s.tenant, nil
}

type agentQARerankKBService struct {
	interfaces.KnowledgeBaseService
}

func (*agentQARerankKBService) GetKnowledgeBasesByIDsOnly(context.Context, []string) ([]*types.KnowledgeBase, error) {
	return []*types.KnowledgeBase{{ID: "kb-1", TenantID: 99}}, nil
}

type agentQARerankAgentService struct {
	interfaces.AgentService
	rerankModel rerank.Reranker
}

func (s *agentQARerankAgentService) CreateAgentEngine(
	_ context.Context,
	_ *types.AgentConfig,
	_ chat.Chat,
	rerankModel rerank.Reranker,
	_ *event.EventBus,
	_ string,
	_ string,
) (interfaces.AgentEngine, error) {
	s.rerankModel = rerankModel
	return agentQARerankEngine{}, nil
}

type agentQARerankEngine struct{}

func (agentQARerankEngine) Execute(context.Context, string, string, string, []chat.Message, ...[]string) (*types.AgentState, error) {
	return &types.AgentState{}, nil
}

func (agentQARerankEngine) SetMemoryPrompt(string) {}

func TestAgentQAPlatformBuiltinUsesConsumerTenantRerankResolver(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")

	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "resolved-rerank", Type: types.ModelTypeRerank}}
	modelService := &agentQARerankModelService{stubModelService: stubModelService{chatModel: &captureChatModel{}}}
	agentService := &agentQARerankAgentService{}
	tenantService := &agentQARerankTenantService{tenant: &types.Tenant{ID: 99}}

	consumerTenant := &types.Tenant{
		ID:              7,
		RetrievalConfig: &types.RetrievalConfig{RerankModelID: "consumer-rerank-candidate"},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, consumerTenant)

	svc := &sessionService{
		cfg:                   &config.Config{},
		modelService:          modelService,
		tenantService:         tenantService,
		knowledgeBaseService:  &agentQARerankKBService{},
		agentService:          agentService,
		consumerModelResolver: resolver,
	}
	req := &types.QARequest{
		Session: &types.Session{ID: "session-1", TenantID: 7},
		Query:   "find this",
		CustomAgent: &types.CustomAgent{
			ID:       types.BuiltinSmartReasoningID,
			TenantID: 99,
			Config: types.CustomAgentConfig{
				AgentMode:           types.AgentModeQuickAnswer,
				ModelID:             "agent-chat",
				AllowedTools:        []string{tools.ToolKnowledgeSearch},
				KBSelectionMode:     "selected",
				KnowledgeBases:      []string{"kb-1"},
				WebSearchProviderID: "provider",
			},
		},
	}

	err := svc.AgentQA(ctx, req, event.NewEventBus())
	require.NoError(t, err)
	require.Equal(t, []string{"consumer-rerank-candidate"}, resolver.callsForScene(types.ConsumerSceneRerank))
	require.Equal(t, []string{"resolved-rerank"}, modelService.rerankIDs)
	require.NotNil(t, agentService.rerankModel)
	require.Equal(t, "capture-rerank", agentService.rerankModel.GetModelID())
}

func TestResolveAgentRerankModelIDUsesContextTenantIDWhenInfoIsAbsent(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "resolved-rerank", Type: types.ModelTypeRerank}}
	tenantService := &agentQARerankTenantService{tenant: &types.Tenant{
		ID:              7,
		RetrievalConfig: &types.RetrievalConfig{RerankModelID: "consumer-rerank-candidate"},
	}}
	svc := &sessionService{consumerModelResolver: resolver, tenantService: tenantService}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))

	modelID, err := svc.resolveAgentRerankModelID(ctx, &types.QARequest{CustomAgent: &types.CustomAgent{
		ID:       types.BuiltinQuickAnswerID,
		TenantID: 99,
		Config:   types.CustomAgentConfig{RerankModelID: "agent-rerank"},
	}})
	require.NoError(t, err)
	require.Equal(t, "resolved-rerank", modelID)
	require.Equal(t, []uint64{7}, tenantService.requestedIDs)
	require.Equal(t, []string{"consumer-rerank-candidate"}, resolver.callsForScene(types.ConsumerSceneRerank))
}

func TestResolveAgentRerankModelIDKeepsCustomIMAndStandardAgentAuthority(t *testing.T) {
	tests := []struct {
		name   string
		env    string
		ctx    context.Context
		agent  *types.CustomAgent
		wantID string
	}{
		{
			name:   "custom agent",
			env:    "lite",
			agent:  &types.CustomAgent{ID: "custom-agent", Config: types.CustomAgentConfig{RerankModelID: "custom-rerank"}},
			wantID: "custom-rerank",
		},
		{
			name: "IM builtin",
			env:  "lite",
			ctx: types.WithPrincipal(context.Background(), types.Principal{
				Type: types.PrincipalIMUser,
				ID:   "im-user",
			}),
			agent:  &types.CustomAgent{ID: types.BuiltinSmartReasoningID, Config: types.CustomAgentConfig{RerankModelID: "im-rerank"}},
			wantID: "im-rerank",
		},
		{
			name:   "standard builtin",
			env:    "standard",
			agent:  &types.CustomAgent{ID: types.BuiltinQuickAnswerID, Config: types.CustomAgentConfig{RerankModelID: "standard-rerank"}},
			wantID: "standard-rerank",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tt.env)
			resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used", Type: types.ModelTypeRerank}}
			svc := &sessionService{consumerModelResolver: resolver}
			ctx := tt.ctx
			if ctx == nil {
				ctx = context.Background()
			}

			modelID, err := svc.resolveAgentRerankModelID(ctx, &types.QARequest{CustomAgent: tt.agent})
			require.NoError(t, err)
			require.Equal(t, tt.wantID, modelID)
			require.Empty(t, resolver.calls)
		})
	}
}

func (r *recordingConsumerModelResolver) callsForScene(scene types.ConsumerScene) []string {
	requested := make([]string, 0)
	for _, call := range r.calls {
		if call.scene == scene {
			requested = append(requested, call.requestedID)
		}
	}
	return requested
}
