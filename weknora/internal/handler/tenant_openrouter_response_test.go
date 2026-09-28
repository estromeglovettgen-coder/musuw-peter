package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type tenantCreateCredentialService struct {
	interfaces.TenantService
}

func (s *tenantCreateCredentialService) CreateTenant(_ context.Context, tenant *types.Tenant) (*types.Tenant, error) {
	tenant.ID = 77
	tenant.Status = "active"
	tenant.Credentials = &types.CredentialsConfig{
		OpenRouter: &types.OpenRouterCredentials{
			APIKey:  "sk-or-test-secret",
			KeyHash: "provider-hash-secret",
		},
	}
	return tenant, nil
}

func TestCreateTenantDoesNotSerializeOpenRouterCredentials(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &TenantHandler{
		service: &tenantCreateCredentialService{},
		userService: &tenantPolicyUserService{user: &types.User{
			ID:                  "system-admin",
			TenantID:            1,
			CanAccessAllTenants: true,
		}},
		config:           &config.Config{Tenant: &config.TenantConfig{}},
		systemSettingSvc: &tenantPolicySettingService{enabled: false},
	}

	r := gin.New()
	r.POST("/tenants", h.CreateTenant)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/tenants", bytes.NewBufferString(`{"name":"admin-created"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	for _, secret := range []string{"sk-or-test-secret", "provider-hash-secret", `"openrouter"`} {
		if strings.Contains(body, secret) {
			t.Fatalf("tenant create response leaked %q: %s", secret, body)
		}
	}
	if !strings.Contains(body, `"name":"admin-created"`) {
		t.Fatalf("tenant create response lost public tenant fields: %s", body)
	}
}
