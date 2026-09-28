package service

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/embedding"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// strictDeleteKnowledgeRepo keeps the knowledge row visible until the worker
// succeeds. This mirrors GORM's soft-delete filter and lets the tests prove
// that an external cleanup failure cannot erase the local evidence needed for
// a retry.
type strictDeleteKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	items      []*types.Knowledge
	deleteErr  error
	deleteCall int
}

func (r *strictDeleteKnowledgeRepo) ListKnowledgeByKnowledgeBaseID(
	context.Context, uint64, string,
) ([]*types.Knowledge, error) {
	return r.items, nil
}

func (r *strictDeleteKnowledgeRepo) DeleteKnowledgeList(context.Context, uint64, []string) error {
	r.deleteCall++
	if r.deleteErr != nil {
		return r.deleteErr
	}
	r.items = nil
	return nil
}

func (r *strictDeleteKnowledgeRepo) DeleteKnowledgeListWithStorage(ctx context.Context, tenantID uint64, ids []string) error {
	return r.DeleteKnowledgeList(ctx, tenantID, ids)
}

type strictDeleteEngine struct {
	interfaces.RetrieveEngineService
	err   error
	calls int
}

func (e *strictDeleteEngine) EngineType() types.RetrieverEngineType {
	return types.PostgresRetrieverEngineType
}

func (e *strictDeleteEngine) Support() []types.RetrieverType {
	return []types.RetrieverType{types.VectorRetrieverType}
}

func (e *strictDeleteEngine) DeleteByKnowledgeIDList(context.Context, []string, int, string) error {
	e.calls++
	return e.err
}

type strictDeleteRegistry struct {
	engine interfaces.RetrieveEngineService
}

func (r strictDeleteRegistry) Register(interfaces.RetrieveEngineService) error { return nil }
func (r strictDeleteRegistry) GetRetrieveEngineService(types.RetrieverEngineType) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}
func (r strictDeleteRegistry) GetAllRetrieveEngineServices() []interfaces.RetrieveEngineService {
	return []interfaces.RetrieveEngineService{r.engine}
}
func (r strictDeleteRegistry) GetByStoreID(string) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}
func (r strictDeleteRegistry) GetOrLoadByStoreID(context.Context, uint64, string) (interfaces.RetrieveEngineService, error) {
	return r.engine, nil
}

type strictDeleteOwnership struct{}

func (strictDeleteOwnership) StoreOwnedBy(context.Context, string, uint64) (bool, error) {
	return true, nil
}

type strictDeleteChunkRepo struct {
	interfaces.ChunkRepository
	imageInfo  []interfaces.ChunkImageInfo
	imageErr   error
	chunkErr   error
	chunkCalls int
}

func (r *strictDeleteChunkRepo) ListImageInfoByKnowledgeIDs(
	context.Context, uint64, []string,
) ([]interfaces.ChunkImageInfo, error) {
	return r.imageInfo, r.imageErr
}

func (r *strictDeleteChunkRepo) DeleteChunksByKnowledgeID(context.Context, uint64, string) error {
	r.chunkCalls++
	return r.chunkErr
}

type strictDeleteFileService struct {
	interfaces.FileService
	err   error
	calls []string
}

func (s *strictDeleteFileService) DeleteFile(_ context.Context, path string) error {
	s.calls = append(s.calls, path)
	return s.err
}

type strictDeleteGraph struct {
	interfaces.RetrieveGraphRepository
	err error
}

func (g strictDeleteGraph) DelGraph(context.Context, []types.NameSpace) error { return g.err }

type strictDeleteTenantRepo struct {
	interfaces.TenantRepository
	tenant *types.Tenant
	err    error
}

func (r strictDeleteTenantRepo) AdjustStorageUsed(context.Context, uint64, int64) error {
	return r.err
}

func (r strictDeleteTenantRepo) GetTenantByID(_ context.Context, tenantID uint64) (*types.Tenant, error) {
	if r.err != nil {
		return nil, r.err
	}
	if r.tenant != nil {
		return r.tenant, nil
	}
	return &types.Tenant{ID: tenantID}, nil
}

type strictDeleteStorageResolver struct {
	svc              interfaces.FileService
	backendID        string
	provider         string
	resolveCallCount int
}

