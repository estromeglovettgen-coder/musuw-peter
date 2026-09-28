package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	filesvc "github.com/Tencent/WeKnora/internal/application/service/file"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type directUploadStoreStub struct {
	putURL       string
	partURL      string
	head         filesvc.PresignedObjectInfo
	createID     string
	createdParts []filesvc.CompletedObjectPart
	aborted      bool
	completed    bool
	deleted      bool
	objectPath   string
	headErr      error
	headErrOnce  bool
	completeErr  error
	presignCalls int
}

func (s *directUploadStoreStub) PresignPutObject(
	context.Context,
	string,
	string,
	int64,
	time.Duration,
) (filesvc.PresignedObjectRequest, error) {
	s.presignCalls++
	return filesvc.PresignedObjectRequest{
		URL:    s.putURL,
		Method: http.MethodPut,
		Headers: map[string]string{
			"Content-Type": "video/mp4",
		},
	}, nil
}

func (s *directUploadStoreStub) HeadObject(context.Context, string) (filesvc.PresignedObjectInfo, error) {
	if s.headErr != nil {
		if s.headErrOnce {
			err := s.headErr
			s.headErr = nil
			return filesvc.PresignedObjectInfo{}, err
		}
		return filesvc.PresignedObjectInfo{}, s.headErr
	}
	return s.head, nil
}

func (s *directUploadStoreStub) ObjectPath(string) string {
	if s.objectPath != "" {
		return s.objectPath
	}
	return "s3://bucket/direct/object"
}

func (s *directUploadStoreStub) DeleteObject(context.Context, string) error {
	s.deleted = true
	return nil
}

func (s *directUploadStoreStub) CreateMultipartUpload(context.Context, string, string) (string, error) {
	return s.createID, nil
}

func (s *directUploadStoreStub) PresignUploadPart(
	context.Context,
	string,
	string,
	int32,
	int64,
	time.Duration,
) (filesvc.PresignedObjectRequest, error) {
	return filesvc.PresignedObjectRequest{URL: s.partURL, Method: http.MethodPut, Headers: map[string]string{}}, nil
}

func (s *directUploadStoreStub) CompleteMultipartUpload(
	_ context.Context,
	_ string,
	_ string,
	parts []filesvc.CompletedObjectPart,
) error {
	if s.completeErr != nil {
		return s.completeErr
	}
	s.completed = true
	s.createdParts = append([]filesvc.CompletedObjectPart(nil), parts...)
	return nil
}

func (s *directUploadStoreStub) AbortMultipartUpload(context.Context, string, string) error {
	s.aborted = true
	return nil
}

func directUploadTestHandler(store *directUploadStoreStub) *DirectUploadHandler {
	return NewDirectUploadHandlerWithFactory(
		func(context.Context, *types.Tenant, string, string) (filesvc.PresignedObjectStore, error) {
			return store, nil
		},
		[]byte("direct-upload-test-secret"),
	)
}

type directUploadKnowledgeBaseStub struct {
	interfaces.KnowledgeBaseService
	kb *types.KnowledgeBase
}

func (s *directUploadKnowledgeBaseStub) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

type directUploadCreatorStub struct {
	interfaces.StoredKnowledgeCreator
	calls        int
	uploadID     string
	preflightErr error
}

func (s *directUploadCreatorStub) ValidateStoredKnowledgeUpload(context.Context, string, string, int64, string) error {
	return s.preflightErr
}

func (s *directUploadCreatorStub) CreateKnowledgeFromStoredObject(
	ctx context.Context,
	uploadID string,
	kbID string,
	fileName string,
	size int64,
	contentType string,
	filePath string,
	etag string,
	deleter interfaces.StoredObjectDeleter,
	metadata map[string]string,
	enableMultimodel *bool,
	customFileName string,
	tagIDs []string,
	channel string,
	processOverrides *types.KnowledgeProcessOverrides,
) (*types.Knowledge, error) {
	_ = ctx
	_ = kbID
	_ = fileName
	_ = size
	_ = contentType
	_ = filePath
	_ = etag
	_ = deleter
	_ = metadata
	_ = enableMultimodel
	_ = customFileName
	_ = tagIDs
	_ = channel
	_ = processOverrides
	s.calls++
	s.uploadID = uploadID
	return &types.Knowledge{ID: "knowledge-1"}, nil
}

