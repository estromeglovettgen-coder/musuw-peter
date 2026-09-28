package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type graphTestWikiService struct {
	interfaces.WikiPageService
	request *types.WikiGraphRequest
}

func (s *graphTestWikiService) GetGraph(
	_ context.Context,
	request *types.WikiGraphRequest,
) (*types.WikiGraphData, error) {
	s.request = request
	return &types.WikiGraphData{}, nil
}

type graphTestKnowledgeBaseService struct {
	interfaces.KnowledgeBaseService
}

func (s *graphTestKnowledgeBaseService) GetKnowledgeBaseByID(
	_ context.Context,
	id string,
) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{
		ID: id,
		IndexingStrategy: types.IndexingStrategy{
			WikiEnabled: true,
		},
	}, nil
}

func graphTestRouter(wikiService interfaces.WikiPageService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(types.TenantIDContextKey.String(), uint64(1))
		c.Next()
	})
	handler := NewWikiPageHandler(
		wikiService,
		&graphTestKnowledgeBaseService{},
		nil,
		nil,
		nil,
	)
	router.GET("/knowledgebase/:kb_id/wiki/graph", handler.GetGraph)
	return router
}

func TestWikiGraphLimitDefaultsAndClampsAtOriginalBound(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantLimit int
	}{
		{name: "default remains bounded", query: "", wantLimit: 500},
		{name: "original maximum is accepted", query: "?limit=2000", wantLimit: 2000},
		{name: "oversized request is clamped", query: "?limit=50000", wantLimit: 2000},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			wikiService := &graphTestWikiService{}
			request := httptest.NewRequest(
				http.MethodGet,
				"/knowledgebase/kb-1/wiki/graph"+test.query,
				nil,
			)
			response := httptest.NewRecorder()

			graphTestRouter(wikiService).ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
			}
			if wikiService.request == nil {
				t.Fatal("graph service was not called")
			}
			if wikiService.request.Limit != test.wantLimit {
				t.Fatalf("limit = %d, want %d", wikiService.request.Limit, test.wantLimit)
			}
		})
	}
}
