package vlm

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/models/provider"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	openai "github.com/sashabaranov/go-openai"
)

const (
	// defaultTimeout is the fallback HTTP timeout for a single VLM request.
	// Dense scanned-PDF OCR (full-page text + layout extraction) can take well
	// over a minute on slow endpoints, so this is intentionally generous and
	// can be raised further via VLM_HTTP_TIMEOUT_SECONDS.
	defaultTimeout = 180 * time.Second
	defaultMaxToks = 5000
	defaultTemp    = float32(0.1)
	// OpenRouterQwenVideoModel is retained for callers that used the old name;
	// OpenRouterGeminiVideoModel is likewise retained for compatibility.
	//
	// video capability is no longer inferred from a model name. It is explicitly
	// selected with Config.Extra["video_input_mode"].
	OpenRouterQwenVideoModel   = "qwen/qwen3.7-flash"
	OpenRouterGeminiVideoModel = "google/gemini-2.5-flash"

	VideoInputModeURL    = "url"
	VideoInputModeBase64 = "base64"

	// OpenRouter/MiMo document a 50,000,000-byte limit for an encoded inline
	// video. 37,500,000 raw bytes encodes to exactly that size, so this is a
	// conservative raw-input ceiling; PredictVideo also checks EncodedLen so the
	// actual request limit remains exact if this value changes.
	maxInlineVideoBytes        = 37_500_000
	maxInlineVideoEncodedBytes = 50_000_000
	maxRemoteVideoBytes        = 300_000_000

	// MaxInlineVideoBytes and the related exported ceilings are shared with the
	// ingestion caller so it can stop reading an oversized inline object before
	// allocating the full file.
	MaxInlineVideoBytes        = maxInlineVideoBytes
	MaxInlineVideoEncodedBytes = maxInlineVideoEncodedBytes
	MaxRemoteVideoBytes        = maxRemoteVideoBytes
)

// vlmHTTPTimeout returns the HTTP client timeout for VLM requests, read from
// the VLM_HTTP_TIMEOUT_SECONDS env var when set (and positive), falling back to
// defaultTimeout otherwise. Shared by all OpenAI-compatible VLM backends.
func vlmHTTPTimeout() time.Duration {
	if v := strings.TrimSpace(os.Getenv("VLM_HTTP_TIMEOUT_SECONDS")); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return defaultTimeout
}

// RemoteAPIVLM implements VLM via an OpenAI-compatible chat completions API.
type RemoteAPIVLM struct {
	modelName          string
	modelID            string
	client             *openai.Client
	httpClient         *http.Client
	baseURL            string
	apiKey             string
	provider           provider.ProviderName
	temperature        float32
	videoInputMode     string
	videoProvider      string
	mandatoryReasoning bool
}

type openRouterReasoning struct {
	Effort string `json:"effort"`
}

type openRouterImageRequest struct {
	openai.ChatCompletionRequest
	Reasoning *openRouterReasoning `json:"reasoning,omitempty"`
}

