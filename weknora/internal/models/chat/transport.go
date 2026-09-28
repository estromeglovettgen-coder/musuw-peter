package chat

import (
	"context"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	secutils "github.com/Tencent/WeKnora/internal/utils"
)

// LLM 调用超时配置。单次请求不能因上层批处理拥有更长 deadline 而永久阻塞；
// 上层 deadline 更短时仍优先尊重上层。可通过环境变量覆盖：
//   - WEKNORA_LLM_CHAT_TIMEOUT_SECONDS    非流式调用兜底超时（默认 300s）
//   - WEKNORA_LLM_STREAM_TIMEOUT_SECONDS  流式调用兜底超时（默认 600s）
var (
	defaultChatTimeout   = envDurationSeconds("WEKNORA_LLM_CHAT_TIMEOUT_SECONDS", 300*time.Second)
	defaultStreamTimeout = envDurationSeconds("WEKNORA_LLM_STREAM_TIMEOUT_SECONDS", 600*time.Second)
)

// envDurationSeconds 读取以"秒"为单位的环境变量，解析失败或非正值时回退到 fallback。
func envDurationSeconds(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return time.Duration(n) * time.Second
}

// withLLMTimeout 使用调用方 deadline 与单次请求兜底中的较短值。
func withLLMTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) <= d {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, d)
}

// rawHTTPClient is a shared HTTP client for raw HTTP LLM calls with connection-level timeouts.
// Per-request timeout is enforced via context deadline (see defaultChatTimeout / defaultStreamTimeout)
// rather than http.Client.Timeout, so streaming calls are not prematurely terminated.
// Uses SSRFSafeDialContext to prevent DNS rebinding attacks at the connection layer.
var rawHTTPTransport = &http.Transport{
	Proxy:               http.ProxyFromEnvironment,
	DialContext:         secutils.SSRFSafeDialContext,
	TLSHandshakeTimeout: 10 * time.Second,
	IdleConnTimeout:     90 * time.Second,
	MaxIdleConnsPerHost: 5,
}

var rawHTTPClient = secutils.NewSSRFSafeHTTPClientWithTransport(
	secutils.SSRFSafeHTTPClientConfig{Timeout: 0, MaxRedirects: 10},
	rawHTTPTransport,
)
