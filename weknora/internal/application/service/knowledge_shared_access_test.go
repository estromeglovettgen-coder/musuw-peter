package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeKBShareService struct {
	allowedKBs map[string]bool
	shared     []*types.SharedKnowledgeBaseInfo
}

// searchKnowledgeBaseService supplies only the KB list needed by
// knowledgeService.SearchKnowledge while leaving the rest of the production
// interface unavailable. This keeps the test at the public service seam.
type searchKnowledgeBaseService struct {
	interfaces.KnowledgeBaseService
	own []*types.KnowledgeBase
}

func (s *searchKnowledgeBaseService) ListKnowledgeBases(context.Context) ([]*types.KnowledgeBase, error) {
	return s.own, nil
}

// scopedSearchKnowledgeRepository makes the shared-scope expansion visible:
// the fake returns the caller's own row for every call and appends a second
// tenant's row only when the service passes that scope through.
type scopedSearchKnowledgeRepository struct {
	interfaces.KnowledgeRepository
	own, shared *types.Knowledge
	scopes      []types.KnowledgeSearchScope
}

func (r *scopedSearchKnowledgeRepository) SearchKnowledgeInScopes(
	_ context.Context,
	scopes []types.KnowledgeSearchScope,
	_ string,
	_, _ int,
	_ []string,
) ([]*types.Knowledge, bool, int64, error) {
	r.scopes = append([]types.KnowledgeSearchScope(nil), scopes...)
	rows := make([]*types.Knowledge, 0, 2)
	if r.own != nil {
		rows = append(rows, r.own)
	}
	for _, scope := range scopes {
		if r.shared != nil && scope.TenantID == r.shared.TenantID && scope.KBID == r.shared.KnowledgeBaseID {
			rows = append(rows, r.shared)
			break
		}
	}
	return rows, false, int64(len(rows)), nil
}

type batchLookupKBService struct {
	interfaces.KnowledgeBaseService
	kbs map[string]*types.KnowledgeBase
}

func (s *batchLookupKBService) GetKnowledgeBasesByIDsOnly(_ context.Context, ids []string) ([]*types.KnowledgeBase, error) {
	result := make([]*types.KnowledgeBase, 0, len(ids))
	for _, id := range ids {
		if kb, ok := s.kbs[id]; ok {
			result = append(result, kb)
		}
	}
	return result, nil
}

func (f *fakeKBShareService) ShareKnowledgeBase(context.Context, string, string, string, uint64, types.OrgMemberRole) (*types.KnowledgeBaseShare, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) UpdateSharePermission(context.Context, string, types.OrgMemberRole, string, uint64) error {
	return errors.New("not implemented")
}
func (f *fakeKBShareService) RemoveShare(context.Context, string, string, uint64) error {
	return errors.New("not implemented")
}
func (f *fakeKBShareService) ListSharesByKnowledgeBase(context.Context, string, uint64) ([]*types.KnowledgeBaseShare, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) ListSharesByOrganization(context.Context, string) ([]*types.KnowledgeBaseShare, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) ListSharedKnowledgeBases(context.Context, uint64, types.TenantRole) ([]*types.SharedKnowledgeBaseInfo, error) {
	return f.shared, nil
}
func (f *fakeKBShareService) ListSharedKnowledgeBasesInOrganization(context.Context, string, uint64, types.TenantRole) ([]*types.OrganizationSharedKnowledgeBaseItem, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) ListSharedKnowledgeBaseIDsByOrganizations(context.Context, []string, uint64) (map[string][]string, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) GetShare(context.Context, string) (*types.KnowledgeBaseShare, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) GetShareByKBAndOrg(context.Context, string, string) (*types.KnowledgeBaseShare, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) CheckTenantKBPermission(context.Context, string, uint64, types.TenantRole) (types.OrgMemberRole, bool, error) {
	return "", false, errors.New("not implemented")
}
func (f *fakeKBShareService) HasTenantKBPermission(ctx context.Context, kbID string, callerTenantID uint64, callerTenantRole types.TenantRole, requiredRole types.OrgMemberRole) (bool, error) {
	return f.allowedKBs[kbID], nil
}
func (f *fakeKBShareService) GetKBSourceTenant(context.Context, string) (uint64, error) {
	return 0, errors.New("not implemented")
}
func (f *fakeKBShareService) CountSharesByKnowledgeBaseIDs(context.Context, []string) (map[string]int64, error) {
	return nil, errors.New("not implemented")
}
func (f *fakeKBShareService) CountByOrganizations(context.Context, []string) (map[string]int64, error) {
	return nil, errors.New("not implemented")
}

func setupKnowledgeSharedAccessDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&types.Knowledge{}))
	return db
}

func newKnowledgeSharedAccessService(t *testing.T, kbShare interfaces.KBShareService) (*knowledgeService, *gorm.DB) {
	t.Helper()

	db := setupKnowledgeSharedAccessDB(t)
	repo := repository.NewKnowledgeRepository(db)
	return &knowledgeService{
		repo:           repo,
		kbShareService: kbShare,
	}, db
}

