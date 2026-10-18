package router

import (
	"context"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"testing"
)

func TestFireExecutionPauseBlocksOnlyUserSkillAndSandboxRoutes(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	t.Setenv("FIRE_USER_EXECUTION_PAUSED", "true")
	for _, admin := range []bool{false, true} {
		for _, path := range []string{"/api/v1/skills", "/api/v1/skills/catalog/demo/install", "/api/v1/sandbox-configs/test/skills", "/api/v1/knowledge-bases/test", "/api/v1/agent-chat/test"} {
			r := gin.New()
			r.Use(fireUserExecutionGate())
			r.Any("/*path", func(c *gin.Context) { c.Status(204) })
			req := httptest.NewRequest("GET", path, nil)
			req = req.WithContext(context.WithValue(req.Context(), types.SystemAdminContextKey, admin))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			expected := 204
			if !admin && (path == "/api/v1/skills" || path == "/api/v1/skills/catalog/demo/install" || path == "/api/v1/sandbox-configs/test/skills") {
				expected = 403
			}
			require.Equal(t, expected, w.Code, path)
		}
	}
	t.Setenv("FIRE_USER_EXECUTION_PAUSED", "false")
	r := gin.New()
	r.Use(fireUserExecutionGate())
	r.GET("/api/v1/skills", func(c *gin.Context) { c.Status(204) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/skills", nil))
	require.Equal(t, 204, w.Code)
}
