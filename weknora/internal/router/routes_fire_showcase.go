package router

import (
	"net/http"
	"strings"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/gin-gonic/gin"
)

// The media cookie is deliberately accepted only by these read-only image
// routes. Native JWT verification, revocation and active-user checks still run.
func fireShowcaseMediaAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("Authorization") == "" {
			if c.GetHeader("Sec-Fetch-Site") == "cross-site" {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			if origin := c.GetHeader("Origin"); origin != "" && origin != "https://"+c.Request.Host && origin != "http://"+c.Request.Host {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			if token, err := c.Cookie(handler.FireShowcaseMediaCookie); err == nil && token != "" && !strings.ContainsAny(token, "\r\n") {
				c.Request.Header.Set("Authorization", "Bearer "+token)
			}
		}
		c.Next()
	}
}

func RegisterFireShowcasePublic(r *gin.Engine, h *handler.FireShowcaseHandler, auth gin.HandlerFunc) {
	if h == nil {
		return
	}
	r.GET("/tools/fire-showcase/*resource", h.Static)
	r.HEAD("/tools/fire-showcase/*resource", h.Static)
	r.POST("/internal/fire-showcase/images/:action", h.Internal)
	media := r.Group("/api/fire-showcase-assets")
	media.Use(fireShowcaseMediaAuth(), auth)
	media.GET("/:user_id/:asset_id/content", h.Asset)
	media.HEAD("/:user_id/:asset_id/content", h.Asset)
}

func RegisterFireShowcaseRoutes(r *gin.RouterGroup, h *handler.FireShowcaseHandler) {
	if h == nil {
		return
	}
	r.GET("/fire-showcase/bootstrap", h.Bootstrap)
	r.Any("/fire-showcase/api/*resource", h.Proxy)
}
