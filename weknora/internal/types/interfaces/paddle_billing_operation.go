package interfaces

import (
	"context"
	"errors"

	"github.com/Tencent/WeKnora/internal/types"
)

var ErrPaddleBillingOperationKeyConflict = errors.New("paddle billing operation key conflicts with an existing intent")

// PaddleBillingOperationRepository persists the minimum retry boundary around
// Paddle checkout creation and subscription update. Paddle has no
// client-supplied idempotency key for either API call.
type PaddleBillingOperationRepository interface {
	// Claim creates one pending operation, or returns the existing same-key
	// operation/result. A different key receives ClaimActive while another
	// pending/in-flight/uncertain operation occupies the tenant slot.
	Claim(ctx context.Context, intent types.PaddleBillingOperationIntent) (*types.PaddleBillingOperation, types.PaddleBillingOperationClaimDisposition, error)
	// FindByKey lets an HTTP retry reuse the provider request already owned by
	// the same authenticated tenant instead of issuing another mutation.
	FindByKey(ctx context.Context, tenantID uint64, operationKey string) (*types.PaddleBillingOperation, bool, error)
	// MarkInFlight atomically advances pending state. The returned bool is true
	// only for the caller that won the transition, so concurrent retries cannot
	// both start a provider write. In-flight/uncertain are never reauthorized.
	MarkInFlight(ctx context.Context, id uint64) (bool, error)
	// FailPendingWithoutProviderWrite atomically releases a pending operation
	// only while no Paddle transaction has been attached. A false result means
	// another caller already advanced it or a provider transaction was bound;
	// callers must not continue with a replacement mutation in that case.
	FailPendingWithoutProviderWrite(ctx context.Context, id uint64, reason string) (bool, error)
	// RecordPaddleTransaction attaches the one provider-created checkout
	// transaction to its already-claimed operation before it is exposed.
	RecordPaddleTransaction(ctx context.Context, id uint64, transactionID string) error
	// Finish stores a terminal or uncertain outcome. Succeeded/failed release
	// the tenant's active slot; uncertain deliberately keeps it occupied.
	Finish(ctx context.Context, id uint64, status types.PaddleBillingOperationStatus, resultJSON, lastError string) error
	// FinishMatchingActive terminalizes the one active operation only when the
	// signed provider event matches its tenant/key/price/provider identity.
	// It returns true when the exact operation was finished or no active row
	// remains (an idempotent terminal replay), and false when another active
	// operation exists but the signed coordinates do not match it.
	FinishMatchingActive(ctx context.Context, tenantID uint64, operationType types.PaddleBillingOperationType, operationKey, priceID, transactionID, subscriptionID string, status types.PaddleBillingOperationStatus, resultJSON, lastError string) (bool, error)
}
