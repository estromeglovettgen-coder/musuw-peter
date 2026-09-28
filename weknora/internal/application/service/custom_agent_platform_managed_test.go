package service

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
)

func TestAnswerModesArePlatformManaged(t *testing.T) {
	assert.True(t, isPlatformManagedBuiltinAgentID(types.BuiltinQuickAnswerID))
	assert.True(t, isPlatformManagedBuiltinAgentID(types.BuiltinSmartReasoningID))
	assert.False(t, isPlatformManagedBuiltinAgentID("custom-agent"))
}
