package repository

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func accountErasureCurrentSchemaDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:account-erasure-current-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	_, source, _, ok := runtime.Caller(0)
	require.True(t, ok)
	migrationDir := filepath.Join(filepath.Dir(source), "../../../migrations/sqlite")
	entries, err := os.ReadDir(migrationDir)
	require.NoError(t, err)
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		contents, err := os.ReadFile(filepath.Join(migrationDir, entry.Name()))
		require.NoError(t, err)
		require.NoErrorf(t, db.Exec(string(contents)).Error, "apply %s", entry.Name())
	}
	return db
}

func accountErasureDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:account-erasure-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("PRAGMA foreign_keys = ON").Error)

	// This deliberately mirrors only the identity/ownership tables needed by
	// the repository contract. Purge's optional-table handling is exercised by
	// adding a few child tables in the purge test below.
	for _, ddl := range []string{
		`CREATE TABLE users (
			id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL,
			password_hash TEXT NOT NULL DEFAULT '', tenant_id INTEGER,
			is_active BOOLEAN NOT NULL DEFAULT 1,
			can_access_all_tenants BOOLEAN NOT NULL DEFAULT 0,
			is_system_admin BOOLEAN NOT NULL DEFAULT 0,
			identity_provider TEXT NOT NULL DEFAULT '', identity_subject TEXT NOT NULL DEFAULT '',
			deletion_requested_at DATETIME, preferences TEXT NOT NULL DEFAULT '{}',
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE tenants (
			id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
			plan TEXT NOT NULL DEFAULT 'free', plan_status TEXT NOT NULL DEFAULT 'active',
			paddle_customer_id TEXT NOT NULL DEFAULT '', paddle_subscription_id TEXT NOT NULL DEFAULT '',
			created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE tenant_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, tenant_id INTEGER NOT NULL,
			role TEXT NOT NULL DEFAULT 'contributor', status TEXT NOT NULL DEFAULT 'active',
			invited_by TEXT, joined_at DATETIME, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME
		)`,
		`CREATE TABLE auth_tokens (
			id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL DEFAULT '',
			token_type TEXT NOT NULL DEFAULT 'access_token', expires_at DATETIME,
			is_revoked BOOLEAN NOT NULL DEFAULT 0, created_at DATETIME, updated_at DATETIME
		)`,
		`CREATE TABLE organizations (
			id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner_tenant_id INTEGER NOT NULL DEFAULT 0,
			deleted_at DATETIME
		)`,
		`CREATE TABLE organization_tenant_members (
			id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, tenant_id INTEGER NOT NULL,
			role TEXT NOT NULL DEFAULT 'viewer', representative_user_id TEXT NOT NULL DEFAULT '', created_at DATETIME
		)`,
	} {
		require.NoError(t, db.Exec(ddl).Error)
	}
	return db
}

func seedAccountErasureIdentity(t *testing.T, db *gorm.DB) {
	t.Helper()
	require.NoError(t, db.Exec(`INSERT INTO users
		(id, username, email, password_hash, tenant_id, is_active, identity_provider, identity_subject)
		VALUES ('u-1', 'alice', 'alice@example.com', 'hash', 1, 1, 'supabase', 'sub-1')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO tenants
		(id, name, plan, plan_status, paddle_customer_id, paddle_subscription_id)
		VALUES (1, 'Alice', 'free', 'active', '', 'sub-stale')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO tenant_members (user_id, tenant_id, role, status)
		VALUES ('u-1', 1, 'owner', 'active'), ('u-2', 1, 'viewer', 'active'), ('u-1', 2, 'viewer', 'active')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO organizations (id, owner_id, owner_tenant_id)
		VALUES ('org-foreign', 'u-2', 2)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO organization_tenant_members
		(id, organization_id, tenant_id, role, representative_user_id)
		VALUES ('org-membership', 'org-foreign', 2, 'viewer', 'u-1')`).Error)
}

