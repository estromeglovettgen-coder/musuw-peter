package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListSkillsAcceptsOptionalSandboxConfigID(t *testing.T) {
	var queries []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/v1/skills" {
			t.Errorf("request = %s %s, want GET /api/v1/skills", r.Method, r.URL.Path)
		}
		queries = append(queries, r.URL.Query().Get("sandbox_config_id"))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":          true,
			"data":             []SkillInfo{{Name: "preloaded", Description: "legacy"}},
			"skills_available": true,
		})
	}))
	defer server.Close()

	c := NewClient(server.URL)
	if _, available, err := c.ListSkills(context.Background()); err != nil || !available {
		t.Fatalf("ListSkills() = available:%v error:%v", available, err)
	}
	if _, available, err := c.ListSkills(context.Background(), "cfg-1"); err != nil || !available {
		t.Fatalf("ListSkills(cfg-1) = available:%v error:%v", available, err)
	}

	if len(queries) != 2 || queries[0] != "" || queries[1] != "cfg-1" {
		t.Fatalf("sandbox_config_id queries = %#v, want [\"\", \"cfg-1\"]", queries)
	}
}