// NewRemoteAPIVLM creates a remote-API backed VLM instance.
func NewRemoteAPIVLM(config *Config) (*RemoteAPIVLM, error) {
	if err := validateVLMBaseURL(config.BaseURL); err != nil {
		return nil, err
	}

	providerName := provider.ProviderName(config.Provider)
	if providerName == "" {
		providerName = provider.DetectProvider(config.BaseURL)
	}

	var apiCfg openai.ClientConfig
	if providerName == provider.ProviderAzureOpenAI {
		apiCfg = openai.DefaultAzureConfig(config.APIKey, config.BaseURL)
		apiCfg.AzureModelMapperFunc = func(model string) string {
			return model
		}
		if config.Extra != nil {
			if v, ok := config.Extra["api_version"]; ok {
				if vs, ok := v.(string); ok && vs != "" {
					apiCfg.APIVersion = vs
				}
			}
		}
	} else {
		apiCfg = openai.DefaultConfig(config.APIKey)
		if config.BaseURL != "" {
			apiCfg.BaseURL = config.BaseURL
		}
	}
	httpClient := newVLMHTTPClient(vlmHTTPTimeout())
	if providerName == provider.ProviderOpenRouter && config.OpenRouterMeter != nil {
		httpClient = modelopenrouter.WrapHTTPClient(httpClient, config.OpenRouterMeter)
	}

	// 注入用户自定义 HTTP header（类似 OpenAI Python SDK 的 extra_headers）
	requestClient := httpClient
	if len(config.CustomHeaders) > 0 {
		requestClient = secutils.WrapHTTPClientWithHeaders(httpClient, config.CustomHeaders)
	}
	apiCfg.HTTPClient = requestClient

	temp := defaultTemp
	if config.Extra != nil {
		if v, ok := config.Extra["temperature"]; ok {
			if vs, ok := v.(string); ok {
				if f, err := strconv.ParseFloat(vs, 32); err == nil {
					temp = float32(f)
				}
			}
		}
	}
	videoInputMode := configuredVideoInputMode(config.Extra)
	videoProvider := configuredVideoProvider(config.Extra)
	// Existing persisted built-in rows can predate the explicit transport
	// fields. Preserve only the two exact native-video routes supported by the
	// previous release; every new/custom model still requires explicit config.
	if providerName == provider.ProviderOpenRouter && videoInputMode == "" {
		switch strings.TrimSpace(config.ModelName) {
		case OpenRouterGeminiVideoModel:
			videoInputMode = VideoInputModeBase64
			if videoProvider == "" {
				videoProvider = "google-vertex"
			}
		case OpenRouterQwenVideoModel:
			videoInputMode = VideoInputModeBase64
			if videoProvider == "" {
				videoProvider = "alibaba"
			}
		}
	}

	return &RemoteAPIVLM{
		modelName:          config.ModelName,
		modelID:            config.ModelID,
		client:             openai.NewClientWithConfig(apiCfg),
		httpClient:         requestClient,
		baseURL:            config.BaseURL,
		apiKey:             config.APIKey,
		provider:           providerName,
		temperature:        temp,
		videoInputMode:     videoInputMode,
		videoProvider:      videoProvider,
		mandatoryReasoning: config.MandatoryReasoning,
	}, nil
}

func configuredVideoInputMode(extra map[string]any) string {
	mode := strings.ToLower(strings.TrimSpace(extraString(extra, "video_input_mode")))
	switch mode {
	case VideoInputModeURL, "video_url", "remote_url":
		return VideoInputModeURL
	case VideoInputModeBase64, "inline", "data_uri":
		return VideoInputModeBase64
	default:
		return ""
	}
}

func configuredVideoProvider(extra map[string]any) string {
	return strings.TrimSpace(extraString(extra, "video_provider"))
}

func extraString(extra map[string]any, key string) string {
	if extra == nil {
		return ""
	}
	value, ok := extra[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

// Predict sends an image with a text prompt to the OpenAI-compatible API.
func (v *RemoteAPIVLM) Predict(ctx context.Context, imgBytesList [][]byte, prompt string) (string, error) {
	var parts []openai.ChatMessagePart

	// Add text prompt first
	parts = append(parts, openai.ChatMessagePart{
		Type: openai.ChatMessagePartTypeText,
		Text: prompt,
	})

	// Add images
	for _, imgBytes := range imgBytesList {
		if len(imgBytes) > 0 {
			mimeType, err := detectImageMIME(imgBytes)
			if err != nil {
				return "", err
			}
			b64 := base64.StdEncoding.EncodeToString(imgBytes)
			dataURI := fmt.Sprintf("data:%s;base64,%s", mimeType, b64)
			parts = append(parts, openai.ChatMessagePart{
				Type: openai.ChatMessagePartTypeImageURL,
				ImageURL: &openai.ChatMessageImageURL{
					URL:    dataURI,
					Detail: openai.ImageURLDetailAuto,
				},
			})
		}
	}

	req := openai.ChatCompletionRequest{
		Model: v.modelName,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:         openai.ChatMessageRoleUser,
				MultiContent: parts,
			},
		},
		MaxTokens:   defaultMaxToks,
		Temperature: v.temperature,
	}
	shapeReasoningVLMRequest(&req)
	totalImageSize := 0
	for _, img := range imgBytesList {
		totalImageSize += len(img)
	}
	logger.Infof(ctx, "[VLM] Calling OpenAI-compatible API, model=%s, baseURL=%s, numImages=%d, totalImageSize=%d",
		v.modelName, v.baseURL, len(imgBytesList), totalImageSize)

	var resp openai.ChatCompletionResponse
	var err error
	if v.provider == provider.ProviderOpenRouter {
		// OpenRouter's native control is the nested reasoning object. Its
		// reasoning_effort compatibility field is not supported by every model
		// and can be rejected even when reasoning itself is optional.
		resp, err = v.createOpenRouterImageCompletion(ctx, req)
	} else {
		resp, err = v.client.CreateChatCompletion(ctx, req)
	}
	if err != nil {
		return "", fmt.Errorf("OpenAI VLM request: %w", err)
	}
	content, err := completionText(resp, "OpenAI VLM")
	if err != nil {
		return "", err
	}
	logger.Infof(ctx, "[VLM] OpenAI response received, len=%d", len(content))
	return content, nil
}

