package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	modelprovider "github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

type consumerPolicySettingsStub struct {
	interfaces.SystemSettingService
	rows    map[string]*types.SystemSetting
	updates map[string]any
}

func (s *consumerPolicySettingsStub) Get(_ context.Context, key string) (*types.SystemSetting, error) {
	return s.rows[key], nil
}

func (s *consumerPolicySettingsStub) Update(_ context.Context, key string, value any) (*types.SystemSetting, error) {
	if s.updates == nil {
		s.updates = map[string]any{}
	}
	s.updates[key] = value
	return s.rows[key], nil
}

type consumerPolicyModelRepoStub struct {
	models []*types.Model
}

func (s *consumerPolicyModelRepoStub) Create(context.Context, *types.Model) error { return nil }
func (s *consumerPolicyModelRepoStub) GetByID(context.Context, uint64, string) (*types.Model, error) {
	return nil, nil
}
func (s *consumerPolicyModelRepoStub) List(context.Context, uint64, types.ModelType, types.ModelSource) ([]*types.Model, error) {
	return s.models, nil
}
func (s *consumerPolicyModelRepoStub) Update(context.Context, *types.Model) error   { return nil }
func (s *consumerPolicyModelRepoStub) Delete(context.Context, uint64, string) error { return nil }
func (s *consumerPolicyModelRepoStub) ClearDefaultByType(context.Context, uint, types.ModelType, string) error {
	return nil
}

func policySetting(key, valueType, raw string) *types.SystemSetting {
	return &types.SystemSetting{Key: key, ValueType: valueType, Value: types.JSON(raw)}
}

func policyModel(id, name string, modelType types.ModelType, active, builtin bool, provider string) *types.Model {
	status := types.ModelStatusDownloading
	if active {
		status = types.ModelStatusActive
	}
	return &types.Model{
		ID: id, Name: name, DisplayName: name, Type: modelType, Status: status, IsBuiltin: builtin,
		Source: types.ModelSourceRemote,
		Parameters: types.ModelParameters{
			Provider: provider, BaseURL: modelprovider.OpenRouterBaseURL, APIKey: "must-not-leak",
		},
	}
}

func newConsumerPolicyTestHandler() (*SystemHandler, *consumerPolicySettingsStub) {
	settings := &consumerPolicySettingsStub{rows: map[string]*types.SystemSetting{
		"consumer_models.rag.free_default":    policySetting("consumer_models.rag.free_default", "string", `"rag-free"`),
		"consumer_models.rag.paid_options":    policySetting("consumer_models.rag.paid_options", "string_list", `["rag-paid","rag-free"]`),
		"consumer_models.rerank.free_default": policySetting("consumer_models.rerank.free_default", "string", `"rank"`),
		"consumer_models.rerank.paid_options": policySetting("consumer_models.rerank.paid_options", "string_list", `["rank"]`),
		"consumer_models.wiki.free_default":   policySetting("consumer_models.wiki.free_default", "string", `"rag-free"`),
		"consumer_models.wiki.paid_options":   policySetting("consumer_models.wiki.paid_options", "string_list", `["rag-paid"]`),
		"consumer_models.vision.free_default": policySetting("consumer_models.vision.free_default", "string", `"vision"`),
		"consumer_models.vision.paid_options": policySetting("consumer_models.vision.paid_options", "string_list", `["vision"]`),
		"consumer_models.asr.free_default":    policySetting("consumer_models.asr.free_default", "string", `"asr"`),
		"consumer_models.asr.paid_options":    policySetting("consumer_models.asr.paid_options", "string_list", `["asr"]`),
	}}
	repo := &consumerPolicyModelRepoStub{models: []*types.Model{
		policyModel("rag-free", "RAG Free", types.ModelTypeKnowledgeQA, true, true, "openrouter"),
		policyModel("rag-paid", "RAG Paid", types.ModelTypeKnowledgeQA, true, true, "openrouter"),
		policyModel("rank", "Rerank", types.ModelTypeRerank, true, true, "openrouter"),
		policyModel("vision", "Vision", types.ModelTypeVLLM, true, true, "openrouter"),
		policyModel("asr", "ASR", types.ModelTypeASR, true, true, "openrouter"),
		policyModel("embedding", "Embedding", types.ModelTypeEmbedding, true, true, "openrouter"),
		policyModel("custom", "Custom", types.ModelTypeKnowledgeQA, true, false, "openrouter"),
		policyModel("inactive", "Inactive", types.ModelTypeKnowledgeQA, false, true, "openrouter"),
		policyModel("unsafe", "Unsafe", types.ModelTypeKnowledgeQA, true, true, "openai"),
		policyModelWithMutation("unsafe-local", "Unsafe Local", types.ModelTypeKnowledgeQA, func(model *types.Model) {
			model.Source = types.ModelSourceLocal
		}),
		policyModelWithMutation("unsafe-blank-source", "Unsafe Blank Source", types.ModelTypeKnowledgeQA, func(model *types.Model) {
			model.Source = ""
		}),
		policyModelWithMutation("unsafe-missing-endpoint", "Unsafe Missing Endpoint", types.ModelTypeKnowledgeQA, func(model *types.Model) {
			model.Parameters.BaseURL = ""
		}),
		policyModelWithMutation("unsafe-wrong-endpoint", "Unsafe Endpoint", types.ModelTypeKnowledgeQA, func(model *types.Model) {
			model.Parameters.BaseURL = "https://api.openai.com/v1"
		}),
		policyModelWithMutation("unsafe-mixed-provider", "Unsafe Mixed Provider", types.ModelTypeKnowledgeQA, func(model *types.Model) {
			model.Parameters.Provider = "OpenRouter"
		}),
	}}
	return &SystemHandler{systemSettingSvc: settings, modelRepo: repo}, settings
}

