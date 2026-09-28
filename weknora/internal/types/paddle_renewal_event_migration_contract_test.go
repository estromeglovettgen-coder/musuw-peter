package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPaddleRenewalEventMigrationsStayPaired(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	for name, paths := range map[string][2]string{
		"postgres": {filepath.Join(root, "versioned", "000091_paddle_renewal_event_at.up.sql"), filepath.Join(root, "versioned", "000091_paddle_renewal_event_at.down.sql")},
		"sqlite":   {filepath.Join(root, "sqlite", "000010_paddle_renewal_event_at.up.sql"), filepath.Join(root, "sqlite", "000010_paddle_renewal_event_at.down.sql")},
	} {
		t.Run(name, func(t *testing.T) {
			up, err := os.ReadFile(paths[0])
			if err != nil {
				t.Fatalf("read up migration: %v", err)
			}
			down, err := os.ReadFile(paths[1])
			if err != nil {
				t.Fatalf("read down migration: %v", err)
			}
			if !strings.Contains(strings.ToLower(string(up)), "add column") || !strings.Contains(string(up), "paddle_last_renewal_at") || !strings.Contains(string(up), "open_router_desired_limit_microusd") {
				t.Fatal("up migration must add renewal cursor and OpenRouter desired limit")
			}
			if !strings.Contains(strings.ToLower(string(down)), "drop column") || !strings.Contains(string(down), "paddle_last_renewal_at") || !strings.Contains(string(down), "open_router_desired_limit_microusd") {
				t.Fatal("down migration must drop renewal cursor and OpenRouter desired limit")
			}
		})
	}
}
