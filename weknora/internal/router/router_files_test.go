package router

import (
	"context"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

var _ interfaces.FileService = (*stubFileService)(nil)

type stubFileService struct {
	getFile func(ctx context.Context, filePath string) (io.ReadCloser, error)
}

type stubResourceCatalog struct {
	resource *types.StoredResource
}

type stubMessageFileLookup struct {
	get func(ctx context.Context, sessionID, messageID string) (*types.Message, error)
}

func (s *stubMessageFileLookup) GetMessage(
	ctx context.Context,
	sessionID, messageID string,
) (*types.Message, error) {
	return s.get(ctx, sessionID, messageID)
}

type stubSharedAgentFileLookup struct {
	get func(
		ctx context.Context,
		tenantID uint64,
		callerTenantRole types.TenantRole,
		agentID string,
		sourceTenantID ...uint64,
	) (*types.CustomAgent, error)
}

func (s *stubSharedAgentFileLookup) GetSharedAgentForTenant(
	ctx context.Context,
	tenantID uint64,
	callerTenantRole types.TenantRole,
	agentID string,
	sourceTenantID ...uint64,
) (*types.CustomAgent, error) {
	return s.get(ctx, tenantID, callerTenantRole, agentID, sourceTenantID...)
}

func (s *stubResourceCatalog) Register(
	context.Context,
	uint64,
	string,
	interfaces.ResourceRegistration,
) (string, error) {
	panic("unexpected Register")
}

func (s *stubResourceCatalog) Resolve(context.Context, string) (*types.StoredResource, error) {
	return s.resource, nil
}

func (s *stubResourceCatalog) ResolvePath(_ context.Context, value string) (string, *types.StoredResource, error) {
	if _, ok := types.ParseResourcePath(value); ok && s.resource != nil {
		return s.resource.PhysicalPath, s.resource, nil
	}
	return value, nil, nil
}

func (s *stubResourceCatalog) Bind(context.Context, string, string, string, string) error {
	panic("unexpected Bind")
}

func (s *stubResourceCatalog) Release(context.Context, string, string, string) (int64, error) {
	panic("unexpected Release")
}

func (s *stubResourceCatalog) MarkDeleted(context.Context, string) error {
	panic("unexpected MarkDeleted")
}

func (s *stubResourceCatalog) CreateAccessGrant(context.Context, string, time.Duration) (string, error) {
	panic("unexpected CreateAccessGrant")
}

func (s *stubResourceCatalog) ResolveAccessGrant(context.Context, string) (*types.StoredResource, error) {
	return s.resource, nil
}

func (s *stubFileService) CheckConnectivity(ctx context.Context) error {
	return nil
}

func (s *stubFileService) SaveFile(ctx context.Context, file *multipart.FileHeader, tenantID uint64, knowledgeID string) (string, error) {
	panic("unexpected call to SaveFile")
}

func (s *stubFileService) SaveBytes(ctx context.Context, data []byte, tenantID uint64, fileName string, temp bool) (string, error) {
	panic("unexpected call to SaveBytes")
}

func (s *stubFileService) GetFile(ctx context.Context, filePath string) (io.ReadCloser, error) {
	if s.getFile == nil {
		panic("unexpected call to GetFile")
	}
	return s.getFile(ctx, filePath)
}

func (s *stubFileService) GetFileURL(ctx context.Context, filePath string) (string, error) {
	panic("unexpected call to GetFileURL")
}

func (s *stubFileService) DeleteFile(ctx context.Context, filePath string) error {
	panic("unexpected call to DeleteFile")
}

func (s *stubFileService) CopyFile(ctx context.Context, srcPath string, tenantID uint64, knowledgeID string) (string, error) {
	panic("unexpected call to CopyFile")
}

func TestPresignedFileLocalContentLength(t *testing.T) {
	engine, baseDir, signURL := setupPresignedTestServer(t)
	body := strings.Repeat("video-content", 4096)
	storagePath := writeTestFile(t, baseDir, "1/exports/video.mp4", body)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, signURL(storagePath, 1, time.Hour), nil)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			if response.Code != http.StatusOK || response.Header().Get("Content-Length") != strconv.Itoa(len(body)) {
				t.Fatalf("status=%d Content-Length=%q, want 200 and %d", response.Code, response.Header().Get("Content-Length"), len(body))
			}
			wantBody := body
			if method == http.MethodHead {
				wantBody = ""
			}
			if response.Body.String() != wantBody {
				t.Fatalf("%s body length=%d, want %d", method, response.Body.Len(), len(wantBody))
			}
		})
	}
}

