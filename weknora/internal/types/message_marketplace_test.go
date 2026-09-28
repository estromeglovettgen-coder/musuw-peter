package types

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMessageMarketplaceProjectionSurvivesStorageWithoutExposingExecutionContext(t *testing.T) {
	original := MessageExecutionContext{
		MarketplaceProductID: "paid-product",
		KnowledgeBaseIDs:     []string{"private-source"},
		AgentConfigHash:      "private-hash",
	}
	saved, err := original.Value()
	require.NoError(t, err)
	var restored MessageExecutionContext
	require.NoError(t, restored.Scan(saved))
	raw, err := json.Marshal(Message{ID: "assistant-message", Content: "Answer", ExecutionContext: restored})
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(raw, &fields))
	require.Equal(t, "paid-product", fields["marketplace_product_id"])
	require.Equal(t, "Answer", fields["content"])
	require.NotContains(t, fields, "execution_context")
	require.NotContains(t, string(raw), "private-source")
	require.NotContains(t, string(raw), "private-hash")
	raw, err = json.Marshal(Message{ID: "ordinary-message"})
	require.NoError(t, err)
	require.NotContains(t, string(raw), "marketplace_product_id")
}
