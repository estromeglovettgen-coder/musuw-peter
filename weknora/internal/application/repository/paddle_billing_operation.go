package repository

import (
	"context"
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
	// ErrPaddleBillingOperationKeyConflict means a caller reused an operation
	// key for a different immutable provider intent. The caller must create a
	// new key; silently changing the intent would defeat idempotency.
	ErrPaddleBillingOperationKeyConflict = interfaces.ErrPaddleBillingOperationKeyConflict
	// ErrPaddleBillingOperationInvalidTransition means the row is terminal or
	// otherwise cannot accept the requested state change.
	ErrPaddleBillingOperationInvalidTransition = errors.New("invalid Paddle billing operation state transition")
)

type paddleBillingOperationRepository struct {
	db *gorm.DB
}

// NewPaddleBillingOperationRepository creates the durable adapter for the one
// Paddle mutation that lacks a provider idempotency key: subscription update.
func NewPaddleBillingOperationRepository(db *gorm.DB) interfaces.PaddleBillingOperationRepository {
	return &paddleBillingOperationRepository{db: db}
}

func (r *paddleBillingOperationRepository) Claim(
	ctx context.Context,
	intent types.PaddleBillingOperationIntent,
) (*types.PaddleBillingOperation, types.PaddleBillingOperationClaimDisposition, error) {
	if err := validatePaddleBillingOperationIntent(intent); err != nil {
		return nil, "", err
	}

	var operation *types.PaddleBillingOperation
	var disposition types.PaddleBillingOperationClaimDisposition
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing types.PaddleBillingOperation
		err := tx.Where("tenant_id = ? AND operation_key = ?", intent.TenantID, intent.OperationKey).
			First(&existing).Error
		if err == nil {
			if !samePaddleBillingIntent(existing, intent) {
				return ErrPaddleBillingOperationKeyConflict
			}
			operation = &existing
			disposition = types.PaddleBillingOperationClaimExisting
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		candidate := paddleBillingOperationFromIntent(intent)
		// DO NOTHING keeps the transaction usable when either the composite
		// operation-key index or the partial active-tenant index wins a race.
		// We then inspect the committed winner and return Existing/Active.
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&candidate)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 1 {
			operation = &candidate
			disposition = types.PaddleBillingOperationClaimCreated
			return nil
		}

		if err := tx.Where("tenant_id = ? AND operation_key = ?", intent.TenantID, intent.OperationKey).
			First(&existing).Error; err == nil {
			if !samePaddleBillingIntent(existing, intent) {
				return ErrPaddleBillingOperationKeyConflict
			}
			operation = &existing
			disposition = types.PaddleBillingOperationClaimExisting
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var active types.PaddleBillingOperation
		if err := tx.Where("tenant_id = ? AND status IN ?", intent.TenantID, activePaddleBillingOperationStatuses()).
			Order("id ASC").First(&active).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("paddle billing operation insert was ignored without a conflicting row")
			}
			return err
		}
		operation = &active
		disposition = types.PaddleBillingOperationClaimActive
		return nil
	})
	return operation, disposition, err
}

func (r *paddleBillingOperationRepository) FindByKey(
	ctx context.Context,
	tenantID uint64,
	operationKey string,
) (*types.PaddleBillingOperation, bool, error) {
	operationKey = strings.TrimSpace(operationKey)
	if tenantID == 0 || operationKey == "" {
		return nil, false, nil
	}
	var operation types.PaddleBillingOperation
	if err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND operation_key = ?", tenantID, operationKey).
		First(&operation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &operation, true, nil
}

func (r *paddleBillingOperationRepository) MarkInFlight(ctx context.Context, id uint64) (bool, error) {
	started := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operation types.PaddleBillingOperation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&operation, id).Error; err != nil {
			return err
		}
		switch operation.Status {
		case types.PaddleBillingOperationPending:
			if err := tx.Model(&types.PaddleBillingOperation{}).Where("id = ?", id).
				Updates(map[string]any{
					"status":     types.PaddleBillingOperationInFlight,
					"updated_at": time.Now().UTC(),
				}).Error; err != nil {
				return err
			}
			started = true
			return nil
		case types.PaddleBillingOperationInFlight, types.PaddleBillingOperationUncertain:
			return nil
		default:
			return fmt.Errorf("%w: %s cannot become in_flight", ErrPaddleBillingOperationInvalidTransition, operation.Status)
		}
	})
	return started, err
}

func (r *paddleBillingOperationRepository) FailPendingWithoutProviderWrite(ctx context.Context, id uint64, reason string) (bool, error) {
	released := false
	reason = strings.TrimSpace(reason)
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operation types.PaddleBillingOperation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&operation, id).Error; err != nil {
			return err
		}
		if operation.Status != types.PaddleBillingOperationPending || strings.TrimSpace(operation.PaddleTransactionID) != "" {
			return nil
		}
		now := time.Now().UTC()
		result := tx.Model(&types.PaddleBillingOperation{}).
			Where("id = ? AND status = ? AND paddle_transaction_id = ''", id, types.PaddleBillingOperationPending).
			Updates(map[string]any{
				"status":       types.PaddleBillingOperationFailed,
				"result_json":  "{}",
				"last_error":   reason,
				"completed_at": now,
				"updated_at":   now,
			})
		if result.Error != nil {
			return result.Error
		}
		released = result.RowsAffected == 1
		return nil
	})
	return released, err
}

