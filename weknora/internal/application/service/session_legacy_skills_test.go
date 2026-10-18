package service

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Tencent/WeKnora/internal/agent"
	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"testing"
)

type legacySkillProbeModel struct {
	fakeAgentChatModel
	systemPrompt string
}

func (m *legacySkillProbeModel) ChatStream(ctx context.Context, messages []chat.Message, opts *chat.ChatOptions) (<-chan types.StreamResponse, error) {
	for _, msg := range messages {
		if msg.Role == "system" {
			m.systemPrompt = msg.Content
		}
	}
	return m.fakeAgentChatModel.ChatStream(ctx, messages, opts)
}

type legacySkillExecutionManager struct {
	capableManager
	execution *sandbox.ExecuteConfig
}

func (m *legacySkillExecutionManager) Execute(_ context.Context, cfg *sandbox.ExecuteConfig) (*sandbox.ExecuteResult, error) {
	m.execution = cfg
	return &sandbox.ExecuteResult{ExitCode: 0, Stdout: "public skill executed"}, nil
}
func legacySkillQARequest(configID, mode string) *types.QARequest {
	return &types.QARequest{Session: &types.Session{ID: "s-1", TenantID: 7}, CustomAgent: &types.CustomAgent{TenantID: 7, Config: types.CustomAgentConfig{MaxIterations: 5, SandboxConfigID: configID, SkillsSelectionMode: mode, KBSelectionMode: "none", SystemPrompt: "I am Taylor. Use the available skills when relevant.", AllowedTools: []string{tools.ToolReadSkill, tools.ToolExecuteSkillScript}}}}
}

// Exercise the production QA -> engine seam, including actual native skill
// tools. Only the external model and sandbox execution are offline doubles.
func TestLegacyDockerQAOffersAndInvokesPreloadedSkills(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "public-fixture")
	require.NoError(t, os.MkdirAll(filepath.Join(skillDir, "scripts"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte("---\nname: public-fixture\ndescription: Public fixture skill\n---\nRead this public fixture before executing scripts/example.py.\n"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(skillDir, "scripts/example.py"), []byte("print('public skill executed')\n"), 0o644))
	t.Setenv("WEKNORA_SKILLS_DIR", dir)
	ctx := types.WithSessionID(context.WithValue(t.Context(), types.TenantIDContextKey, uint64(7)), "s-1")
	backend := &legacySkillExecutionManager{capableManager: capableManager{typ: sandbox.SandboxTypeDocker, files: stubSessionFileStore{}}}
	svc := &sessionService{cfg: &config.Config{}, sandboxMgr: backend, webSearchProviderRepo: &sharedAgentWebSearchRepo{}}
	cfg, err := svc.buildAgentConfig(ctx, legacySkillQARequest(types.SandboxConfigIDGlobalDefault, "all"), &types.Tenant{ID: 7}, 7)
	require.NoError(t, err)
	model := &legacySkillProbeModel{}
	agentSvc := &agentService{sandboxMgr: backend}
	built, err := agentSvc.CreateAgentEngine(ctx, cfg, model, nil, nil, "s-1", "msg-1")
	require.NoError(t, err)
	_, err = built.Execute(ctx, "s-1", "msg-1", "有哪些技能？读一个说明。", nil)
	require.NoError(t, err)
	require.Contains(t, model.lastToolNames, tools.ToolReadSkill, "global Docker must offer the tools its native skill catalog advertises")
	require.Contains(t, model.lastToolNames, tools.ToolExecuteSkillScript)
	require.Contains(t, model.systemPrompt, "public-fixture")
	manager := built.(*agent.AgentEngine).GetSkillsManager()
	require.NotNil(t, manager)
	read, err := tools.NewReadSkillTool(manager).Execute(ctx, json.RawMessage(`{"skill_name":"public-fixture"}`))
	require.NoError(t, err)
	require.True(t, read.Success, read.Error)
	require.Contains(t, read.Output, "Read this public fixture")
	require.Contains(t, read.Output, "scripts/example.py")
	executed, err := tools.NewExecuteSkillScriptTool(manager).Execute(ctx, json.RawMessage(`{"skill_name":"public-fixture","script_path":"scripts/example.py"}`))
	require.NoError(t, err)
	require.True(t, executed.Success, executed.Error)
	require.NotNil(t, backend.execution)
	require.Equal(t, filepath.Join(skillDir, "scripts/example.py"), backend.execution.Script)
	require.Equal(t, "s-1", backend.execution.SessionID)
	require.Nil(t, cfg.TenantSkills, "public compatibility skills must not be copied into private tenant records")
}

func TestLegacySkillCatalogNeverFallsBackAcrossNamedOrUnavailableSandboxes(t *testing.T) {
	t.Setenv("WEKNORA_SKILLS_DIR", t.TempDir())
	for _, tc := range []struct {
		name, agentConfig, pin, mode, edition  string
		backend                                sandbox.SandboxType
		missingBackend, brokenPin, wantCatalog bool
	}{
		{name: "named config keeps private source", agentConfig: "cfg-private", mode: "all", backend: sandbox.SandboxTypeDocker},
		{name: "existing named pin wins over global agent", agentConfig: "-", pin: "cfg-private", mode: "all", backend: sandbox.SandboxTypeDocker},
		{name: "existing global pin wins over changed agent", agentConfig: "cfg-private", pin: "-", mode: "all", backend: sandbox.SandboxTypeDocker, wantCatalog: true},
		{name: "disabled global backend", agentConfig: "-", mode: "all", backend: sandbox.SandboxTypeDisabled},
		{name: "missing global backend", agentConfig: "-", mode: "all", missingBackend: true},
		{name: "non-Docker global backend", agentConfig: "-", mode: "all", backend: sandbox.SandboxTypeCube},
		{name: "unreadable pin fails closed", agentConfig: "-", mode: "all", backend: sandbox.SandboxTypeDocker, brokenPin: true},
		{name: "skills disabled", agentConfig: "-", mode: "none", backend: sandbox.SandboxTypeDocker},
		{name: "lite edition", agentConfig: "-", mode: "all", backend: sandbox.SandboxTypeDocker, edition: "lite"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			edition := tc.edition
			if edition == "" {
				edition = "standard"
			}
			t.Setenv("MUSUW_PRODUCT_EDITION", edition)
			svc := &sessionService{cfg: &config.Config{}, webSearchProviderRepo: &sharedAgentWebSearchRepo{}}
			if !tc.missingBackend {
				svc.sandboxMgr = &capableManager{typ: tc.backend}
			}
			if tc.pin != "" || tc.brokenPin {
				db := newPinTestDB(t)
				svc.sandboxPinner = NewSessionSandboxPinner(db)
				if tc.pin != "" {
					_, err := svc.sandboxPinner.Pin(t.Context(), "s-1", tc.pin)
					require.NoError(t, err)
				}
				if tc.brokenPin {
					sqlDB, err := db.DB()
					require.NoError(t, err)
					require.NoError(t, sqlDB.Close())
				}
			}
			ctx := context.WithValue(t.Context(), types.TenantIDContextKey, uint64(7))
			cfg, err := svc.buildAgentConfig(ctx, legacySkillQARequest(tc.agentConfig, tc.mode), &types.Tenant{ID: 7}, 7)
			require.NoError(t, err)
			require.Equal(t, tc.wantCatalog, len(cfg.SkillDirs) > 0)
		})
	}
}

