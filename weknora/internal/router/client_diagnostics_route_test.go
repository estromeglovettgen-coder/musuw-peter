// Package router wires the application HTTP routes.
package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/handler"
)

func TestClientDiagnosticsIsReachableBeforeAuthentication(t *testing.T) {
	oldEdition := handler.Edition
	handler.Edition = "lite"
	t.Cleanup(func() { handler.Edition = oldEdition })
	r := NewRouter(RouterParams{SystemHandler: &handler.SystemHandler{}})
	body := `{"phase":"app.startup","outcome":"ok","duration_ms":0,` +
		`"flow_id":"84f4edc5-d014-40ad-b086-546a9891a21b"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/client-diagnostics", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("diagnostics without a session returned %d: %s", w.Code, w.Body.String())
	}
	for _, route := range r.Routes() {
		if route.Path == "/api/v1/client-diagnostics" && route.Method != http.MethodPost {
			t.Fatalf("unexpected public diagnostics method %s", route.Method)
		}
	}
}
