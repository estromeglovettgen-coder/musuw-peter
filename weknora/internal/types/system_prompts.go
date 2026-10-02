package types

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
)

// SystemPromptConfig stores only workspace-authored overrides, never shared defaults.
type SystemPromptConfig map[string]string

func (c SystemPromptConfig) Value() (driver.Value, error) { return json.Marshal(c) }
func (c *SystemPromptConfig) Scan(value interface{}) error {
	if value == nil {
		*c = SystemPromptConfig{}
		return nil
	}
	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, c)
	case string:
		return json.Unmarshal([]byte(v), c)
	default:
		return fmt.Errorf("invalid system prompt configuration %T", value)
	}
}

// ResolveSystemPrompt reads the owning workspace's request/task snapshot.
// Missing overrides leave the default untouched; shared process config is immutable.
func ResolveSystemPrompt(ctx context.Context, id, fallback string) string {
	tenant, ok := TenantInfoFromContext(ctx)
	if !ok || tenant == nil {
		return fallback
	}
	tenantID, hasID := TenantIDFromContext(ctx)
	if hasID && tenantID != tenant.ID {
		return fallback
	}
	if value := strings.TrimSpace(tenant.SystemPromptConfig[id]); value != "" {
		return value
	}
	return fallback
}
