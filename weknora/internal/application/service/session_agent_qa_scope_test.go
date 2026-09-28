package service

import (
	"context"
	"testing"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolvePerRequestMCPScope_SelectedIntersection(t *testing.T) {
	effective, mode := resolvePerRequestMCPScope(
		[]string{"mcp-b", "mcp-c"},
		[]string{"mcp-a", "mcp-b"},
		"selected",
		false,
	)
	assert.Equal(t, "selected", mode)
	assert.Equal(t, []string{"mcp-b"}, effective)
}

func TestResolvePerRequestMCPScope_SelectedRejectsOutsidePreset(t *testing.T) {
	effective, mode := resolvePerRequestMCPScope(
		[]string{"mcp-x"},
		[]string{"mcp-a"},
		"selected",
		false,
	)
	assert.Empty(t, effective)
	assert.Equal(t, "selected", mode)
}

func TestResolvePerRequestMCPScope_NoneRejectsMention(t *testing.T) {
	effective, mode := resolvePerRequestMCPScope(
		[]string{"mcp-iwiki"},
		nil,
		"none",
		false,
	)
	assert.Empty(t, effective)
	assert.Equal(t, "none", mode)
}

func TestResolvePerRequestMCPScope_SharedAgentBlocksOutsidePreset(t *testing.T) {
	effective, mode := resolvePerRequestMCPScope(
		[]string{"mcp-x"},
		[]string{"mcp-a"},
		"all",
		true,
	)
	assert.Empty(t, effective)
	assert.Equal(t, "all", mode)
}

func TestResolvePerRequestMCPScope_SharedAgentAllowsPreset(t *testing.T) {
	effective, mode := resolvePerRequestMCPScope(
		[]string{"mcp-a", "mcp-x"},
		[]string{"mcp-a", "mcp-b"},
		"all",
		true,
	)
	assert.Equal(t, "selected", mode)
	assert.Equal(t, []string{"mcp-a"}, effective)
}

func TestApplyPerRequestMCPScope_SelectedNarrowsAndPins(t *testing.T) {
	cfg := &types.AgentConfig{MCPSelectionMode: "selected", MCPServices: []string{"mcp-a", "mcp-b"}}
	applyPerRequestMCPScope(context.Background(), cfg, []string{"mcp-a", "mcp-b"}, false, []string{"mcp-b"})
	assert.Equal(t, "selected", cfg.MCPSelectionMode)
	assert.Equal(t, []string{"mcp-b"}, cfg.MCPServices)
	assert.Equal(t, []string{"mcp-b"}, cfg.PinnedMCPServiceIDs)
}

func TestApplyPerRequestMCPScope_NoneIgnoresMentionAndDoesNotPin(t *testing.T) {
	cfg := &types.AgentConfig{MCPSelectionMode: "none", MCPServices: []string{"mcp-a"}}
	applyPerRequestMCPScope(context.Background(), cfg, []string{"mcp-a"}, false, []string{"mcp-a"})
	assert.Equal(t, "none", cfg.MCPSelectionMode)
	assert.Empty(t, cfg.PinnedMCPServiceIDs)
}

func TestApplyPerRequestSkillScope_SelectedEmptyIntersectionDisables(t *testing.T) {
	cfg := &types.AgentConfig{SkillsEnabled: true, AllowedSkills: []string{"a", "b"}}
	applyPerRequestSkillScope(context.Background(), cfg, "selected", []string{"c"})
	assert.False(t, cfg.SkillsEnabled)
	assert.Empty(t, cfg.PinnedSkillNames)
}

func TestApplyPerRequestSkillScope_AllPinsMentioned(t *testing.T) {
	cfg := &types.AgentConfig{SkillsEnabled: true}
	applyPerRequestSkillScope(context.Background(), cfg, "all", []string{"analysis", "analysis"})
	assert.True(t, cfg.SkillsEnabled)
	assert.Equal(t, []string{"analysis"}, cfg.AllowedSkills)
	assert.Equal(t, []string{"analysis"}, cfg.PinnedSkillNames)
}

func TestApplyPerRequestSkillScope_NoneIgnores(t *testing.T) {
	cfg := &types.AgentConfig{SkillsEnabled: true, AllowedSkills: []string{"a"}}
	applyPerRequestSkillScope(context.Background(), cfg, "none", []string{"a"})
	assert.Empty(t, cfg.PinnedSkillNames)
}

func TestConfigureSkillsFromAgentDoesNotLoadHostPreloadedDir(t *testing.T) {
	svc := &sessionService{}
	cfg := &types.AgentConfig{}
	svc.configureSkillsFromAgent(context.Background(), cfg, &types.CustomAgent{
		Config: types.CustomAgentConfig{
			SandboxConfigID:     "cfg-1",
			SkillsSelectionMode: "all",
		},
	})
	assert.True(t, cfg.SkillsEnabled)
	assert.Equal(t, "cfg-1", cfg.SandboxConfigID)
	assert.Empty(t, cfg.SkillDirs,
		"the host skills/preloaded tree is not what the sandbox image carries")
}

func TestLiteConfigureSkillsFromAgentScrubsExecutableRuntimeFields(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	svc := &sessionService{}
	cfg := &types.AgentConfig{
		SkillsEnabled:    true,
		SkillDirs:        []string{"/opt/skills"},
		AllowedSkills:    []string{"analysis"},
		SandboxConfigID:  "cfg-1",
		TenantSkills:     []*types.TenantSkillEntity{{Name: "analysis"}},
		PinnedSkillNames: []string{"analysis"},
	}
	svc.configureSkillsFromAgent(context.Background(), cfg, &types.CustomAgent{
		Config: types.CustomAgentConfig{
			SandboxConfigID:     "cfg-1",
			SkillsSelectionMode: "all",
			SelectedSkills:      []string{"analysis"},
		},
	})
	assert.False(t, cfg.SkillsEnabled)
	assert.Empty(t, cfg.SkillDirs)
	assert.Empty(t, cfg.AllowedSkills)
	assert.Empty(t, cfg.SandboxConfigID)
	assert.Empty(t, cfg.TenantSkills)
	assert.Empty(t, cfg.PinnedSkillNames)
}

func TestLiteRetrievalUsesSessionTenantForForeignAgent(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	svc := &sessionService{}
	req := &types.QARequest{
		Session:     &types.Session{TenantID: 7},
		CustomAgent: &types.CustomAgent{TenantID: 42},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))

	got := svc.resolveRetrievalTenantID(ctx, req)

	assert.Equal(t, uint64(7), got,
		"Lite must never adopt a foreign shared-agent tenant for retrieval")
}

