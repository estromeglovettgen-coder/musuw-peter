package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/im"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type imManagementAgentService struct {
	interfaces.CustomAgentService
	agent *types.CustomAgent
}

func (s *imManagementAgentService) GetAgentByID(_ context.Context, id string) (*types.CustomAgent, error) {
	if s.agent != nil && s.agent.ID == id {
		return s.agent, nil
	}
	return nil, nil
}

func newIMManagementDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:im-handler-management-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.Exec(`CREATE TABLE im_channels (
		id TEXT PRIMARY KEY,
		tenant_id INTEGER NOT NULL,
		agent_id TEXT NOT NULL,
		platform TEXT NOT NULL,
		name TEXT NOT NULL DEFAULT '',
		enabled NUMERIC NOT NULL DEFAULT 1,
		mode TEXT NOT NULL DEFAULT 'websocket',
		output_mode TEXT NOT NULL DEFAULT 'stream',
		knowledge_base_id TEXT DEFAULT '',
		bot_identity TEXT NOT NULL DEFAULT '',
		session_mode TEXT NOT NULL DEFAULT 'user',
		credentials TEXT NOT NULL DEFAULT '{}',
		created_at DATETIME,
		updated_at DATETIME,
		deleted_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create im_channels: %v", err)
	}
	return db
}

func newIMManagementService(t *testing.T, db *gorm.DB, agent *types.CustomAgent) *im.Service {
	t.Helper()
	svc := im.NewService(
		db, nil, nil, nil, &imManagementAgentService{agent: agent}, nil, nil,
		nil, nil, nil, nil, nil, nil, nil,
	)
	t.Cleanup(svc.Stop)
	return svc
}

func serveIMManagementRequest(
	t *testing.T,
	h *IMHandler,
	tenantID uint64,
	method string,
	path string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenantID)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	r.POST("/agents/:id/im-channels", h.CreateIMChannel)
	r.GET("/im-channels", h.ListAllIMChannels)
	r.PUT("/im-channels/:id", h.UpdateIMChannel)
	r.POST("/im-channels/:id/toggle", h.ToggleIMChannel)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestCreateIMChannelRejectsAgentFromAnotherTenant(t *testing.T) {
	db := newIMManagementDB(t)
	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "foreign-agent", TenantID: 99})
	h := NewIMHandler(svc)

	w := serveIMManagementRequest(t, h, 42, http.MethodPost, "/agents/foreign-agent/im-channels", `{
		"platform":"feishu",
		"name":"must-not-exist",
		"enabled":false,
		"credentials":{"app_id":"foreign","app_secret":"secret"}
	}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", w.Code, w.Body.String())
	}

	var count int64
	if err := db.Model(&im.IMChannel{}).Count(&count).Error; err != nil {
		t.Fatalf("count channels: %v", err)
	}
	if count != 0 {
		t.Fatalf("created %d channel(s) for a foreign-tenant agent, want 0", count)
	}
}

func TestCreateIMChannelReturnsWriteOnlyCredentialSummary(t *testing.T) {
	db := newIMManagementDB(t)
	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "local-agent", TenantID: 42})
	h := NewIMHandler(svc)

	w := serveIMManagementRequest(t, h, 42, http.MethodPost, "/agents/local-agent/im-channels", `{
		"platform":"feishu",
		"name":"local channel",
		"enabled":false,
		"credentials":{"app_id":"local","app_secret":"submitted-secret"}
	}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{"submitted-secret", `"credentials":`, `"bot_identity":`} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("create response leaked %q: %s", forbidden, w.Body.String())
		}
	}
	var response struct {
		Data struct {
			CredentialsConfigured bool `json:"credentials_configured"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !response.Data.CredentialsConfigured {
		t.Fatalf("create response did not report configured credentials: %s", w.Body.String())
	}
}

func TestCreateIMChannelDuplicateDoesNotLeakForeignTenantMetadata(t *testing.T) {
	db := newIMManagementDB(t)
	foreign := &im.IMChannel{
		ID:          "foreign-channel-sensitive-id",
		TenantID:    99,
		AgentID:     "foreign-agent",
		Platform:    "mattermost",
		Name:        "foreign-channel-sensitive-name",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"shared-sensitive-bot-key"}`),
	}
	if err := db.Create(foreign).Error; err != nil {
		t.Fatalf("create foreign channel: %v", err)
	}

	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "local-agent", TenantID: 42})
	h := NewIMHandler(svc)
	w := serveIMManagementRequest(t, h, 42, http.MethodPost, "/agents/local-agent/im-channels", `{
		"platform":"mattermost",
		"name":"local channel",
		"enabled":false,
		"credentials":{"outgoing_token":"shared-sensitive-bot-key"}
	}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", w.Code, w.Body.String())
	}
	var response struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Error != "this bot is already bound to another channel" {
		t.Fatalf("error = %q, want generic duplicate error", response.Error)
	}
	for _, forbidden := range []string{foreign.ID, foreign.Name, "shared-sensitive-bot-key", foreign.BotIdentity} {
		if forbidden != "" && strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("duplicate conflict leaked %q: %s", forbidden, w.Body.String())
		}
	}
}

