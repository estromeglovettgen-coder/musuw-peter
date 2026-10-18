// Package firebilling is the authoritative, per-user Token allowance ledger for
// the private Fire deployment. It never touches hosted monetary entitlements.
package firebilling

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrForbidden    = &AccessError{"无权执行此操作", 403}
	ErrConflict     = &AccessError{"操作冲突，请刷新后重试", 409}
	ErrUnavailable  = &AccessError{"剩余额度不足，请联系管理员追加额度", 402}
	ErrNotActivated = &AccessError{"尚未开通套餐，请联系管理员", 402}
	ErrExpired      = &AccessError{"套餐已到期，请联系管理员续期", 402}
	ErrSuspended    = &AccessError{"套餐已暂停，请联系管理员", 402}
	sqliteMu        sync.Mutex
)

type AccessError struct {
	Message string
	Code    int
}

func (e *AccessError) Error() string   { return e.Message }
func (e *AccessError) HTTPStatus() int { return e.Code }

const MaxTokens int64 = 1_000_000_000_000

type Plan struct {
	ID           string    `json:"id" gorm:"primaryKey"`
	Name         string    `json:"name"`
	DurationDays int       `json:"duration_days"`
	TokenLimit   int64     `json:"token_limit"`
	Active       bool      `json:"active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (Plan) TableName() string { return "fire_token_plans" }

type Membership struct {
	UserID         string `gorm:"primaryKey"`
	TenantID       uint64
	PeriodID       string
	PlanID         string
	PlanName       string
	StartsAt       time.Time
	ExpiresAt      time.Time
	TokenLimit     int64
	UsedTokens     int64
	ReservedTokens int64
	Suspended      bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (Membership) TableName() string { return "fire_token_memberships" }

type Mutation struct {
	OperationID  string `json:"operation_id"`
	Kind         string `json:"kind"`
	PlanID       string `json:"plan_id,omitempty"`
	DurationDays int    `json:"duration_days,omitempty"`
	Tokens       int64  `json:"tokens,omitempty"`
	Note         string `json:"note,omitempty"`
}
type Adjustment struct {
	ID           string    `json:"id" gorm:"primaryKey"`
	OperationID  string    `json:"operation_id" gorm:"uniqueIndex"`
	Fingerprint  string    `json:"-"`
	UserID       string    `json:"user_id" gorm:"index"`
	ActorID      string    `json:"actor_id"`
	Kind         string    `json:"kind"`
	Tokens       int64     `json:"tokens"`
	DurationDays int       `json:"duration_days"`
	Note         string    `json:"note"`
	Before       string    `json:"-"`
	After        string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

func (Adjustment) TableName() string { return "fire_token_adjustments" }

type Call struct {
	ID             string     `json:"id" gorm:"primaryKey"`
	UserID         string     `json:"-" gorm:"index"`
	PeriodID       string     `json:"-"`
	Model          string     `json:"-"`
	Purpose        string     `json:"purpose"`
	ReservedTokens int64      `json:"-"`
	InputTokens    int64      `json:"input_tokens"`
	OutputTokens   int64      `json:"output_tokens"`
	TotalTokens    int64      `json:"total_tokens"`
	Estimated      bool       `json:"estimated"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	SettledAt      *time.Time `json:"settled_at,omitempty"`
}

func (Call) TableName() string { return "fire_model_calls" }

type Status struct {
	Managed         bool       `json:"managed"`
	Unlimited       bool       `json:"unlimited"`
	PlanName        string     `json:"plan_name"`
	Status          string     `json:"status"`
	StartsAt        *time.Time `json:"starts_at"`
	ExpiresAt       *time.Time `json:"expires_at"`
	TokenLimit      int64      `json:"token_limit"`
	UsedTokens      int64      `json:"used_tokens"`
	ReservedTokens  int64      `json:"reserved_tokens"`
	RemainingTokens int64      `json:"remaining_tokens"`
	InputTokens     int64      `json:"input_tokens"`
	OutputTokens    int64      `json:"output_tokens"`
	EstimatedTokens int64      `json:"estimated_tokens"`
}
type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }
func Enabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("PETER_TOKEN_BILLING_ENABLED")), "true")
}
func (s *Service) DB() *gorm.DB { return s.db }
func (s *Service) transaction(ctx context.Context, fn func(*gorm.DB) error) error {
	if s.db.Dialector.Name() == "sqlite" {
		sqliteMu.Lock()
		defer sqliteMu.Unlock()
	}
	return s.db.WithContext(ctx).Transaction(fn)
}

type identity struct {
	ID            string
	TenantID      uint64
	IsSystemAdmin bool
	IsActive      bool
}

