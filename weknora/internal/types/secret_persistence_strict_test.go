package types

import (
	"strings"
	"testing"
)

func TestSecretPersistenceFailsClosedWithoutAESKey(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "")

	cases := []struct {
		name  string
		value func() error
	}{
		{
			name: "tenant openrouter credential",
			value: func() error {
				_, err := (&CredentialsConfig{OpenRouter: &OpenRouterCredentials{APIKey: "sk-or-secret", KeyHash: "hash"}}).Value()
				return err
			},
		},
		{
			name: "tenant weknoracloud credential",
			value: func() error {
				_, err := (&CredentialsConfig{WeKnoraCloud: &WeKnoraCloudCredentials{AppID: "app", AppSecret: "cloud-secret"}}).Value()
				return err
			},
		},
		{
			name: "tenant api principal hmac",
			value: func() error {
				_, err := (&APIPrincipalConfig{Mode: APIPrincipalModeSignedToken, HMACSecret: "hmac-secret"}).Value()
				return err
			},
		},
		{
			name: "model api key",
			value: func() error {
				_, err := (ModelParameters{APIKey: "model-secret"}).Value()
				return err
			},
		},
		{
			name: "data source credential",
			value: func() error {
				_, err := (&DataSourceConfig{Credentials: map[string]interface{}{"token": "data-source-secret"}}).ToJSON()
				return err
			},
		},
		{
			name: "mcp auth credential",
			value: func() error {
				_, err := (&MCPAuthConfig{Token: "mcp-secret"}).Value()
				return err
			},
		},
		{
			name: "mcp oauth client secret",
			value: func() error {
				return (&MCPOAuthClient{ClientSecret: "oauth-secret"}).BeforeSave(nil)
			},
		},
		{
			name: "mcp oauth token",
			value: func() error {
				return (&MCPOAuthToken{AccessToken: "access-secret"}).BeforeSave(nil)
			},
		},
		{
			name: "storage backend credential",
			value: func() error {
				_, err := (StorageBackendConfig{SecretAccessKey: "storage-secret"}).Value()
				return err
			},
		},
		{
			name: "vector store credential",
			value: func() error {
				_, err := (ConnectionConfig{Password: "vector-secret"}).Value()
				return err
			},
		},
		{
			name: "web search credential",
			value: func() error {
				_, err := (WebSearchProviderParameters{APIKey: "search-secret"}).Value()
				return err
			},
		},
		{
			name: "tenant api key",
			value: func() error {
				return (&TenantAPIKey{APIKey: "tenant-secret"}).BeforeSave(nil)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.value(); err == nil {
				t.Fatal("expected persistence to fail when SYSTEM_AES_KEY is unavailable")
			}
		})
	}
}

func TestSecretPersistenceEncryptsBeforeJSONBWrite(t *testing.T) {
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")

	value, err := (&CredentialsConfig{OpenRouter: &OpenRouterCredentials{
		APIKey:  "sk-or-secret",
		KeyHash: "provider-hash",
	}}).Value()
	if err != nil {
		t.Fatalf("Value returned error: %v", err)
	}
	stored, ok := value.([]byte)
	if !ok {
		t.Fatalf("unexpected driver value type %T", value)
	}
	body := string(stored)
	if strings.Contains(body, "sk-or-secret") {
		t.Fatalf("plaintext OpenRouter key reached JSONB: %s", body)
	}
	if !strings.Contains(body, "enc:v1:") {
		t.Fatalf("expected encrypted storage marker, got: %s", body)
	}
}
