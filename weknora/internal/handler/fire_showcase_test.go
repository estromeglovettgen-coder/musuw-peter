package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strconv"
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
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	require.NoError(t, h.billing.DB().Exec("UPDATE users SET is_active = false").Error)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/generation-tasks", nil))
	require.Equal(t, 403, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
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

// Exercise the actual reverse proxy: callers must be able to reuse public
// revisioned files while private workbench responses stay account-specific.
func TestFireShowcaseStaticPreservesPublicCacheAndConditionalResponse(t *testing.T) {
	const policy = "public, max-age=31536000, immutable"
	const etag = `"sha256-asset-revision"`
	const modified = "Mon, 19 Oct 2026 12:00:00 GMT"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/fire-host.js", r.URL.Path)
		require.Empty(t, r.Header.Get("Authorization"))
		require.Empty(t, r.Header.Get("Cookie"))
		require.Empty(t, r.Header.Get("X-Fire-User-ID"))
		w.Header().Set("Content-Type", "text/javascript")
		cache := "no-cache"
		if r.URL.Query().Get("v") == strings.Repeat("a", 64) {
			cache = policy
		}
		w.Header().Set("Cache-Control", cache)
		w.Header().Set("ETag", etag)
		w.Header().Set("Last-Modified", modified)
		w.Header().Set("Vary", "Accept-Encoding, Authorization, Cookie")
		w.Header().Add("Set-Cookie", "sidecar=must-not-escape")
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write([]byte("console.log('public');"))
	}))
	defer upstream.Close()
	h := showcaseTestHandler(t, upstream.URL)
	r := gin.New()
	r.GET("/tools/fire-showcase/*resource", h.Static)
	r.HEAD("/tools/fire-showcase/*resource", h.Static)
	for _, tc := range []struct {
		method, condition, query, expectedPolicy string
		status                                   int
	}{
		{http.MethodGet, "", "?v=" + strings.Repeat("a", 64), policy, http.StatusOK},
		{http.MethodHead, "", "?v=" + strings.Repeat("a", 64), policy, http.StatusOK},
		{http.MethodGet, etag, "?v=" + strings.Repeat("a", 64), policy, http.StatusNotModified},
		{http.MethodGet, "", "", "no-cache", http.StatusOK},
		{http.MethodHead, "", "", "no-cache", http.StatusOK},
		{http.MethodGet, etag, "", "no-cache", http.StatusNotModified},
	} {
		t.Run(tc.method+strconv.Itoa(tc.status)+tc.query, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			req := httptest.NewRequest(tc.method, "/tools/fire-showcase/fire-host.js"+tc.query, nil).WithContext(ctx)
			req.Header.Set("Authorization", "Bearer native-secret")
			req.Header.Set("Cookie", "private=secret")
			req.Header.Set("X-Fire-User-ID", "forged")
			req.Header.Set("If-None-Match", tc.condition)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			require.Equal(t, tc.status, w.Code, w.Body.String())
			require.Equal(t, []string{tc.expectedPolicy}, w.Header().Values("Cache-Control"))
			require.Equal(t, etag, w.Header().Get("ETag"))
			require.Equal(t, modified, w.Header().Get("Last-Modified"))
			require.Empty(t, w.Header().Values("Set-Cookie"))
			require.Equal(t, "Accept-Encoding", w.Header().Get("Vary"))
			if tc.method == http.MethodHead || tc.status == http.StatusNotModified {
				require.Empty(t, w.Body.String())
			} else {
				require.Equal(t, "console.log('public');", w.Body.String())
			}
		})
	}
}

