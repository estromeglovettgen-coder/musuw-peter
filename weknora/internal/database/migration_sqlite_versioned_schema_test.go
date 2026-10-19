package database

import (
	"database/sql"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// versionedSQLiteTables is the set of tables that SQLite migrations must
// create to stay in sync with the versioned (PostgreSQL) migrations:
// 000041 task queue, 000053 system settings, 000055 processing spans,
// 000063 knowledge multi-tags, 000023 sandbox/artifact compatibility,
// 000024 creator marketplace billing, 000025 free reviewed products,
// and 000026 marketplace preview examples.
var versionedSQLiteTables = []string{
	"fire_token_plans",
	"fire_token_memberships",
	"fire_token_adjustments",
	"fire_model_calls",
	"fire_workspace_accounts",
	"fire_question_calls",
	"task_pending_ops",
	"task_dead_letters",
	"system_settings",
	"knowledge_processing_spans",
	"knowledge_tag_relations",
	"tenant_sandbox_configs",
	"tenant_skills",
	"tenant_skill_catalog",
	"tenant_skill_snapshots",
	"tenant_user_env_vars",
	"marketplace_products",
	"marketplace_subscriptions",
	"marketplace_transactions",
	"marketplace_processed_events",
}

// versionedSQLiteColumns maps each existing table to the columns that the
// versioned migrations add and the SQLite baseline was missing.
var versionedSQLiteColumns = map[string][]string{
	"fire_token_plans":       {"question_limit"},
	"fire_token_memberships": {"question_limit", "used_questions", "reserved_questions"},
	"fire_token_adjustments": {"questions"},
	"knowledge_bases":        {"customer_profile"},
	"tenant_skills":          {"catalog_id", "install_session_id", "install_message_id", "envs"},
	"tenant_skill_snapshots": {"planned_name"},
	"tenants":                {"api_principal_config", "customer_config", "system_prompt_config"}, // 000064
	"users":                  {"is_system_admin"},                                                 // 000053
	"knowledges":             {"pending_subtasks_count"},                                          // 000056
	"messages":               {"attachments", "usage", "artifacts"},                               // 000034, 000085, 000023
	"sessions":               {"sandbox_config_id", "customer_knowledge_base_id"},                 // 000023
	"tenant_invitations":     {"token", "accepted_count"},                                         // 000054
	"embed_channels":         {"allow_memory"},                                                    // 000060
	"mcp_oauth_tokens":       {"principal_type", "principal_id"},                                  // 000064
	"marketplace_products":   {"sample_conversations"},                                            // 000026
}

const expectedSQLiteMigrationVersion = 33

func TestSQLiteMigrationsUpgrade32QuestionAllowancesPreservesPaidCycle(t *testing.T) {
	repoRoot := sqliteRepoRoot(t)
	legacyRoot := t.TempDir()
	destDir := filepath.Join(legacyRoot, "migrations", "sqlite")
	require.NoError(t, os.MkdirAll(destDir, 0o755))
	entries, err := os.ReadDir(filepath.Join(repoRoot, "migrations", "sqlite"))
	require.NoError(t, err)
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".up.sql") || len(name) < 6 {
			continue
		}
		version, err := strconv.Atoi(name[:6])
		require.NoError(t, err)
		if version > 32 {
			continue
		}
		data, err := os.ReadFile(filepath.Join(repoRoot, "migrations", "sqlite", name))
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(destDir, name), data, 0o600))
	}
	chdirAndRestore(t, legacyRoot)
	dbPath := filepath.Join(t.TempDir(), "paid-upgrade.db")
	require.NoError(t, RunMigrationsWithOptions("sqlite3://unused", MigrationOptions{SQLiteDBPath: dbPath}))
	db := openSQLiteDB(t, dbPath)
	version, dirty := sqliteMigrationState(t, db)
	require.Equal(t, 32, version)
	require.False(t, dirty)
	_, err = db.Exec("INSERT INTO tenants (id,name,business) VALUES (1,'paid','fixture')")
	require.NoError(t, err)
	_, err = db.Exec("INSERT INTO users (id,username,email,password_hash,tenant_id) VALUES ('paid','paid','paid@example.test','not-a-real-hash',1)")
	require.NoError(t, err)
	_, err = db.Exec("INSERT INTO fire_token_memberships (user_id,tenant_id,period_id,starts_at,expires_at,token_limit,used_tokens) VALUES ('paid',1,'paid-period',CURRENT_TIMESTAMP,datetime('now','+1 day'),700,123)")
	require.NoError(t, err)
	chdirAndRestore(t, repoRoot)
	require.NoError(t, RunMigrationsWithOptions("sqlite3://unused", MigrationOptions{SQLiteDBPath: dbPath}))
	version, dirty = sqliteMigrationState(t, db)
	require.Equal(t, 33, version)
	require.False(t, dirty)
	var period string
	var tokens, used, limit, questions, reserved int64
	require.NoError(t, db.QueryRow("SELECT period_id,token_limit,used_tokens,question_limit,used_questions,reserved_questions FROM fire_token_memberships WHERE user_id='paid'").Scan(&period, &tokens, &used, &limit, &questions, &reserved))
	require.Equal(t, "paid-period", period)
	require.EqualValues(t, 700, tokens)
	require.EqualValues(t, 123, used)
	require.Zero(t, limit)
	require.Zero(t, questions)
	require.Zero(t, reserved)
	_, err = db.Exec("PRAGMA foreign_keys=ON")
	require.NoError(t, err)
	_, err = db.Exec("INSERT INTO fire_question_calls (id,user_id,period_id,message_id,session_id,status) VALUES ('question','paid','paid-period','message','session','settled')")
	require.NoError(t, err)
	// The old immutable period remains as history when the current one rotates.
	_, err = db.Exec("UPDATE fire_token_memberships SET period_id='new-period' WHERE user_id='paid'")
	require.NoError(t, err)
	_, err = db.Exec("INSERT INTO fire_question_calls (id,user_id,period_id,message_id,session_id,status) VALUES ('duplicate','paid','new-period','message','session','reserved')")
	require.Error(t, err)
	_, err = db.Exec("INSERT INTO fire_question_calls (id,user_id,period_id,message_id,session_id,status) VALUES ('orphan','unknown','new-period','another','session','reserved')")
	require.Error(t, err)
	_, err = db.Exec("DELETE FROM fire_token_memberships WHERE user_id='paid'")
	require.NoError(t, err)
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM fire_question_calls").Scan(&count))
	require.Zero(t, count)
}

