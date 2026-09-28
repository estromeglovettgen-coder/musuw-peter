package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type createKnowledgeFileRepoStub struct {
	interfaces.KnowledgeRepository

	createCalls            int
	createWithStorageCalls int
	createStorageQuota     int64
	createErr              error
	createErrs             []error
	createdKnowledge       *types.Knowledge
	knowledgeByID          *types.Knowledge
	getKnowledgeErr        error
	updatedKnowledge       *types.Knowledge
}

func (r *createKnowledgeFileRepoStub) CheckKnowledgeExists(
	ctx context.Context,
	tenantID uint64,
	kbID string,
	params *types.KnowledgeCheckParams,
) (bool, *types.Knowledge, error) {
	return false, nil, nil
}

func (r *createKnowledgeFileRepoStub) CreateKnowledge(ctx context.Context, knowledge *types.Knowledge) error {
	r.createCalls++
	copied := *knowledge
	r.createdKnowledge = &copied
	return r.createErr
}

func (r *createKnowledgeFileRepoStub) CreateURLKnowledgeIfAbsent(
	ctx context.Context,
	knowledge *types.Knowledge,
	_ *types.KnowledgeCheckParams,
) (*types.Knowledge, bool, error) {
	if err := r.CreateKnowledge(ctx, knowledge); err != nil {
		return nil, false, err
	}
	return knowledge, true, nil
}

func (r *createKnowledgeFileRepoStub) CreateKnowledgeWithStorage(
	ctx context.Context,
	knowledge *types.Knowledge,
	effectiveQuota int64,
) error {
	r.createWithStorageCalls++
	r.createStorageQuota = effectiveQuota
	r.createCalls++
	copied := *knowledge
	r.createdKnowledge = &copied
	if len(r.createErrs) > 0 {
		err := r.createErrs[0]
		r.createErrs = r.createErrs[1:]
		return err
	}
	if r.createErr != nil {
		return r.createErr
	}
	r.knowledgeByID = &copied
	return nil
}

func (r *createKnowledgeFileRepoStub) GetKnowledgeByID(
	_ context.Context,
	tenantID uint64,
	id string,
) (*types.Knowledge, error) {
	if r.getKnowledgeErr != nil {
		return nil, r.getKnowledgeErr
	}
	if r.knowledgeByID == nil || r.knowledgeByID.TenantID != tenantID || r.knowledgeByID.ID != id {
		return nil, errors.New("knowledge not found")
	}
	copied := *r.knowledgeByID
	return &copied, nil
}

func (r *createKnowledgeFileRepoStub) UpdateKnowledge(_ context.Context, knowledge *types.Knowledge) error {
	if knowledge == nil {
		return nil
	}
	copied := *knowledge
	r.updatedKnowledge = &copied
	return nil
}

// GetKnowledgeTags is invoked by setAndAttachKnowledgeTags after create even
// when no tags were supplied; a fresh knowledge has none, so return empty.
func (r *createKnowledgeFileRepoStub) GetKnowledgeTags(
	ctx context.Context,
	knowledgeIDs []string,
) (map[string][]*types.KnowledgeTag, error) {
	return map[string][]*types.KnowledgeTag{}, nil
}

type createKnowledgeFileKBServiceStub struct {
	interfaces.KnowledgeBaseService

	kb *types.KnowledgeBase
}

func (s *createKnowledgeFileKBServiceStub) GetKnowledgeBaseByID(
	ctx context.Context,
	id string,
) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

type createKnowledgeFileServiceStub struct {
	saveErr              error
	saveCalls            int
	savedWithKnowledgeID string
	deleteCalls          int
	deletedPath          string
}

func (s *createKnowledgeFileServiceStub) CheckConnectivity(ctx context.Context) error {
	return nil
}

func (s *createKnowledgeFileServiceStub) SaveFile(
	ctx context.Context,
	file *multipart.FileHeader,
	tenantID uint64,
	knowledgeID string,
) (string, error) {
	s.saveCalls++
	s.savedWithKnowledgeID = knowledgeID
	if s.saveErr != nil {
		return "", s.saveErr
	}
	return "stored/" + knowledgeID, nil
}

