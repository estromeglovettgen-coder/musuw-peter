package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type consumerSceneModelRepo struct {
	interfaces.ModelRepository
	models []*types.Model
}

func (r *consumerSceneModelRepo) List(context.Context, uint64, types.ModelType, types.ModelSource) ([]*types.Model, error) {
	return append([]*types.Model(nil), r.models...), nil
}

func (r *consumerSceneModelRepo) GetByID(_ context.Context, _ uint64, id string) (*types.Model, error) {
	for _, model := range r.models {
		if model != nil && model.ID == id {
			return model, nil
		}
	}
	return nil, nil
}

type consumerSceneSettings struct {
	interfaces.SystemSettingService
	rows map[string]*types.SystemSetting
}

func (s *consumerSceneSettings) Get(_ context.Context, key string) (*types.SystemSetting, error) {
	return s.rows[key], nil
}

type consumerSceneResolverEntitlement struct {
	interfaces.EntitlementService
	plan types.ConsumerPlan
}

func (s *consumerSceneResolverEntitlement) Current(context.Context, time.Time) (*types.ConsumerEntitlement, error) {
	return &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(s.plan)}, nil
}

func sceneSettingString(key, value string) *types.SystemSetting {
	raw, _ := json.Marshal(value)
	return &types.SystemSetting{Key: key, ValueType: "string", Value: raw}
}

func sceneSettingList(key string, value []string) *types.SystemSetting {
	raw, _ := json.Marshal(value)
	return &types.SystemSetting{Key: key, ValueType: "string_list", Value: raw}
}

func consumerSceneModel(id, display string) *types.Model {
	return &types.Model{
		ID:          id,
		DisplayName: display,
		Type:        types.ModelTypeKnowledgeQA,
		Status:      types.ModelStatusActive,
		IsBuiltin:   true,
		Source:      types.ModelSourceRemote,
		Parameters:  types.ModelParameters{Provider: "openrouter", BaseURL: provider.OpenRouterBaseURL},
	}
}

func consumerSceneVLMModel(id, display string) *types.Model {
	model := consumerSceneModel(id, display)
	model.Type = types.ModelTypeVLLM
	model.Parameters.SupportsVision = true
	return model
}

func TestConsumerModelResolverFreeAndPaidOptions(t *testing.T) {
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	qwen := consumerSceneModel("builtin-openrouter-qwen-max", "Qwen")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		"consumer_models.chat.free_default": sceneSettingString("consumer_models.chat.free_default", flash.ID),
		"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{pro.ID, qwen.ID}),
	}}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: []*types.Model{flash, pro, qwen}},
		settings,
		nil,
	)
	ctx := contextWithConsumerPlan(1, types.ConsumerPlanFree)

	resolved, err := resolver.ResolveConsumerModel(ctx, types.ConsumerSceneChat, "")
	require.NoError(t, err)
	require.NotNil(t, resolved)
	assert.Equal(t, flash.ID, resolved.ID)

	_, err = resolver.ResolveConsumerModel(ctx, types.ConsumerSceneChat, pro.ID)
	var forbidden *apperrors.AppError
	require.ErrorAs(t, err, &forbidden)
	assert.Equal(t, apperrors.ErrForbidden, forbidden.Code)

	options, err := resolver.ListConsumerModelOptions(ctx, types.ConsumerSceneChat)
	require.NoError(t, err)
	require.Len(t, options, 3)
	assert.Equal(t, flash.ID, options[0].ModelID)
	assert.True(t, options[0].Selectable)
	assert.True(t, options[0].Effective)
	assert.True(t, options[0].SceneDefault)
	assert.True(t, options[1].Locked)
	assert.False(t, options[1].Selectable)

	paidCtx := contextWithConsumerPlan(1, types.ConsumerPlanPlus)
	resolved, err = resolver.ResolveConsumerModel(paidCtx, types.ConsumerSceneChat, qwen.ID)
	require.NoError(t, err)
	assert.Equal(t, qwen.ID, resolved.ID)
	resolved, err = resolver.ResolveConsumerModel(paidCtx, types.ConsumerSceneChat, "")
	require.NoError(t, err)
	assert.Equal(t, pro.ID, resolved.ID)
}

