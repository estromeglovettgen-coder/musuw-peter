package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/embedding"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

func marketplaceQAContext() (context.Context, *types.QARequest) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(41))
	agent := &types.CustomAgent{
		ID: "market-agent", TenantID: 99,
		Config: types.CustomAgentConfig{KBSelectionMode: "selected", KnowledgeBases: []string{"approved-kb"}},
	}
	ctx = types.WithMarketplaceScope(ctx, 41, &types.MarketplaceAccess{
		ProductID: "product", SourceTenantID: 99,
		Agent: agent, KnowledgeBaseIDs: []string{"approved-kb"},
	})
	return ctx, &types.QARequest{
		Session:     &types.Session{ID: "buyer-session", TenantID: 41},
		CustomAgent: agent, SharedAgentReadOnly: true, KnowledgeBaseIDs: []string{"approved-kb"},
	}
}

func TestMarketplaceQAUsesApprovedRetrievalWithoutChangingBuyer(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	ctx, req := marketplaceQAContext()
	svc := &sessionService{knowledgeBaseService: &tagTargetKnowledgeBaseService{kbs: map[string]*types.KnowledgeBase{
		"approved-kb": {ID: "approved-kb", TenantID: 99, Type: types.KnowledgeBaseTypeDocument},
	}}}
	require.NoError(t, rejectLiteForeignAgent(ctx, req))
	retrievalTenant := svc.resolveRetrievalTenantID(ctx, req)
	require.Equal(t, uint64(99), retrievalTenant)
	targets, err := svc.buildSearchTargets(ctx, retrievalTenant, req.KnowledgeBaseIDs, nil, nil)
	require.NoError(t, err)
	require.Len(t, targets, 1)
	require.Equal(t, "approved-kb", targets[0].KnowledgeBaseID)
	require.Equal(t, uint64(99), targets[0].TenantID)
	require.Equal(t, uint64(41), types.MustTenantIDFromContext(ctx))
}

func TestMarketplaceQARejectsForeignAgentAndInjectedSourceResources(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	ctx, req := marketplaceQAContext()
	req.CustomAgent.ID = "another-agent"
	require.Error(t, rejectLiteForeignAgent(ctx, req))
	req.CustomAgent.ID = "market-agent"
	req.KnowledgeBaseIDs = []string{"other-kb"}
	require.Error(t, rejectLiteForeignAgent(ctx, req))
	svc := &sessionService{}
	_, err := svc.buildSearchTargets(ctx, 99, []string{"other-kb"}, nil, nil)
	require.Error(t, err, "scope must reject before reading storage")
	_, err = svc.buildSearchTargets(ctx, 99, []string{"approved-kb"}, []string{"unapproved-doc"}, nil)
	require.Error(t, err)
}

type marketplaceModelRepo struct {
	consumerSceneModelRepo
	lookupTenant uint64
}

func (r *marketplaceModelRepo) GetByID(ctx context.Context, tenantID uint64, id string) (*types.Model, error) {
	r.lookupTenant = tenantID
	return r.consumerSceneModelRepo.GetByID(ctx, tenantID, id)
}

