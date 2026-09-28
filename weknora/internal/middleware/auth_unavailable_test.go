package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type unavailableAuthUserService struct {
	interfaces.UserService
	err error
}

func (s unavailableAuthUserService) ValidateToken(context.Context, string) (*types.User, uint64, error) {
	return nil, 0, s.err
}

func TestAuthReturns503WhenNativeTokenCannotBeVerifiedBecauseStorageIsUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(ErrorHandler())
	router.Use(Auth(nil, unavailableAuthUserService{
		err: fmt.Errorf("%w: database system is in recovery mode", interfaces.ErrAuthenticationUnavailable),
	}, nil, nil, nil))
	router.GET("/api/v1/auth/me", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	request.Header.Set("Authorization", "Bearer valid-but-unverifiable-token")
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
}

type validAuthUserService struct {
	interfaces.UserService
	user     *types.User
	tenantID uint64
}

func (s validAuthUserService) ValidateToken(context.Context, string) (*types.User, uint64, error) {
	if s.user != nil {
		return s.user, s.tenantID, nil
	}
	return &types.User{ID: "user-1", TenantID: 7}, 7, nil
}

type unavailableAuthTenantService struct {
	interfaces.TenantService
}

func (unavailableAuthTenantService) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return nil, errors.New("database system is in recovery mode")
}

func TestAuthReturns503WhenTenantStateCannotBeLoaded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, name := range []string{"jwt tenant", "requested tenant"} {
		t.Run(name, func(t *testing.T) {
			router := gin.New()
			router.Use(ErrorHandler())
			router.Use(Auth(unavailableAuthTenantService{}, validAuthUserService{}, nil, nil, nil))
			router.GET("/api/v1/auth/me", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
			request.Header.Set("Authorization", "Bearer valid-token")
			if name == "requested tenant" {
				request.Header.Set("X-Tenant-ID", "7")
			}
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
			}
		})
	}
}

type availableAuthTenantService struct {
	interfaces.TenantService
}

func (availableAuthTenantService) GetTenantByID(_ context.Context, id uint64) (*types.Tenant, error) {
	return &types.Tenant{ID: id}, nil
}

type unavailableAuthMemberService struct {
	interfaces.TenantMemberService
}

func (unavailableAuthMemberService) GetMembership(context.Context, string, uint64) (*types.TenantMember, error) {
	return nil, errors.New("database system is in recovery mode")
}

func (unavailableAuthMemberService) HasAnyMembers(context.Context, uint64) (bool, error) {
	return true, nil
}

func TestAuthReturns503WhenTenantMembershipCannotBeLoaded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, scenario := range []struct {
		name     string
		user     *types.User
		tenantID uint64
		header   string
	}{
		{
			name:     "active tenant role",
			user:     &types.User{ID: "user-1", TenantID: 7},
			tenantID: 7,
		},
		{
			name:     "requested tenant access",
			user:     &types.User{ID: "user-1", TenantID: 1},
			tenantID: 1,
			header:   "7",
		},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			router := gin.New()
			router.Use(ErrorHandler())
			router.Use(Auth(
				availableAuthTenantService{},
				validAuthUserService{user: scenario.user, tenantID: scenario.tenantID},
				unavailableAuthMemberService{},
				nil,
				cfgWithRBAC(true),
			))
			router.GET("/api/v1/auth/me", func(c *gin.Context) {
				c.Status(http.StatusOK)
			})

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
			request.Header.Set("Authorization", "Bearer valid-token")
			if scenario.header != "" {
				request.Header.Set("X-Tenant-ID", scenario.header)
			}
			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
			}
		})
	}
}