func (s *Service) identity(ctx context.Context, id string) (identity, error) {
	var u identity
	e := s.db.WithContext(ctx).Table("users").Select("id, tenant_id, is_system_admin, is_active").Where("id = ?", id).Take(&u).Error
	if e != nil {
		return u, e
	}
	if !u.IsActive {
		return u, ErrForbidden
	}
	return u, nil
}
func (s *Service) RequireAdmin(ctx context.Context) error {
	if scope, ok := types.TenantAPIKeyScopeFromContext(ctx); ok && scope.IsPlatform() && scope.HasCapability(types.APIKeyCapabilitySystemTenantsManage) {
		return nil
	}
	u, _ := types.UserIDFromContext(ctx)
	v, e := s.identity(ctx, u)
	if e != nil || !v.IsSystemAdmin {
		return ErrForbidden
	}
	return nil
}

// Native async initiators retain the platform principal's ID, not a serialized
// privilege grant. Recheck the revocable key record before exempting its work.
func (s *Service) platformMaintenance(ctx context.Context) bool {
	if scope, ok := types.TenantAPIKeyScopeFromContext(ctx); ok {
		return scope.IsPlatform() && scope.HasCapability(types.APIKeyCapabilitySystemTenantsManage)
	}
	uid, _ := types.UserIDFromContext(ctx)
	if !strings.HasPrefix(uid, types.PrincipalAPIPlatform+":") {
		return false
	}
	id, e := strconv.ParseUint(strings.TrimPrefix(uid, types.PrincipalAPIPlatform+":"), 10, 64)
	if e != nil || id == 0 {
		return false
	}
	var key types.TenantAPIKey
	if e = s.db.WithContext(ctx).Select("id,scope_type,capabilities,revoked_at,expires_at").Where("id = ?", id).First(&key).Error; e != nil {
		return false
	}
	if !key.IsPlatform() || key.RevokedAt != nil || (key.ExpiresAt != nil && !key.ExpiresAt.After(time.Now())) {
		return false
	}
	return (types.TenantAPIKeyScope{ScopeType: key.ScopeType, Capabilities: key.Capabilities}).HasCapability(types.APIKeyCapabilitySystemTenantsManage)
}

