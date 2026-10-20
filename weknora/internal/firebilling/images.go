package firebilling

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ImageCall struct {
	ID        string     `json:"id" gorm:"primaryKey"`
	UserID    string     `json:"user_id" gorm:"uniqueIndex:fire_image_task;index"`
	PeriodID  string     `json:"period_id"`
	TaskID    string     `json:"task_id" gorm:"uniqueIndex:fire_image_task"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	SettledAt *time.Time `json:"settled_at,omitempty"`
}

func (ImageCall) TableName() string { return "fire_image_calls" }
func imageTaskID(taskID string) (string, error) {
	id, err := uuid.Parse(taskID)
	if err != nil || id == uuid.Nil {
		return "", fmt.Errorf("invalid image task UUID")
	}
	return id.String(), nil
}

// A reservation replay is never authorization to resubmit an unknown or
// completed provider request. The caller owns its persistent task deduplication.
func (s *Service) ReserveImage(ctx context.Context, taskID string) (string, error) {
	taskID, err := imageTaskID(taskID)
	if err != nil {
		return "", err
	}
	if s.platformMaintenance(ctx) {
		return "", nil
	}
	u, err := s.billingIdentity(ctx)
	if err != nil {
		return "", ErrForbidden
	}
	if u.IsSystemAdmin {
		return "", nil
	}
	var id string
	err = s.transaction(ctx, func(tx *gorm.DB) error {
		var m Membership
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", u.ID).Take(&m).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotActivated
			}
			return err
		}
		if m.Suspended {
			return ErrSuspended
		}
		if !m.ExpiresAt.After(time.Now()) {
			return ErrExpired
		}
		var prior ImageCall
		err := tx.Where("user_id = ? AND task_id = ?", u.ID, taskID).Take(&prior).Error
		if err == nil {
			if prior.PeriodID != m.PeriodID || prior.Status == "failed" {
				return ErrConflict
			}
			id = prior.ID
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		// Image allowance remains usable when either chat allowance is spent.
		if m.ImageLimit-m.UsedImages-m.ReservedImages <= 0 {
			return ErrUnavailable
		}
		now := time.Now().UTC()
		result := tx.Model(&Membership{}).Where("user_id = ? AND period_id = ? AND used_images = ? AND reserved_images = ?", u.ID, m.PeriodID, m.UsedImages, m.ReservedImages).Updates(map[string]any{"reserved_images": gorm.Expr("reserved_images + 1"), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		id = uuid.NewString()
		return tx.Create(&ImageCall{ID: id, UserID: u.ID, PeriodID: m.PeriodID, TaskID: taskID, Status: "reserved", CreatedAt: now, UpdatedAt: now}).Error
	})
	return id, err
}

// Called by the trusted internal bridge with a native user identity. Expiry or
// suspension after submission does not erase a charge; unknown has no timeout.
func (s *Service) SettleImage(ctx context.Context, taskID, outcome string) error {
	taskID, err := imageTaskID(taskID)
	if err != nil {
		return err
	}
	if outcome != "succeeded" && outcome != "failed" && outcome != "unknown" {
		return fmt.Errorf("invalid image outcome")
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	if s.platformMaintenance(ctx) {
		return nil
	}
	u, err := s.billingIdentity(ctx)
	if err != nil {
		// This trusted callback settles previously submitted work, including
		// after account deactivation. It cannot admit new provider work.
		uid, _ := types.UserIDFromContext(ctx)
		if uid == "" || types.IsSyntheticUserID(uid) {
			return ErrForbidden
		}
		if err = s.db.WithContext(ctx).Table("users").Select("id, tenant_id, is_system_admin, is_active").Where("id = ?", uid).Take(&u).Error; err != nil {
			return ErrForbidden
		}
	}
	if u.IsSystemAdmin {
		return nil
	}
	return s.transaction(ctx, func(tx *gorm.DB) error {
		var m Membership
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", u.ID).Take(&m).Error; err != nil {
			return err
		}
		if err := settleImageInTx(tx, &m, taskID, outcome); err != nil {
			return err
		}
		return tx.Save(&m).Error
	})
}

// Membership then task is the same lock order as audited admin adjustments.
// Caller owns the transaction and membership lock/save.
func settleImageInTx(tx *gorm.DB, m *Membership, taskID, outcome string) error {
	var call ImageCall
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND task_id = ?", m.UserID, taskID).Take(&call).Error; err != nil {
		return err
	}
	if call.Status == "succeeded" || call.Status == "failed" {
		if call.Status == outcome || outcome == "unknown" {
			return nil
		}
		return ErrConflict
	}
	if call.PeriodID != m.PeriodID || m.ReservedImages < 1 {
		return ErrConflict
	}
	if call.Status == outcome {
		return nil
	}
	now := time.Now().UTC()
	updates := map[string]any{"status": outcome, "updated_at": now}
	if outcome != "unknown" {
		m.ReservedImages--
		if outcome == "succeeded" {
			m.UsedImages++
		}
		m.UpdatedAt = now
		updates["settled_at"] = now
	}
	return tx.Model(&ImageCall{}).Where("id = ?", call.ID).Updates(updates).Error
}
