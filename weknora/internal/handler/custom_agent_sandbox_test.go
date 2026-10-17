package handler

import (
	"bytes"
	"context"
	"encoding/json"
	stderrors "errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
)

// stubSandboxConfigLookup answers the existence check without a database.
type stubSandboxConfigLookup struct {
	entity *types.TenantSandboxConfigEntity
	err    error

	lookups []string
}

func (s *stubSandboxConfigLookup) Get(
	_ context.Context, _ uint64, id string,
) (*types.TenantSandboxConfigEntity, error) {
	s.lookups = append(s.lookups, id)
	return s.entity, s.err
}

func agentTenantContext() context.Context {
	return context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
}

// The field must round-trip through the agent's JSON config column, since that
// is where it is persisted (no dedicated column).
func TestAgentConfigCarriesSandboxConfigID(t *testing.T) {
	cfg := types.CustomAgentConfig{
		AgentMode:       "smart-reasoning",
		SandboxConfigID: "cfg-a",
	}

	raw, err := json.Marshal(cfg)
	require.NoError(t, err)
	require.Contains(t, string(raw), `"sandbox_config_id":"cfg-a"`)

	var back types.CustomAgentConfig
	require.NoError(t, json.Unmarshal(raw, &back))
	require.Equal(t, "cfg-a", back.SandboxConfigID)
}

// Empty must be omitted so existing agents keep an unchanged config payload.
func TestAgentConfigOmitsEmptySandboxConfigID(t *testing.T) {
	raw, err := json.Marshal(types.CustomAgentConfig{AgentMode: "quick-answer"})
	require.NoError(t, err)
	require.NotContains(t, string(raw), "sandbox_config_id")
}

// Saving a dangling reference must fail here with a readable message. Deferring
// it means the agent looks fine until its first skill execution, which then dies
// on an opaque resolver error mid-conversation.
func TestAgentSandboxConfigValidationRejectsUnknownID(t *testing.T) {
	lookup := &stubSandboxConfigLookup{}
	h := &CustomAgentHandler{sandboxConfigs: lookup}

	err := h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: "cfg-gone"})

	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, http.StatusBadRequest, appErr.HTTPCode)
	require.Equal(t, []string{"cfg-gone"}, lookup.lookups)
}

func TestAgentSandboxConfigValidationAcceptsExistingID(t *testing.T) {
	lookup := &stubSandboxConfigLookup{
		entity: &types.TenantSandboxConfigEntity{ID: "cfg-a", TenantID: 7},
	}
	h := &CustomAgentHandler{sandboxConfigs: lookup}

	require.NoError(t, h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: "cfg-a"}))
}

// Most agents run on the deployment default, so the common path must not pay for
// a lookup - and must never be rejected for leaving the field blank.
func TestAgentSandboxConfigValidationSkipsEmptyID(t *testing.T) {
	lookup := &stubSandboxConfigLookup{}
	h := &CustomAgentHandler{sandboxConfigs: lookup}

	require.NoError(t, h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: "   "}))
	require.Empty(t, lookup.lookups)
}

// A lookup failure is not the admin's fault; it must not read as "you picked a
// config that does not exist".
func TestAgentSandboxConfigValidationSurfacesLookupFailure(t *testing.T) {
	lookup := &stubSandboxConfigLookup{err: stderrors.New("database is on fire")}
	h := &CustomAgentHandler{sandboxConfigs: lookup}

	err := h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: "cfg-a"})

	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, http.StatusInternalServerError, appErr.HTTPCode)
}

// Partially-wired handlers appear in tests and in deployments without the
// config service; they must not reject every agent that selects a backend.
func TestAgentSandboxConfigValidationSkipsWhenServiceMissing(t *testing.T) {
	h := &CustomAgentHandler{}

	require.NoError(t, h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: "cfg-a"}))
}

func TestAgentSandboxGlobalDefaultDoesNotLookUpNamedCredentials(t *testing.T) {
	lookup := &stubSandboxConfigLookup{}
	h := &CustomAgentHandler{sandboxConfigs: lookup}
	require.NoError(t, h.validateAgentSandboxConfig(agentTenantContext(),
		types.CustomAgentConfig{SandboxConfigID: types.SandboxConfigIDGlobalDefault}))
	require.Empty(t, lookup.lookups, "the native global sentinel is not a credential-bearing named config")
}

