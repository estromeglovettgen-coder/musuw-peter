package handler

import (
	"context"
	"encoding/json"
	"errors"
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
	"github.com/hibiken/asynq"
)

// stubKBCopyService provides only the methods the copy/duplicate handlers reach.
// Other interface methods stay embedded so accidental new calls panic in tests.
type stubKBCopyService struct {
	interfaces.KnowledgeBaseService
	byID      func(ctx context.Context, id string) (*types.KnowledgeBase, error)
	duplicate func(ctx context.Context, sourceID string) (*types.KnowledgeBase, error)
	copy      func(ctx context.Context, sourceID, targetID string) (*types.KnowledgeBase, *types.KnowledgeBase, error)
}

func (s *stubKBCopyService) GetKnowledgeBaseByID(ctx context.Context, id string) (*types.KnowledgeBase, error) {
	return s.byID(ctx, id)
}

func (s *stubKBCopyService) DuplicateKnowledgeBase(
	ctx context.Context,
	sourceID string,
) (*types.KnowledgeBase, error) {
	return s.duplicate(ctx, sourceID)
}

func (s *stubKBCopyService) CopyKnowledgeBase(
	ctx context.Context,
	sourceID, targetID string,
) (*types.KnowledgeBase, *types.KnowledgeBase, error) {
	if s.copy == nil {
		return nil, nil, errors.New("copy callback not configured")
	}
	return s.copy(ctx, sourceID, targetID)
}

type stubKBCloneProgressService struct {
	interfaces.KnowledgeService
	saved  []*types.KBCloneProgress
	onSave func()
}

func (s *stubKBCloneProgressService) SaveKBCloneProgress(_ context.Context, progress *types.KBCloneProgress) error {
	if s.onSave != nil {
		s.onSave()
	}
	s.saved = append(s.saved, progress)
	return nil
}

type recordingKBCloneEnqueuer struct {
	task      *asynq.Task
	onEnqueue func()
}

func (e *recordingKBCloneEnqueuer) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	if e.onEnqueue != nil {
		e.onEnqueue()
	}
	e.task = task
	return &asynq.TaskInfo{ID: "task-1"}, nil
}

func newDuplicateRouter(svc interfaces.KnowledgeBaseService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		c.Set(types.TenantIDContextKey.String(), uint64(1))
		c.Set(types.UserIDContextKey.String(), "u-test")
		c.Next()
	})
	h := &KnowledgeBaseHandler{service: svc}
	r.POST("/knowledge-bases/:id/duplicate", h.DuplicateKnowledgeBase)
	return r
}

