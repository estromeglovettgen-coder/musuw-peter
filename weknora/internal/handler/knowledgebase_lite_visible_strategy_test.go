package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type visibleStrategyCreateStub struct {
	interfaces.KnowledgeBaseService
	called   bool
	received *types.KnowledgeBase
}

func (s *visibleStrategyCreateStub) CreateKnowledgeBase(_ context.Context, kb *types.KnowledgeBase) (*types.KnowledgeBase, error) {
	s.called = true
	received := *kb
	s.received = &received
	kb.ID = "kb-new"
	kb.TenantID = 1
	return kb, nil
}

func createKnowledgeBaseRequest(t *testing.T, edition, body string) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	originalEdition := Edition
	Edition = edition
	t.Cleanup(func() { Edition = originalEdition })

	svc := &visibleStrategyCreateStub{}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	newCreateKBRouter(svc).ServeHTTP(w, req)
	return w, svc.called
}

func TestLiteCreateKnowledgeBaseRejectsHiddenGraphOnlyAtHTTPBoundary(t *testing.T) {
	w, called := createKnowledgeBaseRequest(t, "lite", `{
		"name":"hidden-graph-only",
		"type":"document",
		"indexing_strategy":{"graph_enabled":true}
	}`)

	require.Equal(t, http.StatusBadRequest, w.Code)
	require.False(t, called)
}

func TestLiteCreateKnowledgeBaseRejectsEveryNonDocumentTypeAtHTTPBoundary(t *testing.T) {
	for _, kbType := range []string{"faq", "wiki", "unsupported"} {
		t.Run(kbType, func(t *testing.T) {
			w, called := createKnowledgeBaseRequest(t, "lite", `{"name":"hidden","type":"`+kbType+`","indexing_strategy":{"vector_enabled":true}}`)
			require.Equal(t, http.StatusBadRequest, w.Code)
			require.False(t, called)
		})
	}
}

