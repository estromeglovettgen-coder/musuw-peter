package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

const validClientDiagnostic = `{"phase":"auth.otp_verify","outcome":"timeout","duration_ms":12000,` +
	`"flow_id":"d3815104-c538-4a5f-9246-322140b46513","request_id":"req_safe-1","status":0}`

func diagnosticTestRouter() *gin.Engine {
	r := gin.New()
	r.Use(middleware.RequestID(), middleware.Logger())
	r.POST("/api/v1/client-diagnostics", NewClientDiagnosticsHandler())
	return r
}

func postDiagnostic(r *gin.Engine, body, query string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-diagnostics"+query, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Request-ID", "secret-token-user@example.test")
	req.Header.Set("Authorization", "Bearer never-log-this-token")
	req.Header.Set("Cookie", "email=user@example.test")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func diagnosticLogs(t *testing.T, out io.Writer) {
	t.Helper()
	instance := logger.GetLogger(context.Background()).Logger
	previous := instance.Out
	formatter := instance.Formatter
	instance.SetFormatter(&logrus.TextFormatter{DisableTimestamp: true, DisableColors: true})
	t.Cleanup(func() { instance.SetFormatter(formatter) })
	logger.SetOutput(out)
	t.Cleanup(func() { logger.SetOutput(previous) })
}

func TestClientDiagnosticsAcceptsOnlyBoundedFieldsAndLogsNoRequestData(t *testing.T) {
	var logs bytes.Buffer
	diagnosticLogs(t, &logs)
	r := diagnosticTestRouter()
	w := postDiagnostic(
		r, validClientDiagnostic, "?email=private@example.test&token=query-secret&content=private-document",
	)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	got := logs.String()
	for _, want := range []string{
		"client_diagnostic", "phase=auth.otp_verify", "duration_ms=12000",
		"flow_id=d3815104-c538-4a5f-9246-322140b46513", "outcome=timeout", "request_id=req_safe-1",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %s", want, got)
		}
	}
	for _, secret := range []string{
		"@", "never-log", "query-secret", "private-document", "secret-token",
		"client_ip", "request_body", "response_body", "path=",
	} {
		if strings.Contains(got, secret) {
			t.Errorf("private request data %q in %s", secret, got)
		}
	}
	if strings.Count(got, "client_diagnostic") != 1 {
		t.Fatalf("unexpected unbounded access-log entry: %s", got)
	}
}

func TestClientDiagnosticsRejectsMalformedOrPrivatePayloadsWithoutLogging(t *testing.T) {
	var logs bytes.Buffer
	diagnosticLogs(t, &logs)
	var original map[string]any
	if err := json.Unmarshal([]byte(validClientDiagnostic), &original); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"unknown field":    strings.TrimSuffix(validClientDiagnostic, "}") + `,"email":"user@example.test"}`,
		"trailing object":  validClientDiagnostic + ` {"token":"secret"}`,
		"trailing garbage": validClientDiagnostic + ` private-content`,
		"oversized":        validClientDiagnostic + strings.Repeat(" ", 1024),
		"array":            "[" + validClientDiagnostic + "]",
		"null":             "null",
	}
	changes := map[string]any{
		"phase": "auth.password-user@example.test", "outcome": "arbitrary-secret", "duration_ms": 120001,
		"flow_id": "oidc-state-secret", "request_id": "secret@email.test", "status": 600,
	}
	for field, value := range changes {
		changed := make(map[string]any)
		for k, v := range original {
			changed[k] = v
		}
		changed[field] = value
		body, _ := json.Marshal(changed)
		cases["invalid "+field] = string(body)
	}
	for name, body := range map[string]string{
		"negative duration":   strings.Replace(validClientDiagnostic, "12000", "-1", 1),
		"fractional duration": strings.Replace(validClientDiagnostic, "12000", "1.5", 1),
		"wrong field case":    strings.Replace(validClientDiagnostic, `"phase"`, `"Phase"`, 1),
		"long request id":     strings.Replace(validClientDiagnostic, "req_safe-1", strings.Repeat("a", 65), 1),
		"nonrandom uuid": strings.Replace(
			validClientDiagnostic, "d3815104-c538-4a5f-9246-322140b46513", "00000000-0000-0000-0000-000000000000", 1,
		),
		"missing duration": strings.Replace(validClientDiagnostic, `"duration_ms":12000,`, "", 1),
		"null status":      strings.Replace(validClientDiagnostic, `"status":0`, `"status":null`, 1),
	} {
		cases[name] = body
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			logs.Reset()
			w := postDiagnostic(diagnosticTestRouter(), body, "?email=private@example.test")
			if w.Code < 400 || w.Code >= 500 {
				t.Errorf("status=%d body=%s", w.Code, w.Body.String())
			}
			if logs.Len() != 0 {
				t.Errorf("rejected body/query reached logs: %s", logs.String())
			}
		})
	}
}