func TestSQLiteMigrationsCreateVersionedSchema(t *testing.T) {
	repoRoot := sqliteRepoRoot(t)
	chdirAndRestore(t, repoRoot)

	dbPath := filepath.Join(t.TempDir(), "fresh.db")
	require.NoError(t, RunMigrationsWithOptions("sqlite3://unused", MigrationOptions{SQLiteDBPath: dbPath}))

	db := openSQLiteDB(t, dbPath)
	version, dirty := sqliteMigrationState(t, db)
	require.Equal(t, expectedSQLiteMigrationVersion, version)
	require.False(t, dirty)

	for _, table := range versionedSQLiteTables {
		require.Truef(t, sqliteTableExists(t, db, table), "SQLite migrations must create table %s", table)
	}
	for table, columns := range versionedSQLiteColumns {
		for _, column := range columns {
			require.Truef(
				t,
				sqliteColumnExists(t, db, table, column),
				"SQLite migrations must add column %s.%s",
				table,
				column,
			)
		}
	}

	assertSQLiteShareLinkInvitationsWork(t, db)
	assertSQLiteMCPOAuthPrincipalUpsertWorks(t, db)
	require.False(t, sqliteColumnExists(t, db, "knowledges", "tag_id"),
		"SQLite migrations must drop legacy knowledges.tag_id after multi-tag migration")
}

