package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

type consumerModelPolicyOptionResponse struct {
	ModelID     string          `json:"model_id"`
	DisplayName string          `json:"display_name"`
	ModelType   types.ModelType `json:"model_type"`
}

type consumerModelPolicySceneResponse struct {
	Scene              types.ConsumerScene                 `json:"scene"`
	Label              string                              `json:"label"`
	Description        string                              `json:"description"`
	ModelType          types.ModelType                     `json:"model_type"`
	FreeDefaultModelID string                              `json:"free_default_model_id"`
	PaidModelIDs       []string                            `json:"paid_model_ids"`
	Options            []consumerModelPolicyOptionResponse `json:"options"`
}

type updateConsumerModelPolicyRequest struct {
	FreeDefaultModelID *string   `json:"free_default_model_id"`
	PaidModelIDs       *[]string `json:"paid_model_ids"`
}

type consumerModelPolicyMetadata struct {
	label       string
	description string
}

var consumerModelPolicyMetadataByScene = map[types.ConsumerScene]consumerModelPolicyMetadata{
	types.ConsumerSceneRAG: {
		label:       "智能体模型",
		description: "知识库、Wiki 或网页检索后的最终答案生成。",
	},
	types.ConsumerSceneRerank: {
		label:       "Rerank",
		description: "对检索结果进行重排。",
	},
	types.ConsumerSceneWiki: {
		label:       "Wiki",
		description: "Wiki 内容合成。",
	},
	types.ConsumerSceneVision: {
		label:       "视觉模型",
		description: "图片、PDF 和其他视觉内容理解。",
	},
	types.ConsumerSceneASR: {
		label:       "语音模型",
		description: "音频转文字。",
	},
}

func configurableConsumerScene(raw string) (types.ConsumerScene, bool) {
	scene := types.ConsumerScene(strings.TrimSpace(raw))
	for _, candidate := range types.ConsumerScenes() {
		if scene == candidate {
			return scene, true
		}
	}
	return "", false
}

func safeConsumerPolicyCatalog(models []*types.Model) map[types.ModelType][]consumerModelPolicyOptionResponse {
	byType := make(map[types.ModelType][]consumerModelPolicyOptionResponse)
	for _, model := range models {
		if model == nil || model.Status != types.ModelStatusActive || !service.IsOpenRouterConsumerModel(model) {
			continue
		}
		displayName := strings.TrimSpace(model.DisplayName)
		if displayName == "" {
			displayName = strings.TrimSpace(model.Name)
		}
		byType[model.Type] = append(byType[model.Type], consumerModelPolicyOptionResponse{
			ModelID: model.ID, DisplayName: displayName, ModelType: model.Type,
		})
	}
	for modelType := range byType {
		sort.SliceStable(byType[modelType], func(i, j int) bool {
			left, right := byType[modelType][i], byType[modelType][j]
			if left.DisplayName == right.DisplayName {
				return left.ModelID < right.ModelID
			}
			return left.DisplayName < right.DisplayName
		})
	}
	return byType
}

func consumerPolicyOptionIDs(options []consumerModelPolicyOptionResponse) map[string]struct{} {
	ids := make(map[string]struct{}, len(options))
	for _, option := range options {
		ids[option.ModelID] = struct{}{}
	}
	return ids
}

func (h *SystemHandler) consumerModelPolicyScene(
	c *gin.Context,
	scene types.ConsumerScene,
	catalog map[types.ModelType][]consumerModelPolicyOptionResponse,
) (*consumerModelPolicySceneResponse, error) {
	options := catalog[scene.ModelType()]
	if len(options) == 0 {
		return nil, fmt.Errorf("no active builtin OpenRouter model is available for %s", scene)
	}
	ids := consumerPolicyOptionIDs(options)
	freeID := scene.CompatibilityDefaultID()
	if row, err := h.systemSettingSvc.Get(c.Request.Context(), scene.FreeDefaultKey()); err == nil && row != nil {
		if value, decodeErr := row.AsString(); decodeErr == nil {
			value = strings.TrimSpace(value)
			if _, ok := ids[value]; ok {
				freeID = value
			}
		}
	}
	if _, ok := ids[freeID]; !ok {
		freeID = options[0].ModelID
	}

	paidIDs := make([]string, 0, len(options))
	if row, err := h.systemSettingSvc.Get(c.Request.Context(), scene.PaidOptionsKey()); err == nil && row != nil {
		if values, decodeErr := row.AsStringList(); decodeErr == nil {
			seen := make(map[string]struct{}, len(values))
			for _, value := range values {
				value = strings.TrimSpace(value)
				if _, ok := ids[value]; !ok {
					continue
				}
				if _, duplicate := seen[value]; duplicate {
					continue
				}
				seen[value] = struct{}{}
				paidIDs = append(paidIDs, value)
			}
		}
	}
	if len(paidIDs) == 0 {
		paidIDs = []string{freeID}
	}
	metadata := consumerModelPolicyMetadataByScene[scene]
	return &consumerModelPolicySceneResponse{
		Scene: scene, Label: metadata.label, Description: metadata.description,
		ModelType: scene.ModelType(), FreeDefaultModelID: freeID,
		PaidModelIDs: paidIDs, Options: options,
	}, nil
}

