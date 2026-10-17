package tokenmeter

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeLedger struct {
	begins, settles    int
	input, output      int64
	estimated, release bool
	block              bool
	budget             int64
}
type quotaFailure struct{}

func (quotaFailure) Error() string   { return "exhausted" }
func (quotaFailure) HTTPStatus() int { return 402 }

func (f *fakeLedger) Begin(ctx context.Context, p, m string, input, requested int64) (string, int64, error) {
	f.begins++
	if f.block {
		return "", 0, quotaFailure{}
	}
	if f.budget == 0 {
		f.budget = requested
	}
	return "call-1", f.budget, nil
}
func (f *fakeLedger) Settle(ctx context.Context, id string, input, output int64, estimated, release bool) error {
	f.settles++
	f.input = input
	f.output = output
	f.estimated = estimated
	f.release = release
	return nil
}
func TestTransparentStreamUsesProviderUsageOnceWithoutCacheDoubleCount(t *testing.T) {
	f := &fakeLedger{}
	Configure(f)
	t.Cleanup(func() { Configure(nil) })
	original := "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"total_tokens\":120,\"prompt_cache_hit_tokens\":90}}\n\ndata: [DONE]\n\n"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer secret", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, original)
	}))
	defer srv.Close()
	req, _ := http.NewRequest("POST", srv.URL, strings.NewReader(`{"model":"deepseek-flash","messages":[{"role":"user","content":"hi"}],"stream":true}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer secret")
	resp, e := Client(srv.Client(), "chat").Do(req)
	require.NoError(t, e)
	raw, e := io.ReadAll(resp.Body)
	require.NoError(t, e)
	require.NoError(t, resp.Body.Close())
	require.Equal(t, original, string(raw))
	require.Equal(t, 1, f.settles)
	require.EqualValues(t, 100, f.input)
	require.EqualValues(t, 20, f.output)
	require.False(t, f.estimated)
}
func TestBlockedRequestNeverReachesProviderAndNonUsageIsMarked(t *testing.T) {
	f := &fakeLedger{block: true}
	Configure(f)
	t.Cleanup(func() { Configure(nil) })
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"data":[{"embedding":[0.1,0.2]}]}`)
	}))
	defer srv.Close()
	invoke := func() {
		req, _ := http.NewRequest("POST", srv.URL, strings.NewReader(`{"input":["测试文本"],"model":"embed"}`))
		req.Header.Set("Content-Type", "application/json")
		resp, e := Client(srv.Client(), "embedding").Do(req)
		require.NoError(t, e)
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		if f.block {
			require.Equal(t, 402, resp.StatusCode)
		}
	}
	invoke()
	require.Zero(t, calls)
	require.Zero(t, f.settles)
	f.block = false
	invoke()
	require.Equal(t, 1, calls)
	require.True(t, f.estimated)
	require.Positive(t, f.input)
	require.Zero(t, f.output)
}
func TestFailureReleasesAndCancellationCannotBeFree(t *testing.T) {
	f := &fakeLedger{}
	Configure(f)
	t.Cleanup(func() { Configure(nil) })
	b := &body{ReadCloser: io.NopCloser(strings.NewReader(`{"error":"bad request"}`)), ledger: f, id: "c", budget: 100, inputEstimate: 10}
	_, e := io.ReadAll(b)
	require.NoError(t, e)
	require.True(t, f.release)
	f.settles = 0
	b = &body{ReadCloser: io.NopCloser(strings.NewReader("")), ledger: f, id: "c2", budget: 100, inputEstimate: 10, success: true, stream: true}
	require.NoError(t, b.Close())
	require.True(t, f.estimated)
	require.False(t, f.release)
	require.EqualValues(t, 100, f.input)
	require.Equal(t, 1, f.settles)
}
