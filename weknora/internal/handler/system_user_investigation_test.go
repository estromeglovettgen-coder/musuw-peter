package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type investigationUserServiceStub struct {
	interfaces.UserService
	user *types.User
}

func (s *investigationUserServiceStub) GetUserByID(context.Context, string) (*types.User, error) {
	return s.user, nil
}

type investigationSessionRepositoryStub struct {
	interfaces.SessionRepository
	sessions []*types.Session
}

func (s *investigationSessionRepositoryStub) GetPagedByTenantID(context.Context, uint64, string, *types.Pagination) ([]*types.Session, int64, error) {
	return s.sessions, int64(len(s.sessions)), nil
}

type investigationMessageRepositoryStub struct {
	interfaces.MessageRepository
	messages []*types.Message
}

func (s *investigationMessageRepositoryStub) GetRecentMessagesBySession(context.Context, string, int) ([]*types.Message, error) {
	return s.messages, nil
}

type investigationKnowledgeBaseRepositoryStub struct {
	interfaces.KnowledgeBaseRepository
	kbs []*types.KnowledgeBase
}

func (s *investigationKnowledgeBaseRepositoryStub) ListKnowledgeBasesByTenantID(context.Context, uint64) ([]*types.KnowledgeBase, error) {
	return s.kbs, nil
}

type investigationKnowledgeRepositoryStub struct {
	interfaces.KnowledgeRepository
	docs []*types.Knowledge
}

func (s *investigationKnowledgeRepositoryStub) ListPagedKnowledgeByKnowledgeBaseID(context.Context, uint64, string, *types.Pagination, types.KnowledgeListFilter) ([]*types.Knowledge, int64, error) {
	return s.docs, int64(len(s.docs)), nil
}

type investigationSpanRepositoryStub struct {
	repository.KnowledgeSpanRepository
	spans []types.KnowledgeProcessingSpan
}

func (s *investigationSpanRepositoryStub) LatestAttempt(context.Context, string) (int, error) {
	return 1, nil
}

func (s *investigationSpanRepositoryStub) ListByAttempt(context.Context, string, int) ([]types.KnowledgeProcessingSpan, error) {
	return s.spans, nil
}

type investigationDeadLetterRepositoryStub struct {
	interfaces.TaskDeadLetterRepository
	rows []*types.TaskDeadLetter
}

func (s *investigationDeadLetterRepositoryStub) ListByScope(context.Context, string, string, string, int) ([]*types.TaskDeadLetter, string, error) {
	return s.rows, "", nil
}

type investigationAuditRepositoryStub struct {
	entries []*types.AuditLog
}

func (s *investigationAuditRepositoryStub) Log(context.Context, *types.AuditLog) error {
	return nil
}

func (s *investigationAuditRepositoryStub) LogDenied(context.Context, *gin.Context, uint64, string, string, types.TenantRole) error {
	return nil
}

func (s *investigationAuditRepositoryStub) List(context.Context, uint64, *interfaces.AuditLogQuery) ([]*types.AuditLog, error) {
	return s.entries, nil
}

func (s *investigationAuditRepositoryStub) Purge(context.Context, int) (int64, error) {
	return 0, nil
}

type investigationTaskInspectorStub struct {
	interfaces.TaskInspector
	stats []types.QueueStat
}

func (s *investigationTaskInspectorStub) QueueStats(context.Context) ([]types.QueueStat, bool, error) {
	return s.stats, true, nil
}

func investigationRouter(h *SystemHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/users/:user_id/investigation", h.InvestigateManagedUser)
	return r
}