// Begin reserves enough for the actual input and caps completion to the
// remaining balance. Small positive balances remain usable without overselling.
func (s *Service) Begin(ctx context.Context, purpose, model string, input, requested int64) (string, int64, error) {
	if s.platformMaintenance(ctx) {
		return "", requested, nil
	}
	uid, _ := types.UserIDFromContext(ctx)
	if uid != "" && !types.IsSyntheticUserID(uid) {
		st, e := s.Status(ctx, uid)
		if e != nil {
			return "", 0, e
		}
		if st.Unlimited {
			return "", requested, nil
		}
		if st.Status != "active" {
			switch st.Status {
			case "not_activated":
				return "", 0, ErrNotActivated
			case "expired":
				return "", 0, ErrExpired
			case "suspended":
				return "", 0, ErrSuspended
			}
			return "", 0, ErrUnavailable
		}
		if st.RemainingTokens < input || (requested > input && st.RemainingTokens == input) {
			return "", 0, ErrUnavailable
		}
		requested = min(requested, st.RemainingTokens)
	}
	id, e := s.Reserve(ctx, purpose, model, requested)
	return id, requested, e
}
func (s *Service) Status(ctx context.Context, id string) (*Status, error) {
	u, e := s.identity(ctx, id)
	if e != nil {
		return nil, e
	}
	if u.IsSystemAdmin {
		return &Status{Managed: true, Unlimited: true, Status: "active", PlanName: "管理员"}, nil
	}
	var m Membership
	e = s.db.WithContext(ctx).Where("user_id = ?", id).Take(&m).Error
	if errors.Is(e, gorm.ErrRecordNotFound) {
		return &Status{Managed: true, Status: "not_activated"}, nil
	}
	if e != nil {
		return nil, e
	}
	st := statusOf(m)
	var sums struct {
		InputTokens     int64
		OutputTokens    int64
		EstimatedTokens int64
	}
	e = s.db.WithContext(ctx).Model(&Call{}).Select("COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, COALESCE(SUM(CASE WHEN estimated THEN total_tokens ELSE 0 END),0) AS estimated_tokens").Where("user_id = ? AND period_id = ? AND status = ?", id, m.PeriodID, "settled").Scan(&sums).Error
	st.InputTokens = sums.InputTokens
	st.OutputTokens = sums.OutputTokens
	st.EstimatedTokens = sums.EstimatedTokens
	return st, e
}
func statusOf(m Membership) *Status {
	st := &Status{Managed: true, Status: "active", PlanName: m.PlanName, StartsAt: &m.StartsAt, ExpiresAt: &m.ExpiresAt, TokenLimit: m.TokenLimit, UsedTokens: m.UsedTokens, ReservedTokens: m.ReservedTokens, RemainingTokens: max(int64(0), m.TokenLimit-m.UsedTokens-m.ReservedTokens)}
	if m.Suspended {
		st.Status = "suspended"
	} else if !m.ExpiresAt.After(time.Now()) {
		st.Status = "expired"
	} else if st.RemainingTokens <= 0 {
		st.Status = "exhausted"
	}
	return st
}
func (s *Service) Apply(ctx context.Context, id string, req Mutation) (*Status, error) {
	if e := s.RequireAdmin(ctx); e != nil {
		return nil, e
	}
	if len(req.OperationID) < 1 || len(req.OperationID) > 128 || len(req.Note) > 1000 || req.DurationDays < 0 || req.DurationDays > 36500 || req.Tokens < 0 || req.Tokens > MaxTokens {
		return nil, fmt.Errorf("invalid adjustment")
	}
	raw, _ := json.Marshal(struct {
		UserID   string
		Mutation Mutation
	}{id, req})
	hash := sha256.Sum256(raw)
	fingerprint := hex.EncodeToString(hash[:])
	actor, _ := types.UserIDFromContext(ctx)
	err := s.transaction(ctx, func(tx *gorm.DB) error {
		// The operation lock serializes retries even when no membership row exists yet.
		if tx.Dialector.Name() == "postgres" {
			if e := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "fire:adjust:"+req.OperationID).Error; e != nil {
				return e
			}
			if e := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "fire:user:"+id).Error; e != nil {
				return e
			}
		}
		var prior Adjustment
		e := tx.Where("operation_id = ?", req.OperationID).Take(&prior).Error
		if e == nil {
			if prior.Fingerprint != fingerprint {
				return ErrConflict
			}
			return nil
		}
		if !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}
		u, e := NewService(tx).identity(ctx, id)
		if e != nil {
			return e
		}
		if u.IsSystemAdmin {
			return fmt.Errorf("管理员无需套餐")
		}
		var m Membership
		e = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", id).Take(&m).Error
		if e != nil && !errors.Is(e, gorm.ErrRecordNotFound) {
			return e
		}
		exists := e == nil
		before, _ := json.Marshal(m)
		now := time.Now().UTC()
		days, tokens := req.DurationDays, req.Tokens
		var plan Plan
		if req.PlanID != "" {
			if e := tx.Where("id = ? AND active = ?", req.PlanID, true).Take(&plan).Error; e != nil {
				return fmt.Errorf("套餐不存在或已停用")
			}
			days = plan.DurationDays
			tokens = plan.TokenLimit
			if req.DurationDays > 0 {
				days = req.DurationDays
			}
			if req.Tokens > 0 {
				tokens = req.Tokens
			}
		}
		if !exists {
			m = Membership{UserID: id, TenantID: u.TenantID, PeriodID: uuid.NewString(), StartsAt: now, ExpiresAt: now, PlanName: "自定义套餐"}
		}
		switch req.Kind {
		case "grant", "renew":
			if days <= 0 || tokens <= 0 {
				return fmt.Errorf("套餐天数和Token必须大于0")
			}
			if !m.ExpiresAt.After(now) {
				if m.ReservedTokens > 0 {
					return ErrConflict
				}
				m.PeriodID = uuid.NewString()
				m.StartsAt = now
				m.ExpiresAt = now
				m.TokenLimit = 0
				m.UsedTokens = 0
			}
			m.ExpiresAt = m.ExpiresAt.Add(time.Duration(days) * 24 * time.Hour)
			m.TokenLimit += tokens
			if plan.ID != "" {
				m.PlanID = plan.ID
				m.PlanName = plan.Name
			}
		case "topup":
			if !exists || tokens <= 0 || days != 0 || req.PlanID != "" {
				return fmt.Errorf("追加额度只允许正数Token且需要已开通套餐")
			}
			m.TokenLimit += tokens
		case "extend":
			if !exists || days <= 0 || tokens != 0 || req.PlanID != "" {
				return fmt.Errorf("赠送天数只允许正数天数")
			}
			if !m.ExpiresAt.After(now) {
				if m.ReservedTokens > 0 {
					return ErrConflict
				}
				m.StartsAt = now
				m.ExpiresAt = now
				m.PeriodID = uuid.NewString()
				m.TokenLimit = 0
				m.UsedTokens = 0
			}
			m.ExpiresAt = m.ExpiresAt.Add(time.Duration(days) * 24 * time.Hour)
		case "suspend", "resume":
			if !exists || days != 0 || tokens != 0 || req.PlanID != "" {
				return fmt.Errorf("无效暂停操作")
			}
			m.Suspended = req.Kind == "suspend"
		default:
			return fmt.Errorf("未知操作")
		}
		if m.TokenLimit > MaxTokens {
			return fmt.Errorf("额度超过上限")
		}
		if e := tx.Save(&m).Error; e != nil {
			return e
		}
		after, _ := json.Marshal(m)
		return tx.Create(&Adjustment{ID: uuid.NewString(), OperationID: req.OperationID, Fingerprint: fingerprint, UserID: id, ActorID: actor, Kind: req.Kind, Tokens: tokens, DurationDays: days, Note: req.Note, Before: string(before), After: string(after)}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Status(ctx, id)
}