func TestDirectUploadCreateRejectsBeforeSigningWhenPreflightFails(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	creator := &directUploadCreatorStub{
		preflightErr: apperrors.NewForbiddenError(
			"Free plan does not support video upload",
		),
	}
	h := directUploadTestHandler(store)
	h.kbService = &directUploadKnowledgeBaseStub{kb: &types.KnowledgeBase{ID: "kb-1", TenantID: 42}}
	h.creator = creator
	body := `{"knowledge_base_id":"kb-1","file_name":"clip.mp4","size":60000000,` +
		`"content_type":"video/mp4","kind":"video"}`
	c, recorder := directUploadContext(
		http.MethodPost,
		"/api/v1/knowledge-bases/kb-1/knowledge/uploads",
		body,
		42,
	)
	c.Params = gin.Params{{Key: "id", Value: "kb-1"}}

	h.Create(c)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body=%s", recorder.Code, recorder.Body.String())
	}
	if store.presignCalls != 0 {
		t.Fatalf("presign calls = %d, want 0", store.presignCalls)
	}
}

func directUploadContext(method, path string, body string, tenantID uint64) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = req.WithContext(context.WithValue(req.Context(), types.TenantIDContextKey, tenantID))
	c.Set(types.TenantIDContextKey.String(), tenantID)
	return c, recorder
}

