package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// These stubs intentionally implement only the methods reached by the
// organization list/count handlers. Embedding the interfaces keeps the test
// at the handler boundary without manufacturing unrelated service behavior.
type organizationKBShareServiceStub struct {
	interfaces.KBShareService
	directItems []*types.OrganizationSharedKnowledgeBaseItem
	directIDs   map[string][]string
}

func (s *organizationKBShareServiceStub) ListSharedKnowledgeBasesInOrganization(context.Context, string, uint64, types.TenantRole) ([]*types.OrganizationSharedKnowledgeBaseItem, error) {
	return s.directItems, nil
}

func (s *organizationKBShareServiceStub) ListSharedKnowledgeBaseIDsByOrganizations(context.Context, []string, uint64) (map[string][]string, error) {
	return s.directIDs, nil
}

type organizationAgentShareServiceStub struct {
	interfaces.AgentShareService
	itemsByOrg map[string][]*types.OrganizationSharedAgentItem
	counts     map[string]int64
}

func (s *organizationAgentShareServiceStub) ListSharedAgentsInOrganization(_ context.Context, orgID string, _ uint64, _ types.TenantRole) ([]*types.OrganizationSharedAgentItem, error) {
	return s.itemsByOrg[orgID], nil
}

func (s *organizationAgentShareServiceStub) ListSharedAgentsInOrganizations(_ context.Context, orgIDs []string, _ uint64, _ types.TenantRole) (map[string][]*types.OrganizationSharedAgentItem, error) {
	result := make(map[string][]*types.OrganizationSharedAgentItem, len(orgIDs))
	for _, orgID := range orgIDs {
		result[orgID] = s.itemsByOrg[orgID]
	}
	return result, nil
}

func (s *organizationAgentShareServiceStub) CountByOrganizations(context.Context, []string) (map[string]int64, error) {
	return s.counts, nil
}

type organizationServiceStub struct {
	interfaces.OrganizationService
	organization *types.Organization
}

func (s *organizationServiceStub) GetTenantMember(context.Context, string, uint64) (*types.OrganizationTenantMember, error) {
	return &types.OrganizationTenantMember{Role: types.OrgRoleAdmin}, nil
}

func (s *organizationServiceStub) GetOrganization(context.Context, string) (*types.Organization, error) {
	return s.organization, nil
}

type organizationUserServiceStub struct {
	interfaces.UserService
}

func (*organizationUserServiceStub) GetUserByID(context.Context, string) (*types.User, error) {
	return &types.User{Username: "share-owner"}, nil
}

type organizationKnowledgeBaseServiceStub struct {
	interfaces.KnowledgeBaseService
	byID map[string]*types.KnowledgeBase
}

func (s *organizationKnowledgeBaseServiceStub) GetKnowledgeBaseByIDOnly(_ context.Context, id string) (*types.KnowledgeBase, error) {
	return s.byID[id], nil
}

func (s *organizationKnowledgeBaseServiceStub) ListKnowledgeBasesByTenantID(_ context.Context, tenantID uint64) ([]*types.KnowledgeBase, error) {
	result := make([]*types.KnowledgeBase, 0, len(s.byID))
	for _, kb := range s.byID {
		if kb != nil && kb.TenantID == tenantID {
			result = append(result, kb)
		}
	}
	return result, nil
}

type organizationKnowledgeRepositoryStub struct {
	interfaces.KnowledgeRepository
}

func (*organizationKnowledgeRepositoryStub) CountKnowledgeByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return 3, nil
}

type organizationChunkRepositoryStub struct {
	interfaces.ChunkRepository
}

func (*organizationChunkRepositoryStub) CountChunksByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return 5, nil
}

type organizationKBShareRepositoryStub struct {
	interfaces.KBShareRepository
	shares []*types.KnowledgeBaseShare
}

func (s *organizationKBShareRepositoryStub) ListByOrganization(context.Context, string) ([]*types.KnowledgeBaseShare, error) {
	return s.shares, nil
}

func organizationKBFixtures() []*types.KnowledgeBaseShare {
	return []*types.KnowledgeBaseShare{
		{
			ID:              "share-document",
			KnowledgeBaseID: "kb-document",
			OrganizationID:  "org-1",
			SharedByUserID:  "user-1",
			SourceTenantID:  2,
			Permission:      types.OrgRoleEditor,
			KnowledgeBase: &types.KnowledgeBase{
				ID:       "kb-document",
				Name:     "Documents",
				Type:     types.KnowledgeBaseTypeDocument,
				TenantID: 2,
			},
		},
		{
			ID:              "share-faq",
			KnowledgeBaseID: "kb-faq",
			OrganizationID:  "org-1",
			SharedByUserID:  "user-1",
			SourceTenantID:  2,
			Permission:      types.OrgRoleEditor,
			KnowledgeBase: &types.KnowledgeBase{
				ID:       "kb-faq",
				Name:     "Legacy FAQ",
				Type:     types.KnowledgeBaseTypeFAQ,
				TenantID: 2,
			},
		},
	}
}

func organizationKBMap() map[string]*types.KnowledgeBase {
	return map[string]*types.KnowledgeBase{
		"kb-document": {ID: "kb-document", Name: "Documents", Type: types.KnowledgeBaseTypeDocument, TenantID: 2},
		"kb-faq":      {ID: "kb-faq", Name: "Legacy FAQ", Type: types.KnowledgeBaseTypeFAQ, TenantID: 2},
	}
}

