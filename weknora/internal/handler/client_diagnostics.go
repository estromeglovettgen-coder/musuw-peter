package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/ratelimit"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const clientDiagnosticBodyLimit = 1024

var clientDiagnosticRequestID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

var clientDiagnosticPhases = map[string]bool{
	"auth.session": true, "auth.exchange": true, "auth.authorize": true,
	"auth.password": true, "auth.otp_send": true, "auth.otp_verify": true,
	"auth.native_session": true, "auth.oidc_start": true, "auth.other": true,
	"app.startup": true, "api.auth": true, "api.documents": true, "api.other": true,
}

var clientDiagnosticOutcomes = map[string]bool{
	"ok": true, "network": true, "timeout": true, "http": true, "identity": true, "error": true,
}

type clientDiagnostic struct {
	Phase      string `json:"phase"`
	Outcome    string `json:"outcome"`
	DurationMS *int   `json:"duration_ms"`
	FlowID     string `json:"flow_id"`
	RequestID  string `json:"request_id"`
	Status     int    `json:"status"`
}

// NewClientDiagnosticsHandler accepts untrusted browser timing hints, never
// authentication authority. One local bucket bounds memory and total log volume;
// diagnostics cannot consume any authentication or business rate-limit budget.
func NewClientDiagnosticsHandler() gin.HandlerFunc {
	limiter := ratelimit.New(nil, "client-diagnostics:", time.Minute, "")
	return func(c *gin.Context) {
		if !limiter.Allow(c.Request.Context(), "global", 600) {
			c.Status(http.StatusTooManyRequests)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, clientDiagnosticBodyLimit))
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				c.Status(http.StatusRequestEntityTooLarge)
			} else {
				c.Status(http.StatusBadRequest)
			}
			return
		}
		var event clientDiagnostic
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&event) != nil || decoder.Decode(new(any)) != io.EOF {
			c.Status(http.StatusBadRequest)
			return
		}
		// encoding/json matches struct fields case-insensitively and permits null.
		// Reject both so the public payload really has only these exact typed fields.
		var fields map[string]json.RawMessage
		if json.Unmarshal(body, &fields) != nil || fields == nil {
			c.Status(http.StatusBadRequest)
			return
		}
		for key, value := range fields {
			switch key {
			case "phase", "outcome", "duration_ms", "flow_id", "request_id", "status":
			default:
				c.Status(http.StatusBadRequest)
				return
			}
			if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				c.Status(http.StatusBadRequest)
				return
			}
		}
		flowID, err := uuid.Parse(event.FlowID)
		if !clientDiagnosticPhases[event.Phase] || !clientDiagnosticOutcomes[event.Outcome] ||
			event.DurationMS == nil || *event.DurationMS < 0 || *event.DurationMS > 120000 ||
			err != nil || flowID.Version() != 4 || flowID.Variant() != uuid.RFC4122 ||
			flowID.String() != event.FlowID ||
			(event.Status != 0 && (event.Status < 100 || event.Status > 599)) {
			c.Status(http.StatusBadRequest)
			return
		}
		if _, present := fields["request_id"]; present && !clientDiagnosticRequestID.MatchString(event.RequestID) {
			c.Status(http.StatusBadRequest)
			return
		}
		bounded := map[string]interface{}{
			"phase": event.Phase, "outcome": event.Outcome, "duration_ms": *event.DurationMS,
			"flow_id": event.FlowID, "status": event.Status,
		}
		if event.RequestID != "" {
			bounded["request_id"] = event.RequestID
		}
		// Do not inherit arbitrary request headers, IPs, user context, or URLs.
		logger.GetLogger(context.Background()).WithFields(bounded).Info("client_diagnostic")
		c.Status(http.StatusNoContent)
	}
}