func TestDirectUploadCreateRejectsVideoAboveExactLimit(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":300000001,"content_type":"video/mp4"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)

	h.Create(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
	if store.putURL != "https://r2.example/put" {
		t.Fatal("test setup unexpectedly changed")
	}
}

func TestDirectUploadCreateAllowsVideoAtExactLimit(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":300000000,"content_type":"video/mp4"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)

	h.Create(c)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestDirectUploadCreateRejectsDocumentSpoofedAsVideo(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"manual.pdf","size":60000000,` +
		`"content_type":"application/pdf","kind":"video"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 7)

	h.Create(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestDirectUploadCreateAllowsDocumentAtExisting50MiBBoundary(t *testing.T) {
	store := &directUploadStoreStub{
		putURL: "https://r2.example/put",
		head: filesvc.PresignedObjectInfo{
			Size:        50 * 1024 * 1024,
			ContentType: "application/pdf",
		},
	}
	h := directUploadTestHandler(store)
	body := `{"file_name":"manual.pdf","size":52428800,"content_type":"application/pdf"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 7)

	h.Create(c)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"url":"https://r2.example/put"`) {
		t.Fatalf("response did not include presigned URL: %s", recorder.Body.String())
	}
}

func TestDirectUploadDocumentErrorsNeverUseVideoCopy(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"manual.pdf","size":52428801,"content_type":"application/pdf"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 7)

	h.Create(c)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "视频") {
		t.Fatalf("document error used video copy: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), directUploadFileTooLargePublicMessage) {
		t.Fatalf("document size error was not sanitized: %s", recorder.Body.String())
	}
}

func TestDirectUploadCompleteRejectsTokenFromAnotherTenant(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":1024,"content_type":"video/mp4"}`
	createCtx, createRecorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)
	h.Create(createCtx)
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")

	completeBody := `{"token":"` + token + `"}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/api/v1/uploads/other/complete",
		completeBody,
		99,
	)
	h.Complete(completeCtx)

	if completeRecorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body=%s", completeRecorder.Code, completeRecorder.Body.String())
	}
}

func TestDirectUploadMultipartCompleteHeadsExactObject(t *testing.T) {
	store := &directUploadStoreStub{
		createID:    "r2-mpu-1",
		partURL:     "https://r2.example/part",
		head:        filesvc.PresignedObjectInfo{Size: 16 * 1024 * 1024, ContentType: "video/mp4", ETag: "etag-final"},
		headErr:     errors.New("object not finalized"),
		headErrOnce: true,
	}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":16777216,` +
		`"content_type":"video/mp4","multipart":true}`
	createCtx, createRecorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)
	h.Create(createCtx)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201; body=%s", createRecorder.Code, createRecorder.Body.String())
	}
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")
	id := extractDirectUploadJSONField(t, createRecorder.Body.String(), "id")

	completeBody := `{"token":"` + token +
		`","parts":[{"part_number":1,"etag":"etag-1"},` +
		`{"part_number":2,"etag":"etag-2"}]}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/api/v1/uploads/"+id+"/complete",
		completeBody,
		42,
	)
	h.Complete(completeCtx)

	if completeRecorder.Code != http.StatusOK {
		t.Fatalf("complete status = %d, want 200; body=%s", completeRecorder.Code, completeRecorder.Body.String())
	}
	if !store.completed || len(store.createdParts) != 2 {
		t.Fatalf(
			"multipart completion was not forwarded: completed=%t parts=%d",
			store.completed,
			len(store.createdParts),
		)
	}
	responseBody := completeRecorder.Body.String()
	if !strings.Contains(responseBody, `"size":16777216`) ||
		!strings.Contains(responseBody, `"etag":"etag-final"`) {
		t.Fatalf("completion did not return HEAD metadata: %s", responseBody)
	}
}

func TestDirectUploadCompleteDoesNotDeleteObjectOnHeadMismatch(t *testing.T) {
	store := &directUploadStoreStub{
		putURL: "https://r2.example/put",
		head:   filesvc.PresignedObjectInfo{Size: 1, ContentType: "video/mp4"},
	}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":1024,"content_type":"video/mp4"}`
	createCtx, createRecorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)
	h.Create(createCtx)
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")
	id := extractDirectUploadJSONField(t, createRecorder.Body.String(), "id")

	completeBody := `{"token":"` + token + `"}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/api/v1/uploads/"+id+"/complete",
		completeBody,
		42,
	)
	h.Complete(completeCtx)

	if completeRecorder.Code != http.StatusBadRequest || store.deleted {
		t.Fatalf(
			"status=%d deleted=%t body=%s; want 400 without cleanup",
			completeRecorder.Code,
			store.deleted,
			completeRecorder.Body.String(),
		)
	}
}

func TestDirectUploadMultipartCompleteTreatsLostResponseAsSuccess(t *testing.T) {
	store := &directUploadStoreStub{
		createID:    "r2-mpu-lost-response",
		partURL:     "https://r2.example/part",
		head:        filesvc.PresignedObjectInfo{Size: 16 * 1024 * 1024, ContentType: "video/mp4", ETag: "etag-final"},
		headErr:     errors.New("object not finalized yet"),
		headErrOnce: true,
		completeErr: errors.New("response lost after remote completion"),
	}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":16777216,` +
		`"content_type":"video/mp4","multipart":true}`
	createCtx, createRecorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)
	h.Create(createCtx)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201; body=%s", createRecorder.Code, createRecorder.Body.String())
	}
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")
	id := extractDirectUploadJSONField(t, createRecorder.Body.String(), "id")

	completeBody := `{"token":"` + token +
		`","parts":[{"part_number":1,"etag":"etag-1"},` +
		`{"part_number":2,"etag":"etag-2"}]}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/api/v1/uploads/"+id+"/complete",
		completeBody,
		42,
	)
	h.Complete(completeCtx)

	if completeRecorder.Code != http.StatusOK || store.deleted {
		t.Fatalf(
			"status=%d deleted=%t body=%s; want idempotent success without cleanup",
			completeRecorder.Code,
			store.deleted,
			completeRecorder.Body.String(),
		)
	}
}

func TestDirectUploadAdoptedTokenReplayCannotDeleteObject(t *testing.T) {
	backendID := "backend-a"
	kb := &types.KnowledgeBase{
		ID:                    "kb-1",
		TenantID:              42,
		StorageBackendID:      &backendID,
		StorageProviderConfig: &types.StorageProviderConfig{Provider: "s3"},
	}
	store := &directUploadStoreStub{
		putURL: "https://r2.example/put",
		head:   filesvc.PresignedObjectInfo{Size: 1024, ContentType: "video/mp4", ETag: "etag-adopted"},
	}
	h := directUploadTestHandler(store)
	h.kbService = &directUploadKnowledgeBaseStub{kb: kb}
	creator := &directUploadCreatorStub{}
	h.creator = creator
	body := `{"knowledge_base_id":"kb-1","file_name":"clip.mp4",` +
		`"size":1024,"content_type":"video/mp4"}`
	createCtx, createRecorder := directUploadContext(
		http.MethodPost,
		"/knowledge-bases/kb-1/knowledge/uploads",
		body,
		42,
	)
	h.Create(createCtx)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201; body=%s", createRecorder.Code, createRecorder.Body.String())
	}
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")
	id := extractDirectUploadJSONField(t, createRecorder.Body.String(), "id")

	completeBody := `{"token":"` + token + `","knowledge_base_id":"kb-1"}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/knowledge-bases/kb-1/knowledge/uploads/"+id+"/complete",
		completeBody,
		42,
	)
	h.Complete(completeCtx)
	if completeRecorder.Code != http.StatusOK || creator.calls != 1 || creator.uploadID != id || store.deleted {
		t.Fatalf(
			"initial completion status=%d creator_calls=%d upload_id=%q want=%q deleted=%t body=%s",
			completeRecorder.Code,
			creator.calls,
			creator.uploadID,
			id,
			store.deleted,
			completeRecorder.Body.String(),
		)
	}

	// A replay with malformed parts must not enter an object cleanup path. The
	// token is intentionally still valid so this exercises replay safety after
	// the object has been adopted by a Knowledge row.
	replayBody := `{"token":"` + token +
		`","knowledge_base_id":"kb-1","parts":` +
		`[{"part_number":1,"etag":"unexpected"}]}`
	replayCtx, replayRecorder := directUploadContext(
		http.MethodPost,
		"/knowledge-bases/kb-1/knowledge/uploads/"+id+"/complete",
		replayBody,
		42,
	)
	h.Complete(replayCtx)
	if replayRecorder.Code != http.StatusBadRequest || store.deleted {
		t.Fatalf(
			"replay status=%d deleted=%t body=%s; want 400 without delete",
			replayRecorder.Code,
			store.deleted,
			replayRecorder.Body.String(),
		)
	}

	store.headErr = errors.New("head transient failure")
	verifyCtx, verifyRecorder := directUploadContext(
		http.MethodHead,
		"/knowledge-bases/kb-1/knowledge/uploads/"+id,
		"",
		42,
	)
	verifyCtx.Request.Header.Set("X-Upload-Token", token)
	h.Verify(verifyCtx)
	if verifyRecorder.Code != http.StatusConflict || store.deleted {
		t.Fatalf(
			"verify status=%d deleted=%t body=%s; want 409 without delete",
			verifyRecorder.Code,
			store.deleted,
			verifyRecorder.Body.String(),
		)
	}
}

