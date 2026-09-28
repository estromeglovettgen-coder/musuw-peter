package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

// wikiPermissionProbe is deliberately narrow: the runtime resolver should use
// the canonical tenant-keyed KB permission check and nothing else.
type wikiPermissionProbe struct {
	interfaces.KBShareService
	roles map[string]struct {
		role   types.OrgMemberRole
		shared bool
		err    error
	}
	calls []string
}

type wikiToolKnowledgeBaseLookup struct {
	interfaces.KnowledgeBaseService
	knowledgeBases map[string]*types.KnowledgeBase
}

func (l wikiToolKnowledgeBaseLookup) GetKnowledgeBaseByIDOnly(_ context.Context, id string) (*types.KnowledgeBase, error) {
	if kb := l.knowledgeBases[id]; kb != nil {
		return kb, nil
	}
	return &types.KnowledgeBase{
		ID:   id,
		Type: types.KnowledgeBaseTypeWiki,
		IndexingStrategy: types.IndexingStrategy{
			WikiEnabled: true,
		},
	}, nil
}

func (l wikiToolKnowledgeBaseLookup) GetKnowledgeBasesByIDsOnly(_ context.Context, ids []string) ([]*types.KnowledgeBase, error) {
	result := make([]*types.KnowledgeBase, 0, len(ids))
	for _, id := range ids {
		kb, _ := l.GetKnowledgeBaseByIDOnly(context.Background(), id)
		result = append(result, kb)
	}
	return result, nil
}

func (p *wikiPermissionProbe) CheckTenantKBPermission(
	_ context.Context,
	kbID string,
	_ uint64,
	_ types.TenantRole,
) (types.OrgMemberRole, bool, error) {
	p.calls = append(p.calls, kbID)
	result, ok := p.roles[kbID]
	if !ok {
		return "", false, nil
	}
	return result.role, result.shared, result.err
}

func TestResolveWritableWikiKBIDsUsesEffectiveTenantPermission(t *testing.T) {
	probe := &wikiPermissionProbe{roles: map[string]struct {
		role   types.OrgMemberRole
		shared bool
		err    error
	}{
		"shared-viewer": {role: types.OrgRoleViewer, shared: true},
		"shared-editor": {role: types.OrgRoleEditor, shared: true},
		"shared-admin":  {role: types.OrgRoleAdmin, shared: true},
		"lookup-error":  {shared: true, err: errors.New("share lookup unavailable")},
		"not-shared":    {shared: false},
	}}
	svc := &sessionService{
		kbShareService: probe,
		knowledgeBaseService: wikiToolKnowledgeBaseLookup{knowledgeBases: map[string]*types.KnowledgeBase{
			"own": {ID: "own", TenantID: 7, CreatorID: "caller-user"},
		}},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleContributor)
	ctx = context.WithValue(ctx, types.UserIDContextKey, "caller-user")

	got := svc.resolveWritableWikiKBIDsForCaller(ctx, types.SearchTargets{
		{KnowledgeBaseID: "own", TenantID: 7},
		{KnowledgeBaseID: "shared-viewer", TenantID: 42},
		{KnowledgeBaseID: "shared-editor", TenantID: 43},
		{KnowledgeBaseID: "shared-admin", TenantID: 44},
		{KnowledgeBaseID: "lookup-error", TenantID: 45},
		{KnowledgeBaseID: "not-shared", TenantID: 46},
		{KnowledgeBaseID: "unknown", TenantID: 47},
		{KnowledgeBaseID: "shared-editor", TenantID: 43},
	}, 7)

	require.Equal(t, []string{"own", "shared-editor", "shared-admin"}, got)
	require.ElementsMatch(t, []string{
		"shared-viewer", "shared-editor", "shared-admin", "lookup-error", "not-shared", "unknown",
	}, probe.calls)
}

func TestResolveWritableWikiKBIDsFallsBackToSessionTenant(t *testing.T) {
	probe := &wikiPermissionProbe{roles: map[string]struct {
		role   types.OrgMemberRole
		shared bool
		err    error
	}{"shared-editor": {role: types.OrgRoleEditor, shared: true}}}
	svc := &sessionService{
		kbShareService: probe,
		knowledgeBaseService: wikiToolKnowledgeBaseLookup{knowledgeBases: map[string]*types.KnowledgeBase{
			"own": {ID: "own", TenantID: 7, CreatorID: "caller-user"},
		}},
	}

	// Lightweight service tests do not always attach TenantIDContextKey; the
	// session tenant is still the caller's tenant for a local agent request.
	ctx := context.WithValue(context.Background(), types.TenantRoleContextKey, types.TenantRoleContributor)
	ctx = context.WithValue(ctx, types.UserIDContextKey, "caller-user")
	got := svc.resolveWritableWikiKBIDsForCaller(ctx, types.SearchTargets{
		{KnowledgeBaseID: "own", TenantID: 7},
		{KnowledgeBaseID: "shared-editor", TenantID: 42},
	}, 7)

	require.Equal(t, []string{"own", "shared-editor"}, got)
}

