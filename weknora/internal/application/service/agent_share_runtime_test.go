package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type sharedAgentWebSearchRepo struct {
	byIDTenant      uint64
	byID            string
	defaultTenant   uint64
	explicit        *types.WebSearchProviderEntity
	defaultProvider *types.WebSearchProviderEntity
}

func (r *sharedAgentWebSearchRepo) Create(context.Context, *types.WebSearchProviderEntity) error {
	return nil
}

func (r *sharedAgentWebSearchRepo) GetByID(_ context.Context, tenantID uint64, id string) (*types.WebSearchProviderEntity, error) {
	r.byIDTenant = tenantID
	r.byID = id
	return r.explicit, nil
}

func (r *sharedAgentWebSearchRepo) GetDefault(_ context.Context, tenantID uint64) (*types.WebSearchProviderEntity, error) {
	r.defaultTenant = tenantID
	return r.defaultProvider, nil
}

func (r *sharedAgentWebSearchRepo) List(context.Context, uint64) ([]*types.WebSearchProviderEntity, error) {
	return nil, nil
}

func (r *sharedAgentWebSearchRepo) Update(context.Context, *types.WebSearchProviderEntity) error {
	return nil
}

func (r *sharedAgentWebSearchRepo) Delete(context.Context, uint64, string) error { return nil }

func (r *sharedAgentWebSearchRepo) ClearDefault(context.Context, uint64, string) error { return nil }

func TestSharedAgentWebSearchReadyUsesSourceWorkspace(t *testing.T) {
	repo := &sharedAgentWebSearchRepo{
		explicit: &types.WebSearchProviderEntity{ID: "source-provider", TenantID: 42},
	}
	svc := &agentShareService{webSearchProviderRepo: repo}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{
		WebSearchEnabled:    true,
		WebSearchProviderID: "source-provider",
	}}

	require.True(t, svc.isAgentWebSearchReady(context.Background(), agent, 42))
	require.Equal(t, uint64(42), repo.byIDTenant)
	require.Equal(t, "source-provider", repo.byID)
}

func TestSharedAgentWebSearchReadyUsesSourceDefault(t *testing.T) {
	repo := &sharedAgentWebSearchRepo{
		defaultProvider: &types.WebSearchProviderEntity{ID: "source-default", TenantID: 42, IsDefault: true},
	}
	svc := &agentShareService{webSearchProviderRepo: repo}
	agent := &types.CustomAgent{Config: types.CustomAgentConfig{WebSearchEnabled: true}}

	require.True(t, svc.isAgentWebSearchReady(context.Background(), agent, 42))
	require.Equal(t, uint64(42), repo.defaultTenant)
}

func TestFilterSharedAgentWriteTools(t *testing.T) {
	got := filterSharedAgentWriteTools([]string{
		tools.ToolWikiReadPage,
		tools.ToolWikiFlagIssue,
		tools.ToolWikiWritePage,
		tools.ToolWikiReplaceText,
		tools.ToolWikiRenamePage,
		tools.ToolWikiDeletePage,
		tools.ToolWikiReadIssue,
		tools.ToolWikiUpdateIssue,
		tools.ToolWebSearch,
	})

	require.Equal(t, []string{
		tools.ToolWikiReadPage,
		tools.ToolWikiReadIssue,
		tools.ToolWebSearch,
	}, got)
}

func TestFilterSharedAgentWriteToolsCoversAllWikiMutations(t *testing.T) {
	readOnlyWikiTools := map[string]bool{
		tools.ToolWikiReadPage:      true,
		tools.ToolWikiSearch:        true,
		tools.ToolWikiReadSourceDoc: true,
		tools.ToolWikiReadIssue:     true,
	}

	for _, definition := range tools.AvailableToolDefinitions() {
		if !strings.HasPrefix(definition.Name, "wiki_") {
			continue
		}
		filtered := filterSharedAgentWriteTools([]string{definition.Name})
		if readOnlyWikiTools[definition.Name] {
			require.Equal(t, []string{definition.Name}, filtered, "read-only wiki tool %q should remain available", definition.Name)
			continue
		}
		require.Empty(t, filtered, "wiki mutation tool %q must be filtered for shared agents", definition.Name)
	}
}

