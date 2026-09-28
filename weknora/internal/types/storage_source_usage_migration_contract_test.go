package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestStorageSourceUsageMigrationsStayPairedAndNonDestructive(t *testing.T) {
	root := filepath.Join("..", "..", "migrations")
	cases := map[string][2]string{
		"postgres": {
			filepath.Join(root, "versioned", "000092_storage_source_usage.up.sql"),
			filepath.Join(root, "versioned", "000092_storage_source_usage.down.sql"),
		},
		"sqlite": {
			filepath.Join(root, "sqlite", "000011_storage_source_usage.up.sql"),
			filepath.Join(root, "sqlite", "000011_storage_source_usage.down.sql"),
		},
	}

	for dialect, paths := range cases {
		t.Run(dialect, func(t *testing.T) {
			upBytes, err := os.ReadFile(paths[0])
			if err != nil {
				t.Fatalf("read up migration: %v", err)
			}
			downBytes, err := os.ReadFile(paths[1])
			if err != nil {
				t.Fatalf("read down migration: %v", err)
			}
			up := strings.ToLower(string(upBytes))
			down := strings.ToLower(string(downBytes))

			for name, sql := range map[string]string{"up": up, "down": down} {
				for _, required := range []string{
					"update tenants",
					"storage_used",
					"knowledges",
					"deleted_at is null",
					"case",
					"coalesce",
					"storage_size",
				} {
					if !strings.Contains(sql, required) {
						t.Errorf("%s migration must contain %q", name, required)
					}
				}
				for _, forbidden := range []string{"delete from", "truncate", "drop table", "create table"} {
					if strings.Contains(sql, forbidden) {
						t.Errorf("%s migration must not contain destructive statement %q", name, forbidden)
					}
				}
			}
			if !strings.Contains(up, "file_size") {
				t.Error("up migration must include retained source bytes")
			}
			if strings.Contains(down, "file_size") {
				t.Error("down migration must restore the historical index-only aggregate")
			}
			if dialect == "postgres" && !strings.Contains(up, "::numeric") {
				t.Error("postgres aggregate must avoid BIGINT overflow while summing components")
			}
		})
	}
}

func TestSQLiteStorageSourceUsageMigrationsRecomputeActiveRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:storage-source-migration-contract?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.Exec(`
		CREATE TABLE tenants (id INTEGER PRIMARY KEY, storage_used INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE knowledges (
			id INTEGER PRIMARY KEY,
			tenant_id INTEGER NOT NULL,
			file_size INTEGER,
			storage_size INTEGER,
			parse_status TEXT,
			deleted_at DATETIME
		);
	`).Error)
	require.NoError(t, db.Exec("INSERT INTO tenants (id) VALUES (1), (2), (3)").Error)
	// Tenant 1 covers ordinary, failed, NULL, negative, and soft-deleted rows.
	require.NoError(t, db.Exec(`
		INSERT INTO knowledges (id, tenant_id, file_size, storage_size, parse_status, deleted_at) VALUES
			(1, 1, 3, 4, 'completed', NULL),
			(2, 1, -5, 5, 'failed', NULL),
			(3, 1, NULL, NULL, 'pending', NULL),
			(4, 1, -9, -2, 'failed', NULL),
			(5, 1, 100, 100, 'completed', '2026-01-01');
	`).Error)
	// A source at MaxInt64 plus one index byte must saturate rather than
	// overflow SQLite's signed integer aggregate. Tenant 3 intentionally has no
	// rows and must converge to zero.
	require.NoError(t, db.Exec(
		"INSERT INTO knowledges (id, tenant_id, file_size, storage_size, parse_status) VALUES (?, ?, ?, ?, ?)",
		6, 2, int64(^uint64(0)>>1), int64(1), "failed",
	).Error)

	root := filepath.Join("..", "..", "migrations", "sqlite")
	up, err := os.ReadFile(filepath.Join(root, "000011_storage_source_usage.up.sql"))
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(up)).Error)

	assertStorageMigrationUsage := func(tenantID uint64, want int64) {
		t.Helper()
		var got int64
		require.NoError(t, db.Raw("SELECT storage_used FROM tenants WHERE id = ?", tenantID).Scan(&got).Error)
		require.Equal(t, want, got)
	}
	assertStorageMigrationUsage(1, 12)
	assertStorageMigrationUsage(2, int64(^uint64(0)>>1))
	assertStorageMigrationUsage(3, 0)

	down, err := os.ReadFile(filepath.Join(root, "000011_storage_source_usage.down.sql"))
	require.NoError(t, err)
	require.NoError(t, db.Exec(string(down)).Error)
	assertStorageMigrationUsage(1, 9)
	assertStorageMigrationUsage(2, 1)
	assertStorageMigrationUsage(3, 0)
}