func (r *strictDeleteStorageResolver) ResolveBackend(
	_ context.Context,
	_ *types.Tenant,
	_, _ string,
) (*types.StorageBackend, error) {
	return nil, nil
}

func (r *strictDeleteStorageResolver) ResolveFileService(
	_ context.Context,
	_ *types.Tenant,
	backendID string,
	provider string,
	_ string,
) (interfaces.FileService, string, error) {
	r.resolveCallCount++
	r.backendID = backendID
	r.provider = provider
	return r.svc, provider, nil
}

type strictDeleteResourceCatalog struct {
	interfaces.ResourceCatalog
	resource *types.StoredResource
	err      error
	calls    []string
}

func (c *strictDeleteResourceCatalog) Resolve(_ context.Context, reference string) (*types.StoredResource, error) {
	c.calls = append(c.calls, reference)
	return c.resource, c.err
}

type strictDeleteTaskPendingRepo struct {
	interfaces.TaskPendingOpsRepository
	err error
}

func (r strictDeleteTaskPendingRepo) DeleteByScope(context.Context, string, string) error {
	return r.err
}

var _ interfaces.TaskPendingOpsScopeCleaner = strictDeleteTaskPendingRepo{}

type strictDeleteFailingDataSourceRepo struct {
	interfaces.DataSourceRepository
	inner     *kbDeleteDSRepo
	findErr   error
	deleteErr error
}

func (r strictDeleteFailingDataSourceRepo) FindByKnowledgeBase(ctx context.Context, kbID string) ([]*types.DataSource, error) {
	if r.findErr != nil {
		return nil, r.findErr
	}
	return r.inner.FindByKnowledgeBase(ctx, kbID)
}

func (r strictDeleteFailingDataSourceRepo) Delete(ctx context.Context, id string) error {
	if r.deleteErr != nil {
		return r.deleteErr
	}
	return r.inner.Delete(ctx, id)
}

type strictDeleteEnqueuer struct {
	err   error
	tasks []*asynq.Task
}

func (q *strictDeleteEnqueuer) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	q.tasks = append(q.tasks, task)
	if q.err != nil {
		return nil, q.err
	}
	return &asynq.TaskInfo{ID: "strict-kb-delete"}, nil
}

type strictDeleteObservingEnqueuer struct {
	err           error
	rows          map[string]*types.KnowledgeBase
	seenAtEnqueue bool
	tasks         []*asynq.Task
}

func (q *strictDeleteObservingEnqueuer) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	q.tasks = append(q.tasks, task)
	q.seenAtEnqueue = q.rows["kb-strict"] != nil
	if q.err != nil {
		return nil, q.err
	}
	return &asynq.TaskInfo{ID: "strict-kb-delete"}, nil
}

func strictDeleteService(repo interfaces.KnowledgeRepository, engine *strictDeleteEngine) *knowledgeBaseService {
	return &knowledgeBaseService{
		kgRepo:          repo,
		chunkRepo:       &strictDeleteChunkRepo{},
		modelService:    kbCleanupModelService{},
		retrieveEngine:  strictDeleteRegistry{engine: engine},
		ownership:       strictDeleteOwnership{},
		tenantRepo:      strictDeleteTenantRepo{},
		fileSvc:         &strictDeleteFileService{},
		graphEngine:     strictDeleteGraph{},
		taskPendingRepo: strictDeleteTaskPendingRepo{},
	}
}

func strictDeletePayload(t *testing.T, strict bool) *asynq.Task {
	t.Helper()
	storeID := "00000000-0000-0000-0000-0000000000aa"
	payload, err := json.Marshal(types.KBDeletePayload{
		TenantID:        1,
		KnowledgeBaseID: "kb-strict",
		Strict:          strict,
		VectorStoreID:   &storeID,
	})
	require.NoError(t, err)
	return asynq.NewTask(types.TypeKBDelete, payload)
}

func strictDeleteKnowledge() *types.Knowledge {
	return &types.Knowledge{
		ID:               "knowledge-strict",
		KnowledgeBaseID:  "kb-strict",
		EmbeddingModelID: "model-1",
		FilePath:         "local://source.txt",
		StorageSize:      10,
		Type:             "document",
	}
}

