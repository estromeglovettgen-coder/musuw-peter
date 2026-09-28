package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type marketplaceRepository struct{ db *gorm.DB }

// NewMarketplaceRepository stores reviewed products and their independent subscriptions.
func NewMarketplaceRepository(db *gorm.DB) interfaces.MarketplaceRepository {
	return &marketplaceRepository{db: db}
}

func marketplaceDBError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return types.ErrMarketplaceNotFound
	}
	return err
}

func (r *marketplaceRepository) ListProducts(
	ctx context.Context,
	q interfaces.MarketplaceCatalogQuery,
) ([]*types.MarketplaceProduct, int64, error) {
	query := r.db.WithContext(ctx).Model(&types.MarketplaceProduct{})
	if q.PublishedOnly {
		query = query.Where("status = ?", "published")
	} else if q.Status != "" {
		query = query.Where("status = ?", q.Status)
	}
	if q.CreatorTenantID != 0 {
		query = query.Where("creator_tenant_id = ?", q.CreatorTenantID)
	}
	if q.CreatorUserID != "" {
		query = query.Where("creator_user_id = ?", q.CreatorUserID)
	}
	if q.Category != "" {
		query = query.Where("category = ?", q.Category)
	}
	if q.Query != "" {
		pattern := "%" + strings.ToLower(q.Query) + "%"
		query = query.Where("LOWER(title) LIKE ? OR LOWER(description) LIKE ?", pattern, pattern)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}
	if q.Limit <= 0 || q.Limit > 100 {
		q.Limit = 50
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	products := []*types.MarketplaceProduct{}
	err := query.Omit("sample_conversations").Order("featured DESC, created_at DESC, id ASC").
		Limit(q.Limit).Offset(q.Offset).Find(&products).Error
	return products, count, err
}

func (r *marketplaceRepository) GetProduct(ctx context.Context, id string) (*types.MarketplaceProduct, error) {
	var product types.MarketplaceProduct
	err := r.db.WithContext(ctx).First(&product, "id = ?", id).Error
	return &product, marketplaceDBError(err)
}

func (r *marketplaceRepository) SaveProduct(
	ctx context.Context,
	p *types.MarketplaceProduct,
	expected time.Time,
) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if p.MonthlyPriceID != "" || p.YearlyPriceID != "" {
			var count int64
			if err := tx.Model(&types.MarketplaceProduct{}).Where(
				"id <> ? AND (monthly_price_id IN ? OR yearly_price_id IN ?)", p.ID,
				[]string{p.MonthlyPriceID, p.YearlyPriceID}, []string{p.MonthlyPriceID, p.YearlyPriceID},
			).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return fmt.Errorf("%w: Paddle price already belongs to another product", types.ErrMarketplaceConflict)
			}
		}
		if expected.IsZero() {
			return tx.Create(p).Error
		}
		result := tx.Model(&types.MarketplaceProduct{}).
			Where("id = ? AND updated_at = ?", p.ID, expected).
			Select("*").
			Omit("created_at", "access").
			Updates(p)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return types.ErrMarketplaceConflict
		}
		return nil
	})
}

func sameMarketplaceCheckout(a, b *types.MarketplaceSubscription) bool {
	return a.TenantID == b.TenantID && a.ProductID == b.ProductID && a.BillingPeriod == b.BillingPeriod &&
		a.PriceID == b.PriceID
}

// Lock the same durable user row as account erasure's Fence. Both allocating
// an operation and starting its provider write must happen before that fence.
func lockMarketplaceCheckoutUser(tx *gorm.DB, userID string) error {
	var user types.User
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Select("id", "is_active", "deletion_requested_at").
		First(&user, "id = ?", userID).
		Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return types.ErrMarketplaceForbidden
	}
	if err != nil {
		return err
	}
	if !user.IsActive || user.DeletionRequestedAt != nil {
		return types.ErrMarketplaceForbidden
	}
	return nil
}

