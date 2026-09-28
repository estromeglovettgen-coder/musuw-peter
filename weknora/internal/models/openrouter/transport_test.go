package openrouter

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const videoBalanceErrorPayload = `{"error":{"code":403,"message":` +
	`"This request requires at least $1.00 in balance for video"}}`

type meterStub struct {
	key      string
	user     string
	keyCalls int
}

func (m *meterStub) OpenRouterAPIKey(context.Context) (string, error) {
	m.keyCalls++
	return m.key, nil
}

func (m *meterStub) OpenRouterUserID(context.Context) string { return m.user }

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

type closeTrackingBody struct {
	io.Reader
	closed bool
}

func (b *closeTrackingBody) Close() error {
	b.closed = true
	return nil
}

func TestTransportUsesTenantKeyAndInjectsStableUser(t *testing.T) {
	meter := &meterStub{key: "tenant-child-key", user: "musuw_opaque"}
	base := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		assert.Equal(t, "Bearer tenant-child-key", req.Header.Get("Authorization"))
		body, err := io.ReadAll(req.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), `"user":"musuw_opaque"`)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"choices":[]}`)),
			Request:    req,
		}, nil
	})}
	client := WrapHTTPClient(base, meter)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewBufferString(`{"model":"test"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer global-platform-key")

	resp, err := client.Do(req)
	require.NoError(t, err)
	_, err = io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	assert.Equal(t, 1, meter.keyCalls)
}

func TestTransportUsesTenantKeyWithoutBufferingMultipartBody(t *testing.T) {
	meter := &meterStub{key: "tenant-child-key", user: "musuw_opaque"}
	const audioBody = "raw-multipart-audio"
	base := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		assert.Equal(t, "Bearer tenant-child-key", req.Header.Get("Authorization"))
		body, err := io.ReadAll(req.Body)
		require.NoError(t, err)
		assert.Equal(t, audioBody, string(body))
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"text":"ok"}`)), Request: req}, nil
	})}
	client := WrapHTTPClient(base, meter)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://openrouter.ai/api/v1/audio/transcriptions", strings.NewReader(audioBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=test")

	resp, err := client.Do(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	assert.Equal(t, 1, meter.keyCalls)
}

func TestTransportClassifiesHTTP402AsCreditExhausted(t *testing.T) {
	meter := &meterStub{key: "tenant-child-key", user: "musuw_opaque"}
	base := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusPaymentRequired,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"error":{"code":402,"message":"payment_required"}}`)),
			Request:    req,
		}, nil
	})}
	client := WrapHTTPClient(base, meter)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewBufferString(`{"model":"test"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	assert.Nil(t, resp)
	require.Error(t, err)
	assert.True(t, IsCreditExhausted(err))
	assert.Contains(t, err.Error(), "monthly AI credits")
}

func TestTransportClassifiesOpenRouterHTTP403VideoBalanceAsCreditExhausted(t *testing.T) {
	meter := &meterStub{key: "tenant-child-key", user: "musuw_opaque"}
	base := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(videoBalanceErrorPayload)),
			Request:    req,
		}, nil
	})}
	client := WrapHTTPClient(base, meter)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewBufferString(`{"model":"test"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	assert.Nil(t, resp)
	require.Error(t, err)
	assert.True(t, IsCreditExhausted(err))
	assert.Equal(t, CreditExhaustedCode, ErrorCode(err))
}

func TestTransportPreservesUnrelatedHTTP403Response(t *testing.T) {
	meter := &meterStub{key: "tenant-child-key", user: "musuw_opaque"}
	const responseBody = `{"error":{"code":403,"message":"model access denied"}}`
	providerBody := &closeTrackingBody{Reader: strings.NewReader(responseBody)}
	base := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Header:     make(http.Header),
			Body:       providerBody,
			Request:    req,
		}, nil
	})}
	client := WrapHTTPClient(base, meter)
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "https://openrouter.ai/api/v1/chat/completions", bytes.NewBufferString(`{"model":"test"}`))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Equal(t, responseBody, string(body))
	assert.True(t, providerBody.closed)
}

func TestCreditExhaustedClassificationStaysProviderScoped(t *testing.T) {
	// Generic task/business errors are not assumed to be OpenRouter just because
	// their text happens to mention a credit limit.
	assert.False(t, IsCreditExhausted(errors.New("third-party credit limit exceeded")))
	assert.True(t, IsCreditExhausted(&CreditExhaustedError{StatusCode: http.StatusPaymentRequired}))

	// Text fallback remains available for a payload already known to come from
	// the OpenRouter SSE stream.
	assert.True(t, PayloadIndicatesCreditExhausted([]byte(`{"error":{"code":402,"message":"payment_required"}}`)))
	assert.True(t, PayloadIndicatesCreditExhausted([]byte(`{"error":{"message":"spending limit reached"}}`)))
	assert.True(t, PayloadIndicatesCreditExhausted([]byte(`{"error":{"code":403,"message":"Key limit exceeded (total limit)"}}`)))
	assert.True(t, PayloadIndicatesCreditExhausted([]byte(videoBalanceErrorPayload)))
	assert.False(t, PayloadIndicatesCreditExhausted([]byte(`{"error":{"code":429,"message":"rate limited"}}`)))
}

func TestAllowanceRenewalPendingClassificationIsStableAndTextIndependent(t *testing.T) {
	wrapped := fmt.Errorf("transport boundary: %w", ErrAllowanceRenewalPending)

	assert.True(t, IsAllowanceRenewalPending(wrapped))
	assert.Equal(t, AllowanceRenewalPendingCode, ErrorCode(wrapped))
	assert.False(t, IsAllowanceRenewalPending(errors.New("allowance renewal is awaiting payment confirmation")))
	assert.False(t, IsAllowanceRenewalPending(errors.New("provider says billing_renewal_pending")))
	assert.Empty(t, ErrorCode(errors.New("third-party billing renewal pending")))
}
