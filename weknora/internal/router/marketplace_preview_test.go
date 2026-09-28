package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMarketplacePreviewRouteReturnsOnlyReviewedCatalogMetadata(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&types.MarketplaceProduct{}, &types.KnowledgeBase{}, &types.WikiPage{}, &types.WikiFolder{},
	))
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "kb", TenantID: 8, Name: "Library"}).Error)
	require.NoError(t, db.Create(&types.WikiPage{
		ID: "page", KnowledgeBaseID: "kb", TenantID: 8, Slug: "concept/one", Title: "Public title",
		PageType: "concept", Status: "published", Content: "PRIVATE_BODY",
	}).Error)
	require.NoError(t, db.Create(&types.MarketplaceProduct{
		ID: "product", Title: "Product", Status: "published", PublishedTenantID: 8,
		PlatformKnowledgeBaseIDs: types.StringArray{"kb"}, MonthlyAmount: 100,
		SampleConversations: []types.MarketplaceExample{{Question: "Question", Answer: "Reviewed final answer"}},
	}).Error)
	svc := service.NewMarketplaceService(repository.NewMarketplaceRepository(db), nil, nil, nil, nil)
	h := handler.NewMarketplaceHandler(svc, nil, nil)
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}
	makeRouter := func(signedIn bool) *gin.Engine {
		gin.SetMode(gin.TestMode)
		r := gin.New()
		r.Use(middleware.ErrorHandler(), func(c *gin.Context) {
			if signedIn {
				ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, uint64(7))
				ctx = context.WithValue(ctx, types.UserIDContextKey, "buyer")
				ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleViewer)
				c.Request = c.Request.WithContext(ctx)
			}
			c.Next()
		})
		RegisterMarketplaceRoutes(r.Group("/api/v1"), h, g)
		return r
	}
	path := "/api/v1/creator-marketplace/products/product/preview"
	request := func(signedIn bool, method, path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		makeRouter(signedIn).ServeHTTP(rec, httptest.NewRequest(method, path, nil))
		return rec
	}
	response := request(true, http.MethodGet, path)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	require.JSONEq(t, `{"data":{
		"directory":[{"id":"page","title":"Public title","path":["Library"],"page_type":"concept"}],
		"examples":[{"question":"Question","answer":"Reviewed final answer"}]
	}}`, response.Body.String())
	require.Equal(t, http.StatusForbidden, request(false, http.MethodGet, path).Code)
	require.Equal(t, http.StatusNotFound, request(true, http.MethodPost, path).Code)
	require.NoError(t, db.Model(&types.MarketplaceProduct{}).
		Where("id = ?", "product").Update("status", "unpublished").Error)
	require.Equal(t, http.StatusNotFound, request(true, http.MethodGet, path).Code)
}