func TestAccountErasureRepositoryPreflightCountsOwnershipAndIdentity(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	repo := NewAccountErasureRepository(db)

	target, err := repo.Preflight(context.Background(), "u-1")
	require.NoError(t, err)
	require.Equal(t, &types.AccountErasureTarget{
		UserID:                 "u-1",
		Email:                  "alice@example.com",
		TenantID:               1,
		IdentityProvider:       "supabase",
		IdentitySubject:        "sub-1",
		PaddleSubscriptionID:   "sub-stale",
		PaddleCustomerID:       "",
		OwnerTenantCount:       1,
		SharedMemberCount:      1,
		OrganizationOwnerCount: 0,
		IsSystemAdmin:          false,
		IsDeletionPending:      false,
		IsTenantDeleted:        false,
	}, target)
}

func TestAccountErasureRepositoryPreflightSurvivesSoftDeletedTenant(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	repo := NewAccountErasureRepository(db)
	require.NoError(t, db.Exec(`UPDATE users SET is_active = 0, deletion_requested_at = CURRENT_TIMESTAMP WHERE id = 'u-1'`).Error)
	require.NoError(t, db.Exec(`UPDATE tenants SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1`).Error)
	require.NoError(t, db.Exec(`UPDATE tenant_members SET deleted_at = CURRENT_TIMESTAMP WHERE tenant_id = 1`).Error)

	target, err := repo.Preflight(context.Background(), "u-1")
	require.NoError(t, err)
	require.True(t, target.IsDeletionPending)
	require.True(t, target.IsTenantDeleted)
	require.Zero(t, target.OwnerTenantCount)
	require.Equal(t, "sub-stale", target.PaddleSubscriptionID)
}

func TestAccountErasureRepositoryBindsLegacyIdentityOnceWithoutRelinking(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	require.NoError(t, db.Exec(`UPDATE users SET identity_provider = '', identity_subject = '' WHERE id = 'u-1'`).Error)
	repo := NewAccountErasureRepository(db)

	require.NoError(t, repo.BindIdentity(context.Background(), "u-1", "supabase", "00000000-0000-0000-0000-000000000007"))
	require.NoError(t, repo.BindIdentity(context.Background(), "u-1", "supabase", "00000000-0000-0000-0000-000000000007"))
	require.ErrorIs(t,
		repo.BindIdentity(context.Background(), "u-1", "supabase", "00000000-0000-0000-0000-000000000008"),
		types.ErrAccountErasureIdentityConflict,
	)

	var provider, subject string
	require.NoError(t, db.Table("users").Select("identity_provider, identity_subject").Where("id = ?", "u-1").Row().Scan(&provider, &subject))
	require.Equal(t, "supabase", provider)
	require.Equal(t, "00000000-0000-0000-0000-000000000007", subject)
}

func TestAccountErasureRepositoryFenceIsAtomicAndListPendingIsIdempotent(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	require.NoError(t, db.Exec(`INSERT INTO auth_tokens (id, user_id, token, token_type, expires_at)
		VALUES ('tok-1', 'u-1', 'opaque', 'access_token', CURRENT_TIMESTAMP)`).Error)
	repo := NewAccountErasureRepository(db)
	requestedAt := time.Date(2026, 8, 27, 12, 34, 56, 0, time.UTC)

	require.NoError(t, repo.Fence(context.Background(), "u-1", requestedAt))
	// A retry must preserve the first durable timestamp, not move the queue
	// cursor forward or create another deletion workflow.
	require.NoError(t, repo.Fence(context.Background(), "u-1", requestedAt.Add(time.Hour)))

	var active bool
	var fenced sql.NullTime
	require.NoError(t, db.Raw(`SELECT is_active, deletion_requested_at FROM users WHERE id = 'u-1'`).Row().Scan(&active, &fenced))
	require.False(t, active)
	require.True(t, fenced.Valid)
	require.WithinDuration(t, requestedAt, fenced.Time.UTC(), time.Second)

	var revoked bool
	require.NoError(t, db.Raw(`SELECT is_revoked FROM auth_tokens WHERE id = 'tok-1'`).Row().Scan(&revoked))
	require.True(t, revoked)

	pending, err := repo.ListPending(context.Background(), 10)
	require.NoError(t, err)
	require.Len(t, pending, 1)
	require.Equal(t, "u-1", pending[0].UserID)
	require.True(t, pending[0].IsDeletionPending)
}

