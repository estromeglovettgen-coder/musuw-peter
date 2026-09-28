package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	// ErrAccountErasureSchemaIncomplete is returned before any mutation when
	// a production database is missing a table/column required by the erasure
	// contract. SQLite unit tests may omit explicitly optional tables.
	ErrAccountErasureSchemaIncomplete = errors.New("account erasure schema incomplete")
	ErrAccountErasureUserNotFound     = errors.New("account erasure user not found")
	ErrAccountErasureInvalidTarget    = errors.New("account erasure target is invalid")
)

// accountErasureRepository is intentionally a single database seam. The
// service/task owns external provider cleanup; this repository only fences,
// inventories, and removes Musuw-controlled database state.
type accountErasureRepository struct {
	db *gorm.DB
}

// NewAccountErasureRepository constructs the local account-erasure repository.
func NewAccountErasureRepository(db *gorm.DB) interfaces.AccountErasureRepository {
	return &accountErasureRepository{db: db}
}

// These are the tables in the current PostgreSQL migration set and the
// consolidated SQLite schema. The three legacy/conditional tables are called
// out separately below: embeddings is intentionally skipped when the
// conditional embedding migration is disabled; the two renamed/removed
// tables may exist only on an older deployment. Every other missing table is
// a production schema error, never a best-effort skip.
var accountErasureKnownTables = []string{
	"users",
	"tenants",
	"tenant_members",
	"auth_tokens",
	"models",
	"knowledge_bases",
	"knowledges",
	"sessions",
	"messages",
	"message_suggestion_sets",
	"message_suggestion_events",
	"chunks",
	"chunk_revisions",
	"embeddings",
	"knowledge_processing_spans",
	"knowledge_tags",
	"knowledge_tag_relations",
	"mcp_services",
	"mcp_tool_approvals",
	"mcp_oauth_clients",
	"mcp_oauth_tokens",
	"custom_agents",
	"organizations",
	"organization_tenant_members",
	"organization_members",
	"organization_members_pre_plan3",
	"kb_shares",
	"organization_join_requests",
	"agent_shares",
	"tenant_disabled_shared_agents",
	"im_channel_sessions",
	"im_channels",
	"embed_channels",
	"data_sources",
	"sync_logs",
	"web_search_providers",
	"vector_stores",
	"storage_backends",
	"resources",
	"resource_bindings",
	"resource_access_grants",
	"tenant_api_keys",
	"temporary_documents",
	"memory_subjects",
	"memory_items",
	"memory_tombstones",
	"memory_topic_stats",
	"memory_doc_affinity",
	"memory_item_embeddings",
	"wiki_pages",
	"wiki_folders",
	"wiki_page_issues",
	"wiki_page_revisions",
	"wiki_log_entries",
	"task_pending_ops",
	"task_dead_letters",
	"audit_logs",
	"user_resource_favorites",
	"user_kb_pins",
	"tenant_invitations",
	"paddle_billing_operations",
	"marketplace_products",
	"marketplace_subscriptions",
	"marketplace_transactions",
	"marketplace_processed_events",
}

var accountErasureConditionalTables = map[string]struct{}{
	"embeddings":                     {},
	"organization_members":           {},
	"organization_members_pre_plan3": {},
	"wiki_log_entries":               {},
}

type accountErasureUserRow struct {
	ID                  string        `gorm:"column:id"`
	Email               string        `gorm:"column:email"`
	TenantID            sql.NullInt64 `gorm:"column:tenant_id"`
	IsActive            bool          `gorm:"column:is_active"`
	IsSystemAdmin       bool          `gorm:"column:is_system_admin"`
	IdentityProvider    string        `gorm:"column:identity_provider"`
	IdentitySubject     string        `gorm:"column:identity_subject"`
	DeletionRequestedAt sql.NullTime  `gorm:"column:deletion_requested_at"`
}

type accountErasureTenantRow struct {
	PaddleSubscriptionID sql.NullString `gorm:"column:paddle_subscription_id"`
	PaddleCustomerID     sql.NullString `gorm:"column:paddle_customer_id"`
	DeletedAt            sql.NullTime   `gorm:"column:deleted_at"`
}

func (r *accountErasureRepository) Preflight(ctx context.Context, userID string) (*types.AccountErasureTarget, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrAccountErasureInvalidTarget
	}
	return r.preflight(ctx, r.db.WithContext(ctx), userID)
}

