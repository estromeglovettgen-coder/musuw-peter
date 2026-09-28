package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type tenantRetrievalResolverStub struct {
	model *types.Model
	err   error
}

func (s *tenantRetrievalResolverStub) ResolveConsumerModel(_ context.Context, _ types.ConsumerScene, _ string) (*types.Model, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.model, nil
}

func (s *tenantRetrievalResolverStub) ListConsumerModelOptions(context.Context, types.ConsumerScene) ([]*types.ConsumerModelOption, error) {
	return nil, nil
}

func (s *tenantRetrievalResolverStub) AllowsFreeConsumerModel(context.Context, *types.Model) (bool, error) {
	return false, nil
}

var _ interfaces.ConsumerModelResolver = (*tenantRetrievalResolverStub)(nil)

func tenantRetrievalConfigTestEngine(t *testing.T, h *TenantHandler, tenant *types.Tenant) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant.ID)
		ctx = context.WithValue(ctx, types.TenantInfoContextKey, tenant)
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleAdmin)
		c.Request = c.Request.WithContext(ctx)
		c.Set(types.TenantIDContextKey.String(), tenant.ID)
		c.Next()
	})
	r.PUT("/tenants/kv/:key", h.UpdateTenantKV)
	return r
}

func TestUpdateTenantRetrievalConfigPersistsResolvedConsumerRerank(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })
	tenant := &types.Tenant{ID: 1}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{
		service: service,
		consumerModelResolver: &tenantRetrievalResolverStub{model: &types.Model{
			ID:   "resolved-rerank",
			Type: types.ModelTypeRerank,
		}},
	}
	engine := tenantRetrievalConfigTestEngine(t, h, tenant)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/retrieval-config", strings.NewReader(`{"rerank_model_id":"authorized-candidate"}`))
	req.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, service.tenant.RetrievalConfig)
	require.Equal(t, "resolved-rerank", service.tenant.RetrievalConfig.RerankModelID)
}

func TestUpdateTenantRetrievalConfigPreservesStandardAuthority(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })
	tenant := &types.Tenant{ID: 1}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{
		service: service,
		consumerModelResolver: &tenantRetrievalResolverStub{err: apperrors.NewForbiddenError(
			"consumer resolver must not run in Standard",
		)},
	}
	engine := tenantRetrievalConfigTestEngine(t, h, tenant)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/retrieval-config", strings.NewReader(`{"rerank_model_id":"standard-rerank"}`))
	req.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, service.tenant.RetrievalConfig)
	require.Equal(t, "standard-rerank", service.tenant.RetrievalConfig.RerankModelID)
}

func TestUpdateTenantRetrievalConfigRejectsUnauthorizedConsumerRerank(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })
	tenant := &types.Tenant{ID: 1}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{
		service:               service,
		consumerModelResolver: &tenantRetrievalResolverStub{err: apperrors.NewForbiddenError("model requires a paid plan")},
	}
	engine := tenantRetrievalConfigTestEngine(t, h, tenant)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/retrieval-config", strings.NewReader(`{"rerank_model_id":"paid-candidate"}`))
	req.Header.Set("Content-Type", "application/json")
	engine.ServeHTTP(rec, req)

	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Nil(t, service.tenant.RetrievalConfig)
}
