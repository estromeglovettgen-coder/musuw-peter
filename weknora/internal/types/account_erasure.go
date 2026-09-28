package types

import "errors"

var ErrAccountErasureIdentityConflict = errors.New("account erasure identity binding conflicts with the stored account")

// AccountErasureTarget is the server-side, provider-neutral snapshot used by
// the account-erasure coordinator. It deliberately contains only the
// coordinates needed to prove eligibility and to address the owner's personal
// tenant. It is never serialized to an authenticated consumer response or
// placed in a queue payload (queue payloads carry only UserID).
//
// Counts are read from active, non-deleted rows during Preflight. The
// coordinator, rather than this data-transfer type, decides whether those
// counts make the account eligible for managed erasure.
type AccountErasureTarget struct {
	UserID               string
	Email                string
	TenantID             uint64
	IdentityProvider     string
	IdentitySubject      string
	PaddleSubscriptionID string
	PaddleCustomerID     string
	MarketplaceBilling   []AccountErasureBillingReference

	OwnerTenantCount       int64
	SharedMemberCount      int64
	OrganizationOwnerCount int64

	IsSystemAdmin     bool
	IsDeletionPending bool
	IsTenantDeleted   bool
}

// AccountErasureBillingReference is internal provider inventory. It never
// leaves the erasure coordinator or becomes part of a queue payload.
type AccountErasureBillingReference struct {
	PaddleCustomerID     string
	PaddleSubscriptionID string
}
