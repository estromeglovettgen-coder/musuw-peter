package service

import (
	"context"
	"testing"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingNativeResolver is a deliberately narrow fake for the KB create
// seam. The production resolver remains the authority for plan and catalog
// validation; this fake only proves that the create service forwards the four
// user-configurable native candidates and persists the resolved IDs.
type recordingNativeResolver struct {
	models map[types.ConsumerScene]*types.Model
	calls  []consumerResolverCall
	err    error
}

func (r *recordingNativeResolver) ResolveConsumerModel(_ context.Context, scene types.ConsumerScene, requestedID string) (*types.Model, error) {
	r.calls = append(r.calls, consumerResolverCall{scene: scene, requestedID: requestedID})
	if r.err != nil {
		return nil, r.err
	}
	return r.models[scene], nil
}

func (r *recordingNativeResolver) ListConsumerModelOptions(context.Context, types.ConsumerScene) ([]*types.ConsumerModelOption, error) {
	return nil, nil
}

func (r *recordingNativeResolver) AllowsFreeConsumerModel(context.Context, *types.Model) (bool, error) {
	return false, nil
}

var _ interfaces.ConsumerModelResolver = (*recordingNativeResolver)(nil)

func TestCreateKnowledgeBaseResolvesNativeConsumerCandidatesAndKeepsEmbeddingPlatformOwned(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	resolver := &recordingNativeResolver{models: map[types.ConsumerScene]*types.Model{
		types.ConsumerSceneRAG:    {ID: "rag-effective", Type: types.ModelTypeKnowledgeQA},
		types.ConsumerSceneWiki:   {ID: "wiki-effective", Type: types.ModelTypeKnowledgeQA},
		types.ConsumerSceneVision: {ID: "vision-effective", Type: types.ModelTypeVLLM},
		types.ConsumerSceneASR:    {ID: "asr-effective", Type: types.ModelTypeASR},
	}}
	svc := &knowledgeBaseService{
		repo:                  repo,
		modelService:          &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
		consumerModelResolver: resolver,
	}

	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name:             "native",
		SummaryModelID:   "rag-candidate",
		EmbeddingModelID: "forged-embedding-must-be-ignored",
		ImageProcessingConfig: types.ImageProcessingConfig{
			ModelID: "vision-candidate",
		},
		VLMConfig: types.VLMConfig{Enabled: true, ModelID: "vision-candidate"},
		ASRConfig: types.ASRConfig{Enabled: true, ModelID: "asr-candidate"},
		WikiConfig: &types.WikiConfig{
			SynthesisModelID: "wiki-candidate",
		},
	})

	require.NoError(t, err)
	require.NotNil(t, kb)
	require.Equal(t, []consumerResolverCall{
		{scene: types.ConsumerSceneRAG, requestedID: "rag-candidate"},
		{scene: types.ConsumerSceneWiki, requestedID: "wiki-candidate"},
		{scene: types.ConsumerSceneVision, requestedID: "vision-candidate"},
		{scene: types.ConsumerSceneASR, requestedID: "asr-candidate"},
	}, resolver.calls)
	require.Equal(t, "rag-effective", kb.SummaryModelID)
	require.NotNil(t, kb.WikiConfig)
	require.Equal(t, "wiki-effective", kb.WikiConfig.SynthesisModelID)
	require.Equal(t, "vision-effective", kb.ImageProcessingConfig.ModelID)
	require.Equal(t, "vision-effective", kb.VLMConfig.ModelID)
	require.Equal(t, "asr-effective", kb.ASRConfig.ModelID)
	require.Equal(t, types.PlatformKnowledgeBaseEmbeddingModelID, kb.EmbeddingModelID)
	require.Len(t, repo.rows, 1)
}

// TestCreateKnowledgeBaseUsesPlanAwareVisionDefaults exercises the real
// consumer resolver at the KB-create seam.  A zero-config paid (including a
// complimentary Pro grant) KB must bind the URL-capable MiMo model, while a
// Free KB keeps the existing Gemini/Vertex compatibility model.  This is
// intentionally an end-to-end service test rather than a resolver-only test:
// it protects the ordering where platform defaults are applied before the
// plan-aware consumer bindings are persisted.
func TestCreateKnowledgeBaseUsesPlanAwareVisionDefaults(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")

	models := make([]*types.Model, 0)
	for _, id := range defaultConsumerPaidModelIDs() {
		models = append(models, consumerSceneModel(id, id))
	}
	for _, id := range defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM) {
		models = append(models, consumerSceneVLMModel(id, id))
	}
	for _, id := range defaultConsumerPaidModelIDsForType(types.ModelTypeASR) {
		model := consumerSceneModel(id, id)
		model.Type = types.ModelTypeASR
		models = append(models, model)
	}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: models},
		registryConsumerSceneSettings{},
		nil,
	)
	newService := func(repo *fakeKBRepo) *knowledgeBaseService {
		return &knowledgeBaseService{
			repo:                  repo,
			modelService:          &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
			consumerModelResolver: resolver,
		}
	}

	paidRepo := newFakeKBRepo()
	paidKB, err := newService(paidRepo).CreateKnowledgeBase(
		contextWithComplimentaryPlan(1, types.ConsumerPlanPro, time.Now().UTC().Add(time.Hour)),
		&types.KnowledgeBase{Name: "complimentary-pro"},
	)
	require.NoError(t, err)
	require.NotNil(t, paidKB)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, paidKB.VLMConfig.ModelID)
	assert.Equal(t, paidKB.VLMConfig.ModelID, paidKB.ImageProcessingConfig.ModelID)

	freeRepo := newFakeKBRepo()
	freeKB, err := newService(freeRepo).CreateKnowledgeBase(
		contextWithConsumerPlan(2, types.ConsumerPlanFree),
		&types.KnowledgeBase{Name: "free"},
	)
	require.NoError(t, err)
	require.NotNil(t, freeKB)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, freeKB.VLMConfig.ModelID)
	assert.Equal(t, freeKB.VLMConfig.ModelID, freeKB.ImageProcessingConfig.ModelID)
}

