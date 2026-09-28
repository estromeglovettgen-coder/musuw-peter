package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
)

// Observable seam: the authorization URL emitted by the native OIDC service.
// Supabase OAuth 2.1 accepts authorization-code requests only when they carry
// an S256 PKCE challenge.
func TestGetOIDCAuthorizationURLAddsS256PKCEParameters(t *testing.T) {
	withOIDCSSRFWhitelist(t, "127.0.0.1")

	provider := httptest.NewServer(http.NotFoundHandler())
	defer provider.Close()

	svc := &userService{config: &config.Config{OIDCAuth: &config.OIDCAuthConfig{
		Enable:                true,
		ProviderDisplayName:   "Supabase",
		ClientID:              "test-client",
		ClientSecret:          "test-secret",
		AuthorizationEndpoint: provider.URL + "/oauth/authorize",
		TokenEndpoint:         provider.URL + "/oauth/token",
		Scopes:                []string{"openid", "profile", "email"},
	}}}

	response, err := svc.GetOIDCAuthorizationURL(context.Background(), "https://app.example.com/api/v1/auth/oidc/callback")
	if err != nil {
		t.Fatalf("GetOIDCAuthorizationURL() error = %v", err)
	}

	authorizationURL, err := url.Parse(response.AuthorizationURL)
	if err != nil {
		t.Fatalf("parse authorization URL: %v", err)
	}
	query := authorizationURL.Query()
	if got := query.Get("code_challenge_method"); got != "S256" {
		t.Fatalf("code_challenge_method = %q, want S256", got)
	}
	if got := query.Get("code_challenge"); got == "" {
		t.Fatal("authorization URL omitted code_challenge")
	}
	if got := response.CodeVerifier; len(got) < 43 || len(got) > 128 {
		t.Fatalf("PKCE verifier length = %d, want RFC 7636 range [43,128]", len(got))
	}
	verifierHash := sha256.Sum256([]byte(response.CodeVerifier))
	wantChallenge := base64.RawURLEncoding.EncodeToString(verifierHash[:])
	if got := query.Get("code_challenge"); got != wantChallenge {
		t.Fatalf("code_challenge = %q, want S256(%q)", got, response.CodeVerifier)
	}
	if strings.Contains(response.AuthorizationURL, response.CodeVerifier) {
		t.Fatal("authorization URL leaked the PKCE verifier")
	}
}

// Observable seam: the native OIDC token request received by the provider.
// Supabase configured this client for client_secret_basic and requires the
// verifier that corresponds to the authorization URL's S256 challenge.
func TestOIDCTokenExchangeUsesBoundPKCEVerifierAndBasicAuth(t *testing.T) {
	withOIDCSSRFWhitelist(t, "127.0.0.1")

	const (
		clientID     = "test-client"
		clientSecret = "test-client-secret"
		codeVerifier = "0123456789abcdefghijklmnopqrstuvwxyz-ABCDE_ghi"
	)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := r.Method, http.MethodPost; got != want {
			t.Errorf("method = %s, want %s", got, want)
		}
		gotClientID, gotClientSecret, ok := r.BasicAuth()
		if !ok || gotClientID != clientID || gotClientSecret != clientSecret {
			t.Errorf("BasicAuth() = (%q, %q, %t), want configured client credentials", gotClientID, gotClientSecret, ok)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm: %v", err)
		}
		if got := r.Form.Get("code_verifier"); got != codeVerifier {
			t.Errorf("code_verifier = %q, want bound verifier", got)
		}
		if got := r.Form.Get("client_id"); got != "" {
			t.Errorf("client_id form field = %q, want omitted for client_secret_basic", got)
		}
		if got := r.Form.Get("client_secret"); got != "" {
			t.Errorf("client_secret form field must be omitted for client_secret_basic")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"provider-access-token"}`))
	}))
	defer provider.Close()

	svc := &userService{}
	response, err := svc.exchangeOIDCCode(
		context.Background(),
		&config.OIDCAuthConfig{TokenEndpoint: provider.URL, ClientID: clientID, ClientSecret: clientSecret},
		"authorization-code",
		"https://app.example.com/api/v1/auth/oidc/callback",
		codeVerifier,
	)
	if err != nil {
		t.Fatalf("exchangeOIDCCode() error = %v", err)
	}
	if response.AccessToken != "provider-access-token" {
		t.Fatalf("access token = %q, want provider response", response.AccessToken)
	}
}

func TestOIDCTokenExchangeRejectsMissingPKCEVerifier(t *testing.T) {
	svc := &userService{}
	_, err := svc.exchangeOIDCCode(
		context.Background(),
		&config.OIDCAuthConfig{TokenEndpoint: "https://idp.example/oauth/token", ClientID: "client", ClientSecret: "secret"},
		"authorization-code",
		"https://app.example.com/api/v1/auth/oidc/callback",
		"",
	)
	if err == nil || !strings.Contains(err.Error(), "code_verifier is required") {
		t.Fatalf("exchangeOIDCCode() error = %v, want missing verifier rejection", err)
	}
}
