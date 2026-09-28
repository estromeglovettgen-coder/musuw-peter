package session

import (
	"context"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/event"
	"github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type errorCaptureStreamManager struct {
	events []interfaces.StreamEvent
}

func (s *errorCaptureStreamManager) AppendEvent(_ context.Context, _, _ string, evt interfaces.StreamEvent) error {
	s.events = append(s.events, evt)
	return nil
}

func (s *errorCaptureStreamManager) GetEvents(context.Context, string, string, int) ([]interfaces.StreamEvent, int, error) {
	return nil, 0, nil
}

func TestAgentStreamErrorCarriesStableBillingCode(t *testing.T) {
	manager := &errorCaptureStreamManager{}
	h := NewAgentStreamHandler(context.Background(), "session", "assistant", "request", 1, time.Now(), nil, manager, event.NewEventBus(), nil)

	err := h.handleError(context.Background(), event.Event{
		ID:        "error-event",
		Type:      event.EventError,
		SessionID: "session",
		Data: event.ErrorData{
			Error:     "billing confirmation pending",
			ErrorCode: openrouter.AllowanceRenewalPendingCode,
			Stage:     "agent_execution",
			SessionID: "session",
		},
	})
	require.NoError(t, err)
	require.Len(t, manager.events, 1)
	require.Equal(t, openrouter.AllowanceRenewalPendingCode, manager.events[0].Data["error_code"])
	require.Equal(t, "agent_execution", manager.events[0].Data["stage"])
}
