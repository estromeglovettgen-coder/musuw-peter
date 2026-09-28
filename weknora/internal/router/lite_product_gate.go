package router

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/handler"
)

const (
	musuwProductEditionEnv    = "MUSUW_PRODUCT_EDITION"
	musuwDevLocalAuthEnv      = "MUSUW_DEV_LOCAL_AUTH"
	liteQuickAnswerAgentID    = "builtin-quick-answer"
	liteSmartReasoningAgentID = "builtin-smart-reasoning"
)

// Apply the optional product exposure override before NewRouter is built.
// The production container already loads production.env, so operators can
// switch Lite <-> Standard by changing one value and restarting the app.
// Invalid/empty values are ignored and the build-time Edition remains intact.
func init() {
	if edition, ok := normalizeMusuwProductEdition(os.Getenv(musuwProductEditionEnv)); ok {
		handler.Edition = edition
	}
	service.SetProductEdition(handler.Edition)
}

func normalizeMusuwProductEdition(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "lite":
		return "lite", true
	case "standard":
		return "standard", true
	default:
		return "", false
	}
}

func abortLiteProductRoute(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusNotFound, gin.H{
		"success": false,
		"message": "not found",
	})
}

func serveLiteSystemInfo(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusOK, gin.H{
		"code": 0,
		"msg":  "success",
		"data": gin.H{
			"version": handler.Version,
			"edition": handler.Edition,
		},
	})
}

func isLoopbackHost(raw string) bool {
	host := strings.TrimSpace(raw)
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}
	host = strings.Trim(strings.ToLower(host), "[]")
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func liteLocalMusuwLoginAllowed(c *gin.Context) bool {
	if !strings.EqualFold(strings.TrimSpace(os.Getenv(musuwDevLocalAuthEnv)), "true") ||
		!isLoopbackHost(os.Getenv("SERVER_HOST")) ||
		c.Request.Method != http.MethodPost || c.Request.URL.Path != "/api/v1/auth/login" {
		return false
	}

	remoteHost, _, err := net.SplitHostPort(strings.TrimSpace(c.Request.RemoteAddr))
	if err != nil {
		remoteHost = strings.Trim(strings.TrimSpace(c.Request.RemoteAddr), "[]")
	}
	remoteIP := net.ParseIP(remoteHost)
	if remoteIP == nil || !remoteIP.IsLoopback() {
		return false
	}

	return isLoopbackHost(c.Request.Host)
}

func readAndRestoreRequestBody(c *gin.Context) ([]byte, error) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, err
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}

func liteFavoriteRequestBlocked(c *gin.Context) bool {
	const base = "/api/v1/user/favorites"
	path := strings.TrimSpace(c.Request.URL.Path)
	method := strings.ToUpper(strings.TrimSpace(c.Request.Method))

	if path == base {
		switch method {
		case http.MethodGet:
			return !strings.EqualFold(strings.TrimSpace(c.Query("type")), "kb")
		case http.MethodPost:
			body, err := readAndRestoreRequestBody(c)
			if err != nil {
				return true
			}
			var req struct {
				Type string `json:"type"`
			}
			if err := json.Unmarshal(body, &req); err != nil {
				return true
			}
			return !strings.EqualFold(strings.TrimSpace(req.Type), "kb")
		default:
			return true
		}
	}

	if strings.HasPrefix(path, base+"/") {
		if method != http.MethodDelete {
			return true
		}
		rest := strings.TrimPrefix(path, base+"/")
		parts := strings.SplitN(rest, "/", 2)
		return len(parts) != 2 || !strings.EqualFold(strings.TrimSpace(parts[0]), "kb") || strings.TrimSpace(parts[1]) == ""
	}

	return false
}

