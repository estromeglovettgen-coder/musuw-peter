package interfaces

import (
	"context"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/hibiken/asynq"
)

// AccountErasureRepository owns the local, database side of consumer account
// erasure. External provider deletion is intentionally outside this interface;
// callers invoke Purge only after those provider-side resources have been
// removed successfully.
//
// Implementations must keep Fence atomic and make Purge idempotent. Purge is
// ordered so rows with foreign keys are removed before their parents. Rows
// retained for legal, tax, dispute, anti-fraud, or security obligations are
// detached and minimized instead of being presented as active account data.
type AccountErasureRepository interface {
	// Preflight returns a snapshot of the current user and personal-tenant
	// ownership state. It reads soft-deleted tenant rows so a retry can
	// recover after an earlier lifecycle step removed the tenant from normal
	// queries.
	Preflight(ctx context.Context, userID string) (*types.AccountErasureTarget, error)
	// BindIdentity persists a legacy account's uniquely resolved external
	// identity before the deletion fence. It is idempotent for the same pair
	// and fails rather than replacing a different or partial binding.
	BindIdentity(ctx context.Context, userID, provider, subject string) error
	// Fence atomically records the deletion request, disables the user, and
	// revokes all local access/refresh tokens. Repeating Fence is safe and
	// preserves the first request timestamp.
	Fence(ctx context.Context, userID string, requestedAt time.Time) error
	// ListPending returns fenced users for housekeeping recovery, ordered by
	// the persisted request timestamp and bounded by limit (limit <= 0 means
	// the repository default page size).
	ListPending(ctx context.Context, limit int) ([]*types.AccountErasureTarget, error)
	// RemainingActiveKnowledgeCount reports non-soft-deleted knowledge rows in
	// a tenant. It lets the existing knowledge-base cleanup lifecycle finish
	// before final local purge.
	RemainingActiveKnowledgeCount(ctx context.Context, tenantID uint64) (int64, error)
	// ListActiveResourceReferences returns stable resource:// references for
	// every still-active object owned by the personal tenant. The coordinator
	// deletes these through the existing FileService before database rows and
	// storage credentials disappear.
	ListActiveResourceReferences(ctx context.Context, tenantID uint64) ([]string, error)
	// Purge hard-deletes Musuw-controlled rows for target.TenantID and
	// target.UserID, after external resource cleanup has completed. It is
	// idempotent and fails closed on a missing production schema.
	Purge(ctx context.Context, target *types.AccountErasureTarget) error
}

// AccountErasureService is the operations control-plane boundary for managed
// consumer deletion plus its durable worker/recovery hooks. HTTP handlers may
// call only Request; task and housekeeping wiring use Process/RecoverPending.
type AccountErasureService interface {
	Request(ctx context.Context, userID string) error
	Process(ctx context.Context, task *asynq.Task) error
	RecoverPending(ctx context.Context) error
}

// AccountErasureTenantProviderCleaner is the narrow provider-lifecycle seam
// used by account deletion. It removes tenant-scoped external credentials but
// deliberately leaves tenant and membership rows intact so AccountErasureRepository
// can perform its final member/owner safety check and purge atomically.
type AccountErasureTenantProviderCleaner interface {
	DeleteTenantProviderCredentials(ctx context.Context, tenantID uint64) error
}
