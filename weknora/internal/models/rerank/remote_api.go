package rerank

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/Tencent/WeKnora/internal/logger"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	secutils "github.com/Tencent/WeKnora/internal/utils"
)

// OpenAIReranker implements a reranking system based on OpenAI models
type OpenAIReranker struct {
	modelName     string       // Name of the model used for reranking
	modelID       string       // Unique identifier of the model
	apiKey        string       // API key for authentication
	baseURL       string       // Base URL for API requests
	client        *http.Client // HTTP client for making API requests
	customHeaders map[string]string
	// truncatePromptTokens, when > 0, is sent as the vLLM-specific
	// truncate_prompt_tokens request field. It must never be sent by default:
	// providers that honor it (e.g. SiliconFlow) keep only the LAST N tokens of
	// the templated rerank prompt, which cuts the query off long documents and
	// collapses every relevance score to near zero (issue #2143).
	truncatePromptTokens int
	teiFormat            bool
}

// SetCustomHeaders 设置用户自定义 HTTP 请求头（类似 OpenAI Python SDK 的 extra_headers）。
func (r *OpenAIReranker) SetCustomHeaders(headers map[string]string) {
	r.customHeaders = headers
}

func (r *OpenAIReranker) SetOpenRouterMeter(meter modelopenrouter.Meter) {
	r.client = modelopenrouter.WrapHTTPClient(r.client, meter)
}

// RerankRequest represents a request to rerank documents based on relevance to a query
type RerankRequest struct {
	Model                string                 `json:"model"`                            // Model to use for reranking
	Query                string                 `json:"query"`                            // Query text to compare documents against
	Documents            []string               `json:"documents"`                        // List of document texts to rerank
	AdditionalData       map[string]interface{} `json:"additional_data,omitempty"`        // Optional additional data for the model
	TruncatePromptTokens int                    `json:"truncate_prompt_tokens,omitempty"` // Maximum prompt tokens to use (vLLM-specific, opt-in)
}

// RerankResponse represents the response from a reranking request
type RerankResponse struct {
	ID      string       `json:"id"`      // Request ID
	Model   string       `json:"model"`   // Model used for reranking
	Usage   UsageInfo    `json:"usage"`   // Token usage information
	Results []RankResult `json:"results"` // Ranked results with relevance scores
}

// UsageInfo contains information about token usage in the API request
type UsageInfo struct {
	TotalTokens int `json:"total_tokens"` // Total tokens consumed
}

// NewOpenAIReranker creates a new instance of OpenAI reranker with the provided configuration
func NewOpenAIReranker(config *RerankerConfig) (*OpenAIReranker, error) {
	apiKey := config.APIKey
	baseURL := "https://api.openai.com/v1"
	if url := config.BaseURL; url != "" {
		baseURL = url
	}
	if err := validateRerankBaseURL(baseURL); err != nil {
		return nil, err
	}

	// Optional opt-in for vLLM-style deployments that need server-side prompt
	// truncation. Configured via extra_config; never enabled by default.
	truncatePromptTokens := 0
	if config.ExtraConfig != nil {
		if raw := strings.TrimSpace(config.ExtraConfig["truncate_prompt_tokens"]); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil || n <= 0 {
				return nil, fmt.Errorf("invalid truncate_prompt_tokens in extra_config: %q", raw)
			}
			truncatePromptTokens = n
		}
	}

	return &OpenAIReranker{
		modelName:            config.ModelName,
		modelID:              config.ModelID,
		apiKey:               apiKey,
		baseURL:              baseURL,
		client:               newRerankHTTPClient(0),
		truncatePromptTokens: truncatePromptTokens,
		teiFormat:            config.ExtraConfig["rerank_format"] == "tei",
	}, nil
}

// Rerank performs document reranking based on relevance to the query
func (r *OpenAIReranker) Rerank(ctx context.Context, query string, documents []string) ([]RankResult, error) {
	// Build the request body. truncate_prompt_tokens is only included when
	// explicitly configured: sending it unconditionally corrupts scores on
	// providers that honor it (see OpenAIReranker.truncatePromptTokens).
	var requestBody interface{} = &RerankRequest{
		Model:                r.modelName,
		Query:                query,
		Documents:            documents,
		TruncatePromptTokens: r.truncatePromptTokens,
	}
	// Self-hosted Hugging Face TEI uses texts and an array response, unlike
	// OpenAI-compatible rerank services. Select it explicitly; never guess
	// from a hostname or alter other providers' request contracts.
	if r.teiFormat {
		requestBody = struct {
			Query    string   `json:"query"`
			Texts    []string `json:"texts"`
			Truncate bool     `json:"truncate"`
		}{query, documents, true}
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request body: %w", err)
	}

	// Send the request
	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/rerank", r.baseURL), bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", r.apiKey))
	secutils.ApplyCustomHeaders(req, r.customHeaders)

	logger.Debugf(ctx, "%s", buildRerankRequestDebug(r.modelName, fmt.Sprintf("%s/rerank", r.baseURL), query, documents))

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	// Read the response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Rerank API error: Http Status: %s", resp.Status)
	}

	if r.teiFormat {
		var results []RankResult
		if err := json.Unmarshal(body, &results); err != nil {
			return nil, fmt.Errorf("unmarshal TEI rerank response: %w", err)
		}
		return results, nil
	}
	var response RerankResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	return response.Results, nil
}

// GetModelName returns the name of the reranking model
func (r *OpenAIReranker) GetModelName() string {
	return r.modelName
}

// GetModelID returns the unique identifier of the reranking model
func (r *OpenAIReranker) GetModelID() string {
	return r.modelID
}
