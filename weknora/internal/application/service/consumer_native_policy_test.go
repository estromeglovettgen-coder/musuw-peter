package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// typedConsumerSceneModelRepo deliberately returns every row regardless of
// the requested type. The resolver must apply the native scene type itself;
// relying on a repository-side filter alone would make a cross-type policy
// candidate look valid in tests and in deployments with a broad List query.
type typedConsumerSceneModelRepo struct {
	interfaces.ModelRepository
	models []*types.Model
}

func (r *typedConsumerSceneModelRepo) List(context.Context, uint64, types.ModelType, types.ModelSource) ([]*types.Model, error) {
	return append([]*types.Model(nil), r.models...), nil
}

func typedConsumerModel(id string, modelType types.ModelType) *types.Model {
	return &types.Model{
		ID:          id,
		Name:        id,
		DisplayName: id,
		Type:        modelType,
		Status:      types.ModelStatusActive,
		IsBuiltin:   true,
		Source:      types.ModelSourceRemote,
		Parameters:  types.ModelParameters{Provider: "openrouter", BaseURL: provider.OpenRouterBaseURL},
	}
}

func nativeSceneSettingString(key, value string) *types.SystemSetting {
	raw, _ := json.Marshal(value)
	return &types.SystemSetting{Key: key, ValueType: "string", Value: raw}
}

func nativeSceneSettingList(key string, value []string) *types.SystemSetting {
	raw, _ := json.Marshal(value)
	return &types.SystemSetting{Key: key, ValueType: "string_list", Value: raw}
}

func TestConsumerScenesExposeOnlyFiveUserBoundariesWithNativeMappings(t *testing.T) {
	wantScenes := []types.ConsumerScene{
		types.ConsumerSceneRAG,
		types.ConsumerSceneRerank,
		types.ConsumerSceneWiki,
		types.ConsumerSceneVision,
		types.ConsumerSceneASR,
	}
	assert.Equal(t, wantScenes, types.ConsumerScenes())

	wantTypes := map[types.ConsumerScene]types.ModelType{
		types.ConsumerSceneRAG:    types.ModelTypeKnowledgeQA,
		types.ConsumerSceneWiki:   types.ModelTypeKnowledgeQA,
		types.ConsumerSceneRerank: types.ModelTypeRerank,
		types.ConsumerSceneVision: types.ModelTypeVLLM,
		types.ConsumerSceneASR:    types.ModelTypeASR,
	}
	wantDefaults := map[types.ConsumerScene]string{
		types.ConsumerSceneRAG:    types.PlatformKnowledgeBaseChatModelID,
		types.ConsumerSceneWiki:   types.PlatformKnowledgeBaseChatModelID,
		types.ConsumerSceneRerank: types.CheapestRerankModelID,
		types.ConsumerSceneVision: types.PlatformKnowledgeBaseVLMModelID,
		types.ConsumerSceneASR:    types.PlatformKnowledgeBaseASRModelID,
	}
	for scene, wantType := range wantTypes {
		assert.True(t, scene.Valid())
		assert.Equal(t, wantType, scene.ModelType())
		assert.Equal(t, wantDefaults[scene], scene.CompatibilityDefaultID())
	}
	// Chat remains valid for existing runtime resolution but is deliberately
	// absent from the user-facing five-scene list. Embedding has no consumer
	// scene: its existing platform binding remains internal to KB indexing.
	assert.True(t, types.ConsumerSceneChat.Valid())
	assert.False(t, types.ConsumerScene("embedding").Valid())
}

