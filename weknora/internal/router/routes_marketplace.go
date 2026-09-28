package router

import (
	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/gin-gonic/gin"
)

// RegisterMarketplaceRoutes binds purchases to the authenticated workspace. API
// keys are intentionally undeclared and denied by the existing API-key gate.
func RegisterMarketplaceRoutes(r *gin.RouterGroup, h *handler.MarketplaceHandler, g *rbacGuards) {
	market := r.Group("/creator-marketplace")
	market.GET("/products", g.Viewer(), h.ListProducts)
	market.GET("/products/:id", g.Viewer(), h.GetProduct)
	market.GET("/products/:id/preview", g.Viewer(), h.Preview)
	market.GET("/orders", g.Admin(), h.Orders)
	market.POST("/products/:id/checkout", g.Admin(), h.Checkout)
	market.POST("/subscriptions/:id/portal", g.Admin(), h.Portal)

	creator := market.Group("/creator/products", g.Admin())
	creator.GET("", h.ListCreatorProducts)
	creator.POST("", h.CreateCreatorProduct)
	creator.PUT("/:id", h.UpdateCreatorProduct)
	creator.POST("/:id/submit", h.SubmitProduct)

	admin := r.Group("/system/creator-marketplace/products", g.SystemAdmin())
	admin.GET("", h.ListAdminProducts)
	admin.PUT("/:id", h.UpdateAdminProduct)
	admin.POST("/:id/review", h.ReviewProduct)
}

// RegisterMarketplaceLibraryRoutes reuses native Wiki reads behind the current
// product entitlement. No source-management, attachment or mutation aliases exist.
func RegisterMarketplaceLibraryRoutes(
	r *gin.RouterGroup,
	h *handler.MarketplaceHandler,
	wiki *handler.WikiPageHandler,
	g *rbacGuards,
) {
	market := r.Group("/creator-marketplace", g.Viewer())
	market.GET("/library", h.Library)
	read := market.Group("/products/:id/knowledge-bases/:kb_id/wiki", h.AuthorizeLibraryKnowledgeBase)
	read.GET("/pages", wiki.ListPages)
	read.GET("/pages/*slug", wiki.GetPage)
	read.GET("/folders", wiki.ListFolders)
	read.GET("/index", wiki.GetIndex)
	read.GET("/graph", wiki.GetGraph)
	read.GET("/stats", wiki.GetStats)
	read.GET("/search", wiki.SearchPages)
}