func liteAgentScopedKnowledgeRequestBlocked(c *gin.Context) bool {
	path := strings.TrimSpace(c.Request.URL.Path)
	if !strings.HasPrefix(path, "/api/v1/knowledge-bases") &&
		!strings.HasPrefix(path, "/api/v1/knowledge") {
		return false
	}
	return strings.TrimSpace(c.Query("agent_id")) != "" ||
		strings.TrimSpace(c.Query("agent_source_tenant_id")) != ""
}

func liteChatRequestBlocked(c *gin.Context) bool {
	if c.Request.Method != http.MethodPost {
		return false
	}
	path := strings.TrimSpace(c.Request.URL.Path)
	if !strings.HasPrefix(path, "/api/v1/knowledge-chat/") &&
		!strings.HasPrefix(path, "/api/v1/agent-chat/") {
		return false
	}

	body, err := readAndRestoreRequestBody(c)
	if err != nil {
		return true
	}
	var req struct {
		AgentID             string   `json:"agent_id"`
		AgentSourceTenantID uint64   `json:"agent_source_tenant_id"`
		MCPServiceIDs       []string `json:"mcp_service_ids"`
		SkillNames          []string `json:"skill_names"`
		MentionedItems      []struct {
			Type string `json:"type"`
		} `json:"mentioned_items"`
	}
	// Malformed JSON is not a product-policy decision. Restore the body and let
	// the native handler preserve its existing 400 validation semantics.
	if err := json.Unmarshal(body, &req); err != nil {
		return false
	}
	// Local agents (built-in or tenant-owned custom) are resolved by the native
	// service using the request tenant context. A non-zero source tenant is the
	// shared-agent selector and remains a hidden Lite capability.
	if req.AgentSourceTenantID != 0 {
		return true
	}
	// MCP fields are passed through to the native runtime. Quick-answer simply
	// ignores them because it uses the normal RAG path; smart/custom agent
	// configuration decides whether and which services can actually run.
	if len(req.SkillNames) > 0 {
		return true
	}
	for _, item := range req.MentionedItems {
		if strings.EqualFold(strings.TrimSpace(item.Type), "skill") {
			return true
		}
	}
	// The native request DTO intentionally ignores unknown fields, so a caller
	// could otherwise smuggle executable-runtime inputs through an old/new
	// client mismatch. Keep ordinary document attachments, images and MCP
	// selectors intact, but deny every field that can select a sandbox, skill,
	// shell/environment operation, or generated artifact. This check walks
	// nested objects/arrays as well as the top-level payload.
	var rawPayload any
	if err := json.Unmarshal(body, &rawPayload); err == nil && liteChatContainsExecutableField(rawPayload) {
		return true
	}

	// Lite owns this capability as a platform policy, not a client preference.
	// Preserve every unknown/native request field as raw JSON while forcing the
	// handler-visible value on even when an old browser omits it or a crafted
	// request sends false. The Lite UI deliberately keeps the toggle hidden.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil || fields == nil {
		return false
	}
	fields["web_search_enabled"] = json.RawMessage("true")
	rewritten, err := json.Marshal(fields)
	if err != nil {
		return true
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(rewritten))
	c.Request.ContentLength = int64(len(rewritten))
	c.Request.Header.Set("Content-Length", strconv.Itoa(len(rewritten)))
	return false
}

var liteExecutableChatFieldNames = map[string]struct{}{
	"artifact": {}, "artifacts": {}, "artifact_id": {}, "artifact_ids": {},
	"generated_artifact": {}, "generated_artifacts": {}, "generated_file": {}, "generated_files": {},
	"sandbox": {}, "sandbox_id": {}, "sandbox_config": {}, "sandbox_config_id": {},
	"sandbox_file": {}, "sandbox_files": {}, "sandbox_path": {},
	"env": {}, "env_var": {}, "env_vars": {}, "environment": {}, "environment_variables": {},
	"shell": {}, "shell_command": {}, "shell_commands": {}, "command": {}, "commands": {},
	"execute": {}, "execution": {}, "code_execution": {},
	"skill": {}, "skills": {}, "skill_id": {}, "skill_ids": {}, "skill_name": {}, "skill_names": {},
	"skill_selection_mode": {},
	"list_sandbox_files":   {}, "read_sandbox_file": {}, "write_sandbox_file": {}, "edit_sandbox_file": {},
}

