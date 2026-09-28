package handler

import (
	"context"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

const (
	tenantSelfServiceCreationSettingKey = "tenant.self_service_creation_enabled"
	tenantSelfServiceCreationEnvName    = "WEKNORA_TENANT_SELF_SERVICE_CREATION_ENABLED"
)

// resolveTenantSelfServiceCreationEnabled is the shared policy resolver used
// both by POST /tenants enforcement and /auth/me capability projection. Musuw
// defaults this capability to disabled for ordinary C-end users so hiding the
// workspace-create UI is backed by an authoritative server-side deny. A
// SystemAdmin/runtime setting or environment override can explicitly opt back
// in; platform catalog managers are handled separately by CreateTenant.
func resolveTenantSelfServiceCreationEnabled(
	ctx context.Context,
	_ *config.Config,
	settings interfaces.SystemSettingService,
) bool {
	if settings == nil {
		return false
	}
	return settings.GetBool(
		ctx,
		tenantSelfServiceCreationSettingKey,
		tenantSelfServiceCreationEnvName,
		false,
	)
}
