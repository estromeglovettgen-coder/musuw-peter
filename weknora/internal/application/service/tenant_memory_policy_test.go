package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestTenantUpdateLitePersistsCompleteMemoryConfig(t *testing.T) {
	previousEdition := configuredProductEdition
	SetProductEdition("lite")
	t.Cleanup(func() { SetProductEdition(previousEdition) })

	existingVectorRecall := true
	repo := &tenantLifecycleRepoStub{tenant: &types.Tenant{
		ID:   42,
		Name: "Personal",
		MemoryConfig: &types.MemoryConfig{
			Enabled:                   true,
			WriteMode:                 types.MemoryWriteExplicitOnly,
			ExtractModelID:            "old-extractor",
			MaxItems:                  200,
			ExtractDelaySeconds:       90,
			ExtractMinIntervalSeconds: 300,
			ExtractInstructions:       "old instructions",
			InterestThreshold:         3,
			EmbeddingModelID:          "old-embedding",
			VectorRecall:              &existingVectorRecall,
		},
	}}
	svc := newTenantService(repo, nil, &tenantLifecycleKeyManager{})
	vectorRecall := false
	retrievalConditioning := false

	updated, err := svc.UpdateTenant(context.Background(), &types.Tenant{
		ID:   42,
		Name: "Personal",
		MemoryConfig: &types.MemoryConfig{
			Enabled:                   true,
			WriteMode:                 types.MemoryWriteAuto,
			ExtractModelID:            "new-extractor",
			MaxItems:                  320,
			ExtractDelaySeconds:       60,
			ExtractMinIntervalSeconds: 180,
			ExtractInstructions:       "new instructions",
			InterestThreshold:         5,
			EmbeddingModelID:          "new-embedding",
			VectorRecall:              &vectorRecall,
			RetrievalConditioning:     &retrievalConditioning,
		},
	})

	require.NoError(t, err)
	require.NotNil(t, updated.MemoryConfig)
	require.Equal(t, "new-extractor", updated.MemoryConfig.ExtractModelID)
	require.Equal(t, 60, updated.MemoryConfig.ExtractDelaySeconds)
	require.Equal(t, 180, updated.MemoryConfig.ExtractMinIntervalSeconds)
	require.Equal(t, "new instructions", updated.MemoryConfig.ExtractInstructions)
	require.Equal(t, 5, updated.MemoryConfig.InterestThreshold)
	require.Equal(t, "new-embedding", updated.MemoryConfig.EmbeddingModelID)
	require.NotNil(t, updated.MemoryConfig.VectorRecall)
	require.False(t, *updated.MemoryConfig.VectorRecall)
}
