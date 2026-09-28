package chatpipeline

import (
	"encoding/json"
	"testing"
)

func TestDataAnalysisPlannerDisablesThinking(t *testing.T) {
	format := json.RawMessage(`{"type":"object"}`)
	opts := dataAnalysisChatOptions(format)
	if opts.Thinking == nil || *opts.Thinking {
		t.Fatalf("data analysis thinking = %#v, want explicit false", opts.Thinking)
	}
	if string(opts.Format) != string(format) {
		t.Fatalf("format = %s, want %s", opts.Format, format)
	}
}