func TestDirectUploadRejectsTenantInfoMismatch(t *testing.T) {
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	body := `{"file_name":"clip.mp4","size":1024,"content_type":"video/mp4"}`
	c, recorder := directUploadContext(http.MethodPost, "/api/v1/uploads", body, 42)
	tenantInfo := &types.Tenant{ID: 99}
	c.Request = c.Request.WithContext(
		context.WithValue(c.Request.Context(), types.TenantInfoContextKey, tenantInfo),
	)
	h.Create(c)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestDirectUploadRejectsBackendChangedDuringCompletion(t *testing.T) {
	backendID := "backend-a"
	kb := &types.KnowledgeBase{
		ID:                    "kb-1",
		TenantID:              42,
		StorageBackendID:      &backendID,
		StorageProviderConfig: &types.StorageProviderConfig{Provider: "s3"},
	}
	store := &directUploadStoreStub{putURL: "https://r2.example/put"}
	h := directUploadTestHandler(store)
	h.kbService = &directUploadKnowledgeBaseStub{kb: kb}
	h.creator = &directUploadCreatorStub{}
	body := `{"knowledge_base_id":"kb-1","file_name":"clip.mp4",` +
		`"size":1024,"content_type":"video/mp4"}`
	createCtx, createRecorder := directUploadContext(
		http.MethodPost,
		"/knowledge-bases/kb-1/knowledge/uploads",
		body,
		42,
	)
	h.Create(createCtx)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201; body=%s", createRecorder.Code, createRecorder.Body.String())
	}
	token := extractDirectUploadJSONField(t, createRecorder.Body.String(), "token")
	id := extractDirectUploadJSONField(t, createRecorder.Body.String(), "id")
	backendID = "backend-b"
	completeBody := `{"token":"` + token + `","knowledge_base_id":"kb-1"}`
	completeCtx, completeRecorder := directUploadContext(
		http.MethodPost,
		"/knowledge-bases/kb-1/knowledge/uploads/"+id+"/complete",
		completeBody,
		42,
	)
	h.Complete(completeCtx)
	if completeRecorder.Code != http.StatusConflict || store.deleted {
		t.Fatalf(
			"status=%d deleted=%t body=%s; want 409 without touching object",
			completeRecorder.Code,
			store.deleted,
			completeRecorder.Body.String(),
		)
	}
}

func extractDirectUploadJSONField(t *testing.T, body, field string) string {
	t.Helper()
	needle := `"` + field + `":"`
	start := strings.Index(body, needle)
	if start < 0 {
		t.Fatalf("response missing %s: %s", field, body)
	}
	start += len(needle)
	end := strings.IndexByte(body[start:], '"')
	if end < 0 {
		t.Fatalf("response has unterminated %s: %s", field, body)
	}
	return body[start : start+end]
}
