package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type recordingConsumerModelResolver struct {
	model      *types.Model
	calls      []consumerResolverCall
	resolveErr error
}

type consumerResolverCall struct {
	scene       types.ConsumerScene
	requestedID string
}

func (r *recordingConsumerModelResolver) ResolveConsumerModel(_ context.Context, scene types.ConsumerScene, requestedID string) (*types.Model, error) {
	r.calls = append(r.calls, consumerResolverCall{scene: scene, requestedID: requestedID})
	if r.resolveErr != nil {
		return nil, r.resolveErr
	}
	return r.model, nil
}

func (r *recordingConsumerModelResolver) ListConsumerModelOptions(context.Context, types.ConsumerScene) ([]*types.ConsumerModelOption, error) {
	return nil, nil
}

func (r *recordingConsumerModelResolver) AllowsFreeConsumerModel(context.Context, *types.Model) (bool, error) {
	return false, nil
}

func TestConsumerSceneForSearchScopeClassifiesEffectiveScope(t *testing.T) {
	tests := []struct {
		name       string
		targets    types.SearchTargets
		knowledgeB []string
		knowledge  []string
		web        bool
		want       types.ConsumerScene
	}{
		{name: "pure chat", want: types.ConsumerSceneChat},
		{name: "knowledge base", knowledgeB: []string{"kb-1"}, want: types.ConsumerSceneRAG},
		{
			name: "tag-only target",
			targets: types.SearchTargets{{
				Type:            types.SearchTargetTypeKnowledge,
				KnowledgeBaseID: "kb-1",
				TagIDs:          []string{"tag-1"},
			}},
			want: types.ConsumerSceneRAG,
		},
		{name: "web search", web: true, want: types.ConsumerSceneRAG},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := consumerSceneForSearchScope(tt.targets, tt.knowledgeB, tt.knowledge, tt.web)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestResolveConsumerChatModelPropagatesEffectivePlatformID(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "effective-platform"}}
	svc := &sessionService{consumerModelResolver: resolver}
	req := &types.QARequest{
		SummaryModelID: "browser-candidate",
		CustomAgent:    &types.CustomAgent{ID: types.BuiltinSmartReasoningID},
	}

	modelID, err := svc.resolveConsumerChatModel(context.Background(), req, types.ConsumerSceneRAG, nil, nil)
	require.NoError(t, err)
	require.Equal(t, "effective-platform", modelID)
	require.Equal(t, "effective-platform", req.SummaryModelID)
	require.Equal(t, "effective-platform", req.CustomAgent.Config.ModelID)
	require.Equal(t, "effective-platform", req.CustomAgent.Config.QueryUnderstandModelID)
	require.Equal(t, []consumerResolverCall{{scene: types.ConsumerSceneRAG, requestedID: "browser-candidate"}}, resolver.calls)
}

func TestResolveConsumerChatModelUsesAgentSceneForLitePlatformChat(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "effective-agent"}}
	svc := &sessionService{consumerModelResolver: resolver}
	req := &types.QARequest{
		SummaryModelID: "browser-agent-candidate",
		CustomAgent:    &types.CustomAgent{ID: types.BuiltinQuickAnswerID},
	}

	modelID, err := svc.resolveConsumerChatModel(context.Background(), req, types.ConsumerSceneChat, nil, nil)
	require.NoError(t, err)
	require.Equal(t, "effective-agent", modelID)
	require.Equal(t, "effective-agent", req.SummaryModelID)
	require.Equal(t, "effective-agent", req.CustomAgent.Config.ModelID)
	require.Equal(t, "effective-agent", req.CustomAgent.Config.QueryUnderstandModelID)
	require.Equal(t, []consumerResolverCall{{scene: types.ConsumerSceneRAG, requestedID: "browser-agent-candidate"}}, resolver.calls)
}

func TestResolveConsumerChatModelPreservesStandardAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used"}}
	svc := &sessionService{
		consumerModelResolver: resolver,
		modelService: &stubModelService{modelsByID: map[string]*types.Model{
			"standard-model": {ID: "standard-model", Type: types.ModelTypeKnowledgeQA},
		}},
	}
	req := &types.QARequest{
		SummaryModelID: "standard-model",
		CustomAgent:    &types.CustomAgent{ID: types.BuiltinSmartReasoningID},
	}

	modelID, err := svc.resolveConsumerChatModel(context.Background(), req, types.ConsumerSceneRAG, nil, nil)
	require.NoError(t, err)
	require.Equal(t, "standard-model", modelID)
	require.Empty(t, resolver.calls)
}

func TestResolveConsumerChatModelBypassesCustomAgent(t *testing.T) {
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used"}}
	svc := &sessionService{
		consumerModelResolver: resolver,
		modelService: &stubModelService{modelsByID: map[string]*types.Model{
			"custom-model": {ID: "custom-model", Type: types.ModelTypeKnowledgeQA},
		}},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID:     "standard-agent",
			Config: types.CustomAgentConfig{ModelID: "custom-model"},
		},
	}

	modelID, err := svc.resolveConsumerChatModel(context.Background(), req, types.ConsumerSceneChat, nil, nil)
	require.NoError(t, err)
	require.Equal(t, "custom-model", modelID)
	require.Empty(t, resolver.calls)
}

func TestResolveConsumerChatModelBypassesResolverForIMPrincipal(t *testing.T) {
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used"}}
	svc := &sessionService{
		consumerModelResolver: resolver,
		modelService: &stubModelService{modelsByID: map[string]*types.Model{
			"im-model": {ID: "im-model", Type: types.ModelTypeKnowledgeQA},
		}},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID:     types.BuiltinSmartReasoningID,
			Config: types.CustomAgentConfig{ModelID: "im-model"},
		},
	}
	ctx := types.WithPrincipal(context.Background(), types.Principal{Type: types.PrincipalIMUser, ID: "im-user"})

	modelID, err := svc.resolveConsumerChatModel(ctx, req, types.ConsumerSceneRAG, nil, nil)
	require.NoError(t, err)
	require.Equal(t, "im-model", modelID)
	require.Empty(t, resolver.calls)
}

