package vlm

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	openai "github.com/sashabaranov/go-openai"
)

type vlmMeterStub struct{}

func (*vlmMeterStub) OpenRouterAPIKey(context.Context) (string, error) {
	return "tenant-child-key", nil
}

func (*vlmMeterStub) OpenRouterUserID(context.Context) string { return "opaque-user" }

func TestRemoteAPIVLMPredictDisablesOpenRouterReasoning(t *testing.T) {
	var requestBody map[string]any
	var authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:         server.URL + "/v1",
		ModelName:       "qwen/qwen3.7-flash",
		APIKey:          "openrouter-test-key",
		Provider:        "openrouter",
		OpenRouterMeter: &vlmMeterStub{},
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	if _, err := model.Predict(context.Background(), [][]byte{testPNG}, "Describe it"); err != nil {
		t.Fatalf("Predict: %v", err)
	}
	if _, ok := requestBody["reasoning_effort"]; ok {
		t.Fatalf("legacy reasoning_effort unexpectedly present: %#v", requestBody["reasoning_effort"])
	}
	reasoning, ok := requestBody["reasoning"].(map[string]any)
	if !ok || reasoning["effort"] != "none" {
		t.Fatalf("reasoning = %#v, want effort none", requestBody["reasoning"])
	}
	if authorization != "Bearer tenant-child-key" {
		t.Fatalf("authorization = %q, want tenant child key", authorization)
	}
	if requestBody["user"] != "opaque-user" {
		t.Fatalf("user = %#v, want stable opaque attribution", requestBody["user"])
	}
}

func TestRemoteAPIVLMPredictDoesNotAddReasoningForOpenAI(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer server.Close()

	withVLMSSRFWhitelist(t, "127.0.0.1")
	model, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL + "/v1",
		ModelName: "gpt-4o",
		APIKey:    "openai-test-key",
		Provider:  "openai",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	if _, err := model.Predict(context.Background(), [][]byte{testPNG}, "Describe it"); err != nil {
		t.Fatalf("Predict: %v", err)
	}
	if _, ok := requestBody["reasoning"]; ok {
		t.Fatalf("reasoning unexpectedly present for OpenAI request: %#v", requestBody["reasoning"])
	}
}

// TestShapeReasoningVLMRequest 验证 GPT-5 / o-series 的请求参数改写。
// 见 issue #2537：这些模型必须使用 max_completion_tokens 替代 max_tokens，
// 且不接受非默认的采样参数。
func TestShapeReasoningVLMRequest(t *testing.T) {
	cases := []struct {
		name                    string
		model                   string
		maxTokens               int
		maxCompletionTokens     int
		temperature             float32
		wantMaxTokens           int
		wantMaxCompletionTokens int
		wantTemperature         float32
	}{
		{
			name:  "gpt-5 migrates max_tokens and drops temperature",
			model: "gpt-5", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "gpt-5-nano is shaped", // the model reported in issue #2537
			model: "gpt-5-nano", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "gpt-5 mixed case is shaped",
			model: "GPT-5.4-Mini", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "o1-mini is shaped",
			model: "o1-mini", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "o3 is shaped",
			model: "o3", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "o4-mini is shaped",
			model: "o4-mini", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 5000, wantTemperature: 0,
		},
		{
			name:  "explicit max_completion_tokens is preserved",
			model: "gpt-5", maxTokens: 5000, maxCompletionTokens: 128, temperature: 0.1,
			wantMaxTokens: 0, wantMaxCompletionTokens: 128, wantTemperature: 0,
		},
		{
			name:  "gpt-4o is left untouched",
			model: "gpt-4o", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 5000, wantMaxCompletionTokens: 0, wantTemperature: 0.1,
		},
		{
			name:  "qwen-vl is left untouched",
			model: "qwen2.5-vl-7b-instruct", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 5000, wantMaxCompletionTokens: 0, wantTemperature: 0.1,
		},
		{
			name:  "empty model is left untouched",
			model: "", maxTokens: 5000, temperature: 0.1,
			wantMaxTokens: 5000, wantMaxCompletionTokens: 0, wantTemperature: 0.1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := openai.ChatCompletionRequest{
				Model:               tc.model,
				MaxTokens:           tc.maxTokens,
				MaxCompletionTokens: tc.maxCompletionTokens,
				Temperature:         tc.temperature,
			}
			shapeReasoningVLMRequest(&req)

			if req.MaxTokens != tc.wantMaxTokens {
				t.Errorf("MaxTokens = %d, want %d", req.MaxTokens, tc.wantMaxTokens)
			}
			if req.MaxCompletionTokens != tc.wantMaxCompletionTokens {
				t.Errorf("MaxCompletionTokens = %d, want %d", req.MaxCompletionTokens, tc.wantMaxCompletionTokens)
			}
			if req.Temperature != tc.wantTemperature {
				t.Errorf("Temperature = %v, want %v", req.Temperature, tc.wantTemperature)
			}
		})
	}
}