// Reserve commits the right to begin one provider request. Provider calls cannot
// oversell a balance through concurrent requests. Admin identity is read from DB.
func (s *Service) Reserve(ctx context.Context, purpose, model string, amount int64) (string, error) {
	if s.platformMaintenance(ctx) {
		return "", nil
	}
	uid, _ := types.UserIDFromContext(ctx)
	if uid == "" || types.IsSyntheticUserID(uid) {
		// Detached native processing carries the initiating identity when possible;
		// old tenant jobs are billed to that tenant's owner, never the shared KB owner.
		tid, _ := types.TenantIDFromContext(ctx)
		var owner identity
		if tid == 0 {
			return "", ErrForbidden
		}
		if e := s.db.WithContext(ctx).Table("users").Select("id").Where("tenant_id = ?", tid).Order("is_system_admin DESC").Take(&owner).Error; e != nil {
			return "", ErrForbidden
		}
		uid = owner.ID
	}
	u, e := s.identity(ctx, uid)
	if e != nil {
		return "", ErrForbidden
	}
	if u.IsSystemAdmin {
		return "", nil
	}
	amount = max(int64(1), amount)
	if amount > MaxTokens {
		return "", ErrUnavailable
	}
	id := uuid.NewString()
	e = s.transaction(ctx, func(tx *gorm.DB) error {
		var m Membership
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", uid).Take(&m).Error; e != nil {
			if errors.Is(e, gorm.ErrRecordNotFound) {
				return ErrNotActivated
			}
			return e
		}
		if m.Suspended {
			return ErrSuspended
		}
		if !m.ExpiresAt.After(time.Now()) {
			return ErrExpired
		}
		if m.TokenLimit-m.UsedTokens-m.ReservedTokens < amount {
			return ErrUnavailable
		}
		result := tx.Model(&Membership{}).Where("user_id = ? AND reserved_tokens = ? AND used_tokens = ?", uid, m.ReservedTokens, m.UsedTokens).Update("reserved_tokens", gorm.Expr("reserved_tokens + ?", amount))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		return tx.Create(&Call{ID: id, UserID: uid, PeriodID: m.PeriodID, Model: model, Purpose: purpose, ReservedTokens: amount, Status: "reserved"}).Error
	})
	return id, e
}

// Settle is idempotent. A started call may finish after expiry, but can never be
// moved into a newer period. Caller cancellation must not cancel this DB commit.
func (s *Service) Settle(ctx context.Context, id string, input, output int64, estimated, release bool) error {
	if id == "" {
		return nil
	}
	if input < 0 || output < 0 || input > MaxTokens || output > MaxTokens {
		return fmt.Errorf("invalid provider usage")
	}
	return s.transaction(ctx, func(tx *gorm.DB) error {
		var c Call
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).Take(&c).Error; e != nil {
			return e
		}
		if c.Status != "reserved" {
			return nil
		}
		status := "settled"
		if release {
			status = "released"
			input = 0
			output = 0
		}
		total := input + output
		now := time.Now().UTC()
		r := tx.Model(&Call{}).Where("id = ? AND status = ?", id, "reserved").Updates(map[string]any{"status": status, "input_tokens": input, "output_tokens": output, "total_tokens": total, "estimated": estimated, "settled_at": now})
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return nil
		}
		r = tx.Model(&Membership{}).Where("user_id = ? AND period_id = ? AND reserved_tokens >= ?", c.UserID, c.PeriodID, c.ReservedTokens).Updates(map[string]any{"reserved_tokens": gorm.Expr("reserved_tokens - ?", c.ReservedTokens), "used_tokens": gorm.Expr("used_tokens + ?", total), "updated_at": now})
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return ErrConflict
		}
		return nil
	})
}

// RecoverPending conservatively accounts a process-interrupted request using
// its reserved bound. It is visibly estimated, never silently free or leaked.
func (s *Service) RecoverPending(ctx context.Context) error {
	var calls []Call
	if e := s.db.WithContext(ctx).Where("status = ? AND created_at < ?", "reserved", time.Now().Add(-20*time.Minute)).Find(&calls).Error; e != nil {
		return e
	}
	for _, c := range calls {
		if e := s.Settle(ctx, c.ID, c.ReservedTokens, 0, true, false); e != nil {
			return e
		}
	}
	return nil
}