func TestMarketplaceSelectedChatModelKeepsBuyerMembershipGate(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	flash := consumerSceneModel(types.MarketplaceDefaultModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	rerank := consumerSceneModel("rerank-only", "Rerank")
	rerank.Type = types.ModelTypeRerank
	private := consumerSceneModel("source-private-model", "Private")
	private.IsBuiltin = false
	for _, tc := range []struct {
		name, model string
		plan        types.ConsumerPlan
		allowed     bool
	}{
		{"Free default", flash.ID, types.ConsumerPlanFree, true},
		{"Free cannot buy model access through a persona", pro.ID, types.ConsumerPlanFree, false},
		{"Plus may choose Pro", pro.ID, types.ConsumerPlanPlus, true},
		{"Max may choose Pro", pro.ID, types.ConsumerPlanMax, true},
		{"private source model is forbidden", private.ID, types.ConsumerPlanMax, false},
		{"missing model does not fall back to Flash", "missing", types.ConsumerPlanMax, false},
		{"non-chat model is forbidden", rerank.ID, types.ConsumerPlanMax, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, req := marketplaceQAContext()
			ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{
				ID: 41, Plan: tc.plan, PlanStatus: "active",
			})
			req.SummaryModelID = tc.model
			req.CustomAgent.Config.ModelID = tc.model
			req.CustomAgent.Config.QueryUnderstandModelID = tc.model
			repo := &marketplaceModelRepo{consumerSceneModelRepo: consumerSceneModelRepo{
				models: []*types.Model{flash, pro, rerank, private},
			}}
			svc := &sessionService{modelService: NewModelServiceWithEntitlement(
				repo, nil, nil, nil, nil, nil,
				&consumerSceneResolverEntitlement{plan: types.ConsumerPlanMax},
			)}
			require.NoError(t, rejectLiteForeignAgent(ctx, req))
			modelID, err := svc.resolveConsumerChatModel(ctx, req, types.ConsumerSceneRAG, req.KnowledgeBaseIDs, nil)
			if tc.allowed {
				require.NoError(t, err)
				require.Equal(t, tc.model, modelID)
			} else {
				require.Error(t, err)
				require.Empty(t, modelID)
			}
			require.Equal(t, uint64(41), repo.lookupTenant, "model lookup never borrows the publishing tenant")
			require.Equal(t, uint64(41), types.MustTenantIDFromContext(ctx))
			require.Equal(t, []string{"approved-kb"}, req.CustomAgent.Config.KnowledgeBases)
		})
	}
}

func TestMarketplaceHybridSearchAuthorizationUsesOnlyApprovedKB(t *testing.T) {
	ctx, _ := marketplaceQAContext()
	svc := &knowledgeBaseService{kbShareService: &fakeKBShareForAuth{}}
	require.NoError(t, svc.authorizeKBAccess(ctx, []*types.KnowledgeBase{{ID: "approved-kb", TenantID: 99}}, 41))
	require.Error(t, svc.authorizeKBAccess(ctx, []*types.KnowledgeBase{{ID: "other-source-kb", TenantID: 99}}, 41))
	require.Error(t, svc.authorizeKBAccess(ctx, []*types.KnowledgeBase{{ID: "own-kb", TenantID: 41}}, 41),
		"a purchased persona cannot expand retrieval to the buyer's unmentioned personal data")
}

type marketplaceEmbeddingKBRepo struct {
	interfaces.KnowledgeBaseRepository
}

func (marketplaceEmbeddingKBRepo) GetKnowledgeBaseByID(_ context.Context, id string) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{
		ID:               id,
		TenantID:         99,
		EmbeddingModelID: types.PlatformKnowledgeBaseEmbeddingModelID,
	}, nil
}

type marketplaceEmbeddingModelSpy struct {
	interfaces.ModelService
	embedding.Embedder
	modelBuyer, source, inferenceBuyer uint64
	calls                              int
}

func (s *marketplaceEmbeddingModelSpy) GetEmbeddingModelForTenant(
	ctx context.Context,
	_ string,
	source uint64,
) (embedding.Embedder, error) {
	s.modelBuyer, s.source = types.MustTenantIDFromContext(ctx), source
	return s, nil
}

func (s *marketplaceEmbeddingModelSpy) Embed(ctx context.Context, _ string) ([]float32, error) {
	s.calls++
	s.inferenceBuyer = types.MustTenantIDFromContext(ctx)
	return []float32{1, 2}, nil
}

func TestMarketplaceEmbeddingKeepsBuyerBillingAfterSSEContextDetach(t *testing.T) {
	ctx, _ := marketplaceQAContext()
	ctx = logger.CloneContext(ctx)
	model := &marketplaceEmbeddingModelSpy{}
	svc := &knowledgeBaseService{repo: marketplaceEmbeddingKBRepo{}, modelService: model}
	result, err := svc.GetQueryEmbedding(ctx, "approved-kb", "question")
	require.NoError(t, err)
	require.Equal(t, []float32{1, 2}, result)
	require.Equal(t, uint64(99), model.source, "embedding configuration must match the source vector space")
	require.Equal(t, uint64(41), model.modelBuyer)
	require.Equal(t, uint64(41), model.inferenceBuyer, "model usage must be charged to the buyer")
	_, err = svc.GetQueryEmbedding(ctx, "unapproved-kb", "question")
	require.Error(t, err, "reject an unapproved KB before any model cost")
	require.Equal(t, 1, model.calls)
}
