package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type promptTenantService struct {
	interfaces.TenantService
	tenants map[uint64]*types.Tenant
}

func (s *promptTenantService) UpdateSystemPrompt(_ context.Context, tenantID uint64, id, content string) error {
	if content == "" {
		delete(s.tenants[tenantID].SystemPromptConfig, id)
	} else {
		s.tenants[tenantID].SystemPromptConfig[id] = content
	}
	return nil
}
func (s *promptTenantService) GetTenantByID(_ context.Context, id uint64) (*types.Tenant, error) {
	return s.tenants[id], nil
}

func TestSystemPromptSaveReadResetIsWorkspaceScoped(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := &promptTenantService{tenants: map[uint64]*types.Tenant{1: {ID: 1, SystemPromptConfig: types.SystemPromptConfig{}}, 2: {ID: 2, SystemPromptConfig: types.SystemPromptConfig{}}}}
	h := &TenantHandler{service: svc, config: &config.Config{Conversation: &config.ConversationConfig{GenerateSummaryPrompt: "默认摘要规则"}}}
	call := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("PUT", "/", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		ctx := context.WithValue(c.Request.Context(), types.TenantIDContextKey, uint64(1))
		c.Request = c.Request.WithContext(context.WithValue(ctx, types.TenantInfoContextKey, svc.tenants[1]))
		h.updateSystemPrompt(c)
		require.Empty(t, c.Errors)
		return w
	}
	w := call(`{"id":"conversation.document_summary","content":"只记录姓名"}`)
	require.Equal(t, 200, w.Code)
	require.Equal(t, "只记录姓名", svc.tenants[1].SystemPromptConfig["conversation.document_summary"])
	require.Empty(t, svc.tenants[2].SystemPromptConfig)
	var response struct {
		Data struct {
			Items []systemPromptItem `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	found := false
	for _, item := range response.Data.Items {
		if item.ID == "conversation.document_summary" {
			require.Equal(t, "只记录姓名", item.Content)
			require.True(t, item.Customized)
			found = true
		}
	}
	require.True(t, found)
	call(`{"id":"conversation.document_summary","content":""}`)
	require.Empty(t, svc.tenants[1].SystemPromptConfig)
}

func TestPromptValidationKeepsRuntimeDataAndRejectsUnknownFields(t *testing.T) {
	item := systemPromptItem{Variables: promptVariables("{{schema}} {{samples}} {{table_name}}")}
	require.NoError(t, validateSystemPrompt(item, "只分析 {{schema}} 的 {{table_name}}，参考 {{samples}}"))
	require.Error(t, validateSystemPrompt(item, "不传入任何表格"))
	require.Error(t, validateSystemPrompt(item, "{{schema}} {{samples}} {{table_name}} {{unknown}}"))
	require.Error(t, validateSystemPrompt(item, "{{if}}"))
	require.Equal(t, []string{"{{.Chunks}}", "{{.Title}}"}, promptVariables("正文 .NotAVariable {{if .Title}}{{.Title}}{{end}}{{range .Chunks}}{{.}}{{end}}"))
	for _, variable := range []string{"{{.Items}}", "{{.CandidateSlugs}}", "{{.ChunksXML}}", "{{.DocumentSummaries}}", "{{.DeletedContent}}", "{{.RemainingSourcesContent}}"} {
		require.Error(t, validateSystemPrompt(systemPromptItem{Variables: []string{variable}}, "删除全部来源输入"))
	}
	for _, item := range systemPromptCatalog(&config.Config{}) {
		t.Run(item.ID, func(t *testing.T) {
			require.NotEmpty(t, item.Name)
			require.NoError(t, validateSystemPrompt(item, item.DefaultContent))
		})
	}
}

func TestSystemPromptCatalogExposesActualGraphExtractionWorkerTemplate(t *testing.T) {
	cfg := &config.Config{
		Conversation:   &config.ConversationConfig{ExtractEntitiesPrompt: "unused entities", ExtractRelationshipsPrompt: "unused relations"},
		ExtractManager: &config.ExtractManagerConfig{ExtractGraph: &types.PromptTemplateStructured{Description: "提取资料关系，类型为：%s"}},
	}
	found := false
	for _, item := range systemPromptCatalog(cfg) {
		require.NotEqual(t, "conversation.graph_entities", item.ID)
		require.NotEqual(t, "conversation.graph_relations", item.ID)
		if item.ID != "graph.extraction" {
			continue
		}
		found = true
		require.Equal(t, "提取资料关系，类型为：{{relation_types}}", item.DefaultContent)
		require.Equal(t, []string{"{{relation_types}}"}, item.Variables)
		require.NoError(t, validateSystemPrompt(item, item.DefaultContent))
		require.Error(t, validateSystemPrompt(item, "删除关系类型输入"))
	}
	require.True(t, found)
}