type fileLengthTestReader struct {
	reader io.Reader
	reads  int
	closed bool
}

func (r *fileLengthTestReader) Read(p []byte) (int, error) {
	r.reads++
	return r.reader.Read(p)
}

func (r *fileLengthTestReader) Close() error {
	r.closed = true
	return nil
}

func TestStreamStoredFileLengthPreservesReaderPosition(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const body = "prefix-video-content"
	baseDir := t.TempDir()
	writeTestFile(t, baseDir, "video.mp4", body)
	for _, tc := range []struct {
		name       string
		position   int64
		method     string
		wantLength string
	}{
		{name: "offset GET", position: 7, method: http.MethodGet, wantLength: "13"},
		{name: "offset HEAD", position: 7, method: http.MethodHead, wantLength: "13"},
		{name: "past end", position: 25, method: http.MethodGet, wantLength: "0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reader, err := os.Open(filepath.Join(baseDir, "video.mp4"))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = reader.Close() })
			if _, err := reader.Seek(tc.position, io.SeekStart); err != nil {
				t.Fatal(err)
			}
			engine := gin.New()
			engine.Handle(tc.method, "/file", func(c *gin.Context) {
				streamStoredFile(c, reader, "video/mp4", true, "private", "length-test")
			})
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(tc.method, "/file", nil))
			if response.Code != http.StatusOK || response.Header().Get("Content-Length") != tc.wantLength {
				t.Fatalf("status=%d Content-Length=%q, want 200 and %q", response.Code, response.Header().Get("Content-Length"), tc.wantLength)
			}
			wantBody := ""
			if tc.method == http.MethodGet && tc.position < int64(len(body)) {
				wantBody = body[tc.position:]
			}
			if response.Body.String() != wantBody {
				t.Fatalf("body=%q, want %q", response.Body.String(), wantBody)
			}
			if _, err := reader.Stat(); err == nil {
				t.Fatal("streamed file must be closed")
			}
		})
	}
}

func TestStreamStoredFileUnknownLengthKeepsStreaming(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			tracked := &fileLengthTestReader{reader: strings.NewReader("unknown-length-content")}
			engine := gin.New()
			engine.Handle(method, "/file", func(c *gin.Context) {
				streamStoredFile(c, tracked, "video/mp4", true, "private", "length-test")
			})
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(method, "/file", nil))
			if response.Code != http.StatusOK || response.Header().Get("Content-Length") != "" {
				t.Fatalf("status=%d Content-Length=%q, want unchanged streaming response", response.Code, response.Header().Get("Content-Length"))
			}
			if method == http.MethodHead {
				if tracked.reads != 0 || response.Body.Len() != 0 {
					t.Fatal("HEAD must not consume an unknown-length reader")
				}
			} else if response.Body.String() != "unknown-length-content" {
				t.Fatalf("GET body=%q", response.Body.String())
			}
			if !tracked.closed {
				t.Fatal("streamed reader must be closed")
			}
		})
	}
}

