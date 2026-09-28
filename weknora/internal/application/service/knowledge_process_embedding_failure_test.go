package service

import (
	"context"
	"net/http"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/embedding"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type embeddingFailureKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	knowledge *types.Knowledge
}

func (r *embeddingFailureKnowledgeRepo) GetKnowledgeByID(context.Context, uint64, string) (*types.Knowledge, error) {
	return r.knowledge, nil
}

func (r *embeddingFailureKnowledgeRepo) UpdateKnowledge(_ context.Context, knowledge *types.Knowledge) error {
	r.knowledge = knowledge
	return nil
}

type embeddingFailureChunkService struct {
	interfaces.ChunkService
}

func (s *embeddingFailureChunkService) CreateChunks(context.Context, []*types.Chunk) error {
	return nil
}

func (s *embeddingFailureChunkService) DeleteChunksByKnowledgeID(context.Context, string) error {
	return nil
}

type embeddingFailureTenantRepo struct {
	interfaces.TenantRepository
	tenant *types.Tenant
}

func (r *embeddingFailureTenantRepo) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return r.tenant, nil
}

func (r *embeddingFailureTenantRepo) AdjustStorageUsed(context.Context, uint64, int64) error {
	return nil
}

type embeddingFailureModelService struct {
	interfaces.ModelService
	embedder embedding.Embedder
}

func (s *embeddingFailureModelService) GetEmbeddingModel(context.Context, string) (embedding.Embedder, error) {
	return s.embedder, nil
}

type embeddingFailureEmbedder struct {
	embedding.Embedder
}

func (embeddingFailureEmbedder) GetDimensions() int { return 1 }

type embeddingFailureGraph struct {
	interfaces.RetrieveGraphRepository
}

func (embeddingFailureGraph) DelGraph(context.Context, []types.NameSpace) error { return nil }

type embeddingFailureEngine struct {
	interfaces.RetrieveEngineService
	err error
}

func (e *embeddingFailureEngine) EngineType() types.RetrieverEngineType {
	return types.PostgresRetrieverEngineType
}

func (e *embeddingFailureEngine) Support() []types.RetrieverType {
	return []types.RetrieverType{types.VectorRetrieverType}
}

func (e *embeddingFailureEngine) BatchIndex(context.Context, embedding.Embedder, []*types.IndexInfo, []types.RetrieverType) error {
	return e.err
}

func (e *embeddingFailureEngine) EstimateStorageSize(context.Context, embedding.Embedder, []*types.IndexInfo, []types.RetrieverType) int64 {
	return 0
}

func (e *embeddingFailureEngine) DeleteByKnowledgeIDList(context.Context, []string, int, string) error {
	return nil
}

type embeddingFailureRegistry struct {
	interfaces.RetrieveEngineRegistry
	engine interfaces.RetrieveEngineService
}

func (r *embeddingFailureRegistry) GetRetrieveEngineService(types.RetrieverEngineType) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}

type embeddingFailureSpanTracker struct {
	SpanTracker
	spans       map[string]*Span
	failureCode string
	failureErr  error
}

func (t *embeddingFailureSpanTracker) BeginStage(_ context.Context, knowledgeID string, attempt int, stage string, _ types.JSONMap) *Span {
	span := &Span{KnowledgeID: knowledgeID, Attempt: attempt, Name: stage}
	t.spans[stage] = span
	return span
}

func (t *embeddingFailureSpanTracker) LookupStage(_ context.Context, _ string, _ int, stage string) *Span {
	return t.spans[stage]
}

func (*embeddingFailureSpanTracker) EndSpan(context.Context, *Span, types.JSONMap) {}

func (t *embeddingFailureSpanTracker) FailSpan(_ context.Context, _ *Span, code, _ string, err error) {
	t.failureCode = code
	t.failureErr = err
}

func TestProcessChunksPreservesStableOpenRouterEmbeddingFailureCode(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{name: "allowance renewal pending", err: modelopenrouter.ErrAllowanceRenewalPending},
		{name: "credits exhausted", err: &modelopenrouter.CreditExhaustedError{StatusCode: http.StatusPaymentRequired}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tenant := &types.Tenant{
				ID: 1,
				RetrieverEngines: types.RetrieverEngines{Engines: []types.RetrieverEngineParams{{
					RetrieverType:       types.VectorRetrieverType,
					RetrieverEngineType: types.PostgresRetrieverEngineType,
				}}},
			}
			knowledge := &types.Knowledge{
				ID:              "knowledge",
				TenantID:        tenant.ID,
				KnowledgeBaseID: "kb",
				Type:            types.KnowledgeBaseTypeDocument,
				ParseStatus:     types.ParseStatusProcessing,
			}
			repo := &embeddingFailureKnowledgeRepo{knowledge: knowledge}
			tracker := &embeddingFailureSpanTracker{spans: make(map[string]*Span)}
			service := &knowledgeService{
				repo:           repo,
				chunkService:   &embeddingFailureChunkService{},
				tenantRepo:     &embeddingFailureTenantRepo{tenant: tenant},
				modelService:   &embeddingFailureModelService{embedder: embeddingFailureEmbedder{}},
				graphEngine:    embeddingFailureGraph{},
				retrieveEngine: &embeddingFailureRegistry{engine: &embeddingFailureEngine{err: tt.err}},
				spanTracker:    tracker,
			}
			ctx := context.WithValue(context.Background(), types.TenantInfoContextKey, tenant)
			ctx = context.WithValue(ctx, types.TenantIDContextKey, tenant.ID)
			ctx = withAttempt(ctx, 1)

			service.processChunks(ctx, &types.KnowledgeBase{
				ID:               "kb",
				Type:             types.KnowledgeBaseTypeDocument,
				EmbeddingModelID: "embedding",
				IndexingStrategy: types.IndexingStrategy{VectorEnabled: true},
			}, knowledge, []types.ParsedChunk{{Content: "content", Seq: 1}})

			wantCode := modelopenrouter.ErrorCode(tt.err)
			if tracker.failureCode != wantCode {
				t.Fatalf("embedding failure code = %q, want %q", tracker.failureCode, wantCode)
			}
			if modelopenrouter.ErrorCode(tracker.failureErr) != wantCode {
				t.Fatalf("embedding failure detail = %v, want code %q", tracker.failureErr, wantCode)
			}
			if repo.knowledge.ParseStatus != types.ParseStatusFailed {
				t.Fatalf("knowledge parse status = %q, want failed", repo.knowledge.ParseStatus)
			}
		})
	}
}
