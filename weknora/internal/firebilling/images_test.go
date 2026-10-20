package firebilling

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"sync"
	"testing"
	"time"
)

func imageFixture(t *testing.T) (*Service, context.Context) {
	s, ctx := questionFixture(t)
	require.NoError(t, s.db.AutoMigrate(&ImageCall{}))
	grantQuestions(t, s, ctx, "alice", 1)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Updates(map[string]any{"image_limit": 1, "used_tokens": 1000, "used_questions": 1}).Error)
	return s, ctx
}

func TestImagePlanInheritanceOverridesAndIndependentTopup(t *testing.T) {
	s, admin := questionFixture(t)
	require.NoError(t, s.db.Create(&Plan{ID: "image-plan", Name: "十张", DurationDays: 30, TokenLimit: 1000, ImageLimit: 10, Active: true}).Error)
	st, e := s.Apply(admin, "alice", Mutation{OperationID: "image-plan-grant", Kind: "grant", PlanID: "image-plan"})
	require.NoError(t, e)
	require.EqualValues(t, 10, st.RemainingImages)
	st, e = s.Apply(admin, "bob", Mutation{OperationID: "image-zero-grant", Kind: "grant", PlanID: "image-plan", Images: questions(0)})
	require.NoError(t, e)
	require.Zero(t, st.ImageLimit)
	_, e = s.ReserveImage(questionUser(admin, "bob"), uuid.NewString())
	require.ErrorIs(t, e, ErrUnavailable)
	st, e = s.Apply(admin, "alice", Mutation{OperationID: "image-only-topup", Kind: "topup", Images: questions(2)})
	require.NoError(t, e)
	require.EqualValues(t, 12, st.ImageLimit)
	require.EqualValues(t, 1000, st.TokenLimit)
	st, e = s.Apply(admin, "alice", Mutation{OperationID: "image-active-renew", Kind: "renew", DurationDays: 1, Tokens: 100, Images: questions(3)})
	require.NoError(t, e)
	require.EqualValues(t, 15, st.ImageLimit)
	st, e = s.Apply(admin, "alice", Mutation{OperationID: "image-active-zero", Kind: "renew", DurationDays: 1, Tokens: 100, Images: questions(0)})
	require.NoError(t, e)
	require.EqualValues(t, 15, st.ImageLimit)
	for _, req := range []Mutation{
		{OperationID: "negative", Kind: "topup", Images: questions(-1)},
		{OperationID: "overflow", Kind: "topup", Images: questions(MaxImages)},
		{OperationID: "extend-image", Kind: "extend", DurationDays: 1, Images: questions(1)},
		{OperationID: "wrong-limit-kind", Kind: "topup", Tokens: 1, ImageLimit: questions(1)},
		{OperationID: "wrong-outcome-kind", Kind: "topup", Tokens: 1, ImageOutcome: "failed"},
	} {
		_, e = s.Apply(admin, "alice", req)
		require.Error(t, e)
	}
}

func TestImageAdminResolveAuditsAndRollsBackAtomically(t *testing.T) {
	s, admin := imageFixture(t)
	user := questionUser(admin, "alice")
	task := uuid.NewString()
	_, e := s.ReserveImage(user, task)
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(user, task, "unknown"))
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "below-pending", Kind: "set_image_limit", ImageLimit: questions(0)})
	require.Error(t, e)
	req := Mutation{OperationID: "resolve-image", Kind: "resolve_image", ImageTaskID: task, ImageOutcome: "failed", Note: "已核查未交付"}
	_, e = s.Apply(user, "alice", req)
	require.ErrorIs(t, e, ErrForbidden)
	require.NoError(t, s.db.Callback().Create().Before("gorm:create").Register("fail_image_audit", func(tx *gorm.DB) {
		if _, ok := tx.Statement.Dest.(*Adjustment); ok {
			tx.AddError(errors.New("audit unavailable"))
		}
	}))
	_, e = s.Apply(admin, "alice", req)
	require.Error(t, e)
	var held ImageCall
	require.NoError(t, s.db.Where("task_id = ?", task).Take(&held).Error)
	require.Equal(t, "unknown", held.Status)
	st, e := s.Status(admin, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 1, st.ReservedImages)
	require.NoError(t, s.db.Callback().Create().Remove("fail_image_audit"))
	st, e = s.Apply(admin, "alice", req)
	require.NoError(t, e)
	require.Zero(t, st.ReservedImages)
	require.Zero(t, st.UsedImages)
	_, e = s.Apply(admin, "alice", req)
	require.NoError(t, e)
	var auditCount int64
	require.NoError(t, s.db.Model(&Adjustment{}).Where("operation_id = ?", req.OperationID).Count(&auditCount).Error)
	require.EqualValues(t, 1, auditCount)
	st, e = s.Apply(admin, "alice", Mutation{OperationID: "disable-images", Kind: "set_image_limit", ImageLimit: questions(0)})
	require.NoError(t, e)
	require.Zero(t, st.ImageLimit)
}

