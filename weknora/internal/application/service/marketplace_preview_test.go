package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

func TestMarketplacePreviewShowsOnlyPublishedBoundDirectoryAndCuratedAnswers(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	require.NoError(t, db.AutoMigrate(&types.WikiPage{}, &types.WikiFolder{}))
	for _, kb := range []types.KnowledgeBase{
		{ID: "published-kb", TenantID: 8, Name: "泰勒"},
		{ID: "other-kb", TenantID: 8, Name: "Private"},
	} {
		require.NoError(t, db.Create(&kb).Error)
	}
	require.NoError(t, db.Create(&types.WikiFolder{
		ID: "root", TenantID: 8, KnowledgeBaseID: "published-kb", Name: "真实分类",
	}).Error)
	require.NoError(t, db.Create(&types.WikiFolder{
		ID: "nested", TenantID: 8, KnowledgeBaseID: "published-kb", ParentID: "root", Name: "沟通",
	}).Error)
	for _, page := range []types.WikiPage{
		{
			ID: "page", TenantID: 8, KnowledgeBaseID: "published-kb", FolderID: "nested",
			Slug: "concept/communication", Title: "真实文章", PageType: "concept", Status: "published",
			Content: "PRIVATE_BODY", Summary: "PRIVATE_SUMMARY",
		},
		{
			ID: "draft", TenantID: 8, KnowledgeBaseID: "published-kb", Slug: "draft",
			Title: "HIDDEN_DRAFT", PageType: "concept", Status: "draft",
		},
		{
			ID: "foreign", TenantID: 9, KnowledgeBaseID: "published-kb", Slug: "foreign",
			Title: "HIDDEN_TENANT", PageType: "concept", Status: "published",
		},
		{
			ID: "unbound", TenantID: 8, KnowledgeBaseID: "other-kb", Slug: "other",
			Title: "HIDDEN_KB", PageType: "concept", Status: "published",
		},
		{
			ID: "index", TenantID: 8, KnowledgeBaseID: "published-kb", Slug: "index",
			Title: "HIDDEN_INDEX", PageType: "index", Status: "published",
		},
	} {
		require.NoError(t, db.Create(&page).Error)
	}
	p := &types.MarketplaceProduct{
		ID: "product", CreatorTenantID: 2, CreatorUserID: "creator", PublishedTenantID: 8,
		PlatformKnowledgeBaseIDs: types.StringArray{"published-kb"}, Title: "Taylor", Status: "published",
		SampleConversations: []types.MarketplaceExample{{Question: "真实问题", Answer: "精选最终回答"}},
	}
	require.NoError(t, db.Create(p).Error)
	svc := NewMarketplaceService(repository.NewMarketplaceRepository(db), nil, nil, nil, nil)
	preview, err := svc.Preview(marketplaceIdentity(7, "buyer", false), "product")
	require.NoError(t, err)
	require.Equal(t, []types.MarketplaceDirectoryEntry{{
		ID: "page", Title: "真实文章", Path: []string{"泰勒", "真实分类", "沟通"}, PageType: "concept",
	}}, preview.Directory)
	require.Equal(t, p.SampleConversations, preview.Examples)
	raw, err := json.Marshal(preview)
	require.NoError(t, err)
	for _, forbidden := range []string{
		"PRIVATE", "HIDDEN", "tenant_id", "summary", "source_refs", "session_id", "agent_steps",
	} {
		require.NotContains(t, string(raw), forbidden)
	}
	_, err = svc.Preview(context.Background(), "product")
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	canceled, cancel := context.WithCancel(marketplaceIdentity(7, "buyer", false))
	cancel()
	_, err = svc.Preview(canceled, "product")
	require.ErrorIs(t, err, context.Canceled)
	require.NoError(t, db.Delete(&types.WikiPage{}, "id = ?", "page").Error)
	preview, err = svc.Preview(marketplaceIdentity(7, "buyer", false), "product")
	require.NoError(t, err)
	require.Empty(t, preview.Directory)
	require.NoError(t, db.Model(p).Update("status", "unpublished").Error)
	_, err = svc.Preview(marketplaceIdentity(7, "buyer", false), "product")
	require.ErrorIs(t, err, types.ErrMarketplaceNotFound)
}

func TestMarketplacePreviewExamplesAreAdminCuratedAndNotInCatalog(t *testing.T) {
	db := marketplaceServiceTestDB(t)
	repo := repository.NewMarketplaceRepository(db)
	svc := NewMarketplaceService(repo, &marketplaceEntitlementStub{plan: types.ConsumerPlanMax},
		repository.NewKnowledgeBaseRepository(db), repository.NewCustomAgentRepository(db), nil)
	require.NoError(t, db.Create(&types.CustomAgent{ID: "agent", TenantID: 7, Name: "Agent"}).Error)
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "kb", TenantID: 7, Name: "KB"}).Error)
	examples := []types.MarketplaceExample{{Question: "  Real question  ", Answer: "**Final answer** only"}}
	input := types.MarketplaceProductInput{
		Title: "Product", Description: "Intro", AgentID: "agent", KnowledgeBaseIDs: []string{"kb"},
		MonthlyAmount: 100, SampleConversations: &examples,
	}
	_, err := svc.SaveProduct(marketplaceIdentity(7, "creator", false), "", input, false)
	require.ErrorIs(t, err, types.ErrMarketplaceForbidden)
	admin := marketplaceIdentity(7, "operator", true)
	product, err := svc.SaveProduct(admin, "", input, true)
	require.NoError(t, err)
	require.Equal(t, "Real question", product.SampleConversations[0].Question)
	input.SampleConversations = nil
	product, err = svc.SaveProduct(admin, product.ID, input, true)
	require.NoError(t, err)
	require.Len(t, product.SampleConversations, 1, "old admin forms preserve curated snapshots")
	stored, err := repo.GetProduct(admin, product.ID)
	require.NoError(t, err)
	require.Equal(t, product.SampleConversations, stored.SampleConversations)
	require.NoError(t, db.Model(product).Updates(map[string]any{"status": "published", "published_tenant_id": 7}).Error)
	listed, _, err := svc.ListProducts(
		marketplaceIdentity(7, "buyer", false), interfaces.MarketplaceCatalogQuery{}, false, false)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Nil(t, listed[0].SampleConversations)
	detail, err := svc.GetProduct(marketplaceIdentity(7, "buyer", false), product.ID)
	require.NoError(t, err)
	require.Nil(t, detail.SampleConversations)
	detail, err = svc.GetProduct(admin, product.ID)
	require.NoError(t, err)
	require.Len(t, detail.SampleConversations, 1)
	for _, invalid := range [][]types.MarketplaceExample{
		{{Question: "Question", Answer: ""}},
		{{Question: "Question", Answer: strings.Repeat("x", 16001)}},
		make([]types.MarketplaceExample, 7),
	} {
		input.SampleConversations = &invalid
		_, err := svc.SaveProduct(admin, product.ID, input, true)
		require.ErrorIs(t, err, types.ErrMarketplaceInvalid)
	}
	empty := []types.MarketplaceExample{}
	input.SampleConversations = &empty
	product, err = svc.SaveProduct(admin, product.ID, input, true)
	require.NoError(t, err)
	require.Empty(t, product.SampleConversations, "admin may explicitly clear published examples")
}
