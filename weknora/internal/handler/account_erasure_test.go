package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/service"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type accountErasureServiceStub struct {
	err    error
	userID string
}

func (s *accountErasureServiceStub) Request(_ context.Context, userID string) error {
	s.userID = userID
	return s.err
}

func (*accountErasureServiceStub) Process(context.Context, *asynq.Task) error { return nil }
func (*accountErasureServiceStub) RecoverPending(context.Context) error       { return nil }

func accountErasureTestRouter(svc *accountErasureServiceStub) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.DELETE("/api/v1/system/admin/users/:user_id", NewAccountErasureHandler(svc).DeleteManagedAccount)
	return r
}

func performAccountErasure(t *testing.T, svc *accountErasureServiceStub) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/system/admin/users/user-7", nil)
	w := httptest.NewRecorder()
	accountErasureTestRouter(svc).ServeHTTP(w, req)
	return w
}

func TestDeleteManagedAccountReturnsAcceptedWithoutIdentifiers(t *testing.T) {
	svc := &accountErasureServiceStub{}
	w := performAccountErasure(t, svc)
	require.Equal(t, http.StatusAccepted, w.Code)
	require.JSONEq(t, `{"accepted":true}`, w.Body.String())
	require.Equal(t, "user-7", svc.userID)
}

func TestDeleteManagedAccountReturnsStableBillingPortalReason(t *testing.T) {
	svc := &accountErasureServiceStub{err: service.ErrAccountBillingActionRequired}
	w := performAccountErasure(t, svc)
	require.Equal(t, http.StatusConflict, w.Code)
	var envelope struct {
		Error struct {
			Code    apperrors.ErrorCode `json:"code"`
			Details map[string]any      `json:"details"`
		} `json:"error"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &envelope))
	require.Equal(t, "billing_action_required", envelope.Error.Details["code"])
}
