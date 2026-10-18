package firebilling

import (
	"context"
	"os"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

// Deployment-only, reversible pause. Saved agents, skill images and sandbox
// settings are deliberately untouched.
func UserExecutionPauseEnabled() bool {
	return Enabled() && strings.EqualFold(strings.TrimSpace(os.Getenv("FIRE_USER_EXECUTION_PAUSED")), "true")
}

func UserExecutionPaused(ctx context.Context) bool {
	if !UserExecutionPauseEnabled() || types.IsSystemAdminFromContext(ctx) {
		return false
	}
	if scope, ok := types.TenantAPIKeyScopeFromContext(ctx); ok && scope.IsPlatform() && scope.HasCapability(types.APIKeyCapabilitySystemTenantsManage) {
		return false
	}
	return true
}