func TestUpdateIMChannelDuplicateDoesNotLeakForeignTenantMetadata(t *testing.T) {
	db := newIMManagementDB(t)
	foreign := &im.IMChannel{
		ID:          "foreign-channel-sensitive-id",
		TenantID:    99,
		AgentID:     "foreign-agent",
		Platform:    "mattermost",
		Name:        "foreign-channel-sensitive-name",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"shared-sensitive-bot-key"}`),
	}
	local := &im.IMChannel{
		ID:          "local-channel",
		TenantID:    42,
		AgentID:     "local-agent",
		Platform:    "mattermost",
		Name:        "local channel",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"old-local-key"}`),
	}
	for _, channel := range []*im.IMChannel{foreign, local} {
		if err := db.Create(channel).Error; err != nil {
			t.Fatalf("create channel %s: %v", channel.ID, err)
		}
	}

	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "local-agent", TenantID: 42})
	h := NewIMHandler(svc)
	w := serveIMManagementRequest(t, h, 42, http.MethodPut, "/im-channels/local-channel", `{
		"credentials":{"outgoing_token":"shared-sensitive-bot-key"}
	}`)
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{foreign.ID, foreign.Name, "shared-sensitive-bot-key", foreign.BotIdentity} {
		if forbidden != "" && strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("duplicate conflict leaked %q: %s", forbidden, w.Body.String())
		}
	}
}

func TestListAllIMChannelsOmitsStoredIdentityAndCredentials(t *testing.T) {
	db := newIMManagementDB(t)
	if err := db.Exec(`CREATE TABLE custom_agents (
		id TEXT PRIMARY KEY,
		tenant_id INTEGER NOT NULL,
		name TEXT NOT NULL DEFAULT '',
		deleted_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create custom_agents: %v", err)
	}
	if err := db.Exec(
		"INSERT INTO custom_agents (id, tenant_id, name) VALUES (?, ?, ?)",
		"agent-1", 42, "Support agent",
	).Error; err != nil {
		t.Fatalf("create custom agent: %v", err)
	}

	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "agent-1", TenantID: 42})
	h := NewIMHandler(svc)
	stored := &im.IMChannel{
		ID:          "channel-1",
		TenantID:    42,
		AgentID:     "agent-1",
		Platform:    "mattermost",
		Name:        "support",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"tenant-overview-secret"}`),
	}
	if err := db.Create(stored).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}

	w := serveIMManagementRequest(t, h, 42, http.MethodGet, "/im-channels", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{"tenant-overview-secret", `"credentials":`, `"bot_identity":`} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("tenant overview leaked %q: %s", forbidden, w.Body.String())
		}
	}
}

func TestUpdateIMChannelKeepsOmittedCredentialsWithoutEchoingSecret(t *testing.T) {
	db := newIMManagementDB(t)
	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "agent-1", TenantID: 42})
	h := NewIMHandler(svc)
	original := types.JSON(`{"app_id":"app-1","app_secret":"top-secret"}`)
	stored := &im.IMChannel{
		ID:          "channel-1",
		TenantID:    42,
		AgentID:     "agent-1",
		Platform:    "feishu",
		Name:        "before",
		Enabled:     false,
		Mode:        "websocket",
		OutputMode:  "stream",
		SessionMode: "user",
		Credentials: original,
	}
	if err := db.Create(stored).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}

	w := serveIMManagementRequest(t, h, 42, http.MethodPut, "/im-channels/channel-1", `{"name":"after"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{"top-secret", `"credentials":`, `"bot_identity":`} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("update response leaked %q: %s", forbidden, w.Body.String())
		}
	}
	var response struct {
		Data struct {
			CredentialsConfigured bool `json:"credentials_configured"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !response.Data.CredentialsConfigured {
		t.Fatalf("response lost credential presence summary: %s", w.Body.String())
	}

	fresh, err := svc.GetChannelByIDAndTenant("channel-1", 42)
	if err != nil {
		t.Fatalf("reload channel: %v", err)
	}
	if fresh.Name != "after" || string(fresh.Credentials) != string(original) {
		t.Fatalf("update changed omitted credentials: name=%q credentials=%s", fresh.Name, fresh.Credentials)
	}
}

