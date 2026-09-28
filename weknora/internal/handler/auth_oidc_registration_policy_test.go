package handler

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
)

func TestOIDCInviteOnlyUsesNonProvisioningMode(t *testing.T) {
	h := &AuthHandler{configInfo: &config.Config{Auth: &config.AuthConfig{
		RegistrationMode:  config.AuthRegistrationModeInviteOnly,
		DefaultTenantMode: config.AuthDefaultTenantModeCreatePersonal,
	}}}

	mode := h.resolveOIDCProvisioningMode(context.Background())
	if mode.IsValid() {
		t.Fatalf("invite_only must not pass a valid new-user provisioning mode, got %q", mode)
	}
}

func TestOIDCSelfServeKeepsConfiguredProvisioning(t *testing.T) {
	h := &AuthHandler{configInfo: &config.Config{Auth: &config.AuthConfig{
		RegistrationMode:  config.AuthRegistrationModeSelfServe,
		DefaultTenantMode: config.AuthDefaultTenantModeTenantless,
	}}}

	mode := h.resolveOIDCProvisioningMode(context.Background())
	if mode != types.TenantProvisioningTenantless {
		t.Fatalf("expected tenantless provisioning, got %q", mode)
	}
}
