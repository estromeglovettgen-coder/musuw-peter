package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveRequestThinkingPreservesExplicitOverride(t *testing.T) {
	disabled := false
	enabled := true

	got := resolveRequestThinking(&disabled, &enabled)
	require.NotNil(t, got)
	assert.False(t, *got)

	got = resolveRequestThinking(nil, &enabled)
	require.NotNil(t, got)
	assert.True(t, *got)
}
