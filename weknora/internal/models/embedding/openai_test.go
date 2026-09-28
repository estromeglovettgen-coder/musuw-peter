package embedding

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
)

type openAIEmbeddingRoundTripFunc func(*http.Request) (*http.Response, error)

func (f openAIEmbeddingRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestOpenAIEmbedderDoesNotRetryTerminalOpenRouterErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{name: "allowance renewal pending", err: modelopenrouter.ErrAllowanceRenewalPending},
		{name: "credits exhausted", err: &modelopenrouter.CreditExhaustedError{StatusCode: http.StatusPaymentRequired}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			embedder := &OpenAIEmbedder{
				apiKey:     "test-key",
				baseURL:    "https://embedding.invalid/v1",
				maxRetries: 1,
				httpClient: &http.Client{Transport: openAIEmbeddingRoundTripFunc(func(*http.Request) (*http.Response, error) {
					calls++
					return nil, tt.err
				})},
			}

			_, err := embedder.doRequestWithRetry(context.Background(), []byte(`{"input":["x"]}`))
			if !errors.Is(err, tt.err) && modelopenrouter.ErrorCode(err) != modelopenrouter.ErrorCode(tt.err) {
				t.Fatalf("doRequestWithRetry error = %v, want terminal error %v", err, tt.err)
			}
			if calls != 1 {
				t.Fatalf("terminal error calls = %d, want 1", calls)
			}
		})
	}
}

func TestOpenAIEmbedderStillRetriesTransientTransportErrors(t *testing.T) {
	transientErr := errors.New("temporary transport failure")
	calls := 0
	embedder := &OpenAIEmbedder{
		apiKey:     "test-key",
		baseURL:    "https://embedding.invalid/v1",
		maxRetries: 1,
		httpClient: &http.Client{Transport: openAIEmbeddingRoundTripFunc(func(*http.Request) (*http.Response, error) {
			calls++
			if calls == 1 {
				return nil, transientErr
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Body:       io.NopCloser(strings.NewReader(`{"data":[]}`)),
			}, nil
		})},
	}

	resp, err := embedder.doRequestWithRetry(context.Background(), []byte(`{"input":["x"]}`))
	if err != nil {
		t.Fatalf("doRequestWithRetry returned transient error after recovery: %v", err)
	}
	if resp == nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("doRequestWithRetry response = %#v, want HTTP 200", resp)
	}
	if calls != 2 {
		t.Fatalf("transient error calls = %d, want 2", calls)
	}
}

func TestOpenAIEmbedderBatchEmbedOmitsDimensionsByDefault(t *testing.T) {
	requestBody := captureOpenAIEmbeddingRequest(t, "text-embedding-3-small", 256, false)

	if _, ok := requestBody["dimensions"]; ok {
		t.Fatalf("expected request body to omit dimensions by default, got %v", requestBody)
	}
}

func TestOpenAIEmbedderBatchEmbedSendsDimensionsWhenOverrideEnabled(t *testing.T) {
	requestBody := captureOpenAIEmbeddingRequest(t, "text-embedding-3-small", 256, true)

	got, ok := requestBody["dimensions"]
	if !ok {
		t.Fatalf("expected request body to include dimensions, got %v", requestBody)
	}
	if got != float64(256) {
		t.Fatalf("unexpected dimensions value: got %v want 256", got)
	}
}

func TestOpenAIEmbedderBatchEmbedOmitsDimensionsForOpenAICompatibleModels(t *testing.T) {
	requestBody := captureOpenAIEmbeddingRequest(t, "text-embedding-v3", 1024, false)

	if _, ok := requestBody["dimensions"]; ok {
		t.Fatalf("expected request body to omit dimensions for OpenAI-compatible model, got %v", requestBody)
	}
}

func TestOpenAIEmbedderBatchEmbedOmitsDimensionsForFixedSizeModels(t *testing.T) {
	requestBody := captureOpenAIEmbeddingRequest(t, "text-embedding-ada-002", 1536, false)

	if _, ok := requestBody["dimensions"]; ok {
		t.Fatalf("expected request body to omit dimensions for fixed-size model, got %v", requestBody)
	}
}

func captureOpenAIEmbeddingRequest(t *testing.T, modelName string, dimensions int, supportsDimensionOverride bool) map[string]any {
	t.Helper()
	t.Setenv("SSRF_WHITELIST", "127.0.0.1")

	requestBody := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embeddings" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"embedding":[0.1,0.2],"index":0}]}`))
	}))
	defer server.Close()

	embedder, err := NewOpenAIEmbedder(
		"test-key",
		server.URL,
		modelName,
		511,
		dimensions,
		"8f7d6082-5a15-4f84-ae55-88b2bdac4ba0",
		nil,
	)
	if err != nil {
		t.Fatalf("NewOpenAIEmbedder: %v", err)
	}
	embedder.SetSupportsDimensionOverride(supportsDimensionOverride)

	if _, err := embedder.BatchEmbed(context.Background(), []string{"hello"}); err != nil {
		t.Fatalf("BatchEmbed: %v", err)
	}

	return requestBody
}
