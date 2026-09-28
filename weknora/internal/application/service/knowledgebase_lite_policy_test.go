package service

import (
	"reflect"
	"testing"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestLiteUpdateKnowledgeBasePreservesHiddenConfigAndAppliesVisibleSettings(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	existing := &types.KnowledgeBase{
		ID:                    "kb-lite",
		Name:                  "before",
		Type:                  types.KnowledgeBaseTypeDocument,
		TenantID:              1,
		ChunkingConfig:        types.ChunkingConfig{ChunkSize: 512, Strategy: "auto"},
		ImageProcessingConfig: types.ImageProcessingConfig{ModelID: "platform-image"},
		WikiConfig: &types.WikiConfig{
			SynthesisModelID:       "platform-wiki",
			MaxPagesPerIngest:      12,
			ExtractionGranularity:  types.WikiExtractionStandard,
			ContentInstructions:    "before content",
			ExtractionInstructions: "before extraction",
			IngestBatchSize:        5,
		},
		AutoTagConfig: &types.AutoTagConfig{Enabled: false},
		IndexingStrategy: types.IndexingStrategy{
			VectorEnabled: true, KeywordEnabled: true, WikiEnabled: true, GraphEnabled: true,
		},
		ExtractConfig: &types.ExtractConfig{Enabled: true, Text: "platform graph"},
	}
	repo.rows[existing.ID] = existing
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})

	updated, err := svc.UpdateKnowledgeBase(ctxWithTenant(1), existing.ID, "after", "visible description", &types.KnowledgeBaseConfig{
		ChunkingConfig:        types.ChunkingConfig{ChunkSize: 9999, Strategy: "forged"},
		ImageProcessingConfig: types.ImageProcessingConfig{ModelID: "forged-image"},
		WikiConfig: &types.WikiConfig{
			SynthesisModelID:       "forged-wiki",
			MaxPagesPerIngest:      999,
			ExtractionGranularity:  types.WikiExtractionFocused,
			ContentInstructions:    "after content",
			ExtractionInstructions: "after extraction",
			IngestBatchSize:        999,
		},
		AutoTagConfig: &types.AutoTagConfig{Enabled: true, ModelID: "forged-tag", MaxTags: 99},
		IndexingStrategy: &types.IndexingStrategy{
			VectorEnabled: false, KeywordEnabled: true, WikiEnabled: false, GraphEnabled: false,
		},
	})

	require.NoError(t, err)
	require.Equal(t, "after", updated.Name)
	require.Equal(t, "visible description", updated.Description)
	require.Equal(t, types.ChunkingConfig{ChunkSize: 512, Strategy: "auto"}, updated.ChunkingConfig)
	require.Equal(t, types.ImageProcessingConfig{ModelID: "platform-image"}, updated.ImageProcessingConfig)
	require.Equal(t, "platform-wiki", updated.WikiConfig.SynthesisModelID)
	require.Equal(t, 12, updated.WikiConfig.MaxPagesPerIngest)
	require.Equal(t, 5, updated.WikiConfig.IngestBatchSize)
	require.Equal(t, types.WikiExtractionFocused, updated.WikiConfig.ExtractionGranularity)
	require.Equal(t, "after content", updated.WikiConfig.ContentInstructions)
	require.Equal(t, "after extraction", updated.WikiConfig.ExtractionInstructions)
	require.True(t, updated.AutoTagConfig.Enabled)
	require.Equal(t, types.CheapestChatModelID, updated.AutoTagConfig.ModelID)
	require.Equal(t, types.DefaultAutoTagMaxTags, updated.AutoTagConfig.MaxTags)
	require.True(t, updated.IndexingStrategy.KeywordEnabled)
	require.False(t, updated.IndexingStrategy.VectorEnabled)
	require.False(t, updated.IndexingStrategy.WikiEnabled)
	require.True(t, updated.IndexingStrategy.GraphEnabled, "hidden graph setting must remain unchanged")
	require.True(t, reflect.DeepEqual(&types.ExtractConfig{Enabled: true, Text: "platform graph"}, updated.ExtractConfig))
}

func TestStandardUpdateKnowledgeBasePreservesNativeConfigAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	existing := &types.KnowledgeBase{ID: "kb-standard", Type: types.KnowledgeBaseTypeDocument, TenantID: 1}
	repo.rows[existing.ID] = existing
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})

	config := &types.KnowledgeBaseConfig{
		ChunkingConfig:        types.ChunkingConfig{ChunkSize: 2048, Strategy: "heading"},
		ImageProcessingConfig: types.ImageProcessingConfig{ModelID: "standard-image"},
		WikiConfig:            &types.WikiConfig{SynthesisModelID: "standard-wiki", IngestBatchSize: 8},
		IndexingStrategy:      &types.IndexingStrategy{GraphEnabled: true},
	}
	updated, err := svc.UpdateKnowledgeBase(ctxWithTenant(1), existing.ID, "standard", "", config)

	require.NoError(t, err)
	require.Equal(t, config.ChunkingConfig, updated.ChunkingConfig)
	require.Equal(t, config.ImageProcessingConfig, updated.ImageProcessingConfig)
	require.Equal(t, config.WikiConfig, updated.WikiConfig)
	require.True(t, updated.IndexingStrategy.GraphEnabled)
}