func TestServeFilesFallsBackToGlobalFileService(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	engine := gin.New()
	var requestedPath string
	serveFiles(engine, &stubFileService{
		getFile: func(ctx context.Context, filePath string) (io.ReadCloser, error) {
			requestedPath = filePath
			return io.NopCloser(strings.NewReader("fallback-body")), nil
		},
	})

	filePath := "local://42/docs/example.txt"
	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape(filePath), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusOK; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
	if requestedPath != filePath {
		t.Fatalf("requested path = %q, want %q", requestedPath, filePath)
	}
	if body := recorder.Body.String(); body != "fallback-body" {
		t.Fatalf("body = %q, want %q", body, "fallback-body")
	}
}

func TestServeFilesResolvesShortResourceReference(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"
	const physical = "local://42/exports/a.png"

	engine := gin.New()
	var requestedPath string
	serveFilesWithResources(engine, &stubFileService{getFile: func(_ context.Context, path string) (io.ReadCloser, error) {
		requestedPath = path
		return io.NopCloser(strings.NewReader("image")), nil
	}}, nil, &stubResourceCatalog{resource: &types.StoredResource{TenantID: 42, PhysicalPath: physical}})

	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape(ref), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if requestedPath != physical {
		t.Fatalf("requested path = %q, want %q", requestedPath, physical)
	}
}