func (r *paddleBillingOperationRepository) RecordPaddleTransaction(ctx context.Context, id uint64, transactionID string) error {
	transactionID = strings.TrimSpace(transactionID)
	if transactionID == "" {
		return errors.New("Paddle transaction ID is required")
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operation types.PaddleBillingOperation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&operation, id).Error; err != nil {
			return err
		}
		if existing := strings.TrimSpace(operation.PaddleTransactionID); existing != "" {
			if existing == transactionID && operation.Status == types.PaddleBillingOperationSucceeded {
				// The signed subscription event may arrive before the HTTP create
				// response persists its transaction ID. Replaying that response is
				// safe once the exact operation already succeeded.
				return nil
			}
			if existing == transactionID {
				return nil
			}
			return fmt.Errorf("%w: checkout already owns another transaction", ErrPaddleBillingOperationInvalidTransition)
		}
		if operation.OperationType != types.PaddleBillingOperationCheckout ||
			(operation.Status != types.PaddleBillingOperationPending && operation.Status != types.PaddleBillingOperationInFlight &&
				operation.Status != types.PaddleBillingOperationUncertain) {
			return fmt.Errorf("%w: transaction cannot be attached to %s/%s", ErrPaddleBillingOperationInvalidTransition, operation.OperationType, operation.Status)
		}
		return tx.Model(&types.PaddleBillingOperation{}).Where("id = ?", id).Updates(map[string]any{
			"paddle_transaction_id": transactionID,
			"updated_at":            time.Now().UTC(),
		}).Error
	})
}

func (r *paddleBillingOperationRepository) Finish(
	ctx context.Context,
	id uint64,
	status types.PaddleBillingOperationStatus,
	resultJSON, lastError string,
) error {
	resultJSON, lastError, err := preparePaddleBillingOperationFinish(status, resultJSON, lastError)
	if err != nil {
		return err
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var operation types.PaddleBillingOperation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&operation, id).Error; err != nil {
			return err
		}
		return finishPaddleBillingOperation(tx, &operation, status, resultJSON, lastError)
	})
}

func (r *paddleBillingOperationRepository) FinishMatchingActive(
	ctx context.Context,
	tenantID uint64,
	operationType types.PaddleBillingOperationType,
	operationKey, priceID, transactionID, subscriptionID string,
	status types.PaddleBillingOperationStatus,
	resultJSON, lastError string,
) (bool, error) {
	if tenantID == 0 {
		return false, errors.New("paddle billing operation tenant ID is required")
	}
	if operationType != types.PaddleBillingOperationCheckout && operationType != types.PaddleBillingOperationUpgrade {
		return false, fmt.Errorf("unsupported Paddle billing operation type %q", operationType)
	}
	operationKey = strings.TrimSpace(operationKey)
	if operationKey == "" {
		return false, errors.New("paddle billing operation key is required")
	}
	priceID = strings.TrimSpace(priceID)
	if priceID == "" {
		return false, errors.New("paddle billing operation price ID is required")
	}
	subscriptionID = strings.TrimSpace(subscriptionID)
	if subscriptionID == "" {
		return false, nil
	}
	transactionID = strings.TrimSpace(transactionID)
	if operationType == types.PaddleBillingOperationCheckout && transactionID == "" {
		return false, nil
	}
	resultJSON, lastError, err := preparePaddleBillingOperationFinish(status, resultJSON, lastError)
	if err != nil {
		return false, err
	}

	matched := false
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("tenant_id = ? AND operation_type = ? AND operation_key = ? AND price_id = ? AND status IN ?",
				tenantID, operationType, operationKey, priceID, activePaddleBillingOperationStatuses()).
			Order("id ASC")
		if operationType == types.PaddleBillingOperationUpgrade {
			query = query.Where("subscription_id = ?", subscriptionID)
		} else {
			// The signed subscription.created event is the only safe recovery if
			// Paddle accepted checkout but the server lost the create response or
			// failed to persist its transaction ID. A non-empty different ID never
			// matches; an empty ID is atomically bound to this exact signed event.
			query = query.Where(
				"paddle_transaction_id = ? OR (paddle_transaction_id = '' AND status IN ?)",
				transactionID,
				[]types.PaddleBillingOperationStatus{types.PaddleBillingOperationInFlight, types.PaddleBillingOperationUncertain},
			)
		}
		var operation types.PaddleBillingOperation
		if err := query.First(&operation).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// Idempotent replay after the matching operation already reached a
				// terminal state is complete. A different active operation is a real
				// coordinate mismatch and must be surfaced to the worker for retry.
				var activeCount int64
				if countErr := tx.Model(&types.PaddleBillingOperation{}).
					Where("tenant_id = ? AND status IN ?", tenantID, activePaddleBillingOperationStatuses()).
					Count(&activeCount).Error; countErr != nil {
					return countErr
				}
				matched = activeCount == 0
				return nil
			}
			return err
		}
		if operationType == types.PaddleBillingOperationCheckout && strings.TrimSpace(operation.PaddleTransactionID) == "" {
			if err := tx.Model(&types.PaddleBillingOperation{}).Where("id = ?", operation.ID).
				Update("paddle_transaction_id", transactionID).Error; err != nil {
				return err
			}
			operation.PaddleTransactionID = transactionID
		}
		if err := finishPaddleBillingOperation(tx, &operation, status, resultJSON, lastError); err != nil {
			return err
		}
		matched = true
		return nil
	})
	return matched, err
}