func policyModelWithMutation(id, name string, modelType types.ModelType, mutate func(*types.Model)) *types.Model {
	model := policyModel(id, name, modelType, true, true, "openrouter")
	mutate(model)
	return model
}

func TestGetConsumerModelPolicyReturnsFiveSafeRealCatalogs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler, _ := newConsumerPolicyTestHandler()
	router := gin.New()
	router.GET("/policy", handler.GetConsumerModelPolicy)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/policy", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data struct {
			Scenes []consumerModelPolicySceneResponse `json:"scenes"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	wantScenes := []types.ConsumerScene{types.ConsumerSceneRAG, types.ConsumerSceneRerank, types.ConsumerSceneWiki, types.ConsumerSceneVision, types.ConsumerSceneASR}
	if len(response.Data.Scenes) != len(wantScenes) {
		t.Fatalf("scenes = %#v", response.Data.Scenes)
	}
	for i, scene := range response.Data.Scenes {
		if scene.Scene != wantScenes[i] {
			t.Fatalf("scene[%d] = %q, want %q", i, scene.Scene, wantScenes[i])
		}
		for _, option := range scene.Options {
			if option.ModelType != scene.ModelType || option.ModelID == "embedding" || option.ModelID == "custom" || option.ModelID == "inactive" ||
				option.ModelID == "unsafe" || option.ModelID == "unsafe-local" || option.ModelID == "unsafe-blank-source" || option.ModelID == "unsafe-missing-endpoint" ||
				option.ModelID == "unsafe-wrong-endpoint" || option.ModelID == "unsafe-mixed-provider" {
				t.Fatalf("unsafe or wrong-typed option leaked: %#v", option)
			}
		}
	}
	if strings.Contains(recorder.Body.String(), "must-not-leak") || strings.Contains(recorder.Body.String(), "api_key") {
		t.Fatalf("model credentials leaked: %s", recorder.Body.String())
	}
}

func TestUpdateConsumerModelPolicyRejectsForgedOrWrongTypedIDs(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler, settings := newConsumerPolicyTestHandler()
	router := gin.New()
	router.PUT("/policy/:scene", handler.UpdateConsumerModelPolicy)

	for _, tc := range []struct {
		name string
		body string
	}{
		{name: "unknown", body: `{"free_default_model_id":"missing"}`},
		{name: "wrong type", body: `{"free_default_model_id":"rank"}`},
		{name: "duplicate paid", body: `{"paid_model_ids":["rag-free","rag-free"]}`},
		{name: "empty paid", body: `{"paid_model_ids":[]}`},
		{name: "two fields", body: `{"free_default_model_id":"rag-free","paid_model_ids":["rag-paid"]}`},
		{name: "unknown field", body: `{"free_default_model_id":"rag-free","parameters":{"api_key":"x"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/policy/rag", strings.NewReader(tc.body)))
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
	if len(settings.updates) != 0 {
		t.Fatalf("invalid updates reached settings: %#v", settings.updates)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/policy/rag", strings.NewReader(`{"paid_model_ids":["rag-paid","rag-free"]}`)))
	if recorder.Code != http.StatusOK {
		t.Fatalf("valid status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	got, ok := settings.updates["consumer_models.rag.paid_options"].([]string)
	if !ok || len(got) != 2 || got[0] != "rag-paid" || got[1] != "rag-free" {
		t.Fatalf("ordered paid update = %#v", settings.updates)
	}
}
