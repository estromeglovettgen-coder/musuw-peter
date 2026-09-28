package tools

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Tool arguments routinely contain credentials, file contents, and private
// prompts. The registry telemetry contract is bounded metadata only: tool name
// plus argument byte length. Keep this source-level guard close to the logging
// call so a future observability change cannot accidentally serialize args.
func TestExecuteToolTelemetryDoesNotSerializeArguments(t *testing.T) {
	_, current, _, ok := runtime.Caller(0)
	require.True(t, ok)
	source, err := os.ReadFile(filepath.Join(filepath.Dir(current), "registry.go"))
	require.NoError(t, err)
	text := string(source)
	for _, forbidden := range []string{
		`"args":       args`,
		`"args": args`,
		`"arguments":  args`,
		`string(args)`,
		`json.Marshal(args)`,
	} {
		require.NotContains(t, text, forbidden)
	}
	start := strings.Index(text, `"execute_start"`)
	require.NotEqual(t, -1, start)
	end := strings.Index(text[start:], "})")
	require.NotEqual(t, -1, end)
	window := text[start : start+end]
	require.Contains(t, window, `"args_bytes"`)
}
