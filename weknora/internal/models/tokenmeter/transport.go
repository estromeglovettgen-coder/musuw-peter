// Package tokenmeter observes only model-provider HTTP clients. Identity and
// durable accounting live behind Ledger; prompts and credentials are never saved.
package tokenmeter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/tiktoken-go/tokenizer"
)

type Ledger interface {
	Begin(context.Context, string, string, int64, int64) (string, int64, error)
	Settle(context.Context, string, int64, int64, bool, bool) error
}

var registration struct {
	sync.RWMutex
	ledger Ledger
}

func Configure(l Ledger) { registration.Lock(); registration.ledger = l; registration.Unlock() }
func current() Ledger    { registration.RLock(); defer registration.RUnlock(); return registration.ledger }

type transport struct {
	base http.RoundTripper
	kind string
}

func Wrap(base http.RoundTripper, kind string) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &transport{base, kind}
}
func Client(client *http.Client, kind string) *http.Client {
	copy := *client
	copy.Transport = Wrap(copy.Transport, kind)
	return &copy
}

var codecMu sync.Mutex
var codec tokenizer.Codec

func count(s string) int64 {
	if s == "" {
		return 0
	}
	codecMu.Lock()
	defer codecMu.Unlock()
	if codec == nil {
		codec, _ = tokenizer.Get(tokenizer.Cl100kBase)
	}
	if codec != nil {
		ids, _, e := codec.Encode(s)
		if e == nil {
			return int64(len(ids))
		}
	}
	return int64((len([]rune(s)) + 1) / 2)
}