func liteChatContainsExecutableField(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for key, nested := range typed {
			normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(key, "-", "_")))
			if _, blocked := liteExecutableChatFieldNames[normalized]; blocked {
				return true
			}
			if liteChatContainsExecutableField(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range typed {
			if liteChatContainsExecutableField(nested) {
				return true
			}
		}
	}
	return false
}

// liteTemporaryAttachmentRequestBlocked keeps shared-agent attachment uploads
// out of Lite. Local built-in and tenant-owned custom agents are resolved by
// the native service from the authenticated tenant context.
func liteTemporaryAttachmentRequestBlocked(c *gin.Context) bool {
	if c.Request.Method != http.MethodPost {
		return false
	}
	const prefix = "/api/v1/sessions/"
	const suffix = "/attachments"
	path := strings.TrimSpace(c.Request.URL.Path)
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return false
	}
	if strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)) == "" {
		return false
	}

	// Parse only the multipart form used by the upload route. Non-multipart
	// requests are left to the native handler so its existing 400 response is
	// preserved; malformed multipart requests cannot reach model resolution.
	if c.Request.MultipartForm == nil && strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "multipart/form-data") {
		if err := c.Request.ParseMultipartForm(2 << 20); err != nil {
			return false
		}
	}
	if form := c.Request.MultipartForm; form != nil {
		for _, headers := range form.File {
			for _, header := range headers {
				if header != nil && strings.EqualFold(filepath.Ext(header.Filename), ".xmind") {
					return true
				}
			}
		}
	}
	sourceTenantID := strings.TrimSpace(c.PostForm("agent_source_tenant_id"))
	if sourceTenantID == "" || sourceTenantID == "0" {
		return false
	}
	parsed, err := strconv.ParseUint(sourceTenantID, 10, 64)
	return err != nil || parsed != 0
}

// liteProductGate is the server-side product exposure boundary for Musuw Lite.
//
// Frontend hiding is UX only. This middleware is authoritative for authenticated
// /api/v1 traffic: knowing a WeKnora URL, changing localStorage, or crafting a
// request manually must not re-enable management surfaces that Musuw Lite does
// not expose.
//
// Standard edition is deliberately untouched so switching back to the normal
// WeKnora build restores the complete upstream surface without source recovery.
func liteProductGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.EqualFold(strings.TrimSpace(handler.Edition), "lite") {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		if liteLocalMusuwLoginAllowed(c) {
			c.Next()
			return
		}

		// Workspace switching is not an exposed Lite capability. The SPA clears
		// its old selected-tenant preference as soon as the server reports Lite;
		// reject a manually crafted X-Tenant-ID as well. System info is the one
		// exception because it is used to discover Edition before stale browser
		// state can be cleared.
		if strings.TrimSpace(c.GetHeader("X-Tenant-ID")) != "" && c.Request.URL.Path != "/api/v1/system/info" {
			abortLiteProductRoute(c)
			return
		}

		// The browser only needs Edition to activate/deactivate the Musuw product
		// boundary. Do not pass Lite /system/info through to the full system
		// handler, which also exposes database/vector/graph/storage internals.
		if c.Request.Method == http.MethodGet && c.Request.URL.Path == "/api/v1/system/info" {
			serveLiteSystemInfo(c)
			return
		}

		// Favorites are shared by Knowledge Base and Agent directories upstream.
		// Lite exposes the KB directory only, so the shared API is narrowed to
		// type=kb instead of becoming an Agent discovery/mutation backdoor.
		if strings.HasPrefix(c.Request.URL.Path, "/api/v1/user/favorites") && liteFavoriteRequestBlocked(c) {
			abortLiteProductRoute(c)
			return
		}

		// Shared/custom Agent KB access is a hidden Agent capability. Local Lite
		// built-ins use the ordinary KB paths, so agent-scoped KB query parameters
		// are never required by the exposed Chat/KB UI.
		if liteAgentScopedKnowledgeRequestBlocked(c) {
			abortLiteProductRoute(c)
			return
		}

		// Both native QA endpoints accept Agent/MCP/Skill overrides in their JSON
		// request. Shared-agent selectors and Skills stay hidden; local custom
		// agents and smart-agent MCP remain native, tenant-scoped capabilities.
		if liteChatRequestBlocked(c) {
			abortLiteProductRoute(c)
			return
		}

		if liteTemporaryAttachmentRequestBlocked(c) {
			abortLiteProductRoute(c)
			return
		}

		if liteProductRouteBlocked(c.Request.Method, c.Request.URL.Path) {
			abortLiteProductRoute(c)
			return
		}
		c.Next()
	}
}