func TestProcessKBDeleteStrictRetainsRowsWhenVectorCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{err: errors.New("vector backend unavailable")}
	svc := strictDeleteService(knowledgeRepo, engine)

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "vector backend unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall, "strict cleanup must retain rows for retry")
	assert.Equal(t, 1, engine.calls)
}

func TestProcessKBDeleteStrictRetainsRowsWhenFileCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{}
	fileSvc := &strictDeleteFileService{err: errors.New("object store unavailable")}
	chunkRepo := &strictDeleteChunkRepo{}
	svc := strictDeleteService(knowledgeRepo, engine)
	svc.fileSvc = fileSvc
	svc.chunkRepo = chunkRepo

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "object store unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
	assert.Zero(t, chunkRepo.chunkCalls, "chunks remain so image metadata is available on retry")
}

func TestProcessKBDeleteStrictRejectsMalformedImageInfo(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{}
	chunkRepo := &strictDeleteChunkRepo{
		imageInfo: []interfaces.ChunkImageInfo{{KnowledgeID: "knowledge-strict", ImageInfo: "{"}},
	}
	svc := strictDeleteService(knowledgeRepo, engine)
	svc.chunkRepo = chunkRepo

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "image_info")
	assert.Zero(t, knowledgeRepo.deleteCall)
	assert.Zero(t, chunkRepo.chunkCalls)
}

func TestProcessKBDeleteStrictRetainsRowsWhenChunkCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{}
	chunkRepo := &strictDeleteChunkRepo{chunkErr: errors.New("chunks unavailable")}
	fileSvc := &strictDeleteFileService{}
	svc := strictDeleteService(knowledgeRepo, engine)
	svc.chunkRepo = chunkRepo
	svc.fileSvc = fileSvc

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "chunks unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
	assert.Equal(t, 1, chunkRepo.chunkCalls)
}

func TestProcessKBDeleteStrictRetainsRowsWhenGraphCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{}
	chunkRepo := &strictDeleteChunkRepo{}
	fileSvc := &strictDeleteFileService{}
	svc := strictDeleteService(knowledgeRepo, engine)
	svc.chunkRepo = chunkRepo
	svc.fileSvc = fileSvc
	svc.graphEngine = strictDeleteGraph{err: errors.New("graph unavailable")}

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "graph unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
}

func TestProcessKBDeleteStrictDeletesRowsAfterAllResourcesSucceed(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{}
	chunkRepo := &strictDeleteChunkRepo{}
	fileSvc := &strictDeleteFileService{}
	svc := strictDeleteService(knowledgeRepo, engine)
	svc.chunkRepo = chunkRepo
	svc.fileSvc = fileSvc

	require.NoError(t, svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true)))
	assert.Equal(t, 1, knowledgeRepo.deleteCall)
	assert.Equal(t, 1, chunkRepo.chunkCalls)
	assert.Equal(t, []string{"local://source.txt"}, fileSvc.calls)
}

func TestProcessKBDeleteStrictResolvesPersistedBackendScopedSourcePath(t *testing.T) {
	const (
		backendID = "e4596357-c110-4ce9-8481-e1221cfde92d"
		innerPath = "s3://musuw-staging/weknora/10002/knowledge/document.md"
	)
	knowledge := strictDeleteKnowledge()
	knowledge.FilePath = "storage://" + backendID + "/" + innerPath
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{knowledge}}
	defaultSvc := &strictDeleteFileService{err: errors.New("default storage must not receive a backend-scoped path")}
	resolvedInner := &strictDeleteFileService{}
	resolver := &strictDeleteStorageResolver{
		// Resolver implementations are allowed to return the concrete provider
		// service directly. Strict cleanup must therefore pass the parsed inner
		// provider path rather than relying on a backend-scoping decorator to
		// unwrap it a second time.
		svc: resolvedInner,
	}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.fileSvc = defaultSvc
	svc.tenantRepo = strictDeleteTenantRepo{tenant: &types.Tenant{ID: 1}}
	svc.storageResolver = resolver

	require.NoError(t, svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true)))
	assert.Equal(t, 1, resolver.resolveCallCount)
	assert.Equal(t, backendID, resolver.backendID)
	assert.Equal(t, "s3", resolver.provider)
	assert.Empty(t, defaultSvc.calls)
	assert.Equal(t, []string{innerPath}, resolvedInner.calls)
	assert.Equal(t, 1, knowledgeRepo.deleteCall)
}

