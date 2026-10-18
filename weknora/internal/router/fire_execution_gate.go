package router

import (
	"strings"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/gin-gonic/gin"
)

func fireUserExecutionGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if firebilling.UserExecutionPaused(c.Request.Context()) {
			for _, prefix := range []string{"/api/v1/skills", "/api/v1/sandbox-configs"} {
				if c.Request.URL.Path == prefix || strings.HasPrefix(c.Request.URL.Path, prefix+"/") {
					c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "沙箱和技能暂未开放"})
					return
				}
			}
		}
		c.Next()
	}
}
