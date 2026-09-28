package agent

import (
	"os"
	"strings"
	"testing"
)

// Agent traces are shipped to an external observability backend. Keep the
// user query and generated answer out of span payloads; only bounded metadata
// such as lengths and counters is safe to persist there.
func TestAgentSpanPayloadUsesLengthsNotUserText(t *testing.T) {
	source, err := os.ReadFile("engine.go")
	if err != nil {
		t.Fatalf("read engine.go: %v", err)
	}
	text := string(source)
	if !strings.Contains(text, `"query_len":`) {
		t.Fatal("agent execute span must retain query length metadata")
	}
	if strings.Contains(text, `"query":        truncateRunes`) {
		t.Fatal("agent execute span must not persist raw query text")
	}
	if strings.Contains(text, `"final_answer":     truncateRunes`) {
		t.Fatal("agent span output must not persist raw final answer text")
	}
}