func TestImagePendingBlocksPeriodResetButCanSettleAfterExpiry(t *testing.T) {
	s, admin := imageFixture(t)
	user := questionUser(admin, "alice")
	task := uuid.NewString()
	_, e := s.ReserveImage(user, task)
	require.NoError(t, e)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Hour)).Error)
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "pending-renew", Kind: "renew", DurationDays: 1, Tokens: 100, Images: questions(3)})
	require.ErrorIs(t, e, ErrConflict)
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "pending-extend", Kind: "extend", DurationDays: 1})
	require.ErrorIs(t, e, ErrConflict)
	cancelled, cancel := context.WithCancel(user)
	cancel()
	require.NoError(t, s.SettleImage(cancelled, task, "succeeded"))
	st, e := s.Apply(admin, "alice", Mutation{OperationID: "new-image-period", Kind: "renew", DurationDays: 1, Tokens: 100, Images: questions(3)})
	require.NoError(t, e)
	require.EqualValues(t, 3, st.ImageLimit)
	require.Zero(t, st.UsedImages)
	require.Zero(t, st.ReservedImages)
	require.NoError(t, s.SettleImage(user, task, "succeeded"))
	st, e = s.Status(admin, "alice")
	require.NoError(t, e)
	require.Zero(t, st.UsedImages)
	task = uuid.NewString()
	_, e = s.ReserveImage(user, task)
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(user, task, "succeeded"))
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Hour)).Error)
	st, e = s.Apply(admin, "alice", Mutation{OperationID: "image-extend", Kind: "extend", DurationDays: 1})
	require.NoError(t, e)
	require.EqualValues(t, 3, st.ImageLimit)
	require.EqualValues(t, 1, st.UsedImages)
}

func TestImageIdentityOwnershipAndAccessBoundaries(t *testing.T) {
	s, admin := imageFixture(t)
	user := questionUser(admin, "alice")
	task := uuid.NewString()
	_, e := s.ReserveImage(context.Background(), task)
	require.ErrorIs(t, e, ErrForbidden)
	_, e = s.ReserveImage(admin, task)
	require.NoError(t, e)
	_, e = s.ReserveImage(user, "invalid-task")
	require.Error(t, e)
	_, e = s.ReserveImage(user, task)
	require.NoError(t, e)
	grantQuestions(t, s, admin, "bob", 0)
	require.ErrorIs(t, s.SettleImage(questionUser(admin, "bob"), task, "failed"), gorm.ErrRecordNotFound)
	forged := context.WithValue(user, types.SystemAdminContextKey, true)
	_, e = s.ReserveImage(forged, uuid.NewString())
	require.ErrorIs(t, e, ErrUnavailable)
	require.Error(t, s.SettleImage(user, task, "invented"))
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "suspend-image", Kind: "suspend"})
	require.NoError(t, e)
	_, e = s.ReserveImage(user, uuid.NewString())
	require.ErrorIs(t, e, ErrSuspended)
	require.NoError(t, s.SettleImage(user, task, "failed"))
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "resume-image", Kind: "resume"})
	require.NoError(t, e)
	task = uuid.NewString()
	_, e = s.ReserveImage(user, task)
	require.NoError(t, e)
	require.NoError(t, s.db.Exec("UPDATE users SET is_active = false WHERE id = 'alice'").Error)
	_, e = s.ReserveImage(user, uuid.NewString())
	require.ErrorIs(t, e, ErrForbidden)
	require.NoError(t, s.SettleImage(user, task, "unknown"))
	_, e = s.Apply(admin, "alice", Mutation{OperationID: "disabled-image-resolve", Kind: "resolve_image", ImageTaskID: task, ImageOutcome: "succeeded"})
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(user, task, "succeeded"))
}