func TestLiteRejectsFAQKnowledgeBaseCreationAndCopies(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})
	ctx := ctxWithTenant(1)

	for _, kbType := range []string{types.KnowledgeBaseTypeFAQ, types.KnowledgeBaseTypeWiki, "unsupported"} {
		_, err := svc.CreateKnowledgeBase(ctx, &types.KnowledgeBase{
			Name: "hidden-" + kbType,
			Type: kbType,
		})
		require.ErrorContains(t, err, "document", "Lite must reject every non-document KB type")
	}

	repo.rows["faq-source"] = &types.KnowledgeBase{
		ID:       "faq-source",
		Name:     "faq source",
		Type:     types.KnowledgeBaseTypeFAQ,
		TenantID: 1,
	}
	_, _, err := svc.CopyKnowledgeBase(ctx, "faq-source", "")
	require.ErrorContains(t, err, "document")

	_, err = svc.DuplicateKnowledgeBase(ctx, "faq-source")
	require.ErrorContains(t, err, "document")
}

func TestLiteCreateKnowledgeBaseForcesAutoTagPolicy(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})
	skip := false
	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name: "documents",
		Type: types.KnowledgeBaseTypeDocument,
		AutoTagConfig: &types.AutoTagConfig{
			Enabled:      true,
			ModelID:      "tenant-selected-model",
			MaxTags:      10,
			SkipIfTagged: &skip,
		},
	})
	require.NoError(t, err)
	require.NotNil(t, kb.AutoTagConfig)
	require.Equal(t, types.CheapestChatModelID, kb.AutoTagConfig.ModelID)
	require.Equal(t, types.DefaultAutoTagMaxTags, kb.AutoTagConfig.MaxTags)
	require.True(t, kb.AutoTagConfig.ShouldSkipIfTagged())
}

func TestStandardCreateKnowledgeBasePreservesAutoTagPolicy(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})
	skip := false
	kb, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name: "documents",
		Type: types.KnowledgeBaseTypeDocument,
		AutoTagConfig: &types.AutoTagConfig{
			Enabled:      true,
			ModelID:      "tenant-selected-model",
			MaxTags:      10,
			SkipIfTagged: &skip,
		},
	})
	require.NoError(t, err)
	require.NotNil(t, kb.AutoTagConfig)
	require.Equal(t, "tenant-selected-model", kb.AutoTagConfig.ModelID)
	require.Equal(t, 10, kb.AutoTagConfig.MaxTags)
	require.False(t, kb.AutoTagConfig.ShouldSkipIfTagged())
}

func TestLiteKnowledgeBaseListFilterHidesLegacyFAQRows(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	doc := &types.KnowledgeBase{ID: "doc", Type: types.KnowledgeBaseTypeDocument}
	faq := &types.KnowledgeBase{ID: "faq", Type: types.KnowledgeBaseTypeFAQ}
	got := filterLiteKnowledgeBases([]*types.KnowledgeBase{faq, doc})
	require.Equal(t, []*types.KnowledgeBase{doc}, got)
}

func TestLiteKnowledgeBaseListFilterDropsUnloadedRows(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	doc := &types.KnowledgeBase{ID: "doc", Type: types.KnowledgeBaseTypeDocument}
	got := filterLiteKnowledgeBases([]*types.KnowledgeBase{nil, doc})
	require.Equal(t, []*types.KnowledgeBase{doc}, got)
}

func TestStandardKnowledgeBaseListFilterPreservesFAQRows(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	faq := &types.KnowledgeBase{ID: "faq", Type: types.KnowledgeBaseTypeFAQ}
	got := filterLiteKnowledgeBases([]*types.KnowledgeBase{faq})
	require.Equal(t, []*types.KnowledgeBase{faq}, got)
}

func TestLiteKnowledgeBaseLookupsHideLegacyFAQRowsAsNotFound(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := newFakeKBRepo()
	repo.rows["faq"] = &types.KnowledgeBase{ID: "faq", Type: types.KnowledgeBaseTypeFAQ, TenantID: 1}
	repo.rows["doc"] = &types.KnowledgeBase{ID: "doc", Type: types.KnowledgeBaseTypeDocument, TenantID: 1}
	svc := newPR3KBService(repo, &fakeRegistry{}, &fakeOwnership{})

	_, err := svc.GetKnowledgeBaseByID(ctxWithTenant(1), "faq")
	require.ErrorIs(t, err, apprepo.ErrKnowledgeBaseNotFound)
	_, err = svc.GetKnowledgeBaseByIDOnly(ctxWithTenant(1), "faq")
	require.ErrorIs(t, err, apprepo.ErrKnowledgeBaseNotFound)

	got, err := svc.GetKnowledgeBasesByIDsOnly(ctxWithTenant(1), []string{"faq", "doc"})
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "doc", got[0].ID)
}

func TestStandardKnowledgeBaseLookupsPreserveFAQRows(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	repo.rows["faq"] = &types.KnowledgeBase{ID: "faq", Type: types.KnowledgeBaseTypeFAQ, TenantID: 1}
	svc := newPR3KBService(repo, &fakeRegistry{}, &fakeOwnership{})

	got, err := svc.GetKnowledgeBaseByID(ctxWithTenant(1), "faq")
	require.NoError(t, err)
	require.Equal(t, "faq", got.ID)
	got, err = svc.GetKnowledgeBaseByIDOnly(ctxWithTenant(1), "faq")
	require.NoError(t, err)
	require.Equal(t, "faq", got.ID)
	gotList, err := svc.GetKnowledgeBasesByIDsOnly(ctxWithTenant(1), []string{"faq"})
	require.NoError(t, err)
	require.Len(t, gotList, 1)
	require.Equal(t, "faq", gotList[0].ID)
}

func TestStandardKeepsNativeFAQKnowledgeBaseCreation(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	repo := newFakeKBRepo()
	svc := newPR3KBService(repo, &fakeRegistry{registered: map[string]struct{}{}}, &fakeOwnership{})

	_, err := svc.CreateKnowledgeBase(ctxWithTenant(1), &types.KnowledgeBase{
		Name: "faq",
		Type: types.KnowledgeBaseTypeFAQ,
	})
	require.NoError(t, err)
}