func TestServeFilesRejectsCrossTenantResourceReference(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"
	engine := gin.New()
	serveFilesWithResources(engine, &stubFileService{getFile: func(context.Context, string) (io.ReadCloser, error) {
		t.Fatal("GetFile should not be called")
		return nil, nil
	}}, nil, &stubResourceCatalog{resource: &types.StoredResource{TenantID: 7, PhysicalPath: "local://7/exports/a.png"}})

	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape(ref), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestResourceGrantServesShortPublicURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	physical := "local://42/exports/a.png"
	engine := gin.New()
	serveResourceGrants(
		engine,
		&stubResourceCatalog{resource: &types.StoredResource{
			ID:           "resource-1",
			TenantID:     42,
			PhysicalPath: physical,
			OriginalName: "a.png",
			MimeType:     "image/png",
		}},
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			return &types.Tenant{ID: id}, nil
		}},
		&stubFileService{getFile: func(_ context.Context, path string) (io.ReadCloser, error) {
			if path != physical {
				t.Fatalf("path = %q, want %q", path, physical)
			}
			return io.NopCloser(strings.NewReader("image")), nil
		}},
		nil,
	)

	req := httptest.NewRequest(http.MethodGet, "/r/GrantTokenAbCdEfGhIjKlM", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK || recorder.Body.String() != "image" {
		t.Fatalf("status=%d body=%q", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q", got)
	}
}

func TestServeFilesDoesNotFallbackWhenProviderDoesNotMatchGlobalStorage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "minio")

	engine := gin.New()
	serveFiles(engine, &stubFileService{
		getFile: func(ctx context.Context, filePath string) (io.ReadCloser, error) {
			t.Fatalf("GetFile should not be called for mismatched provider, got %q", filePath)
			return nil, nil
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape("local://42/docs/example.txt"), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusBadRequest; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

func TestServeFilesRejectsCrossTenantPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	engine := gin.New()
	serveFiles(engine, &stubFileService{
		getFile: func(ctx context.Context, filePath string) (io.ReadCloser, error) {
			t.Fatalf("GetFile should not be called for cross-tenant path, got %q", filePath)
			return nil, nil
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape("local://7/knowledge/secret.pdf"), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusForbidden; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

func TestServeFilesRejectsPathWithoutTenantSegment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	engine := gin.New()
	serveFiles(engine, &stubFileService{
		getFile: func(ctx context.Context, filePath string) (io.ReadCloser, error) {
			t.Fatalf("GetFile should not be called without tenant segment, got %q", filePath)
			return nil, nil
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape("local://docs/example.txt"), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusForbidden; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

// /files carries its own API-key guard (middleware.AllowFileServeAPIKey):
// full-access and tenant-wide retrieve keys may serve tenant-bounded paths,
// but KB-restricted keys (and keys lacking retrieve) are denied because a raw
// storage path cannot be bounded to a KB allow-list.
func TestServeFilesAPIKeyScopeMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const filePath = "local://42/docs/example.txt"

	cases := []struct {
		name     string
		scope    types.TenantAPIKeyScope
		wantCode int
	}{
		{
			name:     "full access allowed",
			scope:    types.TenantAPIKeyScope{FullAccess: true},
			wantCode: http.StatusOK,
		},
		{
			name: "tenant-wide retrieve allowed",
			scope: types.TenantAPIKeyScope{
				Capabilities: types.StringArray{string(types.APIKeyCapabilityRetrieve)},
			},
			wantCode: http.StatusOK,
		},
		{
			name: "kb-restricted retrieve denied",
			scope: types.TenantAPIKeyScope{
				KnowledgeBaseIDs: types.StringArray{"kb-1"},
				Capabilities:     types.StringArray{string(types.APIKeyCapabilityRetrieve)},
			},
			wantCode: http.StatusForbidden,
		},
		{
			name: "non-retrieve capability denied",
			scope: types.TenantAPIKeyScope{
				Capabilities: types.StringArray{string(types.APIKeyCapabilityChat)},
			},
			wantCode: http.StatusForbidden,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			engine := gin.New()
			serveFiles(engine, &stubFileService{
				getFile: func(_ context.Context, _ string) (io.ReadCloser, error) {
					return io.NopCloser(strings.NewReader("body")), nil
				},
			})

			req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape(filePath), nil)
			ctx := context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42})
			ctx = types.WithTenantAPIKeyScope(ctx, tc.scope)
			req = req.WithContext(ctx)

			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, req)

			if got := recorder.Code; got != tc.wantCode {
				t.Fatalf("status = %d, want %d body=%s", got, tc.wantCode, recorder.Body.String())
			}
		})
	}
}

// newKBScopedFilesTestEngine wires newKBScopedFileServeHandler behind a
// middleware that injects effectiveTenantID into the request context, mirroring
// what RequireKBAccess does after resolving an org-shared KB to its source
// tenant. This lets the handler be exercised without the full RBAC stack.
func newKBScopedFilesTestEngine(
	effectiveTenantID uint64,
	tenantSvc interfaces.TenantService,
	global interfaces.FileService,
) *gin.Engine {
	engine := gin.New()
	engine.GET("/knowledge-bases/:id/files",
		func(c *gin.Context) {
			ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, effectiveTenantID)
			c.Request = c.Request.WithContext(ctx)
			c.Next()
		},
		newKBScopedFileServeHandler(tenantSvc, global),
	)
	return engine
}

// A tenant whose owner-tenant (10008) storage objects are requested by a
// borrowing tenant via a shared KB: the effective tenant in context is the
// owner, so the path validates and the file is served.
func TestKBScopedFilesServesOwnerTenantPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const ownerTenantID = uint64(10008)
	var requestedPath string
	engine := newKBScopedFilesTestEngine(
		ownerTenantID,
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			return &types.Tenant{ID: id}, nil
		}},
		&stubFileService{getFile: func(_ context.Context, filePath string) (io.ReadCloser, error) {
			requestedPath = filePath
			return io.NopCloser(strings.NewReader("shared-body")), nil
		}},
	)

	filePath := "local://10008/exports/img.jpg"
	req := httptest.NewRequest(http.MethodGet, "/knowledge-bases/kb-1/files?file_path="+url.QueryEscape(filePath), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusOK; got != want {
		t.Fatalf("status = %d, want %d body=%s", got, want, recorder.Body.String())
	}
	if requestedPath != filePath {
		t.Fatalf("requested path = %q, want %q", requestedPath, filePath)
	}
	if body := recorder.Body.String(); body != "shared-body" {
		t.Fatalf("body = %q, want %q", body, "shared-body")
	}
}

