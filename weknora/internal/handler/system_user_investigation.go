package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

const (
	investigationSessionLimit = 50
	investigationMessageLimit = 5
	investigationKBLimit      = 50
	investigationDocLimit     = 100
	investigationSpanLimit    = 100
	investigationAuditLimit   = 100
	investigationTaskLimit    = 100
	investigationErrorLimit   = 512
)

type systemInvestigationAvailability struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

type systemInvestigationUser struct {
	ID                  string    `json:"id"`
	Username            string    `json:"username"`
	Email               string    `json:"email"`
	TenantID            uint64    `json:"tenant_id"`
	IsActive            bool      `json:"is_active"`
	CanAccessAllTenants bool      `json:"can_access_all_tenants"`
	IsSystemAdmin       bool      `json:"is_system_admin"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type systemInvestigationRequestState struct {
	AgentID         string `json:"agent_id,omitempty"`
	ModelID         string `json:"model_id,omitempty"`
	ReasoningEffort string `json:"reasoning_effort,omitempty"`
	Thinking        *bool  `json:"thinking,omitempty"`
}

type systemInvestigationMessage struct {
	ID              string    `json:"id"`
	SessionID       string    `json:"session_id"`
	RequestID       string    `json:"request_id,omitempty"`
	Role            string    `json:"role"`
	IsCompleted     bool      `json:"is_completed"`
	IsFallback      bool      `json:"is_fallback,omitempty"`
	Channel         string    `json:"channel,omitempty"`
	AgentID         string    `json:"agent_id,omitempty"`
	ModelID         string    `json:"model_id,omitempty"`
	KnowledgeID     string    `json:"knowledge_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	TraceID         string    `json:"trace_id,omitempty"`
	TraceStatus     string    `json:"trace_status"`
	ReasoningEffort string    `json:"reasoning_effort,omitempty"`
}

type systemInvestigationSession struct {
	ID          string                           `json:"id"`
	TenantID    uint64                           `json:"tenant_id"`
	UserID      string                           `json:"user_id,omitempty"`
	CreatedAt   time.Time                        `json:"created_at"`
	UpdatedAt   time.Time                        `json:"updated_at"`
	LastRequest *systemInvestigationRequestState `json:"last_request,omitempty"`
	Messages    []systemInvestigationMessage     `json:"messages"`
}

type systemInvestigationAudit struct {
	ID            uint64             `json:"id"`
	TenantID      uint64             `json:"tenant_id"`
	ActorUserID   string             `json:"actor_user_id,omitempty"`
	ActorRole     string             `json:"actor_role,omitempty"`
	Action        types.AuditAction  `json:"action"`
	ScopeType     string             `json:"scope_type,omitempty"`
	ScopeID       string             `json:"scope_id,omitempty"`
	TargetType    string             `json:"target_type,omitempty"`
	TargetID      string             `json:"target_id,omitempty"`
	TargetUserID  string             `json:"target_user_id,omitempty"`
	RequestPath   string             `json:"request_path,omitempty"`
	RequestMethod string             `json:"request_method,omitempty"`
	Outcome       types.AuditOutcome `json:"outcome"`
	CreatedAt     time.Time          `json:"created_at"`
}

type systemInvestigationKnowledgeBase struct {
	ID              string    `json:"id"`
	Type            string    `json:"type"`
	IsTemporary     bool      `json:"is_temporary,omitempty"`
	KnowledgeCount  int64     `json:"knowledge_count,omitempty"`
	Processing      bool      `json:"is_processing,omitempty"`
	ProcessingCount int64     `json:"processing_count,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type systemInvestigationFailedDocument struct {
	ID              string     `json:"id"`
	KnowledgeBaseID string     `json:"knowledge_base_id"`
	FileType        string     `json:"file_type,omitempty"`
	ParseStatus     string     `json:"parse_status"`
	SummaryStatus   string     `json:"summary_status,omitempty"`
	ErrorMessage    string     `json:"error_message,omitempty"`
	StorageSize     int64      `json:"storage_size,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	ProcessedAt     *time.Time `json:"processed_at,omitempty"`
}