// newVLMChatTestServer emulates an OpenAI-compatible chat completions endpoint
// and records the last decoded request body.
func newVLMChatTestServer(t *testing.T, lastRequest *map[string]interface{}) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode VLM request: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		*lastRequest = req

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id": "chatcmpl-test",
			"object": "chat.completion",
			"choices": [
				{"index": 0, "message": {"role": "assistant", "content": "extracted text"}, "finish_reason": "stop"}
			]
		}`))
	}))
}

// testPNG is a minimal byte slice that http.DetectContentType reports as a PNG.
var testPNG = []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("\x00", 16))

func TestRemoteAPIVLMPredictRejectsUnknownImageBeforeRequest(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"unexpected"}}]}`))
	}))
	defer server.Close()

	v, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL,
		ModelName: "gpt-4o",
		APIKey:    "sk-test",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = v.Predict(t.Context(), [][]byte{[]byte("not an image")}, "extract the text")
	if err == nil || !strings.Contains(err.Error(), "unsupported image format") {
		t.Fatalf("Predict error = %v, want unsupported image format", err)
	}
	if requests != 0 {
		t.Fatalf("provider requests = %d, want 0", requests)
	}
}

// TestRemoteAPIVLMSendsMaxCompletionTokensForReasoningModel is the regression
// test for issue #2537: with a GPT-5 / o-series vision model, every OCR and
// caption call failed with
//
//	"this model is not supported MaxTokens, please use MaxCompletionTokens"
//
// The request was rejected client-side by go-openai's reasoning validator, so
// it never reached the server and no image chunk was ever created.
func TestRemoteAPIVLMSendsMaxCompletionTokensForReasoningModel(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")

	var lastRequest map[string]interface{}
	server := newVLMChatTestServer(t, &lastRequest)
	defer server.Close()

	v, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL,
		ModelName: "gpt-5-nano",
		APIKey:    "sk-test",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	content, err := v.Predict(t.Context(), [][]byte{testPNG}, "extract the text")
	if err != nil {
		t.Fatalf("Predict: %v", err)
	}
	if content != "extracted text" {
		t.Errorf("content = %q, want %q", content, "extracted text")
	}

	if _, ok := lastRequest["max_tokens"]; ok {
		t.Errorf("request carries max_tokens, which reasoning models reject: %v", lastRequest["max_tokens"])
	}
	if got, ok := lastRequest["max_completion_tokens"]; !ok {
		t.Error("request is missing max_completion_tokens")
	} else if got != float64(defaultMaxToks) {
		t.Errorf("max_completion_tokens = %v, want %d", got, defaultMaxToks)
	}
	// Temperature 0.1 is itself rejected for these models, so migrating
	// max_tokens alone would not have been enough.
	if _, ok := lastRequest["temperature"]; ok {
		t.Errorf("request carries temperature, which reasoning models reject: %v", lastRequest["temperature"])
	}
}

// TestRemoteAPIVLMKeepsMaxTokensForNonReasoningModel guards against the fix
// regressing ordinary vision models, which still expect max_tokens.
func TestRemoteAPIVLMKeepsMaxTokensForNonReasoningModel(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")

	var lastRequest map[string]interface{}
	server := newVLMChatTestServer(t, &lastRequest)
	defer server.Close()

	v, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL,
		ModelName: "gpt-4o",
		APIKey:    "sk-test",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	if _, err := v.Predict(t.Context(), [][]byte{testPNG}, "extract the text"); err != nil {
		t.Fatalf("Predict: %v", err)
	}

	if got, ok := lastRequest["max_tokens"]; !ok {
		t.Error("request is missing max_tokens")
	} else if got != float64(defaultMaxToks) {
		t.Errorf("max_tokens = %v, want %d", got, defaultMaxToks)
	}
	if _, ok := lastRequest["max_completion_tokens"]; ok {
		t.Error("request carries max_completion_tokens for a non-reasoning model")
	}
	if got, ok := lastRequest["temperature"]; !ok {
		t.Error("request is missing temperature")
	} else if f, isFloat := got.(float64); !isFloat || math.Abs(f-float64(defaultTemp)) > 1e-6 {
		t.Errorf("temperature = %v, want %v", got, defaultTemp)
	}
}