// litePrivateWorkspaceEnabled mirrors the product gate's process-wide
// edition decision for KB-access middleware. Keeping the decision in the
// existing edition seam lets Standard retain native WeKnora sharing while
// Lite rejects shared-KB deep links after the resource is resolved.
func litePrivateWorkspaceEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(handler.Edition), "lite")
}

func liteAgentPathAllowed(method, path string) bool {
	const base = "/api/v1/agents"
	if path == base {
		return method == http.MethodGet || method == http.MethodPost
	}
	for _, suffix := range []string{"/placeholders", "/type-presets"} {
		if path == base+suffix {
			return method == http.MethodGet
		}
	}
	if !strings.HasPrefix(path, base+"/") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(path, base+"/"), "/")
	if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
		return false
	}
	if len(parts) == 1 {
		return method == http.MethodGet || method == http.MethodPut || method == http.MethodDelete
	}
	if len(parts) == 2 && parts[1] == "copy" {
		return method == http.MethodPost
	}
	if len(parts) == 2 && parts[1] == "suggested-questions" {
		return method == http.MethodGet
	}
	if len(parts) == 2 && (parts[1] == "im-channels" || parts[1] == "embed-channels") {
		return method == http.MethodGet || method == http.MethodPost
	}
	return false
}

// liteChannelManagementPathAllowed enumerates the existing authenticated IM
// and embed management API. Keeping this list exact lets Lite expose channel
// management without opening unrelated settings or unknown nested routes.
func liteChannelManagementPathAllowed(method, path string) bool {
	if path == "/api/v1/im-channels" || path == "/api/v1/embed-channels" {
		return method == http.MethodGet
	}

	if strings.HasPrefix(path, "/api/v1/im-channels/") {
		parts := strings.Split(strings.TrimPrefix(path, "/api/v1/im-channels/"), "/")
		if len(parts) == 1 && strings.TrimSpace(parts[0]) != "" {
			return method == http.MethodPut || method == http.MethodDelete
		}
		return len(parts) == 2 && strings.TrimSpace(parts[0]) != "" &&
			parts[1] == "toggle" && method == http.MethodPost
	}

	if strings.HasPrefix(path, "/api/v1/embed-channels/") {
		parts := strings.Split(strings.TrimPrefix(path, "/api/v1/embed-channels/"), "/")
		if len(parts) == 1 && strings.TrimSpace(parts[0]) != "" {
			return method == http.MethodGet || method == http.MethodPut || method == http.MethodDelete
		}
		if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" {
			return false
		}
		switch parts[1] {
		case "rotate-token", "preview-session":
			return method == http.MethodPost
		case "stats":
			return method == http.MethodGet
		default:
			return false
		}
	}

	return method == http.MethodPost &&
		(path == "/api/v1/wechat/qrcode" || path == "/api/v1/wechat/qrcode/status")
}

