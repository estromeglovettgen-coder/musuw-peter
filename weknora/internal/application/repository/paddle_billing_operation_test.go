package repository

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var paddleBillingOperationTestDBSequence atomic.Uint64

func setupPaddleBillingOperationDB(t *testing.T) (*gorm.DB, interfaces.PaddleBillingOperationRepository) {
	t.Helper()
	dsn := fmt.Sprintf("file:paddle_billing_operation_%d?mode=memory&cache=shared", paddleBillingOperationTestDBSequence.Add(1))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	// SQLite has one writer. Keeping one connection makes the concurrent
	// claim tests exercise the repository's transaction/unique-index contract
	// without turning SQLITE_BUSY into a test of the driver pool.
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	require.NoError(t, db.AutoMigrate(&types.PaddleBillingOperation{}))
	require.NoError(t, db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS ux_paddle_billing_operations_active_tenant
		ON paddle_billing_operations (tenant_id)
		WHERE status IN ('pending', 'in_flight', 'uncertain')
	`).Error)
	return db, NewPaddleBillingOperationRepository(db)
}

func paddleBillingIntent(tenantID uint64, key string) types.PaddleBillingOperationIntent {
	return types.PaddleBillingOperationIntent{
		TenantID:           tenantID,
		OperationKey:       key,
		OperationType:      types.PaddleBillingOperationUpgrade,
		RequestFingerprint: "fingerprint-" + key,
		Plan:               types.ConsumerPlanPro,
		BillingPeriod:      "monthly",
		PriceID:            "pri_pro_monthly",
		SubscriptionID:     "sub_owned",
	}
}

func paddleCheckoutIntent(tenantID uint64, key string) types.PaddleBillingOperationIntent {
	return types.PaddleBillingOperationIntent{
		TenantID:           tenantID,
		OperationKey:       key,
		OperationType:      types.PaddleBillingOperationCheckout,
		RequestFingerprint: "fingerprint-" + key,
		Plan:               types.ConsumerPlanPlus,
		BillingPeriod:      "monthly",
		PriceID:            "pri_plus_monthly",
	}
}

func TestPaddleBillingOperationClaimAllowsOneActiveOperationPerTenant(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()

	first, disposition, err := repo.Claim(ctx, paddleBillingIntent(7, "checkout-1"))
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimCreated, disposition)
	require.NotNil(t, first)

	second, disposition, err := repo.Claim(ctx, paddleBillingIntent(7, "checkout-2"))
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimActive, disposition)
	require.NotNil(t, second)
	assert.Equal(t, first.ID, second.ID)

	var count int64
	require.NoError(t, db.Model(&types.PaddleBillingOperation{}).Where("tenant_id = ?", 7).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestPaddleBillingOperationDuplicateKeyReusesProviderIntentAndResult(t *testing.T) {
	_, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	intent := paddleBillingIntent(7, "upgrade-1")

	created, disposition, err := repo.Claim(ctx, intent)
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimCreated, disposition)
	started, err := repo.MarkInFlight(ctx, created.ID)
	require.NoError(t, err)
	require.True(t, started)
	providerAccepted, disposition, err := repo.Claim(ctx, intent)
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimExisting, disposition)
	assert.Equal(t, types.PaddleBillingOperationInFlight, providerAccepted.Status, "provider acceptance is not entitlement success")
	require.NoError(t, repo.Finish(ctx, created.ID, types.PaddleBillingOperationSucceeded, `{"redirect":"/pay"}`, ""))

	replayed, disposition, err := repo.Claim(ctx, intent)
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimExisting, disposition)
	require.NotNil(t, replayed)
	assert.Equal(t, created.ID, replayed.ID)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, replayed.Status)
	assert.JSONEq(t, `{"redirect":"/pay"}`, replayed.Result)

	found, ok, err := repo.FindByKey(ctx, intent.TenantID, intent.OperationKey)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, created.ID, found.ID)
	_, ok, err = repo.FindByKey(ctx, intent.TenantID, "missing-operation")
	require.NoError(t, err)
	assert.False(t, ok)

	conflicting := intent
	conflicting.PriceID = "pri_other"
	_, _, err = repo.Claim(ctx, conflicting)
	assert.ErrorIs(t, err, ErrPaddleBillingOperationKeyConflict)
}

func TestPaddleBillingOperationTerminalStatesReleaseTenantSlot(t *testing.T) {
	_, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()

	completed, _, err := repo.Claim(ctx, paddleBillingIntent(7, "checkout-complete"))
	require.NoError(t, err)
	require.NoError(t, repo.Finish(ctx, completed.ID, types.PaddleBillingOperationSucceeded, `{}`, ""))
	_, disposition, err := repo.Claim(ctx, paddleBillingIntent(7, "checkout-after-complete"))
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimCreated, disposition)

	failed, _, err := repo.Claim(ctx, paddleBillingIntent(8, "checkout-failed"))
	require.NoError(t, err)
	require.NoError(t, repo.Finish(ctx, failed.ID, types.PaddleBillingOperationFailed, `{}`, "provider rejected"))
	_, disposition, err = repo.Claim(ctx, paddleBillingIntent(8, "checkout-after-failed"))
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimCreated, disposition)

	uncertain, _, err := repo.Claim(ctx, paddleBillingIntent(9, "checkout-uncertain"))
	require.NoError(t, err)
	require.NoError(t, repo.Finish(ctx, uncertain.ID, types.PaddleBillingOperationUncertain, `{}`, "network timeout"))
	_, disposition, err = repo.Claim(ctx, paddleBillingIntent(9, "checkout-after-uncertain"))
	require.NoError(t, err)
	assert.Equal(t, types.PaddleBillingOperationClaimActive, disposition)
}

func TestPaddleBillingOperationRecordsOneCheckoutTransaction(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	checkout, disposition, err := repo.Claim(ctx, paddleCheckoutIntent(7, "checkout-transaction"))
	require.NoError(t, err)
	require.Equal(t, types.PaddleBillingOperationClaimCreated, disposition)
	started, err := repo.MarkInFlight(ctx, checkout.ID)
	require.NoError(t, err)
	require.True(t, started)
	require.NoError(t, repo.RecordPaddleTransaction(ctx, checkout.ID, "txn_provider_owned"))
	require.NoError(t, repo.RecordPaddleTransaction(ctx, checkout.ID, "txn_provider_owned"), "same transaction replay is idempotent")

	var stored types.PaddleBillingOperation
	require.NoError(t, db.First(&stored, checkout.ID).Error)
	assert.Equal(t, "txn_provider_owned", stored.PaddleTransactionID)
	assert.ErrorIs(t, repo.RecordPaddleTransaction(ctx, checkout.ID, "txn_other"), ErrPaddleBillingOperationInvalidTransition)

	matched, err := repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationCheckout, checkout.OperationKey, checkout.PriceID, "txn_other", "sub_created", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.False(t, matched)
	matched, err = repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationCheckout, checkout.OperationKey, checkout.PriceID, "txn_provider_owned", "sub_created", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.True(t, matched)
	matched, err = repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationCheckout, checkout.OperationKey, checkout.PriceID, "txn_provider_owned", "sub_created", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.True(t, matched, "terminal webhook replay is idempotently settled")
	require.NoError(t, db.First(&stored, checkout.ID).Error)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, stored.Status)
	assert.NoError(t, repo.RecordPaddleTransaction(ctx, checkout.ID, "txn_provider_owned"), "HTTP persistence replay after webhook success is idempotent")

	webhookFirst, _, err := repo.Claim(ctx, paddleCheckoutIntent(7, "checkout-webhook-first"))
	require.NoError(t, err)
	started, err = repo.MarkInFlight(ctx, webhookFirst.ID)
	require.NoError(t, err)
	assert.True(t, started)
	matched, err = repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationCheckout, webhookFirst.OperationKey, webhookFirst.PriceID, "txn_webhook_first", "sub_webhook_first", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.True(t, matched)
	require.NoError(t, repo.RecordPaddleTransaction(ctx, webhookFirst.ID, "txn_webhook_first"), "late HTTP persistence must accept the transaction already bound by the signed webhook")
}

func TestPaddleBillingOperationFailPendingWithoutProviderWriteIsAtomic(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()

	pending, _, err := repo.Claim(ctx, paddleCheckoutIntent(7, "checkout-pending-release"))
	require.NoError(t, err)
	released, err := repo.FailPendingWithoutProviderWrite(ctx, pending.ID, "selection changed")
	require.NoError(t, err)
	assert.True(t, released)
	var stored types.PaddleBillingOperation
	require.NoError(t, db.First(&stored, pending.ID).Error)
	assert.Equal(t, types.PaddleBillingOperationFailed, stored.Status)
	assert.Equal(t, "selection changed", stored.LastError)

	bound, _, err := repo.Claim(ctx, paddleCheckoutIntent(8, "checkout-bound-release"))
	require.NoError(t, err)
	started, err := repo.MarkInFlight(ctx, bound.ID)
	require.NoError(t, err)
	assert.True(t, started)
	require.NoError(t, repo.RecordPaddleTransaction(ctx, bound.ID, "txn_bound"))
	released, err = repo.FailPendingWithoutProviderWrite(ctx, bound.ID, "selection changed")
	require.NoError(t, err)
	assert.False(t, released, "a provider-bound operation must never be released by the pending CAS")
	stored = types.PaddleBillingOperation{}
	require.NoError(t, db.First(&stored, bound.ID).Error)
	assert.Equal(t, types.PaddleBillingOperationInFlight, stored.Status)
}

func TestPaddleBillingOperationBindsSignedTransactionWhenPersistenceWasUncertain(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	checkout, _, err := repo.Claim(ctx, paddleCheckoutIntent(17, "checkout-signed-recovery"))
	require.NoError(t, err)
	_, err = repo.MarkInFlight(ctx, checkout.ID)
	require.NoError(t, err)
	require.NoError(t, repo.Finish(ctx, checkout.ID, types.PaddleBillingOperationUncertain, `{}`, "transaction response was not persisted"))

	matched, err := repo.FinishMatchingActive(ctx, 17, types.PaddleBillingOperationCheckout, checkout.OperationKey, checkout.PriceID, "txn_signed_created", "sub_signed_created", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.True(t, matched)

	var stored types.PaddleBillingOperation
	require.NoError(t, db.First(&stored, checkout.ID).Error)
	assert.Equal(t, "txn_signed_created", stored.PaddleTransactionID)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, stored.Status)
}

func TestPaddleBillingOperationDoesNotBindCheckoutBeforeProviderWriteStarts(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	checkout, _, err := repo.Claim(ctx, paddleCheckoutIntent(18, "checkout-still-pending"))
	require.NoError(t, err)

	matched, err := repo.FinishMatchingActive(
		ctx, 18, types.PaddleBillingOperationCheckout, checkout.OperationKey, checkout.PriceID,
		"txn_unrelated", "sub_unrelated", types.PaddleBillingOperationSucceeded, `{}`, "",
	)
	require.NoError(t, err)
	assert.False(t, matched)
	var stored types.PaddleBillingOperation
	require.NoError(t, db.First(&stored, checkout.ID).Error)
	assert.Equal(t, types.PaddleBillingOperationPending, stored.Status)
	assert.Empty(t, stored.PaddleTransactionID)
}

func TestPaddleBillingOperationConcurrentSameKeyConverges(t *testing.T) {
	_, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	intent := paddleBillingIntent(7, "concurrent-checkout")

	const callers = 12
	results := make(chan struct {
		op          *types.PaddleBillingOperation
		disposition types.PaddleBillingOperationClaimDisposition
		err         error
	}, callers)
	var wg sync.WaitGroup
	for range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			op, disposition, err := repo.Claim(ctx, intent)
			results <- struct {
				op          *types.PaddleBillingOperation
				disposition types.PaddleBillingOperationClaimDisposition
				err         error
			}{op, disposition, err}
		}()
	}
	wg.Wait()
	close(results)

	var created, existing int
	var id uint64
	for result := range results {
		require.NoError(t, result.err)
		require.NotNil(t, result.op)
		if id == 0 {
			id = result.op.ID
		}
		assert.Equal(t, id, result.op.ID)
		switch result.disposition {
		case types.PaddleBillingOperationClaimCreated:
			created++
		case types.PaddleBillingOperationClaimExisting:
			existing++
		default:
			t.Fatalf("unexpected claim disposition %q", result.disposition)
		}
	}
	assert.Equal(t, 1, created)
	assert.Equal(t, callers-1, existing)
}

func TestPaddleBillingOperationFinishMatchingUpgradeRequiresSubscription(t *testing.T) {
	db, repo := setupPaddleBillingOperationDB(t)
	ctx := context.Background()
	intent := paddleBillingIntent(7, "upgrade-webhook")
	upgrade, _, err := repo.Claim(ctx, intent)
	require.NoError(t, err)

	matched, err := repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationUpgrade, "upgrade-webhook", intent.PriceID, "", "", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.False(t, matched)
	matched, err = repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationUpgrade, "upgrade-webhook", intent.PriceID, "", "sub_other", types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.False(t, matched)
	matched, err = repo.FinishMatchingActive(ctx, 7, types.PaddleBillingOperationUpgrade, "upgrade-webhook", intent.PriceID, "", intent.SubscriptionID, types.PaddleBillingOperationSucceeded, `{}`, "")
	require.NoError(t, err)
	assert.True(t, matched)

	var finished types.PaddleBillingOperation
	require.NoError(t, db.First(&finished, upgrade.ID).Error)
	assert.Equal(t, types.PaddleBillingOperationSucceeded, finished.Status)
}