// completionText turns an OpenAI-compatible completion into user-visible text
// while preserving the provider's finish reason. An HTTP 2xx response with no
// choices/content is a provider failure, not a successful empty extraction;
// keeping the reason in the error makes retries and operator diagnosis useful.
func completionText(resp openai.ChatCompletionResponse, operation string) (string, error) {
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("%s response contained no choices", operation)
	}

	choice := resp.Choices[0]
	content := choice.Message.Content
	if strings.TrimSpace(content) != "" {
		return content, nil
	}

	finishReason := strings.TrimSpace(string(choice.FinishReason))
	if finishReason == "" || finishReason == string(openai.FinishReasonNull) {
		finishReason = "empty"
	}
	if finishReason == string(openai.FinishReasonLength) {
		return "", fmt.Errorf(
			"%s response contained no text (finish_reason=length; completion truncated at %d tokens)",
			operation,
			defaultMaxToks,
		)
	}
	return "", fmt.Errorf("%s response contained no text (finish_reason=%s)", operation, finishReason)
}

// Optional reasoning stays disabled for extraction. Mandatory models retain
// their provider default instead of receiving an unsupported "none" override.
func (v *RemoteAPIVLM) reasoningOverride() *openRouterReasoning {
	if v.mandatoryReasoning {
		return nil
	}
	return &openRouterReasoning{Effort: "none"}
}

func (v *RemoteAPIVLM) createOpenRouterImageCompletion(
	ctx context.Context,
	req openai.ChatCompletionRequest,
) (openai.ChatCompletionResponse, error) {
	payload := openRouterImageRequest{
		ChatCompletionRequest: req,
		Reasoning:             v.reasoningOverride(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return openai.ChatCompletionResponse{}, fmt.Errorf("marshal OpenRouter VLM request: %w", err)
	}
	endpoint := strings.TrimRight(v.baseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return openai.ChatCompletionResponse{}, fmt.Errorf("create OpenRouter VLM request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+v.apiKey)

	httpResp, err := v.httpClient.Do(httpReq)
	if err != nil {
		return openai.ChatCompletionResponse{}, err
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode < http.StatusOK || httpResp.StatusCode >= http.StatusMultipleChoices {
		detail, _ := io.ReadAll(io.LimitReader(httpResp.Body, 8192))
		return openai.ChatCompletionResponse{}, fmt.Errorf(
			"OpenRouter VLM request returned %s: %s",
			httpResp.Status,
			strings.TrimSpace(string(detail)),
		)
	}

	var decoded openai.ChatCompletionResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&decoded); err != nil {
		return openai.ChatCompletionResponse{}, fmt.Errorf("decode OpenRouter VLM response: %w", err)
	}
	return decoded, nil
}

// shapeReasoningVLMRequest adapts an OpenAI-compatible VLM request for
// reasoning (o-series) and GPT-5 models, which reject `max_tokens` and every
// non-default sampling parameter.
//
// This mirrors shapeOpenAIReasoning in internal/models/chat, which fixed the
// same incompatibility on the chat path for issue #1283. The VLM path was
// never wired to it, so image OCR and captioning failed for every one of these
// models (issue #2537).
//
// Both quirks have to be handled together: migrating max_tokens alone still
// fails, because the VLM default temperature (0.1) is itself rejected.
func shapeReasoningVLMRequest(req *openai.ChatCompletionRequest) {
	if !provider.IsOpenAIReasoningOrGPT5Model(req.Model) {
		return
	}
	if req.MaxCompletionTokens == 0 && req.MaxTokens > 0 {
		req.MaxCompletionTokens = req.MaxTokens
	}
	req.MaxTokens = 0
	req.Temperature = 0
	req.TopP = 0
	req.FrequencyPenalty = 0
	req.PresencePenalty = 0
}

func (v *RemoteAPIVLM) GetModelName() string { return v.modelName }
func (v *RemoteAPIVLM) GetModelID() string   { return v.modelID }

// SupportsVideoURL reports whether this instance was explicitly configured to
// send a public/signed URL to OpenRouter. Provider and capability are both
// checked; setting a URL mode on a non-OpenRouter backend cannot change its
// transport semantics.
func (v *RemoteAPIVLM) SupportsVideoURL() bool {
	return v.provider == provider.ProviderOpenRouter && v.videoInputMode == VideoInputModeURL
}

func validateVideoMIMEType(mimeType string) error {
	switch mimeType {
	case "video/mp4", "video/mpeg", "video/mov", "video/webm":
		return nil
	default:
		return fmt.Errorf("unsupported OpenRouter video MIME type %q", mimeType)
	}
}

func validateInlineVideoSize(videoBytes []byte) error {
	if len(videoBytes) == 0 {
		return fmt.Errorf("video input is empty")
	}
	encodedLen := base64.StdEncoding.EncodedLen(len(videoBytes))
	if encodedLen > maxInlineVideoEncodedBytes {
		return fmt.Errorf(
			"video input exceeds inline Base64 limit: encoded size %d bytes (max %d; raw input %d bytes)",
			encodedLen,
			maxInlineVideoEncodedBytes,
			len(videoBytes),
		)
	}
	return nil
}

func (v *RemoteAPIVLM) buildOpenRouterVideoPayload(videoURL, _ string, prompt string) map[string]any {
	routing := map[string]any{"allow_fallbacks": true}
	if v.videoProvider != "" {
		routing["only"] = []string{v.videoProvider}
	}
	payload := map[string]any{
		"model":    v.modelName,
		"provider": routing,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": prompt},
				{"type": "video_url", "video_url": map[string]string{"url": videoURL}},
			},
		}},
		"max_tokens":  defaultMaxToks,
		"temperature": v.temperature,
	}
	if reasoning := v.reasoningOverride(); reasoning != nil {
		payload["reasoning"] = map[string]string{"effort": reasoning.Effort}
	}
	return payload
}

