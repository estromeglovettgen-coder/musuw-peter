package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type suggestionTagRepo struct {
	interfaces.KnowledgeTagRepository
	tagsByTenant map[uint64][]*types.KnowledgeTag
}

func (r *suggestionTagRepo) GetByIDs(_ context.Context, tenantID uint64, ids []string) ([]*types.KnowledgeTag, error) {
	wanted := make(map[string]bool, len(ids))
	for _, id := range ids {
		wanted[id] = true
	}
	var result []*types.KnowledgeTag
	for _, tag := range r.tagsByTenant[tenantID] {
		if tag != nil && wanted[tag.ID] {
			result = append(result, tag)
		}
	}
	return result, nil
}

type suggestionKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	idsByTenantAndKB map[uint64]map[string][]string
	rowsByTenant     map[uint64]map[string]*types.Knowledge
	batchCalls       int
}

func (r *suggestionKnowledgeRepo) ListIDsByTagIDs(
	_ context.Context,
	tenantID uint64,
	kbID string,
	_ []string,
) ([]string, error) {
	return append([]string(nil), r.idsByTenantAndKB[tenantID][kbID]...), nil
}

func (r *suggestionKnowledgeRepo) GetKnowledgeBatch(
	_ context.Context,
	tenantID uint64,
	ids []string,
) ([]*types.Knowledge, error) {
	r.batchCalls++
	rows := make([]*types.Knowledge, 0, len(ids))
	for _, id := range ids {
		if row := r.rowsByTenant[tenantID][id]; row != nil {
			rows = append(rows, row)
		}
	}
	return rows, nil
}

type suggestionKBService struct {
	interfaces.KnowledgeBaseService
	kbs       map[string]*types.KnowledgeBase
	listed    []*types.KnowledgeBase
	listCalls int
}

func (s *suggestionKBService) GetKnowledgeBasesByIDsOnly(
	_ context.Context,
	ids []string,
) ([]*types.KnowledgeBase, error) {
	result := make([]*types.KnowledgeBase, 0, len(ids))
	for _, id := range ids {
		if kb := s.kbs[id]; kb != nil {
			result = append(result, kb)
		}
	}
	return result, nil
}

func (s *suggestionKBService) ListKnowledgeBases(_ context.Context) ([]*types.KnowledgeBase, error) {
	s.listCalls++
	return append([]*types.KnowledgeBase(nil), s.listed...), nil
}

type suggestionKBShareService struct {
	interfaces.KBShareService
	allowed map[string]bool
	calls   int
}

func (s *suggestionKBShareService) HasTenantKBPermission(
	_ context.Context,
	kbID string,
	_ uint64,
	_ types.TenantRole,
	_ types.OrgMemberRole,
) (bool, error) {
	s.calls++
	return s.allowed[kbID], nil
}

func TestResolveSuggestionTagScopes_UsesSourceTenantForSharedKB(t *testing.T) {
	const (
		callerTenant = uint64(1)
		sourceTenant = uint64(2)
		kbID         = "shared-kb"
		tagID        = "shared-tag"
	)
	svc := &customAgentService{
		tagRepo: &suggestionTagRepo{tagsByTenant: map[uint64][]*types.KnowledgeTag{
			sourceTenant: {{ID: tagID, TenantID: sourceTenant, KnowledgeBaseID: kbID}},
		}},
		knowledgeRepo: &suggestionKnowledgeRepo{idsByTenantAndKB: map[uint64]map[string][]string{
			sourceTenant: {kbID: {"doc-in-tag"}},
		}},
		kbService: &suggestionKBService{kbs: map[string]*types.KnowledgeBase{
			kbID: {ID: kbID, TenantID: sourceTenant},
		}},
		kbShareService: &suggestionKBShareService{allowed: map[string]bool{kbID: true}},
	}

	resolved, err := svc.resolveSuggestionTagScopes(
		context.Background(),
		callerTenant,
		[]types.TagScope{{KnowledgeBaseID: kbID, TagIDs: []string{tagID}}},
	)
	require.NoError(t, err)
	assert.Equal(t, []string{kbID}, resolved.KnowledgeBaseIDs)
	assert.Equal(t, []string{"doc-in-tag"}, resolved.KnowledgeIDs)
	assert.Equal(t, []string{tagID}, resolved.TagIDsByTenant[sourceTenant])
	assert.Empty(t, resolved.TagIDsByTenant[callerTenant])
}

func TestGroupKBIDsByEffectiveTenant_LiteDropsSharedKnowledgeBase(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	const (
		callerTenant = uint64(1)
		sourceTenant = uint64(2)
		kbID         = "shared-kb"
	)
	shares := &suggestionKBShareService{allowed: map[string]bool{kbID: true}}
	svc := &customAgentService{
		kbService: &suggestionKBService{kbs: map[string]*types.KnowledgeBase{
			kbID: {ID: kbID, TenantID: sourceTenant},
		}},
		kbShareService: shares,
	}

	groups := svc.groupKBIDsByEffectiveTenant(context.Background(), callerTenant, []string{kbID})

	assert.Empty(t, groups)
	assert.Zero(t, shares.calls, "Lite must not consult organization shares")
}

