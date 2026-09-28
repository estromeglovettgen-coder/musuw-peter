package vlm

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

type videoCreditMeter struct{}

func (videoCreditMeter) OpenRouterAPIKey(context.Context) (string, error) { return "tenant-key", nil }
func (videoCreditMeter) OpenRouterUserID(context.Context) string          { return "tenant-user" }

func TestRemoteAPIVLMPredictVideoURLUsesConfiguredPublicURL(t *testing.T) {
	var requestPath string
	var authorization string
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestPath = r.URL.Path
		authorization = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"# Video summary\nA blue square moves."}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/api/v1",
		ModelName: "xiaomi/mimo-v2.5",
		APIKey:    "openrouter-test-key",
		Provider:  "openrouter",
		Extra:     map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	videoURL := "https://objects.example.test/videos/tiny-video.mp4?signature=abc"
	got, err := model.PredictVideoURL(context.Background(), videoURL, "video/mp4", "Describe it")
	if err != nil {
		t.Fatalf("PredictVideoURL: %v", err)
	}
	if !strings.Contains(got, "blue square") {
		t.Fatalf("response = %q", got)
	}
	if requestPath != "/api/v1/chat/completions" {
		t.Fatalf("path = %q", requestPath)
	}
	if authorization != "Bearer openrouter-test-key" {
		t.Fatalf("authorization = %q", authorization)
	}
	if requestBody["model"] != "xiaomi/mimo-v2.5" {
		t.Fatalf("model = %#v", requestBody["model"])
	}
	if _, ok := requestBody["reasoning_effort"]; ok {
		t.Fatalf("legacy reasoning_effort unexpectedly present: %#v", requestBody["reasoning_effort"])
	}
	reasoning := requestBody["reasoning"].(map[string]any)
	if reasoning["effort"] != "none" {
		t.Fatalf("reasoning = %#v, want effort none", reasoning)
	}
	providerRouting := requestBody["provider"].(map[string]any)
	if providerRouting["allow_fallbacks"] != true {
		t.Fatalf("allow_fallbacks = %#v", providerRouting["allow_fallbacks"])
	}
	if _, ok := providerRouting["only"]; ok {
		t.Fatalf("provider only should be omitted for URL model: %#v", providerRouting)
	}
	messages := requestBody["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	videoPart := content[1].(map[string]any)
	if videoPart["type"] != "video_url" {
		t.Fatalf("video part = %#v", videoPart)
	}
	gotURL := videoPart["video_url"].(map[string]any)["url"].(string)
	if gotURL != videoURL {
		t.Fatalf("video URL = %q, want %q", gotURL, videoURL)
	}
}

func TestRemoteAPIVLMPredictVideoURLRejectsUnconfiguredModel(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   "http://127.0.0.1:1/api/v1",
		ModelName: "google/gemini-2.5-flash",
		Provider:  "openrouter",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(
		context.Background(),
		"https://objects.example.test/video.mp4",
		"video/mp4",
		"Describe it",
	)
	if err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("error = %v, want explicit capability error", err)
	}
}

func TestRemoteAPIVLMPredictVideoBase64KeepsGeminiVertex(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"# Video summary\nA native Gemini result."}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/api/v1",
		ModelName: OpenRouterGeminiVideoModel,
		APIKey:    "openrouter-test-key",
		Provider:  "openrouter",
		Extra: map[string]any{
			"video_input_mode": VideoInputModeBase64,
			"video_provider":   "google-vertex",
		},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	if _, err := model.PredictVideo(
		context.Background(),
		[]byte("tiny-video"),
		"video/mp4",
		"Describe it",
	); err != nil {
		t.Fatalf("PredictVideo: %v", err)
	}
	providerRouting := requestBody["provider"].(map[string]any)
	providerOnly := providerRouting["only"].([]any)
	if len(providerOnly) != 1 || providerOnly[0] != "google-vertex" {
		t.Fatalf("provider only = %#v", providerOnly)
	}
	messages := requestBody["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	videoPart := content[1].(map[string]any)
	videoURL := videoPart["video_url"].(map[string]any)["url"].(string)
	if !strings.HasPrefix(videoURL, "data:video/mp4;base64,") {
		t.Fatalf("video URL = %q", videoURL)
	}
}

