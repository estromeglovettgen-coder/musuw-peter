package handler

import (
	"context"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
)

// oidcNewIdentityDeniedProvisioning is intentionally not a valid tenant
// provisioning mode. LoginWithOIDC ignores the provisioning argument for an
// existing local user, while first-time identities eventually pass it to
// UserService.Register, which rejects invalid provisioning before creating a
// tenant or user. This lets invite_only block OIDC sign-up without blocking
// existing OIDC users and without duplicating registration business logic.
const oidcNewIdentityDeniedProvisioning types.TenantProvisioningMode = "__oidc_new_identity_denied__"

func (h *AuthHandler) resolveOIDCProvisioningMode(ctx context.Context) types.TenantProvisioningMode {
	if h.resolveRegistrationMode(ctx) == config.AuthRegistrationModeInviteOnly {
		return oidcNewIdentityDeniedProvisioning
	}
	return h.resolveDefaultTenantMode(ctx)
}
