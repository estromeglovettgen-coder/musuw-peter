package types

import "time"

// PaddleBillingOperationStatus is the durable state of a server-owned Paddle
// checkout or subscription-update intent. Pending/in_flight/uncertain occupy
// the tenant's single active billing-operation slot; terminal states release
// it. The provider call must happen after the claim transaction commits.
type PaddleBillingOperationStatus string

const (
	PaddleBillingOperationPending   PaddleBillingOperationStatus = "pending"
	PaddleBillingOperationInFlight  PaddleBillingOperationStatus = "in_flight"
	PaddleBillingOperationSucceeded PaddleBillingOperationStatus = "succeeded"
	PaddleBillingOperationFailed    PaddleBillingOperationStatus = "failed"
	PaddleBillingOperationUncertain PaddleBillingOperationStatus = "uncertain"
)

// PaddleBillingOperationType identifies the provider intent. It is persisted
// so a replayed operation can never silently change from checkout to upgrade.
type PaddleBillingOperationType string

const (
	PaddleBillingOperationCheckout PaddleBillingOperationType = "checkout"
	PaddleBillingOperationUpgrade  PaddleBillingOperationType = "upgrade"
)

// PaddleBillingOperationClaimDisposition tells the caller why Claim returned
// its row. Existing means the operation_key already owns the same intent and
// its provider ID/result can be reused. Active means another key currently
// occupies the tenant slot. Created is the only disposition that authorizes a
// caller to begin the provider request.
type PaddleBillingOperationClaimDisposition string

const (
	PaddleBillingOperationClaimCreated  PaddleBillingOperationClaimDisposition = "created"
	PaddleBillingOperationClaimExisting PaddleBillingOperationClaimDisposition = "existing"
	PaddleBillingOperationClaimActive   PaddleBillingOperationClaimDisposition = "active"
)

// PaddleBillingOperationIntent contains the immutable request identity used
// by Claim. RequestFingerprint should be a server-derived canonical hash of
// the requested plan/period/price/subscription; it prevents a reused key from
// changing the provider operation while remaining independent of Paddle's API.
type PaddleBillingOperationIntent struct {
	TenantID           uint64
	OperationKey       string
	OperationType      PaddleBillingOperationType
	RequestFingerprint string
	Plan               ConsumerPlan
	BillingPeriod      string
	PriceID            string
	SubscriptionID     string
}

// PaddleBillingOperation is the durable record that bridges a local request
// and Paddle's API. PaddleTransactionID is populated only for checkout; Paddle
// still owns payment collection and the signed webhook remains authoritative.
type PaddleBillingOperation struct {
	ID                  uint64                       `json:"id" gorm:"primaryKey;autoIncrement"`
	TenantID            uint64                       `json:"tenant_id" gorm:"not null;index;uniqueIndex:ux_paddle_billing_operations_key"`
	OperationKey        string                       `json:"operation_key" gorm:"type:varchar(128);not null;uniqueIndex:ux_paddle_billing_operations_key"`
	OperationType       PaddleBillingOperationType   `json:"operation_type" gorm:"column:operation_type;type:varchar(32);not null"`
	RequestFingerprint  string                       `json:"-" gorm:"column:request_fingerprint;type:varchar(128);not null;default:''"`
	Plan                ConsumerPlan                 `json:"plan" gorm:"type:varchar(16);not null;default:''"`
	BillingPeriod       string                       `json:"billing_period" gorm:"type:varchar(16);not null;default:''"`
	PriceID             string                       `json:"price_id" gorm:"type:varchar(64);not null;default:''"`
	SubscriptionID      string                       `json:"subscription_id" gorm:"type:varchar(64);not null;default:''"`
	PaddleTransactionID string                       `json:"paddle_transaction_id" gorm:"column:paddle_transaction_id;type:varchar(64);not null;default:''"`
	Status              PaddleBillingOperationStatus `json:"status" gorm:"type:varchar(16);not null;default:'pending';index"`
	Result              string                       `json:"result" gorm:"column:result_json;type:jsonb;not null;default:'{}'"`
	LastError           string                       `json:"last_error" gorm:"column:last_error;type:text;not null;default:''"`
	CreatedAt           time.Time                    `json:"created_at"`
	UpdatedAt           time.Time                    `json:"updated_at"`
	CompletedAt         *time.Time                   `json:"completed_at,omitempty"`
}

// TableName pins the table to the Paddle billing-operation migration.
func (PaddleBillingOperation) TableName() string {
	return "paddle_billing_operations"
}