func TestConsumerModelResolverInvalidPolicyUsesCompatibilityDefault(t *testing.T) {
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		// Wrong value type makes the complete scene policy invalid.
		"consumer_models.chat.free_default": sceneSettingList("consumer_models.chat.free_default", []string{flash.ID}),
		"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{pro.ID}),
	}}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: []*types.Model{flash, pro}},
		settings,
		nil,
	)
	ctx := contextWithConsumerPlan(1, types.ConsumerPlanPlus)

	resolved, err := resolver.ResolveConsumerModel(ctx, types.ConsumerSceneChat, pro.ID)
	require.NoError(t, err)
	require.NotNil(t, resolved)
	assert.Equal(t, types.PlatformKnowledgeBaseChatModelID, resolved.ID)
}

func TestConsumerSceneSettingRegistry(t *testing.T) {
	for _, scene := range types.ConsumerScenes() {
		free := registry[scene.FreeDefaultKey()]
		paid := registry[scene.PaidOptionsKey()]
		assert.Equal(t, "string", free.Type)
		assert.Equal(t, "string_list", paid.Type)
		assert.Equal(t, scene.CompatibilityDefaultID(), free.Default)
		defaults, ok := paid.Default.([]string)
		require.True(t, ok)
		require.NotEmpty(t, defaults)
		assert.Equal(t, scene.CompatibilityDefaultID(), defaults[0])
	}
}

type registryConsumerSceneSettings struct {
	interfaces.SystemSettingService
}

func (registryConsumerSceneSettings) Get(_ context.Context, key string) (*types.SystemSetting, error) {
	spec, ok := registry[key]
	if !ok {
		return nil, nil
	}
	raw, err := json.Marshal(spec.Default)
	if err != nil {
		return nil, err
	}
	return &types.SystemSetting{Key: key, ValueType: spec.Type, Value: raw}, nil
}

func TestConsumerModelResolverRegistryDefaultsRemainValidAndDeduplicated(t *testing.T) {
	ids := defaultConsumerPaidModelIDs()
	models := make([]*types.Model, 0, len(ids))
	for _, id := range ids {
		models = append(models, consumerSceneModel(id, id))
	}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: models},
		registryConsumerSceneSettings{},
		nil,
	)

	ctx := contextWithConsumerPlan(1, types.ConsumerPlanPlus)
	resolved, err := resolver.ResolveConsumerModel(ctx, types.ConsumerSceneChat, "")
	require.NoError(t, err)
	assert.Equal(t, types.CheapestChatModelID, resolved.ID)

	freeOptions, err := resolver.ListConsumerModelOptions(contextWithConsumerPlan(1, types.ConsumerPlanFree), types.ConsumerSceneChat)
	require.NoError(t, err)
	assert.Len(t, freeOptions, len(ids), "the Free default appearing in paid options is shown once")
	seen := make(map[string]struct{}, len(freeOptions))
	for _, option := range freeOptions {
		_, duplicate := seen[option.ModelID]
		assert.False(t, duplicate)
		seen[option.ModelID] = struct{}{}
	}
}

func TestConsumerVisionRegistryUsesGeminiForStillImagesOnEveryPlan(t *testing.T) {
	visionIDs := defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM)
	models := make([]*types.Model, 0, len(visionIDs))
	for _, id := range visionIDs {
		models = append(models, consumerSceneVLMModel(id, id))
	}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: models},
		registryConsumerSceneSettings{},
		nil,
	)

	free, err := resolver.ResolveConsumerModel(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		types.ConsumerSceneVision,
		"",
	)
	require.NoError(t, err)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, free.ID,
		"Free keeps the existing Gemini/Vertex compatibility model")

	paid, err := resolver.ResolveConsumerModel(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		types.ConsumerSceneVision,
		"",
	)
	require.NoError(t, err)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, paid.ID,
		"paid still-image analysis must not select the URL-video model")

	options, err := resolver.ListConsumerModelOptions(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		types.ConsumerSceneVision,
	)
	require.NoError(t, err)
	require.NotEmpty(t, options)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, options[0].ModelID)
	assert.True(t, options[0].SceneDefault)
	assert.True(t, options[0].Effective)
	for _, option := range options {
		assert.NotEqual(t, legacyMiMoVideoModelID, option.ModelID,
			"the legacy MiMo video model must not appear in still-image choices")
	}
}