func newSharedAccessContext() context.Context {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(1))
	ctx = context.WithValue(ctx, types.UserIDContextKey, "user-1")
	return ctx
}

func seedKnowledge(t *testing.T, db *gorm.DB, knowledge *types.Knowledge) {
	t.Helper()
	require.NoError(t, db.Create(knowledge).Error)
}

func TestGetKnowledgeBatchWithSharedAccess_IncludesSharedKnowledgeWithPermission(t *testing.T) {
	service, db := newKnowledgeSharedAccessService(t, &fakeKBShareService{
		allowedKBs: map[string]bool{"kb-shared": true},
	})

	now := time.Now()
	sharedKnowledge := &types.Knowledge{
		ID:              "k-shared",
		TenantID:        2,
		KnowledgeBaseID: "kb-shared",
		Type:            "file",
		Title:           "shared doc",
		FileName:        "shared.txt",
		FileType:        "txt",
		ParseStatus:     types.ParseStatusCompleted,
		EnableStatus:    "enabled",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	seedKnowledge(t, db, sharedKnowledge)

	got, err := service.GetKnowledgeBatchWithSharedAccess(newSharedAccessContext(), 1, []string{"k-shared"})

	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "k-shared", got[0].ID)
	require.Equal(t, uint64(2), got[0].TenantID)
	require.Equal(t, "kb-shared", got[0].KnowledgeBaseID)
}

