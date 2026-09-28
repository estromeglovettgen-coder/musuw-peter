package chat

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// SSEEvent 表示一个 Server-Sent Events 事件
type SSEEvent struct {
	Data []byte
	Done bool
}

// SSEReader 用于读取 SSE 流
type SSEReader struct {
	scanner *bufio.Scanner
}

// NewSSEReader 创建 SSE 读取器
func NewSSEReader(reader io.Reader) *SSEReader {
	scanner := bufio.NewScanner(reader)
	// 设置更大的缓冲区以处理长行（思维链内容可能很长）
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 1024*1024)
	return &SSEReader{scanner: scanner}
}

// ReadEvent 读取下一个 SSE 事件
func (r *SSEReader) ReadEvent() (*SSEEvent, error) {
	for r.scanner.Scan() {
		line := r.scanner.Text()

		// 空行，跳过
		if line == "" {
			continue
		}

		// 检查是否为结束标记
		if line == "data: [DONE]" {
			return &SSEEvent{Done: true}, nil
		}

		// 解析 data 行
		if strings.HasPrefix(line, "data: ") {
			jsonStr := line[6:]
			if err := rawSSEProviderError(jsonStr); err != nil {
				return nil, err
			}
			return &SSEEvent{Data: []byte(jsonStr)}, nil
		}

		// 增强兼容性(data:后面没有紧接着一个空格)
		if strings.HasPrefix(line, "data:") {
			jsonStr := line[5:]
			if err := rawSSEProviderError(jsonStr); err != nil {
				return nil, err
			}
			return &SSEEvent{Data: []byte(jsonStr)}, nil
		}

		// 其他行（如 event:, id: 等）跳过
	}

	if err := r.scanner.Err(); err != nil {
		return nil, err
	}

	return nil, io.EOF
}

// rawSSEProviderError mirrors the go-openai SDK's streamReader behavior for
// the raw-HTTP path used by providers/models that need custom request bodies.
// OpenAI-compatible APIs can begin with HTTP 200 and later emit
// `data: {"error": ...}`. Treating that object as an ordinary completion chunk
// would silently discard it because it has no choices; surfacing it as an
// error lets the caller emit ResponseTypeError and preserves credit-budget
// semantics in the upper chat pipeline.
func rawSSEProviderError(payload string) error {
	trimmed := strings.TrimSpace(payload)
	if trimmed == "" || trimmed == "[DONE]" || trimmed[0] != '{' {
		return nil
	}
	var envelope struct {
		Error json.RawMessage `json:"error"`
	}
	if err := json.Unmarshal([]byte(trimmed), &envelope); err != nil {
		return nil
	}
	if len(envelope.Error) == 0 || string(envelope.Error) == "null" {
		return nil
	}
	// Keep the compact provider payload in the internal stream error so the
	// credit classifier can recognize code/message markers. The public chat
	// pipeline replaces credit failures with a fixed sanitized user message.
	return fmt.Errorf("provider stream error: %s", trimmed)
}