func TestSQLiteMigrationsUpgradeMusuwV12PreservesData(t *testing.T) {
	repoRoot := sqliteRepoRoot(t)

	// Build a legacy Musuw v12 migration root (000000_init .. 000012) so we
	// can prove the appended upstream migrations upgrade an existing Lite
	// database without replaying the baseline. The 000003..000012 files are
	// Musuw's billing, quota, storage, and account-erasure history and must not
	// be replaced by upstream's same-numbered migrations.
	legacyRoot := copySQLiteMigrationsV12(t, repoRoot)
	chdirAndRestore(t, legacyRoot)

	dbPath := filepath.Join(t.TempDir(), "upgrade.db")
	require.NoError(t, RunMigrationsWithOptions("sqlite3://unused", MigrationOptions{SQLiteDBPath: dbPath}))

	db := openSQLiteDB(t, dbPath)
	versionBefore, dirtyBefore := sqliteMigrationState(t, db)
	require.Equal(t, 12, versionBefore)
	require.False(t, dirtyBefore)
	_, err := db.Exec("INSERT INTO tenants (name, business) VALUES (?, ?)", "upgrade-sentinel", "migration-test")
	require.NoError(t, err)
	_, err = db.Exec(
		"INSERT INTO knowledges (id, tenant_id, knowledge_base_id, type, title, source, tag_id) "+
			"VALUES (?, 1, ?, 'document', 'tagged-doc', 'manual', ?)",
		"legacy-knowledge-1", "legacy-kb-1", "legacy-tag-1",
	)
	require.NoError(t, err)

	// Run the full migration set from the repo root.
	chdirAndRestore(t, repoRoot)
	require.NoError(t, RunMigrationsWithOptions("sqlite3://unused", MigrationOptions{SQLiteDBPath: dbPath}))

	db = openSQLiteDB(t, dbPath)
	versionAfter, dirtyAfter := sqliteMigrationState(t, db)
	require.Equal(t, expectedSQLiteMigrationVersion, versionAfter)
	require.False(t, dirtyAfter)

	for _, table := range versionedSQLiteTables {
		require.Truef(t, sqliteTableExists(t, db, table), "upgraded SQLite DB must have table %s", table)
	}
	for table, columns := range versionedSQLiteColumns {
		for _, column := range columns {
			require.Truef(
				t,
				sqliteColumnExists(t, db, table, column),
				"upgraded SQLite DB must have column %s.%s",
				table,
				column,
			)
		}
	}

	var sentinelName string
	require.NoError(t, db.QueryRow("SELECT name FROM tenants WHERE business = ?", "migration-test").Scan(&sentinelName))
	require.Equal(t, "upgrade-sentinel", sentinelName)

	var relationCount int
	require.NoError(t, db.QueryRow(
		"SELECT COUNT(*) FROM knowledge_tag_relations WHERE knowledge_id = ? AND tag_id = ?",
		"legacy-knowledge-1", "legacy-tag-1",
	).Scan(&relationCount))
	require.Equal(t, 1, relationCount)
	require.False(t, sqliteColumnExists(t, db, "knowledges", "tag_id"))
}

func sqliteRepoRoot(t *testing.T) string {
	t.Helper()
	repoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	require.NoError(t, err)
	return repoRoot
}

func chdirAndRestore(t *testing.T, dir string) {
	t.Helper()
	previousDir, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir(dir))
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
}