// liteOperationsAdminRouteAllowed exposes only the narrow operations-console
// seam in Lite. These routes remain behind the existing SystemAdmin guard and
// capability-scoped platform API-key middleware; this function only prevents
// the product-surface gate from turning an authorized request into a 404.
// Platform key management, settings and every other upstream admin surface
// remain hidden.
func liteOperationsAdminRouteAllowed(method, path string) bool {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSpace(path)

	const marketProducts = "/api/v1/system/creator-marketplace/products"
	if path == marketProducts {
		return method == http.MethodGet
	}
	if strings.HasPrefix(path, marketProducts+"/") {
		parts := strings.Split(strings.TrimPrefix(path, marketProducts+"/"), "/")
		return (len(parts) == 1 && parts[0] != "" && method == http.MethodPut) ||
			(len(parts) == 2 && parts[0] != "" && parts[1] == "review" && method == http.MethodPost)
	}

	if method == http.MethodGet && path == "/api/v1/system/admin/audit-log" {
		return true
	}

	const consumerModelPolicy = "/api/v1/system/admin/consumer-model-policy"
	if path == consumerModelPolicy {
		return method == http.MethodGet
	}
	if method == http.MethodPut && strings.HasPrefix(path, consumerModelPolicy+"/") {
		parts := strings.Split(strings.TrimPrefix(path, consumerModelPolicy+"/"), "/")
		if len(parts) != 1 {
			return false
		}
		for _, scene := range []string{"rag", "rerank", "wiki", "vision", "asr"} {
			if parts[0] == scene {
				return true
			}
		}
		return false
	}

	const tenantPrefix = "/api/v1/system/admin/tenants/"
	if strings.HasPrefix(path, tenantPrefix) {
		parts := strings.Split(strings.TrimPrefix(path, tenantPrefix), "/")
		if len(parts) == 0 {
			return false
		}
		tenantID, err := strconv.ParseUint(parts[0], 10, 64)
		if err != nil || tenantID == 0 {
			return false
		}
		switch {
		case method == http.MethodPatch && len(parts) == 1:
			return true
		case method == http.MethodGet && len(parts) == 2 && parts[1] == "entitlement":
			return true
		case method == http.MethodPut && len(parts) == 2 && parts[1] == "openrouter-credits":
			return true
		case method == http.MethodPut && len(parts) == 2 && parts[1] == "complimentary-entitlement":
			return true
		case method == http.MethodDelete && len(parts) == 2 && parts[1] == "complimentary-entitlement":
			return true
		default:
			return false
		}
	}

	const userPrefix = "/api/v1/system/admin/users/"
	if strings.HasPrefix(path, userPrefix) {
		parts := strings.Split(strings.TrimPrefix(path, userPrefix), "/")
		if len(parts) == 1 && method == http.MethodDelete {
			return strings.TrimSpace(parts[0]) != ""
		}
		return method == http.MethodGet && len(parts) == 2 && strings.TrimSpace(parts[0]) != "" && parts[1] == "investigation"
	}

	const runtimeQueues = "/api/v1/system/admin/runtime/queues"
	if path == runtimeQueues {
		return method == http.MethodGet
	}
	if strings.HasPrefix(path, runtimeQueues+"/") {
		parts := strings.Split(strings.TrimPrefix(path, runtimeQueues+"/"), "/")
		if len(parts) < 2 || strings.TrimSpace(parts[0]) == "" {
			return false
		}
		switch {
		case method == http.MethodGet && len(parts) == 2 && parts[1] == "tasks":
			return true
		case method == http.MethodDelete && len(parts) == 2 && parts[1] == "archived":
			return true
		case method == http.MethodPost && len(parts) == 5 && parts[1] == "tasks" &&
			strings.TrimSpace(parts[2]) != "" && parts[3] == "actions" && strings.TrimSpace(parts[4]) != "":
			return true
		default:
			return false
		}
	}

	return false
}