func TestUpdateIMChannelMergesCredentialKeysWithoutClearingStoredSecrets(t *testing.T) {
	db := newIMManagementDB(t)
	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "agent-1", TenantID: 42})
	h := NewIMHandler(svc)
	stored := &im.IMChannel{
		ID:          "channel-1",
		TenantID:    42,
		AgentID:     "agent-1",
		Platform:    "mattermost",
		Name:        "support",
		Enabled:     false,
		Mode:        "webhook",
		OutputMode:  "full",
		SessionMode: "user",
		Credentials: types.JSON(`{
			"bot_token":"keep-bot-token",
			"outgoing_token":"keep-outgoing-token",
			"other_secret":"keep-other-secret",
			"post_to_main":true,
			"retry_limit":7,
			"label":"before",
			"replace_one_secret":"old-secret"
		}`),
	}
	if err := db.Create(stored).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}

	w := serveIMManagementRequest(t, h, 42, http.MethodPut, "/im-channels/channel-1", `{
		"credentials":{
			"post_to_main":false,
			"retry_limit":0,
			"label":"",
			"replace_one_secret":"new-secret"
		}
	}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{
		"keep-bot-token",
		"keep-outgoing-token",
		"new-secret",
		`"credentials":`,
		`"bot_identity":`,
	} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("update response leaked %q: %s", forbidden, w.Body.String())
		}
	}

	fresh, err := svc.GetChannelByIDAndTenant("channel-1", 42)
	if err != nil {
		t.Fatalf("reload channel: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(fresh.Credentials, &got); err != nil {
		t.Fatalf("decode stored credentials: %v", err)
	}
	want := map[string]any{
		"bot_token":          "keep-bot-token",
		"outgoing_token":     "keep-outgoing-token",
		"other_secret":       "keep-other-secret",
		"post_to_main":       false,
		"retry_limit":        float64(0),
		"label":              "",
		"replace_one_secret": "new-secret",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stored credentials = %#v, want %#v", got, want)
	}
}

func TestUpdateIMChannelRejectsNonObjectCredentialsWithoutWriting(t *testing.T) {
	for _, credentials := range []string{"null", `[]`, `"secret"`, `false`, `0`} {
		t.Run(credentials, func(t *testing.T) {
			db := newIMManagementDB(t)
			svc := newIMManagementService(t, db, &types.CustomAgent{ID: "agent-1", TenantID: 42})
			h := NewIMHandler(svc)
			original := types.JSON(`{"bot_token":"keep-bot-token","post_to_main":true}`)
			stored := &im.IMChannel{
				ID:          "channel-1",
				TenantID:    42,
				AgentID:     "agent-1",
				Platform:    "wechat",
				Name:        "before",
				Enabled:     false,
				Mode:        "longpoll",
				OutputMode:  "full",
				SessionMode: "user",
				Credentials: original,
			}
			if err := db.Create(stored).Error; err != nil {
				t.Fatalf("create channel: %v", err)
			}

			body := fmt.Sprintf(`{"name":"must-not-persist","credentials":%s}`, credentials)
			w := serveIMManagementRequest(t, h, 42, http.MethodPut, "/im-channels/channel-1", body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body=%s", w.Code, w.Body.String())
			}

			fresh, err := svc.GetChannelByIDAndTenant("channel-1", 42)
			if err != nil {
				t.Fatalf("reload channel: %v", err)
			}
			if fresh.Name != "before" || string(fresh.Credentials) != string(original) {
				t.Fatalf(
					"invalid request changed stored channel: name=%q credentials=%s",
					fresh.Name,
					fresh.Credentials,
				)
			}
		})
	}
}

func TestToggleIMChannelDoesNotEchoStoredCredentials(t *testing.T) {
	db := newIMManagementDB(t)
	svc := newIMManagementService(t, db, &types.CustomAgent{ID: "agent-1", TenantID: 42})
	h := NewIMHandler(svc)
	stored := &im.IMChannel{
		ID:          "channel-1",
		TenantID:    42,
		AgentID:     "agent-1",
		Platform:    "feishu",
		Enabled:     true,
		Mode:        "websocket",
		OutputMode:  "stream",
		SessionMode: "user",
		Credentials: types.JSON(`{"app_secret":"top-secret"}`),
	}
	if err := db.Create(stored).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}

	w := serveIMManagementRequest(t, h, 42, http.MethodPost, "/im-channels/channel-1/toggle", `{}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	for _, forbidden := range []string{"top-secret", `"credentials":`, `"bot_identity":`} {
		if strings.Contains(w.Body.String(), forbidden) {
			t.Fatalf("toggle response leaked %q: %s", forbidden, w.Body.String())
		}
	}
}