func TestConsumerVisionPersistedPolicyRemainsAnExplicitOverride(t *testing.T) {
	visionIDs := defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM)
	models := make([]*types.Model, 0, len(visionIDs))
	for _, id := range visionIDs {
		models = append(models, consumerSceneVLMModel(id, id))
	}
	// A persisted policy row is intentionally authoritative. This models an
	// existing deployment that explicitly kept Gemini first; changing the
	// registry default must not silently rewrite that operator choice.
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneVision.FreeDefaultKey(): sceneSettingString(
			types.ConsumerSceneVision.FreeDefaultKey(), types.PlatformKnowledgeBaseVLMModelID),
		types.ConsumerSceneVision.PaidOptionsKey(): sceneSettingList(
			types.ConsumerSceneVision.PaidOptionsKey(),
			[]string{
				types.PlatformKnowledgeBaseVLMModelID,
				"builtin-openrouter-vlm-gpt-astra",
			},
		),
	}}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: models},
		settings,
		nil,
	)

	paid, err := resolver.ResolveConsumerModel(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		types.ConsumerSceneVision,
		"",
	)
	require.NoError(t, err)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, paid.ID,
		"persisted settings remain authoritative until an operator resets/updates them")
}

func TestConsumerVisionIgnoresPersistedVideoModelEntry(t *testing.T) {
	visionIDs := append(defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM), legacyMiMoVideoModelID)
	models := make([]*types.Model, 0, len(visionIDs))
	for _, id := range visionIDs {
		models = append(models, consumerSceneVLMModel(id, id))
	}
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneVision.FreeDefaultKey(): sceneSettingString(
			types.ConsumerSceneVision.FreeDefaultKey(), types.PlatformKnowledgeBaseVLMModelID),
		types.ConsumerSceneVision.PaidOptionsKey(): sceneSettingList(
			types.ConsumerSceneVision.PaidOptionsKey(),
			[]string{legacyMiMoVideoModelID, types.PlatformKnowledgeBaseVLMModelID},
		),
	}}
	resolver := NewConsumerModelResolver(&consumerSceneModelRepo{models: models}, settings, nil)

	paid, err := resolver.ResolveConsumerModel(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus), types.ConsumerSceneVision, "")
	require.NoError(t, err)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, paid.ID)
}

func TestConsumerVisionRepairsPersistedVideoModelFreeDefault(t *testing.T) {
	gemini := consumerSceneVLMModel(types.PlatformKnowledgeBaseVLMModelID, "Gemini")
	mimo := consumerSceneVLMModel(legacyMiMoVideoModelID, "MiMo")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		types.ConsumerSceneVision.FreeDefaultKey(): sceneSettingString(
			types.ConsumerSceneVision.FreeDefaultKey(), legacyMiMoVideoModelID),
		types.ConsumerSceneVision.PaidOptionsKey(): sceneSettingList(
			types.ConsumerSceneVision.PaidOptionsKey(),
			[]string{legacyMiMoVideoModelID, types.PlatformKnowledgeBaseVLMModelID},
		),
	}}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: []*types.Model{gemini, mimo}}, settings, nil)

	free, err := resolver.ResolveConsumerModel(
		contextWithConsumerPlan(1, types.ConsumerPlanFree), types.ConsumerSceneVision, "")
	require.NoError(t, err)
	assert.Equal(t, types.PlatformKnowledgeBaseVLMModelID, free.ID)
}