func TestResolveWritableWikiKBIDsHonorsOwnTenantRoleAndCreator(t *testing.T) {
	lookup := wikiToolKnowledgeBaseLookup{knowledgeBases: map[string]*types.KnowledgeBase{
		"mine":  {ID: "mine", TenantID: 7, CreatorID: "caller-user"},
		"other": {ID: "other", TenantID: 7, CreatorID: "other-user"},
	}}
	targets := types.SearchTargets{
		{KnowledgeBaseID: "mine", TenantID: 7},
		{KnowledgeBaseID: "other", TenantID: 7},
	}
	svc := &sessionService{knowledgeBaseService: lookup}

	tests := []struct {
		name string
		role types.TenantRole
		want []string
	}{
		{name: "viewer stays read-only", role: types.TenantRoleViewer},
		{name: "contributor writes only owned KB", role: types.TenantRoleContributor, want: []string{"mine"}},
		{name: "admin writes tenant KBs", role: types.TenantRoleAdmin, want: []string{"mine", "other"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.WithValue(context.Background(), types.TenantRoleContextKey, tt.role)
			ctx = context.WithValue(ctx, types.UserIDContextKey, "caller-user")
			got := svc.resolveWritableWikiKBIDsForCaller(ctx, targets, 7)
			require.ElementsMatch(t, tt.want, got)
		})
	}
}

func TestBuildAgentConfigUsesSessionTenantForWikiWrites(t *testing.T) {
	probe := &wikiPermissionProbe{roles: map[string]struct {
		role   types.OrgMemberRole
		shared bool
		err    error
	}{
		"shared-viewer": {role: types.OrgRoleViewer, shared: true},
	}}
	svc := &sessionService{
		cfg:                   &config.Config{},
		knowledgeBaseService:  wikiToolKnowledgeBaseLookup{},
		webSearchProviderRepo: &sharedAgentWebSearchRepo{},
		kbShareService:        probe,
	}

	// Shared-agent setup overlays TenantIDContextKey with the source tenant so
	// model/KB resolution runs in that workspace. The session remains owned by
	// the caller tenant and must be the identity used for mutation scope.
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(42))
	ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleContributor)
	req := &types.QARequest{
		Session: &types.Session{ID: "session-1", TenantID: 7},
		CustomAgent: &types.CustomAgent{
			TenantID: 42,
			Config: types.CustomAgentConfig{
				KBSelectionMode: "selected",
				KnowledgeBases:  []string{"shared-viewer"},
			},
		},
	}

	got, err := svc.buildAgentConfig(ctx, req, &types.Tenant{ID: 42}, 42)
	require.NoError(t, err)
	require.Empty(t, got.WritableWikiKBIDs,
		"a shared viewer must not inherit the source tenant from TenantIDContextKey")
	require.Equal(t, []string{"shared-viewer"}, probe.calls)
}

func TestRegisterToolsDoesNotExposeWikiMutationsForReadOnlyKBs(t *testing.T) {
	registry := tools.NewToolRegistry()
	svc := &agentService{knowledgeBaseService: wikiToolKnowledgeBaseLookup{}}
	config := &types.AgentConfig{
		AllowedTools: []string{
			tools.ToolWikiReadPage,
			tools.ToolWikiSearch,
			tools.ToolWikiReadIssue,
			tools.ToolWikiFlagIssue,
			tools.ToolWikiUpdateIssue,
			tools.ToolWikiWritePage,
			tools.ToolWikiReplaceText,
			tools.ToolWikiRenamePage,
			tools.ToolWikiDeletePage,
		},
		SearchTargets: types.SearchTargets{{
			Type:            types.SearchTargetTypeKnowledgeBase,
			KnowledgeBaseID: "wiki-viewer",
			TenantID:        42,
		}},
	}

	// This test is intentionally red until registerTools applies the runtime
	// writable-KB scope to every Wiki mutation constructor.
	require.NoError(t, svc.registerTools(context.Background(), registry, config, nil, nil, "session-1"))
	_, err := registry.GetTool(tools.ToolWikiReadPage)
	require.NoError(t, err)
	_, err = registry.GetTool(tools.ToolWikiSearch)
	require.NoError(t, err)
	_, err = registry.GetTool(tools.ToolWikiReadIssue)
	require.NoError(t, err)
	for _, name := range []string{
		tools.ToolWikiFlagIssue,
		tools.ToolWikiUpdateIssue,
		tools.ToolWikiWritePage,
		tools.ToolWikiReplaceText,
		tools.ToolWikiRenamePage,
		tools.ToolWikiDeletePage,
	} {
		_, err := registry.GetTool(name)
		require.Error(t, err, "read-only Wiki KB must not expose %s", name)
	}
}
