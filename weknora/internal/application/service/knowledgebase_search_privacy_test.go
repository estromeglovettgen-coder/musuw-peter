package service

import (
	"os"
	"strings"
	"testing"
)

func TestHybridSearchObservabilityDoesNotPersistQueryText(t *testing.T) {
	source, err := os.ReadFile("knowledgebase_search.go")
	if err != nil {
		t.Fatalf("read knowledgebase_search.go: %v", err)
	}
	text := string(source)
	if !strings.Contains(text, `"query_len"`) {
		t.Fatal("hybrid search observability must retain query length metadata")
	}
	if strings.Contains(text, `"query_text":             params.QueryText`) ||
		strings.Contains(text, `"query_text":         params.QueryText`) {
		t.Fatal("hybrid search logs/spans must not persist raw query text")
	}
}
