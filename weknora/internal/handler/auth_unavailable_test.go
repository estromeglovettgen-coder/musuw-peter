package handler

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type unavailableRefreshUserService struct {
	interfaces.UserService
}

func (unavailableRefreshUserService) RefreshToken(context.Context, string) (string, string, error) {
	return "", "", fmt.Errorf("%w: database system is in recovery mode", interfaces.ErrAuthenticationUnavailable)
}

func TestRefreshTokenReturns503WhenSessionStorageIsTemporarilyUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &AuthHandler{userService: unavailableRefreshUserService{}}
	router := gin.New()
	router.Use(errorCapture())
	router.POST("/auth/refresh", h.RefreshToken)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/auth/refresh", bytes.NewBufferString(`{"refreshToken":"refresh-token"}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
}
