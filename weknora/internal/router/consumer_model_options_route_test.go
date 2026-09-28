package router

import (
	"net/http"
	"testing"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConsumerSceneOptionsRoutePrecedesModelIDRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	v1 := engine.Group("/api/v1")
	RegisterModelRoutes(v1, &handler.ModelHandler{}, &handler.ModelCredentialsHandler{}, &rbacGuards{})

	routes := engine.Routes()
	sceneIndex, modelIndex := -1, -1
	for idx, route := range routes {
		if route.Method != http.MethodGet {
			continue
		}
		switch route.Path {
		case "/api/v1/models/scene-options/:scene":
			sceneIndex = idx
		case "/api/v1/models/:id":
			modelIndex = idx
		}
	}
	require.GreaterOrEqual(t, sceneIndex, 0)
	require.GreaterOrEqual(t, modelIndex, 0)
	require.Less(t, sceneIndex, modelIndex)
}