func TestResolveConsumerRerankModelUsesTypedSceneResolver(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "effective-rerank", Type: types.ModelTypeRerank}}
	svc := &sessionService{consumerModelResolver: resolver}

	modelID, err := svc.resolveConsumerRerankModelID(context.Background(), "tenant-retrieval-candidate")
	require.NoError(t, err)
	require.Equal(t, "effective-rerank", modelID)
	require.Equal(t, []consumerResolverCall{{scene: types.ConsumerSceneRerank, requestedID: "tenant-retrieval-candidate"}}, resolver.calls)
}

func TestResolveConsumerRerankModelPreservesStandardAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used", Type: types.ModelTypeRerank}}
	svc := &sessionService{consumerModelResolver: resolver}

	modelID, err := svc.resolveConsumerRerankModelID(context.Background(), "standard-rerank")
	require.NoError(t, err)
	require.Equal(t, "standard-rerank", modelID)
	require.Empty(t, resolver.calls)
}

func TestConsumerRerankAllowedForRequestBypassesIMPrincipal(t *testing.T) {
	ctx := types.WithPrincipal(context.Background(), types.Principal{Type: types.PrincipalIMUser, ID: "im-user"})

	require.False(t, consumerRerankAllowedForRequest(ctx, nil))
	require.False(t, consumerRerankAllowedForRequest(ctx, &types.CustomAgent{ID: types.BuiltinSmartReasoningID}))
}

func TestConsumerRerankAllowedForRequestKeepsPlatformAndCustomBoundaries(t *testing.T) {
	ctx := context.Background()

	require.True(t, consumerRerankAllowedForRequest(ctx, nil))
	require.True(t, consumerRerankAllowedForRequest(ctx, &types.CustomAgent{ID: types.BuiltinSmartReasoningID}))
	require.False(t, consumerRerankAllowedForRequest(ctx, &types.CustomAgent{ID: "custom-agent"}))
}

func TestResolveConsumerRerankModelRejectsWrongNativeType(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "wrong-type", Type: types.ModelTypeKnowledgeQA}}
	svc := &sessionService{consumerModelResolver: resolver}

	_, err := svc.resolveConsumerRerankModelID(context.Background(), "candidate")
	require.Error(t, err)
	require.Contains(t, err.Error(), "non-rerank")
}

type recordingWikiModelService struct {
	stubModelService
	lastChatModelID string
}

func (s *recordingWikiModelService) GetChatModel(_ context.Context, modelID string) (chat.Chat, error) {
	s.lastChatModelID = modelID
	return s.chatModel, nil
}

func TestResolveWikiChatModelUsesSharedSceneResolverAndDurableCandidate(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	modelService := &recordingWikiModelService{stubModelService: stubModelService{chatModel: &captureChatModel{}}}
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "effective-wiki"}}
	svc := &wikiIngestService{modelService: modelService, consumerModelResolver: resolver}
	kb := &types.KnowledgeBase{
		SummaryModelID: "summary-model",
		WikiConfig:     &types.WikiConfig{SynthesisModelID: "wiki-candidate"},
	}

	_, err := svc.resolveWikiChatModel(context.Background(), kb)
	require.NoError(t, err)
	require.Equal(t, "wiki-candidate", resolver.calls[0].requestedID)
	require.Equal(t, types.ConsumerSceneWiki, resolver.calls[0].scene)
	require.Equal(t, "effective-wiki", modelService.lastChatModelID)
}

func TestResolveWikiChatModelPreservesStandardAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	modelService := &recordingWikiModelService{stubModelService: stubModelService{chatModel: &captureChatModel{}}}
	resolver := &recordingConsumerModelResolver{model: &types.Model{ID: "must-not-be-used"}}
	svc := &wikiIngestService{modelService: modelService, consumerModelResolver: resolver}
	kb := &types.KnowledgeBase{WikiConfig: &types.WikiConfig{SynthesisModelID: "standard-wiki"}}

	_, err := svc.resolveWikiChatModel(context.Background(), kb)
	require.NoError(t, err)
	require.Equal(t, "standard-wiki", modelService.lastChatModelID)
	require.Empty(t, resolver.calls)
}

func TestResolveWikiChatModelFallsBackToSummaryWithoutResolver(t *testing.T) {
	modelService := &recordingWikiModelService{stubModelService: stubModelService{chatModel: &captureChatModel{}}}
	svc := &wikiIngestService{modelService: modelService}
	kb := &types.KnowledgeBase{SummaryModelID: "summary-model", WikiConfig: &types.WikiConfig{}}

	_, err := svc.resolveWikiChatModel(context.Background(), kb)
	require.NoError(t, err)
	require.Equal(t, "summary-model", modelService.lastChatModelID)
}

func TestWikiSynthesisModelCandidatePrefersWikiConfig(t *testing.T) {
	preferWiki := &types.KnowledgeBase{
		SummaryModelID: "summary-model",
		WikiConfig:     &types.WikiConfig{SynthesisModelID: "wiki-model"},
	}
	require.Equal(t, "wiki-model", wikiSynthesisModelCandidate(preferWiki))
	require.Equal(t, "summary-model", wikiSynthesisModelCandidate(&types.KnowledgeBase{SummaryModelID: "summary-model", WikiConfig: &types.WikiConfig{}}))
}
