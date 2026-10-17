package router

import (
	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"net/http"
)

func RegisterFireBillingRoutes(r *gin.RouterGroup, h *handler.FireBillingHandler, g *rbacGuards) {
	if h == nil {
		return
	}
	// Native auth is inherited; self-service never accepts a target user ID.
	r.GET("/fire/membership", h.Current)
	r.GET("/fire/usage", h.Usage)
	a := r.Group("/system/admin/fire")
	scope := apiKeyPlatform(types.APIKeyCapabilitySystemTenantsManage)
	g.apiKeyRoute(a, http.MethodGet, "/overview", scope, g.SystemAdmin(), h.Overview)
	g.apiKeyRoute(a, http.MethodGet, "/plans", scope, g.SystemAdmin(), h.Plans)
	g.apiKeyRoute(a, http.MethodPost, "/plans", scope, g.SystemAdmin(), h.SavePlan)
	g.apiKeyRoute(a, http.MethodPut, "/plans/:id", scope, g.SystemAdmin(), h.SavePlan)
	g.apiKeyRoute(a, http.MethodGet, "/users", scope, g.SystemAdmin(), h.Users)
	g.apiKeyRoute(a, http.MethodGet, "/users/:user_id", scope, g.SystemAdmin(), h.User)
	g.apiKeyRoute(a, http.MethodPost, "/users/:user_id/adjustments", scope, g.SystemAdmin(), h.Adjust)
}
