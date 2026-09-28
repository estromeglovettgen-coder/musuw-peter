package service

import (
	"context"
	"sync"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/embedding"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

// These fakes exercise the service paths through the real retriever factory
// and CompositeRetrieveEngine. They deliberately record the external order so
// the tests catch a partial index write that is not compensated.
type storagePathEmbedder struct{}

func (storagePathEmbedder) Embed(context.Context, string) ([]float32, error) {
	return []float32{0}, nil
}
func (storagePathEmbedder) BatchEmbed(_ context.Context, texts []string) ([][]float32, error) {
	result := make([][]float32, len(texts))
	for i := range result {
		result[i] = []float32{0}
	}
	return result, nil
}
func (storagePathEmbedder) GetModelName() string { return "storage-path-test" }
func (storagePathEmbedder) GetDimensions() int   { return 1 }
func (storagePathEmbedder) GetModelID() string   { return "storage-path-test" }
func (storagePathEmbedder) BatchEmbedWithPool(ctx context.Context, model embedding.Embedder, texts []string) ([][]float32, error) {
	return model.BatchEmbed(ctx, texts)
}

type storagePathEngine struct {
	interfaces.RetrieveEngineService

	mu               sync.Mutex
	bytesPerDoc      int64
	batchErrs        []error
	batchCalls       [][]*types.IndexInfo
	deleteCalls      [][]string
	knowledgeDeletes [][]string
}

func (e *storagePathEngine) EngineType() types.RetrieverEngineType {
	return types.SQLiteRetrieverEngineType
}
func (e *storagePathEngine) Support() []types.RetrieverType {
	return []types.RetrieverType{types.VectorRetrieverType}
}
func (e *storagePathEngine) EstimateStorageSize(_ context.Context, _ embedding.Embedder, infos []*types.IndexInfo, _ []types.RetrieverType) int64 {
	e.mu.Lock()
	defer e.mu.Unlock()
	return int64(len(infos)) * e.bytesPerDoc
}
func (e *storagePathEngine) BatchIndex(_ context.Context, _ embedding.Embedder, infos []*types.IndexInfo, _ []types.RetrieverType) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	copyInfos := make([]*types.IndexInfo, len(infos))
	copy(copyInfos, infos)
	e.batchCalls = append(e.batchCalls, copyInfos)
	if len(e.batchErrs) == 0 {
		return nil
	}
	err := e.batchErrs[0]
	e.batchErrs = e.batchErrs[1:]
	return err
}
func (e *storagePathEngine) DeleteByChunkIDList(_ context.Context, ids []string, _ int, _ string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	copyIDs := append([]string(nil), ids...)
	e.deleteCalls = append(e.deleteCalls, copyIDs)
	return nil
}
func (e *storagePathEngine) DeleteByKnowledgeIDList(_ context.Context, ids []string, _ int, _ string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.knowledgeDeletes = append(e.knowledgeDeletes, append([]string(nil), ids...))
	return nil
}

type storagePathRegistry struct {
	interfaces.RetrieveEngineRegistry
	engine interfaces.RetrieveEngineService
}

func (r *storagePathRegistry) GetRetrieveEngineService(types.RetrieverEngineType) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}

type storagePathKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	mu               sync.Mutex
	updateErr        error
	updateErrs       []error
	knowledge        *types.Knowledge
	updates          []int64
	updateCall       int
	conditionalCalls int
}

func (r *storagePathKnowledgeRepo) GetKnowledgeByID(context.Context, uint64, string) (*types.Knowledge, error) {
	return r.knowledge, nil
}

func (r *storagePathKnowledgeRepo) UpdateKnowledgeWithStorage(_ context.Context, knowledge *types.Knowledge, _ int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.updateCall++
	r.updates = append(r.updates, knowledge.StorageSize)
	if len(r.updateErrs) > 0 {
		err := r.updateErrs[0]
		r.updateErrs = r.updateErrs[1:]
		return err
	}
	return r.updateErr
}

func (r *storagePathKnowledgeRepo) UpdateKnowledgeStorageFailureIfCurrent(
	_ context.Context, _ uint64, _ string, _ int64, _ string,
) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.conditionalCalls++
	return true, nil
}

type storagePathChunkService struct {
	interfaces.ChunkService
	mu          sync.Mutex
	createCalls int
	deleteCalls int
}

