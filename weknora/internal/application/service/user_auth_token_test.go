package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

func init() {
	_ = os.Setenv("JWT_SECRET", "test-jwt-secret-for-user-auth-token-tests")
}

type stubAuthTokenRepo struct {
	tokens         map[string]*types.AuthToken
	revokedUserIDs []string
	getTokenErr    error
}

func (s *stubAuthTokenRepo) CreateToken(context.Context, *types.AuthToken) error { return nil }
func (s *stubAuthTokenRepo) GetTokenByValue(_ context.Context, tokenValue string) (*types.AuthToken, error) {
	if s.getTokenErr != nil {
		return nil, s.getTokenErr
	}
	token, ok := s.tokens[tokenValue]
	if !ok {
		return nil, apprepo.ErrTokenNotFound
	}
	return token, nil
}

func TestValidateTokenMarksPersistenceFailureAsAuthenticationUnavailable(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{
		tokens:      map[string]*types.AuthToken{},
		getTokenErr: errors.New("database system is in recovery mode"),
	}
	svc := newAuthTestUserService(tokenRepo)
	accessJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	_, _, err := svc.ValidateToken(ctx, accessJWT)
	if !interfaces.IsAuthenticationUnavailable(err) {
		t.Fatalf("ValidateToken() error = %v, want authentication unavailable", err)
	}
}

func TestValidateTokenKeepsMissingTokenAsDefinitivelyInvalid(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{
		tokens:      map[string]*types.AuthToken{},
		getTokenErr: apprepo.ErrTokenNotFound,
	}
	svc := newAuthTestUserService(tokenRepo)
	accessJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	_, _, err := svc.ValidateToken(ctx, accessJWT)
	if err == nil || interfaces.IsAuthenticationUnavailable(err) {
		t.Fatalf("ValidateToken() error = %v, want definitive invalid token", err)
	}
}
func (s *stubAuthTokenRepo) GetTokensByUserID(context.Context, string) ([]*types.AuthToken, error) {
	return nil, nil
}
func (s *stubAuthTokenRepo) UpdateToken(context.Context, *types.AuthToken) error { return nil }
func (s *stubAuthTokenRepo) DeleteToken(context.Context, string) error           { return nil }
func (s *stubAuthTokenRepo) DeleteExpiredTokens(context.Context) error           { return nil }
func (s *stubAuthTokenRepo) RevokeTokensByUserID(_ context.Context, userID string) error {
	s.revokedUserIDs = append(s.revokedUserIDs, userID)
	return nil
}

type stubUserRepoForAuth struct {
	users       map[string]*types.User
	updateCalls int
	getUserErr  error
}

func (s *stubUserRepoForAuth) CreateUser(context.Context, *types.User) error { return nil }
func (s *stubUserRepoForAuth) GetUserByID(_ context.Context, id string) (*types.User, error) {
	if s.getUserErr != nil {
		return nil, s.getUserErr
	}
	user, ok := s.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}
func (s *stubUserRepoForAuth) GetUsersByIDs(context.Context, []string) (map[string]*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) GetUserByEmail(context.Context, string) (*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) GetUserByUsername(context.Context, string) (*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) GetUserByTenantID(context.Context, uint64) (*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) UpdateUser(context.Context, *types.User) error {
	s.updateCalls++
	return nil
}
func (s *stubUserRepoForAuth) DeleteUser(context.Context, string) error { return nil }
func (s *stubUserRepoForAuth) ListUsers(context.Context, int, int) ([]*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) ListSystemAdmins(context.Context, int, int) ([]*types.User, int64, error) {
	return nil, 0, nil
}
func (s *stubUserRepoForAuth) RevokeSystemAdmin(context.Context, string, string) (*types.User, error) {
	return nil, nil
}
func (s *stubUserRepoForAuth) SearchUsers(context.Context, string, int) ([]*types.User, error) {
	return nil, nil
}

func newAuthTestUserService(tokenRepo *stubAuthTokenRepo) *userService {
	return &userService{
		userRepo: &stubUserRepoForAuth{
			users: map[string]*types.User{
				"user-1": {ID: "user-1", TenantID: 1, IsActive: true},
			},
		},
		tokenRepo: tokenRepo,
	}
}