func (r *accountErasureRepository) preflight(ctx context.Context, db *gorm.DB, userID string) (*types.AccountErasureTarget, error) {
	present, err := accountErasureEnsureTables(db, "preflight", []string{
		"users", "tenants", "tenant_members", "organizations", "marketplace_subscriptions",
	})
	if err != nil {
		return nil, err
	}
	if err := accountErasureRequireColumns(db, "users", "id", "email", "tenant_id", "is_active", "is_system_admin", "identity_provider", "identity_subject", "deletion_requested_at"); err != nil {
		return nil, err
	}
	if err := accountErasureRequireColumns(db, "tenant_members", "user_id", "tenant_id", "role", "status", "deleted_at"); err != nil {
		return nil, err
	}

	var row accountErasureUserRow
	err = db.Unscoped().Table("users").
		Select("id, email, tenant_id, is_active, is_system_admin, identity_provider, identity_subject, deletion_requested_at").
		Where("id = ?", userID).Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountErasureUserNotFound
	}
	if err != nil {
		return nil, err
	}

	target := &types.AccountErasureTarget{
		UserID:            row.ID,
		Email:             row.Email,
		IdentityProvider:  row.IdentityProvider,
		IdentitySubject:   row.IdentitySubject,
		IsSystemAdmin:     row.IsSystemAdmin,
		IsDeletionPending: row.DeletionRequestedAt.Valid,
	}
	if row.TenantID.Valid && row.TenantID.Int64 > 0 {
		target.TenantID = uint64(row.TenantID.Int64)
	}

	// Read the tenant unscoped. A prior retry may have soft-deleted the home
	// tenant through TenantService; its row must still provide billing state.
	if target.TenantID != 0 && accountErasureHasTable(db, "tenants") {
		var tenant accountErasureTenantRow
		selects := make([]string, 0, 3)
		for _, column := range []string{"paddle_subscription_id", "paddle_customer_id", "deleted_at"} {
			if accountErasureHasColumn(db, "tenants", column) {
				selects = append(selects, column)
			}
		}
		if len(selects) > 0 {
			if err := db.Unscoped().Table("tenants").Select(strings.Join(selects, ", ")).Where("id = ?", target.TenantID).Take(&tenant).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
		}
		target.PaddleSubscriptionID = tenant.PaddleSubscriptionID.String
		target.PaddleCustomerID = tenant.PaddleCustomerID.String
		target.IsTenantDeleted = tenant.DeletedAt.Valid
	}
	if target.TenantID != 0 && present["marketplace_subscriptions"] {
		// Account deletion is complete inventory, never the paginated order UI.
		if err := db.Table("marketplace_subscriptions").
			Select("DISTINCT paddle_customer_id, paddle_subscription_id").
			Where("tenant_id = ? AND (paddle_customer_id <> '' OR paddle_subscription_id <> '')", target.TenantID).
			Scan(&target.MarketplaceBilling).Error; err != nil {
			return nil, err
		}
	}

	// Ownership/shared-workspace counts deliberately inspect active rows only;
	// soft-deleted historical membership rows must not block a clean account.
	if err := db.Table("tenant_members").Where("user_id = ? AND role = ? AND status = ? AND deleted_at IS NULL", userID, string(types.TenantRoleOwner), string(types.TenantMemberStatusActive)).Count(&target.OwnerTenantCount).Error; err != nil {
		return nil, err
	}
	if target.TenantID != 0 {
		if err := db.Table("tenant_members").Where("tenant_id = ? AND user_id <> ? AND status = ? AND deleted_at IS NULL", target.TenantID, userID, string(types.TenantMemberStatusActive)).Count(&target.SharedMemberCount).Error; err != nil {
			return nil, err
		}
	}

	if accountErasureHasTable(db, "organizations") {
		if err := db.Unscoped().Table("organizations").Where("owner_id = ? AND deleted_at IS NULL", userID).Count(&target.OrganizationOwnerCount).Error; err != nil {
			return nil, err
		}
	}
	return target, nil
}

