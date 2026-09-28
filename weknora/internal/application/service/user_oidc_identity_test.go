package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
)

// oidcIdentityUserRepo keeps the auth test repository deliberately small while
// making Register/UpdateUser observable for the first-bind and provisioning
// paths. The embedded repository supplies the unrelated interface methods.
type oidcIdentityUserRepo struct {
	*stubUserRepoForAuth
	byEmail    map[string]*types.User
	byUsername map[string]*types.User
	updateErr  error
}

func newOIDCIdentityUserRepo() *oidcIdentityUserRepo {
	return &oidcIdentityUserRepo{
		stubUserRepoForAuth: &stubUserRepoForAuth{users: map[string]*types.User{}},
		byEmail:             map[string]*types.User{},
		byUsername:          map[string]*types.User{},
	}
}

func (r *oidcIdentityUserRepo) CreateUser(_ context.Context, user *types.User) error {
	r.users[user.ID] = user
	r.byEmail[strings.ToLower(user.Email)] = user
	r.byUsername[strings.ToLower(user.Username)] = user
	return nil
}

func (r *oidcIdentityUserRepo) GetUserByEmail(_ context.Context, email string) (*types.User, error) {
	user, ok := r.byEmail[strings.ToLower(strings.TrimSpace(email))]
	if !ok {
		return nil, apprepo.ErrUserNotFound
	}
	return user, nil
}

func (r *oidcIdentityUserRepo) GetUserByUsername(_ context.Context, username string) (*types.User, error) {
	user, ok := r.byUsername[strings.ToLower(strings.TrimSpace(username))]
	if !ok {
		return nil, apprepo.ErrUserNotFound
	}
	return user, nil
}

func (r *oidcIdentityUserRepo) UpdateUser(_ context.Context, user *types.User) error {
	r.updateCalls++
	if r.updateErr != nil {
		return r.updateErr
	}
	r.users[user.ID] = user
	r.byEmail[strings.ToLower(user.Email)] = user
	r.byUsername[strings.ToLower(user.Username)] = user
	return nil
}

func newOIDCIdentityProvider(t *testing.T, subject, email string) (*userService, *oidcIdentityUserRepo, func()) {
	t.Helper()
	withOIDCSSRFWhitelist(t, "127.0.0.1")

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "provider-access-token"})
		case "/userinfo":
			if r.Method != http.MethodGet {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"sub":   subject,
				"email": email,
				"name":  "Alice",
			})
		default:
			http.NotFound(w, r)
		}
	}))

	repo := newOIDCIdentityUserRepo()
	svc := &userService{
		userRepo:  repo,
		tokenRepo: &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}},
		config: &config.Config{OIDCAuth: &config.OIDCAuthConfig{
			Enable:                true,
			IssuerURL:             provider.URL + "/auth/v1",
			ClientID:              "test-client",
			ClientSecret:          "test-client-secret",
			AuthorizationEndpoint: provider.URL + "/authorize",
			TokenEndpoint:         provider.URL + "/token",
			UserInfoEndpoint:      provider.URL + "/userinfo",
			UserInfoMapping:       &config.OIDCUserInfoMapping{Username: "name", Email: "email"},
		}},
	}
	return svc, repo, provider.Close
}

func TestOIDCLoginBindsFirstIdentityToVerifiedSubject(t *testing.T) {
	const email = "alice@example.com"
	svc, repo, closeProvider := newOIDCIdentityProvider(t, "subject-1", email)
	defer closeProvider()

	user := &types.User{ID: "user-1", Username: "alice", Email: email, IsActive: true}
	repo.users[user.ID] = user
	repo.byEmail[email] = user
	repo.byUsername[user.Username] = user

	response, err := svc.LoginWithOIDC(context.Background(), "authorization-code", "https://app.example/callback", "test-code-verifier-0123456789abcdefghijklmnopqrstuvwxyz", types.TenantProvisioningTenantless)
	if err != nil {
		t.Fatalf("LoginWithOIDC() error = %v", err)
	}
	if !response.Success || response.User != user {
		t.Fatalf("LoginWithOIDC() response = %#v, want successful response for existing user", response)
	}
	if user.IdentityProvider != "supabase" || user.IdentitySubject != "subject-1" {
		t.Fatalf("bound identity = (%q, %q), want (supabase, subject-1)", user.IdentityProvider, user.IdentitySubject)
	}
	if repo.updateCalls != 1 {
		t.Fatalf("UpdateUser calls = %d, want exactly one first-bind write", repo.updateCalls)
	}
}

