package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	werrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/models/vlm"
	"github.com/Tencent/WeKnora/internal/types"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/hibiken/asynq"
)

const (
	defaultVideoModelID       = "builtin-openrouter-vlm-qwen-3-7-flash"
	legacyMiMoVideoModelID    = "builtin-openrouter-vlm-mimo-v2-5"
	directYouTubeVideoModelID = "builtin-openrouter-vlm-youtube"

	// VideoParsingPublicMessage is the consumer-visible active parsing state.
	VideoParsingPublicMessage = "原视频已保存，正在解析"
	// VideoRetryingPublicMessage is the consumer-visible sole-retry state.
	VideoRetryingPublicMessage = "视频解析暂时没有得到结果，正在重试"
	// VideoParseFailedPublicMessage is the sanitized terminal parse failure.
	VideoParseFailedPublicMessage = "视频解析失败，原视频已保存，可以重新解析"
	// VideoTooLargePublicMessage is the sanitized product-size failure.
	VideoTooLargePublicMessage = "视频超过 300 MB，当前版本暂不支持"
	// VideoSourceFailedPublicMessage is the sanitized source retrieval failure.
	VideoSourceFailedPublicMessage = "视频来源获取失败，请稍后重试"
	// VideoFormatFailedPublicMessage is the sanitized unsupported-format failure.
	VideoFormatFailedPublicMessage = "暂不支持此视频格式"
	// VideoCreditExhaustedPublicMessage is the consumer-visible account limit state.
	VideoCreditExhaustedPublicMessage = "本周期视频解析额度已用尽，原视频已保存；额度恢复后可重新解析"
)

// analyzeYouTubeVideo asks Google AI Studio to read the public YouTube work
// directly. This deliberately avoids resolving or downloading temporary
// googlevideo URLs; the returned Markdown is the durable knowledge source.
func (s *knowledgeService) analyzeYouTubeVideo(
	ctx context.Context,
	videoURL string,
	cfg types.VLMConfig,
) (string, error) {
	if s == nil || s.modelService == nil {
		return "", errors.New("YouTube video model is not configured")
	}
	model, err := s.modelService.GetVLMModel(ctx, directYouTubeVideoModelID)
	if err != nil {
		return "", fmt.Errorf("load YouTube video model: %w", err)
	}
	if !vlm.SupportsVideoURL(model) {
		return "", errors.New("YouTube video model does not support URL input")
	}

	prompt := buildVideoUnderstandingPrompt(ctx, cfg)
	var markdown string
	for attempt := 0; attempt < 2; attempt++ {
		markdown, err = vlm.PredictVideoURL(ctx, model, videoURL, "video/mp4", prompt)
		markdown = strings.TrimSpace(markdown)
		if err == nil && markdown != "" {
			return markdown, nil
		}
		if err == nil {
			err = vlm.RetryableVideoError(errors.New("YouTube video understanding returned empty content"))
		}
		if !vlm.IsRetryableVideoError(err) {
			break
		}
	}
	return "", fmt.Errorf("analyze YouTube video: %w", err)
}

func fixedVideoModelID() string {
	if configured := strings.TrimSpace(os.Getenv("MUSUW_VIDEO_VLM_MODEL_ID")); configured != "" {
		return configured
	}
	return defaultVideoModelID
}

type videoFailureKind string

const (
	videoFailureParse  videoFailureKind = "parse"
	videoFailureSource videoFailureKind = "source"
	videoFailureSize   videoFailureKind = "size"
	videoFailureFormat videoFailureKind = "format"
)

const videoUnderstandingPrompt = `<system_prompt>
You are a factual video understanding assistant. Convert the video into searchable Markdown in the requested language.
</system_prompt>

<instructions>
1. The first line must be a level-1 Markdown heading containing a concise title: # <title>.
   Follow it with a concise summary.
2. Record important visual events in chronological order with timestamps when they can be determined.
3. Transcribe spoken content and visible on-screen text as accurately as possible.
4. Identify people, objects, actions, locations, and relationships only when supported by the video.
5. Do not invent missing details or output reasoning. Output Markdown only.
</instructions>`