func organizationSelectedAgentItems() map[string][]*types.OrganizationSharedAgentItem {
	return map[string][]*types.OrganizationSharedAgentItem{
		"org-1": {
			{
				SharedAgentInfo: types.SharedAgentInfo{
					OrganizationID: "org-1",
					OrgName:        "Shared space",
					Agent: &types.CustomAgent{
						ID:       "agent-1",
						TenantID: 2,
						Config: types.CustomAgentConfig{
							KBSelectionMode: "selected",
							KnowledgeBases:  []string{"kb-document", "kb-faq"},
						},
					},
				},
			},
		},
	}
}

func setOrganizationEdition(t *testing.T, edition string) {
	t.Helper()
	previous := Edition
	Edition = edition
	t.Setenv("MUSUW_PRODUCT_EDITION", edition)
	t.Cleanup(func() { Edition = previous })
}

func organizationIDsFromSpaceItems(items []*types.OrganizationSharedKnowledgeBaseItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item != nil && item.KnowledgeBase != nil {
			ids = append(ids, item.KnowledgeBase.ID)
		}
	}
	return ids
}

func TestListOrgSharesLiteFiltersFAQAndStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setOrganizationEdition(t, tc.edition)
			shareService := service.NewKBShareService(
				&organizationKBShareRepositoryStub{shares: organizationKBFixtures()},
				nil, nil, nil, nil, nil,
			)
			h := NewOrganizationHandler(
				&organizationServiceStub{},
				shareService,
				nil,
				nil,
				&organizationUserServiceStub{},
				nil,
				nil,
				&organizationKnowledgeRepositoryStub{},
				&organizationChunkRepositoryStub{},
			)

			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.GET("/organizations/:id/shares", func(c *gin.Context) {
				c.Set(types.TenantIDContextKey.String(), uint64(1))
				h.ListOrgShares(c)
			})
			request := httptest.NewRequest(http.MethodGet, "/organizations/org-1/shares", nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			require.Equal(t, http.StatusOK, response.Code)
			var body struct {
				Success bool                     `json:"success"`
				Data    types.ListSharesResponse `json:"data"`
			}
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
			require.True(t, body.Success)
			ids := make([]string, 0, len(body.Data.Shares))
			for _, share := range body.Data.Shares {
				ids = append(ids, share.KnowledgeBaseID)
			}
			require.ElementsMatch(t, tc.wantIDs, ids)
			require.Equal(t, int64(len(tc.wantIDs)), body.Data.Total)
		})
	}
}

func TestListSpaceKnowledgeBasesSelectedAgentLiteFiltersFAQAndStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setOrganizationEdition(t, tc.edition)
			h := NewOrganizationHandler(
				&organizationServiceStub{organization: &types.Organization{ID: "org-1", Name: "Shared space"}},
				&organizationKBShareServiceStub{directItems: []*types.OrganizationSharedKnowledgeBaseItem{}},
				&organizationAgentShareServiceStub{itemsByOrg: organizationSelectedAgentItems()},
				nil,
				nil,
				nil,
				&organizationKnowledgeBaseServiceStub{byID: organizationKBMap()},
				&organizationKnowledgeRepositoryStub{},
				&organizationChunkRepositoryStub{},
			)

			got, err := h.listSpaceKnowledgeBasesInOrganization(context.Background(), "org-1", 1, types.TenantRoleOwner)

			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, organizationIDsFromSpaceItems(got))
		})
	}
}

func TestBuildResourceCountsByOrgSelectedAgentLiteExcludesFAQ(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		want    int
	}{
		{name: "Lite", edition: "lite", want: 1},
		{name: "Standard", edition: "standard", want: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setOrganizationEdition(t, tc.edition)
			h := NewOrganizationHandler(
				nil,
				&organizationKBShareServiceStub{directIDs: map[string][]string{}},
				&organizationAgentShareServiceStub{
					itemsByOrg: organizationSelectedAgentItems(),
					counts:     map[string]int64{"org-1": 1},
				},
				nil,
				nil,
				nil,
				&organizationKnowledgeBaseServiceStub{byID: organizationKBMap()},
				nil,
				nil,
			)

			got := h.buildResourceCountsByOrg(context.Background(), []*types.Organization{{ID: "org-1"}}, "", 1)

			require.NotNil(t, got)
			require.Equal(t, tc.want, got.KnowledgeBases.ByOrganization["org-1"])
		})
	}
}

var (
	_ interfaces.KBShareRepository    = (*organizationKBShareRepositoryStub)(nil)
	_ interfaces.KBShareService       = (*organizationKBShareServiceStub)(nil)
	_ interfaces.AgentShareService    = (*organizationAgentShareServiceStub)(nil)
	_ interfaces.OrganizationService  = (*organizationServiceStub)(nil)
	_ interfaces.UserService          = (*organizationUserServiceStub)(nil)
	_ interfaces.KnowledgeBaseService = (*organizationKnowledgeBaseServiceStub)(nil)
	_ interfaces.KnowledgeRepository  = (*organizationKnowledgeRepositoryStub)(nil)
	_ interfaces.ChunkRepository      = (*organizationChunkRepositoryStub)(nil)
)