type systemInvestigationSpan struct {
	KnowledgeID  string     `json:"knowledge_id"`
	Attempt      int        `json:"attempt"`
	SpanID       string     `json:"span_id"`
	ParentSpanID string     `json:"parent_span_id,omitempty"`
	Name         string     `json:"name"`
	Kind         string     `json:"kind"`
	Status       string     `json:"status"`
	ErrorCode    string     `json:"error_code,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	FinishedAt   *time.Time `json:"finished_at,omitempty"`
	DurationMs   int64      `json:"duration_ms,omitempty"`
}

type systemInvestigationDeadLetter struct {
	ID        int64     `json:"id"`
	TenantID  uint64    `json:"tenant_id"`
	TaskType  string    `json:"task_type"`
	Scope     string    `json:"scope"`
	ScopeID   string    `json:"scope_id"`
	RelatedID string    `json:"related_id,omitempty"`
	FailCount int       `json:"fail_count"`
	LastError string    `json:"last_error,omitempty"`
	FailedAt  time.Time `json:"failed_at"`
}

type systemInvestigationRuntime struct {
	systemInvestigationAvailability
	QueueStats []types.QueueStat `json:"queue_stats,omitempty"`
}

type systemInvestigationSessions struct {
	systemInvestigationAvailability
	Total int64                        `json:"total,omitempty"`
	Items []systemInvestigationSession `json:"items,omitempty"`
}

type systemInvestigationKnowledge struct {
	systemInvestigationAvailability
	KnowledgeBases  []systemInvestigationKnowledgeBase  `json:"knowledge_bases,omitempty"`
	FailedDocuments []systemInvestigationFailedDocument `json:"failed_documents,omitempty"`
	Spans           []systemInvestigationSpan           `json:"spans,omitempty"`
}

type systemInvestigationAuditSection struct {
	systemInvestigationAvailability
	Items []systemInvestigationAudit `json:"items,omitempty"`
}

type systemInvestigationTasks struct {
	systemInvestigationAvailability
	DeadLetters []systemInvestigationDeadLetter `json:"dead_letters,omitempty"`
}

type systemInvestigationObservability struct {
	Langfuse   systemInvestigationAvailability `json:"langfuse"`
	OpenRouter systemInvestigationAvailability `json:"openrouter"`
}

type systemUserInvestigationResponse struct {
	User          systemInvestigationUser          `json:"user"`
	Tenant        *systemTenantEntitlementResponse `json:"tenant,omitempty"`
	TenantStatus  systemInvestigationAvailability  `json:"tenant_status"`
	Sessions      systemInvestigationSessions      `json:"sessions"`
	Knowledge     systemInvestigationKnowledge     `json:"knowledge"`
	Audit         systemInvestigationAuditSection  `json:"audit"`
	Tasks         systemInvestigationTasks         `json:"tasks"`
	Runtime       systemInvestigationRuntime       `json:"runtime"`
	Observability systemInvestigationObservability `json:"observability"`
}

func investigationUserProjection(user *types.User) systemInvestigationUser {
	return systemInvestigationUser{
		ID: user.ID, Username: user.Username, Email: user.Email, TenantID: user.TenantID,
		IsActive: user.IsActive, CanAccessAllTenants: user.CanAccessAllTenants,
		IsSystemAdmin: user.IsSystemAdmin, CreatedAt: user.CreatedAt, UpdatedAt: user.UpdatedAt,
	}
}

func truncateInvestigationError(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= investigationErrorLimit {
		return value
	}
	return value[:investigationErrorLimit] + "…"
}

func investigationDocumentFailed(doc *types.Knowledge) bool {
	if doc == nil {
		return false
	}
	return doc.ParseStatus == types.ParseStatusFailed ||
		doc.SummaryStatus == types.SummaryStatusFailed ||
		strings.TrimSpace(doc.ErrorMessage) != ""
}

func investigationMessageProjection(message *types.Message, state *systemInvestigationRequestState) systemInvestigationMessage {
	item := systemInvestigationMessage{
		ID: message.ID, SessionID: message.SessionID, RequestID: message.RequestID,
		Role: message.Role, IsCompleted: message.IsCompleted, IsFallback: message.IsFallback,
		Channel: message.Channel, AgentID: message.AgentID, ModelID: message.ModelID,
		KnowledgeID: message.KnowledgeID, CreatedAt: message.CreatedAt, UpdatedAt: message.UpdatedAt,
		TraceStatus: "unavailable",
	}
	if state != nil {
		item.ReasoningEffort = state.ReasoningEffort
		if item.AgentID == "" {
			item.AgentID = state.AgentID
		}
		if item.ModelID == "" {
			item.ModelID = state.ModelID
		}
	}
	return item
}

// InvestigateManagedUser returns a bounded, read-only support projection of
// one user. It intentionally composes existing repositories instead of
// creating a second event/trace store. Prompts, content-derived names and
// titles, attachments, provider keys, span payloads and dead-letter payloads
// never enter this response.
func (h *SystemHandler) InvestigateManagedUser(c *gin.Context) {
	ctx := logger.CloneContext(c.Request.Context())
	userID := strings.TrimSpace(c.Param("user_id"))
	if userID == "" || len(userID) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}
	if h.userSvc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "user service unavailable"})
		return
	}
	user, err := h.userSvc.GetUserByID(ctx, userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	tenantID := user.TenantID
	if raw := strings.TrimSpace(c.Query("tenant_id")); raw != "" {
		parsed, parseErr := strconv.ParseUint(raw, 10, 64)
		if parseErr != nil || parsed == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id must be a positive integer"})
			return
		}
		tenantID = parsed
	}

	result := systemUserInvestigationResponse{
		User:         investigationUserProjection(user),
		TenantStatus: systemInvestigationAvailability{Available: false, Reason: "tenant not selected"},
		Sessions:     systemInvestigationSessions{systemInvestigationAvailability: systemInvestigationAvailability{Available: false, Reason: "session repository unavailable"}},
		Knowledge:    systemInvestigationKnowledge{systemInvestigationAvailability: systemInvestigationAvailability{Available: false, Reason: "knowledge repositories unavailable"}},
		Audit:        systemInvestigationAuditSection{systemInvestigationAvailability: systemInvestigationAvailability{Available: false, Reason: "audit service unavailable"}},
		Tasks:        systemInvestigationTasks{systemInvestigationAvailability: systemInvestigationAvailability{Available: false, Reason: "dead-letter repository unavailable"}},
		Runtime:      systemInvestigationRuntime{systemInvestigationAvailability: systemInvestigationAvailability{Available: false, Reason: "runtime queue inspector unavailable"}},
		Observability: systemInvestigationObservability{
			Langfuse:   systemInvestigationAvailability{Available: false, Reason: "Langfuse query is not configured in WeKnora"},
			OpenRouter: systemInvestigationAvailability{Available: false, Reason: "tenant entitlement unavailable"},
		},
	}

	if tenantID > 0 && h.tenantSvc != nil {
		tenant, tenantErr := h.tenantSvc.GetTenantByID(ctx, tenantID)
		if tenantErr == nil && tenant != nil {
			result.TenantStatus = systemInvestigationAvailability{Available: true}
			if h.entitlementSvc != nil {
				current, entitlementErr := h.entitlementSvc.CurrentForTenant(ctx, tenantID, time.Now().UTC())
				if entitlementErr == nil && current != nil {
					result.Tenant = newSystemTenantEntitlementResponse(tenant, current)
					if current.OpenRouterCreditsStatus == types.OpenRouterCreditsAvailable {
						result.Observability.OpenRouter = systemInvestigationAvailability{Available: true}
					} else {
						result.Observability.OpenRouter = systemInvestigationAvailability{Available: false, Reason: string(current.OpenRouterCreditsStatus)}
					}
				} else {
					result.TenantStatus = systemInvestigationAvailability{Available: true, Reason: "entitlement unavailable"}
				}
			} else {
				result.TenantStatus.Reason = "entitlement service unavailable"
			}
		} else {
			result.TenantStatus = systemInvestigationAvailability{Available: false, Reason: "tenant not found"}
		}
	}

	h.populateInvestigationSessions(ctx, &result, tenantID, user.ID)
	h.populateInvestigationKnowledge(ctx, &result, tenantID)
	h.populateInvestigationAudit(ctx, &result, tenantID, user.ID)
	h.populateInvestigationTasks(ctx, &result, tenantID)
	h.populateInvestigationRuntime(ctx, &result)

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

func (h *SystemHandler) populateInvestigationSessions(ctx context.Context, result *systemUserInvestigationResponse, tenantID uint64, userID string) {
	if h.sessionRepo == nil || tenantID == 0 {
		if tenantID == 0 {
			result.Sessions.Reason = "tenant not selected"
		}
		return
	}
	sessions, total, err := h.sessionRepo.GetPagedByTenantID(ctx, tenantID, userID, &types.Pagination{Page: 1, PageSize: investigationSessionLimit})
	if err != nil {
		result.Sessions.Reason = "session lookup failed"
		return
	}
	result.Sessions.Available = true
	result.Sessions.Total = total
	result.Sessions.Items = make([]systemInvestigationSession, 0, len(sessions))
	for _, session := range sessions {
		if session == nil || session.UserID != userID {
			continue
		}
		item := systemInvestigationSession{
			ID: session.ID, TenantID: session.TenantID, UserID: session.UserID,
			CreatedAt: session.CreatedAt, UpdatedAt: session.UpdatedAt, Messages: []systemInvestigationMessage{},
		}
		if state := session.LastRequestState; state != nil {
			item.LastRequest = &systemInvestigationRequestState{
				AgentID: state.AgentID, ModelID: state.ModelID, ReasoningEffort: state.ReasoningEffort, Thinking: state.Thinking,
			}
		}
		if h.messageRepo != nil {
			messages, messageErr := h.messageRepo.GetRecentMessagesBySession(ctx, session.ID, investigationMessageLimit)
			if messageErr == nil {
				for _, message := range messages {
					if message != nil {
						item.Messages = append(item.Messages, investigationMessageProjection(message, item.LastRequest))
					}
				}
			}
		}
		result.Sessions.Items = append(result.Sessions.Items, item)
		if len(result.Sessions.Items) >= investigationSessionLimit {
			break
		}
	}
	if h.messageRepo == nil {
		result.Sessions.Reason = "message repository unavailable"
	}
}

func (h *SystemHandler) populateInvestigationKnowledge(ctx context.Context, result *systemUserInvestigationResponse, tenantID uint64) {
	if h.knowledgeBaseRepo == nil || h.knowledgeRepo == nil || tenantID == 0 {
		if tenantID == 0 {
			result.Knowledge.Reason = "tenant not selected"
		}
		return
	}
	kbs, err := h.knowledgeBaseRepo.ListKnowledgeBasesByTenantID(ctx, tenantID)
	if err != nil {
		result.Knowledge.Reason = "knowledge-base lookup failed"
		return
	}
	result.Knowledge.Available = true
	result.Knowledge.KnowledgeBases = make([]systemInvestigationKnowledgeBase, 0, minInt(len(kbs), investigationKBLimit))
	result.Knowledge.FailedDocuments = make([]systemInvestigationFailedDocument, 0)
	result.Knowledge.Spans = make([]systemInvestigationSpan, 0)
	for _, kb := range kbs {
		if kb == nil || len(result.Knowledge.KnowledgeBases) >= investigationKBLimit {
			break
		}
		result.Knowledge.KnowledgeBases = append(result.Knowledge.KnowledgeBases, systemInvestigationKnowledgeBase{
			ID: kb.ID, Type: kb.Type, IsTemporary: kb.IsTemporary,
			KnowledgeCount: kb.KnowledgeCount, Processing: kb.IsProcessing, ProcessingCount: kb.ProcessingCount,
			CreatedAt: kb.CreatedAt, UpdatedAt: kb.UpdatedAt,
		})
		docs, _, docErr := h.knowledgeRepo.ListPagedKnowledgeByKnowledgeBaseID(ctx, tenantID, kb.ID, &types.Pagination{Page: 1, PageSize: investigationDocLimit}, types.KnowledgeListFilter{})
		if docErr != nil {
			continue
		}
		for _, doc := range docs {
			if !investigationDocumentFailed(doc) {
				continue
			}
			if len(result.Knowledge.FailedDocuments) >= investigationDocLimit {
				break
			}
			result.Knowledge.FailedDocuments = append(result.Knowledge.FailedDocuments, systemInvestigationFailedDocument{
				ID: doc.ID, KnowledgeBaseID: doc.KnowledgeBaseID,
				FileType: doc.FileType, ParseStatus: doc.ParseStatus, SummaryStatus: doc.SummaryStatus,
				ErrorMessage: truncateInvestigationError(doc.ErrorMessage), StorageSize: doc.StorageSize,
				CreatedAt: doc.CreatedAt, UpdatedAt: doc.UpdatedAt, ProcessedAt: doc.ProcessedAt,
			})
			h.populateInvestigationSpans(ctx, result, doc.ID)
		}
	}
}

func (h *SystemHandler) populateInvestigationSpans(ctx context.Context, result *systemUserInvestigationResponse, knowledgeID string) {
	if h.knowledgeSpanRepo == nil || len(result.Knowledge.Spans) >= investigationSpanLimit {
		return
	}
	attempt, err := h.knowledgeSpanRepo.LatestAttempt(ctx, knowledgeID)
	if err != nil || attempt <= 0 {
		return
	}
	spans, err := h.knowledgeSpanRepo.ListByAttempt(ctx, knowledgeID, attempt)
	if err != nil {
		return
	}
	for _, span := range spans {
		if len(result.Knowledge.Spans) >= investigationSpanLimit {
			break
		}
		if span.Status != types.SpanStatusFailed && span.Status != types.SpanStatusCancelled && span.Status != types.SpanStatusRunning {
			continue
		}
		result.Knowledge.Spans = append(result.Knowledge.Spans, systemInvestigationSpan{
			KnowledgeID: span.KnowledgeID, Attempt: span.Attempt, SpanID: span.SpanID,
			ParentSpanID: span.ParentSpanID, Name: span.Name, Kind: span.Kind, Status: span.Status,
			ErrorCode: span.ErrorCode, ErrorMessage: truncateInvestigationError(span.ErrorMessage),
			StartedAt: span.StartedAt, FinishedAt: span.FinishedAt, DurationMs: span.DurationMs,
		})
	}
}

func (h *SystemHandler) populateInvestigationAudit(ctx context.Context, result *systemUserInvestigationResponse, tenantID uint64, userID string) {
	if h.auditSvc == nil || tenantID == 0 {
		if tenantID == 0 {
			result.Audit.Reason = "tenant not selected"
		}
		return
	}
	entries, err := h.auditSvc.List(ctx, tenantID, &interfaces.AuditLogQuery{Limit: investigationAuditLimit})
	if err != nil {
		result.Audit.Reason = "audit lookup failed"
		return
	}
	result.Audit.Available = true
	result.Audit.Items = make([]systemInvestigationAudit, 0)
	for _, entry := range entries {
		if entry == nil || (entry.ActorUserID != userID && entry.TargetUserID != userID) {
			continue
		}
		result.Audit.Items = append(result.Audit.Items, systemInvestigationAudit{
			ID: entry.ID, TenantID: entry.TenantID, ActorUserID: entry.ActorUserID,
			ActorRole: entry.ActorRole, Action: entry.Action, ScopeType: entry.ScopeType,
			ScopeID: entry.ScopeID, TargetType: entry.TargetType, TargetID: entry.TargetID,
			TargetUserID: entry.TargetUserID, RequestPath: entry.RequestPath,
			RequestMethod: entry.RequestMethod, Outcome: entry.Outcome, CreatedAt: entry.CreatedAt,
		})
	}
}

func (h *SystemHandler) populateInvestigationTasks(ctx context.Context, result *systemUserInvestigationResponse, tenantID uint64) {
	if h.deadLetterRepo == nil || tenantID == 0 {
		if tenantID == 0 {
			result.Tasks.Reason = "tenant not selected"
		}
		return
	}
	// The existing repository is scope-based, so use the KB and failed-document
	// IDs already collected by the bounded knowledge projection. This avoids a
	// new tenant-wide SQL/query contract while still surfacing actionable task
	// correlations. Payload is deliberately never copied into the response.
	scopes := make([]struct{ kind, id string }, 0, len(result.Knowledge.KnowledgeBases)+len(result.Knowledge.FailedDocuments))
	for _, kb := range result.Knowledge.KnowledgeBases {
		scopes = append(scopes, struct{ kind, id string }{types.TaskScopeKnowledgeBase, kb.ID})
	}
	for _, doc := range result.Knowledge.FailedDocuments {
		scopes = append(scopes, struct{ kind, id string }{types.TaskScopeKnowledge, doc.ID})
	}
	result.Tasks.DeadLetters = make([]systemInvestigationDeadLetter, 0)
	seen := make(map[int64]struct{})
	queryFailed := false
	for _, scope := range scopes {
		if len(result.Tasks.DeadLetters) >= investigationTaskLimit {
			break
		}
		rows, _, err := h.deadLetterRepo.ListByScope(ctx, scope.kind, scope.id, "", investigationTaskLimit)
		if err != nil {
			queryFailed = true
			continue
		}
		for _, row := range rows {
			if row == nil || row.TenantID != 0 && row.TenantID != tenantID {
				continue
			}
			if _, exists := seen[row.ID]; exists {
				continue
			}
			seen[row.ID] = struct{}{}
			result.Tasks.DeadLetters = append(result.Tasks.DeadLetters, systemInvestigationDeadLetter{
				ID: row.ID, TenantID: row.TenantID, TaskType: row.TaskType, Scope: row.Scope,
				ScopeID: row.ScopeID, RelatedID: row.RelatedID, FailCount: row.FailCount,
				LastError: truncateInvestigationError(row.LastError), FailedAt: row.FailedAt,
			})
			if len(result.Tasks.DeadLetters) >= investigationTaskLimit {
				break
			}
		}
	}
	if queryFailed && len(result.Tasks.DeadLetters) == 0 {
		result.Tasks.Reason = "dead-letter lookup failed"
		return
	}
	result.Tasks.Available = true
}

func (h *SystemHandler) populateInvestigationRuntime(ctx context.Context, result *systemUserInvestigationResponse) {
	if h.taskInspector == nil {
		return
	}
	stats, supported, err := h.taskInspector.QueueStats(ctx)
	if err != nil {
		result.Runtime.Reason = "runtime queue lookup failed"
		return
	}
	if !supported {
		result.Runtime.Reason = "runtime queues unavailable in this deployment"
		return
	}
	result.Runtime.Available = true
	result.Runtime.QueueStats = stats
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
