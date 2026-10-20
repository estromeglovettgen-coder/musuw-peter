package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const showcaseTestUser = "11111111-1111-4111-8111-111111111111"

func showcaseTestHandler(t *testing.T, upstream string) *FireShowcaseHandler {
	t.Helper()
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	t.Setenv("FIRE_SHOWCASE_ENABLED", "true")
	t.Setenv("FIRE_SHOWCASE_URL", upstream)
	t.Setenv("FIRE_SHOWCASE_BRIDGE_TOKEN", "test-bridge-secret-at-least-32-characters")
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "showcase.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.Exec("CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id INTEGER,is_system_admin BOOLEAN,is_active BOOLEAN,deletion_requested_at DATETIME,deleted_at DATETIME)").Error)
	require.NoError(t, db.Exec("INSERT INTO users VALUES (?, 7, false, true, NULL,NULL)", showcaseTestUser).Error)
	return NewFireShowcaseHandler(firebilling.NewService(db))
}

func TestFireShowcaseProxyUsesVerifiedActorAndKeepsCredentialsPrivate(t *testing.T) {
	called := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called++
		require.Equal(t, "/api/generation-tasks", r.URL.Path)
		require.Equal(t, showcaseTestUser, r.Header.Get("X-Fire-User-ID"))
		require.Equal(t, "7", r.Header.Get("X-Fire-Tenant-ID"))
		require.Equal(t, "test-bridge-secret-at-least-32-characters", r.Header.Get("X-Fire-Bridge-Token"))
		require.Empty(t, r.Header.Get("Authorization"))
		require.Empty(t, r.Header.Get("Cookie"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tasks":[]}`))
	}))
	defer upstream.Close()
	h := showcaseTestHandler(t, upstream.URL)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		ctx := context.WithValue(c.Request.Context(), types.UserIDContextKey, showcaseTestUser)
		ctx = context.WithValue(ctx, types.TenantIDContextKey, uint64(10000))
		c.Request = c.Request.WithContext(ctx)
	})
	r.GET("/api/v1/fire-showcase/api/*resource", h.Proxy)
	req := httptest.NewRequest("GET", "/api/v1/fire-showcase/api/generation-tasks", nil)
	ctx, cancel := context.WithCancel(req.Context())
	defer cancel()
	req = req.WithContext(ctx)
	req.Header.Set("Authorization", "Bearer native-login-token")
	req.Header.Set("Cookie", "unrelated=private")
	req.Header.Set("X-Fire-User-ID", "another-user")
	req.Header.Set("X-Fire-Tenant-ID", "1")
	req.Header.Set("X-Fire-Bridge-Token", "attacker")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code, w.Body.String())
	require.Equal(t, 1, called)
	require.NotContains(t, w.Body.String(), "test-bridge-secret")
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
}

func TestFireShowcaseRewritesOnlyOwnedAssetURLs(t *testing.T) {
	id := "sha256_" + strings.Repeat("a", 64)
	value := map[string]any{"images": []any{"/api/assets/" + id + "/content", "https://elsewhere.test/image.png", "/api/assets/not-a-hash/content"}}
	rewritten := rewriteShowcaseAssets(value, showcaseTestUser).(map[string]any)["images"].([]any)
	require.Equal(t, showcaseMediaPath+showcaseTestUser+"/"+id+"/content", rewritten[0])
	require.Equal(t, "https://elsewhere.test/image.png", rewritten[1])
	require.Equal(t, "/api/assets/not-a-hash/content", rewritten[2])
}

func TestFireShowcaseRejectsForeignAssetsAndDisabledUsersBeforeForwarding(t *testing.T) {
	called := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called++ }))
	defer up.Close()
	h := showcaseTestHandler(t, up.URL)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), types.UserIDContextKey, showcaseTestUser))
	})
	r.GET("/assets/:user_id/:asset_id/content", h.Asset)
	r.GET("/api/*resource", h.Proxy)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/assets/22222222-2222-4222-8222-222222222222/sha256_"+strings.Repeat("b", 64)+"/content", nil))
	require.Equal(t, 404, w.Code)
	require.NoError(t, h.billing.DB().Exec("UPDATE users SET is_active = false").Error)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/generation-tasks", nil))
	require.Equal(t, 403, w.Code)
	require.Zero(t, called)
}

func TestFireShowcasePrivateCallbackCannotForgeIdentity(t *testing.T) {
	h := showcaseTestHandler(t, "http://127.0.0.1:1")
	r := gin.New()
	r.POST("/internal/:action", h.Internal)
	for _, tc := range []struct {
		secret, body string
		code         int
	}{
		{"attacker", `{}`, 403},
		{h.secret, `{"user_id":"` + showcaseTestUser + `","tenant_id":10000}`, 403},
		{h.secret, `{"user_id":"22222222-2222-4222-8222-222222222222","tenant_id":7}`, 410},
		{h.secret, `{"user_id":"` + showcaseTestUser + `","tenant_id":7}`, 200},
	} {
		req := httptest.NewRequest("POST", "/internal/owner", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Fire-Bridge-Token", tc.secret)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		require.Equal(t, tc.code, w.Code, w.Body.String())
	}
	require.NoError(t, h.billing.DB().Exec("UPDATE users SET is_active = false").Error)
	req := httptest.NewRequest("POST", "/internal/owner", strings.NewReader(`{"user_id":"`+showcaseTestUser+`","tenant_id":7}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Fire-Bridge-Token", h.secret)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 403, w.Code)
}

func TestFireShowcaseAllowsOnlyOriginalWorkbenchAPI(t *testing.T) {
	require.True(t, showcaseAPIAllowed("GET", "/api/generation-tasks"))
	require.True(t, showcaseAPIAllowed("POST", "/api/generation-tasks/"+showcaseTestUser+"/retry"))
	for _, p := range []string{"/api/admin/users", "/api/assets/../config", "/api/generation-tasks/not-uuid", "/api/generate", "/api/../../internal"} {
		require.False(t, showcaseAPIAllowed("POST", p), p)
	}
	require.False(t, showcaseAPIAllowed("DELETE", "/api/generation-tasks"))
}

func TestFireShowcaseImageAdmissionReturnsDefinitePaymentDenial(t *testing.T) {
	for _, status := range []string{"zero", "expired", "suspended", "not_activated"} {
		t.Run(status, func(t *testing.T) {
			h := showcaseTestHandler(t, "http://127.0.0.1:1")
			require.NoError(t, h.billing.DB().AutoMigrate(&firebilling.Membership{}, &firebilling.ImageCall{}))
			if status != "not_activated" {
				m := firebilling.Membership{UserID: showcaseTestUser, TenantID: 7, PeriodID: "test-period", ExpiresAt: time.Now().Add(time.Hour), ImageLimit: 0}
				if status == "expired" {
					m.ExpiresAt = time.Now().Add(-time.Hour)
					m.ImageLimit = 1
				}
				if status == "suspended" {
					m.Suspended = true
					m.ImageLimit = 1
				}
				require.NoError(t, h.billing.DB().Create(&m).Error)
			}
			r := gin.New()
			r.POST("/internal/:action", h.Internal)
			req := httptest.NewRequest("POST", "/internal/reserve", strings.NewReader(`{"user_id":"`+showcaseTestUser+`","tenant_id":7,"task_id":"33333333-3333-4333-8333-333333333333"}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Fire-Bridge-Token", h.secret)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			require.Equal(t, 402, w.Code, w.Body.String())
			var count int64
			require.NoError(t, h.billing.DB().Model(&firebilling.ImageCall{}).Count(&count).Error)
			require.Zero(t, count)
		})
	}
}