func buildVideoUnderstandingPrompt(ctx context.Context, cfg types.VLMConfig) string {
	language := strings.TrimSpace(cfg.DescriptionLanguage)
	if language == "" {
		language = types.LanguageNameFromContext(ctx)
	}
	prompt := fmt.Sprintf("%s\n\n<output_language>%s</output_language>", videoUnderstandingPrompt, language)
	return types.AppendCustomPromptInstructions(prompt, cfg.CustomInstructions, "video_understanding")
}

func (s *knowledgeService) convertVideo(
	ctx context.Context,
	payload types.DocumentProcessPayload,
	kb *types.KnowledgeBase,
	knowledge *types.Knowledge,
	eff types.EffectiveProcessConfig,
	_ bool,
) (*types.ReadResult, error) {
	mimeType := videoMIMEType(payload.FileType)
	if mimeType == "" {
		return s.failVideoKnowledge(
			ctx, knowledge, videoFailureFormat, false,
			fmt.Errorf("unsupported video type: %s", payload.FileType),
		)
	}

	videoSize, err := s.authoritativeVideoSourceSize(ctx, knowledge, payload.FilePath)
	if err != nil {
		return s.failVideoKnowledge(ctx, knowledge, videoFailureSource, videoFailureRetryable(err), err)
	}
	if videoSize > secutils.GetMaxVideoFileSizeBytes() {
		return s.failVideoKnowledge(
			ctx, knowledge, videoFailureSize, false,
			fmt.Errorf(
				"video source size %d exceeds product maximum %d",
				videoSize,
				secutils.GetMaxVideoFileSizeBytes(),
			),
		)
	}

	knowledge.ParseStatus = types.ParseStatusProcessing
	knowledge.ErrorMessage = VideoParsingPublicMessage
	knowledge.UpdatedAt = time.Now()
	if err := s.repo.UpdateKnowledge(ctx, knowledge); err != nil {
		logger.Warnf(ctx, "[Video] failed to publish parsing state for %s: %v", knowledge.ID, err)
	}

	modelID := fixedVideoModelID()
	model, err := s.modelService.GetVLMModel(ctx, modelID)
	if err != nil {
		logger.Errorf(ctx, "[Video] failed to load fixed model id=%s knowledge=%s: %v", modelID, knowledge.ID, err)
		return s.failVideoKnowledge(ctx, knowledge, videoFailureParse, videoFailureRetryable(err), err)
	}

	fileService := s.resolveFileServiceForPath(ctx, kb, payload.FilePath)
	if fileService == nil {
		err := fmt.Errorf("video storage service is not configured")
		return s.failVideoKnowledge(ctx, knowledge, videoFailureSource, false, err)
	}

	prompt := buildVideoUnderstandingPrompt(ctx, eff.VLMConfig)
	var videoBytes []byte
	var markdown string
	usedURL := false
	var urlSourceErr error

	// Object storage implementations can return a signed HTTP(S) URL. Pass it
	// directly to explicitly URL-capable OpenRouter models so large videos never
	// take the read-all -> Base64 path. A local:// URL is intentionally treated
	// as unavailable and falls back to the existing bounded inline path.
	if vlm.SupportsVideoURL(model) {
		videoURLPath, urlErr := s.videoURLSourcePath(ctx, payload.FilePath)
		var videoURL string
		if urlErr == nil {
			videoURL, urlErr = fileService.GetFileURL(ctx, videoURLPath)
		}
		if urlErr == nil && isUsableVideoURL(videoURL) {
			usedURL = true
			markdown, err = vlm.PredictVideoURL(ctx, model, videoURL, mimeType, prompt)
		} else {
			urlSourceErr = urlErr
			if urlSourceErr == nil {
				urlSourceErr = fmt.Errorf("video storage returned a non-HTTP URL")
			}
			if urlErr != nil {
				logger.Warnf(
					ctx,
					"[Video] URL transport unavailable for %s: %v",
					knowledge.ID,
					urlErr,
				)
			} else {
				logger.Warnf(
					ctx,
					"[Video] storage returned a non-HTTP URL for %s",
					knowledge.ID,
				)
			}
		}
	}

	if !usedURL && err == nil {
		// Inline video is a compatibility path for small existing objects only.
		// A near-limit object must never be read into application memory or
		// Base64-encoded when URL delivery is unavailable.
		if videoSize > int64(vlm.MaxInlineVideoBytes) {
			if urlSourceErr == nil {
				urlSourceErr = fmt.Errorf("fixed video model does not expose URL input")
			}
			return s.failVideoKnowledge(
				ctx,
				knowledge,
				videoFailureSource,
				videoFailureRetryable(urlSourceErr),
				urlSourceErr,
			)
		}
		fileReader, readErr := fileService.GetFile(ctx, payload.FilePath)
		if readErr != nil {
			return s.failVideoKnowledge(ctx, knowledge, videoFailureSource, videoFailureRetryable(readErr), readErr)
		}
		videoBytes, err = io.ReadAll(io.LimitReader(fileReader, int64(vlm.MaxInlineVideoBytes)+1))
		closeErr := fileReader.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			return s.failVideoKnowledge(ctx, knowledge, videoFailureSource, videoFailureRetryable(err), err)
		}
		markdown, err = vlm.PredictVideo(ctx, model, videoBytes, mimeType, prompt)
	}

	if err != nil {
		logger.Errorf(ctx, "[Video] fixed model failed id=%s knowledge=%s: %v", modelID, knowledge.ID, err)
		return s.failVideoKnowledge(ctx, knowledge, videoFailureParse, videoFailureRetryable(err), err)
	}
	markdown = strings.TrimSpace(markdown)
	if markdown == "" {
		err = vlm.RetryableVideoError(fmt.Errorf("video understanding returned empty content"))
		return s.failVideoKnowledge(ctx, knowledge, videoFailureParse, true, err)
	}

	s.endStage(ctx, knowledge.ID, types.StageDocReader, types.JSONMap{
		"text_length": len(markdown),
	})
	metadata := map[string]string{
		"source_type": "video",
	}
	// The video understanding prompt already requires the first line to be a
	// concise Markdown heading. Expose that same analysis output to the common
	// URL-title update path instead of issuing a second model request or copying
	// a provider caption into the knowledge title.
	if title := conciseAnalysisTitle(markdown); title != "" {
		metadata["title"] = title
	}
	return &types.ReadResult{
		MarkdownContent: markdown,
		Metadata:        metadata,
	}, nil
}