// PredictVideo sends inline Base64 video through OpenRouter's documented
// video_url contract. URL-configured models may use this only as a bounded
// fallback when storage cannot produce an HTTP(S) URL; all inline requests
// still obey the encoded 50 MB ceiling.
func (v *RemoteAPIVLM) PredictVideo(ctx context.Context, videoBytes []byte, mimeType, prompt string) (string, error) {
	if v.provider != provider.ProviderOpenRouter {
		return "", fmt.Errorf("video input requires OpenRouter")
	}
	if v.videoInputMode != VideoInputModeURL && v.videoInputMode != VideoInputModeBase64 {
		return "", fmt.Errorf("video input capability is not configured for model %q", v.modelName)
	}
	if err := validateVideoMIMEType(mimeType); err != nil {
		return "", err
	}
	if err := validateInlineVideoSize(videoBytes); err != nil {
		return "", err
	}

	dataURI := "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(videoBytes)
	return v.predictOpenRouterVideoPayload(
		ctx,
		v.buildOpenRouterVideoPayload(dataURI, mimeType, prompt),
		len(videoBytes),
	)
}

// PredictVideoURL sends a public or signed HTTP(S) URL without reading the
// object into application memory. The capability must be explicitly enabled
// in model ExtraConfig with video_input_mode=url.
func (v *RemoteAPIVLM) PredictVideoURL(ctx context.Context, videoURL, mimeType, prompt string) (string, error) {
	if v.provider != provider.ProviderOpenRouter {
		return "", fmt.Errorf("video URL input requires OpenRouter")
	}
	if !v.SupportsVideoURL() {
		return "", fmt.Errorf("video URL input is not configured for model %q", v.modelName)
	}
	if err := validateVideoMIMEType(mimeType); err != nil {
		return "", err
	}
	parsed, err := url.Parse(strings.TrimSpace(videoURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", fmt.Errorf("video URL must use an http or https URL")
	}
	return v.predictOpenRouterVideoPayload(ctx, v.buildOpenRouterVideoPayload(parsed.String(), mimeType, prompt), 0)
}

func (v *RemoteAPIVLM) predictOpenRouterVideoPayload(
	ctx context.Context,
	payload map[string]any,
	videoSize int,
) (string, error) {
	resp, err := v.createOpenRouterVideoCompletion(ctx, payload)
	if err != nil {
		return "", fmt.Errorf("OpenRouter video request: %w", err)
	}
	content, err := videoCompletionText(resp, "OpenRouter video")
	if err != nil {
		return "", err
	}
	logger.Infof(
		ctx,
		"[VLM] OpenRouter video response received, model=%s, videoSize=%d, len=%d",
		v.modelName,
		videoSize,
		len(content),
	)
	return content, nil
}

// videoCompletionText classifies syntactically valid but empty responses as
// transient, except when the provider explicitly reports a permanent stop such
// as content filtering or token truncation.
func videoCompletionText(resp openai.ChatCompletionResponse, operation string) (string, error) {
	content, err := completionText(resp, operation)
	if err == nil {
		return content, nil
	}
	if len(resp.Choices) == 0 {
		return "", RetryableVideoError(err)
	}
	choice := resp.Choices[0]
	if strings.TrimSpace(choice.Message.Content) != "" {
		return choice.Message.Content, nil
	}
	finishReason := strings.TrimSpace(string(choice.FinishReason))
	switch finishReason {
	case "", string(openai.FinishReasonNull), string(openai.FinishReasonStop):
		return "", RetryableVideoError(err)
	default:
		return "", permanentVideoError(err)
	}
}

func retryableVideoHTTPStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}