func TestDuplicateHandler_ReturnsCreatedKnowledgeBase(t *testing.T) {
	var gotSourceID string
	svc := &stubKBCopyService{
		byID: func(_ context.Context, id string) (*types.KnowledgeBase, error) {
			if id != "src" {
				t.Fatalf("handler should only load the source KB, got id=%s", id)
			}
			return &types.KnowledgeBase{ID: "src", TenantID: 1, Name: "Source"}, nil
		},
		duplicate: func(_ context.Context, sourceID string) (*types.KnowledgeBase, error) {
			gotSourceID = sourceID
			return &types.KnowledgeBase{
				ID:        "copy-id",
				TenantID:  1,
				Name:      "Source Copy",
				CreatorID: "u-test",
			}, nil
		},
	}
	r := newDuplicateRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/src/duplicate", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for duplicate, got %d body=%s", w.Code, w.Body.String())
	}
	if gotSourceID != "src" {
		t.Fatalf("duplicate service called with source=%q", gotSourceID)
	}
	body := w.Body.String()
	for _, want := range []string{`"source_id":"src"`, `"target_id":"copy-id"`, `"knowledge_base"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("response missing %s: %s", want, body)
		}
	}
}

func TestCopyHandler_PrecreatesAndReturnsStableTargetID(t *testing.T) {
	var copyCalls []string
	service := &stubKBCopyService{
		byID: func(_ context.Context, id string) (*types.KnowledgeBase, error) {
			return &types.KnowledgeBase{ID: id, TenantID: 1, Name: "Source"}, nil
		},
		copy: func(_ context.Context, sourceID, targetID string) (*types.KnowledgeBase, *types.KnowledgeBase, error) {
			copyCalls = append(copyCalls, targetID)
			if targetID != "" {
				return &types.KnowledgeBase{ID: sourceID, TenantID: 1}, &types.KnowledgeBase{ID: targetID, TenantID: 1}, nil
			}
			return &types.KnowledgeBase{ID: sourceID, TenantID: 1}, &types.KnowledgeBase{ID: "target-fixed", TenantID: 1}, nil
		},
	}
	var events []string
	progress := &stubKBCloneProgressService{onSave: func() { events = append(events, "progress") }}
	enqueuer := &recordingKBCloneEnqueuer{onEnqueue: func() { events = append(events, "enqueue") }}
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		c.Set(types.TenantIDContextKey.String(), uint64(1))
		c.Set(types.UserIDContextKey.String(), "u-test")
		c.Next()
	})
	h := &KnowledgeBaseHandler{service: service, knowledgeService: progress, asynqClient: enqueuer}
	r.POST("/knowledge-bases/copy", h.CopyKnowledgeBase)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/copy", strings.NewReader(`{"source_id":"src"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"target_id":"target-fixed"`) {
		t.Fatalf("response must expose the precreated target id: %s", w.Body.String())
	}
	if len(copyCalls) != 1 || copyCalls[0] != "" {
		t.Fatalf("expected one precreate call with empty target, got %#v", copyCalls)
	}
	if enqueuer.task == nil {
		t.Fatal("copy task was not enqueued")
	}
	var payload types.KBClonePayload
	if err := json.Unmarshal(enqueuer.task.Payload(), &payload); err != nil {
		t.Fatalf("invalid clone payload: %v", err)
	}
	if payload.TargetID != "target-fixed" {
		t.Fatalf("clone payload must carry fixed target id, got %q", payload.TargetID)
	}
	if len(progress.saved) != 1 || progress.saved[0].TargetID != "target-fixed" {
		t.Fatalf("initial progress must carry fixed target id, got %#v", progress.saved)
	}
	if len(events) != 2 || events[0] != "progress" || events[1] != "enqueue" {
		t.Fatalf("initial progress must be saved before enqueue to avoid overwriting a fast worker, got %#v", events)
	}
}

func TestDuplicateHandler_RejectsCrossTenantSource(t *testing.T) {
	calledDuplicate := false
	svc := &stubKBCopyService{
		byID: func(_ context.Context, id string) (*types.KnowledgeBase, error) {
			return &types.KnowledgeBase{ID: id, TenantID: 2, Name: "Shared"}, nil
		},
		duplicate: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			calledDuplicate = true
			return nil, nil
		},
	}
	r := newDuplicateRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/src/duplicate", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for cross-tenant source, got %d body=%s", w.Code, w.Body.String())
	}
	if calledDuplicate {
		t.Fatal("duplicate service must not be called when source KB is outside the caller tenant")
	}
}

func TestDuplicateHandler_SourceNotFound(t *testing.T) {
	calledDuplicate := false
	svc := &stubKBCopyService{
		byID: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			return nil, repository.ErrKnowledgeBaseNotFound
		},
		duplicate: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			calledDuplicate = true
			return nil, nil
		},
	}
	r := newDuplicateRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/missing/duplicate", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing source, got %d body=%s", w.Code, w.Body.String())
	}
	if calledDuplicate {
		t.Fatal("duplicate service must not be called when source KB is missing")
	}
}

func TestDuplicateHandler_PropagatesServiceAppError(t *testing.T) {
	svc := &stubKBCopyService{
		byID: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			return &types.KnowledgeBase{ID: "src", TenantID: 1, Name: "Source"}, nil
		},
		duplicate: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			return nil, apperrors.NewBadRequestError("invalid vector store binding")
		},
	}
	r := newDuplicateRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/src/duplicate", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for service app error, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "invalid vector store binding") {
		t.Fatalf("expected service error message in body: %s", w.Body.String())
	}
}

func TestDuplicateHandler_ServiceUnexpectedError(t *testing.T) {
	svc := &stubKBCopyService{
		byID: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			return &types.KnowledgeBase{ID: "src", TenantID: 1, Name: "Source"}, nil
		},
		duplicate: func(_ context.Context, _ string) (*types.KnowledgeBase, error) {
			return nil, errors.New("database unavailable")
		},
	}
	r := newDuplicateRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/knowledge-bases/src/duplicate", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for unexpected service error, got %d body=%s", w.Code, w.Body.String())
	}
}
