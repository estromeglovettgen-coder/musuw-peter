package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

// These stubs keep the test at the KB-share service boundary. The embedded
// interfaces provide the unrelated repository methods; only methods exercised
// by the two public list operations are implemented here.
type sharedKBListRepositoryStub struct {
	interfaces.KBShareRepository
	shared []*types.KnowledgeBaseShare
}

func (r *sharedKBListRepositoryStub) ListSharedKBsForTenant(context.Context, uint64) ([]*types.KnowledgeBaseShare, error) {
	return r.shared, nil
}

func (r *sharedKBListRepositoryStub) ListByKnowledgeBase(context.Context, string) ([]*types.KnowledgeBaseShare, error) {
	return r.shared, nil
}

func (r *sharedKBListRepositoryStub) ListByOrganization(context.Context, string) ([]*types.KnowledgeBaseShare, error) {
	return r.shared, nil
}

func (r *sharedKBListRepositoryStub) ListByOrganizations(context.Context, []string) ([]*types.KnowledgeBaseShare, error) {
	return r.shared, nil
}

type sharedKBLookupRepositoryStub struct {
	interfaces.KnowledgeBaseRepository
	kb *types.KnowledgeBase
}

func (r *sharedKBLookupRepositoryStub) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return r.kb, nil
}

type sharedKBOrganizationRepositoryStub struct {
	interfaces.OrganizationRepository
	member *types.OrganizationTenantMember
}

func (r *sharedKBOrganizationRepositoryStub) GetTenantMember(context.Context, string, uint64) (*types.OrganizationTenantMember, error) {
	return r.member, nil
}

func (r *sharedKBOrganizationRepositoryStub) ListTenantMembersByTenantForOrgs(_ context.Context, tenantID uint64, orgIDs []string) (map[string]*types.OrganizationTenantMember, error) {
	result := make(map[string]*types.OrganizationTenantMember, len(orgIDs))
	for _, orgID := range orgIDs {
		result[orgID] = &types.OrganizationTenantMember{TenantID: tenantID, OrganizationID: orgID, Role: r.member.Role}
	}
	return result, nil
}

type sharedKBKnowledgeRepositoryStub struct {
	interfaces.KnowledgeRepository
}

func (*sharedKBKnowledgeRepositoryStub) CountKnowledgeByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return 0, nil
}

type sharedKBChunkRepositoryStub struct {
	interfaces.ChunkRepository
}

func (*sharedKBChunkRepositoryStub) CountChunksByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return 0, nil
}

func newSharedKBListService(shares []*types.KnowledgeBaseShare) *kbShareService {
	return &kbShareService{
		shareRepo: &sharedKBListRepositoryStub{shared: shares},
		orgRepo: &sharedKBOrganizationRepositoryStub{
			member: &types.OrganizationTenantMember{Role: types.OrgRoleAdmin},
		},
		kgRepo:    &sharedKBKnowledgeRepositoryStub{},
		chunkRepo: &sharedKBChunkRepositoryStub{},
	}
}

func sharedKBListFixtures() []*types.KnowledgeBaseShare {
	return []*types.KnowledgeBaseShare{
		{
			ID:              "share-document",
			KnowledgeBaseID: "kb-document",
			OrganizationID:  "org-1",
			SourceTenantID:  2,
			Permission:      types.OrgRoleEditor,
			KnowledgeBase: &types.KnowledgeBase{
				ID:       "kb-document",
				TenantID: 2,
				Type:     types.KnowledgeBaseTypeDocument,
			},
		},
		{
			ID:              "share-faq",
			KnowledgeBaseID: "kb-faq",
			OrganizationID:  "org-1",
			SourceTenantID:  2,
			Permission:      types.OrgRoleEditor,
			KnowledgeBase: &types.KnowledgeBase{
				ID:       "kb-faq",
				TenantID: 2,
				Type:     types.KnowledgeBaseTypeFAQ,
			},
		},
	}
}

func sharedKBIDs(infos []*types.SharedKnowledgeBaseInfo) []string {
	ids := make([]string, 0, len(infos))
	for _, info := range infos {
		if info != nil && info.KnowledgeBase != nil {
			ids = append(ids, info.KnowledgeBase.ID)
		}
	}
	return ids
}

func sharedKBOrganizationIDs(items []*types.OrganizationSharedKnowledgeBaseItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item != nil && item.KnowledgeBase != nil {
			ids = append(ids, item.KnowledgeBase.ID)
		}
	}
	return ids
}

func TestListSharedKnowledgeBasesLiteHidesFAQButStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			svc := newSharedKBListService(sharedKBListFixtures())

			got, err := svc.ListSharedKnowledgeBases(context.Background(), 1, types.TenantRoleOwner)

			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, sharedKBIDs(got))
		})
	}
}

func TestListSharedKnowledgeBasesInOrganizationLiteHidesFAQButStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			svc := newSharedKBListService(sharedKBListFixtures())

			got, err := svc.ListSharedKnowledgeBasesInOrganization(context.Background(), "org-1", 1, types.TenantRoleOwner)

			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, sharedKBOrganizationIDs(got))
		})
	}
}

func TestListSharesByOrganizationLiteHidesFAQButStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			svc := newSharedKBListService(sharedKBListFixtures())

			got, err := svc.ListSharesByOrganization(context.Background(), "org-1")

			require.NoError(t, err)
			ids := make([]string, 0, len(got))
			for _, share := range got {
				if share != nil && share.KnowledgeBase != nil {
					ids = append(ids, share.KnowledgeBase.ID)
				}
			}
			require.ElementsMatch(t, tc.wantIDs, ids)
		})
	}
}

func TestListSharesByOrganizationLiteFailsClosedWhenKBIsNotPreloaded(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	svc := newSharedKBListService([]*types.KnowledgeBaseShare{
		{ID: "stale-share", KnowledgeBaseID: "kb-faq"},
	})

	got, err := svc.ListSharesByOrganization(context.Background(), "org-1")

	require.NoError(t, err)
	require.Empty(t, got)
}

func TestListSharesByKnowledgeBaseLiteHidesFAQButStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: nil},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			shares := sharedKBListFixtures()[1:]
			svc := newSharedKBListService(shares)
			svc.kbRepo = &sharedKBLookupRepositoryStub{
				kb: &types.KnowledgeBase{ID: "kb-faq", TenantID: 1, Type: types.KnowledgeBaseTypeFAQ},
			}

			got, err := svc.ListSharesByKnowledgeBase(context.Background(), "kb-faq", 1)
			if tc.edition == "lite" {
				require.ErrorIs(t, err, ErrKBNotFound)
				require.Nil(t, got)
				return
			}
			require.NoError(t, err)
			require.Len(t, got, 1)
			require.Equal(t, "kb-faq", got[0].KnowledgeBaseID)
		})
	}
}

func TestListSharedKnowledgeBaseIDsByOrganizationsLiteHidesFAQButStandardPreservesIt(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"kb-document"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"kb-document", "kb-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			svc := newSharedKBListService(sharedKBListFixtures())

			got, err := svc.ListSharedKnowledgeBaseIDsByOrganizations(context.Background(), []string{"org-1"}, 1)

			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, got["org-1"])
		})
	}
}

var (
	_ interfaces.KBShareRepository      = (*sharedKBListRepositoryStub)(nil)
	_ interfaces.OrganizationRepository = (*sharedKBOrganizationRepositoryStub)(nil)
	_ interfaces.KnowledgeRepository    = (*sharedKBKnowledgeRepositoryStub)(nil)
	_ interfaces.ChunkRepository        = (*sharedKBChunkRepositoryStub)(nil)
)
