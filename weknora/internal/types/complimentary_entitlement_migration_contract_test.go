package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestComplimentaryEntitlementMigrationsArePairedAndDoNotRewriteBillingState(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	for name, paths := range map[string][2]string{
		"postgres": {
			filepath.Join(root, "versioned", "000093_complimentary_entitlements.up.sql"),
			filepath.Join(root, "versioned", "000093_complimentary_entitlements.down.sql"),
		},
		"sqlite": {
			filepath.Join(root, "sqlite", "000012_complimentary_entitlements.up.sql"),
			filepath.Join(root, "sqlite", "000012_complimentary_entitlements.down.sql"),
		},
	} {
		t.Run(name, func(t *testing.T) {
			upRaw, err := os.ReadFile(paths[0])
			if err != nil {
				t.Fatalf("read up migration: %v", err)
			}
			downRaw, err := os.ReadFile(paths[1])
			if err != nil {
				t.Fatalf("read down migration: %v", err)
			}
			up, down := strings.ToLower(string(upRaw)), strings.ToLower(string(downRaw))
			for _, column := range []string{"complimentary_plan", "complimentary_expires_at", "complimentary_grant_id"} {
				if !strings.Contains(up, "add column") || !strings.Contains(up, column) {
					t.Errorf("up migration must add %s", column)
				}
				if !strings.Contains(down, "drop column") || !strings.Contains(down, column) {
					t.Errorf("down migration must drop %s", column)
				}
			}
			for _, forbidden := range []string{
				"update tenants", "plan_status =", "paddle_customer_id =", "paddle_subscription_id =", "delete from", "truncate",
			} {
				if strings.Contains(up, forbidden) {
					t.Errorf("up migration must not mutate billing/data state with %q", forbidden)
				}
			}
		})
	}
}