func TestConsumerModelResolverUsesNativeCatalogForRerankVisionAndASR(t *testing.T) {
	rankFree := typedConsumerModel("rank-free", types.ModelTypeRerank)
	rankPaid := typedConsumerModel("rank-paid", types.ModelTypeRerank)
	visionFree := typedConsumerModel("vision-free", types.ModelTypeVLLM)
	visionPaid := typedConsumerModel("vision-paid", types.ModelTypeVLLM)
	asrFree := typedConsumerModel("asr-free", types.ModelTypeASR)
	asrPaid := typedConsumerModel("asr-paid", types.ModelTypeASR)
	// Same IDs as policy candidates but wrong native types must never be
	// accepted by a typed scene.
	wrongType := typedConsumerModel("wrong-type", types.ModelTypeKnowledgeQA)
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneRerank.FreeDefaultKey(): nativeSceneSettingString(types.ConsumerSceneRerank.FreeDefaultKey(), rankFree.ID),
		types.ConsumerSceneRerank.PaidOptionsKey(): nativeSceneSettingList(types.ConsumerSceneRerank.PaidOptionsKey(), []string{rankPaid.ID}),
		types.ConsumerSceneVision.FreeDefaultKey(): nativeSceneSettingString(types.ConsumerSceneVision.FreeDefaultKey(), visionFree.ID),
		types.ConsumerSceneVision.PaidOptionsKey(): nativeSceneSettingList(types.ConsumerSceneVision.PaidOptionsKey(), []string{visionPaid.ID}),
		types.ConsumerSceneASR.FreeDefaultKey():    nativeSceneSettingString(types.ConsumerSceneASR.FreeDefaultKey(), asrFree.ID),
		types.ConsumerSceneASR.PaidOptionsKey():    nativeSceneSettingList(types.ConsumerSceneASR.PaidOptionsKey(), []string{asrPaid.ID}),
	}}
	resolver := NewConsumerModelResolver(&typedConsumerSceneModelRepo{models: []*types.Model{
		rankFree, rankPaid, visionFree, visionPaid, asrFree, asrPaid, wrongType,
	}}, settings, nil)

	for _, tc := range []struct {
		name     string
		scene    types.ConsumerScene
		freeID   string
		paidID   string
		modelTyp types.ModelType
	}{
		{name: "rerank", scene: types.ConsumerSceneRerank, freeID: rankFree.ID, paidID: rankPaid.ID, modelTyp: types.ModelTypeRerank},
		{name: "vision", scene: types.ConsumerSceneVision, freeID: visionFree.ID, paidID: visionPaid.ID, modelTyp: types.ModelTypeVLLM},
		{name: "asr", scene: types.ConsumerSceneASR, freeID: asrFree.ID, paidID: asrPaid.ID, modelTyp: types.ModelTypeASR},
	} {
		t.Run(tc.name, func(t *testing.T) {
			freeCtx := contextWithConsumerPlan(1, types.ConsumerPlanFree)
			resolved, err := resolver.ResolveConsumerModel(freeCtx, tc.scene, "")
			require.NoError(t, err)
			assert.Equal(t, tc.freeID, resolved.ID)
			assert.Equal(t, tc.modelTyp, resolved.Type)

			options, err := resolver.ListConsumerModelOptions(freeCtx, tc.scene)
			require.NoError(t, err)
			require.Len(t, options, 2)
			assert.Equal(t, tc.freeID, options[0].ModelID)
			assert.True(t, options[0].Selectable)
			assert.Equal(t, tc.modelTyp, options[0].ModelType)
			assert.Equal(t, tc.paidID, options[1].ModelID)
			assert.True(t, options[1].Locked)
			assert.False(t, options[1].Selectable)

			paidCtx := contextWithConsumerPlan(1, types.ConsumerPlanPlus)
			resolved, err = resolver.ResolveConsumerModel(paidCtx, tc.scene, tc.paidID)
			require.NoError(t, err)
			assert.Equal(t, tc.paidID, resolved.ID)
		})
	}
}

func TestConsumerModelResolverRejectsWrongTypedCandidateAndUsesTypedFallback(t *testing.T) {
	rankFree := typedConsumerModel("rank-free", types.ModelTypeRerank)
	rankPaid := typedConsumerModel("rank-paid", types.ModelTypeRerank)
	rankDefault := typedConsumerModel(types.CheapestRerankModelID, types.ModelTypeRerank)
	wrongType := typedConsumerModel("wrong-type", types.ModelTypeKnowledgeQA)
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneRerank.FreeDefaultKey(): nativeSceneSettingString(types.ConsumerSceneRerank.FreeDefaultKey(), rankFree.ID),
		// The wrong-type candidate invalidates the complete policy. The
		// resolver must ignore both values and return the deterministic rank
		// compatibility default, never authorize wrong-type or stale rows.
		types.ConsumerSceneRerank.PaidOptionsKey(): nativeSceneSettingList(types.ConsumerSceneRerank.PaidOptionsKey(), []string{wrongType.ID}),
	}}
	resolver := NewConsumerModelResolver(&typedConsumerSceneModelRepo{models: []*types.Model{
		rankFree, rankPaid, rankDefault, wrongType,
	}}, settings, nil)

	resolved, err := resolver.ResolveConsumerModel(contextWithConsumerPlan(1, types.ConsumerPlanPlus), types.ConsumerSceneRerank, rankPaid.ID)
	require.NoError(t, err)
	assert.Equal(t, types.CheapestRerankModelID, resolved.ID)
}

