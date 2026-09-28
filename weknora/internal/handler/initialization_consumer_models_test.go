package handler

import (
	"context"
	"testing"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type initializationConsumerResolverStub struct {
	models map[types.ConsumerScene]*types.Model
	calls  []types.ConsumerScene
	err    error
}

func (r *initializationConsumerResolverStub) ResolveConsumerModel(
	_ context.Context,
	scene types.ConsumerScene,
	_ string,
) (*types.Model, error) {
	r.calls = append(r.calls, scene)
	if r.err != nil {
		return nil, r.err
	}
	return r.models[scene], nil
}

func (r *initializationConsumerResolverStub) ListConsumerModelOptions(
	context.Context,
	types.ConsumerScene,
) ([]*types.ConsumerModelOption, error) {
	return nil, nil
}

func (r *initializationConsumerResolverStub) AllowsFreeConsumerModel(
	context.Context,
	*types.Model,
) (bool, error) {
	return false, nil
}

func TestResolveConsumerKBConfigModelsUsesNativeLiteScenes(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	resolver := &initializationConsumerResolverStub{models: map[types.ConsumerScene]*types.Model{
		types.ConsumerSceneRAG:    {ID: "resolved-rag", Type: types.ModelTypeKnowledgeQA},
		types.ConsumerSceneVision: {ID: "resolved-vision", Type: types.ModelTypeVLLM},
		types.ConsumerSceneASR:    {ID: "resolved-asr", Type: types.ModelTypeASR},
	}}
	h := &InitializationHandler{consumerModelResolver: resolver}
	req := &KBModelConfigRequest{
		LLMModelID: "legacy-rag",
		VLMConfig:  &types.VLMConfig{Enabled: true, ModelID: "legacy-vision"},
		ASRConfig:  &types.ASRConfig{Enabled: true, ModelID: "legacy-asr"},
	}
	req.Multimodal.Enabled = true

	require.NoError(t, h.resolveConsumerKBConfigModels(context.Background(), req))
	require.Equal(t, "resolved-rag", req.LLMModelID)
	require.Equal(t, "resolved-vision", req.VLMConfig.ModelID)
	require.Equal(t, "resolved-asr", req.ASRConfig.ModelID)
	require.Equal(t, []types.ConsumerScene{
		types.ConsumerSceneRAG,
		types.ConsumerSceneVision,
		types.ConsumerSceneASR,
	}, resolver.calls)
}

func TestResolveConsumerKBConfigModelsPreservesStandardAuthority(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })

	resolver := &initializationConsumerResolverStub{}
	h := &InitializationHandler{consumerModelResolver: resolver}
	req := &KBModelConfigRequest{LLMModelID: "standard-rag"}

	require.NoError(t, h.resolveConsumerKBConfigModels(context.Background(), req))
	require.Equal(t, "standard-rag", req.LLMModelID)
	require.Empty(t, resolver.calls)
}

func TestResolveConsumerKBConfigModelsPreservesLitePolicyDenial(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	denied := apperrors.NewForbiddenError("this model requires a paid plan")
	resolver := &initializationConsumerResolverStub{err: denied}
	h := &InitializationHandler{consumerModelResolver: resolver}
	req := &KBModelConfigRequest{LLMModelID: "locked-rag"}

	err := h.resolveConsumerKBConfigModels(context.Background(), req)
	require.Same(t, denied, err)
	require.Equal(t, "locked-rag", req.LLMModelID)
	require.Equal(t, []types.ConsumerScene{types.ConsumerSceneRAG}, resolver.calls)
}