// liteProductRouteBlocked keeps shared runtime dependencies narrow rather than
// blindly disabling every route family. Chat still needs read-only model/agent
// metadata, while Knowledge Base keeps its own sharing, parsing, Trace, Wiki and
// Graph workflows. Management-only surfaces are denied.
func liteProductRouteBlocked(method, path string) bool {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = strings.TrimSpace(path)

	// FAQ is not a Lite product concept. Existing rows are retained for the
	// read-only startup audit, but every FAQ route (including list/search,
	// import progress, edit and cleanup) is unreachable from the consumer API.
	if strings.HasPrefix(path, "/api/v1/knowledge-bases/") {
		parts := strings.Split(strings.TrimPrefix(path, "/api/v1/knowledge-bases/"), "/")
		// The legacy duplicate endpoint copies settings only. Lite exposes the
		// native asynchronous /copy workflow instead, which also clones the
		// knowledge content; keep the old contract out of this product surface.
		if method == http.MethodPost && len(parts) == 2 && parts[1] == "duplicate" {
			return true
		}
		if len(parts) >= 2 && strings.EqualFold(parts[1], "faq") {
			return true
		}
	}
	if path == "/api/v1/faq/import/progress" || strings.HasPrefix(path, "/api/v1/faq/import/progress/") {
		return true
	}

	// Musuw uses the external OIDC/Auth shell for human identity. Native
	// password registration/login/change-password, desktop auto-setup, tenant
	// switching/preferences, and invite registration are not consumer surfaces.
	// OIDC config/url/callback, refresh, validate, logout and /auth/me remain.
	for _, blockedAuthPath := range []string{
		"/api/v1/auth/register",
		"/api/v1/auth/login",
		"/api/v1/auth/change-password",
		"/api/v1/auth/config",
		"/api/v1/auth/auto-setup",
		"/api/v1/auth/switch-tenant",
		"/api/v1/auth/me/preferences",
		"/api/v1/auth/register-by-invite",
		"/api/v1/auth/invitations/lookup",
	} {
		if path == blockedAuthPath {
			return true
		}
	}
	if path == "/api/v1/auth/me" && method == http.MethodDelete {
		return true
	}

	if liteOperationsAdminRouteAllowed(method, path) {
		return false
	}
	if liteChannelManagementPathAllowed(method, path) {
		return false
	}

	// Entire management-only route families.
	for _, prefix := range []string{
		"/api/v1/evaluation",
		"/api/v1/web-search",
		"/api/v1/web-search-providers",
		"/api/v1/vector-stores",
		"/api/v1/storage-backends",
		"/api/v1/datasource",
		"/api/v1/data-sources",
		"/api/v1/weknora-cloud",
		"/api/v1/weknoracloud",
		"/api/v1/system/admin",
		"/api/v1/skills",
		"/api/v1/shared-agents",
		"/api/v1/im-channels",
		"/api/v1/embed-channels",
		"/api/v1/wechat",
		"/api/v1/chunker/preview",
		"/api/v1/sandbox-configs",
	} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	if path == "/api/v1/me/env-vars" || strings.HasPrefix(path, "/api/v1/me/env-vars/") {
		return true
	}
	if liteGeneratedArtifactRoute(path) {
		return true
	}

	// Model catalog is a chat runtime dependency. Lite may read the runtime
	// model list/detail, but provider metadata and every mutation/debug/
	// credential surface remain hidden.
	if path == "/api/v1/models" {
		return method != http.MethodGet
	}
	if strings.HasPrefix(path, "/api/v1/models/") {
		if method != http.MethodGet {
			return true
		}
		if path == "/api/v1/models/providers" || strings.Contains(path, "/credentials") || strings.HasSuffix(path, "/debug") {
			return true
		}
		// A single model detail is the only nested read required by runtime UI.
		rest := strings.TrimPrefix(path, "/api/v1/models/")
		if strings.HasPrefix(rest, "scene-options/") {
			return false
		}
		return rest == "" || strings.Contains(rest, "/")
	}

	// Native agent cards/editor, the conversation picker, and agent-scoped
	// channel management are exposed in Lite. Route-level RBAC still controls
	// list/detail/create/update/delete; sharing remains hidden below.
	if strings.HasPrefix(path, "/api/v1/agents") {
		return !liteAgentPathAllowed(method, path)
	}

	// Musuw Lite is a single-user private workspace. Organization discovery,
	// collaboration collection/detail, and every shared-KB projection are not
	// product capabilities, including read-only routes. The deep-link KB
	// resource guard below handles an already-known shared KB ID.
	if path == "/api/v1/organizations" || strings.HasPrefix(path, "/api/v1/organizations/") {
		return true
	}
	if path == "/api/v1/shared-knowledge-bases" || strings.HasPrefix(path, "/api/v1/shared-knowledge-bases/") {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/knowledge-bases/") {
		parts := strings.Split(strings.TrimPrefix(path, "/api/v1/knowledge-bases/"), "/")
		if len(parts) >= 2 && strings.EqualFold(parts[1], "shares") {
			return true
		}
	}

	// These are the only tenant KV entries consumed by exposed Lite surfaces:
	// retrieval settings, the native prompt defaults, and the read-only storage
	// selection that the upstream Agent editor loads with its other dependencies.
	if path == "/api/v1/tenants/kv/retrieval-config" {
		return method != http.MethodGet && method != http.MethodPut
	}
	if path == "/api/v1/tenants/kv/prompt-templates" {
		return method != http.MethodGet
	}
	if path == "/api/v1/tenants/kv/storage-engine-config" {
		return method != http.MethodGet
	}
	if path == "/api/v1/tenants/kv/memory-config" {
		// The native route's Viewer/Admin guards remain authoritative: Lite
		// exposes the existing workspace memory configuration seam only to the
		// roles that already own it.
		return method != http.MethodGet && method != http.MethodPut
	}

	// Workspace lifecycle/settings/member/invitation/API-key administration is
	// not a Musuw Lite surface. The current tenant identity already comes from
	// /auth/me, so there is no need to expose even GET /tenants/:id.
	if path == "/api/v1/tenants" || strings.HasPrefix(path, "/api/v1/tenants/") {
		return true
	}
	if path == "/api/v1/me/invitations" || strings.HasPrefix(path, "/api/v1/me/invitations/") {
		return true
	}

	// System settings/admin probes are hidden. These read-only endpoints
	// support capability, parser/storage, and edition discovery in Lite.
	if path == "/api/v1/system" || strings.HasPrefix(path, "/api/v1/system/") {
		if method != http.MethodGet {
			return true
		}
		switch path {
		case "/api/v1/system/capabilities",
			"/api/v1/system/info",
			"/api/v1/system/parser-engines",
			"/api/v1/system/storage-engine-status":
			return false
		default:
			return true
		}
	}

	// Initialization/configuration is an operator seam. The Lite knowledge-base
	// editor uses the curated /knowledge-bases contract and must not read or
	// overwrite raw model, parser, storage, graph, or provider configuration.
	if path == "/api/v1/initialization" || strings.HasPrefix(path, "/api/v1/initialization/") {
		return true
	}

	return false
}

// liteGeneratedArtifactRoute identifies only the session artifact families.
// Ordinary sessions, attachments and document previews remain available.
func liteGeneratedArtifactRoute(path string) bool {
	const prefix = "/api/v1/sessions/"
	if !strings.HasPrefix(path, prefix) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(path, prefix), "/")
	if len(parts) >= 2 && strings.TrimSpace(parts[0]) != "" && parts[1] == "artifacts" {
		return true
	}
	return len(parts) >= 4 && strings.TrimSpace(parts[0]) != "" &&
		parts[1] == "messages" && strings.TrimSpace(parts[2]) != "" && parts[3] == "artifacts"
}
