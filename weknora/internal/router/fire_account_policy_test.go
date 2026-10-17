package router

import (
	"net/http"
	"testing"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

func TestFireAccountCreateRequiresExactPlatformManageCapability(t *testing.T) {
	gin.SetMode(gin.TestMode)
	g := &rbacGuards{}
	RegisterSystemAdminRoutes(gin.New().Group("/api/v1"), &handler.SystemHandler{}, nil, nil, g)
	policy, ok := g.apiKeyAuthorizer.Lookup(http.MethodPost, "/api/v1/system/admin/users/create")
	if !ok || !policy.PlatformOnly || !policyHasCapability(policy, types.APIKeyCapabilitySystemTenantsManage) {
		t.Fatalf("missing platform provisioning boundary: %#v", policy)
	}
	if policyHasCapability(policy, types.APIKeyCapabilitySystemTenantsRead) || policyHasCapability(policy, types.APIKeyCapabilityManageTenantSettings) {
		t.Fatalf("read/tenant permissions must not create identities: %#v", policy)
	}
}