func (s *createKnowledgeFileServiceStub) SaveBytes(
	ctx context.Context,
	data []byte,
	tenantID uint64,
	fileName string,
	temp bool,
) (string, error) {
	return "", errors.New("not implemented")
}

func (s *createKnowledgeFileServiceStub) GetFile(ctx context.Context, filePath string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}

func (s *createKnowledgeFileServiceStub) GetFileURL(ctx context.Context, filePath string) (string, error) {
	return "", errors.New("not implemented")
}

func (s *createKnowledgeFileServiceStub) DeleteFile(ctx context.Context, filePath string) error {
	s.deleteCalls++
	s.deletedPath = filePath
	return nil
}

func (s *createKnowledgeFileServiceStub) CopyFile(ctx context.Context, srcPath string, tenantID uint64, knowledgeID string) (string, error) {
	return "", errors.New("not implemented")
}

type createKnowledgeTaskEnqueuerStub struct {
	calls   int
	errs    []error
	infos   []*asynq.TaskInfo
	taskIDs []string
}

func (s *createKnowledgeTaskEnqueuerStub) Enqueue(
	task *asynq.Task,
	opts ...asynq.Option,
) (*asynq.TaskInfo, error) {
	s.calls++
	for _, opt := range opts {
		if opt.Type() == asynq.TaskIDOpt {
			if id, ok := opt.Value().(string); ok {
				s.taskIDs = append(s.taskIDs, id)
			}
		}
	}
	if len(s.errs) > 0 {
		err := s.errs[0]
		s.errs = s.errs[1:]
		if err != nil {
			return nil, err
		}
	}
	info := &asynq.TaskInfo{ID: "task-1", Queue: "default"}
	s.infos = append(s.infos, info)
	return info, nil
}

func TestCreateKnowledgeFromFileDoesNotPersistWhenStorageSaveFails(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{saveErr: errors.New("storage unavailable")}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
	}

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(),
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "hello"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.Error(t, err)
	require.Nil(t, knowledge)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.Zero(t, repo.createCalls)
}

func TestCreateKnowledgeFromFilePersistsStoredFilePathOnCreate(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
		task:      task,
	}

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(),
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "hello"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.NotEmpty(t, fileSvc.savedWithKnowledgeID)
	require.Equal(t, fileSvc.savedWithKnowledgeID, knowledge.ID)
	require.Equal(t, 1, repo.createCalls)
	require.Equal(t, 1, repo.createWithStorageCalls)
	require.NotNil(t, repo.createdKnowledge)
	require.Equal(t, "stored/"+knowledge.ID, repo.createdKnowledge.FilePath)
	require.Equal(t, int64(len("hello")), repo.createdKnowledge.FileSize)
	require.Equal(t, 1, task.calls)
}

func TestCreateKnowledgeFromFileRejectsWhenSourceWouldExceedQuota(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
	}
	ctx := context.WithValue(newCreateKnowledgeFileContext(), types.TenantInfoContextKey, &types.Tenant{
		ID:           1,
		StorageUsed:  8,
		StorageQuota: 10,
	})

	knowledge, err := svc.CreateKnowledgeFromFile(
		ctx,
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "three"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	var quotaErr *types.StorageQuotaExceededError
	require.ErrorAs(t, err, &quotaErr)
	require.Nil(t, knowledge)
	require.Zero(t, fileSvc.saveCalls, "quota admission must happen before storing the source")
	require.Zero(t, repo.createWithStorageCalls)
}

func TestCreateKnowledgeFromFileAllowsExactQuotaBoundary(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
		task:      task,
	}
	ctx := context.WithValue(newCreateKnowledgeFileContext(), types.TenantInfoContextKey, &types.Tenant{
		ID:           1,
		StorageUsed:  5,
		StorageQuota: 10,
	})

	knowledge, err := svc.CreateKnowledgeFromFile(
		ctx,
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "hello"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.Equal(t, 1, repo.createWithStorageCalls)
	require.Equal(t, int64(10), repo.createStorageQuota)
}

