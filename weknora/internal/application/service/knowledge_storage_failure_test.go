package service

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/embedding"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type storageFailureRepo struct {
	interfaces.KnowledgeRepository
	knowledge       *types.Knowledge
	pairedCalls     int
	conditionalArgs []storageFailureConditionalCall
	conditionalMark bool
}

type storageFailureConditionalCall struct {
	tenantID        uint64
	knowledgeID     string
	expectedStorage int64
	errorMessage    string
}

func (r *storageFailureRepo) UpdateKnowledgeWithStorage(_ context.Context, _ *types.Knowledge, _ int64) error {
	r.pairedCalls++
	return errors.New("concurrent quota rejection")
}

func (r *storageFailureRepo) UpdateKnowledgeStorageFailureIfCurrent(
	_ context.Context,
	tenantID uint64,
	knowledgeID string,
	expectedStorage int64,
	errorMessage string,
) (bool, error) {
	r.conditionalArgs = append(r.conditionalArgs, storageFailureConditionalCall{
		tenantID: tenantID, knowledgeID: knowledgeID,
		expectedStorage: expectedStorage, errorMessage: errorMessage,
	})
	return r.conditionalMark, nil
}

func (r *storageFailureRepo) GetKnowledgeByID(context.Context, uint64, string) (*types.Knowledge, error) {
	return r.knowledge, nil
}

type storageFailureEngine struct {
	interfaces.RetrieveEngineService
	mu                  sync.Mutex
	indexedChunkIDs     []string
	knowledgeDeleteCall int
	chunkDeleteCalls    [][]string
}

func (e *storageFailureEngine) EngineType() types.RetrieverEngineType {
	return types.SQLiteRetrieverEngineType
}

func (e *storageFailureEngine) Support() []types.RetrieverType {
	return []types.RetrieverType{types.VectorRetrieverType}
}

func (e *storageFailureEngine) EstimateStorageSize(context.Context, embedding.Embedder, []*types.IndexInfo, []types.RetrieverType) int64 {
	return 100
}

func (e *storageFailureEngine) BatchIndex(_ context.Context, _ embedding.Embedder, infos []*types.IndexInfo, _ []types.RetrieverType) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.indexedChunkIDs = e.indexedChunkIDs[:0]
	for _, info := range infos {
		e.indexedChunkIDs = append(e.indexedChunkIDs, info.ChunkID)
	}
	return nil
}

func (e *storageFailureEngine) DeleteByChunkIDList(_ context.Context, ids []string, _ int, _ string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.chunkDeleteCalls = append(e.chunkDeleteCalls, append([]string(nil), ids...))
	return nil
}

func (e *storageFailureEngine) DeleteByKnowledgeIDList(context.Context, []string, int, string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.knowledgeDeleteCall++
	return nil
}

type storageFailureRegistry struct {
	interfaces.RetrieveEngineRegistry
	engine interfaces.RetrieveEngineService
}

func (r *storageFailureRegistry) GetRetrieveEngineService(types.RetrieverEngineType) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}

type storageFailureEmbedder struct{}

func (storageFailureEmbedder) Embed(context.Context, string) ([]float32, error) {
	return []float32{0}, nil
}
func (storageFailureEmbedder) BatchEmbed(_ context.Context, texts []string) ([][]float32, error) {
	result := make([][]float32, len(texts))
	for i := range result {
		result[i] = []float32{0}
	}
	return result, nil
}
func (storageFailureEmbedder) GetModelName() string { return "storage-failure-test" }
func (storageFailureEmbedder) GetDimensions() int   { return 1 }
func (storageFailureEmbedder) GetModelID() string   { return "storage-failure-test" }
func (storageFailureEmbedder) BatchEmbedWithPool(ctx context.Context, model embedding.Embedder, texts []string) ([][]float32, error) {
	return model.BatchEmbed(ctx, texts)
}

type storageFailureModelService struct {
	interfaces.ModelService
	embedder embedding.Embedder
}

func (s *storageFailureModelService) GetEmbeddingModel(context.Context, string) (embedding.Embedder, error) {
	return s.embedder, nil
}

type storageFailureChunkService struct {
	interfaces.ChunkService
	createdIDs   []string
	deletedIDs   [][]string
	wholeDeletes int
}

func (s *storageFailureChunkService) CreateChunks(_ context.Context, chunks []*types.Chunk) error {
	for _, chunk := range chunks {
		s.createdIDs = append(s.createdIDs, chunk.ID)
	}
	return nil
}

func (s *storageFailureChunkService) DeleteChunks(_ context.Context, ids []string) error {
	s.deletedIDs = append(s.deletedIDs, append([]string(nil), ids...))
	return nil
}

func (s *storageFailureChunkService) DeleteChunksByKnowledgeID(context.Context, string) error {
	s.wholeDeletes++
	return nil
}

type storageFailureGraph struct {
	interfaces.RetrieveGraphRepository
}