func TestCreateKnowledgeBasePreservesStandardModelAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	resolver := &recordingNativeResolver{err: apperrors.NewForbiddenError("consumer resolver must not run in Standard")}
	svc := &knowledgeBaseService{
		repo:                  repo,
		modelService:          &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
		consumerModelResolver: resolver,
	}

	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name:           "standard",
		SummaryModelID: "standard-summary",
		WikiConfig:     &types.WikiConfig{SynthesisModelID: "standard-wiki"},
		VLMConfig:      types.VLMConfig{Enabled: true, ModelID: "standard-vlm"},
		ASRConfig:      types.ASRConfig{Enabled: true, ModelID: "standard-asr"},
	})

	require.NoError(t, err)
	require.NotNil(t, kb)
	require.Empty(t, resolver.calls)
	// Standard still receives the existing platform zero-config bindings; the
	// consumer scene resolver must not rewrite or reject its explicit request.
	require.Equal(t, types.PlatformKnowledgeBaseChatModelID, kb.SummaryModelID)
	require.Equal(t, types.PlatformKnowledgeBaseEmbeddingModelID, kb.EmbeddingModelID)
	require.Equal(t, types.PlatformKnowledgeBaseVLMModelID, kb.VLMConfig.ModelID)
	require.Equal(t, types.PlatformKnowledgeBaseASRModelID, kb.ASRConfig.ModelID)
	require.Len(t, repo.rows, 1)
}

func TestCreateKnowledgeBaseRejectsUnauthorizedNativeCandidateBeforePersisting(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	resolver := &recordingNativeResolver{err: apperrors.NewForbiddenError("model is not configured for this scene")}
	svc := &knowledgeBaseService{
		repo:                  repo,
		modelService:          &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
		consumerModelResolver: resolver,
	}

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name:           "forged",
		SummaryModelID: "paid-or-cross-type",
	})
	require.Error(t, err)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, apperrors.ErrForbidden, appErr.Code)
	require.Empty(t, repo.rows)
}

func TestCreateKnowledgeBaseResolverEmptyResultFailsClosed(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	resolver := &recordingNativeResolver{}
	svc := &knowledgeBaseService{
		repo:                  repo,
		modelService:          &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
		consumerModelResolver: resolver,
	}

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{Name: "empty"})
	require.Error(t, err)
	require.Contains(t, err.Error(), "resolve rag")
	require.Contains(t, err.Error(), "resolved no model")
	require.Empty(t, repo.rows)
}

func TestCreateKnowledgeBaseRejectsGraphOnlyConsumerDocumentBeforePersisting(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	svc := &knowledgeBaseService{repo: repo}

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name:             "hidden-graph-only",
		Type:             types.KnowledgeBaseTypeDocument,
		IndexingStrategy: types.IndexingStrategy{GraphEnabled: true},
	})

	require.Error(t, err)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, apperrors.ErrBadRequest, appErr.Code)
	require.Contains(t, appErr.Message, "RAG or Wiki")
	require.Empty(t, repo.rows)
}

func TestCreateKnowledgeBasePreservesStandardGraphOnlyDocumentContract(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	svc := &knowledgeBaseService{
		repo:         repo,
		modelService: &platformCatalogStub{models: readyPlatformKnowledgeBaseModels()},
	}

	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name:             "standard-graph-only",
		Type:             types.KnowledgeBaseTypeDocument,
		IndexingStrategy: types.IndexingStrategy{GraphEnabled: true},
	})

	require.NoError(t, err)
	require.NotNil(t, kb)
	require.True(t, kb.IndexingStrategy.GraphEnabled)
	require.False(t, kb.IndexingStrategy.VectorEnabled)
	require.False(t, kb.IndexingStrategy.KeywordEnabled)
	require.False(t, kb.IndexingStrategy.WikiEnabled)
	require.Len(t, repo.rows, 1)
}
