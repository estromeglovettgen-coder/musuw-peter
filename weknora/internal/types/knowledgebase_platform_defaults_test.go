package types

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestApplyPlatformKnowledgeBaseDefaultsEnablesZeroConfigDocumentFeatures(t *testing.T) {
	kb := &KnowledgeBase{Name: "research"}

	kb.ApplyPlatformKnowledgeBaseDefaults()

	require.Equal(t, KnowledgeBaseTypeDocument, kb.Type)
	require.Equal(t, PlatformKnowledgeBaseChatModelID, kb.SummaryModelID)
	require.Equal(t, PlatformKnowledgeBaseEmbeddingModelID, kb.EmbeddingModelID)
	require.Equal(t, PlatformKnowledgeBaseVLMModelID, kb.ImageProcessingConfig.ModelID)
	require.Equal(t, VLMConfig{Enabled: true, ModelID: PlatformKnowledgeBaseVLMModelID}, kb.VLMConfig)
	require.Equal(t, ASRConfig{Enabled: true, ModelID: PlatformKnowledgeBaseASRModelID}, kb.ASRConfig)
	require.Equal(t, IndexingStrategy{
		VectorEnabled: true, KeywordEnabled: true, WikiEnabled: true, GraphEnabled: true,
	}, kb.IndexingStrategy)
	require.NotNil(t, kb.ExtractConfig)
	require.True(t, kb.ExtractConfig.Enabled)
	require.NotEmpty(t, kb.ExtractConfig.Tags)
	require.NotEmpty(t, kb.ExtractConfig.Nodes)
	require.NotEmpty(t, kb.ExtractConfig.Relations)
	require.NotNil(t, kb.WikiConfig)
	require.Equal(t, PlatformKnowledgeBaseChatModelID, kb.WikiConfig.SynthesisModelID)
}

func TestApplyPlatformKnowledgeBaseDefaultsDoesNotTurnFAQIntoDocument(t *testing.T) {
	kb := &KnowledgeBase{Type: KnowledgeBaseTypeFAQ}

	kb.ApplyPlatformKnowledgeBaseDefaults()

	require.Equal(t, KnowledgeBaseTypeFAQ, kb.Type)
	require.False(t, kb.IndexingStrategy.WikiEnabled)
	require.False(t, kb.IndexingStrategy.GraphEnabled)
}

func TestApplyPlatformKnowledgeBaseDefaultsPreservesExplicitConsumerIndexingAndWikiChoices(t *testing.T) {
	kb := &KnowledgeBase{
		Type: KnowledgeBaseTypeDocument,
		IndexingStrategy: IndexingStrategy{
			VectorEnabled:  false,
			KeywordEnabled: false,
			WikiEnabled:    true,
			GraphEnabled:   true,
		},
		WikiConfig: &WikiConfig{
			ExtractionGranularity:  WikiExtractionFocused,
			ContentInstructions:    "Use a concise editorial style.",
			ExtractionInstructions: "Prioritize products and versions.",
		},
	}

	kb.ApplyPlatformKnowledgeBaseDefaults()

	require.False(t, kb.IndexingStrategy.VectorEnabled)
	require.False(t, kb.IndexingStrategy.KeywordEnabled)
	require.True(t, kb.IndexingStrategy.WikiEnabled)
	require.True(t, kb.IndexingStrategy.GraphEnabled)
	require.Equal(t, WikiExtractionFocused, kb.WikiConfig.ExtractionGranularity)
	require.Equal(t, "Use a concise editorial style.", kb.WikiConfig.ContentInstructions)
	require.Equal(t, "Prioritize products and versions.", kb.WikiConfig.ExtractionInstructions)
	require.Equal(t, PlatformKnowledgeBaseChatModelID, kb.WikiConfig.SynthesisModelID)
}