// This uses the real handler, native agent service/repository and scoped
// sandbox repository. A copied Fire agent must remain editable without dropping
// its native sandbox/skills configuration; foreign named credentials stay hidden.
func TestFireTaylorNativeCopyCanUpdateWithGlobalSandboxAndSkills(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service.SetProductEdition("standard")
	t.Cleanup(func() { service.SetProductEdition("standard") })
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:fire-agent-copy-%d?mode=memory&cache=shared", time.Now().UnixNano())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&types.CustomAgent{}, &types.TenantSandboxConfigEntity{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	agents := repository.NewCustomAgentRepository(db)
	sandboxes := repository.NewTenantSandboxConfigRepository(db)
	source := &types.CustomAgent{ID: types.FireDefaultAgentID, TenantID: 7, Name: "泰勒", Config: types.CustomAgentConfig{
		AgentMode: "smart-reasoning", ModelID: "deepseek-flash", KBSelectionMode: "none",
		SandboxConfigID: types.SandboxConfigIDGlobalDefault, SkillsSelectionMode: "all",
		AllowedTools: []string{"read_file", "write_file", "execute_script"},
	}}
	source.EnsureDefaults()
	require.NoError(t, agents.CreateAgent(context.Background(), source))
	require.NoError(t, sandboxes.Create(context.Background(), &types.TenantSandboxConfigEntity{ID: "foreign-named", TenantID: 8, Name: "private", SandboxType: "docker"}))
	h := &CustomAgentHandler{
		service:        service.NewCustomAgentService(agents, nil, nil, nil, nil, nil, nil),
		sandboxConfigs: service.NewTenantSandboxConfigService(sandboxes, agents, nil, nil, nil),
	}
	router := gin.New()
	router.Use(middleware.ErrorHandler(), func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, uint64(7))
		ctx = context.WithValue(ctx, types.UserIDContextKey, "ordinary-user")
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleOwner)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	router.POST("/agents/:id/copy", h.CopyAgent)
	router.PUT("/agents/:id", h.UpdateAgent)
	send := func(method, path string, body any) *httptest.ResponseRecorder {
		t.Helper()
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	copyResponse := send(http.MethodPost, "/agents/fire-taylor/copy", map[string]any{})
	require.Equal(t, http.StatusCreated, copyResponse.Code, copyResponse.Body.String())
	var copied struct {
		Data types.CustomAgent `json:"data"`
	}
	require.NoError(t, json.Unmarshal(copyResponse.Body.Bytes(), &copied))
	require.NotEqual(t, source.ID, copied.Data.ID)
	require.Equal(t, types.SandboxConfigIDGlobalDefault, copied.Data.Config.SandboxConfigID)
	updated := send(http.MethodPut, "/agents/"+copied.Data.ID, UpdateAgentRequest{Name: "我的沟通助手", Config: copied.Data.Config})
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())
	saved, err := agents.GetAgentByID(context.Background(), copied.Data.ID, 7)
	require.NoError(t, err)
	require.Equal(t, "我的沟通助手", saved.Name)
	require.Equal(t, types.SandboxConfigIDGlobalDefault, saved.Config.SandboxConfigID)
	require.Equal(t, "all", saved.Config.SkillsSelectionMode)
	require.Equal(t, source.Config.AllowedTools, saved.Config.AllowedTools)
	protected := send(http.MethodPut, "/agents/fire-taylor", UpdateAgentRequest{Name: source.Name, Config: source.Config})
	require.Equal(t, http.StatusForbidden, protected.Code, protected.Body.String())
	require.Contains(t, protected.Body.String(), "Cannot modify built-in agent")
	for _, configID := range []string{"foreign-named", "missing-named"} {
		cfg := saved.Config
		cfg.SandboxConfigID = configID
		denied := send(http.MethodPut, "/agents/"+copied.Data.ID, UpdateAgentRequest{Name: "must not save", Config: cfg})
		// Native save validation intentionally makes missing and foreign IDs
		// indistinguishable. Neither can reach the repository update.
		require.Equal(t, http.StatusBadRequest, denied.Code, denied.Body.String())
		require.Contains(t, denied.Body.String(), "所选沙箱后端配置不存在")
		after, err := agents.GetAgentByID(context.Background(), copied.Data.ID, 7)
		require.NoError(t, err)
		require.Equal(t, saved, after)
	}
}
