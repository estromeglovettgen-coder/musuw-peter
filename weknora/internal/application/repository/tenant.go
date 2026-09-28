package repository

import (
	"context"
	"errors"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrTenantNotFound         = errors.New("tenant not found")
	ErrTenantHasKnowledgeBase = errors.New("tenant has associated knowledge bases")
)

const (
	maxInt64Value = int64(^uint64(0) >> 1)
	minInt64Value = -maxInt64Value - 1
)

// tenantRepository implements tenant repository interface
type tenantRepository struct {
	db *gorm.DB
}

// NewTenantRepository creates a new tenant repository
func NewTenantRepository(db *gorm.DB) interfaces.TenantRepository {
	return &tenantRepository{db: db}
}

// CreateTenant creates tenant
func (r *tenantRepository) CreateTenant(ctx context.Context, tenant *types.Tenant) error {
	return r.db.WithContext(ctx).Create(tenant).Error
}

// GetTenantByID gets tenant by ID
func (r *tenantRepository) GetTenantByID(ctx context.Context, id uint64) (*types.Tenant, error) {
	var tenant types.Tenant
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&tenant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTenantNotFound
		}
		return nil, err
	}
	return &tenant, nil
}

// GetTenantsByIDs batches GetTenantByID with a single IN-list query.
// Returns a map keyed by tenant ID; missing rows are simply absent from
// the map (no error). An empty input slice short-circuits to an empty map
// without hitting the database.
func (r *tenantRepository) GetTenantsByIDs(ctx context.Context, ids []uint64) (map[uint64]*types.Tenant, error) {
	if len(ids) == 0 {
		return map[uint64]*types.Tenant{}, nil
	}
	var tenants []*types.Tenant
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&tenants).Error; err != nil {
		return nil, err
	}
	out := make(map[uint64]*types.Tenant, len(tenants))
	for _, t := range tenants {
		if t != nil {
			out[t.ID] = t
		}
	}
	return out, nil
}

// ListTenants lists all tenants
func (r *tenantRepository) ListTenants(ctx context.Context) ([]*types.Tenant, error) {
	var tenants []*types.Tenant
	if err := r.db.WithContext(ctx).Order("created_at DESC").Find(&tenants).Error; err != nil {
		return nil, err
	}
	return tenants, nil
}

// SearchTenants searches tenants with pagination and filters
func (r *tenantRepository) SearchTenants(ctx context.Context, keyword string, tenantID uint64, page, pageSize int) ([]*types.Tenant, int64, error) {
	var tenants []*types.Tenant
	var total int64

	query := r.db.WithContext(ctx).Model(&types.Tenant{})

	// Build search conditions
	if tenantID > 0 && keyword != "" {
		escaped := escapeLikeKeyword(keyword)
		query = query.Where("id = ? OR name LIKE ? OR description LIKE ?", tenantID, "%"+escaped+"%", "%"+escaped+"%")
	} else if tenantID > 0 {
		query = query.Where("id = ?", tenantID)
	} else if keyword != "" {
		escaped := escapeLikeKeyword(keyword)
		query = query.Where("name LIKE ? OR description LIKE ?", "%"+escaped+"%", "%"+escaped+"%")
	}

	// Count total
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Apply pagination
	if page > 0 && pageSize > 0 {
		offset := (page - 1) * pageSize
		query = query.Offset(offset).Limit(pageSize)
	}

	// Order by created_at DESC
	query = query.Order("created_at DESC")

	// Execute query
	if err := query.Find(&tenants).Error; err != nil {
		return nil, 0, err
	}

	return tenants, total, nil
}

// UpdateTenant updates tenant.
func (r *tenantRepository) UpdateTenant(ctx context.Context, tenant *types.Tenant) error {
	return r.db.WithContext(ctx).Model(&types.Tenant{}).Where("id = ?", tenant.ID).Updates(tenant).Error
}

// DeleteTenant soft-deletes the tenant and every active membership row
// for that tenant in one transaction. Without the membership purge,
// /auth/me still lists the defunct tenant (name lookup fails → UI shows
// "#<id>").
func (r *tenantRepository) DeleteTenant(ctx context.Context, id uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id = ?", id).Delete(&types.TenantMember{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", id).Delete(&types.Tenant{}).Error
	})
}

func (r *tenantRepository) AdjustStorageUsed(ctx context.Context, tenantID uint64, delta int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		tenant, err := lockTenantForStorage(tx, tenantID)
		if err != nil {
			return err
		}
		return applyLockedStorageDelta(ctx, tx, tenant, delta)
	})
}

// lockTenantForStorage is the single tenant-first serialization point shared
// by the legacy adjustment method and paired knowledge mutations. PostgreSQL
// takes a row lock; SQLite ignores FOR UPDATE but still runs the caller in the
// surrounding transaction.
func lockTenantForStorage(tx *gorm.DB, tenantID uint64) (*types.Tenant, error) {
	var tenant types.Tenant
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", tenantID).First(&tenant).Error; err != nil {
		return nil, err
	}
	return &tenant, nil
}

// applyLockedStorageDelta applies a delta after the caller has locked the
// tenant row. It deliberately preserves AdjustStorageUsed's legacy behavior:
// negative results are logged and clamped to zero. Positive overflow is
// saturated so a malformed legacy delta cannot wrap the aggregate negative.
func applyLockedStorageDelta(ctx context.Context, tx *gorm.DB, tenant *types.Tenant, delta int64) error {
	if tenant == nil {
		return ErrTenantNotFound
	}
	next := tenant.StorageUsed
	switch {
	case delta > 0:
		if next > maxInt64Value-delta {
			next = maxInt64Value
		} else {
			next += delta
		}
	case delta < 0:
		// Avoid negating MinInt64. Any non-negative usage plus that delta is
		// below zero and therefore clamps; for a negative legacy value the
		// same clamp is also the only safe result.
		if delta == minInt64Value || next < -delta {
			next = 0
		} else {
			next += delta
		}
	}
	if next < 0 {
		logger.Errorf(ctx, "tenant storage used is negative %d: %d", tenant.ID, next)
		next = 0
	}
	tenant.StorageUsed = next
	return tx.Save(tenant).Error
}

// ensureStorageQuota allows a non-positive effective quota to mean unlimited
// and otherwise rejects only a positive delta whose next usage exceeds the
// quota. Using subtraction avoids overflow and makes next == quota valid.
func ensureStorageQuota(tenant *types.Tenant, delta, effectiveQuota int64) error {
	if tenant == nil || delta <= 0 || effectiveQuota <= 0 {
		return nil
	}
	used := tenant.StorageUsed
	if used < 0 {
		used = 0
	}
	if delta > effectiveQuota || used > effectiveQuota-delta {
		return types.NewStorageQuotaExceededError()
	}
	return nil
}

// BulkSetStorageQuota writes quotaBytes to storage_quota for every
// tenant in one statement. We don't WHERE-filter (the action is
// "apply globally"), so the affected count equals the row count of
// the tenants table.
//
// No transaction here: the operation is a single statement and we
// don't want to hold a long lock just to update a single column. If
// a concurrent CreateTenant lands in the middle, the new row gets
// the new default via the system-setting resolver in the handler —
// no risk of the new tenant being skipped.
func (r *tenantRepository) BulkSetStorageQuota(ctx context.Context, quotaBytes int64) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&types.Tenant{}).
		Where("1 = 1"). // GORM refuses unconditional UPDATEs without an explicit WHERE
		Update("storage_quota", quotaBytes)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}
