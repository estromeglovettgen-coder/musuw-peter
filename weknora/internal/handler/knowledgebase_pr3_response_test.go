package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Tencent/WeKnora/internal/application/repository"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// CreateKnowledgeBase typed-error preservation — the handler must surface
// the typed AppError (ErrVectorStoreBindingInvalid / ErrVectorStoreUnavailable)
// returned by validateVectorStoreBinding instead of stripping it into a
// generic 500 via NewInternalServerError. Without the IsAppError unwrap in
// the handler, the typed error codes would be silently nullified at the
// HTTP boundary and clients would lose the ability to branch on the cause.
//
// Shared-KB UUID suppression — responses for cross-tenant shared KBs must
// not leak the owner tenant's vector_store_id UUID. SharedStoreDisplay
// suppresses store name + engine_type for cross-tenant callers, but the
// underlying KnowledgeBase.MarshalJSON still emits the UUID; the
// buildKBResponse strip closes the gap so the UUID cannot be correlated
// across multiple shared KBs.

// stubKBCreateService drives CreateKnowledgeBase end-to-end with a
// service that returns a chosen error. Embedding the interface keeps
// any other method nil-panic'ing on purpose.
type stubKBCreateService struct {
	interfaces.KnowledgeBaseService
	createErr error
}

func (s *stubKBCreateService) CreateKnowledgeBase(_ context.Context, kb *types.KnowledgeBase) (*types.KnowledgeBase, error) {
	if s.createErr != nil {
		return nil, s.createErr
	}
	kb.ID = "kb-new"
	kb.TenantID = 1
	return kb, nil
}

func newCreateKBRouter(svc interfaces.KnowledgeBaseService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		c.Set(types.TenantIDContextKey.String(), uint64(1))
		c.Set(types.UserIDContextKey.String(), "u-test")
		c.Next()
	})
	h := &KnowledgeBaseHandler{service: svc}
	r.POST("/knowledge-bases", h.CreateKnowledgeBase)
	return r
}

func TestCreateKB_PreservesTypedErrorCode_2200(t *testing.T) {
	svc := &stubKBCreateService{
		createErr: apperrors.NewVectorStoreBindingInvalidError("vector store not found"),
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases",
		strings.NewReader(`{"name":"kb"}`))
	req.Header.Set("Content-Type", "application/json")
	newCreateKBRouter(svc).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, `"code":2200`) {
		t.Fatalf("expected envelope to contain code 2200, got %s", body)
	}
	if strings.Contains(body, `"code":1007`) || strings.Contains(body, `"code":1000`) {
		t.Fatalf("typed error must not be wrapped into a generic code, got %s", body)
	}
}

