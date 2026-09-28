package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
)

type oidcPKCEUserServiceStub struct {
	interfaces.UserService
	authorizationResponse *types.OIDCAuthURLResponse
}

type oidcCallbackUserServiceStub struct {
	interfaces.UserService
	loginCalls   int
	code         string
	redirectURI  string
	codeVerifier string
}

type oidcFailureUserServiceStub struct {
	interfaces.UserService
	err error
}

func (s *oidcFailureUserServiceStub) LoginWithOIDC(
	context.Context,
	string, string, string,
	types.TenantProvisioningMode,
) (*types.OIDCCallbackResponse, error) {
	return nil, s.err
}

func (s *oidcCallbackUserServiceStub) LoginWithOIDC(
	_ context.Context,
	code, redirectURI, codeVerifier string,
	_ types.TenantProvisioningMode,
) (*types.OIDCCallbackResponse, error) {
	s.loginCalls++
	s.code = code
	s.redirectURI = redirectURI
	s.codeVerifier = codeVerifier
	// A deliberately unsuccessful response prevents the test from needing a
	// complete user/tenant fixture while still proving that the handler reached
	// the native service with the bound verifier.
	return &types.OIDCCallbackResponse{Success: false, Message: "stub"}, nil
}

func (s *oidcPKCEUserServiceStub) GetOIDCAuthorizationURL(context.Context, string) (*types.OIDCAuthURLResponse, error) {
	return s.authorizationResponse, nil
}

// Observable seam: GET /auth/oidc/url. The verifier must stay out of the JSON
// response and be paired with the state nonce in a browser-only HttpOnly cookie.
func TestOIDCAuthorizationURLBindsVerifierOutsideJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &AuthHandler{userService: &oidcPKCEUserServiceStub{
		authorizationResponse: &types.OIDCAuthURLResponse{
			Success:          true,
			AuthorizationURL: "https://idp.example/oauth/authorize?state=signed-state",
			State:            "signed-state",
			Nonce:            "nonce-for-browser-binding",
			CodeVerifier:     "pkce-verifier-must-never-be-in-the-json-body",
		},
	}}
	router := gin.New()
	router.GET("/auth/oidc/url", handler.GetOIDCAuthorizationURL)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/auth/oidc/url?redirect_uri=https://app.example.com/api/v1/auth/oidc/callback", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "pkce-verifier-must-never-be-in-the-json-body") {
		t.Fatal("OIDC authorization response leaked the PKCE verifier")
	}

	var binding *http.Cookie
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == "weknora_oidc_binding" {
			binding = cookie
			break
		}
	}
	if binding == nil {
		t.Fatal("OIDC authorization response omitted browser binding cookie")
	}
	if !binding.HttpOnly {
		t.Fatal("OIDC browser binding cookie must be HttpOnly")
	}
	if !binding.Secure {
		t.Fatal("OIDC browser binding cookie must be Secure behind HTTPS")
	}
	if binding.SameSite != http.SameSiteLaxMode {
		t.Fatalf("OIDC browser binding SameSite = %v, want Lax", binding.SameSite)
	}
	if binding.Value == "nonce-for-browser-binding" || strings.Contains(binding.Value, "pkce-verifier-must-never-be-in-the-json-body") {
		t.Fatal("OIDC browser binding must be opaque rather than exposing a raw nonce or verifier")
	}
}