func openSQLiteDB(t *testing.T, dbPath string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func sqliteMigrationState(t *testing.T, db *sql.DB) (version int, dirty bool) {
	t.Helper()
	require.NoError(t, db.QueryRow("SELECT version, dirty FROM schema_migrations").Scan(&version, &dirty))
	return version, dirty
}

func sqliteTableExists(t *testing.T, db *sql.DB, table string) bool {
	t.Helper()
	var n int
	require.NoError(t, db.QueryRow(
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
		table,
	).Scan(&n))
	return n == 1
}

func sqliteColumnExists(t *testing.T, db *sql.DB, table, column string) bool {
	t.Helper()
	var n int
	require.NoError(t, db.QueryRow(
		"SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?",
		table,
		column,
	).Scan(&n))
	return n == 1
}

func assertSQLiteShareLinkInvitationsWork(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec("INSERT INTO tenants (name, business) VALUES (?, ?)", "share-link-tenant", "share-link-test")
	require.NoError(t, err)

	expiresAt := "2099-01-01 00:00:00"
	shareLinkInsert := "INSERT INTO tenant_invitations " +
		"(tenant_id, invitee_user_id, token, role, status, expires_at) " +
		"VALUES (1, '', ?, 'member', 'pending', ?)"
	_, err = db.Exec(shareLinkInsert, "token-a", expiresAt)
	require.NoError(t, err)
	_, err = db.Exec(shareLinkInsert, "token-b", expiresAt)
	require.NoError(t, err)

	var count int
	require.NoError(t, db.QueryRow(
		"SELECT COUNT(*) FROM tenant_invitations WHERE tenant_id = 1 AND invitee_user_id = '' AND status = 'pending'",
	).Scan(&count))
	require.Equal(t, 2, count)
}

func assertSQLiteMCPOAuthPrincipalUpsertWorks(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(
		"INSERT INTO mcp_services (id, tenant_id, name, transport_type) VALUES (?, 1, 'svc', 'http')",
		"svc-migration-1",
	)
	require.NoError(t, err)

	tokenInsertPrefix := "INSERT INTO mcp_oauth_tokens " +
		"(id, tenant_id, user_id, service_id, principal_type, principal_id, access_token) "
	_, err = db.Exec(
		tokenInsertPrefix +
			"VALUES ('tok-1', 1, 'u1', 'svc-migration-1', 'web_user', 'u1', 'token-1')",
	)
	require.NoError(t, err)

	_, err = db.Exec(
		tokenInsertPrefix +
			"VALUES ('tok-2', 1, 'u1', 'svc-migration-1', 'web_user', 'u1', 'token-2') " +
			"ON CONFLICT(tenant_id, principal_type, principal_id, service_id) " +
			"DO UPDATE SET access_token = excluded.access_token",
	)
	require.NoError(t, err)

	var accessToken string
	require.NoError(t, db.QueryRow(
		"SELECT access_token FROM mcp_oauth_tokens "+
			"WHERE tenant_id = 1 AND principal_type = 'web_user' "+
			"AND principal_id = 'u1' AND service_id = 'svc-migration-1'",
	).Scan(&accessToken))
	require.Equal(t, "token-2", accessToken)

	var rowCount int
	require.NoError(t, db.QueryRow(
		"SELECT COUNT(*) FROM mcp_oauth_tokens WHERE tenant_id = 1 AND service_id = 'svc-migration-1'",
	).Scan(&rowCount))
	require.Equal(t, 1, rowCount)
}

func copySQLiteMigrationsV12(t *testing.T, repoRoot string) string {
	t.Helper()
	dest := t.TempDir()
	srcDir := filepath.Join(repoRoot, "migrations", "sqlite")
	destDir := filepath.Join(dest, "migrations", "sqlite")
	require.NoError(t, os.MkdirAll(destDir, 0o755))

	legacy := []string{
		"000000_init.up.sql",
		"000001_remove_wiki_log.up.sql",
		"000002_knowledge_folder_path.up.sql",
		"000003_consumer_plan_entitlements.up.sql",
		"000004_openrouter_credit_period.up.sql",
		"000005_paddle_billing_period.up.sql",
		"000006_paddle_current_period_end.up.sql",
		"000007_paddle_billing_operations.up.sql",
		"000008_consumer_plan_storage_quota.up.sql",
		"000009_account_erasure_identity.up.sql",
		"000010_paddle_renewal_event_at.up.sql",
		"000011_storage_source_usage.up.sql",
		"000012_complimentary_entitlements.up.sql",
	}
	for _, name := range legacy {
		data, err := os.ReadFile(filepath.Join(srcDir, name))
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(destDir, name), data, 0o600))
	}
	return dest
}