func TestFilterUserVisibleAgentSharesHidesSpecialistBuiltins(t *testing.T) {
	shares := []*types.AgentShare{
		{AgentID: types.BuiltinQuickAnswerID},
		{AgentID: types.BuiltinDataAnalystID},
		{AgentID: types.BuiltinWikiResearcherID},
		{AgentID: "tenant-agent"},
		nil,
	}

	visible := filterUserVisibleAgentShares(shares)
	require.Len(t, visible, 2)
	require.Equal(t, types.BuiltinQuickAnswerID, visible[0].AgentID)
	require.Equal(t, "tenant-agent", visible[1].AgentID)
}

func TestUserVisibleAgentShareHidesWhenEitherJoinedIDIsSpecialist(t *testing.T) {
	share := &types.AgentShare{
		AgentID: types.BuiltinQuickAnswerID,
		Agent:   &types.CustomAgent{ID: types.BuiltinDataAnalystID},
	}
	require.False(t, userVisibleAgentShare(share),
		"a joined specialist row must remain hidden even if the share ID is stale")

	share = &types.AgentShare{
		AgentID: types.BuiltinDataAnalystID,
		Agent:   &types.CustomAgent{ID: types.BuiltinQuickAnswerID},
	}
	require.False(t, userVisibleAgentShare(share),
		"a specialist share ID must remain hidden even if the join is stale")
}

type visibleAgentCountRepo struct {
	interfaces.AgentShareRepository
	shares []*types.AgentShare
}

func (r *visibleAgentCountRepo) ListByOrganizations(context.Context, []string) ([]*types.AgentShare, error) {
	return r.shares, nil
}

func TestCountByOrganizationsMatchesVisibleAgentList(t *testing.T) {
	svc := &agentShareService{shareRepo: &visibleAgentCountRepo{shares: []*types.AgentShare{
		{OrganizationID: "org-1", AgentID: types.BuiltinDataAnalystID},
		{OrganizationID: "org-1", AgentID: types.BuiltinQuickAnswerID},
		{OrganizationID: "org-2", AgentID: "tenant-agent"},
	}}}

	counts, err := svc.CountByOrganizations(context.Background(), []string{"org-1", "org-2", "org-3"})
	require.NoError(t, err)
	require.Equal(t, map[string]int64{"org-1": 1, "org-2": 1, "org-3": 0}, counts)
}

func TestSharedAgentInfoLocalizesBuiltinName(t *testing.T) {
	restore := types.OverrideBuiltinAgentEntriesForTest(map[string]*types.BuiltinAgentEntry{
		types.BuiltinQuickAnswerID: {
			ID: types.BuiltinQuickAnswerID,
			I18n: map[string]types.BuiltinAgentI18n{
				"default": {Name: "快速问答", Description: "中文 RAG"},
				"en-US":   {Name: "Quick Answer", Description: "English RAG"},
			},
		},
	})
	t.Cleanup(restore)

	agent := &types.CustomAgent{
		ID:          types.BuiltinQuickAnswerID,
		Name:        "frozen-zh",
		Description: "frozen-zh-desc",
		IsBuiltin:   true,
		TenantID:    1,
	}
	svc := &agentShareService{}
	ctx := context.WithValue(context.Background(), types.LanguageContextKey, "en-US")
	info := svc.sharedAgentInfo(ctx, &types.AgentShare{
		Agent:          agent,
		SourceTenantID: 1,
	}, types.OrgRoleViewer, map[string]bool{})

	require.Equal(t, "Quick Answer", info.Agent.Name)
	require.Equal(t, "English RAG", info.Agent.Description)
}

func TestSharedAgentInfoLeavesCustomAgentName(t *testing.T) {
	agent := &types.CustomAgent{ID: "custom-1", Name: "Mine", Description: "keep me"}
	svc := &agentShareService{}
	info := svc.sharedAgentInfo(context.Background(), &types.AgentShare{
		Agent:          agent,
		SourceTenantID: 1,
	}, types.OrgRoleViewer, map[string]bool{})
	require.Equal(t, "Mine", info.Agent.Name)
	require.Equal(t, "keep me", info.Agent.Description)
}