func TestProcessKBDeleteStrictResolvesCatalogBackedSourcePath(t *testing.T) {
	const (
		resourceRef = "resource://y16XEhoTvy07RNTh7QUIfw"
		backendID   = "e4596357-c110-4ce9-8481-e1221cfde92d"
		innerPath   = "s3://musuw-staging/weknora/10002/knowledge/document.md"
	)
	knowledge := strictDeleteKnowledge()
	knowledge.FilePath = resourceRef
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{knowledge}}
	defaultSvc := &strictDeleteFileService{err: errors.New("default storage must not receive a catalog reference")}
	resolvedInner := &strictDeleteFileService{}
	resolver := &strictDeleteStorageResolver{svc: resolvedInner}
	catalog := &strictDeleteResourceCatalog{resource: &types.StoredResource{
		Handle:           "y16XEhoTvy07RNTh7QUIfw",
		TenantID:         1,
		StorageBackendID: backendID,
		Provider:         "s3",
		PhysicalPath:     "storage://" + backendID + "/" + innerPath,
	}}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.fileSvc = defaultSvc
	svc.tenantRepo = strictDeleteTenantRepo{tenant: &types.Tenant{ID: 1}}
	svc.storageResolver = resolver
	svc.resourceCatalog = catalog

	require.NoError(t, svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, true)))
	assert.Equal(t, []string{resourceRef}, catalog.calls)
	assert.Equal(t, 1, resolver.resolveCallCount)
	assert.Equal(t, backendID, resolver.backendID)
	assert.Equal(t, "s3", resolver.provider)
	assert.Empty(t, defaultSvc.calls)
	assert.Equal(t, []string{innerPath}, resolvedInner.calls)
	assert.Equal(t, 1, knowledgeRepo.deleteCall)
}

func TestResolveFileServiceForPersistedPathRejectsCatalogScopeMismatch(t *testing.T) {
	const (
		resourceRef = "resource://y16XEhoTvy07RNTh7QUIfw"
		backendID   = "e4596357-c110-4ce9-8481-e1221cfde92d"
		innerPath   = "s3://musuw-staging/weknora/1/knowledge/document.md"
	)
	tests := []struct {
		name     string
		resource *types.StoredResource
		want     string
	}{
		{
			name: "tenant mismatch",
			resource: &types.StoredResource{
				TenantID: 2, PhysicalPath: "storage://" + backendID + "/" + innerPath,
			},
			want: "tenant mismatch",
		},
		{
			name: "backend mismatch",
			resource: &types.StoredResource{
				TenantID: 1, StorageBackendID: "another-backend",
				Provider: "s3", PhysicalPath: "storage://" + backendID + "/" + innerPath,
			},
			want: "storage backend mismatch",
		},
		{
			name: "provider mismatch",
			resource: &types.StoredResource{
				TenantID: 1, StorageBackendID: backendID,
				Provider: "local", PhysicalPath: "storage://" + backendID + "/" + innerPath,
			},
			want: "storage provider mismatch",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			resolver := &strictDeleteStorageResolver{svc: &strictDeleteFileService{}}
			svc := strictDeleteService(&strictDeleteKnowledgeRepo{}, &strictDeleteEngine{})
			svc.resourceCatalog = &strictDeleteResourceCatalog{resource: test.resource}
			svc.storageResolver = resolver

			_, _, err := svc.resolveFileServiceForPersistedPath(context.Background(), 1, resourceRef)

			require.Error(t, err)
			assert.Contains(t, err.Error(), test.want)
			assert.Zero(t, resolver.resolveCallCount)
		})
	}
}

func TestProcessKBDeleteNonStrictRetainsRowsWhenVectorCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	engine := &strictDeleteEngine{err: errors.New("vector backend unavailable")}
	svc := strictDeleteService(knowledgeRepo, engine)

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, false))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "vector backend unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall, "ordinary deletion must preserve rows and usage for a retry")
}

func TestProcessKBDeleteNonStrictRetainsRowsWhenChunkCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	chunkRepo := &strictDeleteChunkRepo{chunkErr: errors.New("chunks unavailable")}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.chunkRepo = chunkRepo

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, false))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "chunks unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
}

