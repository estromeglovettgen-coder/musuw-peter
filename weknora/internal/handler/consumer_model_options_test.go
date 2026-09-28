package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type consumerOptionsResolverStub struct {
	interfaces.ConsumerModelResolver
	options []*types.ConsumerModelOption
}

func (s *consumerOptionsResolverStub) ListConsumerModelOptions(context.Context, types.ConsumerScene) ([]*types.ConsumerModelOption, error) {
	return s.options, nil
}

func TestListConsumerSceneOptionsReturnsSafeContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	resolver := &consumerOptionsResolverStub{options: []*types.ConsumerModelOption{
		{ModelID: "free-model", DisplayName: "Free", Selectable: true, SceneDefault: true, Effective: true},
		{ModelID: "paid-model", DisplayName: "Paid", Locked: true, RequiredPlan: "paid"},
	}}
	h := NewModelHandlerWithConsumerResolver(nil, resolver)
	r := gin.New()
	r.GET("/api/v1/models/scene-options/:scene", h.ListConsumerSceneOptions)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/models/scene-options/rag", nil)
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := map[string]any{}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, true, body["success"])
	data, ok := body["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "rag", data["scene"])
	assert.Equal(t, "free-model", data["effective_model_id"])
	assert.NotContains(t, strings.ToLower(recorder.Body.String()), "provider")
	assert.NotContains(t, strings.ToLower(recorder.Body.String()), "api_key")
	assert.NotContains(t, strings.ToLower(recorder.Body.String()), "parameters")
}

func TestListConsumerSceneOptionsRejectsHiddenChatScene(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewModelHandlerWithConsumerResolver(nil, &consumerOptionsResolverStub{})
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Next()
		if len(c.Errors) > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": c.Errors.Last().Error()})
		}
	})
	r.GET("/api/v1/models/scene-options/:scene", h.ListConsumerSceneOptions)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/models/scene-options/chat", nil)
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, req)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestListConsumerSceneOptionsRejectsUnknownScene(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewModelHandlerWithConsumerResolver(nil, &consumerOptionsResolverStub{})
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Next()
		if len(c.Errors) > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": c.Errors.Last().Error()})
		}
	})
	r.GET("/api/v1/models/scene-options/:scene", h.ListConsumerSceneOptions)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/models/scene-options/not-a-scene", nil)
	recorder := httptest.NewRecorder()
	r.ServeHTTP(recorder, req)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}