func (r *accountErasureRepository) BindIdentity(ctx context.Context, userID, provider, subject string) error {
	userID = strings.TrimSpace(userID)
	provider = strings.ToLower(strings.TrimSpace(provider))
	subject = strings.TrimSpace(subject)
	if userID == "" || provider == "" || subject == "" {
		return ErrAccountErasureInvalidTarget
	}
	db := r.db.WithContext(ctx)
	if _, err := accountErasureEnsureTables(db, "bind identity", []string{"users"}); err != nil {
		return err
	}
	if err := accountErasureRequireColumns(db, "users", "id", "identity_provider", "identity_subject", "deleted_at"); err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		locking := tx
		if tx.Dialector.Name() == "postgres" || tx.Dialector.Name() == "mysql" {
			locking = tx.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		var row accountErasureUserRow
		err := locking.Unscoped().Table("users").
			Select("id, identity_provider, identity_subject").
			Where("id = ? AND deleted_at IS NULL", userID).Take(&row).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrAccountErasureUserNotFound
		}
		if err != nil {
			return err
		}
		storedProvider := strings.ToLower(strings.TrimSpace(row.IdentityProvider))
		storedSubject := strings.TrimSpace(row.IdentitySubject)
		switch {
		case storedProvider == provider && storedSubject == subject:
			return nil
		case storedProvider != "" || storedSubject != "":
			return types.ErrAccountErasureIdentityConflict
		default:
			return tx.Table("users").Where("id = ?", userID).Updates(map[string]interface{}{
				"identity_provider": provider,
				"identity_subject":  subject,
			}).Error
		}
	})
}

func (r *accountErasureRepository) Fence(ctx context.Context, userID string, requestedAt time.Time) error {
	if strings.TrimSpace(userID) == "" {
		return ErrAccountErasureInvalidTarget
	}
	if requestedAt.IsZero() {
		requestedAt = time.Now().UTC()
	}
	db := r.db.WithContext(ctx)
	if _, err := accountErasureEnsureTables(db, "fence", []string{"users", "auth_tokens"}); err != nil {
		return err
	}
	if err := accountErasureRequireColumns(db, "users", "id", "is_active", "deletion_requested_at"); err != nil {
		return err
	}
	if err := accountErasureRequireColumns(db, "auth_tokens", "user_id", "is_revoked"); err != nil {
		return err
	}

	return db.Transaction(func(tx *gorm.DB) error {
		locking := tx
		if tx.Dialector.Name() == "postgres" || tx.Dialector.Name() == "mysql" {
			locking = tx.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		var id string
		if err := locking.Table("users").Select("id").Where("id = ?", userID).Take(&id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAccountErasureUserNotFound
			}
			return err
		}
		if err := tx.Table("users").Where("id = ?", userID).Updates(map[string]interface{}{
			"is_active":             false,
			"deletion_requested_at": gorm.Expr("COALESCE(deletion_requested_at, ?)", requestedAt.UTC()),
		}).Error; err != nil {
			return err
		}
		return tx.Table("auth_tokens").Where("user_id = ?", userID).Update("is_revoked", true).Error
	})
}