func (storageFailureGraph) DelGraph(context.Context, []types.NameSpace) error { return nil }

func TestProcessChunksStorageFailureCleansOnlyAttemptOwnedResources(t *testing.T) {
	t.Parallel()
	const tenantID uint64 = 7
	knowledge := &types.Knowledge{
		ID: "storage-failure-knowledge", TenantID: tenantID, KnowledgeBaseID: "storage-failure-kb",
		Type: types.KnowledgeBaseTypeDocument, FileSize: 11, StorageSize: 0,
		ParseStatus: types.ParseStatusProcessing,
	}
	repo := &storageFailureRepo{knowledge: knowledge}
	engine := &storageFailureEngine{}
	chunkService := &storageFailureChunkService{}
	svc := &knowledgeService{
		repo:           repo,
		chunkService:   chunkService,
		modelService:   &storageFailureModelService{embedder: storageFailureEmbedder{}},
		retrieveEngine: &storageFailureRegistry{engine: engine},
		graphEngine:    storageFailureGraph{},
	}
	ctx := context.WithValue(context.Background(), types.TenantInfoContextKey, &types.Tenant{
		ID: tenantID, StorageQuota: 1 << 30,
		RetrieverEngines: types.RetrieverEngines{Engines: []types.RetrieverEngineParams{{
			RetrieverType: types.VectorRetrieverType, RetrieverEngineType: types.SQLiteRetrieverEngineType,
		}}},
	})

	svc.processChunks(ctx, &types.KnowledgeBase{
		ID: "storage-failure-kb", Type: types.KnowledgeBaseTypeDocument,
		EmbeddingModelID: "storage-failure-embedding",
		IndexingStrategy: types.IndexingStrategy{VectorEnabled: true},
	}, knowledge, []types.ParsedChunk{{Content: "one attempt", Seq: 0}})

	require.Equal(t, 1, repo.pairedCalls)
	require.Len(t, repo.conditionalArgs, 1)
	require.Equal(t, tenantID, repo.conditionalArgs[0].tenantID)
	require.Equal(t, knowledge.ID, repo.conditionalArgs[0].knowledgeID)
	require.Equal(t, int64(0), repo.conditionalArgs[0].expectedStorage)
	require.Len(t, chunkService.deletedIDs, 1)
	require.ElementsMatch(t, chunkService.createdIDs, chunkService.deletedIDs[0])
	require.Equal(t, 1, chunkService.wholeDeletes, "the only whole-knowledge cleanup is the idempotent pre-processing pass")
	require.Len(t, engine.chunkDeleteCalls, 1)
	require.ElementsMatch(t, engine.indexedChunkIDs, engine.chunkDeleteCalls[0])
	require.Equal(t, 1, engine.knowledgeDeleteCall, "only the idempotent pre-processing cleanup may use whole-knowledge index deletion")
}

func TestProcessChunksStorageFailureDoesNotMarkConcurrentSuccessFailed(t *testing.T) {
	t.Parallel()
	knowledge := &types.Knowledge{
		ID: "storage-failure-concurrent", TenantID: 7, KnowledgeBaseID: "storage-failure-kb",
		Type: types.KnowledgeBaseTypeDocument, FileSize: 11, StorageSize: 0,
		ParseStatus: types.ParseStatusProcessing,
	}
	repo := &storageFailureRepo{knowledge: knowledge, conditionalMark: false}
	engine := &storageFailureEngine{}
	chunkService := &storageFailureChunkService{}
	svc := &knowledgeService{
		repo:           repo,
		chunkService:   chunkService,
		modelService:   &storageFailureModelService{embedder: storageFailureEmbedder{}},
		retrieveEngine: &storageFailureRegistry{engine: engine},
		graphEngine:    storageFailureGraph{},
	}
	ctx := context.WithValue(context.Background(), types.TenantInfoContextKey, &types.Tenant{
		ID: 7, StorageQuota: 1 << 30,
		RetrieverEngines: types.RetrieverEngines{Engines: []types.RetrieverEngineParams{{
			RetrieverType: types.VectorRetrieverType, RetrieverEngineType: types.SQLiteRetrieverEngineType,
		}}},
	})

	svc.processChunks(ctx, &types.KnowledgeBase{
		ID: "storage-failure-kb", Type: types.KnowledgeBaseTypeDocument,
		EmbeddingModelID: "storage-failure-embedding",
		IndexingStrategy: types.IndexingStrategy{VectorEnabled: true},
	}, knowledge, []types.ParsedChunk{{Content: "concurrent success", Seq: 0}})

	require.Equal(t, 1, repo.pairedCalls, "the stale worker must not issue a second full-row storage update")
	require.False(t, repo.conditionalMark)
	require.Equal(t, 1, engine.knowledgeDeleteCall, "only the idempotent pre-processing cleanup may use whole-knowledge index deletion")
}