func TestFireShowcaseStaticRejectsUnsafeCachingAndErrors(t *testing.T) {
	const publicPolicy = "public, max-age=31536000, immutable"
	for _, tc := range []struct {
		name, resource, contentType string
		status                      int
		policies                    []string
	}{
		{"not found", "/missing.js", "text/javascript", 404, []string{publicPolicy}},
		{"server error", "/broken.js", "text/javascript", 500, []string{publicPolicy}},
		{"redirect", "/redirect.js", "text/javascript", 302, []string{publicPolicy}},
		{"html", "/index.html", "text/html", 200, []string{publicPolicy}},
		{"html mislabelled path", "/script.js", "text/html; charset=utf-8", 200, []string{publicPolicy}},
		{"data", "/config.json", "application/json", 200, []string{publicPolicy}},
		{"unapproved policy", "/script.js", "text/javascript", 200, []string{"public, max-age=999999999"}},
		{"private policy", "/script.js", "text/javascript", 200, []string{"private, max-age=31536000, immutable"}},
		{"conflicting policies", "/script.js", "text/javascript", 200, []string{publicPolicy, "private"}},
		{"missing policy", "/script.js", "text/javascript", 200, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				for _, policy := range tc.policies {
					w.Header().Add("Cache-Control", policy)
				}
				w.Header().Set("Content-Type", tc.contentType)
				w.Header().Set("ETag", `"private-or-error"`)
				w.Header().Set("Last-Modified", "Mon, 19 Oct 2026 12:00:00 GMT")
				w.Header().Set("Expires", "Wed, 21 Oct 2026 12:00:00 GMT")
				w.Header().Set("Age", "12")
				w.Header().Add("Set-Cookie", "sidecar=must-not-escape")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte("body"))
			}))
			defer up.Close()
			h := showcaseTestHandler(t, up.URL)
			r := gin.New()
			r.GET("/tools/fire-showcase/*resource", h.Static)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			req := httptest.NewRequest("GET", "/tools/fire-showcase"+tc.resource, nil).WithContext(ctx)
			// A caller cannot promote a response into public cache with headers.
			req.Header.Set("Cache-Control", publicPolicy)
			req.Header.Set("X-Fire-Public-Asset", "true")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			require.Equal(t, tc.status, w.Code, w.Body.String())
			require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
			require.Equal(t, "Authorization, Cookie", w.Header().Get("Vary"))
			for _, name := range []string{"ETag", "Last-Modified", "Expires", "Age", "Set-Cookie"} {
				require.Empty(t, w.Header().Values(name), name)
			}
		})
	}
}

func TestFireShowcasePrivateResponsesCannotInheritPublicCache(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, showcaseTestUser, r.Header.Get("X-Fire-User-ID"))
		require.Equal(t, "7", r.Header.Get("X-Fire-Tenant-ID"))
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("ETag", `"owned-data"`)
		w.Header().Set("Last-Modified", "Mon, 19 Oct 2026 12:00:00 GMT")
		w.Header().Add("Set-Cookie", "sidecar=must-not-escape")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"owned":true}`))
	}))
	defer up.Close()
	h := showcaseTestHandler(t, up.URL)
	require.NoError(t, h.billing.DB().AutoMigrate(&firebilling.Membership{}))
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), types.UserIDContextKey, showcaseTestUser))
	})
	r.GET("/api/*resource", h.Proxy)
	r.GET("/assets/:user_id/:asset_id/content", h.Asset)
	r.GET("/bootstrap", h.Bootstrap)
	for _, resource := range []string{"/bootstrap", "/api/config", "/api/generation-tasks", "/assets/" + showcaseTestUser + "/sha256_" + strings.Repeat("b", 64) + "/content"} {
		t.Run(resource, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			req := httptest.NewRequest("GET", resource, nil).WithContext(ctx)
			req.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
			req.Header.Set("X-Fire-Public-Asset", "true")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			require.Equal(t, 200, w.Code, w.Body.String())
			require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
			require.Equal(t, "Authorization, Cookie", w.Header().Get("Vary"))
			for _, name := range []string{"ETag", "Last-Modified", "Set-Cookie"} {
				require.Empty(t, w.Header().Values(name), name)
			}
		})
	}
}

func TestFireShowcaseBadStaticPathsDoNotReachUpstreamAndErrorsAreNotCached(t *testing.T) {
	called := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called++ }))
	defer up.Close()
	h := showcaseTestHandler(t, up.URL)
	r := gin.New()
	r.GET("/tools/fire-showcase/*resource", h.Static)
	for _, resource := range []string{"/api/config", "/__local/health", "/../api/config", "/assets/../../config", "/.env", "/assets\\secret.js"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/tools/fire-showcase"+resource, nil))
		require.Equal(t, 404, w.Code, resource)
		require.Equal(t, "no-store", w.Header().Get("Cache-Control"), resource)
	}
	require.Zero(t, called)
	// A dead sidecar is also an uncacheable response, not a cached 502.
	h.target, _ = url.Parse("http://127.0.0.1:1")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/tools/fire-showcase/fire-host.js", nil).WithContext(ctx))
	require.Equal(t, 502, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
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