func (s *knowledgeService) authoritativeVideoSourceSize(
	ctx context.Context,
	knowledge *types.Knowledge,
	filePath string,
) (int64, error) {
	size := int64(0)
	if knowledge != nil && knowledge.FileSize > 0 {
		size = knowledge.FileSize
	}
	if _, ok := types.ParseResourcePath(filePath); ok {
		if s == nil || s.resourceCatalog == nil {
			return 0, fmt.Errorf("video resource catalog is not configured")
		}
		resource, err := s.resourceCatalog.Resolve(ctx, filePath)
		if err != nil {
			return 0, fmt.Errorf("resolve stored video resource: %w", err)
		}
		if resource == nil || resource.State != types.ResourceStateActive {
			return 0, fmt.Errorf("stored video resource is unavailable")
		}
		if resource.Size > 0 {
			size = resource.Size
		}
	}
	if size <= 0 {
		return 0, fmt.Errorf("stored video size is unavailable")
	}
	return size, nil
}

func currentVideoRetryCount(ctx context.Context) int {
	if retried, ok := asynq.GetRetryCount(ctx); ok {
		return retried
	}
	if retried, _, ok := types.TaskRetryMetadataFromContext(ctx); ok {
		return retried
	}
	return 0
}

func videoFailureRetryable(err error) bool {
	if err == nil {
		return false
	}
	if modelopenrouter.IsCreditExhausted(err) {
		return false
	}
	if vlm.IsRetryableVideoError(err) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var networkErr net.Error
	return errors.As(err, &networkErr)
}