func TestImageMutationKeepsPriorQuestionFingerprintAndExplicitZeroDistinct(t *testing.T) {
	s, admin := questionFixture(t)
	req := Mutation{OperationID: "old-question-image-retry", Kind: "grant", DurationDays: 3, Tokens: 1000, Questions: questions(2), Note: "old contract"}
	old := struct {
		OperationID   string `json:"operation_id"`
		Kind          string `json:"kind"`
		PlanID        string `json:"plan_id,omitempty"`
		DurationDays  int    `json:"duration_days,omitempty"`
		Tokens        int64  `json:"tokens,omitempty"`
		Questions     *int64 `json:"questions,omitempty"`
		QuestionLimit *int64 `json:"question_limit,omitempty"`
		Note          string `json:"note,omitempty"`
	}{req.OperationID, req.Kind, req.PlanID, req.DurationDays, req.Tokens, req.Questions, req.QuestionLimit, req.Note}
	legacy, e := json.Marshal(struct {
		UserID   string
		Mutation any
	}{"alice", old})
	require.NoError(t, e)
	current, e := json.Marshal(struct {
		UserID   string
		Mutation Mutation
	}{"alice", req})
	require.NoError(t, e)
	require.Equal(t, string(legacy), string(current))
	_, e = s.Apply(admin, "alice", req)
	require.NoError(t, e)
	var row Adjustment
	require.NoError(t, s.db.Where("operation_id = ?", req.OperationID).Take(&row).Error)
	digest := sha256.Sum256(legacy)
	require.Equal(t, hex.EncodeToString(digest[:]), row.Fingerprint)
	_, e = s.Apply(admin, "alice", req)
	require.NoError(t, e)
	req.Images = questions(0)
	_, e = s.Apply(admin, "alice", req)
	require.ErrorIs(t, e, ErrConflict)
}

// Stable seam: one real membership, independent quotas, real transactional DB.
func TestImageLastSlotIndependentFromChatAndIdempotentSettlement(t *testing.T) {
	s, admin := imageFixture(t)
	user := questionUser(admin, "alice")
	var wg sync.WaitGroup
	var mu sync.Mutex
	tasks := []string{}
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task := uuid.NewString()
			id, e := s.ReserveImage(user, task)
			mu.Lock()
			defer mu.Unlock()
			if e == nil {
				require.NotEmpty(t, id)
				tasks = append(tasks, task)
			} else {
				require.ErrorIs(t, e, ErrUnavailable)
			}
		}()
	}
	wg.Wait()
	require.Len(t, tasks, 1)
	first, e := s.ReserveImage(user, tasks[0])
	require.NoError(t, e)
	again, e := s.ReserveImage(user, tasks[0])
	require.NoError(t, e)
	require.Equal(t, first, again)
	require.NoError(t, s.SettleImage(user, tasks[0], "succeeded"))
	require.NoError(t, s.SettleImage(user, tasks[0], "succeeded"))
	st, e := s.Status(admin, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 1, st.UsedImages)
	require.Zero(t, st.ReservedImages)
	require.Zero(t, st.RemainingImages)
	require.EqualValues(t, 1000, st.UsedTokens)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.ErrorIs(t, s.SettleImage(user, tasks[0], "failed"), ErrConflict)
}

func TestImageUnknownNeverSilentlyReleasesAndDefiniteFailureDoes(t *testing.T) {
	s, admin := imageFixture(t)
	user := questionUser(admin, "alice")
	task := uuid.NewString()
	_, e := s.ReserveImage(user, task)
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(user, task, "unknown"))
	require.NoError(t, s.SettleImage(user, task, "unknown"))
	require.NoError(t, s.db.Model(&ImageCall{}).Where("task_id = ?", task).Update("created_at", time.Now().Add(-48*time.Hour)).Error)
	require.NoError(t, s.RecoverPending(admin))
	st, e := s.Status(admin, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 1, st.ReservedImages)
	_, e = s.ReserveImage(user, uuid.NewString())
	require.ErrorIs(t, e, ErrUnavailable)
	require.NoError(t, s.SettleImage(user, task, "failed"))
	require.NoError(t, s.SettleImage(user, task, "failed"))
	_, e = s.ReserveImage(user, task)
	require.ErrorIs(t, e, ErrConflict)
	_, e = s.ReserveImage(user, uuid.NewString())
	require.NoError(t, e)
}