// Text excludes encoded binary inputs and transport/auth metadata. The fallback
// is explicitly estimated; provider statistics always replace it when present.
func textValue(v any) string {
	switch v := v.(type) {
	case string:
		if strings.HasPrefix(v, "data:") || len(v) > 2_000_000 {
			return ""
		}
		return v
	case []any:
		var b strings.Builder
		for _, x := range v {
			b.WriteString(textValue(x))
			b.WriteByte('\n')
		}
		return b.String()
	case map[string]any:
		var b strings.Builder
		for k, x := range v {
			switch k {
			case "image", "images", "image_url", "video_url", "file_data", "data", "embedding", "embeddings", "audio", "api_key", "key", "Authorization":
				continue
			}
			b.WriteString(textValue(x))
			b.WriteByte('\n')
		}
		return b.String()
	}
	return ""
}
func (t *transport) RoundTrip(req *http.Request) (*http.Response, error) {
	ledger := current()
	if ledger == nil || req.Method != "POST" {
		return t.base.RoundTrip(req)
	}
	// Ollama inventory/pull and provider OAuth are operational, not inference.
	if strings.Contains(req.URL.Path, "/pull") || strings.Contains(req.URL.Path, "/show") || strings.Contains(req.URL.Path, "/tags") {
		return t.base.RoundTrip(req)
	}
	request := req.Clone(req.Context())
	var payload map[string]any
	input := int64(1)
	output := int64(0)
	model := t.kind
	if strings.Contains(req.Header.Get("Content-Type"), "json") && req.Body != nil {
		raw, e := io.ReadAll(io.LimitReader(req.Body, 64*1024*1024+1))
		if e != nil {
			return nil, e
		}
		req.Body.Close()
		if len(raw) > 64*1024*1024 {
			return nil, fmt.Errorf("model request exceeds 64 MiB")
		}
		request.Body = io.NopCloser(bytes.NewReader(raw))
		request.ContentLength = int64(len(raw))
		if json.Unmarshal(raw, &payload) == nil {
			input = max(int64(1), count(textValue(payload)))
			if v, ok := payload["model"].(string); ok {
				model = v
			}
			if (t.kind == "chat" || t.kind == "vision") && !strings.Contains(req.URL.Path, "/embed") {
				output = 4096
				for _, k := range []string{"max_tokens", "max_completion_tokens", "max_output_tokens"} {
					if n, ok := payload[k].(float64); ok && n > 0 {
						if n > 1_000_000 {
							return nil, fmt.Errorf("invalid model output limit")
						}
						output = int64(n)
					}
				}
				if cfg, ok := payload["generationConfig"].(map[string]any); ok {
					if n, ok := cfg["maxOutputTokens"].(float64); ok && n > 0 && n <= 1_000_000 {
						output = int64(n)
					}
				}
				if cfg, ok := payload["options"].(map[string]any); ok {
					if n, ok := cfg["num_predict"].(float64); ok && n > 0 && n <= 1_000_000 {
						output = int64(n)
					}
				}
			}
		}
	} else if t.kind == "asr" {
		output = 4096
	}
	purpose, _ := types.LLMCallMetadataFromContext(req.Context())
	if purpose == "" {
		purpose = t.kind
	}
	id, budget, e := ledger.Begin(req.Context(), purpose, model, input, input+output)
	if e != nil {
		code := 503
		message := "用量服务暂不可用，请稍后重试"
		var classified interface{ HTTPStatus() int }
		if errors.As(e, &classified) {
			code = classified.HTTPStatus()
			message = e.Error()
		}
		raw, _ := json.Marshal(map[string]any{"error": map[string]string{"message": message, "type": "token_allowance", "code": "token_allowance"}})
		return &http.Response{StatusCode: code, Status: fmt.Sprintf("%d %s", code, http.StatusText(code)), Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(raw)), Request: req}, nil
	}
	if id != "" && payload != nil && output > 0 && budget < input+output {
		cap := max(int64(1), budget-input)
		key := "max_tokens"
		for _, k := range []string{"max_completion_tokens", "max_output_tokens"} {
			if _, ok := payload[k]; ok {
				key = k
			}
		}
		switch {
		case strings.Contains(req.URL.Path, "generateContent") || strings.Contains(req.URL.Path, "streamGenerateContent"):
			cfg, _ := payload["generationConfig"].(map[string]any)
			if cfg == nil {
				cfg = map[string]any{}
				payload["generationConfig"] = cfg
			}
			cfg["maxOutputTokens"] = cap
		case strings.Contains(req.URL.Path, "/api/chat") || strings.Contains(req.URL.Path, "/api/generate"):
			cfg, _ := payload["options"].(map[string]any)
			if cfg == nil {
				cfg = map[string]any{}
				payload["options"] = cfg
			}
			cfg["num_predict"] = cap
		default:
			payload[key] = cap
		}
		raw, _ := json.Marshal(payload)
		request.Body = io.NopCloser(bytes.NewReader(raw))
		request.ContentLength = int64(len(raw))
		request.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(raw)), nil }
	}
	var dispatched atomic.Bool
	request = request.WithContext(httptrace.WithClientTrace(request.Context(), &httptrace.ClientTrace{WroteRequest: func(info httptrace.WroteRequestInfo) {
		if info.Err == nil {
			dispatched.Store(true)
		}
	}}))
	resp, e := t.base.RoundTrip(request)
	if e != nil {
		if id != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if se := ledger.Settle(ctx, id, budget, 0, true, !dispatched.Load()); se != nil {
				return nil, fmt.Errorf("provider failed; usage settlement pending: %w", se)
			}
		}
		return nil, e
	}
	if id == "" {
		return resp, nil
	}
	observed := &body{ReadCloser: resp.Body, ledger: ledger, id: id, inputEstimate: input, budget: budget, success: resp.StatusCode >= 200 && resp.StatusCode < 300, stream: strings.Contains(resp.Header.Get("Content-Type"), "event-stream") || strings.Contains(resp.Header.Get("Content-Type"), "ndjson")}
	if n, e := strconv.ParseInt(resp.Header.Get("x-compute-tokens"), 10, 64); e == nil && n > 0 {
		observed.input = n
		observed.reported = true
	}
	resp.Body = observed
	return resp, nil
}

type body struct {
	mu sync.Mutex
	io.ReadCloser
	ledger                                    Ledger
	id                                        string
	inputEstimate, budget                     int64
	success, stream, done, reported, finished bool
	input, output                             int64
	buffer                                    []byte
	outputText                                strings.Builder
}