func TestClientDiagnosticsUsesOneGlobalBudgetAcrossClientIdentifiers(t *testing.T) {
	diagnosticLogs(t, io.Discard)
	r := diagnosticTestRouter()
	for i := 0; i < 600; i++ {
		if w := postDiagnostic(r, validClientDiagnostic, ""); w.Code != http.StatusNoContent {
			t.Fatalf("request %d status %d", i, w.Code)
		}
	}
	body := strings.Replace(
		validClientDiagnostic, "d3815104-c538-4a5f-9246-322140b46513", "84f4edc5-d014-40ad-b086-546a9891a21b", 1,
	)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-diagnostics", strings.NewReader(body))
	req.RemoteAddr = "203.0.113.199:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.200")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("new flow/IP bypassed global limit: %d", w.Code)
	}
}

func TestClientDiagnosticsDoesNotReadUnboundedBodyBeforeLimit(t *testing.T) {
	diagnosticLogs(t, io.Discard)
	r := diagnosticTestRouter()
	reader := &countingDiagnosticBody{left: 1 << 20}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-diagnostics?content=private", reader)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status=%d", w.Code)
	}
	if reader.read > 1025 {
		t.Errorf("middleware/handler read %d bytes before rejecting oversized body", reader.read)
	}
}

type countingDiagnosticBody struct{ left, read int }

func (r *countingDiagnosticBody) Read(p []byte) (int, error) {
	if r.left == 0 {
		return 0, io.EOF
	}
	n := len(p)
	if n > r.left {
		n = r.left
	}
	for i := 0; i < n; i++ {
		p[i] = ' '
	}
	r.left -= n
	r.read += n
	return n, nil
}

func TestClientDiagnosticsAcceptsContractEnumsAndBoundaryValues(t *testing.T) {
	diagnosticLogs(t, io.Discard)
	r := diagnosticTestRouter()
	for _, phase := range []string{
		"auth.session", "auth.exchange", "auth.authorize", "auth.password", "auth.otp_send", "auth.otp_verify",
		"auth.native_session", "auth.oidc_start", "auth.other", "app.startup", "api.auth", "api.documents", "api.other",
	} {
		for _, outcome := range []string{"ok", "network", "timeout", "http", "identity", "error"} {
			body, _ := json.Marshal(map[string]any{
				"phase": phase, "outcome": outcome, "duration_ms": 0,
				"flow_id": "84f4edc5-d014-40ad-b086-546a9891a21b",
			})
			if w := postDiagnostic(r, string(body), ""); w.Code != http.StatusNoContent {
				t.Fatalf("phase=%s outcome=%s status=%d", phase, outcome, w.Code)
			}
		}
	}
	for _, status := range []int{0, 100, 599} {
		body, _ := json.Marshal(map[string]any{
			"phase": "app.startup", "outcome": "error", "duration_ms": 120000,
			"flow_id": "84f4edc5-d014-40ad-b086-546a9891a21b", "status": status, "request_id": strings.Repeat("a", 64),
		})
		if w := postDiagnostic(r, string(body), ""); w.Code != http.StatusNoContent {
			t.Fatalf("boundary status=%d response=%d", status, w.Code)
		}
	}
}

func TestClientDiagnosticsGlobalBudgetHoldsUnderConcurrentRequests(t *testing.T) {
	diagnosticLogs(t, io.Discard)
	r := diagnosticTestRouter()
	var wg sync.WaitGroup
	var accepted, rejected, unexpected atomic.Int32
	for worker := 0; worker < 16; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 40; i++ {
				switch postDiagnostic(r, validClientDiagnostic, "").Code {
				case http.StatusNoContent:
					accepted.Add(1)
				case http.StatusTooManyRequests:
					rejected.Add(1)
				default:
					unexpected.Add(1)
				}
			}
		}()
	}
	wg.Wait()
	if accepted.Load() != 600 || rejected.Load() != 40 || unexpected.Load() != 0 {
		t.Fatalf(
			"concurrent counts accepted=%d rejected=%d unexpected=%d",
			accepted.Load(), rejected.Load(), unexpected.Load(),
		)
	}
}