func TestInvestigateManagedUserReturnsCorrelationsWithoutSensitivePayloads(t *testing.T) {
	now := time.Date(2026, 8, 21, 0, 0, 0, 0, time.UTC)
	user := &types.User{ID: "user-1", Username: "alice", Email: "alice@example.com", TenantID: 7, IsActive: true, CreatedAt: now, UpdatedAt: now}
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanPro, PlanStatus: "active", StorageQuota: 40, StorageUsed: 4}
	state := &types.SessionLastRequestState{AgentID: "agent-1", ModelID: "model-1", ReasoningEffort: "high"}
	session := &types.Session{ID: "session-1", TenantID: 7, UserID: user.ID, Title: "Support", LastRequestState: state, CreatedAt: now, UpdatedAt: now}
	doc := &types.Knowledge{ID: "doc-1", KnowledgeBaseID: "kb-1", TenantID: 7, Title: "Failed document", FileName: "secret.pdf", FileType: "pdf", ParseStatus: types.ParseStatusFailed, ErrorMessage: "parser failed", CreatedAt: now, UpdatedAt: now}
	h := &SystemHandler{
		userSvc:   &investigationUserServiceStub{user: user},
		tenantSvc: &managedTenantServiceStub{tenant: tenant},
		entitlementSvc: &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPro), PlanStatus: "active",
			OpenRouterCreditsStatus: types.OpenRouterCreditsAvailable, OpenRouterProviderUsedMicrousd: 10, OpenRouterProviderRemainingMicrousd: 20,
		}},
		sessionRepo:       &investigationSessionRepositoryStub{sessions: []*types.Session{session}},
		messageRepo:       &investigationMessageRepositoryStub{messages: []*types.Message{{ID: "message-1", SessionID: session.ID, RequestID: "request-1", Role: "user", Content: "secret prompt", Attachments: types.MessageAttachments{{FileName: "secret.txt"}}, ModelID: "model-1", CreatedAt: now, UpdatedAt: now}}},
		knowledgeBaseRepo: &investigationKnowledgeBaseRepositoryStub{kbs: []*types.KnowledgeBase{{ID: "kb-1", TenantID: 7, Name: "KB", Type: types.KnowledgeBaseTypeDocument, CreatedAt: now, UpdatedAt: now}}},
		knowledgeRepo:     &investigationKnowledgeRepositoryStub{docs: []*types.Knowledge{doc}},
		knowledgeSpanRepo: &investigationSpanRepositoryStub{spans: []types.KnowledgeProcessingSpan{{KnowledgeID: doc.ID, Attempt: 1, SpanID: "span-1", Name: "docreader", Kind: types.SpanKindStage, Status: types.SpanStatusFailed, ErrorCode: "parse_failed", ErrorMessage: "bad input"}}},
		deadLetterRepo:    &investigationDeadLetterRepositoryStub{rows: []*types.TaskDeadLetter{{ID: 1, TenantID: 7, TaskType: "document:process", Scope: types.TaskScopeKnowledge, ScopeID: doc.ID, Payload: []byte(`{"secret":"payload"}`), LastError: "failed"}}},
		auditSvc:          &investigationAuditRepositoryStub{entries: []*types.AuditLog{{ID: 2, TenantID: 7, ActorUserID: user.ID, Action: types.AuditActionSystemTenantUpdated, Outcome: types.AuditOutcomeSuccess, CreatedAt: now}}},
		taskInspector:     &investigationTaskInspectorStub{stats: []types.QueueStat{{Name: types.QueueDefault, Pending: 1}}},
	}
	r := investigationRouter(h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/users/user-1/investigation", nil))
	require.Equal(t, http.StatusOK, w.Code)
	body := w.Body.String()
	assert.NotContains(t, body, "secret prompt")
	assert.NotContains(t, body, "attachments")
	assert.NotContains(t, body, "payload")
	assert.Contains(t, body, "request-1")
	assert.Contains(t, body, "reasoning_effort")
	assert.Contains(t, body, "parse_failed")
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &decoded))
	data := decoded["data"].(map[string]any)
	sessions := data["sessions"].(map[string]any)["items"].([]any)
	_, exposesContentDerivedTitle := sessions[0].(map[string]any)["title"]
	assert.False(t, exposesContentDerivedTitle, "content-derived session titles must not enter the support projection")
	knowledge := data["knowledge"].(map[string]any)
	knowledgeBases := knowledge["knowledge_bases"].([]any)
	_, exposesKnowledgeBaseName := knowledgeBases[0].(map[string]any)["name"]
	assert.False(t, exposesKnowledgeBaseName, "content-derived knowledge-base names must not enter the support projection")
	failedDocuments := knowledge["failed_documents"].([]any)
	_, exposesDocumentTitle := failedDocuments[0].(map[string]any)["title"]
	_, exposesFileName := failedDocuments[0].(map[string]any)["file_name"]
	assert.False(t, exposesDocumentTitle, "content-derived document titles must not enter the support projection")
	assert.False(t, exposesFileName, "uploaded filenames must not enter the support projection")
	assert.Equal(t, true, data["observability"].(map[string]any)["openrouter"].(map[string]any)["available"])
}

func TestInvestigateManagedUserMarksOptionalSourcesUnavailable(t *testing.T) {
	user := &types.User{ID: "user-1", TenantID: 0}
	h := &SystemHandler{userSvc: &investigationUserServiceStub{user: user}}
	w := httptest.NewRecorder()
	investigationRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/users/user-1/investigation", nil))
	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "tenant not selected")
}

func TestInvestigateManagedUserRejectsInvalidTenantQuery(t *testing.T) {
	h := &SystemHandler{userSvc: &investigationUserServiceStub{user: &types.User{ID: "user-1", TenantID: 7}}}
	w := httptest.NewRecorder()
	investigationRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/users/user-1/investigation?tenant_id=0", strings.NewReader("")))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
