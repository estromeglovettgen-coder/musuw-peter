package service

import (
	"context"
	"fmt"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type marketplaceWikiKBFixture struct {
	interfaces.KnowledgeBaseService
}

func (marketplaceWikiKBFixture) GetKnowledgeBaseByIDOnly(_ context.Context, id string) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{ID: id, TenantID: 99}, nil
}

// Real service/repository seam: owners retain drafts, subscribers only read published pages.
func TestMarketplaceWikiPublishedReads(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&types.WikiPage{}, &types.WikiFolder{}, &types.WikiPageIssue{}))
	repo := repository.NewWikiPageRepository(db)
	svc := NewWikiPageService(repo, nil, marketplaceWikiKBFixture{}, nil, nil)
	owner := context.Background()
	buyer := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(41))
	buyer = types.WithMarketplaceScope(buyer, 41, &types.MarketplaceAccess{
		ProductID: "product", SourceTenantID: 99,
		Agent:            &types.CustomAgent{ID: "agent", TenantID: 99},
		KnowledgeBaseIDs: []string{"approved"},
	})
	for _, p := range []*types.WikiPage{
		{
			ID:       "live",
			TenantID: 99, KnowledgeBaseID: "approved",
			Slug: "concept/live", Title: "Published",
			Status:   types.WikiPageStatusPublished,
			PageType: types.WikiPageTypeConcept,
			FolderID: "visible",
			OutLinks: types.StringArray{"concept/draft"},
			InLinks:  types.StringArray{"concept/draft"},
		},
		{
			ID:       "draft",
			TenantID: 99, KnowledgeBaseID: "approved",
			Slug: "concept/draft", Title: "Private draft",
			Status:   types.WikiPageStatusDraft,
			PageType: types.WikiPageTypeConcept,
			FolderID: "private",
		},
		{
			ID:       "archived",
			TenantID: 99, KnowledgeBaseID: "approved",
			Slug: "concept/archived", Title: "Archived",
			Status:   types.WikiPageStatusArchived,
			PageType: types.WikiPageTypeConcept,
		},
		{
			ID:       "other",
			TenantID: 99, KnowledgeBaseID: "other",
			Slug: "concept/other", Title: "Other library",
			Status:   types.WikiPageStatusPublished,
			PageType: types.WikiPageTypeConcept,
		},
	} {
		require.NoError(t, repo.Create(owner, p))
	}
	for _, id := range []string{"visible", "private", "empty"} {
		require.NoError(t, repo.CreateFolder(owner, &types.WikiFolder{
			ID:       id,
			TenantID: 99, KnowledgeBaseID: "approved", Name: id, Path: id, Depth: 1,
		}))
	}
	t.Run("owner still sees drafts", func(t *testing.T) {
		p, e := svc.GetPageBySlug(owner, "approved", "concept/draft")
		require.NoError(t, e)
		require.Equal(t, "Private draft", p.Title)
	})
	t.Run("published list and explicit draft filter", func(t *testing.T) {
		got, e := svc.ListPages(buyer, &types.WikiPageListRequest{KnowledgeBaseID: "approved"})
		require.NoError(t, e)
		require.EqualValues(t, 1, got.Total)
		require.Len(t, got.Pages, 1)
		require.Equal(t, "live", got.Pages[0].ID)
		got, e = svc.ListPages(buyer, &types.WikiPageListRequest{
			KnowledgeBaseID: "approved",
			Status:          types.WikiPageStatusDraft,
		})
		require.NoError(t, e)
		require.Empty(t, got.Pages)
	})
	t.Run("published page metadata omits private backlinks", func(t *testing.T) {
		page, e := svc.GetPageBySlug(buyer, "approved", "concept/live")
		require.NoError(t, e)
		require.Empty(t, page.InLinks)
		require.Empty(t, page.OutLinks)
		got, e := svc.ListPages(buyer, &types.WikiPageListRequest{KnowledgeBaseID: "approved"})
		require.NoError(t, e)
		require.Empty(t, got.Pages[0].InLinks)
		require.Empty(t, got.Pages[0].OutLinks)
	})
	t.Run("hidden and foreign pages denied", func(t *testing.T) {
		for _, slug := range []string{"concept/draft", "concept/archived"} {
			_, e := svc.GetPageBySlug(buyer, "approved", slug)
			require.ErrorIs(t, e, repository.ErrWikiPageNotFound)
		}
		_, e := svc.GetPageBySlug(buyer, "other", "concept/other")
		require.ErrorIs(t, e, repository.ErrWikiPageNotFound)
	})
	t.Run("graph and stats omit unpublished content", func(t *testing.T) {
		graph, e := svc.GetGraph(buyer, &types.WikiGraphRequest{KnowledgeBaseID: "approved", Limit: 100})
		require.NoError(t, e)
		require.Len(t, graph.Nodes, 1)
		require.Equal(t, "concept/live", graph.Nodes[0].Slug)
		require.Zero(t, graph.Nodes[0].LinkCount)
		stats, e := svc.GetStats(buyer, "approved")
		require.NoError(t, e)
		require.EqualValues(t, 1, stats.TotalPages)
		require.Len(t, stats.RecentUpdates, 1)
		require.Zero(t, stats.TotalLinks)
		require.EqualValues(t, 1, stats.OrphanCount)
	})
	t.Run("private and empty folders hidden", func(t *testing.T) {
		folders, e := svc.ListChildFolders(
			buyer, "approved", "", []string{types.WikiPageTypeConcept, types.WikiPageTypeSummary},
		)
		require.NoError(t, e)
		require.Len(t, folders, 1)
		require.Equal(t, "visible", folders[0].ID)
		require.EqualValues(t, 1, folders[0].PageCount)
	})
	t.Run("published links survive outside the current list page", func(t *testing.T) {
		tx := db.Begin()
		require.NoError(t, tx.Error)
		defer tx.Rollback()
		txRepo := repository.NewWikiPageRepository(tx)
		txSvc := NewWikiPageService(txRepo, nil, nil, nil, nil)
		require.NoError(t, txRepo.Create(owner, &types.WikiPage{
			ID:       "target",
			TenantID: 99, KnowledgeBaseID: "approved",
			Slug: "concept/target", Title: "Target public",
			Status:   types.WikiPageStatusPublished,
			PageType: types.WikiPageTypeConcept,
		}))
		page, e := txRepo.GetBySlug(owner, "approved", "concept/live")
		require.NoError(t, e)
		page.OutLinks = types.StringArray{"concept/target", "concept/draft"}
		require.NoError(t, txRepo.UpdateMeta(owner, page))
		got, e := txSvc.ListPages(buyer, &types.WikiPageListRequest{
			KnowledgeBaseID: "approved",
			PageSize:        1, SortBy: "title", SortOrder: "asc",
		})
		require.NoError(t, e)
		require.Len(t, got.Pages, 1)
		require.Equal(t, types.StringArray{"concept/target"}, got.Pages[0].OutLinks)
		one, e := txSvc.GetPageBySlug(buyer, "approved", "concept/live")
		require.NoError(t, e)
		require.Equal(t, types.StringArray{"concept/target"}, one.OutLinks)
	})
	t.Run("missing index is assembled without creating a source row", func(t *testing.T) {
		got, e := svc.GetIndexView(buyer, "approved", []string{types.WikiPageTypeConcept}, 1, "")
		require.NoError(t, e)
		require.Empty(t, got.Intro)
		require.Len(t, got.Groups, 1)
		require.EqualValues(t, 1, got.Groups[0].Total)
		require.Equal(t, "concept/live", got.Groups[0].Items[0].Slug)
		var count int64
		require.NoError(t, db.Model(&types.WikiPage{}).Where("slug = ?", "index").Count(&count).Error)
		require.Zero(t, count)
		_, e = svc.GetIndex(owner, "approved")
		require.NoError(t, e)
		require.NoError(t, db.Model(&types.WikiPage{}).Where("slug = ?", "index").Count(&count).Error)
		require.EqualValues(t, 1, count, "owned Wiki behavior is preserved")
	})
}
