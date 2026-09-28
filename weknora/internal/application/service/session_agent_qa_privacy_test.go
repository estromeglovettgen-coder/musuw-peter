package service

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

// AgentQA is fed user-authored queries and a session containing private
// history/attachment metadata. Keep its startup log bounded to identifiers and
// query length so a normal INFO sink cannot become a transcript export.
func TestAgentQAStartupLogDoesNotSerializeQueryOrSession(t *testing.T) {
	_, current, _, ok := runtime.Caller(0)
	require.True(t, ok)
	source, err := os.ReadFile(filepath.Join(filepath.Dir(current), "session_agent_qa.go"))
	require.NoError(t, err)
	text := string(source)

	require.Contains(t, text, "query_len: %d")
	require.NotContains(t, text, "query: %s,")
	require.NotContains(t, text, "query: %s, session: %s")
	require.NotContains(t, text, "json.Marshal(req.Session)")
}