func TestLiteCreateKnowledgeBaseAcceptsVisibleRAGOrWiki(t *testing.T) {
	for name, strategy := range map[string]string{
		"rag":  `{"vector_enabled":true}`,
		"wiki": `{"wiki_enabled":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			w, called := createKnowledgeBaseRequest(t, "lite", `{"name":"configured","type":"document","indexing_strategy":`+strategy+`}`)
			require.Equal(t, http.StatusCreated, w.Code)
			require.True(t, called)
		})
	}
}

func TestLiteCreateKnowledgeBaseDropsHiddenConfigurationAtHTTPBoundary(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	svc := &visibleStrategyCreateStub{}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases", strings.NewReader(`{
		"id":"forged-id",
		"name":"managed documents",
		"type":"document",
		"is_temporary":true,
		"summary_model_id":"forged-summary",
		"embedding_model_id":"forged-embedding",
		"chunking_config":{"chunk_size":9999,"parser_engine_rules":[{"file_types":["pdf"],"engine":"forged"}]},
		"image_processing_config":{"model_id":"forged-image"},
		"vlm_config":{"enabled":false,"model_id":"forged-vlm","api_key":"forged-key"},
		"asr_config":{"enabled":false,"model_id":"forged-asr"},
		"storage_provider_config":{"provider":"forged"},
		"storage_config":{"provider":"s3","secret_id":"forged-secret-id","secret_key":"forged-secret"},
		"storage_backend_id":"11111111-1111-1111-1111-111111111111",
		"vector_store_id":"22222222-2222-2222-2222-222222222222",
		"extract_config":{"enabled":false,"text":"forged graph"},
		"faq_config":{"index_mode":"question_only"},
		"question_generation_config":{"enabled":true,"question_count":10},
		"wiki_config":{
			"synthesis_model_id":"forged-wiki",
			"max_pages_per_ingest":77,
			"extraction_granularity":"focused",
			"content_instructions":"visible content",
			"extraction_instructions":"visible extraction",
			"ingest_batch_size":66
		},
		"auto_tag_config":{"enabled":true,"model_id":"forged-tag","max_tags":99},
		"indexing_strategy":{"vector_enabled":true,"keyword_enabled":false,"wiki_enabled":true,"graph_enabled":false}
	}`))
	req.Header.Set("Content-Type", "application/json")
	newCreateKBRouter(svc).ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	require.NotNil(t, svc.received)
	got := svc.received
	require.Empty(t, got.ID)
	require.False(t, got.IsTemporary)
	require.Empty(t, got.SummaryModelID)
	require.Empty(t, got.EmbeddingModelID)
	require.Equal(t, types.ChunkingConfig{}, got.ChunkingConfig)
	require.Equal(t, types.ImageProcessingConfig{}, got.ImageProcessingConfig)
	require.Equal(t, types.VLMConfig{}, got.VLMConfig)
	require.Equal(t, types.ASRConfig{}, got.ASRConfig)
	require.Nil(t, got.StorageProviderConfig)
	require.Nil(t, got.StorageBackendID)
	require.Nil(t, got.VectorStoreID)
	require.Equal(t, types.StorageConfig{}, got.StorageConfig)
	require.Nil(t, got.ExtractConfig)
	require.Nil(t, got.FAQConfig)
	require.Nil(t, got.QuestionGenerationConfig)
	require.Equal(t, types.IndexingStrategy{VectorEnabled: true, WikiEnabled: true}, got.IndexingStrategy)
	require.NotNil(t, got.WikiConfig)
	require.Empty(t, got.WikiConfig.SynthesisModelID)
	require.Zero(t, got.WikiConfig.MaxPagesPerIngest)
	require.Zero(t, got.WikiConfig.IngestBatchSize)
	require.Equal(t, types.WikiExtractionFocused, got.WikiConfig.ExtractionGranularity)
	require.Equal(t, "visible content", got.WikiConfig.ContentInstructions)
	require.Equal(t, "visible extraction", got.WikiConfig.ExtractionInstructions)
	require.Equal(t, &types.AutoTagConfig{Enabled: true}, got.AutoTagConfig)
}

func TestLiteUpdateConfigSanitizerKeepsOnlyVisibleSettings(t *testing.T) {
	got := sanitizeLiteKnowledgeBaseUpdateConfig(&types.KnowledgeBaseConfig{
		ChunkingConfig:        types.ChunkingConfig{ChunkSize: 9999},
		ImageProcessingConfig: types.ImageProcessingConfig{ModelID: "forged-image"},
		FAQConfig:             &types.FAQConfig{IndexMode: types.FAQIndexModeQuestionOnly},
		WikiConfig: &types.WikiConfig{
			SynthesisModelID:       "forged-wiki",
			MaxPagesPerIngest:      99,
			ExtractionGranularity:  types.WikiExtractionFocused,
			ContentInstructions:    "visible content",
			ExtractionInstructions: "visible extraction",
			IngestBatchSize:        55,
		},
		AutoTagConfig: &types.AutoTagConfig{Enabled: true, ModelID: "forged-tag", MaxTags: 9},
		IndexingStrategy: &types.IndexingStrategy{
			VectorEnabled: true, WikiEnabled: true, GraphEnabled: true,
		},
	})

	require.Equal(t, types.ChunkingConfig{}, got.ChunkingConfig)
	require.Equal(t, types.ImageProcessingConfig{}, got.ImageProcessingConfig)
	require.Nil(t, got.FAQConfig)
	require.Equal(t, &types.AutoTagConfig{Enabled: true}, got.AutoTagConfig)
	require.Equal(t, &types.IndexingStrategy{VectorEnabled: true, WikiEnabled: true}, got.IndexingStrategy)
	require.Equal(t, &types.WikiConfig{
		ExtractionGranularity:  types.WikiExtractionFocused,
		ContentInstructions:    "visible content",
		ExtractionInstructions: "visible extraction",
	}, got.WikiConfig)
}

func TestStandardCreateKnowledgeBaseKeepsGraphOnlyHTTPContract(t *testing.T) {
	w, called := createKnowledgeBaseRequest(t, "standard", `{
		"name":"standard-graph-only",
		"type":"document",
		"indexing_strategy":{"graph_enabled":true}
	}`)

	require.Equal(t, http.StatusCreated, w.Code)
	require.True(t, called)
}