func TestProcessKBDeleteNonStrictRetainsRowsWhenFileCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	fileSvc := &strictDeleteFileService{err: errors.New("object store unavailable")}
	chunkRepo := &strictDeleteChunkRepo{}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.fileSvc = fileSvc
	svc.chunkRepo = chunkRepo

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, false))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "object store unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall, "ordinary cleanup must retain rows for a retry")
	assert.Zero(t, chunkRepo.chunkCalls, "chunk/image metadata must remain for a retry")
}

func TestProcessKBDeleteNonStrictRetainsImageMetadataWhenImageCleanupFails(t *testing.T) {
	knowledge := strictDeleteKnowledge()
	knowledge.FilePath = ""
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{knowledge}}
	chunkRepo := &strictDeleteChunkRepo{
		imageInfo: []interfaces.ChunkImageInfo{{
			KnowledgeID: knowledge.ID,
			ImageInfo:   `[{"url":"r2://bucket/image.png"}]`,
		}},
	}
	fileSvc := &strictDeleteFileService{err: errors.New("R2 unavailable")}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.chunkRepo = chunkRepo
	svc.fileSvc = fileSvc

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, false))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "R2 unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
	assert.Zero(t, chunkRepo.chunkCalls, "image metadata must remain available for a retry")
}

func TestProcessKBDeleteNonStrictRetainsRowsWhenGraphCleanupFails(t *testing.T) {
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.chunkRepo = &strictDeleteChunkRepo{}
	svc.graphEngine = strictDeleteGraph{err: errors.New("graph unavailable")}

	err := svc.ProcessKBDelete(context.Background(), strictDeletePayload(t, false))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "graph unavailable")
	assert.Zero(t, knowledgeRepo.deleteCall)
}

func TestDeleteFileIdempotentNormalizesAlreadyAbsentObjects(t *testing.T) {
	fileSvc := &strictDeleteFileService{err: errors.Join(errors.New("delete failed"), fs.ErrNotExist)}
	require.NoError(t, deleteFileIdempotent(context.Background(), fileSvc, "local://gone"))
}

func TestStrictDeletePayloadIsOptIn(t *testing.T) {
	strictTask := strictDeletePayload(t, true)
	ordinaryTask := strictDeletePayload(t, false)
	var strict, ordinary types.KBDeletePayload
	require.NoError(t, json.Unmarshal(strictTask.Payload(), &strict))
	require.NoError(t, json.Unmarshal(ordinaryTask.Payload(), &ordinary))
	assert.True(t, strict.Strict)
	assert.False(t, ordinary.Strict)
}

func TestStrictDeleteRunsInOuterWorkerAndFailsClosedBeforeSoftDelete(t *testing.T) {
	for _, tc := range []struct {
		name      string
		engineErr error
		wantErr   bool
	}{
		{name: "cleanup unavailable", engineErr: errors.New("vector unavailable"), wantErr: true},
		{name: "cleanup succeeds", wantErr: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			kbRepo := &kbDeleteKBRepo{fakeKBRepo: *newFakeKBRepo()}
			storeID := "00000000-0000-0000-0000-0000000000aa"
			kbRepo.rows["kb-strict"] = &types.KnowledgeBase{
				ID: "kb-strict", TenantID: 1, Name: "strict", VectorStoreID: &storeID,
			}
			knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
			queue := &strictDeleteObservingEnqueuer{rows: kbRepo.rows}
			svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{err: tc.engineErr})
			svc.repo = kbRepo
			svc.asynqClient = queue

			err := svc.DeleteKnowledgeBaseForAccountErasure(ctxWithTenantStorage(1, "local"), "kb-strict")
			if tc.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "vector unavailable")
				assert.NotNil(t, kbRepo.rows["kb-strict"], "cleanup failure must retain the KB for the outer task retry")
			} else {
				require.NoError(t, err)
				assert.Nil(t, kbRepo.rows["kb-strict"], "strict delete is soft-deleted only after cleanup")
			}
			assert.Empty(t, queue.tasks, "account erasure must not create a nested KB queue")
		})
	}
}