// TestRemoteAPIVLMReportsTruncatedCompletion covers the other way a reasoning
// model yields nothing: max_completion_tokens also covers reasoning tokens, so
// an exhausted budget returns an empty message with finish_reason=length
// instead of an API error. Reporting that as an error keeps it out of the
// "no_extracted_content" bucket, where issue #2537 notes the failure is
// indistinguishable from an image that genuinely has no text.
func TestRemoteAPIVLMReportsTruncatedCompletion(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id": "chatcmpl-test",
			"object": "chat.completion",
			"choices": [
				{"index": 0, "message": {"role": "assistant", "content": ""}, "finish_reason": "length"}
			]
		}`))
	}))
	defer server.Close()

	v, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL,
		ModelName: "gpt-5-nano",
		APIKey:    "sk-test",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	_, err = v.Predict(t.Context(), [][]byte{testPNG}, "extract the text")
	if err == nil {
		t.Fatal("Predict returned nil error for a truncated completion")
	}
	if !strings.Contains(err.Error(), "truncated") {
		t.Errorf("error = %q, want it to mention truncation", err.Error())
	}
}

// TestRemoteAPIVLMUnshapedReasoningRequestIsRejected pins the upstream
// behavior this fix works around: without the shaping, go-openai rejects the
// request before it leaves the process. It fails identically for max_tokens
// and for a non-default temperature.
func TestRemoteAPIVLMUnshapedReasoningRequestIsRejected(t *testing.T) {
	withVLMSSRFWhitelist(t, "127.0.0.1")

	var lastRequest map[string]interface{}
	server := newVLMChatTestServer(t, &lastRequest)
	defer server.Close()

	v, err := NewRemoteAPIVLM(&Config{
		BaseURL:   server.URL,
		ModelName: "gpt-5-nano",
		APIKey:    "sk-test",
	})
	if err != nil {
		t.Fatalf("NewRemoteAPIVLM: %v", err)
	}

	unshaped := openai.ChatCompletionRequest{
		Model:     "gpt-5-nano",
		Messages:  []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleUser, Content: "hi"}},
		MaxTokens: defaultMaxToks,
	}
	_, err = v.client.CreateChatCompletion(t.Context(), unshaped)
	if !errors.Is(err, openai.ErrReasoningModelMaxTokensDeprecated) {
		t.Errorf("max_tokens error = %v, want ErrReasoningModelMaxTokensDeprecated", err)
	}

	tempOnly := openai.ChatCompletionRequest{
		Model:       "gpt-5-nano",
		Messages:    []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleUser, Content: "hi"}},
		Temperature: defaultTemp,
	}
	_, err = v.client.CreateChatCompletion(t.Context(), tempOnly)
	if !errors.Is(err, openai.ErrReasoningModelLimitationsOther) {
		t.Errorf("temperature error = %v, want ErrReasoningModelLimitationsOther", err)
	}
}

// The factory must preserve catalog capabilities: forcing reasoning off makes
// current GPT, Gemini and Grok vision requests fail before inference.
func TestRemoteAPIVLMPredictPreservesMandatoryReasoning(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		w.Header().Set("Content-Type", "application/json")
		if reasoning, ok := body["reasoning"].(map[string]any); ok && reasoning["effort"] == "none" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Reasoning is mandatory"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"red"}}]}`))
	}))
	defer server.Close()
	withVLMSSRFWhitelist(t, "127.0.0.1")
	saved := &types.Model{
		Name: "openai/gpt-6-astra", Source: types.ModelSourceRemote,
		Parameters: types.ModelParameters{
			Provider: "openrouter", BaseURL: server.URL,
			Reasoning: types.ReasoningParameters{Supported: true, Mandatory: true},
		},
	}
	model, err := NewRemoteAPIVLM(ConfigFromModel(saved, "", ""))
	if err != nil {
		t.Fatal(err)
	}
	got, err := model.Predict(context.Background(), [][]byte{testPNG}, "Identify the color")
	if err != nil {
		t.Fatal(err)
	}
	if got != "red" {
		t.Fatalf("got %q, want red", got)
	}
}