func (b *body) observe(v any) {
	m, ok := v.(map[string]any)
	if !ok {
		return
	}
	for _, key := range []string{"usage", "usageMetadata", "usage_metadata"} {
		if u, ok := m[key].(map[string]any); ok {
			n := func(keys ...string) int64 {
				for _, k := range keys {
					if v, ok := u[k].(float64); ok {
						return int64(v)
					}
				}
				return 0
			}
			in := n("prompt_tokens", "input_tokens", "promptTokenCount", "inputTokenCount")
			out := n("completion_tokens", "output_tokens", "candidatesTokenCount", "outputTokenCount")
			total := n("total_tokens", "totalTokenCount")
			if total > in+out {
				out = total - in
			}
			if in+out > 0 {
				b.reported = true
				b.input = max(b.input, in)
				b.output = max(b.output, out)
			}
		}
	}
	if n, ok := m["prompt_eval_count"].(float64); ok {
		b.reported = true
		b.input = int64(n)
		if o, ok := m["eval_count"].(float64); ok {
			b.output = int64(o)
		}
	}
	if msg, ok := m["message"].(map[string]any); ok {
		b.observe(msg)
	}
	if delta, ok := m["delta"].(map[string]any); ok {
		b.observe(delta)
	}
	if choices, ok := m["choices"].([]any); ok {
		for _, c := range choices {
			b.observe(c)
		}
	}
	for _, key := range []string{"content", "text", "reasoning_content", "thinking", "arguments"} {
		if s, ok := m[key].(string); ok && b.outputText.Len() < 4*1024*1024 {
			b.outputText.WriteString(s)
		}
	}
	if calls, ok := m["tool_calls"].([]any); ok {
		for _, c := range calls {
			if x, ok := c.(map[string]any); ok {
				b.observe(x["function"])
			}
		}
	}
}
func (b *body) parse(raw []byte) {
	raw = bytes.TrimSpace(raw)
	raw = bytes.TrimSpace(bytes.TrimPrefix(raw, []byte("data:")))
	if bytes.Equal(raw, []byte("[DONE]")) {
		b.finished = true
		return
	}
	var v any
	if json.Unmarshal(raw, &v) == nil {
		b.observe(v)
	}
}
func (b *body) Read(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n, e := b.ReadCloser.Read(p)
	if n > 0 {
		b.buffer = append(b.buffer, p[:n]...)
		if b.stream {
			for {
				idx := bytes.IndexByte(b.buffer, '\n')
				if idx < 0 {
					break
				}
				b.parse(b.buffer[:idx])
				b.buffer = b.buffer[idx+1:]
			}
		}
		if len(b.buffer) > 32*1024*1024 {
			return n, fmt.Errorf("model response exceeds accounting limit")
		}
	}
	if e == io.EOF {
		b.finished = true
		if len(b.buffer) > 0 {
			b.parse(b.buffer)
			b.buffer = nil
		}
		if se := b.settle(); se != nil {
			return n, se
		}
	}
	return n, e
}
func (b *body) settle() error {
	if b.done {
		return nil
	}
	input, output := b.input, b.output
	estimated := !b.reported
	release := !b.success && !b.reported
	if estimated && !release {
		input = b.inputEstimate
		output = count(b.outputText.String())
		if !b.finished {
			input = b.budget
			output = 0
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var e error
	for attempt := 0; attempt < 3; attempt++ {
		e = b.ledger.Settle(ctx, b.id, input, output, estimated, release)
		if e == nil {
			b.done = true
			return nil
		}
		if ctx.Err() != nil {
			break
		}
	}
	return fmt.Errorf("Token结算暂未完成，请稍后查看用量: %w", e)
}
func (b *body) Close() error {
	e := b.ReadCloser.Close()
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.done {
		if len(b.buffer) > 0 {
			b.parse(b.buffer)
			b.buffer = nil
		}
		if se := b.settle(); se != nil {
			return se
		}
	}
	return e
}