func signTestJWT(claims jwt.MapClaims) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(getJwtSecret()))
	if err != nil {
		panic(err)
	}
	return signed
}

func TestValidateTokenMarksUserLookupFailureAsAuthenticationUnavailable(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	svc.userRepo.(*stubUserRepoForAuth).getUserErr = errors.New("database system is in recovery mode")
	accessJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[accessJWT] = &types.AuthToken{Token: accessJWT, TokenType: "access_token"}

	_, _, err := svc.ValidateToken(ctx, accessJWT)
	if !interfaces.IsAuthenticationUnavailable(err) {
		t.Fatalf("ValidateToken() error = %v, want authentication unavailable", err)
	}
}

func TestRefreshTokenMarksPersistenceFailureAsAuthenticationUnavailable(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{
		tokens:      map[string]*types.AuthToken{},
		getTokenErr: errors.New("database system is in recovery mode"),
	}
	svc := newAuthTestUserService(tokenRepo)
	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	_, _, err := svc.RefreshToken(ctx, refreshJWT)
	if !interfaces.IsAuthenticationUnavailable(err) {
		t.Fatalf("RefreshToken() error = %v, want authentication unavailable", err)
	}
}

func TestRefreshTokenMarksUserLookupFailureAsAuthenticationUnavailable(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	svc.userRepo.(*stubUserRepoForAuth).getUserErr = errors.New("database system is in recovery mode")
	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[refreshJWT] = &types.AuthToken{
		UserID:    "user-1",
		Token:     refreshJWT,
		TokenType: "refresh_token",
	}

	_, _, err := svc.RefreshToken(ctx, refreshJWT)
	if !interfaces.IsAuthenticationUnavailable(err) {
		t.Fatalf("RefreshToken() error = %v, want authentication unavailable", err)
	}
}

func TestValidateTokenRejectsRefreshToken(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)

	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[refreshJWT] = &types.AuthToken{
		UserID:    "user-1",
		Token:     refreshJWT,
		TokenType: "refresh_token",
	}

	_, _, err := svc.ValidateToken(ctx, refreshJWT)
	if err == nil || err.Error() != "refresh token cannot be used as access token" {
		t.Fatalf("ValidateToken(refresh JWT) err = %v, want refresh rejection", err)
	}

	legacyRefresh := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[legacyRefresh] = &types.AuthToken{
		UserID:    "user-1",
		Token:     legacyRefresh,
		TokenType: "refresh_token",
	}

	_, _, err = svc.ValidateToken(ctx, legacyRefresh)
	if err == nil || err.Error() != "refresh token cannot be used as access token" {
		t.Fatalf("ValidateToken(legacy refresh in DB) err = %v, want refresh rejection", err)
	}
}

func TestRefreshTokenRejectsAccessTokenRecord(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)

	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[refreshJWT] = &types.AuthToken{
		UserID:    "user-1",
		Token:     refreshJWT,
		TokenType: "access_token",
	}

	_, _, err := svc.RefreshToken(ctx, refreshJWT)
	if err == nil || err.Error() != "not a refresh token" {
		t.Fatalf("RefreshToken(access token record) err = %v, want not a refresh token", err)
	}
}

func TestLogoutRevokesAllUserTokens(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)

	expiredAccess := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(-time.Hour).Unix(),
	})

	if err := svc.Logout(ctx, expiredAccess); err != nil {
		t.Fatalf("Logout(expired access token) err = %v", err)
	}
	if len(tokenRepo.revokedUserIDs) != 1 || tokenRepo.revokedUserIDs[0] != "user-1" {
		t.Fatalf("RevokeTokensByUserID calls = %v, want [user-1]", tokenRepo.revokedUserIDs)
	}
}