// The path must belong to the effective (owner) tenant. A path pointing at a
// different tenant than the resolved KB owner is still rejected, so the guard
// cannot be used to reach arbitrary tenants' files.
func TestKBScopedFilesRejectsPathNotOwnedByKBTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const ownerTenantID = uint64(10008)
	engine := newKBScopedFilesTestEngine(
		ownerTenantID,
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			t.Fatalf("GetTenantByID should not be called for mismatched path, got %d", id)
			return nil, nil
		}},
		&stubFileService{getFile: func(_ context.Context, filePath string) (io.ReadCloser, error) {
			t.Fatalf("GetFile should not be called for mismatched path, got %q", filePath)
			return nil, nil
		}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/knowledge-bases/kb-1/files?file_path="+url.QueryEscape("local://9999/exports/other.jpg"), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusForbidden; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

// KB-scoped proxy is for embedded exports/ images only; raw knowledge uploads
// must use /knowledge/:id/download even when the tenant matches.
func TestKBScopedFilesRejectsNonExportsPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const ownerTenantID = uint64(10008)
	engine := newKBScopedFilesTestEngine(
		ownerTenantID,
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			t.Fatalf("GetTenantByID should not be called for non-exports path, got %d", id)
			return nil, nil
		}},
		&stubFileService{getFile: func(_ context.Context, filePath string) (io.ReadCloser, error) {
			t.Fatalf("GetFile should not be called for non-exports path, got %q", filePath)
			return nil, nil
		}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/knowledge-bases/kb-1/files?file_path="+url.QueryEscape("local://10008/knowledge-id/123.pdf"), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusForbidden; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

func TestKBScopedFilesRequiresFilePath(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newKBScopedFilesTestEngine(
		10008,
		&stubTenantService{},
		&stubFileService{},
	)

	req := httptest.NewRequest(http.MethodGet, "/knowledge-bases/kb-1/files", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusBadRequest; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

func newMessageScopedFilesTestEngine(
	callerTenantID uint64,
	messageService messageFileLookup,
	agentShareService sharedAgentFileLookup,
	tenantService interfaces.TenantService,
	global interfaces.FileService,
	resourceCatalog interfaces.ResourceCatalog,
	privateOnly ...bool,
) *gin.Engine {
	engine := gin.New()
	engine.GET("/sessions/:id/messages/:message_id/files",
		func(c *gin.Context) {
			ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, callerTenantID)
			c.Request = c.Request.WithContext(ctx)
			c.Next()
		},
		newMessageScopedFileServeHandler(
			messageService,
			agentShareService,
			tenantService,
			global,
			nil,
			resourceCatalog,
			privateOnly...,
		),
	)
	return engine
}

func TestMessageScopedFilesServesSharedAgentResource(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const (
		callerTenantID = uint64(42)
		ownerTenantID  = uint64(7)
		ref            = "resource://AbCdEfGhIjKlMnOpQrStUv"
		physical       = "local://7/exports/chart.png"
	)
	var requestedPath string
	engine := newMessageScopedFilesTestEngine(
		callerTenantID,
		&stubMessageFileLookup{get: func(_ context.Context, sessionID, messageID string) (*types.Message, error) {
			if sessionID != "session-1" || messageID != "message-1" {
				t.Fatalf("unexpected message scope %s/%s", sessionID, messageID)
			}
			return &types.Message{AgentID: "agent-1", AgentTenantID: ownerTenantID}, nil
		}},
		&stubSharedAgentFileLookup{get: func(
			_ context.Context,
			tenantID uint64,
			_ types.TenantRole,
			agentID string,
			sourceTenantID ...uint64,
		) (*types.CustomAgent, error) {
			if tenantID != callerTenantID || agentID != "agent-1" || len(sourceTenantID) != 1 || sourceTenantID[0] != ownerTenantID {
				t.Fatalf("unexpected shared-agent lookup tenant=%d agent=%s source=%v", tenantID, agentID, sourceTenantID)
			}
			return &types.CustomAgent{ID: agentID, TenantID: ownerTenantID}, nil
		}},
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			return &types.Tenant{ID: id}, nil
		}},
		&stubFileService{getFile: func(_ context.Context, filePath string) (io.ReadCloser, error) {
			requestedPath = filePath
			return io.NopCloser(strings.NewReader("shared-agent-image")), nil
		}},
		&stubResourceCatalog{resource: &types.StoredResource{
			TenantID:     ownerTenantID,
			PhysicalPath: physical,
			MimeType:     "image/png",
		}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/sessions/session-1/messages/message-1/files?file_path="+url.QueryEscape(ref), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK || recorder.Body.String() != "shared-agent-image" {
		t.Fatalf("status=%d body=%q", recorder.Code, recorder.Body.String())
	}
	if requestedPath != physical {
		t.Fatalf("requested path = %q, want %q", requestedPath, physical)
	}
}

func TestMessageScopedFilesServesSameTenantResource(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	const (
		tenantID = uint64(42)
		ref      = "resource://AbCdEfGhIjKlMnOpQrStUv"
		physical = "local://42/exports/chart.png"
	)
	var requestedPath string
	engine := newMessageScopedFilesTestEngine(
		tenantID,
		&stubMessageFileLookup{get: func(_ context.Context, sessionID, messageID string) (*types.Message, error) {
			if sessionID != "session-1" || messageID != "message-1" {
				t.Fatalf("unexpected message scope %s/%s", sessionID, messageID)
			}
			return &types.Message{AgentTenantID: tenantID}, nil
		}},
		&stubSharedAgentFileLookup{get: func(
			context.Context, uint64, types.TenantRole, string, ...uint64,
		) (*types.CustomAgent, error) {
			t.Fatal("shared-agent lookup should not run for same-tenant resources")
			return nil, nil
		}},
		&stubTenantService{get: func(_ context.Context, id uint64) (*types.Tenant, error) {
			return &types.Tenant{ID: id}, nil
		}},
		&stubFileService{getFile: func(_ context.Context, filePath string) (io.ReadCloser, error) {
			requestedPath = filePath
			return io.NopCloser(strings.NewReader("same-tenant-image")), nil
		}},
		&stubResourceCatalog{resource: &types.StoredResource{
			TenantID:     tenantID,
			PhysicalPath: physical,
			MimeType:     "image/png",
		}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/sessions/session-1/messages/message-1/files?file_path="+url.QueryEscape(ref), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK || recorder.Body.String() != "same-tenant-image" {
		t.Fatalf("status=%d body=%q", recorder.Code, recorder.Body.String())
	}
	if requestedPath != physical {
		t.Fatalf("requested path = %q, want %q", requestedPath, physical)
	}
}

func TestMessageScopedFilesLiteRejectsSharedAgentResource(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"

	engine := newMessageScopedFilesTestEngine(
		42,
		&stubMessageFileLookup{get: func(context.Context, string, string) (*types.Message, error) {
			return &types.Message{AgentID: "agent-1", AgentTenantID: 7}, nil
		}},
		&stubSharedAgentFileLookup{get: func(
			context.Context, uint64, types.TenantRole, string, ...uint64,
		) (*types.CustomAgent, error) {
			t.Fatal("Lite must not consult shared-agent access for message files")
			return nil, nil
		}},
		&stubTenantService{get: func(context.Context, uint64) (*types.Tenant, error) {
			t.Fatal("Lite must reject before owner tenant lookup")
			return nil, nil
		}},
		&stubFileService{getFile: func(context.Context, string) (io.ReadCloser, error) {
			t.Fatal("Lite must not fetch a foreign message resource")
			return nil, nil
		}},
		&stubResourceCatalog{resource: &types.StoredResource{
			TenantID:     7,
			PhysicalPath: "local://7/exports/chart.png",
		}},
		true,
	)

	req := httptest.NewRequest(http.MethodGet,
		"/sessions/session-1/messages/message-1/files?file_path="+url.QueryEscape(ref), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestMessageScopedFilesRequiresFilePath(t *testing.T) {
	gin.SetMode(gin.TestMode)

	engine := newMessageScopedFilesTestEngine(
		42,
		&stubMessageFileLookup{get: func(context.Context, string, string) (*types.Message, error) {
			return &types.Message{AgentTenantID: 42}, nil
		}},
		&stubSharedAgentFileLookup{},
		&stubTenantService{},
		&stubFileService{},
		&stubResourceCatalog{},
	)

	req := httptest.NewRequest(http.MethodGet, "/sessions/session-1/messages/message-1/files", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusBadRequest; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
}

func TestMessageScopedFilesRejectsRevokedSharedAgent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"

	engine := newMessageScopedFilesTestEngine(
		42,
		&stubMessageFileLookup{get: func(context.Context, string, string) (*types.Message, error) {
			return &types.Message{AgentID: "agent-1", AgentTenantID: 7}, nil
		}},
		&stubSharedAgentFileLookup{get: func(
			context.Context, uint64, types.TenantRole, string, ...uint64,
		) (*types.CustomAgent, error) {
			return nil, nil
		}},
		&stubTenantService{get: func(context.Context, uint64) (*types.Tenant, error) {
			t.Fatal("tenant lookup should not run after share revocation")
			return nil, nil
		}},
		&stubFileService{getFile: func(context.Context, string) (io.ReadCloser, error) {
			t.Fatal("GetFile should not run after share revocation")
			return nil, nil
		}},
		&stubResourceCatalog{resource: &types.StoredResource{TenantID: 7, PhysicalPath: "local://7/exports/chart.png"}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/sessions/session-1/messages/message-1/files?file_path="+url.QueryEscape(ref), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestMessageScopedFilesRejectsResourceOutsideMessageTenant(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const ref = "resource://AbCdEfGhIjKlMnOpQrStUv"

	engine := newMessageScopedFilesTestEngine(
		42,
		&stubMessageFileLookup{get: func(context.Context, string, string) (*types.Message, error) {
			return &types.Message{AgentID: "agent-1", AgentTenantID: 8}, nil
		}},
		&stubSharedAgentFileLookup{get: func(
			context.Context, uint64, types.TenantRole, string, ...uint64,
		) (*types.CustomAgent, error) {
			t.Fatal("shared-agent lookup should not run for a mismatched resource tenant")
			return nil, nil
		}},
		&stubTenantService{},
		&stubFileService{},
		&stubResourceCatalog{resource: &types.StoredResource{TenantID: 7, PhysicalPath: "local://7/exports/chart.png"}},
	)

	req := httptest.NewRequest(http.MethodGet,
		"/sessions/session-1/messages/message-1/files?file_path="+url.QueryEscape(ref), nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestServeFilesForcesActiveContentDownload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STORAGE_TYPE", "local")

	engine := gin.New()
	serveFiles(engine, &stubFileService{
		getFile: func(_ context.Context, _ string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader(`<svg onload="alert(1)"></svg>`)), nil
		},
	})

	filePath := "local://42/docs/payload.svg"
	req := httptest.NewRequest(http.MethodGet, "/files?file_path="+url.QueryEscape(filePath), nil)
	req = req.WithContext(context.WithValue(req.Context(), types.TenantInfoContextKey, &types.Tenant{ID: 42}))

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if got, want := recorder.Code, http.StatusOK; got != want {
		t.Fatalf("status = %d, want %d", got, want)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/octet-stream" {
		t.Fatalf("Content-Type = %q, want application/octet-stream", got)
	}
	if got := recorder.Header().Get("Content-Disposition"); got != "attachment" {
		t.Fatalf("Content-Disposition = %q, want attachment", got)
	}
	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}
}
