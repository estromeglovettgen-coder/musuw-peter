package session

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type questionBillingProbe struct {
	err                  error
	begun                int
	settled              int
	messageID, sessionID string
	delivered            bool
	settleContextErr     error
}

func (p *questionBillingProbe) BeginQuestion(_ context.Context, messageID, sessionID string) (string, error) {
	p.begun++
	p.messageID, p.sessionID = messageID, sessionID
	if p.err != nil {
		return "", p.err
	}
	return "reservation", nil
}
func (p *questionBillingProbe) SettleQuestion(ctx context.Context, _ string, delivered bool) error {
	p.settled++
	p.delivered, p.settleContextErr = delivered, ctx.Err()
	return nil
}

type questionMessageService struct {
	interfaces.MessageService
	updated *types.Message
}

func (s *questionMessageService) CreateMessage(_ context.Context, m *types.Message) (*types.Message, error) {
	m.ID = "persisted-" + m.Role
	return m, nil
}
func (s *questionMessageService) UpdateMessage(_ context.Context, m *types.Message) error {
	s.updated = m
	return nil
}

type questionSessionService struct{ interfaces.SessionService }

func (s *questionSessionService) UpdateSessionLastRequestState(context.Context, string, *types.SessionLastRequestState) error {
	return nil
}

func TestFireQuestionExhaustionStopsBeforeQAOrTitleModelWork(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(writer)
	probe := &questionBillingProbe{err: firebilling.ErrUnavailable}
	messages := &questionMessageService{}
	h := &Handler{questionBilling: probe, messageService: messages, sessionService: &questionSessionService{}}
	// There are deliberately no model or stream services: exhaustion must
	// return before title generation, SSE setup or any QA provider call.
	h.executeQA(&qaRequestContext{ctx: context.Background(), c: c,
		sessionID: "session", assistantMessage: &types.Message{Role: "assistant"}}, qaModeNormal, true)
	require.Equal(t, http.StatusPaymentRequired, writer.Code)
	require.Contains(t, writer.Body.String(), "剩余额度不足")
	require.Equal(t, 1, probe.begun)
	require.Equal(t, "persisted-assistant", probe.messageID)
	require.Equal(t, "session", probe.sessionID)
	require.Zero(t, probe.settled)
	require.NotNil(t, messages.updated)
	require.True(t, messages.updated.IsCompleted)
	require.True(t, messages.updated.IsFallback)
	require.Contains(t, messages.updated.Content, "剩余额度不足")
}

func TestFireQuestionSettlementCountsOnlyDeliveredAnswerAndSurvivesStop(t *testing.T) {
	for _, row := range []struct {
		name, content       string
		fallback, delivered bool
	}{
		{"unanswered failure", "", false, false},
		{"thinking only", "  \n", false, false},
		{"fallback", "生成失败，请重试", true, false},
		{"completed answer", "有内容的回答", false, true},
		{"stopped partial answer", "这是已输出的部分", false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			probe := &questionBillingProbe{}
			h := &Handler{questionBilling: probe}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			h.settleQuestionAllowance(ctx, "reservation", &types.Message{Content: row.content, IsFallback: row.fallback})
			require.Equal(t, 1, probe.settled)
			require.Equal(t, row.delivered, probe.delivered)
			require.NoError(t, probe.settleContextErr)
		})
	}
}

func TestFireQuestionAllowanceDisabledOutsideFireDeployment(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "false")
	probe := &questionBillingProbe{err: firebilling.ErrUnavailable}
	h := &Handler{questionBilling: probe}
	id, allowed := h.reserveQuestionAllowance(&qaRequestContext{ctx: context.Background()})
	require.True(t, allowed)
	require.Empty(t, id)
	require.Zero(t, probe.begun)
	h.settleQuestionAllowance(context.Background(), "", &types.Message{Content: "normal answer"})
	require.Zero(t, probe.settled)
}