func TestCreateKnowledgeFromFileAcceptsSupportedVideo(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	svc := &knowledgeService{
		repo: repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{
			ID:        "kb-1",
			VLMConfig: types.VLMConfig{Enabled: true, ModelID: "builtin-openrouter-vlm"},
		}},
		fileSvc: fileSvc,
		task:    task,
	}

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(),
		"kb-1",
		newMultipartFileHeader(t, "clip.mp4", "tiny video"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, "mp4", knowledge.FileType)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.Equal(t, 1, repo.createCalls)
	require.Equal(t, 1, task.calls)
}

func TestCreateKnowledgeFromFileRejectsVideoOverProductLimitBeforeReadingOrSaving(t *testing.T) {
	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
	}
	file := newMultipartFileHeader(t, "clip.mp4", "tiny placeholder")
	file.Size = 300_000_001

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(), "kb-1", file, nil, nil, "", nil, "", nil,
	)

	require.Error(t, err)
	require.ErrorContains(t, err, VideoTooLargePublicMessage)
	require.Nil(t, knowledge)
	require.Zero(t, fileSvc.saveCalls)
	require.Zero(t, repo.createCalls)
}

func TestCreateKnowledgeFromImageFallsBackWhenLegacyStorageConfigIsIncomplete(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	kb := &types.KnowledgeBase{
		ID:        "kb-1",
		VLMConfig: types.VLMConfig{Enabled: true, ModelID: "vlm-1"},
	}
	kb.SetStorageProvider("cos")
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: kb},
		fileSvc:   fileSvc,
		task:      task,
	}
	ctx := context.WithValue(newCreateKnowledgeFileContext(), types.TenantInfoContextKey, &types.Tenant{
		StorageEngineConfig: &types.StorageEngineConfig{
			DefaultProvider: "cos",
			COS:             &types.COSEngineConfig{SecretID: "incomplete"},
		},
	})

	knowledge, err := svc.CreateKnowledgeFromFile(
		ctx,
		"kb-1",
		newMultipartFileHeader(t, "image.png", "image bytes"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.Equal(t, 1, repo.createCalls)
	require.Equal(t, 1, task.calls)
}

func TestCreateKnowledgeFromFileDeletesStoredFileWhenCreateFails(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{createErr: errors.New("database unavailable")}
	fileSvc := &createKnowledgeFileServiceStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
	}

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(),
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "hello"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.EqualError(t, err, "database unavailable")
	require.Nil(t, knowledge)
	require.Equal(t, 1, fileSvc.saveCalls)
	require.Equal(t, 1, repo.createWithStorageCalls)
	require.Equal(t, 1, fileSvc.deleteCalls)
	require.Equal(t, "stored/"+fileSvc.savedWithKnowledgeID, fileSvc.deletedPath)
}

func TestCreateKnowledgeFromFile_PersistsProcessOverrides(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	fileSvc := &createKnowledgeFileServiceStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   fileSvc,
		task:      task,
	}

	chunkSize := 512
	overrides := &types.KnowledgeProcessOverrides{
		ChunkingConfig: &types.ChunkingConfig{ChunkSize: chunkSize},
	}

	knowledge, err := svc.CreateKnowledgeFromFile(
		newCreateKnowledgeFileContext(),
		"kb-1",
		newMultipartFileHeader(t, "doc.txt", "hello"),
		map[string]string{"source": "test"},
		nil,
		"",
		nil,
		"",
		overrides,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, repo.createCalls)
	require.NotNil(t, repo.createdKnowledge)

	parsed, err := repo.createdKnowledge.ProcessOverrides()
	require.NoError(t, err)
	require.NotNil(t, parsed)
	require.NotNil(t, parsed.ChunkingConfig)
	require.Equal(t, chunkSize, parsed.ChunkingConfig.ChunkSize)

	metadataMap, err := repo.createdKnowledge.Metadata.Map()
	require.NoError(t, err)
	require.Equal(t, "test", metadataMap["source"])
}

func newStoredKnowledgeService(repo interfaces.KnowledgeRepository, task interfaces.TaskEnqueuer) *knowledgeService {
	return &knowledgeService{
		repo: repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{
			ID:        "kb-1",
			VLMConfig: types.VLMConfig{Enabled: true, ModelID: "vlm-1"},
		}},
		fileSvc: &createKnowledgeFileServiceStub{},
		task:    task,
	}
}