func TestRemoteAPIVLMPredictVideoKeepsLegacyQwenRuntimeRow(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"# Legacy Qwen video"}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/api/v1",
		ModelName: OpenRouterQwenVideoModel,
		APIKey:    "openrouter-test-key",
		Provider:  "openrouter",
		// Existing database rows predate video_input_mode. They must retain
		// the old bounded Base64 + Alibaba behavior for small videos.
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	if _, err := model.PredictVideo(context.Background(), []byte("tiny-video"), "video/mp4", "Describe it"); err != nil {
		t.Fatalf("PredictVideo: %v", err)
	}
	providerRouting := requestBody["provider"].(map[string]any)
	providerOnly := providerRouting["only"].([]any)
	if len(providerOnly) != 1 || providerOnly[0] != "alibaba" {
		t.Fatalf("provider only = %#v", providerOnly)
	}
}

func TestRemoteAPIVLMPredictVideoBase64RejectsLargeInput(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   "http://127.0.0.1:1/api/v1",
		ModelName: OpenRouterGeminiVideoModel,
		Provider:  "openrouter",
		Extra:     map[string]any{"video_input_mode": VideoInputModeBase64},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideo(context.Background(), make([]byte, maxInlineVideoBytes+1), "video/mp4", "Describe it")
	if err == nil || !strings.Contains(err.Error(), "inline Base64 limit") {
		t.Fatalf("error = %v, want inline Base64 limit", err)
	}
}

func TestRemoteAPIVLMPredictVideoReportsFinishReason(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"content_filter","message":{"content":""}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/api/v1",
		ModelName: "xiaomi/mimo-v2.5",
		Provider:  "openrouter",
		Extra:     map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(
		context.Background(),
		"https://objects.example.test/video.mp4",
		"video/mp4",
		"Describe it",
	)
	if err == nil || !strings.Contains(err.Error(), "finish_reason=content_filter") {
		t.Fatalf("error = %v, want finish reason", err)
	}
	if IsRetryableVideoError(err) {
		t.Fatalf("content-filter failure must be permanent: %v", err)
	}
}

func TestRemoteAPIVLMPredictVideoReportsNoChoices(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/api/v1",
		ModelName: "xiaomi/mimo-v2.5",
		Provider:  "openrouter",
		Extra:     map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(
		context.Background(),
		"https://objects.example.test/video.mp4",
		"video/mp4",
		"Describe it",
	)
	if err == nil || !strings.Contains(err.Error(), "no choices") {
		t.Fatalf("error = %v, want no choices", err)
	}
	if !IsRetryableVideoError(err) {
		t.Fatalf("valid empty response should be retryable: %v", err)
	}
}

func TestRemoteAPIVLMPredictVideoClassifiesHTTPFailures(t *testing.T) {
	tests := []struct {
		name      string
		status    int
		retryable bool
		credits   bool
	}{
		{name: "rate limited", status: http.StatusTooManyRequests, retryable: true},
		{name: "server error", status: http.StatusBadGateway, retryable: true},
		{name: "request timeout", status: http.StatusRequestTimeout, retryable: true},
		{name: "bad parameters", status: http.StatusBadRequest, retryable: false},
		{name: "credits exhausted", status: http.StatusPaymentRequired, retryable: false, credits: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "diagnostic body", tt.status)
			}))
			defer server.Close()

			withVLMSSRFWhitelist(t, "127.0.0.1")
			model, err := NewRemoteAPIVLM(&Config{
				BaseURL: server.URL, ModelName: "xiaomi/mimo-v2.5", Provider: "openrouter",
				Extra: map[string]any{"video_input_mode": VideoInputModeURL},
			})
			if err != nil {
				t.Fatalf("NewRemoteAPIVLM: %v", err)
			}
			_, err = model.PredictVideoURL(
				context.Background(), "https://objects.example.test/video.mp4", "video/mp4", "Describe it",
			)
			if err == nil {
				t.Fatal("PredictVideoURL unexpectedly succeeded")
			}
			if got := IsRetryableVideoError(err); got != tt.retryable {
				t.Fatalf("IsRetryableVideoError(%v) = %t, want %t", err, got, tt.retryable)
			}
			if got := modelopenrouter.IsCreditExhausted(err); got != tt.credits {
				t.Fatalf("IsCreditExhausted(%v) = %t, want %t", err, got, tt.credits)
			}
		})
	}
}

