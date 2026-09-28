package session

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestApplyFinalAnswerUsagePersistsTypedUsage(t *testing.T) {
	message := &types.Message{}
	usage := &types.TokenUsage{PromptTokens: 8, CompletionTokens: 2, TotalTokens: 10}

	applyFinalAnswerUsage(message, usage)

	require.Same(t, usage, message.Usage)
}

func TestApplyFinalAnswerUsageIgnoresUntypedUsage(t *testing.T) {
	message := &types.Message{}

	applyFinalAnswerUsage(message, map[string]int{"total_tokens": 10})

	require.Nil(t, message.Usage)
}
