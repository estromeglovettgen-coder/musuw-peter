package chat

import (
	"io"
	"strings"
	"testing"

	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/stretchr/testify/require"
)

func TestSSEReaderSurfacesProviderErrorEnvelope(t *testing.T) {
	reader := NewSSEReader(strings.NewReader(
		"data: {\"id\":\"ok\",\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n" +
			"data: {\"error\":{\"code\":402,\"message\":\"Insufficient credits\"}}\n\n" +
			"data: [DONE]\n\n",
	))

	event, err := reader.ReadEvent()
	require.NoError(t, err)
	require.Contains(t, string(event.Data), "partial")

	event, err = reader.ReadEvent()
	require.Error(t, err)
	require.Nil(t, event)
	require.False(t, modelopenrouter.IsCreditExhausted(err), "raw SSE parsing must not claim every compatible provider is OpenRouter")
	require.True(t, modelopenrouter.PayloadIndicatesCreditExhausted([]byte(err.Error())))
}

func TestSSEReaderKeepsOrdinaryChunksAndDoneMarker(t *testing.T) {
	reader := NewSSEReader(strings.NewReader(
		"event: message\n" +
			"data:{\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n" +
			"data: [DONE]\n\n",
	))

	event, err := reader.ReadEvent()
	require.NoError(t, err)
	require.Contains(t, string(event.Data), "hello")

	event, err = reader.ReadEvent()
	require.NoError(t, err)
	require.True(t, event.Done)

	_, err = reader.ReadEvent()
	require.ErrorIs(t, err, io.EOF)
}