func TestRemoteAPIVLMPredictVideoKeepsMeteredCreditExhaustionPermanent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPaymentRequired)
		_, _ = w.Write([]byte(`{"error":{"code":402,"message":"payment_required"}}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL: server.URL, ModelName: "qwen/qwen3.7-flash", Provider: "openrouter",
		OpenRouterMeter: videoCreditMeter{},
		Extra:           map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(
		context.Background(), "https://objects.example.test/video.mp4", "video/mp4", "Describe it",
	)
	if !modelopenrouter.IsCreditExhausted(err) {
		t.Fatalf("error = %v, want typed OpenRouter credit exhaustion", err)
	}
	if IsRetryableVideoError(err) {
		t.Fatalf("credit exhaustion must not be retryable: %v", err)
	}
}

func TestRemoteAPIVLMPredictVideoClassifiesEmbeddedCreditExhaustion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":{"code":402,"message":"payment_required"}}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL: server.URL, ModelName: "xiaomi/mimo-v2.5", Provider: "openrouter",
		Extra: map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(
		context.Background(), "https://objects.example.test/video.mp4", "video/mp4", "Describe it",
	)
	if !modelopenrouter.IsCreditExhausted(err) {
		t.Fatalf("error = %v, want typed OpenRouter credit exhaustion", err)
	}
	if IsRetryableVideoError(err) {
		t.Fatalf("embedded credit exhaustion must not be retryable: %v", err)
	}
}

func TestRemoteAPIVLMPredictVideoURLRequiresHTTPURL(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   "http://127.0.0.1:1/api/v1",
		ModelName: "xiaomi/mimo-v2.5",
		Provider:  "openrouter",
		Extra:     map[string]any{"video_input_mode": VideoInputModeURL},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = model.PredictVideoURL(context.Background(), "local://tenant/video.mp4", "video/mp4", "Describe it")
	if err == nil || !strings.Contains(err.Error(), "http or https") {
		t.Fatalf("error = %v, want HTTP URL validation", err)
	}
}

// Native video transport is explicit catalog data, not inferred from the new
// provider slug. Test the shipped rows through the saved-model factory and HTTP.
func TestRefreshedCatalogPreservesImageAndVideoRequests(t *testing.T) {
	raw, err := os.ReadFile("../../../config/builtin_models.yaml")
	require.NoError(t, err)
	var catalog struct {
		Models []types.BuiltinModelEntry `yaml:"builtin_models"`
	}
	require.NoError(t, yaml.Unmarshal(raw, &catalog))
	expected := map[string]struct {
		slug, provider, url string
		mandatory           bool
	}{
		"builtin-openrouter-vlm": {
			"google/gemini-3.8-flash", "google-vertex",
			"data:video/mp4;base64," + base64.StdEncoding.EncodeToString([]byte("tiny-video")), true,
		},
		"builtin-openrouter-vlm-youtube": {
			"google/gemini-3.5-flash-lite", "google-ai-studio", "https://www.youtube.com/watch?v=test-video", true,
		},
		"builtin-openrouter-vlm-qwen-3-7-flash": {
			"qwen/qwen3.8-flash", "alibaba", "https://objects.example.test/video.mp4", false,
		},
	}
	withVLMSSRFWhitelist(t, "127.0.0.1")
	seen := 0
	for _, entry := range catalog.Models {
		want, selected := expected[entry.ID]
		if !selected {
			continue
		}
		seen++
		t.Run(entry.ID, func(t *testing.T) {
			var request map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
					http.Error(w, "invalid test request", http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				if reasoning, ok := request["reasoning"].(map[string]any); ok &&
					want.mandatory && reasoning["effort"] == "none" {
					w.WriteHeader(http.StatusBadRequest)
					_, _ = w.Write([]byte(`{"error":{"message":"Reasoning is mandatory"}}`))
					return
				}
				_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"blue"}}]}`))
			}))
			defer server.Close()
			entry.Parameters.BaseURL = server.URL
			saved := &types.Model{ID: entry.ID, Name: entry.Name, Source: entry.Source, Parameters: entry.Parameters}
			client, err := NewRemoteAPIVLM(ConfigFromModel(saved, "", ""))
			require.NoError(t, err)
			result, err := client.Predict(context.Background(), [][]byte{testPNG}, "What color?")
			require.NoError(t, err)
			assert.Equal(t, "blue", result)
			assert.Equal(t, want.slug, request["model"])
			if entry.ID == "builtin-openrouter-vlm" {
				result, err = client.PredictVideo(
					context.Background(), []byte("tiny-video"), "video/mp4", "What color?",
				)
			} else {
				result, err = client.PredictVideoURL(context.Background(), want.url, "video/mp4", "What color?")
			}
			require.NoError(t, err)
			assert.Equal(t, "blue", result)
			assert.Equal(t, want.slug, request["model"])
			routing := request["provider"].(map[string]any)
			assert.Equal(t, []any{want.provider}, routing["only"])
			if want.mandatory {
				assert.NotContains(t, request, "reasoning")
			}
			messages := request["messages"].([]any)
			content := messages[0].(map[string]any)["content"].([]any)
			assert.Equal(t, want.url, content[1].(map[string]any)["video_url"].(map[string]any)["url"])
		})
	}
	require.Equal(t, len(expected), seen)
}