func TestCreateKB_PreservesTypedErrorCode_2201(t *testing.T) {
	svc := &stubKBCreateService{
		createErr: apperrors.NewVectorStoreUnavailableError(""),
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases",
		strings.NewReader(`{"name":"kb"}`))
	req.Header.Set("Content-Type", "application/json")
	newCreateKBRouter(svc).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"code":2201`) {
		t.Fatalf("expected envelope to contain code 2201, got %s", w.Body.String())
	}
}

func TestCreateKB_GenericErrorStillFallsThroughTo500(t *testing.T) {
	// A non-AppError must NOT be auto-rewritten to 200/400 — operational
	// monitoring still needs to see infrastructure failures as 5xx.
	svc := &stubKBCreateService{createErr: errSentinel("connection refused")}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases",
		strings.NewReader(`{"name":"kb"}`))
	req.Header.Set("Content-Type", "application/json")
	newCreateKBRouter(svc).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for raw infra error, got %d body=%s", w.Code, w.Body.String())
	}
}

type errSentinel string

func (e errSentinel) Error() string { return string(e) }

// ---------------------------------------------------------------------------
// buildKBResponse must strip vector_store_id for shared KB responses
// ---------------------------------------------------------------------------

func TestBuildKBResponse_StripsVectorStoreIDForSharedKB(t *testing.T) {
	storeID := "aaaa-bbbb-cccc-dddd"
	kb := &types.KnowledgeBase{
		ID:               "kb-1",
		Name:             "shared-kb",
		TenantID:         42, // different from caller
		EmbeddingModelID: "e",
		SummaryModelID:   "s",
		VectorStoreID:    &storeID,
	}
	got := buildKBResponse(kb, types.SharedStoreDisplay(), nil)
	m, ok := got.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", got)
	}
	if _, exists := m["vector_store_id"]; exists {
		t.Fatalf("shared KB response must not expose vector_store_id, got %v", m["vector_store_id"])
	}
	if _, exists := m["vector_store_name"]; exists {
		t.Fatalf("shared KB response must not expose vector_store_name, got %v", m["vector_store_name"])
	}
	if m["vector_store_source"] != types.StoreSourceShared {
		t.Fatalf("expected vector_store_source=shared, got %v", m["vector_store_source"])
	}
	// Defensive: ensure the source UUID does not appear *anywhere* in
	// the serialized output (paranoid check against future map keys).
	serialized, _ := json.Marshal(m)
	if strings.Contains(string(serialized), storeID) {
		t.Fatalf("shared KB response leaked vector store UUID via some path: %s", serialized)
	}
}

func TestBuildKBResponse_KeepsVectorStoreIDForOwnerKB(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })

	// Same setup but with the user-source display — owner caller should
	// still see the UUID alongside the resolved metadata.
	storeID := "aaaa-bbbb-cccc-dddd"
	kb := &types.KnowledgeBase{
		ID:               "kb-1",
		Name:             "owner-kb",
		TenantID:         1,
		EmbeddingModelID: "e",
		SummaryModelID:   "s",
		VectorStoreID:    &storeID,
	}
	view := types.StoreDisplay{
		Name:       "prod-es",
		Source:     types.StoreSourceUser,
		EngineType: "elasticsearch",
		Status:     "available",
	}
	got := buildKBResponse(kb, view, nil)
	m, ok := got.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", got)
	}
	if m["vector_store_id"] != storeID {
		t.Fatalf("owner KB must keep vector_store_id, got %v", m["vector_store_id"])
	}
	if m["vector_store_name"] != "prod-es" {
		t.Fatalf("owner KB must surface store name, got %v", m["vector_store_name"])
	}
}

func TestBuildKBResponse_LiteProjectsOnlyConsumerKnowledgeBaseFields(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	storeID := "aaaa-bbbb-cccc-dddd"
	kb := &types.KnowledgeBase{
		ID:                       "kb-lite",
		Name:                     "documents",
		Type:                     types.KnowledgeBaseTypeDocument,
		TenantID:                 1,
		EmbeddingModelID:         "internal-embedding",
		SummaryModelID:           "internal-summary",
		VectorStoreID:            &storeID,
		StorageBackendID:         &storeID,
		ChunkingConfig:           types.ChunkingConfig{ChunkSize: 777, ParserEngineRules: []types.ParserEngineRule{{FileTypes: []string{"pdf"}, Engine: "forged"}}},
		ImageProcessingConfig:    types.ImageProcessingConfig{ModelID: "internal-image"},
		StorageProviderConfig:    &types.StorageProviderConfig{Provider: "s3"},
		StorageConfig:            types.StorageConfig{SecretID: "legacy-id", SecretKey: "legacy-secret", Provider: "s3"},
		VLMConfig:                types.VLMConfig{Enabled: true, ModelID: "internal-vlm", BaseURL: "https://legacy.invalid", APIKey: "legacy-vlm-key"},
		ASRConfig:                types.ASRConfig{Enabled: true, ModelID: "internal-asr"},
		ExtractConfig:            &types.ExtractConfig{Enabled: true, Text: "hidden graph seed"},
		QuestionGenerationConfig: &types.QuestionGenerationConfig{Enabled: true, QuestionCount: 9},
		WikiConfig: &types.WikiConfig{
			SynthesisModelID:       "internal-wiki",
			MaxPagesPerIngest:      99,
			ExtractionGranularity:  types.WikiExtractionFocused,
			ContentInstructions:    "visible content guidance",
			ExtractionInstructions: "visible extraction guidance",
			IngestBatchSize:        88,
		},
		AutoTagConfig: &types.AutoTagConfig{Enabled: true, ModelID: "internal-tag", MaxTags: 9},
		IndexingStrategy: types.IndexingStrategy{
			VectorEnabled:  true,
			KeywordEnabled: true,
			WikiEnabled:    true,
			GraphEnabled:   true,
		},
	}

	got := buildKBResponse(kb, types.StoreDisplay{
		Name: "private-store", Source: types.StoreSourceUser, EngineType: "qdrant", Status: "available",
	}, nil)
	m, ok := got.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", got)
	}

	for _, field := range []string{
		"chunking_config", "image_processing_config", "embedding_model_id", "summary_model_id",
		"storage_provider_config", "storage_backend_id", "storage_config", "vector_store_id",
		"vector_store_name", "vector_store_source", "vector_store_engine_type", "vector_store_status",
		"vlm_config", "asr_config", "extract_config", "faq_config", "question_generation_config",
	} {
		if _, exists := m[field]; exists {
			t.Fatalf("Lite response exposed hidden field %q: %#v", field, m[field])
		}
	}

	wiki, ok := m["wiki_config"].(map[string]interface{})
	if !ok {
		t.Fatalf("Lite response must keep visible Wiki settings, got %#v", m["wiki_config"])
	}
	for _, field := range []string{"synthesis_model_id", "max_pages_per_ingest", "ingest_batch_size", "ingest_map_parallel", "ingest_reduce_parallel", "ingest_max_inflight"} {
		if _, exists := wiki[field]; exists {
			t.Fatalf("Lite response exposed hidden Wiki field %q: %#v", field, wiki[field])
		}
	}
	if wiki["extraction_granularity"] != string(types.WikiExtractionFocused) ||
		wiki["content_instructions"] != "visible content guidance" ||
		wiki["extraction_instructions"] != "visible extraction guidance" {
		t.Fatalf("Lite response lost visible Wiki settings: %#v", wiki)
	}

	autoTag, ok := m["auto_tag_config"].(map[string]interface{})
	if !ok || autoTag["enabled"] != true || len(autoTag) != 1 {
		t.Fatalf("Lite response must expose only the auto-tag switch, got %#v", m["auto_tag_config"])
	}
	strategy, ok := m["indexing_strategy"].(map[string]interface{})
	if !ok || strategy["vector_enabled"] != true || strategy["keyword_enabled"] != true || strategy["wiki_enabled"] != true {
		t.Fatalf("Lite response lost visible indexing choices: %#v", m["indexing_strategy"])
	}
	if _, exists := strategy["graph_enabled"]; exists {
		t.Fatalf("Lite response exposed hidden graph toggle: %#v", strategy)
	}
	capabilities, ok := m["capabilities"].(map[string]interface{})
	if !ok || capabilities["ready"] != true {
		t.Fatalf("Lite response must expose safe runtime readiness, got %#v", m["capabilities"])
	}
	if capabilities["storage_ready"] != true {
		t.Fatalf("Lite response must expose safe storage readiness without the backend ID, got %#v", capabilities)
	}
	if _, exists := capabilities["graph"]; exists {
		t.Fatalf("Lite response exposed hidden graph capability: %#v", capabilities)
	}
	if _, exists := capabilities["faq"]; exists {
		t.Fatalf("Lite response exposed hidden FAQ capability: %#v", capabilities)
	}

	serialized, _ := json.Marshal(m)
	for _, secret := range []string{"legacy-id", "legacy-secret", "legacy-vlm-key", "https://legacy.invalid", storeID} {
		if strings.Contains(string(serialized), secret) {
			t.Fatalf("Lite response leaked hidden value %q: %s", secret, serialized)
		}
	}
}

func TestBuildKBResponse_StandardPreservesNativeKnowledgeBaseFields(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })

	kb := &types.KnowledgeBase{
		ID:            "kb-standard",
		StorageConfig: types.StorageConfig{SecretID: "legacy-id", SecretKey: "legacy-secret"},
		VLMConfig:     types.VLMConfig{APIKey: "legacy-vlm-key", BaseURL: "https://legacy.invalid"},
	}
	m, ok := buildKBResponse(kb, types.DefaultStoreDisplay(), nil).(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result")
	}
	serialized, _ := json.Marshal(m)
	for _, value := range []string{"legacy-id", "legacy-secret", "legacy-vlm-key", "https://legacy.invalid"} {
		if !strings.Contains(string(serialized), value) {
			t.Fatalf("Standard response must preserve native field %q: %s", value, serialized)
		}
	}
}

type moveTargetsKBServiceStub struct {
	interfaces.KnowledgeBaseService
	source  *types.KnowledgeBase
	targets []*types.KnowledgeBase
}

func (s *moveTargetsKBServiceStub) GetKnowledgeBaseByID(_ context.Context, id string) (*types.KnowledgeBase, error) {
	if s.source != nil && s.source.ID == id {
		return s.source, nil
	}
	for _, kb := range s.targets {
		if kb != nil && kb.ID == id {
			return kb, nil
		}
	}
	return nil, repository.ErrKnowledgeBaseNotFound
}

func (s *moveTargetsKBServiceStub) ListKnowledgeBases(_ context.Context) ([]*types.KnowledgeBase, error) {
	return s.targets, nil
}

func newMoveTargetsRouter(svc interfaces.KnowledgeBaseService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		c.Set(types.TenantIDContextKey.String(), uint64(1))
		c.Next()
	})
	h := &KnowledgeBaseHandler{service: svc}
	r.GET("/knowledge-bases/:id/move-targets", h.ListMoveTargets)
	return r
}

func TestListMoveTargets_UsesLiteProjectionButKeepsStandardNativePayload(t *testing.T) {
	storeID := "11111111-1111-1111-1111-111111111111"
	source := &types.KnowledgeBase{
		ID:               "kb-source",
		Name:             "source",
		Type:             types.KnowledgeBaseTypeDocument,
		TenantID:         1,
		EmbeddingModelID: "internal-embedding",
		SummaryModelID:   "internal-summary",
	}
	target := &types.KnowledgeBase{
		ID:               "kb-target",
		Name:             "target",
		Type:             types.KnowledgeBaseTypeDocument,
		TenantID:         1,
		EmbeddingModelID: "internal-embedding",
		SummaryModelID:   "internal-summary",
		StorageBackendID: &storeID,
		VectorStoreID:    &storeID,
		StorageConfig:    types.StorageConfig{SecretID: "legacy-id", SecretKey: "legacy-secret", Provider: "s3"},
		VLMConfig:        types.VLMConfig{Enabled: true, ModelID: "internal-vlm", BaseURL: "https://legacy.invalid", APIKey: "legacy-vlm-key"},
		ChunkingConfig:   types.ChunkingConfig{ChunkSize: 777},
		ExtractConfig:    &types.ExtractConfig{Enabled: true, Text: "hidden graph seed"},
		FAQConfig:        &types.FAQConfig{IndexMode: types.FAQIndexModeQuestionOnly},
		IndexingStrategy: types.IndexingStrategy{VectorEnabled: true, KeywordEnabled: true, GraphEnabled: true},
	}
	serviceStub := &moveTargetsKBServiceStub{source: source, targets: []*types.KnowledgeBase{target}}

	for _, tc := range []struct {
		name            string
		edition         string
		wantNativeValue string
		wantHidden      bool
	}{
		{name: "lite", edition: "lite", wantHidden: false},
		{name: "standard", edition: "standard", wantNativeValue: "legacy-secret", wantHidden: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			originalEdition := Edition
			Edition = tc.edition
			t.Cleanup(func() { Edition = originalEdition })

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/knowledge-bases/kb-source/move-targets", nil)
			newMoveTargetsRouter(serviceStub).ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
			}

			var envelope struct {
				Data []map[string]interface{} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
				t.Fatalf("decode response: %v body=%s", err, w.Body.String())
			}
			if len(envelope.Data) != 1 {
				t.Fatalf("expected one move target, got %#v", envelope.Data)
			}
			serialized := string(w.Body.Bytes())
			if tc.wantHidden {
				if !strings.Contains(serialized, tc.wantNativeValue) {
					t.Fatalf("Standard move-target response must preserve native field %q: %s", tc.wantNativeValue, serialized)
				}
				for _, native := range []string{
					"chunking_config", "embedding_model_id", "summary_model_id", "storage_backend_id",
					"vector_store_id", "storage_config", "vlm_config", "extract_config", "faq_config",
				} {
					if _, exists := envelope.Data[0][native]; !exists {
						t.Fatalf("Standard move-target response lost native field %q: %#v", native, envelope.Data[0])
					}
				}
			} else {
				for _, hidden := range []string{
					"chunking_config", "embedding_model_id", "summary_model_id", "storage_backend_id",
					"vector_store_id", "storage_config", "vlm_config", "extract_config", "faq_config",
				} {
					if _, exists := envelope.Data[0][hidden]; exists {
						t.Fatalf("Lite move-target response exposed hidden field %q: %#v", hidden, envelope.Data[0][hidden])
					}
				}
				for _, secret := range []string{"legacy-id", "legacy-secret", "legacy-vlm-key", "https://legacy.invalid", storeID, "internal-embedding", "internal-summary", "internal-vlm"} {
					if strings.Contains(serialized, secret) {
						t.Fatalf("Lite move-target response leaked hidden value %q: %s", secret, serialized)
					}
				}
				if envelope.Data[0]["id"] != target.ID || envelope.Data[0]["name"] != target.Name {
					t.Fatalf("Lite move-target response lost safe identity fields: %#v", envelope.Data[0])
				}
			}
		})
	}
}
