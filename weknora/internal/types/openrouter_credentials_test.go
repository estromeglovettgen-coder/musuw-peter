package types

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenRouterTenantCredentialsEncryptAtRestAndDecryptOnScan(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	cfg := &CredentialsConfig{
		WeKnoraCloud: &WeKnoraCloudCredentials{AppID: "app", AppSecret: "cloud-secret"},
		OpenRouter:   &OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"},
	}

	value, err := cfg.Value()
	require.NoError(t, err)
	raw, ok := value.([]byte)
	require.True(t, ok)
	assert.NotContains(t, string(raw), "sk-child")
	assert.NotContains(t, string(raw), "cloud-secret")
	assert.Contains(t, string(raw), "hash-7")

	var persisted map[string]any
	require.NoError(t, json.Unmarshal(raw, &persisted))
	provider := persisted["openrouter"].(map[string]any)
	assert.Contains(t, provider["api_key"], "enc:v1:")

	var loaded CredentialsConfig
	require.NoError(t, loaded.Scan(raw))
	require.NotNil(t, loaded.OpenRouter)
	assert.Equal(t, "sk-child", loaded.OpenRouter.APIKey)
	assert.Equal(t, "hash-7", loaded.OpenRouter.KeyHash)
	require.NotNil(t, loaded.WeKnoraCloud)
	assert.Equal(t, "cloud-secret", loaded.WeKnoraCloud.AppSecret)
}

func TestOpenRouterTenantCredentialsNeverAppearInResponseConfig(t *testing.T) {
	cfg := &CredentialsConfig{
		WeKnoraCloud: &WeKnoraCloudCredentials{AppID: "app", AppSecret: "cloud-secret"},
		OpenRouter:   &OpenRouterCredentials{APIKey: "sk-child", KeyHash: "hash-7"},
	}

	masked := CredentialsConfigForResponse(cfg, true)
	require.NotNil(t, masked)
	assert.Nil(t, masked.OpenRouter)
	assert.Equal(t, RedactedSecretPlaceholder, masked.WeKnoraCloud.AppSecret)

	privileged := CredentialsConfigForResponse(cfg, false)
	require.NotNil(t, privileged)
	assert.Nil(t, privileged.OpenRouter)
}