func TestConsumerModelPolicyDefaultsExposeExpandedOpenRouterCatalog(t *testing.T) {
	assert.Subset(t, defaultConsumerPaidModelIDs(), []string{
		"builtin-openrouter-nemotron-lightning-free",
		"builtin-openrouter-glm-5-2-free",
		"builtin-openrouter-minimax-m3-free",
		"builtin-openrouter-ling-flash",
		"builtin-openrouter-qwen-3-7-flash",
		"builtin-openrouter-gpt-5-nano",
	})
	assert.Subset(t, defaultConsumerPaidModelIDsForType(types.ModelTypeRerank), []string{
		"builtin-openrouter-rerank-nemotron-free",
		"builtin-openrouter-rerank-qwen3",
	})
	assert.Subset(t, defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM), []string{
		"builtin-openrouter-vlm-gpt-astra",
		"builtin-openrouter-vlm-qwen-3-7-flash",
		"builtin-openrouter-vlm-gemma-4-free",
	})
	assert.Contains(t, defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM), defaultVideoModelID)
	assert.NotContains(t, defaultConsumerPaidModelIDsForType(types.ModelTypeVLLM), legacyMiMoVideoModelID)
	assert.Subset(t, defaultConsumerPaidModelIDsForType(types.ModelTypeASR), []string{
		"builtin-openrouter-asr-whisper-turbo",
		"builtin-openrouter-asr-qwen-0-6b",
		"builtin-openrouter-asr-gpt-4o-mini",
	})
}

func TestConsumerModelResolverInvalidPolicyNeverExpandsPaidCatalog(t *testing.T) {
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	cases := []struct {
		name    string
		freeRow *types.SystemSetting
		paidIDs []string
	}{
		{name: "missing paid row", freeRow: sceneSettingString("consumer_models.chat.free_default", flash.ID)},
		{name: "wrong free type", freeRow: sceneSettingList("consumer_models.chat.free_default", []string{flash.ID}), paidIDs: []string{pro.ID}},
		{name: "stale paid id", freeRow: sceneSettingString("consumer_models.chat.free_default", flash.ID), paidIDs: []string{pro.ID, "stale-model"}},
		{name: "duplicate paid id", freeRow: sceneSettingString("consumer_models.chat.free_default", flash.ID), paidIDs: []string{pro.ID, pro.ID}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows := map[string]*types.SystemSetting{"consumer_models.chat.free_default": tc.freeRow}
			if tc.paidIDs != nil {
				rows["consumer_models.chat.paid_options"] = sceneSettingList("consumer_models.chat.paid_options", tc.paidIDs)
			}
			resolver := NewConsumerModelResolver(
				&consumerSceneModelRepo{models: []*types.Model{flash, pro}},
				&consumerSceneSettings{rows: rows},
				nil,
			)
			resolved, err := resolver.ResolveConsumerModel(contextWithConsumerPlan(1, types.ConsumerPlanPlus), types.ConsumerSceneChat, pro.ID)
			require.NoError(t, err)
			assert.Equal(t, flash.ID, resolved.ID)
		})
	}
}

func TestConsumerModelResolverRejectsUnsafeCatalogRows(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*types.Model)
	}{
		{name: "disabled", mutate: func(model *types.Model) { model.Status = types.ModelStatusDownloading }},
		{name: "nonbuiltin", mutate: func(model *types.Model) { model.IsBuiltin = false }},
		{name: "non-openrouter", mutate: func(model *types.Model) { model.Parameters.Provider = "openai" }},
		{name: "local source", mutate: func(model *types.Model) { model.Source = types.ModelSourceLocal }},
		{name: "non-openrouter endpoint", mutate: func(model *types.Model) {
			model.Source = types.ModelSourceRemote
			model.Parameters.BaseURL = "https://api.openai.com/v1"
		}},
		{name: "wrong type", mutate: func(model *types.Model) { model.Type = types.ModelTypeEmbedding }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
			unsafeModel := consumerSceneModel("unsafe-model", "Unsafe")
			tc.mutate(unsafeModel)
			settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
				"consumer_models.chat.free_default": sceneSettingString("consumer_models.chat.free_default", flash.ID),
				"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{unsafeModel.ID}),
			}}
			resolver := NewConsumerModelResolver(
				&consumerSceneModelRepo{models: []*types.Model{flash, unsafeModel}},
				settings,
				nil,
			)
			resolved, err := resolver.ResolveConsumerModel(contextWithConsumerPlan(1, types.ConsumerPlanPlus), types.ConsumerSceneChat, unsafeModel.ID)
			require.NoError(t, err)
			assert.Equal(t, flash.ID, resolved.ID)
		})
	}
}