func (s *storagePathChunkService) CreateChunks(context.Context, []*types.Chunk) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.createCalls++
	return nil
}
func (s *storagePathChunkService) DeleteChunksByKnowledgeID(context.Context, string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteCalls++
	return nil
}
func (s *storagePathChunkService) DeleteChunks(context.Context, []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleteCalls++
	return nil
}

type storagePathGraph struct {
	interfaces.RetrieveGraphRepository
}

func (storagePathGraph) DelGraph(context.Context, []types.NameSpace) error { return nil }

type storagePathModelService struct {
	interfaces.ModelService
	embedder embedding.Embedder
}

func (s *storagePathModelService) GetEmbeddingModel(context.Context, string) (embedding.Embedder, error) {
	return s.embedder, nil
}

func storagePathContext() context.Context {
	tenant := &types.Tenant{
		ID:           7,
		StorageQuota: 1 << 30,
		RetrieverEngines: types.RetrieverEngines{Engines: []types.RetrieverEngineParams{{
			RetrieverType:       types.VectorRetrieverType,
			RetrieverEngineType: types.SQLiteRetrieverEngineType,
		}}},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenant.ID)
	return context.WithValue(ctx, types.TenantInfoContextKey, tenant)
}

func storagePathService(
	repo interfaces.KnowledgeRepository,
	chunkRepo interfaces.ChunkRepository,
	engine *storagePathEngine,
	embedder embedding.Embedder,
) *knowledgeService {
	return &knowledgeService{
		repo:           repo,
		chunkRepo:      chunkRepo,
		retrieveEngine: &storagePathRegistry{engine: engine},
		modelService:   &storagePathModelService{embedder: embedder},
	}
}

func TestProcessChunksReparseReleasesOldIndexBeforeFinalQuotaDecision(t *testing.T) {
	ctx := storagePathContext()
	quotaErr := types.NewStorageQuotaExceededError()
	engine := &storagePathEngine{bytesPerDoc: 100}
	knowledge := &types.Knowledge{
		ID:              "knowledge-storage-path",
		TenantID:        7,
		KnowledgeBaseID: "kb-storage-path",
		Type:            types.KnowledgeBaseTypeDocument,
		FileSize:        11,
		FilePath:        "tenant/source.txt",
		StorageSize:     200,
		ParseStatus:     types.ParseStatusProcessing,
	}
	repo := &storagePathKnowledgeRepo{
		knowledge:  knowledge,
		updateErrs: []error{nil, quotaErr}, // reset, final quota reject
	}
	chunkSvc := &storagePathChunkService{}
	svc := storagePathService(repo, nil, engine, storagePathEmbedder{})
	svc.chunkService = chunkSvc
	svc.graphEngine = storagePathGraph{}

	svc.processChunks(ctx, &types.KnowledgeBase{
		ID:               "kb-storage-path",
		Type:             types.KnowledgeBaseTypeDocument,
		EmbeddingModelID: "embedding-storage-path",
		IndexingStrategy: types.IndexingStrategy{VectorEnabled: true},
	}, knowledge, []types.ParsedChunk{{Content: "new content", Seq: 0}})

	// Reparse releases the old derived index before writing the new one. The
	// final paired mutation is rejected, so cleanup leaves only source-file
	// bytes accounted and marks the row failed for retry.
	require.Equal(t, []int64{0, 100}, repo.updates)
	require.Equal(t, 1, repo.conditionalCalls)
	require.Equal(t, int64(0), knowledge.StorageSize)
	require.Equal(t, types.ParseStatusFailed, knowledge.ParseStatus)
	require.Equal(t, int64(11), knowledge.FileSize, "reparse must keep source-file bytes separate from index bytes")
	require.Equal(t, "tenant/source.txt", knowledge.FilePath, "reparse must preserve the durable source object")
	require.Len(t, engine.knowledgeDeletes, 1, "only the pre-processing cleanup may target the whole knowledge")
	require.Len(t, engine.deleteCalls, 1, "newly-written index must be cleaned by its chunk IDs")
}

func TestDocumentCloneDoesNotMutateSharedTenantUsageFromWorkers(t *testing.T) {
	source := storageAccountingServiceSource(t, "knowledge_clone_move.go")
	require.NotContains(t, source, "StorageUsed +=")
	require.NotContains(t, source, "StorageUsed -=")
}