func TestLiteQARejectsForeignAgentBeforeDependencies(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	req := &types.QARequest{
		Session:     &types.Session{ID: "session-1", TenantID: 7},
		CustomAgent: &types.CustomAgent{ID: "shared-agent", TenantID: 42},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))
	svc := &sessionService{}

	// A zero-dependency service is intentional: both public QA entry points
	// must reject the foreign agent before touching model, KB, tool, or tenant
	// services (and before consuming the source-tenant context overlay).
	for _, tc := range []struct {
		name string
		call func() error
	}{
		{name: "knowledge", call: func() error {
			return svc.KnowledgeQA(ctx, req, event.NewEventBus())
		}},
		{name: "agent", call: func() error {
			return svc.AgentQA(ctx, req, event.NewEventBus())
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got error
			require.NotPanics(t, func() { got = tc.call() })
			appErr, ok := got.(*apperrors.AppError)
			require.True(t, ok, "foreign Lite agent must fail with a typed not-found error, got %T", got)
			require.Equal(t, apperrors.ErrNotFound, appErr.Code)
		})
	}
}

func TestLiteQARejectsForeignAgentWhenSessionTenantIsMissing(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	req := &types.QARequest{
		Session:     &types.Session{ID: "session-legacy", TenantID: 0},
		CustomAgent: &types.CustomAgent{ID: "shared-agent", TenantID: 42},
	}

	err := rejectLiteForeignAgent(context.Background(), req)
	appErr, ok := err.(*apperrors.AppError)
	require.True(t, ok, "foreign agent with zero session tenant must fail closed, got %T", err)
	require.Equal(t, apperrors.ErrNotFound, appErr.Code)
}

func TestLiteQARejectsStaleTenantOverlayForLocalAgent(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	req := &types.QARequest{
		Session:     &types.Session{ID: "session-1", TenantID: 7},
		CustomAgent: &types.CustomAgent{ID: "local-agent", TenantID: 7},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))
	svc := &sessionService{}

	for _, call := range []func() error{
		func() error { return svc.KnowledgeQA(ctx, req, event.NewEventBus()) },
		func() error { return svc.AgentQA(ctx, req, event.NewEventBus()) },
	} {
		var err error
		require.NotPanics(t, func() { err = call() })
		appErr, ok := err.(*apperrors.AppError)
		require.True(t, ok, "stale Lite tenant overlay must fail with typed not-found, got %T", err)
		require.Equal(t, apperrors.ErrNotFound, appErr.Code)
	}
}

func TestLiteQARejectsStaleTenantOverlayWithoutCustomAgent(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	req := &types.QARequest{
		Session: &types.Session{ID: "session-1", TenantID: 7},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))
	svc := &sessionService{}

	for _, call := range []func() error{
		func() error { return svc.KnowledgeQA(ctx, req, event.NewEventBus()) },
		func() error { return svc.AgentQA(ctx, req, event.NewEventBus()) },
	} {
		var err error
		require.NotPanics(t, func() { err = call() })
		appErr, ok := err.(*apperrors.AppError)
		require.True(t, ok, "stale Lite tenant overlay must fail even without an agent, got %T", err)
		require.Equal(t, apperrors.ErrNotFound, appErr.Code)
	}
}
