package middleware

import "testing"

func TestSanitizeBody(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "camelCase apiKey",
			in:   `{"modelName":"gpt-5.2","apiKey":"sk-secret-123","provider":"azure_openai"}`,
			want: `{"modelName":"gpt-5.2","apiKey":"***","provider":"azure_openai"}`,
		},
		{
			name: "snake_case api_key",
			in:   `{"api_key":"sk-secret-123"}`,
			want: `{"api_key":"***"}`,
		},
		{
			name: "PascalCase APIKey",
			in:   `{"APIKey":"sk-secret-123"}`,
			want: `{"APIKey":"***"}`,
		},
		{
			name: "secretKey camelCase",
			in:   `{"secretKey":"abc","accessKeyId":"id"}`,
			want: `{"secretKey":"***","accessKeyId":"id"}`,
		},
		{
			name: "refreshToken / accessToken camelCase",
			in:   `{"refreshToken":"rt","accessToken":"at"}`,
			want: `{"refreshToken":"***","accessToken":"***"}`,
		},
		{
			name: "password and token preserved as masked",
			in:   `{"password":"p","token":"t"}`,
			want: `{"password":"***","token":"***"}`,
		},
		{
			name: "snake_case new_password and old_password",
			in:   `{"email":"alice@example.com","new_password":"FreshPass9","old_password":"OldPass9"}`,
			want: `{"email":"alice@example.com","new_password":"***","old_password":"***"}`,
		},
		{
			name: "extra whitespace around colon",
			in:   `{"apiKey"  :   "leak"}`,
			want: `{"apiKey":"***"}`,
		},
		{
			name: "non sensitive fields untouched",
			in:   `{"baseUrl":"https://example.com","modelName":"gpt"}`,
			want: `{"baseUrl":"https://example.com","modelName":"gpt"}`,
		},
		{
			name: "OAuth authorization response fields",
			in:   `{"authorization_url":"https://idp.example/authorize?state=secret","authorization_attempt":"secret-state"}`,
			want: `{"authorization_url":"***","authorization_attempt":"***"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := sanitizeBody(tc.in)
			if got != tc.want {
				t.Errorf("sanitizeBody(%q)\n got: %s\nwant: %s", tc.in, got, tc.want)
			}
		})
	}
}

func TestSanitizeQuery(t *testing.T) {
	got := sanitizeQuery("code=secret-code&state=secret-state&next=%2Fsettings&state=second")
	want := "code=%2A%2A%2A&next=%2Fsettings&state=%2A%2A%2A"
	if got != want {
		t.Fatalf("sanitizeQuery() = %q, want %q", got, want)
	}
}

func TestShouldLogBodies(t *testing.T) {
	if shouldLogBodies("/api/v1/client-diagnostics") {
		t.Fatal("diagnostic input must only be read by the bounded handler")
	}
	if shouldLogBodies("/api/v1/auth/oidc/callback") {
		t.Fatal("authentication request and response bodies must not be logged")
	}
	if shouldLogBodies("/api/v1/billing/paddle/webhook") {
		t.Fatal("payment webhook request and response bodies must not be logged")
	}
	for _, path := range []string{
		"/api/v1/knowledge-bases/kb-1/shares",
		"/api/v1/agents/agent-1/shares/share-1",
		"/api/v1/organizations/org-1/invite",
		"/api/v1/organizations/org-1/shared-agents",
	} {
		if shouldLogBodies(path) {
			t.Fatalf("sharing/invitation body at %s must not be logged", path)
		}
	}
	if !shouldLogBodies("/api/v1/knowledge-bases") {
		t.Fatal("failed ordinary API bodies should remain observable")
	}
	if shouldLogBodies("/api/v1/knowledge-bases/kb-1/knowledge/url") {
		t.Fatal("URL/share-text import bodies must not be copied into access logs")
	}
}

func TestShouldLogBodyPayload(t *testing.T) {
	if shouldLogBodyPayload("/api/v1/agents/builtin-smart-reasoning", 200) {
		t.Fatal("successful response bodies must not be copied into access logs")
	}
	if !shouldLogBodyPayload("/api/v1/agents/builtin-smart-reasoning", 500) {
		t.Fatal("failed ordinary API bodies should remain observable")
	}
	if shouldLogBodyPayload("/api/v1/auth/oidc/callback", 500) {
		t.Fatal("authentication bodies must stay omitted even on failure")
	}
	if shouldLogBodyPayload("/api/v1/billing/paddle/webhook", 500) {
		t.Fatal("payment webhook bodies must stay omitted even on failure")
	}
	if shouldLogBodyPayload("/api/v1/knowledge-bases/kb-1/shares", 500) {
		t.Fatal("share bodies must stay omitted even on failure")
	}
	if shouldLogBodyPayload("/api/v1/knowledge-bases/kb-1/knowledge/url", 400) {
		t.Fatal("URL/share-text import bodies must stay omitted even on failure")
	}
}