func (h *SystemHandler) consumerModelPolicyCatalog(c *gin.Context) (map[types.ModelType][]consumerModelPolicyOptionResponse, error) {
	if h.modelRepo == nil || h.systemSettingSvc == nil {
		return nil, fmt.Errorf("consumer model policy service is unavailable")
	}
	models, err := h.modelRepo.List(c.Request.Context(), 0, "", "")
	if err != nil {
		return nil, err
	}
	return safeConsumerPolicyCatalog(models), nil
}

// GetConsumerModelPolicy exposes exactly the five supported consumer model
// boundaries and display-only model metadata. It intentionally omits Chat,
// Embedding, provider parameters, endpoints, and credentials.
func (h *SystemHandler) GetConsumerModelPolicy(c *gin.Context) {
	catalog, err := h.consumerModelPolicyCatalog(c)
	if err != nil {
		logger.Errorf(c.Request.Context(), "get consumer model policy catalog failed: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Consumer model policy is unavailable"})
		return
	}
	scenes := make([]*consumerModelPolicySceneResponse, 0, len(types.ConsumerScenes()))
	for _, scene := range types.ConsumerScenes() {
		entry, buildErr := h.consumerModelPolicyScene(c, scene, catalog)
		if buildErr != nil {
			logger.Errorf(c.Request.Context(), "get consumer model policy scene=%s failed: %v", scene, buildErr)
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": buildErr.Error()})
			return
		}
		scenes = append(scenes, entry)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"scenes": scenes}})
}

// UpdateConsumerModelPolicy updates one field at a time so each request is
// atomic. Every candidate is revalidated against the current active builtin
// OpenRouter catalog and the scene's native model type before persistence.
func (h *SystemHandler) UpdateConsumerModelPolicy(c *gin.Context) {
	scene, ok := configurableConsumerScene(c.Param("scene"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid consumer model scene"})
		return
	}
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	var request updateConsumerModelPolicyRequest
	if err := decoder.Decode(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid consumer model policy request"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid consumer model policy request"})
		return
	}
	if (request.FreeDefaultModelID == nil) == (request.PaidModelIDs == nil) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "update exactly one policy field"})
		return
	}

	catalog, err := h.consumerModelPolicyCatalog(c)
	if err != nil {
		logger.Errorf(c.Request.Context(), "update consumer model policy catalog failed: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Consumer model policy is unavailable"})
		return
	}
	ids := consumerPolicyOptionIDs(catalog[scene.ModelType()])
	if len(ids) == 0 {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "No compatible model is available"})
		return
	}

	if request.FreeDefaultModelID != nil {
		modelID := strings.TrimSpace(*request.FreeDefaultModelID)
		if _, exists := ids[modelID]; modelID == "" || !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "free default model is not a compatible catalog model"})
			return
		}
		if _, err = h.systemSettingSvc.Update(c.Request.Context(), scene.FreeDefaultKey(), modelID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	} else {
		values := *request.PaidModelIDs
		if len(values) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "paid model list must not be empty"})
			return
		}
		normalized := make([]string, 0, len(values))
		seen := make(map[string]struct{}, len(values))
		for _, value := range values {
			value = strings.TrimSpace(value)
			if _, exists := ids[value]; value == "" || !exists {
				c.JSON(http.StatusBadRequest, gin.H{"error": "paid model is not a compatible catalog model"})
				return
			}
			if _, duplicate := seen[value]; duplicate {
				c.JSON(http.StatusBadRequest, gin.H{"error": "paid model list contains duplicates"})
				return
			}
			seen[value] = struct{}{}
			normalized = append(normalized, value)
		}
		if _, err = h.systemSettingSvc.Update(c.Request.Context(), scene.PaidOptionsKey(), normalized); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	entry, err := h.consumerModelPolicyScene(c, scene, catalog)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": entry})
}