func TestAccountErasureRepositoryListsOnlyActivePersonalTenantResources(t *testing.T) {
	db := accountErasureDB(t)
	require.NoError(t, db.Exec(`CREATE TABLE resources (
		id TEXT PRIMARY KEY, handle TEXT NOT NULL, tenant_id INTEGER NOT NULL,
		state TEXT NOT NULL DEFAULT 'active', deleted_at DATETIME
	)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO resources (id, handle, tenant_id, state, deleted_at) VALUES
		('r-1', 'active-personal', 1, 'active', NULL),
		('r-2', 'deleted-personal', 1, 'deleted', CURRENT_TIMESTAMP),
		('r-3', 'active-foreign', 2, 'active', NULL)`).Error)

	repo := NewAccountErasureRepository(db)
	refs, err := repo.ListActiveResourceReferences(context.Background(), 1)
	require.NoError(t, err)
	require.Equal(t, []string{"resource://active-personal"}, refs)
}

func TestAccountErasureRepositoryPurgeDeletesChildrenAndMinimizesRetainedRows(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	// The preflight fixture also covers the shared-owner rejection path. This
	// purge case models the eligible personal workspace after that check has
	// passed, so remove the other active member from the home tenant while
	// retaining the user's foreign membership for cleanup coverage.
	require.NoError(t, db.Exec(`DELETE FROM tenant_members WHERE user_id = 'u-2' AND tenant_id = 1`).Error)
	for _, ddl := range []string{
		`CREATE TABLE sessions (id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, user_id TEXT, deleted_at DATETIME)`,
		`CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, tenant_id INTEGER NOT NULL, deleted_at DATETIME)`,
		`CREATE TABLE temporary_documents (id TEXT PRIMARY KEY, tenant_id INTEGER NOT NULL, session_id TEXT NOT NULL, deleted_at DATETIME)`,
		`CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, actor_user_id TEXT NOT NULL DEFAULT '', target_user_id TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', scope_id TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '{}')`,
		`CREATE TABLE paddle_billing_operations (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, operation_key TEXT NOT NULL, request_fingerprint TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '', billing_period TEXT NOT NULL DEFAULT '', price_id TEXT NOT NULL DEFAULT '', subscription_id TEXT NOT NULL DEFAULT '', result_json TEXT NOT NULL DEFAULT '{}', last_error TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE task_dead_letters (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0, task_type TEXT NOT NULL, payload BLOB NOT NULL DEFAULT '{}')`,
	} {
		require.NoError(t, db.Exec(ddl).Error)
	}
	require.NoError(t, db.Exec(`INSERT INTO sessions (id, tenant_id, user_id) VALUES ('s-1', 1, 'u-1')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO messages (id, session_id, tenant_id) VALUES ('m-1', 's-1', 1)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO temporary_documents (id, tenant_id, session_id) VALUES ('d-1', 1, 's-1')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO audit_logs (tenant_id, actor_user_id, target_user_id, target_id, scope_id, details)
		VALUES (1, 'u-1', 'u-1', 'tenant-1', 'scope-1', '{"email":"alice@example.com"}')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO paddle_billing_operations
		(tenant_id, operation_key, request_fingerprint, plan, billing_period, price_id, subscription_id, result_json, last_error)
		VALUES (1, 'op-1', 'fingerprint', 'pro', 'monthly', 'pri_1', 'sub_1', '{"customer":"x"}', 'oops')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO task_dead_letters (tenant_id, task_type, payload) VALUES
		(0, 'account:erase', '{"user_id":"u-1"}'),
		(0, 'account:erase', '{"user_id":"u-2"}'),
		(2, 'document:process', '{"tenant_id":2,"knowledge_id":"foreign"}')`).Error)

	repo := NewAccountErasureRepository(db)
	target := &types.AccountErasureTarget{UserID: "u-1", TenantID: 1}
	require.NoError(t, repo.Purge(context.Background(), target))
	// Idempotency is part of the worker contract: a retry after a successful
	// transaction must not fail or recreate any state.
	require.NoError(t, repo.Purge(context.Background(), target))

	for _, table := range []string{"users", "tenants", "tenant_members", "auth_tokens", "sessions", "messages", "temporary_documents"} {
		var n int64
		require.NoError(t, db.Raw("SELECT COUNT(*) FROM "+table).Scan(&n).Error)
		require.Zero(t, n, table)
	}

	var tenantID int64
	var actor, targetUser, targetID, scopeID, details string
	require.NoError(t, db.Raw(`SELECT tenant_id, actor_user_id, target_user_id, target_id, scope_id, details FROM audit_logs`).Row().Scan(&tenantID, &actor, &targetUser, &targetID, &scopeID, &details))
	require.Zero(t, tenantID)
	require.Empty(t, actor)
	require.Empty(t, targetUser)
	require.Empty(t, targetID)
	require.Empty(t, scopeID)
	require.Equal(t, "{}", details)

	var operationTenant int64
	var operationKey, fingerprint, plan, period, price, subscription, result, lastError string
	require.NoError(t, db.Raw(`SELECT tenant_id, operation_key, request_fingerprint, plan, billing_period, price_id, subscription_id, result_json, last_error FROM paddle_billing_operations`).Row().Scan(
		&operationTenant, &operationKey, &fingerprint, &plan, &period, &price, &subscription, &result, &lastError))
	require.Zero(t, operationTenant)
	require.Equal(t, "redacted-1", operationKey)
	require.Empty(t, fingerprint)
	require.Empty(t, plan)
	require.Empty(t, period)
	require.Empty(t, price)
	require.Empty(t, subscription)
	require.Equal(t, "{}", result)
	require.Empty(t, lastError)

	var deadLetterPayloads []string
	require.NoError(t, db.Table("task_dead_letters").Order("id ASC").Pluck("payload", &deadLetterPayloads).Error)
	require.Equal(t, []string{`{"user_id":"u-2"}`, `{"tenant_id":2,"knowledge_id":"foreign"}`}, deadLetterPayloads)
}