func TestGetKnowledgeBatchWithSharedAccess_ExcludesSharedKnowledgeWithoutPermission(t *testing.T) {
	service, db := newKnowledgeSharedAccessService(t, &fakeKBShareService{
		allowedKBs: map[string]bool{},
	})

	now := time.Now()
	sharedKnowledge := &types.Knowledge{
		ID:              "k-shared",
		TenantID:        2,
		KnowledgeBaseID: "kb-shared",
		Type:            "file",
		Title:           "shared doc",
		FileName:        "shared.txt",
		FileType:        "txt",
		ParseStatus:     types.ParseStatusCompleted,
		EnableStatus:    "enabled",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	seedKnowledge(t, db, sharedKnowledge)

	got, err := service.GetKnowledgeBatchWithSharedAccess(newSharedAccessContext(), 1, []string{"k-shared"})

	require.NoError(t, err)
	require.Empty(t, got)
}

func TestGetKnowledgeBatchWithSharedAccess_LiteRejectsSharedKnowledge(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	service, db := newKnowledgeSharedAccessService(t, &fakeKBShareService{
		allowedKBs: map[string]bool{"kb-shared": true},
	})

	now := time.Now()
	seedKnowledge(t, db, &types.Knowledge{
		ID:              "k-shared",
		TenantID:        2,
		KnowledgeBaseID: "kb-shared",
		Type:            "file",
		Title:           "shared doc",
		FileName:        "shared.txt",
		FileType:        "txt",
		ParseStatus:     types.ParseStatusCompleted,
		EnableStatus:    "enabled",
		CreatedAt:       now,
		UpdatedAt:       now,
	})

	got, err := service.GetKnowledgeBatchWithSharedAccess(newSharedAccessContext(), 1, []string{"k-shared"})

	require.NoError(t, err)
	require.Empty(t, got, "Lite must not resolve a crafted knowledge ID from a shared KB")
}

func TestGetKnowledgeBatchWithSharedAccess_LiteRejectsEffectiveTenantOverride(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	service, db := newKnowledgeSharedAccessService(t, &fakeKBShareService{
		allowedKBs: map[string]bool{"kb-source": true},
	})

	now := time.Now()
	seedKnowledge(t, db, &types.Knowledge{
		ID:              "k-source",
		TenantID:        2,
		KnowledgeBaseID: "kb-source",
		Type:            "file",
		Title:           "source document",
		FileName:        "source.txt",
		FileType:        "txt",
		ParseStatus:     types.ParseStatusCompleted,
		EnableStatus:    "enabled",
		CreatedAt:       now,
		UpdatedAt:       now,
	})

	// The handler's shared-agent refresh path historically passed the agent's
	// source tenant as the lookup tenant while leaving the caller tenant in
	// context. Lite must reject that effective-tenant override even when the
	// repository returns a document for it; otherwise an internal/direct seam
	// can bypass the HTTP product gate and disclose a foreign row.
	got, err := service.GetKnowledgeBatchWithSharedAccess(newSharedAccessContext(), 2, []string{"k-source"})

	require.Error(t, err)
	require.Empty(t, got, "Lite must not return rows for a foreign effective tenant")
}

func TestSearchKnowledge_LiteExcludesSharedRows(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := &scopedSearchKnowledgeRepository{
		own: &types.Knowledge{
			ID:              "k-own",
			TenantID:        1,
			KnowledgeBaseID: "kb-own",
			Title:           "own document",
		},
		shared: &types.Knowledge{
			ID:              "k-shared",
			TenantID:        2,
			KnowledgeBaseID: "kb-shared",
			Title:           "shared document",
		},
	}
	svc := &knowledgeService{
		repo: repo,
		kbService: &searchKnowledgeBaseService{own: []*types.KnowledgeBase{{
			ID:       "kb-own",
			TenantID: 1,
			Type:     types.KnowledgeBaseTypeDocument,
		}}},
		kbShareService: &fakeKBShareService{shared: []*types.SharedKnowledgeBaseInfo{{
			KnowledgeBase:  &types.KnowledgeBase{ID: "kb-shared", TenantID: 2, Type: types.KnowledgeBaseTypeDocument},
			SourceTenantID: 2,
		}}},
	}

	got, _, _, err := svc.SearchKnowledge(newSharedAccessContext(), "document", 0, 20, nil)

	require.NoError(t, err)
	require.Equal(t, []string{"k-own"}, knowledgeIDs(got), "Lite must not search shared KB scopes")
}

func TestSearchKnowledgeForScopes_LiteFiltersForeignScopes(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := &scopedSearchKnowledgeRepository{
		own: &types.Knowledge{
			ID:              "k-own",
			TenantID:        1,
			KnowledgeBaseID: "kb-own",
		},
		shared: &types.Knowledge{
			ID:              "k-shared",
			TenantID:        2,
			KnowledgeBaseID: "kb-shared",
		},
	}
	svc := &knowledgeService{repo: repo}

	got, _, _, err := svc.SearchKnowledgeForScopes(newSharedAccessContext(), []types.KnowledgeSearchScope{
		{TenantID: 1, KBID: "kb-own"},
		{TenantID: 2, KBID: "kb-shared"},
	}, "", 0, 20, nil)

	require.NoError(t, err)
	require.Equal(t, []string{"k-own"}, knowledgeIDs(got))
	require.Equal(t, []types.KnowledgeSearchScope{{TenantID: 1, KBID: "kb-own"}}, repo.scopes)
}

func TestSearchKnowledgeForScopes_LiteFailsClosedWithoutTenantContext(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	repo := &scopedSearchKnowledgeRepository{own: &types.Knowledge{ID: "k-own", TenantID: 1, KnowledgeBaseID: "kb-own"}}
	svc := &knowledgeService{repo: repo}

	got, _, _, err := svc.SearchKnowledgeForScopes(context.Background(), []types.KnowledgeSearchScope{{
		TenantID: 1,
		KBID:     "kb-own",
	}}, "", 0, 20, nil)

	require.Error(t, err)
	require.Nil(t, got)
	require.Empty(t, repo.scopes, "missing tenant context must not reach the repository")
}

func TestKnowledgeBatchLiteHidesFAQRowsButStandardPreservesThem(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edition string
		wantIDs []string
	}{
		{name: "Lite", edition: "lite", wantIDs: []string{"k-doc"}},
		{name: "Standard", edition: "standard", wantIDs: []string{"k-doc", "k-faq"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			kbSvc := &batchLookupKBService{kbs: map[string]*types.KnowledgeBase{
				"kb-doc": {ID: "kb-doc", TenantID: 1, Type: types.KnowledgeBaseTypeDocument},
				"kb-faq": {ID: "kb-faq", TenantID: 1, Type: types.KnowledgeBaseTypeFAQ},
			}}
			svc, db := newKnowledgeSharedAccessService(t, &fakeKBShareService{allowedKBs: map[string]bool{"kb-faq": true}})
			svc.kbService = kbSvc
			now := time.Now()
			seedKnowledge(t, db, &types.Knowledge{ID: "k-doc", TenantID: 1, KnowledgeBaseID: "kb-doc", Type: "file", Title: "document", ParseStatus: types.ParseStatusCompleted, EnableStatus: "enabled", CreatedAt: now, UpdatedAt: now})
			seedKnowledge(t, db, &types.Knowledge{ID: "k-faq", TenantID: 1, KnowledgeBaseID: "kb-faq", Type: "file", Title: "faq", ParseStatus: types.ParseStatusCompleted, EnableStatus: "enabled", CreatedAt: now, UpdatedAt: now})

			ctx := newSharedAccessContext()
			got, err := svc.GetKnowledgeBatch(ctx, 1, []string{"k-doc", "k-faq"})
			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, knowledgeIDs(got))

			got, err = svc.GetKnowledgeBatchWithSharedAccess(ctx, 1, []string{"k-doc", "k-faq"})
			require.NoError(t, err)
			require.ElementsMatch(t, tc.wantIDs, knowledgeIDs(got))
		})
	}
}

func knowledgeIDs(rows []*types.Knowledge) []string {
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if row != nil {
			ids = append(ids, row.ID)
		}
	}
	return ids
}

var _ interfaces.KBShareService = (*fakeKBShareService)(nil)
