package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newTenantMemoryRoleTestEngine(t *testing.T, role types.TenantRole, tenant *types.Tenant) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &TenantHandler{service: &stubTenantService{tenant: tenant}}
	enforced := true
	cfg := &config.Config{Tenant: &config.TenantConfig{EnableRBAC: &enforced}}

	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant.ID)
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, role)
		ctx = context.WithValue(ctx, types.TenantInfoContextKey, tenant)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	r.GET("/tenants/kv/:key", middleware.RequireRole(types.TenantRoleViewer, cfg), h.GetTenantKV)
	r.PUT("/tenants/kv/:key", middleware.RequireRole(types.TenantRoleAdmin, cfg), h.UpdateTenantKV)
	return r
}

func TestTenantMemoryConfigViewerReadAndAdminWriteBoundary(t *testing.T) {
	t.Parallel()

	t.Run("viewer can read", func(t *testing.T) {
		t.Parallel()
		tenant := &types.Tenant{ID: 1, MemoryConfig: &types.MemoryConfig{
			Enabled:             true,
			WriteMode:           types.MemoryWriteExplicitOnly,
			MaxItems:            321,
			ExtractDelaySeconds: 7,
		}}
		engine := newTenantMemoryRoleTestEngine(t, types.TenantRoleViewer, tenant)

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/tenants/kv/memory-config", nil)
		engine.ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)
		require.Contains(t, rec.Body.String(), `"max_items":321`)
	})

	t.Run("viewer cannot write", func(t *testing.T) {
		t.Parallel()
		tenant := &types.Tenant{ID: 1, MemoryConfig: &types.MemoryConfig{
			Enabled:   false,
			WriteMode: types.MemoryWriteExplicitOnly,
			MaxItems:  321,
		}}
		engine := newTenantMemoryRoleTestEngine(t, types.TenantRoleViewer, tenant)

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPut, "/tenants/kv/memory-config", strings.NewReader(`{"enabled":true,"max_items":17}`))
		req.Header.Set("Content-Type", "application/json")
		engine.ServeHTTP(rec, req)

		require.Equal(t, http.StatusForbidden, rec.Code)
		require.False(t, tenant.MemoryConfig.Enabled)
		require.Equal(t, 321, tenant.MemoryConfig.MaxItems)
	})

	t.Run("admin can write", func(t *testing.T) {
		t.Parallel()
		tenant := &types.Tenant{ID: 1, MemoryConfig: &types.MemoryConfig{
			Enabled:   false,
			WriteMode: types.MemoryWriteExplicitOnly,
			MaxItems:  321,
		}}
		engine := newTenantMemoryRoleTestEngine(t, types.TenantRoleAdmin, tenant)

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPut, "/tenants/kv/memory-config", strings.NewReader(`{"enabled":true,"max_items":17}`))
		req.Header.Set("Content-Type", "application/json")
		engine.ServeHTTP(rec, req)

		require.Equal(t, http.StatusOK, rec.Code)
		require.True(t, tenant.MemoryConfig.Enabled)
		require.Equal(t, 17, tenant.MemoryConfig.MaxItems)
	})
}

func TestUpdateTenantMemoryConfigLitePersistsCompleteVisibleConfig(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	vectorRecall := true
	retrievalConditioning := false
	tenant := &types.Tenant{
		ID: 1,
		MemoryConfig: &types.MemoryConfig{
			Enabled:                   false,
			WriteMode:                 types.MemoryWriteExplicitOnly,
			ExtractModelID:            "server-extractor",
			MaxItems:                  200,
			ExtractDelaySeconds:       90,
			ExtractMinIntervalSeconds: 300,
			ExtractInstructions:       "server instructions",
			InterestThreshold:         4,
			EmbeddingModelID:          "server-embedding",
			VectorRecall:              &vectorRecall,
			RetrievalConditioning:     &retrievalConditioning,
		},
	}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{service: service}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant.ID)
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleAdmin)
		ctx = context.WithValue(ctx, types.TenantInfoContextKey, tenant)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	r.PUT("/tenants/kv/:key", h.UpdateTenantKV)

	body := `{"enabled":true,"write_mode":"auto","max_items":17,"retrieval_conditioning":true,"extract_model_id":"custom-extractor","extract_delay_seconds":60,"extract_min_interval_seconds":120,"extract_instructions":"custom instructions","interest_threshold":5,"embedding_model_id":"custom-embedding","vector_recall":false}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/memory-config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, service.tenant.MemoryConfig)
	got := service.tenant.MemoryConfig
	require.True(t, got.Enabled)
	require.Equal(t, types.MemoryWriteAuto, got.WriteMode)
	require.Equal(t, 17, got.MaxItems)
	require.NotNil(t, got.RetrievalConditioning)
	require.True(t, *got.RetrievalConditioning)
	require.Equal(t, "custom-extractor", got.ExtractModelID)
	require.Equal(t, 60, got.ExtractDelaySeconds)
	require.Equal(t, 120, got.ExtractMinIntervalSeconds)
	require.Equal(t, "custom instructions", got.ExtractInstructions)
	require.Equal(t, 5, got.InterestThreshold)
	require.Equal(t, "custom-embedding", got.EmbeddingModelID)
	require.NotNil(t, got.VectorRecall)
	require.False(t, *got.VectorRecall)
}

func TestUpdateTenantMemoryConfigLiteValidatesEveryVisibleField(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	tenant := &types.Tenant{ID: 1}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{service: service}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant.ID)
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleAdmin)
		ctx = context.WithValue(ctx, types.TenantInfoContextKey, tenant)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	r.PUT("/tenants/kv/:key", h.UpdateTenantKV)

	body := `{"enabled":true,"write_mode":"auto","max_items":17,"extract_delay_seconds":-1}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/memory-config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestUpdateTenantMemoryConfigStandardKeepsExistingAuthority(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })

	tenant := &types.Tenant{ID: 1}
	service := &stubTenantService{tenant: tenant}
	h := &TenantHandler{service: service}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.ErrorHandler())
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenant.ID)
		ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleAdmin)
		ctx = context.WithValue(ctx, types.TenantInfoContextKey, tenant)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	})
	r.PUT("/tenants/kv/:key", h.UpdateTenantKV)

	body := `{"enabled":true,"write_mode":"auto","max_items":17,"extract_model_id":"custom-extractor","extract_delay_seconds":60,"extract_min_interval_seconds":120,"extract_instructions":"custom instructions","interest_threshold":5,"embedding_model_id":"custom-embedding","vector_recall":false,"retrieval_conditioning":false}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/tenants/kv/memory-config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	got := service.tenant.MemoryConfig
	require.True(t, got.Enabled)
	require.Equal(t, types.MemoryWriteAuto, got.WriteMode)
	require.Equal(t, 17, got.MaxItems)
	require.Equal(t, "custom-extractor", got.ExtractModelID)
	require.Equal(t, 60, got.ExtractDelaySeconds)
	require.Equal(t, 120, got.ExtractMinIntervalSeconds)
	require.Equal(t, "custom instructions", got.ExtractInstructions)
	require.Equal(t, 5, got.InterestThreshold)
	require.Equal(t, "custom-embedding", got.EmbeddingModelID)
	require.NotNil(t, got.VectorRecall)
	require.False(t, *got.VectorRecall)
	require.NotNil(t, got.RetrievalConditioning)
	require.False(t, *got.RetrievalConditioning)
}