func (r *accountErasureRepository) ListPending(ctx context.Context, limit int) ([]*types.AccountErasureTarget, error) {
	db := r.db.WithContext(ctx)
	if _, err := accountErasureEnsureTables(db, "list pending", []string{"users"}); err != nil {
		return nil, err
	}
	if err := accountErasureRequireColumns(db, "users", "id", "deletion_requested_at", "is_active"); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 100
	}
	var rows []accountErasureUserRow
	if err := db.Unscoped().Table("users").
		Select("id, deletion_requested_at").
		Where("deletion_requested_at IS NOT NULL AND is_active = ?", false).
		Order("deletion_requested_at ASC, id ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]*types.AccountErasureTarget, 0, len(rows))
	for _, row := range rows {
		target, err := r.Preflight(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		target.IsDeletionPending = true
		result = append(result, target)
	}
	return result, nil
}

func (r *accountErasureRepository) RemainingActiveKnowledgeCount(ctx context.Context, tenantID uint64) (int64, error) {
	if tenantID == 0 {
		return 0, ErrAccountErasureInvalidTarget
	}
	db := r.db.WithContext(ctx)
	if !accountErasureHasTable(db, "knowledges") {
		if db.Dialector.Name() == "sqlite" {
			return 0, nil
		}
		return 0, fmt.Errorf("%w: missing table %q", ErrAccountErasureSchemaIncomplete, "knowledges")
	}
	if err := accountErasureRequireColumns(db, "knowledges", "tenant_id", "deleted_at"); err != nil {
		return 0, err
	}
	var count int64
	if err := db.Unscoped().Table("knowledges").Where("tenant_id = ? AND deleted_at IS NULL", tenantID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *accountErasureRepository) ListActiveResourceReferences(ctx context.Context, tenantID uint64) ([]string, error) {
	if tenantID == 0 {
		return nil, ErrAccountErasureInvalidTarget
	}
	db := r.db.WithContext(ctx)
	if !accountErasureHasTable(db, "resources") {
		if db.Dialector.Name() == "sqlite" {
			return nil, nil
		}
		return nil, fmt.Errorf("%w: missing table %q", ErrAccountErasureSchemaIncomplete, "resources")
	}
	if err := accountErasureRequireColumns(db, "resources", "tenant_id", "handle", "state", "deleted_at"); err != nil {
		return nil, err
	}
	var handles []string
	if err := db.Unscoped().Table("resources").
		Where("tenant_id = ? AND state = ? AND deleted_at IS NULL", tenantID, types.ResourceStateActive).
		Order("id ASC").Pluck("handle", &handles).Error; err != nil {
		return nil, err
	}
	refs := make([]string, 0, len(handles))
	for _, handle := range handles {
		if handle = strings.TrimSpace(handle); handle != "" {
			refs = append(refs, types.BuildResourcePath(handle))
		}
	}
	return refs, nil
}

func (r *accountErasureRepository) Purge(ctx context.Context, target *types.AccountErasureTarget) error {
	if target == nil || strings.TrimSpace(target.UserID) == "" || target.TenantID == 0 {
		return ErrAccountErasureInvalidTarget
	}
	db := r.db.WithContext(ctx)
	return db.Transaction(func(tx *gorm.DB) error {
		present, err := accountErasureEnsureTables(tx, "purge", accountErasureKnownTables)
		if err != nil {
			return err
		}
		if err := accountErasureAssertPurgeSafe(tx, present, target); err != nil {
			return err
		}
		return accountErasurePurgeRows(tx, present, target)
	})
}

// accountErasureAssertPurgeSafe is a second, transaction-local guard for the
// ownership invariants checked by the service. It closes the race where an
// administrator adds a member/organization link after the HTTP preflight but
// before the asynchronous worker reaches its final purge. No destructive
// statement is issued until these counts are known to be zero.
func accountErasureAssertPurgeSafe(tx *gorm.DB, present map[string]bool, target *types.AccountErasureTarget) error {
	tenantID, userID := target.TenantID, target.UserID
	if present["tenant_members"] {
		var shared int64
		if err := tx.Table("tenant_members").Where("tenant_id = ? AND user_id <> ? AND status = ? AND deleted_at IS NULL", tenantID, userID, string(types.TenantMemberStatusActive)).Count(&shared).Error; err != nil {
			return err
		}
		if shared > 0 {
			return fmt.Errorf("%w: personal workspace has active members", ErrAccountErasureInvalidTarget)
		}
	}
	if present["organizations"] {
		var owned int64
		if err := tx.Unscoped().Table("organizations").Where("owner_id = ? AND deleted_at IS NULL", userID).Count(&owned).Error; err != nil {
			return err
		}
		if owned > 0 {
			return fmt.Errorf("%w: user still owns an active organization", ErrAccountErasureInvalidTarget)
		}
	}
	return nil
}

func accountErasurePurgeRows(tx *gorm.DB, present map[string]bool, target *types.AccountErasureTarget) error {
	tenantID, userID := target.TenantID, target.UserID
	// Leaf rows and provider credentials first. Each statement is guarded by
	// table presence so the SQLite test database may intentionally omit a
	// feature table; PostgreSQL never silently skips a current table because
	// accountErasureEnsureTables already failed closed above.
	if present["resource_access_grants"] && present["resources"] {
		if err := tx.Exec("DELETE FROM resource_access_grants WHERE resource_id IN (SELECT id FROM resources WHERE tenant_id = ?)", tenantID).Error; err != nil {
			return err
		}
	}
	if present["resource_bindings"] {
		query := "DELETE FROM resource_bindings WHERE tenant_id = ?"
		args := []interface{}{tenantID}
		if present["resources"] {
			query += " OR resource_id IN (SELECT id FROM resources WHERE tenant_id = ?)"
			args = append(args, tenantID)
		}
		if err := tx.Exec(query, args...).Error; err != nil {
			return err
		}
	}
	if present["resources"] {
		if err := tx.Exec("DELETE FROM resources WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	if present["message_suggestion_events"] {
		if err := tx.Exec("DELETE FROM message_suggestion_events WHERE tenant_id = ? OR actor_id = ?", tenantID, userID).Error; err != nil {
			return err
		}
	}
	if present["message_suggestion_sets"] {
		if err := tx.Exec("DELETE FROM message_suggestion_sets WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "message_suggestion_sets", "agent_tenant_id") {
			if err := tx.Exec("UPDATE message_suggestion_sets SET agent_id = '', agent_tenant_id = 0 WHERE agent_tenant_id = ?", tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["mcp_tool_approvals"] {
		if err := tx.Exec("DELETE FROM mcp_tool_approvals WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["mcp_oauth_clients"] {
		if err := tx.Exec("DELETE FROM mcp_oauth_clients WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["mcp_oauth_tokens"] {
		query := "DELETE FROM mcp_oauth_tokens WHERE tenant_id = ? OR user_id = ?"
		args := []interface{}{tenantID, userID}
		if accountErasureHasColumn(tx, "mcp_oauth_tokens", "principal_id") {
			query += " OR principal_id = ?"
			args = append(args, userID)
		}
		if err := tx.Exec(query, args...).Error; err != nil {
			return err
		}
	}
	if present["mcp_services"] {
		if err := tx.Exec("DELETE FROM mcp_services WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	if present["sync_logs"] {
		if err := tx.Exec("DELETE FROM sync_logs WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["data_sources"] {
		if err := tx.Exec("DELETE FROM data_sources WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	// Knowledge processing artifacts have no tenant_id; scope them through
	// the personal tenant's KB/document IDs before deleting those parents.
	if present["knowledge_processing_spans"] && present["knowledges"] {
		if err := tx.Exec("DELETE FROM knowledge_processing_spans WHERE knowledge_id IN (SELECT id FROM knowledges WHERE tenant_id = ?)", tenantID).Error; err != nil {
			return err
		}
	}
	if present["embeddings"] && present["knowledges"] && present["knowledge_bases"] {
		if err := tx.Exec("DELETE FROM embeddings WHERE knowledge_id IN (SELECT id FROM knowledges WHERE tenant_id = ?) OR knowledge_base_id IN (SELECT id FROM knowledge_bases WHERE tenant_id = ?)", tenantID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["chunk_revisions"] {
		if err := tx.Exec("DELETE FROM chunk_revisions WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "chunk_revisions", "editor_id") {
			if err := tx.Exec("UPDATE chunk_revisions SET editor_id = '' WHERE editor_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["knowledge_tag_relations"] && present["knowledges"] {
		if err := tx.Exec("DELETE FROM knowledge_tag_relations WHERE knowledge_id IN (SELECT id FROM knowledges WHERE tenant_id = ?)", tenantID).Error; err != nil {
			return err
		}
	}
	if present["knowledge_tags"] {
		if err := tx.Exec("DELETE FROM knowledge_tags WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["chunks"] {
		if err := tx.Exec("DELETE FROM chunks WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "chunks", "last_editor_id") {
			if err := tx.Exec("UPDATE chunks SET last_editor_id = '' WHERE last_editor_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["knowledges"] {
		if err := tx.Exec("DELETE FROM knowledges WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["wiki_page_revisions"] {
		if err := tx.Exec("DELETE FROM wiki_page_revisions WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "wiki_page_revisions", "editor_id") {
			if err := tx.Exec("UPDATE wiki_page_revisions SET editor_id = '' WHERE editor_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["wiki_page_issues"] {
		if err := tx.Exec("DELETE FROM wiki_page_issues WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["wiki_folders"] {
		if err := tx.Exec("DELETE FROM wiki_folders WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["wiki_pages"] {
		if err := tx.Exec("DELETE FROM wiki_pages WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "wiki_pages", "last_editor_id") {
			if err := tx.Exec("UPDATE wiki_pages SET last_editor_id = '' WHERE last_editor_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["wiki_log_entries"] {
		if err := tx.Exec("DELETE FROM wiki_log_entries WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["knowledge_bases"] {
		if accountErasureHasColumn(tx, "knowledge_bases", "creator_id") {
			if err := tx.Exec("UPDATE knowledge_bases SET creator_id = NULL WHERE creator_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
		if err := tx.Exec("DELETE FROM knowledge_bases WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	// Memory is tenant-scoped product data. Remove vector/affinity and
	// tombstone/stat rows before the subjects/items they describe so a retry
	// cannot leave any personal-memory residue behind.
	if present["memory_item_embeddings"] {
		if err := tx.Exec("DELETE FROM memory_item_embeddings WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["memory_doc_affinity"] {
		if err := tx.Exec("DELETE FROM memory_doc_affinity WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["memory_tombstones"] {
		if err := tx.Exec("DELETE FROM memory_tombstones WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["memory_topic_stats"] {
		if err := tx.Exec("DELETE FROM memory_topic_stats WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["memory_items"] {
		if err := tx.Exec("DELETE FROM memory_items WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["memory_subjects"] {
		if err := tx.Exec("DELETE FROM memory_subjects WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	if present["im_channel_sessions"] {
		// im_channel_sessions.user_id is an external platform coordinate, not
		// the local WeKnora user ID. Scope deletion by the owned tenant only so
		// an accidental string collision cannot remove another workspace's IM
		// session.
		if err := tx.Exec("DELETE FROM im_channel_sessions WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["messages"] && present["sessions"] {
		if err := tx.Exec("DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE tenant_id = ? OR user_id = ?)", tenantID, userID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "messages", "agent_tenant_id") {
			if err := tx.Exec("UPDATE messages SET agent_id = '', agent_tenant_id = 0 WHERE agent_tenant_id = ?", tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["temporary_documents"] {
		if err := tx.Exec("DELETE FROM temporary_documents WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["sessions"] {
		if err := tx.Exec("DELETE FROM sessions WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		// A user's private session in somebody else's tenant is not shared
		// workspace state; detach it before deleting the identity.
		if accountErasureHasColumn(tx, "sessions", "user_id") {
			if err := tx.Exec("UPDATE sessions SET user_id = '' WHERE user_id = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}

	if present["im_channels"] {
		if err := tx.Exec("DELETE FROM im_channels WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["embed_channels"] {
		if err := tx.Exec("DELETE FROM embed_channels WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["custom_agents"] {
		if err := tx.Exec("DELETE FROM custom_agents WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "custom_agents", "created_by") {
			if err := tx.Exec("UPDATE custom_agents SET created_by = NULL WHERE created_by = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
				return err
			}
		}
	}
	if present["tenant_disabled_shared_agents"] {
		if err := tx.Exec("DELETE FROM tenant_disabled_shared_agents WHERE tenant_id = ? OR source_tenant_id = ?", tenantID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["vector_stores"] {
		if err := tx.Exec("DELETE FROM vector_stores WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["storage_backends"] {
		if err := tx.Exec("DELETE FROM storage_backends WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["web_search_providers"] {
		if err := tx.Exec("DELETE FROM web_search_providers WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["models"] {
		if err := tx.Exec("DELETE FROM models WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	if present["kb_shares"] {
		if err := tx.Exec("DELETE FROM kb_shares WHERE source_tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if err := tx.Exec("UPDATE kb_shares SET shared_by_user_id = '' WHERE shared_by_user_id = ?", userID).Error; err != nil {
			return err
		}
	}
	if present["agent_shares"] {
		if err := tx.Exec("DELETE FROM agent_shares WHERE source_tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if err := tx.Exec("UPDATE agent_shares SET shared_by_user_id = '' WHERE shared_by_user_id = ?", userID).Error; err != nil {
			return err
		}
	}
	if present["organization_join_requests"] {
		if err := tx.Exec("DELETE FROM organization_join_requests WHERE tenant_id = ? OR user_id = ?", tenantID, userID).Error; err != nil {
			return err
		}
		if err := tx.Exec("UPDATE organization_join_requests SET reviewed_by = NULL WHERE reviewed_by = ?", userID).Error; err != nil {
			return err
		}
	}
	if present["organization_members"] {
		if err := tx.Exec("DELETE FROM organization_members WHERE user_id = ? OR tenant_id = ?", userID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["organization_members_pre_plan3"] {
		if err := tx.Exec("DELETE FROM organization_members_pre_plan3 WHERE user_id = ? OR tenant_id = ?", userID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["organization_tenant_members"] {
		if err := tx.Exec("DELETE FROM organization_tenant_members WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		if accountErasureHasColumn(tx, "organization_tenant_members", "representative_user_id") {
			if err := tx.Exec("UPDATE organization_tenant_members SET representative_user_id = '' WHERE representative_user_id = ?", userID).Error; err != nil {
				return err
			}
		}
	}
	// Soft-deleted organizations are retained for the security/audit window,
	// but their non-null owner coordinate must not keep a deleted identity
	// addressable. Active organizations are rejected by the safety guard above.
	if present["organizations"] && accountErasureHasColumn(tx, "organizations", "owner_id") {
		if err := tx.Exec("UPDATE organizations SET owner_id = '', owner_tenant_id = 0 WHERE owner_id = ? AND deleted_at IS NOT NULL", userID).Error; err != nil {
			return err
		}
	}

	if present["tenant_invitations"] {
		if err := tx.Exec("DELETE FROM tenant_invitations WHERE tenant_id = ? OR invitee_user_id = ? OR invited_by = ?", tenantID, userID, userID).Error; err != nil {
			return err
		}
	}
	if present["tenant_api_keys"] {
		if err := tx.Exec("DELETE FROM tenant_api_keys WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["task_pending_ops"] {
		if err := tx.Exec("DELETE FROM task_pending_ops WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["task_dead_letters"] {
		if err := tx.Exec("DELETE FROM task_dead_letters WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
		// Account-erasure tasks intentionally carry only an opaque user ID and
		// therefore have tenant_id=0 in the generic dead-letter middleware.
		// Remove the target's archived payload explicitly; unrelated users and
		// unrelated task types remain available to operators.
		var rows []struct {
			ID      int64  `gorm:"column:id"`
			Payload []byte `gorm:"column:payload"`
		}
		if err := tx.Table("task_dead_letters").
			Select("id", "payload").
			Where("task_type = ?", types.TypeAccountErasure).
			Scan(&rows).Error; err != nil {
			return err
		}
		for _, row := range rows {
			var payload types.AccountErasureTaskPayload
			if json.Unmarshal(row.Payload, &payload) != nil || strings.TrimSpace(payload.UserID) != userID {
				continue
			}
			if err := tx.Exec("DELETE FROM task_dead_letters WHERE id = ?", row.ID).Error; err != nil {
				return err
			}
		}
	}

	// Audit rows are retained for security/accountability obligations but are
	// detached from the erased tenant and all user coordinates. Details are
	// reset wholesale, avoiding accidental PII retained in arbitrary JSON.
	if present["audit_logs"] {
		sets := []string{
			"tenant_id = 0",
			"actor_user_id = ''",
			"target_user_id = ''",
			"target_id = ''",
			"scope_id = ''",
			"details = '{}'",
		}
		// These descriptive fields may carry a username, tenant slug, or other
		// account-derived coordinate. Keep only the action, outcome and
		// timestamp needed for the bounded security-retention purpose.
		for _, column := range []string{"actor_role", "target_type", "scope_type", "request_path", "request_method"} {
			if accountErasureHasColumn(tx, "audit_logs", column) {
				sets = append(sets, column+" = ''")
			}
		}
		if err := tx.Exec("UPDATE audit_logs SET "+strings.Join(sets, ", ")+" WHERE tenant_id = ? OR actor_user_id = ? OR target_user_id = ?", tenantID, userID, userID).Error; err != nil {
			return err
		}
	}
	// Paddle billing operations are retained as minimized financial/audit
	// records, but all provider/account coordinates and payloads are removed.
	if present["paddle_billing_operations"] {
		sets := []string{
			"tenant_id = 0",
			"operation_key = 'redacted-' || CAST(id AS TEXT)",
			"request_fingerprint = ''",
			"plan = ''",
			"billing_period = ''",
			"price_id = ''",
			"subscription_id = ''",
			"result_json = '{}'",
			"last_error = ''",
		}
		if accountErasureHasColumn(tx, "paddle_billing_operations", "paddle_transaction_id") {
			sets = append(sets, "paddle_transaction_id = ''")
		}
		if err := tx.Exec("UPDATE paddle_billing_operations SET "+strings.Join(sets, ", ")+" WHERE tenant_id = ?", tenantID).Error; err != nil {
			return err
		}
	}

	if present["marketplace_products"] {
		// Reviewed platform copies belong to the platform. Detach the original
		// creator and their private submission without deleting purchased access.
		if err := tx.Model(&types.MarketplaceProduct{}).
			Where("creator_tenant_id = ? OR creator_user_id = ?", tenantID, userID).
			Updates(map[string]interface{}{
				"creator_tenant_id": 0, "creator_user_id": "", "creator_name": "",
				"contact": "", "authorization": "", "agent_id": "",
				"knowledge_base_ids": "[]", "knowledge_base_names": "[]", "review_note": "",
			}).Error; err != nil {
			return err
		}
	}
	if present["marketplace_transactions"] {
		if err := tx.Table("marketplace_transactions").Where("tenant_id = ?", tenantID).
			Update("tenant_id", 0).Error; err != nil {
			return err
		}
	}
	if present["marketplace_subscriptions"] {
		if err := tx.Table("marketplace_subscriptions").Where("tenant_id = ? OR user_id = ?", tenantID, userID).
			Updates(map[string]interface{}{
				"tenant_id": 0, "user_id": "", "operation_key": gorm.Expr("'redacted-' || id"),
				"status": "canceled", "paid_through": nil, "cancel_at_period_end": false, "scheduled_change_at": nil,
				"paddle_customer_id": "", "paddle_subscription_id": "", "checkout_transaction_id": "", "last_error": "",
			}).Error; err != nil {
			return err
		}
	}

	if present["user_resource_favorites"] {
		if err := tx.Exec("DELETE FROM user_resource_favorites WHERE user_id = ? OR tenant_id = ?", userID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["user_kb_pins"] {
		if err := tx.Exec("DELETE FROM user_kb_pins WHERE user_id = ? OR tenant_id = ?", userID, tenantID).Error; err != nil {
			return err
		}
	}
	// Last local relationship rows, then the personal tenant and identity.
	if present["tenant_members"] {
		if err := tx.Exec("UPDATE tenant_members SET invited_by = NULL WHERE invited_by = ? AND tenant_id <> ?", userID, tenantID).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM tenant_members WHERE user_id = ? OR tenant_id = ?", userID, tenantID).Error; err != nil {
			return err
		}
	}
	if present["auth_tokens"] {
		if err := tx.Exec("DELETE FROM auth_tokens WHERE user_id = ?", userID).Error; err != nil {
			return err
		}
	}
	if present["tenants"] {
		if err := tx.Exec("DELETE FROM tenants WHERE id = ?", tenantID).Error; err != nil {
			return err
		}
	}
	if present["users"] {
		if err := tx.Unscoped().Table("users").Where("id = ?", userID).Delete(nil).Error; err != nil {
			return err
		}
	}
	return nil
}

// accountErasureEnsureTables performs schema checks before a mutation. SQLite
// is intentionally permissive for feature tables because focused repository
// unit tests often migrate only the rows under test. PostgreSQL/MySQL fail
// closed except for the explicitly conditional/legacy tables documented above.
func accountErasureEnsureTables(db *gorm.DB, operation string, tables []string) (map[string]bool, error) {
	present := make(map[string]bool, len(tables))
	for _, table := range tables {
		if accountErasureHasTable(db, table) {
			present[table] = true
			continue
		}
		if db.Dialector.Name() == "sqlite" {
			continue
		}
		if _, optional := accountErasureConditionalTables[table]; optional {
			continue
		}
		return nil, fmt.Errorf("%w during %s: missing table %q", ErrAccountErasureSchemaIncomplete, operation, table)
	}
	return present, nil
}

func accountErasureRequireColumns(db *gorm.DB, table string, columns ...string) error {
	for _, column := range columns {
		if !accountErasureHasColumn(db, table, column) {
			return fmt.Errorf("%w: missing column %s.%s", ErrAccountErasureSchemaIncomplete, table, column)
		}
	}
	return nil
}

func accountErasureHasTable(db *gorm.DB, table string) bool {
	return db.Migrator().HasTable(table)
}

func accountErasureHasColumn(db *gorm.DB, table, column string) bool {
	return db.Migrator().HasColumn(table, column)
}
