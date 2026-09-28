package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type routeListEmbedService struct {
	interfaces.EmbedChannelService
}

func (s *routeListEmbedService) LookupForEmbed(
	_ context.Context, channelID, token string,
) (*types.EmbedChannel, error) {
	return &types.EmbedChannel{
		ID:                 channelID,
		TenantID:           42,
		Enabled:            true,
		PublishToken:       token,
		AllowedOrigins:     types.JSON(`["https://musuw.com"]`),
		RateLimitPerMinute: 30,
		RateLimitPerDay:    100,
	}, nil
}

func (s *routeListEmbedService) IssueSessionToken(
	_ context.Context, _ string,
) (string, int, error) {
	return "ems_lite_test", 1800, nil
}

type routeListTenantService struct {
	interfaces.TenantService
}

func (s *routeListTenantService) GetTenantByID(
	_ context.Context, id uint64,
) (*types.Tenant, error) {
	return &types.Tenant{ID: id}, nil
}

func TestLiteRouterRegistersPublicEmbedRuntimeWithoutIMCallbacks(t *testing.T) {
	originalEdition := handler.Edition
	handler.Edition = "lite"
	t.Cleanup(func() { handler.Edition = originalEdition })

	embedService := &routeListEmbedService{}
	r := NewRouter(RouterParams{
		EmbedChannelHandler: handler.NewEmbedChannelHandler(embedService, nil, nil, nil, nil, nil, nil, nil),
		EmbedChannelService: embedService,
		TenantService:       &routeListTenantService{},
		SystemHandler:       &handler.SystemHandler{},
	})

	routes := make(map[string]bool)
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	for _, expected := range []string{
		"POST /api/v1/embed/:channel_id/exchange",
		"GET /api/v1/embed/:channel_id/config",
		"POST /api/v1/embed/:channel_id/sessions",
		"POST /api/v1/embed/:channel_id/agent-chat/:session_id",
	} {
		if !routes[expected] {
			t.Fatalf("Lite router missing public embed runtime route %q", expected)
		}
	}

	for _, hidden := range []string{
		"GET /api/v1/im/callback/:channel_id",
		"POST /api/v1/im/callback/:channel_id",
		"GET /r/:token",
		"HEAD /r/:token",
	} {
		if routes[hidden] {
			t.Fatalf("Lite router unexpectedly registered Standard-only route %q", hidden)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/embed/homepage/exchange", nil)
	req.Header.Set("Authorization", "Embed em_homepage")
	req.Header.Set("Origin", "https://musuw.com")
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("Lite public exchange status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"session_token":"ems_lite_test"`) {
		t.Fatalf("Lite public exchange did not return a short session token: %s", recorder.Body.String())
	}
}