func (r *marketplaceRepository) ClaimCheckout(
	ctx context.Context,
	candidate *types.MarketplaceSubscription,
) (*types.MarketplaceSubscription, bool, error) {
	var result *types.MarketplaceSubscription
	created := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockMarketplaceCheckoutUser(tx, candidate.UserID); err != nil {
			return err
		}
		var current types.MarketplaceSubscription
		err := tx.Where("tenant_id = ? AND operation_key = ?", candidate.TenantID, candidate.OperationKey).
			First(&current).
			Error
		if err == nil {
			if !sameMarketplaceCheckout(&current, candidate) {
				return types.ErrMarketplaceConflict
			}
			result = &current
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(candidate)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 1 {
			result = candidate
			created = true
			return nil
		}
		err = tx.Where("tenant_id = ? AND operation_key = ?", candidate.TenantID, candidate.OperationKey).
			First(&current).
			Error
		if err == nil {
			if !sameMarketplaceCheckout(&current, candidate) {
				return types.ErrMarketplaceConflict
			}
			result = &current
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := tx.Where(
			"tenant_id = ? AND product_id = ? AND status NOT IN ?",
			candidate.TenantID, candidate.ProductID, []string{"canceled", "failed"},
		).First(&current).Error; err != nil {
			return marketplaceDBError(err)
		}
		result = &current
		return nil
	})
	return result, created, err
}

func (r *marketplaceRepository) GetSubscription(
	ctx context.Context,
	id string,
) (*types.MarketplaceSubscription, error) {
	var sub types.MarketplaceSubscription
	err := r.db.WithContext(ctx).First(&sub, "id = ?", id).Error
	return &sub, marketplaceDBError(err)
}

func (r *marketplaceRepository) CurrentSubscription(
	ctx context.Context,
	tenantID uint64,
	productID string,
) (*types.MarketplaceSubscription, error) {
	var sub types.MarketplaceSubscription
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND product_id = ?", tenantID, productID).
		Order("created_at DESC, id DESC").
		First(&sub).
		Error
	return &sub, marketplaceDBError(err)
}

func (r *marketplaceRepository) ResolveSubscription(
	ctx context.Context,
	providerID, transactionID string,
) (*types.MarketplaceSubscription, error) {
	if providerID == "" && transactionID == "" {
		return nil, types.ErrMarketplaceNotFound
	}
	query := r.db.WithContext(ctx)
	if providerID != "" {
		query = query.Where("paddle_subscription_id = ?", providerID)
	} else {
		query = query.Where("checkout_transaction_id = ?", transactionID)
	}
	var sub types.MarketplaceSubscription
	err := query.First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) && transactionID != "" {
		var txn types.MarketplaceTransaction
		if txnErr := r.db.WithContext(ctx).First(&txn, "id = ?", transactionID).Error; txnErr == nil {
			return r.GetSubscription(ctx, txn.SubscriptionID)
		} else if !errors.Is(txnErr, gorm.ErrRecordNotFound) {
			return nil, txnErr
		}
	}
	return &sub, marketplaceDBError(err)
}

func (r *marketplaceRepository) UpdateCheckout(
	ctx context.Context,
	id string,
	from []string,
	status, transactionID, lastError string,
) (bool, error) {
	updates := map[string]any{"status": status, "last_error": lastError, "updated_at": time.Now().UTC()}
	if transactionID != "" {
		updates["checkout_transaction_id"] = transactionID
	}
	changed := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if status == "in_flight" {
			var sub types.MarketplaceSubscription
			if err := tx.First(&sub, "id = ?", id).Error; err != nil {
				return marketplaceDBError(err)
			}
			if err := lockMarketplaceCheckoutUser(tx, sub.UserID); err != nil {
				return err
			}
		}
		result := tx.Model(&types.MarketplaceSubscription{}).Where("id = ? AND status IN ?", id, from).Updates(updates)
		changed = result.RowsAffected == 1
		return result.Error
	})
	return changed, err
}