func preparePaddleBillingOperationFinish(
	status types.PaddleBillingOperationStatus,
	resultJSON, lastError string,
) (string, string, error) {
	if status != types.PaddleBillingOperationSucceeded &&
		status != types.PaddleBillingOperationFailed &&
		status != types.PaddleBillingOperationUncertain {
		return "", "", fmt.Errorf("%w: %s is not a finish status", ErrPaddleBillingOperationInvalidTransition, status)
	}
	resultJSON = strings.TrimSpace(resultJSON)
	if resultJSON == "" {
		resultJSON = "{}"
	}
	if !json.Valid([]byte(resultJSON)) {
		return "", "", errors.New("paddle billing operation result must be valid JSON")
	}
	return resultJSON, strings.TrimSpace(lastError), nil
}

func finishPaddleBillingOperation(
	tx *gorm.DB,
	operation *types.PaddleBillingOperation,
	status types.PaddleBillingOperationStatus,
	resultJSON, lastError string,
) error {
	if operation.Status == types.PaddleBillingOperationSucceeded || operation.Status == types.PaddleBillingOperationFailed {
		if operation.Status == status {
			return nil
		}
		return fmt.Errorf("%w: terminal operation cannot become %s", ErrPaddleBillingOperationInvalidTransition, status)
	}
	if status == types.PaddleBillingOperationSucceeded {
		lastError = ""
	}
	updates := map[string]any{
		"status":       status,
		"result_json":  resultJSON,
		"last_error":   lastError,
		"completed_at": nil,
		"updated_at":   time.Now().UTC(),
	}
	if status == types.PaddleBillingOperationSucceeded || status == types.PaddleBillingOperationFailed {
		updates["completed_at"] = time.Now().UTC()
	}
	return tx.Model(&types.PaddleBillingOperation{}).Where("id = ?", operation.ID).Updates(updates).Error
}

func validatePaddleBillingOperationIntent(intent types.PaddleBillingOperationIntent) error {
	if intent.TenantID == 0 {
		return errors.New("paddle billing operation tenant ID is required")
	}
	if strings.TrimSpace(intent.OperationKey) == "" {
		return errors.New("paddle billing operation key is required")
	}
	if intent.OperationType != types.PaddleBillingOperationCheckout && intent.OperationType != types.PaddleBillingOperationUpgrade {
		return fmt.Errorf("unsupported Paddle billing operation type %q", intent.OperationType)
	}
	return nil
}

func paddleBillingOperationFromIntent(intent types.PaddleBillingOperationIntent) types.PaddleBillingOperation {
	return types.PaddleBillingOperation{
		TenantID:           intent.TenantID,
		OperationKey:       strings.TrimSpace(intent.OperationKey),
		OperationType:      intent.OperationType,
		RequestFingerprint: strings.TrimSpace(intent.RequestFingerprint),
		Plan:               types.NormalizeConsumerPlan(intent.Plan),
		BillingPeriod:      strings.TrimSpace(intent.BillingPeriod),
		PriceID:            strings.TrimSpace(intent.PriceID),
		SubscriptionID:     strings.TrimSpace(intent.SubscriptionID),
		Status:             types.PaddleBillingOperationPending,
		Result:             "{}",
	}
}

func samePaddleBillingIntent(operation types.PaddleBillingOperation, intent types.PaddleBillingOperationIntent) bool {
	if operation.OperationType != intent.OperationType ||
		operation.Plan != types.NormalizeConsumerPlan(intent.Plan) ||
		operation.BillingPeriod != strings.TrimSpace(intent.BillingPeriod) ||
		operation.PriceID != strings.TrimSpace(intent.PriceID) ||
		operation.SubscriptionID != strings.TrimSpace(intent.SubscriptionID) {
		return false
	}
	existingFingerprint := strings.TrimSpace(operation.RequestFingerprint)
	requestedFingerprint := strings.TrimSpace(intent.RequestFingerprint)
	return existingFingerprint == "" || requestedFingerprint == "" || existingFingerprint == requestedFingerprint
}

func activePaddleBillingOperationStatuses() []types.PaddleBillingOperationStatus {
	return []types.PaddleBillingOperationStatus{
		types.PaddleBillingOperationPending,
		types.PaddleBillingOperationInFlight,
		types.PaddleBillingOperationUncertain,
	}
}