func TestFreeGenericGateUsesConfiguredTypedDefaultUnion(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	rankFree := typedConsumerModel("rank-free", types.ModelTypeRerank)
	rankPaid := typedConsumerModel("rank-paid", types.ModelTypeRerank)
	rankDefault := typedConsumerModel(types.CheapestRerankModelID, types.ModelTypeRerank)
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneRerank.FreeDefaultKey(): nativeSceneSettingString(types.ConsumerSceneRerank.FreeDefaultKey(), rankFree.ID),
		types.ConsumerSceneRerank.PaidOptionsKey(): nativeSceneSettingList(types.ConsumerSceneRerank.PaidOptionsKey(), []string{rankPaid.ID}),
	}}
	resolver := NewConsumerModelResolver(&typedConsumerSceneModelRepo{models: []*types.Model{rankFree, rankPaid, rankDefault}}, settings, nil)
	svc := &modelService{consumerResolver: resolver, entitlement: &consumerSceneResolverEntitlement{}}

	allowed, err := svc.consumerPlanAllowsModel(contextWithConsumerPlan(1, types.ConsumerPlanFree), rankFree)
	require.NoError(t, err)
	assert.True(t, allowed)
	allowed, err = svc.consumerPlanAllowsModel(contextWithConsumerPlan(1, types.ConsumerPlanFree), rankPaid)
	require.NoError(t, err)
	assert.False(t, allowed)
	allowed, err = svc.consumerPlanAllowsModel(contextWithConsumerPlan(1, types.ConsumerPlanFree), rankDefault)
	require.NoError(t, err)
	assert.False(t, allowed, "a valid typed policy does not implicitly widen access to its compatibility default")
}

func TestFreeGenericGateAllowsTypedCompatibilityDefaultWhenPolicyIsInvalid(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	rankDefault := typedConsumerModel(types.CheapestRerankModelID, types.ModelTypeRerank)
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneRerank.FreeDefaultKey(): nativeSceneSettingString(types.ConsumerSceneRerank.FreeDefaultKey(), rankDefault.ID),
		// A malformed paid list makes the pair invalid and forces the
		// deterministic compatibility fallback.
		types.ConsumerSceneRerank.PaidOptionsKey(): nativeSceneSettingList(types.ConsumerSceneRerank.PaidOptionsKey(), []string{"stale"}),
	}}
	resolver := NewConsumerModelResolver(&typedConsumerSceneModelRepo{models: []*types.Model{rankDefault}}, settings, nil)
	svc := &modelService{consumerResolver: resolver, entitlement: &consumerSceneResolverEntitlement{}}

	allowed, err := svc.consumerPlanAllowsModel(contextWithConsumerPlan(1, types.ConsumerPlanFree), rankDefault)
	require.NoError(t, err)
	assert.True(t, allowed, "the generic gate must allow the resolver's deterministic fallback")
}

func TestNativeConsumerSettingRegistryContainsOnlyNewTypedBoundaries(t *testing.T) {
	expectedPaidDefaults := map[types.ConsumerScene][]string{
		types.ConsumerSceneRerank: {
			types.CheapestRerankModelID,
			"builtin-openrouter-rerank-nemotron-free",
			"builtin-openrouter-rerank-qwen3",
		},
		types.ConsumerSceneVision: {
			types.PlatformKnowledgeBaseVLMModelID,
			"builtin-openrouter-vlm-qwen-3-7-flash",
			"builtin-openrouter-vlm-gemma-4-free",
			"builtin-openrouter-vlm-gpt-astra",
			"builtin-openrouter-vlm-grok",
			"builtin-openrouter-vlm-kimi",
			"builtin-openrouter-vlm-gemini-flash",
		},
		types.ConsumerSceneASR: {
			types.PlatformKnowledgeBaseASRModelID,
			"builtin-openrouter-asr-whisper-turbo",
			"builtin-openrouter-asr-qwen-0-6b",
			"builtin-openrouter-asr-gpt-4o-mini",
		},
	}
	for _, scene := range []types.ConsumerScene{
		types.ConsumerSceneRerank,
		types.ConsumerSceneVision,
		types.ConsumerSceneASR,
	} {
		free, freeOK := registry[scene.FreeDefaultKey()]
		paid, paidOK := registry[scene.PaidOptionsKey()]
		require.True(t, freeOK, "missing free setting for %s", scene)
		require.True(t, paidOK, "missing paid setting for %s", scene)
		assert.Equal(t, "string", free.Type)
		assert.Equal(t, "string_list", paid.Type)
		assert.Equal(t, scene.CompatibilityDefaultID(), free.Default)
		defaults, ok := paid.Default.([]string)
		require.True(t, ok)
		assert.Equal(t, expectedPaidDefaults[scene], defaults)
		assert.Equal(
			t,
			scene.CompatibilityDefaultID(),
			defaults[0],
			"the compatibility model remains the paid default",
		)
	}
	assert.NotContains(t, registry, "consumer_models.embedding.free_default")
	assert.NotContains(t, registry, "consumer_models.embedding.paid_options")
}