func TestResolveSuggestionTagScopes_LiteDoesNotReadSharedTags(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	const (
		callerTenant = uint64(1)
		sourceTenant = uint64(2)
		kbID         = "shared-kb"
		tagID        = "shared-tag"
	)
	shares := &suggestionKBShareService{allowed: map[string]bool{kbID: true}}
	svc := &customAgentService{
		tagRepo: &suggestionTagRepo{tagsByTenant: map[uint64][]*types.KnowledgeTag{
			sourceTenant: {{ID: tagID, TenantID: sourceTenant, KnowledgeBaseID: kbID}},
		}},
		knowledgeRepo: &suggestionKnowledgeRepo{idsByTenantAndKB: map[uint64]map[string][]string{
			sourceTenant: {kbID: {"doc-in-tag"}},
		}},
		kbService: &suggestionKBService{kbs: map[string]*types.KnowledgeBase{
			kbID: {ID: kbID, TenantID: sourceTenant},
		}},
		kbShareService: shares,
	}

	resolved, err := svc.resolveSuggestionTagScopes(
		context.Background(),
		callerTenant,
		[]types.TagScope{{KnowledgeBaseID: kbID, TagIDs: []string{tagID}}},
	)

	require.NoError(t, err)
	assert.Empty(t, resolved.KnowledgeBaseIDs)
	assert.Empty(t, resolved.KnowledgeIDs)
	assert.Empty(t, resolved.TagIDsByTenant)
	assert.Zero(t, shares.calls, "Lite must not consult organization shares")
}

func TestFilterLiteSuggestionKnowledgeIDs_DropsLegacyFAQ(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	const tenantID = uint64(1)
	knowledgeRepo := &suggestionKnowledgeRepo{rowsByTenant: map[uint64]map[string]*types.Knowledge{
		tenantID: {
			"faq-row": {ID: "faq-row", TenantID: tenantID, KnowledgeBaseID: "faq-kb"},
			"doc-row": {ID: "doc-row", TenantID: tenantID, KnowledgeBaseID: "doc-kb"},
		},
	}}
	svc := &customAgentService{
		knowledgeRepo: knowledgeRepo,
		kbService: &suggestionKBService{kbs: map[string]*types.KnowledgeBase{
			"faq-kb": {ID: "faq-kb", TenantID: tenantID, Type: types.KnowledgeBaseTypeFAQ},
			"doc-kb": {ID: "doc-kb", TenantID: tenantID, Type: types.KnowledgeBaseTypeDocument},
		}},
	}

	got := svc.filterLiteSuggestionKnowledgeIDs(context.Background(), tenantID, []string{"faq-row", "doc-row"})

	assert.Equal(t, []string{"doc-row"}, got)
	assert.Equal(t, 1, knowledgeRepo.batchCalls)
}

func TestGetSuggestedQuestions_LiteRejectedExplicitKnowledgeDoesNotFallbackToAgentScope(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	const tenantID = uint64(1)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenantID)
	agent := &types.CustomAgent{
		ID:       "agent-1",
		TenantID: tenantID,
		Config: types.CustomAgentConfig{
			KBSelectionMode: "all",
			QuestionSuggestions: &types.QuestionSuggestionConfig{
				Starters: types.StarterSuggestionConfig{
					Enabled: true,
					Mode:    types.SuggestionModeKnowledge,
				},
			},
		},
	}
	knowledgeRepo := &suggestionKnowledgeRepo{rowsByTenant: map[uint64]map[string]*types.Knowledge{
		tenantID: {
			"faq-row": {ID: "faq-row", TenantID: tenantID, KnowledgeBaseID: "faq-kb"},
		},
	}}
	kbService := &suggestionKBService{kbs: map[string]*types.KnowledgeBase{
		"faq-kb": {ID: "faq-kb", TenantID: tenantID, Type: types.KnowledgeBaseTypeFAQ},
	}}
	svc := &customAgentService{
		repo:          &suggestionLimitAgentRepo{agent: agent},
		knowledgeRepo: knowledgeRepo,
		kbService:     kbService,
	}

	got, err := svc.GetSuggestedQuestions(ctx, agent.ID, nil, []string{"faq-row"}, nil, 6)

	require.NoError(t, err)
	assert.Empty(t, got)
	assert.Zero(t, kbService.listCalls, "an explicit rejected scope must not expand to the agent's all-KB scope")
}

func TestMergeHybridStarterSuggestions_ReservesKnowledgeSlots(t *testing.T) {
	curated := []types.SuggestedQuestion{
		{Question: "curated 1", Source: "agent_config"},
		{Question: "curated 2", Source: "agent_config"},
		{Question: "curated 3", Source: "agent_config"},
		{Question: "curated 4", Source: "agent_config"},
		{Question: "curated 5", Source: "agent_config"},
		{Question: "curated 6", Source: "agent_config"},
	}
	knowledge := []types.SuggestedQuestion{
		{Question: "knowledge 1", Source: "document"},
		{Question: "knowledge 2", Source: "faq"},
		{Question: "knowledge 3", Source: "document"},
	}

	got := mergeHybridStarterSuggestions(curated, knowledge, 6)
	require.Len(t, got, 6)
	assert.Equal(t, []string{
		"curated 1", "curated 2", "curated 3", "curated 4", "knowledge 1", "knowledge 2",
	}, []string{got[0].Question, got[1].Question, got[2].Question, got[3].Question, got[4].Question, got[5].Question})
}

func TestMergeHybridStarterSuggestions_BackfillsWhenKnowledgeIsEmpty(t *testing.T) {
	curated := []types.SuggestedQuestion{
		{Question: "curated 1"}, {Question: "curated 2"}, {Question: "curated 3"},
	}
	got := mergeHybridStarterSuggestions(curated, nil, 3)
	require.Len(t, got, 3)
	assert.Equal(t, []string{"curated 1", "curated 2", "curated 3"}, []string{
		got[0].Question, got[1].Question, got[2].Question,
	})
}

func TestExcludeSuggestionStrings_TagScopeOverridesSameKnowledgeBase(t *testing.T) {
	got := excludeSuggestionStrings([]string{"kb-with-tag", "kb-explicit"}, []string{"kb-with-tag"})
	assert.Equal(t, []string{"kb-explicit"}, got)
}
