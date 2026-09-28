package handler

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRuntimeCommitIDPrefersValidatedProductionRevision(t *testing.T) {
	original := CommitID
	CommitID = "compiled-revision"
	t.Cleanup(func() { CommitID = original })

	const revision = "0123456789abcdef0123456789abcdef01234567"
	t.Setenv("WEKNORA_PRODUCTION_REVISION", revision)

	require.Equal(t, revision, runtimeCommitID())
}

func TestRuntimeCommitIDFallsBackToCompiledRevision(t *testing.T) {
	original := CommitID
	CommitID = "compiled-revision"
	t.Cleanup(func() { CommitID = original })

	for _, value := range []string{
		"",
		"short",
		"0123456789abcdef0123456789abcdef0123456g",
		"0123456789ABCDEF0123456789ABCDEF01234567",
	} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("WEKNORA_PRODUCTION_REVISION", value)
			require.Equal(t, "compiled-revision", runtimeCommitID())
		})
	}
}
