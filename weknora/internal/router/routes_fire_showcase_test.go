package router

import (
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestFireShowcaseMediaCookieOnlyAuthenticatesSameOriginRead(t *testing.T) {
	r := gin.New()
	media := r.Group("/api/fire-showcase-assets")
	media.Use(fireShowcaseMediaAuth())
	media.GET("/:user_id/:asset_id/content", func(c *gin.Context) { c.String(200, c.GetHeader("Authorization")) })
	for _, tc := range []struct {
		method, origin, site, bearer string
		code                         int
		expected                     string
	}{
		{"GET", "", "same-origin", "", 200, "Bearer media-jwt"},
		{"GET", "https://fire.test", "same-origin", "", 200, "Bearer media-jwt"},
		{"GET", "https://attacker.test", "cross-site", "", 403, ""},
		{"GET", "https://attacker.test", "", "", 403, ""},
		{"POST", "", "same-origin", "", 404, ""},
		{"GET", "", "same-origin", "Bearer native-jwt", 200, "Bearer native-jwt"},
	} {
		req := httptest.NewRequest(tc.method, "https://fire.test/api/fire-showcase-assets/user/hash/content", nil)
		req.Header.Set("Cookie", handler.FireShowcaseMediaCookie+"=media-jwt")
		req.Header.Set("Origin", tc.origin)
		req.Header.Set("Sec-Fetch-Site", tc.site)
		req.Header.Set("Authorization", tc.bearer)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		require.Equal(t, tc.code, w.Code)
		if tc.expected != "" {
			require.Equal(t, tc.expected, w.Body.String())
		}
	}
	// An unrelated native API never uses the media-cookie middleware.
	api := gin.New()
	api.GET("/api/v1/fire-showcase/bootstrap", func(c *gin.Context) { c.String(200, c.GetHeader("Authorization")) })
	req := httptest.NewRequest("GET", "/api/v1/fire-showcase/bootstrap", nil)
	req.Header.Set("Cookie", handler.FireShowcaseMediaCookie+"=media-jwt")
	w := httptest.NewRecorder()
	api.ServeHTTP(w, req)
	require.Empty(t, w.Body.String())
}
