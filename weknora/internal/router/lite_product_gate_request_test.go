package router

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func liteGateTestContext(method, target, body string) *gin.Context {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(method, target, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c
}

func TestLiteAgentScopedKnowledgeRequestBlocked(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name    string
		target  string
		blocked bool
	}{
		{name: "normal kb list", target: "/api/v1/knowledge-bases", blocked: false},
		{name: "agent scoped kb list", target: "/api/v1/knowledge-bases?agent_id=hidden-agent", blocked: true},
		{name: "shared agent scoped kb list", target: "/api/v1/knowledge-bases?agent_source_tenant_id=7", blocked: true},
		{name: "agent scoped kb detail", target: "/api/v1/knowledge-bases/kb-1?agent_id=hidden-agent", blocked: true},
		{name: "agent scoped knowledge route", target: "/api/v1/knowledge/item-1?agent_id=hidden-agent", blocked: true},
		{name: "unrelated route", target: "/api/v1/sessions?agent_id=hidden-agent", blocked: false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			c := liteGateTestContext(http.MethodGet, tt.target, "")
			if got := liteAgentScopedKnowledgeRequestBlocked(c); got != tt.blocked {
				t.Fatalf("liteAgentScopedKnowledgeRequestBlocked(%q) = %v, want %v", tt.target, got, tt.blocked)
			}
		})
	}
}

func TestLiteChatRequestBlocked(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name    string
		body    string
		blocked bool
	}{
		{name: "no explicit agent", body: `{"query":"hello"}`, blocked: false},
		{name: "quick answer", body: `{"query":"hello","agent_id":"builtin-quick-answer"}`, blocked: false},
		{name: "smart reasoning", body: `{"query":"hello","agent_id":"builtin-smart-reasoning"}`, blocked: false},
		{name: "custom agent", body: `{"query":"hello","agent_id":"custom-agent"}`, blocked: false},
		{name: "shared agent tenant", body: `{"query":"hello","agent_id":"builtin-quick-answer","agent_source_tenant_id":7}`, blocked: true},
		{name: "smart MCP override", body: `{"query":"hello","agent_id":"builtin-smart-reasoning","mcp_service_ids":["mcp-1"]}`, blocked: false},
		{name: "custom smart MCP override", body: `{"query":"hello","agent_id":"custom-agent","mcp_service_ids":["mcp-1"]}`, blocked: false},
		{name: "quick answer MCP override reaches runtime", body: `{"query":"hello","agent_id":"builtin-quick-answer","mcp_service_ids":["mcp-1"]}`, blocked: false},
		{name: "MCP override without agent reaches runtime", body: `{"query":"hello","mcp_service_ids":["mcp-1"]}`, blocked: false},
		{name: "skill override", body: `{"query":"hello","agent_id":"builtin-smart-reasoning","skill_names":["skill-1"]}`, blocked: true},
		{name: "smart MCP mention", body: `{"query":"hello","agent_id":"builtin-smart-reasoning","mentioned_items":[{"type":"mcp","id":"mcp-1"}]}`, blocked: false},
		{name: "MCP mention without agent reaches runtime", body: `{"query":"hello","mentioned_items":[{"type":"mcp","id":"mcp-1"}]}`, blocked: false},
		{name: "skill mention", body: `{"query":"hello","mentioned_items":[{"type":"skill","id":"skill-1"}]}`, blocked: true},
		{name: "sandbox config override", body: `{"query":"hello","sandbox_config_id":"cfg-1"}`, blocked: true},
		{name: "shell command override", body: `{"query":"hello","shell_command":"cat /etc/passwd"}`, blocked: true},
		{name: "generated artifact override", body: `{"query":"hello","generated_artifacts":[{"path":"/workspace/output/out.txt"}]}`, blocked: true},
		{name: "environment override", body: `{"query":"hello","env_vars":{"TOKEN":"secret"}}`, blocked: true},
		{name: "ordinary attachment stays valid", body: `{"query":"hello","attachment_ids":["upload-1"],"images":["img-1"]}`, blocked: false},
		{name: "enabled web search remains enabled", body: `{"query":"hello","web_search_enabled":true}`, blocked: false},
		{name: "disabled web search", body: `{"query":"hello","web_search_enabled":false}`, blocked: false},
		{name: "kb mention stays valid", body: `{"query":"hello","mentioned_items":[{"type":"kb","id":"kb-1"}]}`, blocked: false},
		{name: "malformed json stays native validation", body: `{"query":`, blocked: false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			c := liteGateTestContext(http.MethodPost, "/api/v1/knowledge-chat/session-1", tt.body)
			if got := liteChatRequestBlocked(c); got != tt.blocked {
				t.Fatalf("liteChatRequestBlocked(%s) = %v, want %v", tt.body, got, tt.blocked)
			}
			gotBody, err := io.ReadAll(c.Request.Body)
			if err != nil {
				t.Fatalf("read restored body: %v", err)
			}
			if tt.blocked || !json.Valid([]byte(tt.body)) {
				if string(gotBody) != tt.body {
					t.Fatalf("blocked/malformed request body changed: got %q want %q", string(gotBody), tt.body)
				}
				return
			}
			var rewritten map[string]json.RawMessage
			if err := json.Unmarshal(gotBody, &rewritten); err != nil {
				t.Fatalf("decode rewritten Lite chat body: %v", err)
			}
			var webSearchEnabled bool
			if err := json.Unmarshal(rewritten["web_search_enabled"], &webSearchEnabled); err != nil || !webSearchEnabled {
				t.Fatalf("Lite chat must force web_search_enabled=true, body=%s err=%v", gotBody, err)
			}
		})
	}

	c := liteGateTestContext(http.MethodPost, "/api/v1/agent-chat/session-1", `{"query":"hello","agent_id":"custom-agent"}`)
	if liteChatRequestBlocked(c) {
		t.Fatal("agent-chat must allow a tenant-local custom Agent")
	}
}

func TestLiteFavoriteRequestBlocked(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		method  string
		target  string
		body    string
		blocked bool
	}{
		{name: "list kb favorites", method: http.MethodGet, target: "/api/v1/user/favorites?type=kb", blocked: false},
		{name: "list agent favorites", method: http.MethodGet, target: "/api/v1/user/favorites?type=agent", blocked: true},
		{name: "create kb favorite", method: http.MethodPost, target: "/api/v1/user/favorites", body: `{"type":"kb","resource_id":"kb-1"}`, blocked: false},
		{name: "create agent favorite", method: http.MethodPost, target: "/api/v1/user/favorites", body: `{"type":"agent","resource_id":"agent-1"}`, blocked: true},
		{name: "delete kb favorite", method: http.MethodDelete, target: "/api/v1/user/favorites/kb/kb-1", blocked: false},
		{name: "delete agent favorite", method: http.MethodDelete, target: "/api/v1/user/favorites/agent/agent-1", blocked: true},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			c := liteGateTestContext(tt.method, tt.target, tt.body)
			if got := liteFavoriteRequestBlocked(c); got != tt.blocked {
				t.Fatalf("liteFavoriteRequestBlocked(%s %s) = %v, want %v", tt.method, tt.target, got, tt.blocked)
			}
			if tt.method == http.MethodPost {
				gotBody, err := io.ReadAll(c.Request.Body)
				if err != nil {
					t.Fatalf("read restored favorite body: %v", err)
				}
				if string(gotBody) != tt.body {
					t.Fatalf("favorite request body was not restored: got %q want %q", string(gotBody), tt.body)
				}
			}
		})
	}
}
