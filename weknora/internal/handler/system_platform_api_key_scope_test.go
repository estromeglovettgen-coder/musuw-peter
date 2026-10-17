package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPlatformAPIKeyCreateKeepsRequestedKnowledgeBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("SYSTEM_AES_KEY", "0123456789abcdef0123456789abcdef")
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:platform-key-scope-%d?mode=memory&cache=shared", time.Now().UnixNano())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&types.TenantAPIKey{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	keys := service.NewTenantAPIKeyService(repository.NewTenantAPIKeyRepository(db))
	h := &SystemHandler{apiKeySvc: keys}
	router := gin.New()
	router.Use(middleware.ErrorHandler())
	router.POST("/system/admin/api-keys", h.CreatePlatformAPIKey)
	router.DELETE("/system/admin/api-keys/:key_id", h.DeletePlatformAPIKey)
	expires := time.Now().Add(15 * time.Minute).Unix()
	const allowedKB = "b36d8677-9a0f-4649-942e-c0741320fcd2"
	capabilities := []string{"system_tenants_manage", "ingest", "retrieve"}
	raw, err := json.Marshal(map[string]any{
		"name": "ephemeral scoped maintenance", "knowledge_base_ids": []string{allowedKB},
		"capabilities": capabilities, "expires_at_unix": expires,
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/system/admin/api-keys", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	created := httptest.NewRecorder()
	router.ServeHTTP(created, req)
	require.Equal(t, http.StatusCreated, created.Code)
	var response struct {
		Data struct {
			ID               uint64   `json:"id"`
			Token            string   `json:"token"`
			KnowledgeBaseIDs []string `json:"knowledge_base_ids"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &response))
	require.NotEmpty(t, response.Data.Token)
	require.Equal(t, []string{allowedKB}, response.Data.KnowledgeBaseIDs)
	var stored types.TenantAPIKey
	require.NoError(t, db.First(&stored, response.Data.ID).Error)
	require.Nil(t, stored.TenantID)
	require.False(t, stored.FullAccess)
	require.Equal(t, types.APIKeyScopePlatform, stored.ScopeType)
	require.Equal(t, types.StringArray{allowedKB}, stored.KnowledgeBaseIDs)
	require.ElementsMatch(t, capabilities, []string(stored.Capabilities))
	require.NotNil(t, stored.ExpiresAt)
	require.Equal(t, expires, stored.ExpiresAt.Unix())
	// Apply the native persisted grant to the existing KB authorization helper.
	// The newly minted key can reach its one target; a different target or a
	// mixed multi-KB request fails rather than silently broadening the allow-list.
	ctx := types.WithTenantAPIKeyScope(context.Background(), types.TenantAPIKeyScope{
		KeyID: stored.ID, ScopeType: stored.ScopeType, FullAccess: stored.FullAccess,
		KnowledgeBaseIDs: stored.KnowledgeBaseIDs, Capabilities: stored.Capabilities,
	})
	require.NoError(t, requireTenantAPIKeyKnowledgeBase(ctx, allowedKB))
	for _, ids := range [][]string{{"foreign-kb"}, {allowedKB, "foreign-kb"}} {
		var appErr *apperrors.AppError
		require.ErrorAs(t, requireTenantAPIKeyKnowledgeBases(ctx, ids...), &appErr)
		require.Equal(t, http.StatusForbidden, appErr.HTTPCode)
	}
	revoked := httptest.NewRecorder()
	router.ServeHTTP(revoked, httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/system/admin/api-keys/%d", stored.ID), nil))
	require.Equal(t, http.StatusOK, revoked.Code)
	_, err = keys.AuthenticateAPIKey(context.Background(), response.Data.Token)
	require.Error(t, err, "the same secret must be rejected after native revocation")
}