func retryableEmbeddedVideoError(raw json.RawMessage) bool {
	var envelope struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return false
	}
	return retryableVideoHTTPStatus(envelope.Code)
}

func (v *RemoteAPIVLM) createOpenRouterVideoCompletion(
	ctx context.Context,
	payload map[string]any,
) (openai.ChatCompletionResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return openai.ChatCompletionResponse{}, fmt.Errorf("marshal OpenRouter video request: %w", err)
	}
	endpoint := strings.TrimRight(v.baseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return openai.ChatCompletionResponse{}, fmt.Errorf("create OpenRouter video request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+v.apiKey)

	logger.Infof(ctx, "[VLM] Calling OpenRouter video API, model=%s", v.modelName)
	resp, err := v.httpClient.Do(req)
	if err != nil {
		if modelopenrouter.IsCreditExhausted(err) {
			return openai.ChatCompletionResponse{}, permanentVideoError(err)
		}
		// A caller cancellation is deliberate and should not start a new paid
		// attempt. Network failures and request deadlines are transient.
		if errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			return openai.ChatCompletionResponse{}, permanentVideoError(err)
		}
		return openai.ChatCompletionResponse{}, RetryableVideoError(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
		if resp.StatusCode == http.StatusPaymentRequired ||
			(resp.StatusCode == http.StatusForbidden && modelopenrouter.PayloadIndicatesCreditExhausted(detail)) {
			return openai.ChatCompletionResponse{}, permanentVideoError(
				&modelopenrouter.CreditExhaustedError{StatusCode: resp.StatusCode},
			)
		}
		requestErr := fmt.Errorf(
			"OpenRouter video request returned %s: %s",
			resp.Status,
			strings.TrimSpace(string(detail)),
		)
		if retryableVideoHTTPStatus(resp.StatusCode) {
			return openai.ChatCompletionResponse{}, RetryableVideoError(requestErr)
		}
		return openai.ChatCompletionResponse{}, permanentVideoError(requestErr)
	}
	var decoded struct {
		openai.ChatCompletionResponse
		Error json.RawMessage `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return openai.ChatCompletionResponse{}, permanentVideoError(
			fmt.Errorf("decode OpenRouter video response: %w", err),
		)
	}
	if errorJSON := bytes.TrimSpace(decoded.Error); len(errorJSON) > 0 && !bytes.Equal(errorJSON, []byte("null")) {
		if modelopenrouter.PayloadIndicatesCreditExhausted(errorJSON) {
			return openai.ChatCompletionResponse{}, permanentVideoError(
				&modelopenrouter.CreditExhaustedError{StatusCode: http.StatusPaymentRequired},
			)
		}
		responseErr := fmt.Errorf("OpenRouter video response error: %s", string(errorJSON))
		if retryableEmbeddedVideoError(errorJSON) {
			return openai.ChatCompletionResponse{}, RetryableVideoError(responseErr)
		}
		return openai.ChatCompletionResponse{}, permanentVideoError(responseErr)
	}
	return decoded.ChatCompletionResponse, nil
}

// detectImageMIME accepts only the image formats supported by the shared
// OpenAI-compatible image_url contract. Unknown bytes must never be relabelled
// as PNG: providers correctly reject a data URI whose MIME and bytes disagree.
func detectImageMIME(data []byte) (string, error) {
	ct := http.DetectContentType(data)
	switch ct {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		return ct, nil
	default:
		return "", fmt.Errorf("unsupported image format: %s", ct)
	}
}