func TestStrictDeleteRetainsKBWhenUnboundVectorEngineConfigurationIsUnavailable(t *testing.T) {
	kbRepo := &kbDeleteKBRepo{fakeKBRepo: *newFakeKBRepo()}
	kbRepo.rows["kb-strict"] = &types.KnowledgeBase{ID: "kb-strict", TenantID: 1, Name: "strict"}
	knowledgeRepo := &strictDeleteKnowledgeRepo{items: []*types.Knowledge{strictDeleteKnowledge()}}
	svc := strictDeleteService(knowledgeRepo, &strictDeleteEngine{})
	svc.repo = kbRepo

	err := svc.DeleteKnowledgeBaseForAccountErasure(ctxWithTenantStorage(1, "local"), "kb-strict")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "vector cleanup engine configuration is unavailable")
	assert.NotNil(t, kbRepo.rows["kb-strict"], "cleanup failure must retain the KB for the outer task retry")
}

func TestStrictDeleteRequiresDataSourceCleanupBeforeSoftDelete(t *testing.T) {
	kbRepo := &kbDeleteKBRepo{fakeKBRepo: *newFakeKBRepo()}
	kbRepo.rows["kb-strict"] = &types.KnowledgeBase{ID: "kb-strict", TenantID: 1, Name: "strict"}
	dsRepo := &kbDeleteDSRepo{byKB: map[string][]*types.DataSource{
		"kb-strict": {{ID: "ds-strict", KnowledgeBaseID: "kb-strict"}},
	}, deleted: map[string]bool{}}
	queue := &strictDeleteObservingEnqueuer{rows: kbRepo.rows}
	svc := strictDeleteService(&strictDeleteKnowledgeRepo{}, &strictDeleteEngine{})
	svc.repo = kbRepo
	svc.dsRepo = dsRepo
	svc.asynqClient = queue

	require.NoError(t, svc.DeleteKnowledgeBaseForAccountErasure(ctxWithTenantStorage(1, "local"), "kb-strict"))
	assert.Nil(t, kbRepo.rows["kb-strict"])
	assert.Contains(t, dsRepo.deleteIDs, "ds-strict")
}

func TestStrictDeleteRetainsKBWhenDataSourceCleanupFails(t *testing.T) {
	kbRepo := &kbDeleteKBRepo{fakeKBRepo: *newFakeKBRepo()}
	kbRepo.rows["kb-strict"] = &types.KnowledgeBase{ID: "kb-strict", TenantID: 1, Name: "strict"}
	inner := newKBDeleteDSRepo("kb-strict", &types.DataSource{ID: "ds-strict", KnowledgeBaseID: "kb-strict"})
	dsRepo := strictDeleteFailingDataSourceRepo{inner: inner, deleteErr: errors.New("data source delete unavailable")}
	queue := &strictDeleteObservingEnqueuer{rows: kbRepo.rows}
	svc := &knowledgeBaseService{
		repo:            kbRepo,
		dsRepo:          dsRepo,
		asynqClient:     queue,
		taskPendingRepo: strictDeleteTaskPendingRepo{},
	}

	err := svc.DeleteKnowledgeBaseForAccountErasure(ctxWithTenantStorage(1, "local"), "kb-strict")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "data source delete unavailable")
	assert.NotNil(t, kbRepo.rows["kb-strict"], "strict cleanup must not hide a KB with unfinished datasource cleanup")
	assert.Empty(t, queue.tasks)
}

func TestStrictDeleteRetainsKBWhenDurableTaskCleanupFails(t *testing.T) {
	kbRepo := &kbDeleteKBRepo{fakeKBRepo: *newFakeKBRepo()}
	kbRepo.rows["kb-strict"] = &types.KnowledgeBase{ID: "kb-strict", TenantID: 1, Name: "strict"}
	queue := &strictDeleteObservingEnqueuer{rows: kbRepo.rows}
	svc := &knowledgeBaseService{
		repo:            kbRepo,
		asynqClient:     queue,
		taskPendingRepo: strictDeleteTaskPendingRepo{err: errors.New("durable queue unavailable")},
	}

	err := svc.DeleteKnowledgeBaseForAccountErasure(ctxWithTenantStorage(1, "local"), "kb-strict")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "durable queue unavailable")
	assert.NotNil(t, kbRepo.rows["kb-strict"])
	assert.Empty(t, queue.tasks)
}

// Keep the otherwise-unused imported package in this focused test file tied to
// the same type contract as the production code. This catches accidental
// removal of the embedding model seam while allowing the test's lightweight
// model stub above to satisfy the interface.
var _ embedding.Embedder = kbCleanupEmbedder{}
