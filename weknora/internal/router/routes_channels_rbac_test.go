package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

func serveChannelGuard(t *testing.T, role types.TenantRole, apiKey bool, guard gin.HandlerFunc) int {
	t.Helper()
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		ctx := c.Request.Context()
		if role != "" {
			ctx = context.WithValue(ctx, types.TenantRoleContextKey, role)
		}
		if apiKey {
			ctx = types.WithTenantAPIKeyScope(ctx, types.TenantAPIKeyScope{
				Capabilities: types.StringArray{string(types.APIKeyCapabilityManageChannels)},
			})
		}
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	engine.GET("/protected", guard, func(c *gin.Context) { c.Status(http.StatusNoContent) })

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/protected", nil))
	return w.Code
}

func TestManageChannelsGuardAllowsEveryActiveTenantMember(t *testing.T) {
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}

	for _, role := range []types.TenantRole{
		types.TenantRoleViewer,
		types.TenantRoleContributor,
		types.TenantRoleAdmin,
		types.TenantRoleOwner,
	} {
		t.Run(string(role), func(t *testing.T) {
			if got := serveChannelGuard(t, role, false, g.ManageChannels()); got != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", got, http.StatusNoContent)
			}
		})
	}
}

func TestManageChannelsGuardRequiresRealMembership(t *testing.T) {
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}

	if got := serveChannelGuard(t, "", false, g.ManageChannels()); got != http.StatusForbidden {
		t.Fatalf("missing membership status = %d, want %d", got, http.StatusForbidden)
	}
}

func TestManageChannelsGuardKeepsAPIKeyAuthoritySeparate(t *testing.T) {
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}

	if got := serveChannelGuard(t, "", true, g.ManageChannels()); got != http.StatusNoContent {
		t.Fatalf("manage_channels API key status = %d, want %d", got, http.StatusNoContent)
	}
}

func TestManageChannelsDoesNotRelaxUnrelatedAdminSettings(t *testing.T) {
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}

	if got := serveChannelGuard(t, types.TenantRoleViewer, false, g.Admin()); got != http.StatusForbidden {
		t.Fatalf("viewer cleared unrelated Admin guard: status = %d, want %d", got, http.StatusForbidden)
	}
}

type channelDetailEmbedService struct {
	interfaces.EmbedChannelService
	calls int
}

func (s *channelDetailEmbedService) GetOwnedChannel(
	_ context.Context, tenantID uint64, id string,
) (*types.EmbedChannel, error) {
	s.calls++
	return &types.EmbedChannel{
		ID:           id,
		TenantID:     tenantID,
		AgentID:      "agent-1",
		Name:         "site",
		PublishToken: "emb_publish_secret",
	}, nil
}

func TestEmbedChannelDetailRequiresRealMembershipBeforeReturningPublishToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	enabled := true
	g := &rbacGuards{cfg: &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enabled}}}
	svc := &channelDetailEmbedService{}
	h := handler.NewEmbedChannelHandler(svc, nil, nil, nil, nil, nil, nil, nil)

	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, uint64(42))
		if rawRole := c.GetHeader("X-Test-Role"); rawRole != "" {
			ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRole(rawRole))
		}
		c.Set(types.TenantIDContextKey.String(), uint64(42))
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	RegisterEmbedChannelRoutes(engine.Group("/api/v1"), h, g)

	missingRole := httptest.NewRecorder()
	engine.ServeHTTP(missingRole, httptest.NewRequest(http.MethodGet, "/api/v1/embed-channels/ch-1", nil))
	if missingRole.Code != http.StatusForbidden {
		t.Fatalf("missing role status = %d, want 403", missingRole.Code)
	}
	if svc.calls != 0 {
		t.Fatalf("token-bearing handler ran %d time(s) without a valid membership", svc.calls)
	}

	viewerReq := httptest.NewRequest(http.MethodGet, "/api/v1/embed-channels/ch-1", nil)
	viewerReq.Header.Set("X-Test-Role", string(types.TenantRoleViewer))
	viewer := httptest.NewRecorder()
	engine.ServeHTTP(viewer, viewerReq)
	if viewer.Code != http.StatusOK {
		t.Fatalf("viewer channel manager status = %d, want 200; body=%s", viewer.Code, viewer.Body.String())
	}
	if !strings.Contains(viewer.Body.String(), "emb_publish_secret") {
		t.Fatalf("channel manager did not receive publish token: %s", viewer.Body.String())
	}
}