func (r *marketplaceRepository) ListOrders(ctx context.Context, tenantID uint64) (*types.MarketplaceOrders, error) {
	orders := &types.MarketplaceOrders{
		Subscriptions:            []*types.MarketplaceSubscription{},
		Transactions:             []*types.MarketplaceTransaction{},
		MembershipManagementPath: "/platform/settings?section=usage",
	}
	if err := r.db.WithContext(ctx).Where("tenant_id = ?", tenantID).
		Order("created_at DESC").Limit(200).Find(&orders.Subscriptions).Error; err != nil {
		return nil, err
	}
	if err := r.db.WithContext(ctx).Where("tenant_id = ?", tenantID).
		Order("occurred_at DESC").Limit(200).Find(&orders.Transactions).Error; err != nil {
		return nil, err
	}
	return orders, nil
}

func (r *marketplaceRepository) ListBillingSubscriptions(
	ctx context.Context,
	tenantID uint64,
) ([]*types.MarketplaceSubscription, error) {
	rows := []*types.MarketplaceSubscription{}
	err := r.db.WithContext(ctx).Where("tenant_id = ?", tenantID).Order("created_at ASC").Find(&rows).Error
	return rows, err
}

func (r *marketplaceRepository) ApplyBillingEvent(
	ctx context.Context,
	event types.MarketplaceBillingEvent,
) (bool, error) {
	if event.EventID == "" || event.OccurredAt.IsZero() || event.SubscriptionID == "" ||
		event.PaddleSubscriptionID == "" ||
		event.CustomerID == "" {
		return false, types.ErrMarketplaceInvalid
	}
	applied := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var sub types.MarketplaceSubscription
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&sub, "id = ?", event.SubscriptionID).Error; err != nil {
			return marketplaceDBError(err)
		}
		erased := sub.TenantID == 0 || sub.UserID == ""
		if !erased &&
			((sub.PaddleSubscriptionID != "" && sub.PaddleSubscriptionID != event.PaddleSubscriptionID) ||
				(sub.PaddleCustomerID != "" && sub.PaddleCustomerID != event.CustomerID) ||
				(event.PriceID != "" && event.PriceID != sub.PriceID)) {
			return types.ErrMarketplaceForbidden
		}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).
			Create(&types.MarketplaceProcessedEvent{EventID: event.EventID, SubscriptionID: sub.ID})
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 0 {
			return nil
		}
		// The queue may retain a verified payload after account erasure removes
		// provider identifiers. Consume that event without reconstructing the
		// deleted identity, invoice linkage, or access entitlement.
		if erased {
			applied = true
			return nil
		}
		sub.PaddleCustomerID = event.CustomerID
		sub.PaddleSubscriptionID = event.PaddleSubscriptionID
		switch {
		case strings.HasPrefix(event.EventType, "subscription."):
			if sub.LastEventAt != nil && !event.OccurredAt.After(*sub.LastEventAt) {
				break
			}
			if sub.LastPaymentAt != nil && event.OccurredAt.Before(*sub.LastPaymentAt) {
				break
			}
			switch event.Status {
			case "active", "past_due", "paused", "canceled":
			default:
				return types.ErrMarketplaceInvalid
			}
			// A normal lifecycle update must never undo an approved refund or
			// chargeback. A new paid term or authoritative adjustment reversal does.
			if sub.Status != "refunded" && sub.Status != "chargeback" || event.Status == "canceled" {
				sub.Status = event.Status
			}
			sub.CancelAtPeriodEnd = event.CancelAtPeriodEnd
			sub.ScheduledChangeAt = event.ScheduledChangeAt
			if (event.EventType == "subscription.created" || event.EventType == "subscription.activated") &&
				event.Status == "active" &&
				sub.PaidThrough == nil &&
				event.PeriodEndsAt != nil &&
				event.PeriodEndsAt.After(event.OccurredAt) {
				sub.PaidThrough = event.PeriodEndsAt
				// Initial transaction and activation may arrive in either order.
				if err := tx.Model(&types.MarketplaceTransaction{}).
					Where("subscription_id = ? AND period_ends_at IS NULL", sub.ID).
					Updates(map[string]any{
						"period_starts_at": event.PeriodStartsAt, "period_ends_at": event.PeriodEndsAt,
					}).Error; err != nil {
					return err
				}
			}
			sub.LastEventID = event.EventID
			sub.LastEventAt = &event.OccurredAt
		case event.EventType == "transaction.completed":
			if event.TransactionID == "" || event.Status != "completed" {
				return types.ErrMarketplaceInvalid
			}
			var existing types.MarketplaceTransaction
			err := tx.First(&existing, "id = ?", event.TransactionID).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err == nil && existing.SubscriptionID != sub.ID {
				return types.ErrMarketplaceForbidden
			}
			if err == nil && !event.OccurredAt.After(existing.LastEventAt) {
				break
			}
			periodEnd := event.PeriodEndsAt
			if periodEnd == nil &&
				(sub.CheckoutTransactionID == "" || sub.CheckoutTransactionID == event.TransactionID) {
				periodEnd = sub.PaidThrough
			}
			txn := &types.MarketplaceTransaction{
				ID:             event.TransactionID,
				TenantID:       sub.TenantID,
				SubscriptionID: sub.ID,
				ProductID:      sub.ProductID,
				ProductTitle:   sub.ProductTitle,
				Status:         "completed",
				Currency:       event.Currency,
				Amount:         event.Amount,
				BillingPeriod:  sub.BillingPeriod,
				PeriodStartsAt: event.PeriodStartsAt,
				PeriodEndsAt:   periodEnd,
				OccurredAt:     event.OccurredAt,
				LastEventAt:    event.OccurredAt,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"status", "currency", "amount", "period_starts_at", "period_ends_at", "last_event_at", "updated_at",
				}),
			}).Create(txn).Error; err != nil {
				return err
			}
			if periodEnd != nil && periodEnd.After(event.OccurredAt) &&
				(sub.PaidThrough == nil || periodEnd.After(*sub.PaidThrough)) {
				sub.PaidThrough = periodEnd
				if sub.LastEventAt == nil || !event.OccurredAt.Before(*sub.LastEventAt) {
					sub.Status = "active"
				}
			}
			if sub.LastPaymentAt == nil || event.OccurredAt.After(*sub.LastPaymentAt) {
				sub.LastPaymentAt = &event.OccurredAt
			}
		case event.EventType == "adjustment.created" || event.EventType == "adjustment.updated":
			if event.Status != "approved" || event.AdjustmentType != "full" {
				break
			}
			if event.Action != "refund" && event.Action != "chargeback" && event.Action != "chargeback_reverse" {
				break
			}
			var txn types.MarketplaceTransaction
			if err := tx.First(&txn, "id = ? AND subscription_id = ?", event.TransactionID, sub.ID).Error; err != nil {
				return fmt.Errorf("marketplace adjusted transaction is not ready: %w", err)
			}
			if !event.OccurredAt.After(txn.LastEventAt) {
				break
			}
			switch event.Action {
			case "refund":
				txn.Status = "refunded"
			case "chargeback":
				txn.Status = "chargeback"
			case "chargeback_reverse":
				txn.Status = "completed"
			}
			txn.LastEventAt = event.OccurredAt
			if err := tx.Save(&txn).Error; err != nil {
				return err
			}
			// Refunding an older invoice does not revoke a newer, independently paid
			// term. Missing invoice periods retry instead of guessing whose term it is.
			if txn.PeriodEndsAt == nil {
				return fmt.Errorf("marketplace adjusted transaction period is not ready")
			}
			if sub.PaidThrough != nil && txn.PeriodEndsAt.Before(*sub.PaidThrough) {
				break
			}
			// Invoice adjustments have their own cursor above. A later ordinary
			// subscription update does not make an approved refund stale.
			if event.Action == "chargeback_reverse" {
				switch event.ReconciledStatus {
				case "active", "past_due", "paused", "canceled":
					sub.Status = event.ReconciledStatus
				default:
					return types.ErrMarketplaceInvalid
				}
			} else if sub.Status != "canceled" {
				sub.Status = txn.Status
			}
			if sub.LastEventAt == nil || event.OccurredAt.After(*sub.LastEventAt) {
				sub.LastEventID = event.EventID
				sub.LastEventAt = &event.OccurredAt
			}
		default:
			return types.ErrMarketplaceInvalid
		}
		if err := tx.Save(&sub).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	return applied, err
}
