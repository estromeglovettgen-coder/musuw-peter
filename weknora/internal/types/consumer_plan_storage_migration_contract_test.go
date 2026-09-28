package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	consumerPlanFreeStorageBytes = "1073741824"
	consumerPlanPlusStorageBytes = "10737418240"
	consumerPlanProStorageBytes  = "32212254720"
	consumerPlanMaxStorageBytes  = "107374182400"
)

func readMigrationContract(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migration %s: %v", path, err)
	}
	return strings.ToLower(string(raw))
}

func assertConsumerPlanStorageSafeRemap(t *testing.T, sql, path string, down bool) {
	t.Helper()
	if got := strings.Count(sql, "update tenants"); got != 4 {
		t.Errorf("%s must contain four bounded plan updates, got %d", path, got)
	}
	currentDefaults := []string{"5368709120", "21474836480", "42949672960", "85899345920"}
	revisedDefaults := []string{consumerPlanFreeStorageBytes, consumerPlanPlusStorageBytes, consumerPlanProStorageBytes, consumerPlanMaxStorageBytes}
	if down {
		currentDefaults, revisedDefaults = revisedDefaults, currentDefaults
	}
	for index, plan := range []string{"free", "plus", "pro", "max"} {
		for _, want := range []string{
			"plan = '" + plan + "'",
			"set storage_quota = " + revisedDefaults[index],
			"and storage_quota = " + currentDefaults[index],
		} {
			if !strings.Contains(sql, want) {
				t.Errorf("%s must contain bounded mapping %q", path, want)
			}
		}
	}
	for _, want := range []string{"where deleted_at is null"} {
		if !strings.Contains(sql, want) {
			t.Errorf("%s must contain %q", path, want)
		}
	}
	for _, forbidden := range []string{
		"delete from",
		"truncate",
		"drop table",
		"set storage_quota = case",
		"storage_used =",
		"open_router_used_microusd =",
	} {
		if strings.Contains(sql, forbidden) {
			t.Errorf("%s must not contain destructive/usage mutation %q", path, forbidden)
		}
	}
}

func TestConsumerPlanStorageQuotaMigrationsHavePairedBackfillAndRollback(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	cases := []struct {
		name        string
		upPath      string
		downPath    string
		defaultUp   string
		defaultDown string
	}{
		{
			name:        "postgres",
			upPath:      filepath.Join(root, "versioned", "000089_consumer_storage_quotas.up.sql"),
			downPath:    filepath.Join(root, "versioned", "000089_consumer_storage_quotas.down.sql"),
			defaultUp:   "alter column storage_quota set default " + consumerPlanFreeStorageBytes,
			defaultDown: "alter column storage_quota set default 5368709120",
		},
		{
			name:     "sqlite",
			upPath:   filepath.Join(root, "sqlite", "000008_consumer_plan_storage_quota.up.sql"),
			downPath: filepath.Join(root, "sqlite", "000008_consumer_plan_storage_quota.down.sql"),
			// SQLite cannot alter an existing column default without rebuilding
			// the table. The fresh flattened schema is asserted below; this
			// incremental migration only backfills existing rows.
			defaultUp:   "",
			defaultDown: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			up := readMigrationContract(t, tc.upPath)
			down := readMigrationContract(t, tc.downPath)
			assertConsumerPlanStorageSafeRemap(t, up, tc.upPath, false)
			assertConsumerPlanStorageSafeRemap(t, down, tc.downPath, true)
			if tc.defaultUp != "" && !strings.Contains(up, tc.defaultUp) {
				t.Errorf("%s must set the fresh storage default to 1 GiB", tc.upPath)
			}
			if tc.defaultDown != "" && !strings.Contains(down, tc.defaultDown) {
				t.Errorf("%s must restore the previous storage default", tc.downPath)
			}
		})
	}
}

func TestConsumerPlanStorageQuotaFreshSchemasDefaultToOneGiB(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	for _, path := range []string{
		filepath.Join(root, "versioned", "000000_init.up.sql"),
		filepath.Join(root, "sqlite", "000000_init.up.sql"),
		filepath.Join(root, "paradedb", "00-init-db.sql"),
		filepath.Join(root, "mysql", "00-init-db.sql"),
	} {
		sql := readMigrationContract(t, path)
		if !strings.Contains(sql, "storage_quota bigint not null default "+consumerPlanFreeStorageBytes) {
			t.Errorf("%s must default storage_quota to 1 GiB", path)
		}
	}
}
