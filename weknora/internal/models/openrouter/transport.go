package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	CreditExhaustedCode         = "openrouter_credits_exhausted"
	AllowanceRenewalPendingCode = "billing_renewal_pending"
)

// ErrAllowanceRenewalPending is returned before a provider request when a
// paid entitlement has reached the end of its verified billing term but the
// signed renewal event has not arrived yet. Keeping this sentinel at the
// provider transport boundary lets every model path classify the same state
// without inspecting provider error text.
var ErrAllowanceRenewalPending = errors.New("allowance renewal is awaiting payment confirmation")

// CreditExhaustedError is the provider-level hard monthly-spend boundary. It is
// intentionally distinct from transient transport/provider failures so callers
// can avoid retries and preserve any answer already streamed to the user.
type CreditExhaustedError struct {
	StatusCode int
}

func (e *CreditExhaustedError) Error() string {
	return "OpenRouter monthly AI credits are exhausted"
}

// IsCreditExhausted is intentionally type-only. Generic business/task layers
// must not infer provider identity from arbitrary error text such as "credit
// limit" and accidentally suppress retries for another upstream. Text parsing
// is kept in PayloadIndicatesCreditExhausted, whose caller already knows the
// payload came from an OpenRouter SSE stream.
func IsCreditExhausted(err error) bool {
	if err == nil {
		return false
	}
	var target *CreditExhaustedError
	return errors.As(err, &target)
}

// IsAllowanceRenewalPending classifies the durable entitlement gate. It is
// intentionally type/sentinel based; arbitrary provider or task error text
// must never be promoted to a billing state.
func IsAllowanceRenewalPending(err error) bool {
	return err != nil && errors.Is(err, ErrAllowanceRenewalPending)
}

// ErrorCode returns the stable wire code for known OpenRouter boundary
// failures. Unknown errors deliberately return an empty string so callers do
// not infer a billing/provider state from human-readable text.
func ErrorCode(err error) string {
	switch {
	case IsAllowanceRenewalPending(err):
		return AllowanceRenewalPendingCode
	case IsCreditExhausted(err):
		return CreditExhaustedCode
	default:
		return ""
	}
}

// PayloadIndicatesCreditExhausted handles OpenRouter responses that start a
// successful SSE stream and later emit an error object when the key budget is
// reached. Provider-specific text fallback is safe here because the caller has
// already established the payload source as OpenRouter.
func PayloadIndicatesCreditExhausted(payload []byte) bool {
	return textIndicatesCreditExhausted(string(payload))
}

func textIndicatesCreditExhausted(value string) bool {
	lower := strings.ToLower(value)
	for _, marker := range []string{
		"payment_required",
		"insufficient credits",
		"insufficient credit",
		"credit limit",
		"credits exhausted",
		"credit exhausted",
		"spending limit",
		"key limit exceeded",
		"in balance for video",
	} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return strings.Contains(lower, `"code":402`) || strings.Contains(lower, `"code":"402"`)
}

// Meter supplies the tenant-scoped provider key and stable end-user
// attribution. OpenRouter itself enforces the monthly spend limit on the key.
type Meter interface {
	OpenRouterAPIKey(ctx context.Context) (string, error)
	OpenRouterUserID(ctx context.Context) string
}

type trackingTransport struct {
	base  http.RoundTripper
	meter Meter
}

type replayReadCloser struct {
	io.Reader
	closer io.Closer
}

func (r *replayReadCloser) Close() error {
	return r.closer.Close()
}

func WrapHTTPClient(base *http.Client, meter Meter) *http.Client {
	if base == nil {
		base = &http.Client{}
	}
	clone := *base
	transport := base.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	clone.Transport = &trackingTransport{base: transport, meter: meter}
	return &clone
}

func (t *trackingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.meter == nil {
		return t.base.RoundTrip(req)
	}
	apiKey, err := t.meter.OpenRouterAPIKey(req.Context())
	if err != nil {
		return nil, err
	}
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, fmt.Errorf("OpenRouter tenant API key is empty")
	}

	outbound := req.Clone(req.Context())
	outbound.Header = req.Header.Clone()
	outbound.Header.Set("Authorization", "Bearer "+apiKey)

	// The OpenRouter `user` field is only part of JSON inference payloads.
	// Do not buffer multipart ASR bodies merely for attribution; the tenant key
	// still enforces spend for every request regardless of content type.
	if isJSONRequest(outbound) {
		body, readErr := readAndRestoreRequest(outbound)
		if readErr != nil {
			return nil, readErr
		}
		if len(body) > 0 {
			body = injectUser(body, t.meter.OpenRouterUserID(outbound.Context()))
			restoreRequest(outbound, body)
		}
	}

	resp, err := t.base.RoundTrip(outbound)
	if err != nil {
		return nil, err
	}
	creditExhausted := resp != nil && resp.StatusCode == http.StatusPaymentRequired
	if resp != nil && resp.StatusCode == http.StatusForbidden && resp.Body != nil {
		// OpenRouter child-key total limits currently use a provider-scoped 403
		// payload rather than 402. Inspect only this known provider response and
		// restore the bytes for every unrelated 403 so normal SDK error handling
		// remains byte-for-byte intact.
		providerBody := resp.Body
		prefix, readErr := io.ReadAll(io.LimitReader(providerBody, 64*1024))
		if readErr != nil {
			_ = providerBody.Close()
			return nil, readErr
		}
		resp.Body = &replayReadCloser{
			Reader: io.MultiReader(bytes.NewReader(prefix), providerBody),
			closer: providerBody,
		}
		creditExhausted = PayloadIndicatesCreditExhausted(prefix)
	}
	if creditExhausted {
		// Never pass a provider credit boundary into generic retry/fallback machinery. Drain a
		// bounded body for connection reuse but do not surface provider text that
		// may contain account metadata.
		if resp.Body != nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
			_ = resp.Body.Close()
		}
		return nil, &CreditExhaustedError{StatusCode: resp.StatusCode}
	}
	return resp, nil
}

func isJSONRequest(req *http.Request) bool {
	contentType := strings.ToLower(req.Header.Get("Content-Type"))
	return strings.Contains(contentType, "application/json")
}

func readAndRestoreRequest(req *http.Request) ([]byte, error) {
	if req.Body == nil {
		return nil, nil
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	restoreRequest(req, body)
	return body, nil
}

func restoreRequest(req *http.Request, body []byte) {
	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	if req.GetBody != nil {
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(body)), nil
		}
	}
}

func injectUser(body []byte, user string) []byte {
	if strings.TrimSpace(user) == "" {
		return body
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}
	payload["user"] = user
	updated, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return updated
}