func TestAdminResetPasswordHashesPasswordAndRevokesSessions(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	repo := svc.userRepo.(*stubUserRepoForAuth)

	if err := svc.AdminResetPassword(ctx, "user-1", "NewSecure9"); err != nil {
		t.Fatalf("AdminResetPassword() err = %v", err)
	}
	if repo.updateCalls != 1 {
		t.Fatalf("UpdateUser calls = %d, want 1", repo.updateCalls)
	}
	user := repo.users["user-1"]
	if user.PasswordHash == "NewSecure9" || user.PasswordHash == "" {
		t.Fatalf("password was not stored as a hash")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte("NewSecure9")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
	if len(tokenRepo.revokedUserIDs) != 1 || tokenRepo.revokedUserIDs[0] != "user-1" {
		t.Fatalf("RevokeTokensByUserID calls = %v, want [user-1]", tokenRepo.revokedUserIDs)
	}
}

func TestAdminResetPasswordRejectsWeakPasswordBeforeWrite(t *testing.T) {
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	repo := svc.userRepo.(*stubUserRepoForAuth)

	err := svc.AdminResetPassword(context.Background(), "user-1", "password")
	if !errors.Is(err, ErrPasswordPolicy) {
		t.Fatalf("AdminResetPassword() err = %v, want ErrPasswordPolicy", err)
	}
	if repo.updateCalls != 0 || len(tokenRepo.revokedUserIDs) != 0 {
		t.Fatalf("weak password caused side effects: updates=%d revocations=%v", repo.updateCalls, tokenRepo.revokedUserIDs)
	}
}

func TestChangePasswordRequiresPolicyAndRevokesSessions(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	repo := svc.userRepo.(*stubUserRepoForAuth)

	hashed, err := bcrypt.GenerateFromPassword([]byte("OldSecure9"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash old password: %v", err)
	}
	repo.users["user-1"].PasswordHash = string(hashed)

	if err := svc.ChangePassword(ctx, "user-1", "OldSecure9", "weak"); !errors.Is(err, ErrPasswordPolicy) {
		t.Fatalf("ChangePassword(weak) err = %v, want ErrPasswordPolicy", err)
	}
	if repo.updateCalls != 0 || len(tokenRepo.revokedUserIDs) != 0 {
		t.Fatalf("weak password caused side effects: updates=%d revocations=%v", repo.updateCalls, tokenRepo.revokedUserIDs)
	}

	if err := svc.ChangePassword(ctx, "user-1", "wrong-pass", "NewSecure9"); !errors.Is(err, ErrInvalidOldPassword) {
		t.Fatalf("ChangePassword(wrong old) err = %v, want ErrInvalidOldPassword", err)
	}

	if err := svc.ChangePassword(ctx, "user-1", "OldSecure9", "NewSecure9"); err != nil {
		t.Fatalf("ChangePassword() err = %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.users["user-1"].PasswordHash), []byte("NewSecure9")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
	if len(tokenRepo.revokedUserIDs) != 1 || tokenRepo.revokedUserIDs[0] != "user-1" {
		t.Fatalf("revoked users = %v, want [user-1]", tokenRepo.revokedUserIDs)
	}
}

func TestChangePasswordRejectsSamePassword(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	repo := svc.userRepo.(*stubUserRepoForAuth)

	hashed, err := bcrypt.GenerateFromPassword([]byte("OldSecure9"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("hash old password: %v", err)
	}
	repo.users["user-1"].PasswordHash = string(hashed)

	if err := svc.ChangePassword(ctx, "user-1", "OldSecure9", "OldSecure9"); !errors.Is(err, ErrSamePassword) {
		t.Fatalf("ChangePassword(same) err = %v, want ErrSamePassword", err)
	}
	if repo.updateCalls != 0 || len(tokenRepo.revokedUserIDs) != 0 {
		t.Fatalf("same password caused side effects: updates=%d revocations=%v", repo.updateCalls, tokenRepo.revokedUserIDs)
	}
}

func TestUserIDFromSignedTokenAcceptsExpiredToken(t *testing.T) {
	expired := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(-time.Hour).Unix(),
	})

	userID, err := userIDFromSignedToken(expired)
	if err != nil {
		t.Fatalf("userIDFromSignedToken(expired) err = %v", err)
	}
	if userID != "user-1" {
		t.Fatalf("userIDFromSignedToken(expired) = %q, want user-1", userID)
	}
}

func TestValidateTokenRejectsDeletionPendingUser(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	requestedAt := time.Now()
	svc.userRepo.(*stubUserRepoForAuth).users["user-1"].DeletionRequestedAt = &requestedAt
	accessJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[accessJWT] = &types.AuthToken{UserID: "user-1", Token: accessJWT, TokenType: "access_token"}

	_, _, err := svc.ValidateToken(ctx, accessJWT)
	if !errors.Is(err, ErrAccountDeletionPending) {
		t.Fatalf("ValidateToken() error = %v, want ErrAccountDeletionPending", err)
	}
}

func TestValidateTokenRejectsInactiveUser(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	svc.userRepo.(*stubUserRepoForAuth).users["user-1"].IsActive = false
	accessJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "access",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	tokenRepo.tokens[accessJWT] = &types.AuthToken{UserID: "user-1", Token: accessJWT, TokenType: "access_token"}

	_, _, err := svc.ValidateToken(ctx, accessJWT)
	if !errors.Is(err, ErrAccountInactive) {
		t.Fatalf("ValidateToken() error = %v, want ErrAccountInactive", err)
	}
}

func TestRefreshTokenRejectsDeletionPendingUserWithoutRevoking(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	requestedAt := time.Now()
	svc.userRepo.(*stubUserRepoForAuth).users["user-1"].DeletionRequestedAt = &requestedAt
	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	record := &types.AuthToken{UserID: "user-1", Token: refreshJWT, TokenType: "refresh_token"}
	tokenRepo.tokens[refreshJWT] = record

	_, _, err := svc.RefreshToken(ctx, refreshJWT)
	if !errors.Is(err, ErrAccountDeletionPending) {
		t.Fatalf("RefreshToken() error = %v, want ErrAccountDeletionPending", err)
	}
	if record.IsRevoked {
		t.Fatal("RefreshToken() revoked the existing token before applying the deletion fence")
	}
}

func TestRefreshTokenRejectsInactiveUserWithoutRevoking(t *testing.T) {
	ctx := context.Background()
	tokenRepo := &stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}}
	svc := newAuthTestUserService(tokenRepo)
	svc.userRepo.(*stubUserRepoForAuth).users["user-1"].IsActive = false
	refreshJWT := signTestJWT(jwt.MapClaims{
		"user_id": "user-1",
		"type":    "refresh",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	record := &types.AuthToken{UserID: "user-1", Token: refreshJWT, TokenType: "refresh_token"}
	tokenRepo.tokens[refreshJWT] = record

	_, _, err := svc.RefreshToken(ctx, refreshJWT)
	if !errors.Is(err, ErrAccountInactive) {
		t.Fatalf("RefreshToken() error = %v, want ErrAccountInactive", err)
	}
	if record.IsRevoked {
		t.Fatal("RefreshToken() revoked the existing token before applying the inactive fence")
	}
}

func TestGenerateTokensRejectsDeletionPendingUser(t *testing.T) {
	svc := newAuthTestUserService(&stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}})
	requestedAt := time.Now()
	user := svc.userRepo.(*stubUserRepoForAuth).users["user-1"]
	user.DeletionRequestedAt = &requestedAt

	accessToken, refreshToken, err := svc.GenerateTokens(context.Background(), user)
	if !errors.Is(err, ErrAccountDeletionPending) {
		t.Fatalf("GenerateTokens() error = %v, want ErrAccountDeletionPending", err)
	}
	if accessToken != "" || refreshToken != "" {
		t.Fatalf("GenerateTokens() returned tokens for deletion-pending user: access=%q refresh=%q", accessToken, refreshToken)
	}
}

func TestSwitchTenantRejectsInactiveUserBeforeMembershipLookup(t *testing.T) {
	svc := newAuthTestUserService(&stubAuthTokenRepo{tokens: map[string]*types.AuthToken{}})
	user := svc.userRepo.(*stubUserRepoForAuth).users["user-1"]
	user.IsActive = false

	_, err := svc.SwitchTenant(context.Background(), user, 42, "")
	if !errors.Is(err, ErrAccountInactive) {
		t.Fatalf("SwitchTenant() error = %v, want ErrAccountInactive", err)
	}
}
