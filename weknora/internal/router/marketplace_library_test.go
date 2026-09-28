package router

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type marketplaceLibraryKBService struct {
	interfaces.KnowledgeBaseService
	repo       interfaces.KnowledgeBaseRepository
	seenTenant uint64
	seenUser   string
}

func (s *marketplaceLibraryKBService) GetKnowledgeBaseByID(
	ctx context.Context, id string,
) (*types.KnowledgeBase, error) {
	s.seenTenant, _ = types.TenantIDFromContext(ctx)
	s.seenUser, _ = types.UserIDFromContext(ctx)
	return s.repo.GetKnowledgeBaseByID(ctx, id)
}

func TestMarketplaceLibraryRoutesReuseWikiWithoutSourceIdentityOrWriteAccess(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.MarketplaceProduct{}, &types.MarketplaceSubscription{},
		&types.KnowledgeBase{}, &types.WikiPage{}, &types.WikiFolder{}, &types.WikiPageIssue{}))
	// Native migrations scope slugs to a KB; GORM's legacy tag alone does not.
	require.NoError(t, db.Exec("DROP INDEX idx_kb_slug").Error)
	require.NoError(t, db.Exec("CREATE UNIQUE INDEX idx_kb_slug ON wiki_pages(knowledge_base_id, slug)").Error)
	for _, id := range []string{"approved", "foreign"} {
		require.NoError(t, db.Create(&types.KnowledgeBase{
			ID: id, Name: id, TenantID: 99, IndexingStrategy: types.IndexingStrategy{WikiEnabled: true},
		}).Error)
	}
	require.NoError(t, db.Create(&types.MarketplaceProduct{
		ID: "product", Status: "unpublished", Title: "Paid library", MonthlyAmount: 100, YearlyAmount: 1000,
		PublishedTenantID: 99, PlatformAgentID: "platform-agent",
		PlatformKnowledgeBaseIDs: types.StringArray{"approved"}, KnowledgeBaseNames: types.StringArray{"Approved"},
		AgentSnapshot: types.CustomAgentConfig{SystemPrompt: "private system persona"},
	}).Error)
	now, future := time.Now().UTC(), time.Now().Add(time.Hour)
	require.NoError(t, db.Create(&types.MarketplaceSubscription{
		ID: "paid", TenantID: 7, UserID: "buyer", ProductID: "product", Status: "active",
		PaidThrough: &future, LastPaymentAt: &now, CancelAtPeriodEnd: true,
	}).Error)
	for _, page := range []*types.WikiPage{
		{
			ID: "published", TenantID: 99, KnowledgeBaseID: "approved", Slug: "concept/public", Title: "Visible",
			Status: "published", PageType: "concept", Content: "Published Wiki content",
			LastEditorID: "private-operator", PageMetadata: types.JSON(`{"prompt":"private metadata"}`),
			SourceRefs: types.StringArray{"private-document"},
			ChunkRefs:  types.StringArray{"private-chunk"},
		},
		{
			ID: "draft", TenantID: 99, KnowledgeBaseID: "approved", Slug: "concept/draft", Title: "Draft secret",
			Status: "draft", PageType: "concept", Content: "draft secret",
		},
		{
			ID: "foreign-page", TenantID: 99, KnowledgeBaseID: "foreign", Slug: "concept/public",
			Title:  "Foreign secret",
			Status: "published", PageType: "concept", Content: "foreign secret",
		},
	} {
		require.NoError(t, db.Create(page).Error)
	}
	kbRepo := repository.NewKnowledgeBaseRepository(db)
	kb := &marketplaceLibraryKBService{repo: kbRepo}
	market := service.NewMarketplaceService(repository.NewMarketplaceRepository(db), nil, kbRepo, nil, nil)
	wiki := service.NewWikiPageService(repository.NewWikiPageRepository(db), nil, kb, nil, nil)
	marketHandler := handler.NewMarketplaceHandler(market, nil, nil)
	wikiHandler := handler.NewWikiPageHandler(wiki, kb, nil, nil, nil)
	makeRouter := func(tenant uint64, user string) *gin.Engine {
		gin.SetMode(gin.TestMode)
		enabled := true
		guards := &rbacGuards{
			cfg:       &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}},
			kbService: kb, wikiKBCreator: wikiHandler.KBCreatorLookupFromKBPath,
		}
		r := gin.New()
		r.Use(middleware.ErrorHandler(), func(c *gin.Context) {
			ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant)
			ctx = context.WithValue(ctx, types.UserIDContextKey, user)
			ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleViewer)
			c.Request = c.Request.WithContext(ctx)
			c.Set(types.TenantIDContextKey.String(), tenant)
			c.Next()
		})
		v1 := r.Group("/api/v1")
		RegisterMarketplaceLibraryRoutes(v1, marketHandler, wikiHandler, guards)
		RegisterWikiPageRoutes(v1, wikiHandler, guards)
		return r
	}
	request := func(r *gin.Engine, method, path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader("{}")))
		return rec
	}
	paid := makeRouter(7, "buyer")
	base := "/api/v1/creator-marketplace/products/product/knowledge-bases/approved/wiki"
	t.Run("free chat does not grant subscribed Wiki reading", func(t *testing.T) {
		require.NoError(t, db.Create(&types.MarketplaceProduct{
			ID: "free", Status: "published", Title: "Free chat", PublishedTenantID: 99,
			PlatformAgentID: "free-agent", PlatformKnowledgeBaseIDs: types.StringArray{"approved"},
		}).Error)
		buyer := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
		buyer = context.WithValue(buyer, types.UserIDContextKey, "buyer")
		access, err := market.AuthorizeAccess(buyer, 7, "free", now)
		require.NoError(t, err, "free marketplace chat keeps its existing authorization")
		require.Empty(t, access.SubscriptionID)
		for _, suffix := range []string{
			"/pages", "/pages/concept/public", "/folders", "/index", "/graph", "/stats", "/search?q=Visible",
		} {
			rec := request(paid, http.MethodGet, strings.Replace(base, "/product/", "/free/", 1)+suffix)
			require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		}
	})
	t.Run("subscription without successful payment cannot read Wiki", func(t *testing.T) {
		require.NoError(t, db.Create(&types.MarketplaceProduct{
			ID: "unpaid-active", Status: "published", Title: "No payment", MonthlyAmount: 100, YearlyAmount: 1000,
			PublishedTenantID: 99, PlatformAgentID: "unpaid-agent",
			PlatformKnowledgeBaseIDs: types.StringArray{"approved"},
		}).Error)
		require.NoError(t, db.Create(&types.MarketplaceSubscription{
			ID: "unpaid-active", TenantID: 7, UserID: "buyer", ProductID: "unpaid-active",
			OperationKey: "unpaid-active",
			Status:       "active", PaidThrough: &future,
		}).Error)
		rec := request(paid, http.MethodGet,
			strings.Replace(base, "/product/", "/unpaid-active/", 1)+"/pages/concept/public")
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
	})
	// Native Search uses PostgreSQL regex operators; its successful read is
	// exercised by the staging PostgreSQL acceptance, not this SQLite fixture.
	for _, suffix := range []string{"/pages", "/pages/concept/public", "/folders", "/index", "/graph", "/stats"} {
		t.Run("paid "+suffix, func(t *testing.T) {
			rec := request(paid, http.MethodGet, base+suffix)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
			for _, private := range []string{
				"draft secret", "Draft secret", "private-operator", "private metadata",
				"private-document", "private-chunk", "private system persona", "tenant_id",
				"page_metadata", "last_editor_id",
			} {
				require.NotContains(t, rec.Body.String(), private)
			}
			require.Equal(t, uint64(7), kb.seenTenant)
			require.Equal(t, "buyer", kb.seenUser)
		})
	}
	for _, suffix := range []string{
		"/pages", "/pages/concept/public", "/folders", "/index", "/graph", "/stats", "/search?q=Visible",
	} {
		require.Equal(t, http.StatusForbidden, request(makeRouter(8, "stranger"), http.MethodGet, base+suffix).Code)
		require.Equal(t, http.StatusForbidden, request(paid, http.MethodGet,
			strings.Replace(base, "/approved/", "/foreign/", 1)+suffix).Code)
	}
	require.Equal(t, http.StatusForbidden, request(makeRouter(7, ""), http.MethodGet, base+"/pages").Code)
	require.Equal(t, http.StatusNotFound, request(paid, http.MethodGet, base+"/pages/concept/draft").Code)
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		for _, suffix := range []string{
			"/pages", "/pages/concept/public", "/folders", "/revert", "/auto-fix", "/rebuild-links",
		} {
			require.Equal(t, http.StatusNotFound, request(paid, method, base+suffix).Code)
		}
	}
	for _, suffix := range []string{"/issues", "/revisions/concept/public", "/lint"} {
		require.Equal(t, http.StatusNotFound, request(paid, http.MethodGet, base+suffix).Code)
	}
	// Marketplace authorization never becomes ordinary shared-KB permission.
	require.Equal(t, http.StatusForbidden, request(paid, http.MethodGet,
		"/api/v1/knowledgebase/approved/wiki/pages/concept/public").Code)
	require.Equal(t, http.StatusForbidden, request(paid, http.MethodPut,
		"/api/v1/knowledgebase/approved/wiki/pages/concept/public").Code)
	var before int64
	require.NoError(t, db.Model(&types.WikiPage{}).Count(&before).Error)
	require.Equal(t, int64(3), before, "index read must not create an index page")
	past := now.Add(-time.Hour)
	require.NoError(
		t,
		db.Model(&types.MarketplaceSubscription{}).Where("id = ?", "paid").Update("paid_through", past).Error,
	)
	require.Equal(t, http.StatusForbidden, request(paid, http.MethodGet, base+"/pages/concept/public").Code)
	listing := request(paid, http.MethodGet, "/api/v1/creator-marketplace/library")
	require.Equal(t, http.StatusOK, listing.Code)
	var result struct {
		Data []*types.MarketplaceLibraryEntry `json:"data"`
	}
	require.NoError(t, json.Unmarshal(listing.Body.Bytes(), &result))
	require.Len(t, result.Data, 1)
	require.False(t, result.Data[0].CanRead)
	require.Equal(t, "product", result.Data[0].ProductID)
}