func TestOIDCRedirectCallbackPassesBoundVerifierAndConsumesBinding(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const (
		nonce        = "nonce-bound-to-this-browser"
		codeVerifier = "0123456789abcdefghijklmnopqrstuvwxyz-ABCDE_ghi"
		redirectURI  = "https://app.example.com/api/v1/auth/oidc/callback"
	)
	state, err := secutils.SignOIDCState(&secutils.OIDCStatePayload{
		Nonce:       nonce,
		RedirectURI: redirectURI,
		IssuedAt:    time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("SignOIDCState() error = %v", err)
	}
	binding, err := encodeOIDCBrowserBinding(nonce, codeVerifier)
	if err != nil {
		t.Fatalf("encodeOIDCBrowserBinding() error = %v", err)
	}

	service := &oidcCallbackUserServiceStub{}
	handler := &AuthHandler{userService: service}
	router := gin.New()
	router.GET("/auth/oidc/callback", handler.OIDCRedirectCallback)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/auth/oidc/callback?code=provider-code&state="+state, nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	request.AddCookie(&http.Cookie{Name: oidcBindingCookieName, Value: binding})
	router.ServeHTTP(recorder, request)

	if service.loginCalls != 1 {
		t.Fatalf("LoginWithOIDC calls = %d, want 1", service.loginCalls)
	}
	if service.code != "provider-code" || service.redirectURI != redirectURI || service.codeVerifier != codeVerifier {
		t.Fatalf("LoginWithOIDC args = (%q, %q, %q), want provider code, redirect URI, and bound verifier", service.code, service.redirectURI, service.codeVerifier)
	}
	if !hasExpiredOIDCBindingCookie(recorder.Result().Cookies()) {
		t.Fatal("successful state validation must consume the one-time browser binding")
	}
	if location := recorder.Header().Get("Location"); strings.Contains(location, "oidc_error_description") || strings.Contains(location, "stub") {
		t.Fatalf("unsuccessful native callback leaked service detail: %q", location)
	}

	// A sequential replay has the returned state/code but no consumed binding
	// cookie, so it must fail before the native login service is called again.
	replayRecorder := httptest.NewRecorder()
	replayRequest := httptest.NewRequest(http.MethodGet, "/auth/oidc/callback?code=provider-code&state="+state, nil)
	router.ServeHTTP(replayRecorder, replayRequest)
	if service.loginCalls != 1 {
		t.Fatalf("replay called LoginWithOIDC %d times, want no second call", service.loginCalls)
	}
	if location := replayRecorder.Header().Get("Location"); !strings.Contains(location, "oidc_error=invalid_state") {
		t.Fatalf("replay redirect = %q, want invalid_state", location)
	}
}

func TestOIDCRedirectCallbackRejectsMismatchedBrowserBinding(t *testing.T) {
	gin.SetMode(gin.TestMode)
	state, err := secutils.SignOIDCState(&secutils.OIDCStatePayload{
		Nonce:       "nonce-expected-by-state",
		RedirectURI: "https://app.example.com/api/v1/auth/oidc/callback",
		IssuedAt:    time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("SignOIDCState() error = %v", err)
	}
	binding, err := encodeOIDCBrowserBinding("different-browser-nonce", "0123456789abcdefghijklmnopqrstuvwxyz-ABCDE_ghi")
	if err != nil {
		t.Fatalf("encodeOIDCBrowserBinding() error = %v", err)
	}

	service := &oidcCallbackUserServiceStub{}
	handler := &AuthHandler{userService: service}
	router := gin.New()
	router.GET("/auth/oidc/callback", handler.OIDCRedirectCallback)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/auth/oidc/callback?code=provider-code&state="+state, nil)
	request.AddCookie(&http.Cookie{Name: oidcBindingCookieName, Value: binding})
	router.ServeHTTP(recorder, request)

	if service.loginCalls != 0 {
		t.Fatalf("mismatched binding called LoginWithOIDC %d times, want 0", service.loginCalls)
	}
	if location := recorder.Header().Get("Location"); !strings.Contains(location, "oidc_error=invalid_state") {
		t.Fatalf("mismatched binding redirect = %q, want invalid_state", location)
	}
}

func TestOIDCRedirectCallbackDoesNotExposeServiceFailureInBrowserFragment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const (
		nonce        = "nonce-bound-to-this-browser"
		codeVerifier = "0123456789abcdefghijklmnopqrstuvwxyz-ABCDE_ghi"
		redirectURI  = "https://app.example.com/api/v1/auth/oidc/callback"
		internalErr  = "failed to connect to user=weknora database=WeKnora: database system is in recovery mode"
	)
	state, err := secutils.SignOIDCState(&secutils.OIDCStatePayload{
		Nonce:       nonce,
		RedirectURI: redirectURI,
		IssuedAt:    time.Now().Unix(),
	})
	if err != nil {
		t.Fatalf("SignOIDCState() error = %v", err)
	}
	binding, err := encodeOIDCBrowserBinding(nonce, codeVerifier)
	if err != nil {
		t.Fatalf("encodeOIDCBrowserBinding() error = %v", err)
	}

	handler := &AuthHandler{userService: &oidcFailureUserServiceStub{err: errors.New(internalErr)}}
	router := gin.New()
	router.GET("/auth/oidc/callback", handler.OIDCRedirectCallback)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/auth/oidc/callback?code=provider-code&state="+state, nil)
	request.AddCookie(&http.Cookie{Name: oidcBindingCookieName, Value: binding})
	router.ServeHTTP(recorder, request)

	location := recorder.Header().Get("Location")
	if !strings.Contains(location, "oidc_error=login_failed") {
		t.Fatalf("redirect = %q, want login_failed", location)
	}
	if strings.Contains(location, "oidc_error_description") || strings.Contains(location, "database") {
		t.Fatalf("redirect leaked backend failure details: %q", location)
	}
}

func TestOIDCRedirectCallbackDoesNotForwardProviderErrorDescription(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &AuthHandler{}
	router := gin.New()
	router.GET("/auth/oidc/callback", handler.OIDCRedirectCallback)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet,
		"/auth/oidc/callback?error=access_denied&error_description=identity-provider-internal-detail", nil)
	router.ServeHTTP(recorder, request)

	location := recorder.Header().Get("Location")
	if !strings.Contains(location, "oidc_error=access_denied") {
		t.Fatalf("redirect = %q, want provider error code", location)
	}
	if strings.Contains(location, "oidc_error_description") || strings.Contains(location, "identity-provider-internal-detail") {
		t.Fatalf("redirect leaked provider failure details: %q", location)
	}
}

func hasExpiredOIDCBindingCookie(cookies []*http.Cookie) bool {
	for _, cookie := range cookies {
		if cookie.Name == oidcBindingCookieName && cookie.MaxAge < 0 && cookie.Value == "" && cookie.Secure && cookie.HttpOnly {
			return true
		}
	}
	return false
}