type deletingMarkerRepo struct {
	interfaces.KnowledgeRepository
	knowledge       *types.Knowledge
	knowledgeList   []*types.Knowledge
	fullUpdateCalls int
	columnCalls     []map[string]interface{}
}

func (r *deletingMarkerRepo) GetKnowledgeByID(context.Context, uint64, string) (*types.Knowledge, error) {
	return r.knowledge, nil
}

func (r *deletingMarkerRepo) GetKnowledgeBatch(context.Context, uint64, []string) ([]*types.Knowledge, error) {
	return r.knowledgeList, nil
}

func (r *deletingMarkerRepo) UpdateKnowledge(context.Context, *types.Knowledge) error {
	r.fullUpdateCalls++
	return errors.New("full-row update must not mark deleting")
}

func (r *deletingMarkerRepo) UpdateKnowledgeColumns(_ context.Context, _ string, values map[string]interface{}) error {
	r.columnCalls = append(r.columnCalls, values)
	return nil
}

func (r *deletingMarkerRepo) DeleteKnowledgeWithStorage(context.Context, uint64, string) error {
	return nil
}

func (r *deletingMarkerRepo) DeleteKnowledgeListWithStorage(context.Context, uint64, []string) error {
	return nil
}

func (r *deletingMarkerRepo) DeleteKnowledgeTagRelations(context.Context, string) error { return nil }

type deletingMarkerChunkRepo struct{ interfaces.ChunkRepository }

func (deletingMarkerChunkRepo) ListImageInfoByKnowledgeIDs(context.Context, uint64, []string) ([]interfaces.ChunkImageInfo, error) {
	return nil, nil
}

type deletingMarkerChunkService struct{ interfaces.ChunkService }

func (deletingMarkerChunkService) GetRepository() interfaces.ChunkRepository {
	return deletingMarkerChunkRepo{}
}
func (deletingMarkerChunkService) DeleteChunksByKnowledgeID(context.Context, string) error {
	return nil
}
func (deletingMarkerChunkService) DeleteByKnowledgeList(context.Context, []string) error { return nil }

type deletingMarkerKBService struct {
	interfaces.KnowledgeBaseService
}

func (deletingMarkerKBService) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return nil, nil
}

type deletingMarkerGraph struct {
	interfaces.RetrieveGraphRepository
}

func (deletingMarkerGraph) DelGraph(context.Context, []types.NameSpace) error { return nil }

func deletingMarkerContext() context.Context {
	tenant := &types.Tenant{ID: 7, StorageQuota: 1 << 30}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenant.ID)
	return context.WithValue(ctx, types.TenantInfoContextKey, tenant)
}

func TestDeleteKnowledgeMarksDeletingWithColumnUpdate(t *testing.T) {
	repo := &deletingMarkerRepo{knowledge: &types.Knowledge{
		ID: "delete-marker", TenantID: 7, KnowledgeBaseID: "delete-marker-kb",
		Type: types.KnowledgeBaseTypeDocument, ParseStatus: types.ParseStatusProcessing,
		FileSize: 3, StorageSize: 9,
	}}
	svc := &knowledgeService{
		repo: repo, kbService: deletingMarkerKBService{},
		chunkService: deletingMarkerChunkService{}, graphEngine: deletingMarkerGraph{},
	}

	require.NoError(t, svc.DeleteKnowledge(deletingMarkerContext(), repo.knowledge.ID))
	require.Zero(t, repo.fullUpdateCalls)
	require.Len(t, repo.columnCalls, 1)
	require.Equal(t, types.ParseStatusDeleting, repo.columnCalls[0]["parse_status"])
	require.Contains(t, repo.columnCalls[0], "updated_at")
}

func TestDeleteKnowledgeListMarksDeletingWithColumnUpdates(t *testing.T) {
	repo := &deletingMarkerRepo{knowledgeList: []*types.Knowledge{
		{ID: "delete-marker-a", TenantID: 7, KnowledgeBaseID: "delete-marker-kb", Type: types.KnowledgeBaseTypeDocument, ParseStatus: types.ParseStatusProcessing, FileSize: 2, StorageSize: 5},
		{ID: "delete-marker-b", TenantID: 7, KnowledgeBaseID: "delete-marker-kb", Type: types.KnowledgeBaseTypeDocument, ParseStatus: types.ParseStatusCompleted, FileSize: 1, StorageSize: 4},
	}}
	svc := &knowledgeService{
		repo: repo, kbService: deletingMarkerKBService{},
		chunkService: deletingMarkerChunkService{}, graphEngine: deletingMarkerGraph{},
	}

	require.NoError(t, svc.DeleteKnowledgeList(deletingMarkerContext(), []string{"delete-marker-a", "delete-marker-b"}))
	require.Zero(t, repo.fullUpdateCalls)
	require.Len(t, repo.columnCalls, 2)
	for _, values := range repo.columnCalls {
		require.Equal(t, types.ParseStatusDeleting, values["parse_status"])
		require.Contains(t, values, "updated_at")
	}
}
