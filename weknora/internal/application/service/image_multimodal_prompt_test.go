package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type workspacePromptVLM struct {
	*multimodalFailureVLM
	prompts []string
}

func (m *workspacePromptVLM) Predict(ctx context.Context, images [][]byte, prompt string) (string, error) {
	m.prompts = append(m.prompts, prompt)
	return m.multimodalFailureVLM.Predict(ctx, images, prompt)
}

func TestImageMultimodalWorkerRestoresWorkspacePrompts(t *testing.T) {
	for _, sourceType := range []string{"image", "scanned_pdf"} {
		t.Run(sourceType, func(t *testing.T) {
			model := &workspacePromptVLM{multimodalFailureVLM: &multimodalFailureVLM{
				ocrText: "杨迪", captionText: "姓名杨迪",
			}}
			chunks := &multimodalFailureChunkService{}
			svc := newMultimodalFailureService(model, chunks)
			svc.tenantRepo = multimodalFailureTenantRepo{tenant: &types.Tenant{
				ID: 1,
				SystemPromptConfig: types.SystemPromptConfig{
					"image.ocr":         "工作区图片文字识别助手：只记录姓名。",
					"image.scanned_pdf": "工作区扫描件文字识别助手：只记录姓名。",
					"image.caption":     "工作区图片描述：只用 {{language}} 描述姓名。",
				},
			}}
			var payload types.ImageMultimodalPayload
			require.NoError(t, json.Unmarshal(multimodalFailureTask(t).Payload(), &payload))
			payload.ImageSourceType = sourceType
			payload.Language = "zh-CN"
			body, err := json.Marshal(payload)
			require.NoError(t, err)

			// The production task starts without the request's TenantInfo.
			err = svc.Handle(context.Background(), asynq.NewTask(types.TypeImageMultimodal, body))
			require.NoError(t, err)
			require.Len(t, model.prompts, 2)
			if sourceType == "scanned_pdf" {
				require.Contains(t, model.prompts[0], "工作区扫描件文字识别助手")
			} else {
				require.Contains(t, model.prompts[0], "工作区图片文字识别助手")
			}
			require.Contains(t, model.prompts[1], "工作区图片描述：只用 Chinese (Simplified) 描述姓名。")
			require.Len(t, chunks.chunks, 2, "both customized model outputs must reach stored chunks")
		})
	}
}

func TestImageMultimodalWorkerFailsParentWhenWorkspaceLoadExhaustsRetries(t *testing.T) {
	model := &workspacePromptVLM{multimodalFailureVLM: &multimodalFailureVLM{captionText: "must not run"}}
	svc := newMultimodalFailureService(model, &multimodalFailureChunkService{})
	dbErr := errors.New("workspace configuration unavailable")
	svc.tenantRepo = multimodalFailureTenantRepo{err: dbErr}
	ctx := types.WithTaskRetryMetadata(context.Background(), 3, 3)
	err := svc.Handle(ctx, multimodalFailureTask(t))
	require.ErrorIs(t, err, dbErr)
	require.Empty(t, model.prompts, "a failed configuration lookup must not silently use default rules")
	repo := svc.knowledgeRepo.(*multimodalFailureKnowledgeRepo)
	require.Equal(t, types.ParseStatusFailed, repo.knowledge.ParseStatus, "exhausted retries must leave a recoverable parent failure")
}

func TestBuildVLMCaptionPrompt(t *testing.T) {
	t.Run("uses configured language and custom instructions", func(t *testing.T) {
		got := buildVLMCaptionPrompt(context.Background(), types.VLMConfig{
			DescriptionLanguage: "English",
			CustomInstructions:  "Focus on alarm codes.",
		})
		if !strings.Contains(got, "使用 English") || !strings.Contains(got, "Focus on alarm codes.") {
			t.Fatalf("unexpected prompt: %s", got)
		}
	})

	t.Run("defaults to context language", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), types.LanguageContextKey, "ko-KR")
		got := buildVLMCaptionPrompt(ctx, types.VLMConfig{})
		if !strings.Contains(got, "使用 Korean") {
			t.Fatalf("unexpected prompt: %s", got)
		}
	})
}

func TestMediaPromptOverridesReachRequest(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{
		ID: 7,
		SystemPromptConfig: types.SystemPromptConfig{
			"image.caption":       "只提取客户姓名，输出语言为 {{language}}，100% 保留姓名原文。",
			"video.understanding": "只记录视频中销售提出的问题。",
		},
	})
	caption := buildVLMCaptionPrompt(ctx, types.VLMConfig{DescriptionLanguage: "Chinese"})
	if !strings.Contains(caption, "只提取客户姓名，输出语言为 Chinese，100% 保留姓名原文。") || strings.Contains(caption, "{{language}}") {
		t.Fatalf("caption did not use the saved workspace template: %s", caption)
	}
	video := buildVideoUnderstandingPrompt(ctx, types.VLMConfig{})
	if !strings.Contains(video, "只记录视频中销售提出的问题。") || !strings.Contains(video, "<output_language>") {
		t.Fatalf("video override lost its runtime language: %s", video)
	}
}