func TestOIDCLoginRejectsMismatchedSubjectWithoutRelinking(t *testing.T) {
	const email = "alice@example.com"
	svc, repo, closeProvider := newOIDCIdentityProvider(t, "subject-new", email)
	defer closeProvider()

	user := &types.User{
		ID:               "user-1",
		Username:         "alice",
		Email:            email,
		IsActive:         true,
		IdentityProvider: "supabase",
		IdentitySubject:  "subject-old",
	}
	repo.users[user.ID] = user
	repo.byEmail[email] = user
	repo.byUsername[user.Username] = user

	_, err := svc.LoginWithOIDC(context.Background(), "authorization-code", "https://app.example/callback", "test-code-verifier-0123456789abcdefghijklmnopqrstuvwxyz", types.TenantProvisioningTenantless)
	if !errors.Is(err, ErrOIDCIdentityMismatch) {
		t.Fatalf("LoginWithOIDC() error = %v, want ErrOIDCIdentityMismatch", err)
	}
	if user.IdentitySubject != "subject-old" {
		t.Fatalf("mismatched callback relinked subject to %q", user.IdentitySubject)
	}
	if repo.updateCalls != 0 {
		t.Fatalf("mismatched callback performed %d writes, want none", repo.updateCalls)
	}
}

func TestOIDCLoginRejectsPartialIdentityBinding(t *testing.T) {
	const email = "alice@example.com"
	svc, repo, closeProvider := newOIDCIdentityProvider(t, "subject-1", email)
	defer closeProvider()

	user := &types.User{
		ID:               "user-1",
		Username:         "alice",
		Email:            email,
		IsActive:         true,
		IdentityProvider: "supabase",
	}
	repo.users[user.ID] = user
	repo.byEmail[email] = user
	repo.byUsername[user.Username] = user

	_, err := svc.LoginWithOIDC(context.Background(), "authorization-code", "https://app.example/callback", "test-code-verifier-0123456789abcdefghijklmnopqrstuvwxyz", types.TenantProvisioningTenantless)
	if !errors.Is(err, ErrOIDCIdentityBindingInvalid) {
		t.Fatalf("LoginWithOIDC() error = %v, want ErrOIDCIdentityBindingInvalid", err)
	}
	if repo.updateCalls != 0 {
		t.Fatalf("partial binding callback performed %d writes, want none", repo.updateCalls)
	}
}

func TestOIDCLoginBindsProvisionedUserAndRequiresSubject(t *testing.T) {
	const email = "new@example.com"
	svc, repo, closeProvider := newOIDCIdentityProvider(t, "subject-new", email)
	defer closeProvider()

	response, err := svc.LoginWithOIDC(context.Background(), "authorization-code", "https://app.example/callback", "test-code-verifier-0123456789abcdefghijklmnopqrstuvwxyz", types.TenantProvisioningTenantless)
	if err != nil {
		t.Fatalf("LoginWithOIDC(new user) error = %v", err)
	}
	if !response.Success || !response.IsNewUser || response.User == nil {
		t.Fatalf("LoginWithOIDC(new user) response = %#v, want successful new user", response)
	}
	if response.User.IdentityProvider != "supabase" || response.User.IdentitySubject != "subject-new" {
		t.Fatalf("provisioned identity = (%q, %q), want (supabase, subject-new)", response.User.IdentityProvider, response.User.IdentitySubject)
	}
	if repo.updateCalls != 1 {
		t.Fatalf("provisioned first-bind writes = %d, want one", repo.updateCalls)
	}
}

func TestOIDCLoginRejectsMissingSubjectBeforeProvisioning(t *testing.T) {
	const email = "missing-subject@example.com"
	svc, repo, closeProvider := newOIDCIdentityProvider(t, "", email)
	defer closeProvider()

	_, err := svc.LoginWithOIDC(context.Background(), "authorization-code", "https://app.example/callback", "test-code-verifier-0123456789abcdefghijklmnopqrstuvwxyz", types.TenantProvisioningTenantless)
	if err == nil || !strings.Contains(err.Error(), "provider did not return subject") {
		t.Fatalf("LoginWithOIDC() error = %v, want missing subject rejection", err)
	}
	if len(repo.users) != 0 || repo.updateCalls != 0 {
		t.Fatalf("missing subject provisioned or mutated an account: users=%d updates=%d", len(repo.users), repo.updateCalls)
	}
}

func TestOIDCIdentityProviderDefaultsToGenericForNonSupabaseIssuer(t *testing.T) {
	provider := oidcIdentityProvider(&config.OIDCAuthConfig{
		IssuerURL:             "https://accounts.example.com/issuer",
		AuthorizationEndpoint: "https://accounts.example.com/oauth/authorize",
		TokenEndpoint:         "https://accounts.example.com/oauth/token",
		UserInfoEndpoint:      "https://accounts.example.com/oauth/userinfo",
	})
	if provider != "oidc" {
		t.Fatalf("oidcIdentityProvider() = %q, want generic oidc", provider)
	}
}