func TestCreateKnowledgeFromStoredObjectUsesUploadIDAsKnowledgeID(t *testing.T) {
	t.Parallel()

	const uploadID = "direct-intent-1"
	repo := &createKnowledgeFileRepoStub{}
	task := &createKnowledgeTaskEnqueuerStub{}
	svc := newStoredKnowledgeService(repo, task)
	deleted := false

	knowledge, err := svc.CreateKnowledgeFromStoredObject(
		newCreateKnowledgeFileContext(),
		uploadID,
		"kb-1",
		"clip.mp4",
		6,
		"video/mp4",
		"s3://bucket/direct/"+uploadID,
		"etag-1",
		func(context.Context) error { deleted = true; return nil },
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, uploadID, knowledge.ID)
	require.NotNil(t, repo.createdKnowledge)
	require.Equal(t, uploadID, repo.createdKnowledge.ID)
	require.Equal(t, 1, task.calls)
	require.Equal(t, []string{directKnowledgeProcessTaskID(uploadID)}, task.taskIDs)
	require.False(t, deleted, "an adopted source must not be cleaned up")
}

func TestCreateKnowledgeFromStoredObjectRecoversConcurrentInsertAndTaskConflict(t *testing.T) {
	t.Parallel()

	const uploadID = "direct-intent-replay"
	const filePath = "s3://bucket/direct/" + uploadID
	existing := &types.Knowledge{
		ID:              uploadID,
		TenantID:        1,
		KnowledgeBaseID: "kb-1",
		Type:            "file",
		FileName:        "clip.mp4",
		FileType:        "mp4",
		FileSize:        6,
		FilePath:        filePath,
		ParseStatus:     types.ParseStatusPending,
	}
	repo := &createKnowledgeFileRepoStub{
		createErr:     errors.New("UNIQUE constraint failed: knowledge.id"),
		knowledgeByID: existing,
	}
	task := &createKnowledgeTaskEnqueuerStub{errs: []error{asynq.ErrTaskIDConflict}}
	svc := newStoredKnowledgeService(repo, task)
	deleted := false

	knowledge, err := svc.CreateKnowledgeFromStoredObject(
		newCreateKnowledgeFileContext(),
		uploadID,
		"kb-1",
		"clip.mp4",
		6,
		"video/mp4",
		filePath,
		"etag-1",
		func(context.Context) error { deleted = true; return nil },
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, uploadID, knowledge.ID)
	require.Equal(t, 1, repo.createWithStorageCalls)
	require.Equal(t, 1, task.calls, "the loser should continue through the deterministic enqueue")
	require.Equal(t, []string{directKnowledgeProcessTaskID(uploadID)}, task.taskIDs)
	require.False(t, deleted, "a concurrent winner owns the object")
}

func TestCreateKnowledgeFromStoredObjectRetriesTransientEnqueueWithoutDeletingSource(t *testing.T) {
	t.Parallel()

	repo := &createKnowledgeFileRepoStub{}
	task := &createKnowledgeTaskEnqueuerStub{errs: []error{
		errors.New("temporary queue failure"),
		errors.New("temporary queue failure"),
		nil,
	}}
	svc := newStoredKnowledgeService(repo, task)
	deleted := false

	_, err := svc.CreateKnowledgeFromStoredObject(
		newCreateKnowledgeFileContext(),
		"direct-intent-retry",
		"kb-1",
		"clip.mp4",
		6,
		"video/mp4",
		"s3://bucket/direct/retry",
		"etag-1",
		func(context.Context) error { deleted = true; return nil },
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.Equal(t, 3, task.calls)
	require.Equal(t, []string{
		directKnowledgeProcessTaskID("direct-intent-retry"),
		directKnowledgeProcessTaskID("direct-intent-retry"),
		directKnowledgeProcessTaskID("direct-intent-retry"),
	}, task.taskIDs)
	require.False(t, deleted, "enqueue retries happen after ownership transfer")
}

func newCreateKnowledgeFileContext() context.Context {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{})
	return ctx
}

func newMultipartFileHeader(t *testing.T, filename string, content string) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write([]byte(content))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	req := httptest.NewRequest("POST", "/", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	require.NoError(t, req.ParseMultipartForm(1024))
	return req.MultipartForm.File["file"][0]
}
