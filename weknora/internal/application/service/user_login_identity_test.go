package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"golang.org/x/crypto/bcrypt"
)

type loginIdentityRepo struct {
	interfaces.UserRepository
	user            *types.User
	email, username string
}

func (r *loginIdentityRepo) GetUserByEmail(_ context.Context, value string) (*types.User, error) {
	r.email = value
	return r.user, nil
}
func (r *loginIdentityRepo) GetUserByUsername(_ context.Context, value string) (*types.User, error) {
	r.username = value
	return r.user, nil
}

func TestLoginAcceptsUsernameWithoutChangingTenantOrPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte(" PlainPass9 "), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo := &loginIdentityRepo{user: &types.User{ID: "local-user", Username: "taylor001", IsActive: true, PasswordHash: string(hash)}}
	svc := &userService{userRepo: repo, tokenRepo: &stubAuthTokenRepo{}}
	response, err := svc.Login(context.Background(), &types.LoginRequest{Email: " taylor001 ", Password: " PlainPass9 "})
	if err != nil || !response.Success {
		t.Fatalf("login failed: %v, %+v", err, response)
	}
	if repo.username != "taylor001" || repo.email != "" {
		t.Fatalf("wrong identity lookup: username=%q email=%q", repo.username, repo.email)
	}
	if response.User.TenantID != 0 || response.Token == "" {
		t.Fatal("login did not preserve native tenancy/token behavior")
	}
}

func TestLoginKeepsEmailLookupAndNormalizesEmailOnly(t *testing.T) {
	repo := &loginIdentityRepo{}
	svc := &userService{userRepo: repo}
	response, err := svc.Login(context.Background(), &types.LoginRequest{Email: " USER@example.com ", Password: "PlainPass9"})
	if err != nil || response.Success {
		t.Fatalf("missing account should fail uniformly: %v %+v", err, response)
	}
	if repo.email != "user@example.com" || repo.username != "" {
		t.Fatalf("wrong identity lookup: username=%q email=%q", repo.username, repo.email)
	}
}
