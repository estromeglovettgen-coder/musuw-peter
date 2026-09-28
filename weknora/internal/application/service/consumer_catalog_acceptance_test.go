package service

import (
	"os"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// Read the shipped catalog rather than manufacturing it from the policy being
// tested: admission must reach homepage/agent lists and every scene resolver.
func TestShippedConsumerCatalogReachesConversationScenes(t *testing.T) {
	raw, err := os.ReadFile("../../../config/builtin_models.yaml")
	require.NoError(t, err)
	var catalog struct {
		Models []types.BuiltinModelEntry `yaml:"builtin_models"`
	}
	require.NoError(t, yaml.Unmarshal(raw, &catalog))
	models := make([]*types.Model, 0, len(catalog.Models))
	var chatIDs []string
	for _, entry := range catalog.Models {
		if entry.Type == types.ModelTypeKnowledgeQA {
			chatIDs = append(chatIDs, entry.ID)
		}
		models = append(models, &types.Model{
			ID: entry.ID, Name: entry.Name,
			DisplayName: entry.DisplayName, Type: entry.Type, Source: entry.Source,
			Status: entry.Status, IsBuiltin: true, Parameters: entry.Parameters,
		})
	}
	resolver := NewConsumerModelResolver(
		&consumerSceneModelRepo{models: models}, registryConsumerSceneSettings{}, nil)
	scenes := []types.ConsumerScene{types.ConsumerSceneChat, types.ConsumerSceneRAG, types.ConsumerSceneWiki}
	for _, scene := range scenes {
		t.Run(string(scene), func(t *testing.T) {
			ctx := contextWithConsumerPlan(1, types.ConsumerPlanPlus)
			options, err := resolver.ListConsumerModelOptions(ctx, scene)
			require.NoError(t, err)
			byID := map[string]*types.ConsumerModelOption{}
			for _, option := range options {
				byID[option.ModelID] = option
			}
			assert.NotContains(t, byID, "builtin-openrouter-qwen-flash",
				"Qwen 3.8 Flash repeatedly timed out at minimum reasoning in staging")
			var optionIDs []string
			for id := range byID {
				optionIDs = append(optionIDs, id)
			}
			assert.ElementsMatch(t, chatIDs, optionIDs,
				"all shipped conversation models must reach each scene")
			newIDs := []string{
				"builtin-openrouter-gpt-astra", "builtin-openrouter-grok", "builtin-openrouter-kimi",
			}
			for _, id := range newIDs {
				require.Contains(t, byID, id, "new model must reach scene options")
				require.True(t, byID[id].Selectable)
				model, err := resolver.ResolveConsumerModel(ctx, scene, id)
				require.NoError(t, err)
				require.Equal(t, id, model.ID)
				freeCtx := contextWithConsumerPlan(1, types.ConsumerPlanFree)
				_, err = resolver.ResolveConsumerModel(freeCtx, scene, id)
				require.Error(t, err, "catalog refresh must retain Free authorization")
			}
			saved, err := resolver.ResolveConsumerModel(ctx, scene, "builtin-openrouter-minimax-m3-free")
			require.NoError(t, err)
			assert.Equal(t, "minimax/minimax-m3", saved.Name,
				"saved MiniMax selection must reach the available paid endpoint")
			assert.NotContains(t, saved.DisplayName, "Free")
		})
	}
}