func TestAccountErasureRepositoryPurgeMatchesCurrentSQLiteSchema(t *testing.T) {
	db := accountErasureCurrentSchemaDB(t)
	require.NoError(t, db.Exec(`INSERT INTO tenants (id, name, business) VALUES (7, 'Personal', 'consumer')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO users (id, username, email, password_hash, tenant_id, identity_provider, identity_subject, deletion_requested_at)
		VALUES ('u-current', 'current', 'current@example.com', '', 7, 'supabase', '00000000-0000-0000-0000-000000000007', CURRENT_TIMESTAMP)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO tenant_members (user_id, tenant_id, role, status) VALUES ('u-current', 7, 'owner', 'active')`).Error)
	// Memory is tenant-scoped product data. A completed account purge must
	// remove every row for the erased personal workspace while preserving rows
	// belonging to an unrelated tenant.
	require.NoError(t, db.Exec(`INSERT INTO memory_subjects (id, tenant_id, subject_id) VALUES
		('memory-subject-current', 7, 'user:u-current'),
		('memory-subject-foreign', 8, 'user:u-foreign')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO memory_items (id, tenant_id, subject_id, kind, content) VALUES
		('memory-item-current', 7, 'user:u-current', 'fact', 'erase me'),
		('memory-item-foreign', 8, 'user:u-foreign', 'fact', 'keep me')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO memory_tombstones (id, tenant_id, subject_id, fingerprint) VALUES
		('memory-tombstone-current', 7, 'user:u-current', 'fingerprint-current'),
		('memory-tombstone-foreign', 8, 'user:u-foreign', 'fingerprint-foreign')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO memory_topic_stats (id, tenant_id, subject_id, normalized_key) VALUES
		('memory-topic-current', 7, 'user:u-current', 'current'),
		('memory-topic-foreign', 8, 'user:u-foreign', 'foreign')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO memory_doc_affinity (id, tenant_id, subject_id, knowledge_id) VALUES
		('memory-affinity-current', 7, 'user:u-current', 'knowledge-current'),
		('memory-affinity-foreign', 8, 'user:u-foreign', 'knowledge-foreign')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO memory_item_embeddings (item_id, tenant_id, subject_id, model_id, dims) VALUES
		('memory-item-current', 7, 'user:u-current', 'embedding-current', 3),
		('memory-item-foreign', 8, 'user:u-foreign', 'embedding-foreign', 3)`).Error)

	repo := NewAccountErasureRepository(db)
	require.NoError(t, repo.Purge(context.Background(), &types.AccountErasureTarget{UserID: "u-current", TenantID: 7}))
	for _, table := range []string{"users", "tenants", "tenant_members"} {
		var count int64
		require.NoError(t, db.Table(table).Count(&count).Error)
		require.Zero(t, count, table)
	}
	for _, table := range []string{"memory_subjects", "memory_items", "memory_tombstones", "memory_topic_stats", "memory_doc_affinity", "memory_item_embeddings"} {
		var currentCount, foreignCount int64
		require.NoError(t, db.Table(table).Where("tenant_id = ?", 7).Count(&currentCount).Error)
		require.NoError(t, db.Table(table).Where("tenant_id = ?", 8).Count(&foreignCount).Error)
		require.Zero(t, currentCount, table)
		require.EqualValues(t, 1, foreignCount, table)
	}

	// A completed purge must release the local email/username and external-
	// identity uniqueness boundaries. This models a fresh Supabase signup with
	// a new provider subject and proves the deleted account leaves no local
	// registration tombstone behind.
	require.NoError(t, db.Exec(`INSERT INTO tenants (id, name, business) VALUES (8, 'Fresh personal', 'consumer')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO users (id, username, email, password_hash, tenant_id, identity_provider, identity_subject)
		VALUES ('u-fresh', 'current', 'current@example.com', '', 8, 'supabase', '00000000-0000-0000-0000-000000000008')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO tenant_members (user_id, tenant_id, role, status)
		VALUES ('u-fresh', 8, 'owner', 'active')`).Error)

	var freshCount int64
	require.NoError(t, db.Table("users").Where("id = ? AND email = ?", "u-fresh", "current@example.com").Count(&freshCount).Error)
	require.EqualValues(t, 1, freshCount)
}

func TestAccountErasureRepositoryPurgeRejectsMemberAddedAfterPreflight(t *testing.T) {
	db := accountErasureDB(t)
	seedAccountErasureIdentity(t, db)
	repo := NewAccountErasureRepository(db)

	// The original shared fixture proves a member can appear after the service
	// preflight. The transaction-local guard must preserve both the account and
	// the dependent member instead of silently deleting their workspace.
	err := repo.Purge(context.Background(), &types.AccountErasureTarget{UserID: "u-1", TenantID: 1})
	require.ErrorIs(t, err, ErrAccountErasureInvalidTarget)

	var users, members int64
	require.NoError(t, db.Table("users").Where("id = ?", "u-1").Count(&users).Error)
	require.NoError(t, db.Table("tenant_members").Where("tenant_id = ? AND deleted_at IS NULL", 1).Count(&members).Error)
	require.EqualValues(t, 1, users)
	require.EqualValues(t, 2, members)
}
