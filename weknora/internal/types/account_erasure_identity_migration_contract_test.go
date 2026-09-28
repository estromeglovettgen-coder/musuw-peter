package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAccountErasureIdentityMigrationsStayPaired(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	cases := []struct {
		name string
		up   string
		down string
	}{
		{
			name: "postgres",
			up:   filepath.Join(root, "versioned", "000090_account_erasure_identity.up.sql"),
			down: filepath.Join(root, "versioned", "000090_account_erasure_identity.down.sql"),
		},
		{
			name: "sqlite",
			up:   filepath.Join(root, "sqlite", "000009_account_erasure_identity.up.sql"),
			down: filepath.Join(root, "sqlite", "000009_account_erasure_identity.down.sql"),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			upBytes, err := os.ReadFile(tc.up)
			if err != nil {
				t.Fatalf("read up migration: %v", err)
			}
			downBytes, err := os.ReadFile(tc.down)
			if err != nil {
				t.Fatalf("read down migration: %v", err)
			}
			up := strings.ToLower(string(upBytes))
			down := strings.ToLower(string(downBytes))

			for _, column := range []string{"identity_provider", "identity_subject", "deletion_requested_at"} {
				if !strings.Contains(up, "add column") || !strings.Contains(up, column) {
					t.Errorf("up migration must add %s", column)
				}
				if !strings.Contains(down, "drop column") || !strings.Contains(down, column) {
					t.Errorf("down migration must drop %s", column)
				}
			}
			for _, index := range []string{"idx_users_deletion_requested_at", "idx_users_identity_provider_subject"} {
				if !strings.Contains(up, index) || !strings.Contains(down, index) {
					t.Errorf("migration pair must create and drop %s", index)
				}
			}
			for _, forbidden := range []string{"drop table users", "delete from users", "truncate users"} {
				if strings.Contains(up, forbidden) {
					t.Errorf("up migration must not contain destructive statement %q", forbidden)
				}
			}
		})
	}
}