func TestFireUserSandboxPausePreservesConfigAndAdministratorCapabilities(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	t.Setenv("FIRE_USER_EXECUTION_PAUSED", "true")
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	t.Setenv("WEKNORA_SKILLS_DIR", t.TempDir())
	for _, admin := range []bool{false, true} {
		t.Run(fmt.Sprint(admin), func(t *testing.T) {
			ctx := types.WithSessionID(context.WithValue(context.WithValue(t.Context(), types.TenantIDContextKey, uint64(7)), types.SystemAdminContextKey, admin), "s-1")
			backend := &legacySkillExecutionManager{capableManager: capableManager{typ: sandbox.SandboxTypeDocker, files: stubSessionFileStore{}}}
			req := legacySkillQARequest("-", "all")
			req.CustomAgent.Config.AllowedTools = []string{tools.ToolThinking, tools.ToolReadSkill, tools.ToolExecuteSkillScript, tools.ToolShellExec}
			original := req.CustomAgent.Config
			svc := &sessionService{cfg: &config.Config{}, sandboxMgr: backend, webSearchProviderRepo: &sharedAgentWebSearchRepo{}}
			cfg, err := svc.buildAgentConfig(ctx, req, &types.Tenant{ID: 7}, 7)
			require.NoError(t, err)
			require.Equal(t, admin, cfg.SkillsEnabled)
			model := &legacySkillProbeModel{}
			built, err := (&agentService{sandboxMgr: backend}).CreateAgentEngine(ctx, cfg, model, nil, nil, "s-1", "m-1")
			require.NoError(t, err)
			_, err = built.Execute(ctx, "s-1", "m-1", "你好", nil)
			require.NoError(t, err)
			require.Contains(t, model.lastToolNames, tools.ToolThinking)
			for _, name := range []string{tools.ToolListSandboxFiles, tools.ToolReadSandboxFile, tools.ToolWriteSandboxFile, tools.ToolEditSandboxFile} {
				if admin {
					require.Contains(t, model.lastToolNames, name)
				} else {
					require.NotContains(t, model.lastToolNames, name)
				}
			}
			if !admin {
				require.NotContains(t, model.lastToolNames, tools.ToolShellExec)
				require.Empty(t, cfg.SkillDirs)
				require.Empty(t, cfg.TenantSkills)
				require.NotContains(t, model.lastToolNames, tools.ToolReadSkill)
				require.NotContains(t, model.lastToolNames, tools.ToolExecuteSkillScript)
			}
			require.Equal(t, original, req.CustomAgent.Config, "runtime pause must never erase saved settings")
		})
	}
}