func videoFailurePublicState(kind videoFailureKind, err error) (code, message string) {
	if modelopenrouter.IsCreditExhausted(err) {
		return modelopenrouter.CreditExhaustedCode, VideoCreditExhaustedPublicMessage
	}
	switch kind {
	case videoFailureSource:
		return werrors.ErrCodeVideoSourceFailed, VideoSourceFailedPublicMessage
	case videoFailureSize:
		return werrors.ErrCodeVideoTooLarge, VideoTooLargePublicMessage
	case videoFailureFormat:
		return werrors.ErrCodeVideoFormatUnsupported, VideoFormatFailedPublicMessage
	default:
		return werrors.ErrCodeVideoParseFailed, VideoParseFailedPublicMessage
	}
}

func (s *knowledgeService) failVideoKnowledge(
	ctx context.Context,
	knowledge *types.Knowledge,
	kind videoFailureKind,
	retryable bool,
	failureErr error,
) (*types.ReadResult, error) {
	if failureErr == nil {
		failureErr = errors.New("video processing failed")
	}
	retryCount := currentVideoRetryCount(ctx)
	if retryable && retryCount < 1 {
		knowledge.ParseStatus = types.ParseStatusProcessing
		knowledge.ErrorMessage = VideoRetryingPublicMessage
		knowledge.UpdatedAt = time.Now()
		if err := s.repo.UpdateKnowledge(ctx, knowledge); err != nil {
			logger.Warnf(ctx, "[Video] failed to publish retry state for %s: %v", knowledge.ID, err)
		}
		logger.Warnf(
			ctx,
			"[Video] scheduling sole retry knowledge=%s retry=%d err=%v",
			knowledge.ID,
			retryCount,
			failureErr,
		)
		return nil, failureErr
	}

	code, message := videoFailurePublicState(kind, failureErr)
	knowledge.ParseStatus = types.ParseStatusFailed
	knowledge.ErrorMessage = message
	knowledge.UpdatedAt = time.Now()
	if err := s.repo.UpdateKnowledge(ctx, knowledge); err != nil {
		logger.Warnf(ctx, "[Video] failed to publish terminal state for %s: %v", knowledge.ID, err)
	}
	s.failStage(ctx, knowledge.ID, types.StageDocReader, code, message, failureErr)
	logger.Errorf(
		ctx,
		"[Video] terminal failure knowledge=%s kind=%s retry=%d err=%v",
		knowledge.ID,
		kind,
		retryCount,
		failureErr,
	)
	return nil, errors.Join(asynq.SkipRetry, failureErr)
}

// videoURLSourcePath unwraps a stable resource handle before asking its owning
// storage backend for a model-facing URL. Resource handles normally become an
// application /r/<token> proxy, which is useful for images and IM clients but
// lacks the object-store download semantics expected by video providers. The
// physical path keeps the same tenant/backend resolution performed above and
// lets S3-compatible storage return its native short-lived GET URL instead.
func (s *knowledgeService) videoURLSourcePath(ctx context.Context, filePath string) (string, error) {
	if _, ok := types.ParseResourcePath(filePath); !ok {
		return filePath, nil
	}
	if s == nil || s.resourceCatalog == nil {
		return "", fmt.Errorf("video resource catalog is not configured")
	}
	physical, resource, err := s.resourceCatalog.ResolvePath(ctx, filePath)
	if err != nil {
		return "", fmt.Errorf("resolve video resource for direct URL transport: %w", err)
	}
	if resource == nil || strings.TrimSpace(physical) == "" {
		return "", fmt.Errorf("resolve video resource for direct URL transport: resource is unavailable")
	}
	if _, nested := types.ParseResourcePath(physical); nested {
		return "", fmt.Errorf(
			"resolve video resource for direct URL transport: physical path is another resource handle",
		)
	}
	return physical, nil
}

func isUsableVideoURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}
