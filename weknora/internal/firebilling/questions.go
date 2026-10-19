package firebilling

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// QuestionCall is one user turn, independent of its provider/tool call count.
// PeriodID is an immutable cycle snapshot; settlement cannot cross a renewal.
type QuestionCall struct {
	ID        string `gorm:"primaryKey"`
	UserID    string `gorm:"uniqueIndex:fire_question_message;index"`
	PeriodID  string
	MessageID string `gorm:"uniqueIndex:fire_question_message"`
	SessionID string
	Status    string
	CreatedAt time.Time
	SettledAt *time.Time
}

func (QuestionCall) TableName() string { return "fire_question_calls" }

func (s *Service) BeginQuestion(ctx context.Context, messageID, sessionID string) (string, error) {
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
	uid := u.ID
	ownerID := types.SessionOwnerIDFromContext(ctx)
	if ownerID == "" {
		return "", ErrForbidden
	}
	tenantID, _ := types.TenantIDFromContext(ctx)
	if tenantID == 0 {
		tenantID = u.TenantID
	}
	if messageID == "" || sessionID == "" || len(messageID) > 36 || len(sessionID) > 36 {
		return "", fmt.Errorf("invalid question message/session")
	}
	var id string
	err = s.transaction(ctx, func(tx *gorm.DB) error {
		var m Membership
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", uid).Take(&m).Error; err != nil {
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
		if m.TokenLimit-m.UsedTokens-m.ReservedTokens <= 0 {
			return ErrUnavailable
		}
		if m.QuestionLimit == 0 {
			return nil
		}
		// This is the same owner-scoped lookup used by native QA writes. No
		// source-tenant overlay or administrator read fallback can grant a slot.
		if _, err := repository.NewSessionRepository(tx).Get(ctx, tenantID, ownerID, sessionID); err != nil {
			return ErrForbidden
		}
		var prior QuestionCall
		err := tx.Where("user_id = ? AND message_id = ?", uid, messageID).Take(&prior).Error
		if err == nil {
			if prior.SessionID != sessionID || prior.PeriodID != m.PeriodID || prior.Status == "released" {
				return ErrConflict
			}
			id = prior.ID
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if m.QuestionLimit-m.UsedQuestions-m.ReservedQuestions <= 0 {
			return ErrUnavailable
		}
		now := time.Now().UTC()
		result := tx.Model(&Membership{}).Where("user_id = ? AND period_id = ? AND used_questions = ? AND reserved_questions = ?", uid, m.PeriodID, m.UsedQuestions, m.ReservedQuestions).
			Updates(map[string]any{"reserved_questions": gorm.Expr("reserved_questions + 1"), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		id = uuid.NewString()
		return tx.Create(&QuestionCall{ID: id, UserID: uid, PeriodID: m.PeriodID, MessageID: messageID, SessionID: sessionID, Status: "reserved", CreatedAt: now}).Error
	})
	return id, err
}

func (s *Service) SettleQuestion(ctx context.Context, id string, delivered bool) error {
	if id == "" {
		return nil
	}
	// Browser cancellation cannot cancel the accounting commit. Keep recovery
	// bounded even when the original HTTP deadline has already elapsed.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	return s.transaction(ctx, func(tx *gorm.DB) error {
		var call QuestionCall
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).Take(&call).Error; err != nil {
			return err
		}
		if call.Status != "reserved" {
			return nil
		}
		status, used := "released", int64(0)
		if delivered {
			status, used = "settled", 1
		}
		now := time.Now().UTC()
		result := tx.Model(&QuestionCall{}).Where("id = ? AND status = ?", id, "reserved").Updates(map[string]any{"status": status, "settled_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return nil
		}
		result = tx.Model(&Membership{}).Where("user_id = ? AND period_id = ? AND reserved_questions >= 1", call.UserID, call.PeriodID).
			Updates(map[string]any{"reserved_questions": gorm.Expr("reserved_questions - 1"), "used_questions": gorm.Expr("used_questions + ?", used), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		return nil
	})
}

func (s *Service) RecoverQuestions(ctx context.Context) error {
	var calls []QuestionCall
	if err := s.db.WithContext(ctx).Where("status = ? AND created_at < ?", "reserved", time.Now().Add(-20*time.Minute)).Order("created_at ASC").Find(&calls).Error; err != nil {
		return err
	}
	for _, call := range calls {
		var message struct {
			Content    string
			IsFallback bool
		}
		err := s.db.WithContext(ctx).Table("messages").Select("content, is_fallback").Where("id = ? AND session_id = ? AND role = ? AND deleted_at IS NULL", call.MessageID, call.SessionID, "assistant").Take(&message).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		delivered := err == nil && !message.IsFallback && strings.TrimSpace(message.Content) != ""
		if err := s.SettleQuestion(ctx, call.ID, delivered); err != nil {
			return err
		}
	}
	return nil
}