func TestConsumerModelResolverCrossSceneCandidateIsRejected(t *testing.T) {
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	qwen := consumerSceneModel("builtin-openrouter-qwen-max", "Qwen")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		"consumer_models.chat.free_default": sceneSettingString("consumer_models.chat.free_default", flash.ID),
		"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{pro.ID}),
		"consumer_models.rag.free_default":  sceneSettingString("consumer_models.rag.free_default", qwen.ID),
		"consumer_models.rag.paid_options":  sceneSettingList("consumer_models.rag.paid_options", []string{pro.ID}),
	}}
	resolver := NewConsumerModelResolver(&consumerSceneModelRepo{models: []*types.Model{flash, pro, qwen}}, settings, nil)

	for _, plan := range []types.ConsumerPlan{types.ConsumerPlanFree, types.ConsumerPlanPlus} {
		_, err := resolver.ResolveConsumerModel(contextWithConsumerPlan(1, plan), types.ConsumerSceneChat, qwen.ID)
		var forbidden *apperrors.AppError
		require.ErrorAs(t, err, &forbidden)
		assert.Equal(t, apperrors.ErrForbidden, forbidden.Code)
	}
}

func TestConsumerModelResolverUsesEntitlementWhenPlanContextIsAbsent(t *testing.T) {
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		"consumer_models.chat.free_default": sceneSettingString("consumer_models.chat.free_default", flash.ID),
		"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{pro.ID}),
	}}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: []*types.Model{flash, pro}},
		settings,
		&consumerSceneResolverEntitlement{plan: types.ConsumerPlanPlus},
	)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	resolved, err := resolver.ResolveConsumerModel(ctx, types.ConsumerSceneChat, pro.ID)
	require.NoError(t, err)
	assert.Equal(t, pro.ID, resolved.ID)
}

func TestFreeGenericGateAllowsConfiguredSceneDefaultUnionOnly(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	qwen := consumerSceneModel("builtin-openrouter-qwen-max", "Qwen")
	settings := &consumerSceneSettings{rows: map[string]*types.SystemSetting{
		"consumer_models.chat.free_default": sceneSettingString("consumer_models.chat.free_default", flash.ID),
		"consumer_models.chat.paid_options": sceneSettingList("consumer_models.chat.paid_options", []string{pro.ID}),
		"consumer_models.rag.free_default":  sceneSettingString("consumer_models.rag.free_default", qwen.ID),
		"consumer_models.rag.paid_options":  sceneSettingList("consumer_models.rag.paid_options", []string{pro.ID}),
		"consumer_models.wiki.free_default": sceneSettingString("consumer_models.wiki.free_default", flash.ID),
		"consumer_models.wiki.paid_options": sceneSettingList("consumer_models.wiki.paid_options", []string{pro.ID}),
	}}
	repo := &consumerSceneModelRepo{models: []*types.Model{flash, pro, qwen}}
	resolver := NewConsumerModelResolver(repo, settings, nil)
	svc := NewModelServiceWithConsumerResolver(
		repo, nil, nil, nil, nil, nil,
		&consumerSceneResolverEntitlement{plan: types.ConsumerPlanFree},
		resolver,
	)
	ctx := contextWithConsumerPlan(1, types.ConsumerPlanFree)

	models, err := svc.ListModels(ctx)
	require.NoError(t, err)
	require.Len(t, models, 2)
	assert.ElementsMatch(t, []string{flash.ID, qwen.ID}, []string{models[0].ID, models[1].ID})
	allowed, allowErr := resolver.AllowsFreeConsumerModel(ctx, qwen)
	require.NoError(t, allowErr)
	assert.True(t, allowed)
	_, err = svc.GetModelByID(ctx, qwen.ID)
	require.NoError(t, err)
	_, err = svc.GetModelByID(ctx, pro.ID)
	var forbidden *apperrors.AppError
	require.ErrorAs(t, err, &forbidden)
	assert.Equal(t, apperrors.ErrForbidden, forbidden.Code)
}
