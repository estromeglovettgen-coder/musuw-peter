package firebilling

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func questions(n int64) *int64 { return &n }

func questionFixture(t *testing.T) (*Service, context.Context) {
	t.Helper()
	s, admin := fixture(t)
	connection, err := s.db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, connection.Close()) })
	require.NoError(t, s.db.Exec(`CREATE TABLE sessions (
		id TEXT PRIMARY KEY, user_id TEXT, tenant_id INTEGER, deleted_at DATETIME
	)`).Error)
	require.NoError(t, s.db.Exec(`INSERT INTO sessions (id,user_id,tenant_id) VALUES
		('alice-session','alice',2),('alice-second-session','alice',2),
		('bob-session','bob',3),('admin-session','admin',1),
		('same-tenant-other-user','other',2)
	`).Error)
	return s, admin
}

func questionUser(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, types.UserIDContextKey, id)
}

func grantQuestions(t *testing.T, s *Service, admin context.Context, user string, limit int64) *Status {
	t.Helper()
	st, err := s.Apply(admin, user, Mutation{
		OperationID: "grant-" + user, Kind: "grant", DurationDays: 1,
		Tokens: 1000, Questions: questions(limit),
	})
	require.NoError(t, err)
	return st
}

// The final question slot must admit exactly one complete user turn, while all
// provider rounds inside that admitted turn keep their independent Token meter.
func TestQuestionLastSlotCannotOversellOrBlockItsProviderRounds(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 1)
	user := questionUser(admin, "alice")
	var wg sync.WaitGroup
	var mu sync.Mutex
	var admitted []string
	var failures []error
	for i := range 16 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id, err := s.BeginQuestion(user, fmt.Sprintf("message-%d", i), "alice-session")
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failures = append(failures, err)
				return
			}
			admitted = append(admitted, id)
		}(i)
	}
	wg.Wait()
	require.Len(t, admitted, 1)
	require.NotEmpty(t, admitted[0])
	require.Len(t, failures, 15)
	for _, err := range failures {
		require.ErrorIs(t, err, ErrUnavailable)
	}
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.Equal(t, "active", st.Status, "a reserved final turn has not yet consumed the question")
	require.EqualValues(t, 0, st.UsedQuestions)
	require.EqualValues(t, 1, st.ReservedQuestions)
	require.Zero(t, st.RemainingQuestions)

	for range 3 {
		callID, cap, err := s.Begin(user, "agent_round", "fixture-model", 5, 50)
		require.NoError(t, err, "reserving the final question must not prevent its own model calls")
		require.EqualValues(t, 50, cap)
		require.NotEmpty(t, callID)
		require.NoError(t, s.Settle(context.Background(), callID, 5, 3, false, false))
	}
	require.NoError(t, s.SettleQuestion(context.Background(), admitted[0], true))
	require.NoError(t, s.SettleQuestion(context.Background(), admitted[0], true))
	require.NoError(t, s.SettleQuestion(context.Background(), admitted[0], false))
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 24, st.UsedTokens)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	require.Equal(t, "exhausted", st.Status)
	_, err = s.BeginQuestion(user, "one-too-many", "alice-session")
	require.ErrorIs(t, err, ErrUnavailable)
}

func TestQuestionRetriesAreIdempotentBeforeAndAfterDelivery(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 3)
	user := questionUser(admin, "alice")
	type result struct {
		id  string
		err error
	}
	results := make(chan result, 8)
	for range 8 {
		go func() {
			id, err := s.BeginQuestion(user, "same-message", "alice-session")
			results <- result{id, err}
		}()
	}
	first := ""
	for range 8 {
		r := <-results
		require.NoError(t, r.err)
		if first == "" {
			first = r.id
		}
		require.Equal(t, first, r.id)
	}
	require.NotEmpty(t, first)
	for range 3 {
		id, err := s.BeginQuestion(user, "same-message", "alice-session")
		require.NoError(t, err)
		require.Equal(t, first, id)
	}
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 1, st.ReservedQuestions)
	require.NoError(t, s.SettleQuestion(context.Background(), first, true))
	id, err := s.BeginQuestion(user, "same-message", "alice-session")
	require.NoError(t, err)
	require.Equal(t, first, id)
	require.NoError(t, s.SettleQuestion(context.Background(), id, true))
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	require.EqualValues(t, 2, st.RemainingQuestions)
	var count int64
	require.NoError(t, s.db.Model(&QuestionCall{}).Where("user_id = ?", "alice").Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestQuestionFailedTurnReleasesItsSlotExactlyOnce(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 1)
	user := questionUser(admin, "alice")
	id, err := s.BeginQuestion(user, "failed-message", "alice-session")
	require.NoError(t, err)
	require.NoError(t, s.SettleQuestion(context.Background(), id, false))
	require.NoError(t, s.SettleQuestion(context.Background(), id, false))
	require.NoError(t, s.SettleQuestion(context.Background(), id, true), "a late success callback must not revive a released turn")
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 0, st.UsedQuestions)
	require.EqualValues(t, 0, st.ReservedQuestions)
	require.EqualValues(t, 1, st.RemainingQuestions)
	require.Equal(t, "active", st.Status)
	_, err = s.BeginQuestion(user, "failed-message", "alice-session")
	require.ErrorIs(t, err, ErrConflict, "a released assistant id cannot start a new paid turn")
	id, err = s.BeginQuestion(user, "new-retry-message", "alice-session")
	require.NoError(t, err)
	require.NotEmpty(t, id)
	require.NoError(t, s.SettleQuestion(context.Background(), id, true))
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 1, st.UsedQuestions)
}

func TestQuestionCannotChargeOrReplayAnotherSession(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 3)
	user := questionUser(admin, "alice")
	for _, sessionID := range []string{"bob-session", "same-tenant-other-user", "missing-session", ""} {
		id, err := s.BeginQuestion(user, "bad-"+sessionID, sessionID)
		require.Error(t, err, "must not admit inaccessible session %q", sessionID)
		require.Empty(t, id)
	}
	id, err := s.BeginQuestion(user, "one-message", "alice-session")
	require.NoError(t, err)
	require.NotEmpty(t, id)
	_, err = s.BeginQuestion(user, "one-message", "alice-second-session")
	require.ErrorIs(t, err, ErrConflict, "an idempotent key may not be rebound to a different session")
	require.NoError(t, s.db.Exec("UPDATE sessions SET deleted_at = ? WHERE id = ?", time.Now(), "alice-second-session").Error)
	_, err = s.BeginQuestion(user, "deleted-session-message", "alice-second-session")
	require.Error(t, err)
	_, err = s.BeginQuestion(user, "", "alice-session")
	require.Error(t, err, "the assistant message id is required for settlement idempotency")
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 1, st.ReservedQuestions)
	require.Zero(t, st.UsedQuestions)
	var count int64
	require.NoError(t, s.db.Model(&QuestionCall{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestQuestionLimitZeroIsLegacyUnlimitedButNeverAnIdentityBypass(t *testing.T) {
	s, admin := questionFixture(t)
	st := grantQuestions(t, s, admin, "alice", 0)
	require.Zero(t, st.QuestionLimit)
	id, err := s.BeginQuestion(questionUser(admin, "alice"), "unlimited-message", "alice-session")
	require.NoError(t, err)
	require.Empty(t, id)
	callID, _, err := s.Begin(questionUser(admin, "alice"), "chat", "fixture-model", 5, 50)
	require.NoError(t, err)
	require.NotEmpty(t, callID, "unlimited questions must not exempt the user's Token ledger")
	require.NoError(t, s.Settle(context.Background(), callID, 20, 5, false, false))
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 25, st.UsedTokens)
	id, err = s.BeginQuestion(admin, "admin-message", "admin-session")
	require.NoError(t, err)
	require.Empty(t, id)
	require.NoError(t, s.SettleQuestion(context.Background(), "", true))
	var count int64
	require.NoError(t, s.db.Model(&QuestionCall{}).Count(&count).Error)
	require.Zero(t, count)
	for _, ctx := range []context.Context{context.Background(), questionUser(admin, "missing-user")} {
		_, err := s.BeginQuestion(ctx, "unauthorized-message", "unknown-session")
		require.ErrorIs(t, err, ErrForbidden)
	}
	grantQuestions(t, s, admin, "bob", 1)
	forgedBob := context.WithValue(questionUser(admin, "bob"), types.SystemAdminContextKey, true)
	id, err = s.BeginQuestion(forgedBob, "forged-admin-message", "bob-session")
	require.NoError(t, err)
	require.NotEmpty(t, id, "a caller-selected context flag must not exempt an ordinary user")
	require.NoError(t, s.db.Exec("UPDATE users SET is_active = false WHERE id = ?", "alice").Error)
	forged := context.WithValue(questionUser(admin, "alice"), types.SystemAdminContextKey, true)
	_, err = s.BeginQuestion(forged, "inactive-message", "alice-session")
	require.ErrorIs(t, err, ErrForbidden)
}

func TestQuestionAdmissionPreservesMembershipAccessStates(t *testing.T) {
	for _, limit := range []int64{0, 2} {
		t.Run(fmt.Sprintf("limit-%d", limit), func(t *testing.T) {
			s, admin := questionFixture(t)
			user := questionUser(admin, "alice")
			_, err := s.BeginQuestion(user, "before-grant", "alice-session")
			require.ErrorIs(t, err, ErrNotActivated)
			grantQuestions(t, s, admin, "alice", limit)
			_, err = s.Apply(admin, "alice", Mutation{OperationID: "pause", Kind: "suspend"})
			require.NoError(t, err)
			_, err = s.BeginQuestion(user, "while-paused", "alice-session")
			require.ErrorIs(t, err, ErrSuspended)
			_, err = s.Apply(admin, "alice", Mutation{OperationID: "resume", Kind: "resume"})
			require.NoError(t, err)
			require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Minute)).Error)
			_, err = s.BeginQuestion(user, "after-expiry", "alice-session")
			require.ErrorIs(t, err, ErrExpired)
			var count int64
			require.NoError(t, s.db.Model(&QuestionCall{}).Count(&count).Error)
			require.Zero(t, count, "denied and unlimited requests must not create reservations")
		})
	}
}

func TestQuestionPlanInheritanceAndExplicitUnlimitedOverride(t *testing.T) {
	s, admin := questionFixture(t)
	require.NoError(t, s.db.Create(&Plan{
		ID: "limited-plan", Name: "Limited", DurationDays: 30,
		TokenLimit: 1000, QuestionLimit: 7, Active: true,
	}).Error)
	a, err := s.Apply(admin, "alice", Mutation{OperationID: "plan-alice", Kind: "grant", PlanID: "limited-plan"})
	require.NoError(t, err)
	require.EqualValues(t, 7, a.QuestionLimit)
	require.NoError(t, s.db.Model(&Plan{}).Where("id = ?", "limited-plan").Update("question_limit", 99).Error)
	a, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 7, a.QuestionLimit, "template edits must not rewrite issued question allowances")
	b, err := s.Apply(admin, "bob", Mutation{OperationID: "plan-bob", Kind: "grant", PlanID: "limited-plan", Questions: questions(0)})
	require.NoError(t, err)
	require.Zero(t, b.QuestionLimit, "an explicit zero must override the selected plan")
	require.NoError(t, s.db.Create(&Plan{
		ID: "legacy-plan", Name: "Legacy", DurationDays: 30, TokenLimit: 1000, Active: true,
	}).Error)
	require.NoError(t, s.db.Exec("UPDATE fire_token_memberships SET expires_at = ? WHERE user_id = ?", time.Now().Add(-time.Minute), "alice").Error)
	a, err = s.Apply(admin, "alice", Mutation{OperationID: "legacy-plan-alice", Kind: "renew", PlanID: "legacy-plan"})
	require.NoError(t, err)
	require.Zero(t, a.QuestionLimit)
	require.Zero(t, a.UsedQuestions)
	require.Zero(t, a.ReservedQuestions)
}

func TestQuestionLimitMutationDoesNotInvalidateInFlightWork(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 3)
	user := questionUser(admin, "alice")
	first, err := s.BeginQuestion(user, "delivered-message", "alice-session")
	require.NoError(t, err)
	require.NoError(t, s.SettleQuestion(context.Background(), first, true))
	pending, err := s.BeginQuestion(user, "pending-message", "alice-session")
	require.NoError(t, err)
	_, err = s.Apply(admin, "alice", Mutation{OperationID: "too-low", Kind: "set_question_limit", QuestionLimit: questions(1)})
	require.Error(t, err)
	st, err := s.Apply(admin, "alice", Mutation{OperationID: "exact-cap", Kind: "set_question_limit", QuestionLimit: questions(2)})
	require.NoError(t, err)
	require.EqualValues(t, 2, st.QuestionLimit)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.EqualValues(t, 1, st.ReservedQuestions)
	require.Equal(t, "active", st.Status)
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "turn-off", Kind: "set_question_limit", QuestionLimit: questions(0)})
	require.NoError(t, err)
	require.Zero(t, st.QuestionLimit)
	require.NoError(t, s.SettleQuestion(context.Background(), pending, true))
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "restore-limit", Kind: "set_question_limit", QuestionLimit: questions(3)})
	require.NoError(t, err)
	require.EqualValues(t, 2, st.UsedQuestions)
	topup := Mutation{OperationID: "questions-only-topup", Kind: "topup", Questions: questions(2)}
	st, err = s.Apply(admin, "alice", topup)
	require.NoError(t, err)
	require.EqualValues(t, 5, st.QuestionLimit)
	require.EqualValues(t, 1000, st.TokenLimit)
	st, err = s.Apply(admin, "alice", topup)
	require.NoError(t, err)
	require.EqualValues(t, 5, st.QuestionLimit)
	topup.Questions = questions(3)
	_, err = s.Apply(admin, "alice", topup)
	require.ErrorIs(t, err, ErrConflict, "the question count must participate in the idempotency fingerprint")
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "tokens-only-topup", Kind: "topup", Tokens: 20})
	require.NoError(t, err)
	require.EqualValues(t, 5, st.QuestionLimit)
	require.EqualValues(t, 1020, st.TokenLimit)

	for i, mutation := range []Mutation{
		{Kind: "topup", Questions: questions(0)},
		{Kind: "topup", Questions: questions(-1)},
		{Kind: "topup", Questions: questions(MaxQuestions + 1)},
		{Kind: "topup", Questions: questions(MaxQuestions)},
		{Kind: "extend", DurationDays: 1, Questions: questions(1)},
		{Kind: "extend", DurationDays: 1, Questions: questions(0)},
		{Kind: "suspend", Questions: questions(1)},
		{Kind: "resume", Questions: questions(0)},
		{Kind: "set_question_limit"},
		{Kind: "set_question_limit", QuestionLimit: questions(MaxQuestions + 1)},
		{Kind: "set_question_limit", QuestionLimit: questions(1), Tokens: 10},
		{Kind: "topup", Tokens: 1, QuestionLimit: questions(3)},
	} {
		mutation.OperationID = fmt.Sprintf("invalid-question-mutation-%d", i)
		_, err := s.Apply(admin, "alice", mutation)
		require.Error(t, err, "must reject the incompatible mutation %#v", mutation)
	}
	bob := grantQuestions(t, s, admin, "bob", 9)
	require.EqualValues(t, 9, bob.RemainingQuestions)
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 5, st.QuestionLimit, "another user's mutation must not change this membership")
	require.EqualValues(t, 2, st.UsedQuestions)
}

func TestQuestionRenewalResetsOnlyAfterOldReservationsSettle(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 2)
	user := questionUser(admin, "alice")
	id, err := s.BeginQuestion(user, "old-period-message", "alice-session")
	require.NoError(t, err)
	var before Membership
	require.NoError(t, s.db.First(&before, "user_id = ?", "alice").Error)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Minute)).Error)
	_, err = s.Apply(admin, "alice", Mutation{OperationID: "reserved-renew", Kind: "renew", DurationDays: 1, Tokens: 100, Questions: questions(4)})
	require.ErrorIs(t, err, ErrConflict)
	require.NoError(t, s.SettleQuestion(context.Background(), id, true), "a started answer may settle after expiry")
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.Equal(t, "expired", st.Status)
	require.EqualValues(t, 1, st.UsedQuestions)
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "new-period-renew", Kind: "renew", DurationDays: 1, Tokens: 100, Questions: questions(4)})
	require.NoError(t, err)
	require.EqualValues(t, 4, st.QuestionLimit)
	require.Zero(t, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	var after Membership
	require.NoError(t, s.db.First(&after, "user_id = ?", "alice").Error)
	require.NotEqual(t, before.PeriodID, after.PeriodID)
	require.NoError(t, s.SettleQuestion(context.Background(), id, true), "an old retry may not consume the new period")
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "active-renew", Kind: "renew", DurationDays: 1, Tokens: 50, Questions: questions(2)})
	require.NoError(t, err)
	require.EqualValues(t, 6, st.QuestionLimit)
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "active-renew-zero", Kind: "renew", DurationDays: 1, Tokens: 50, Questions: questions(0)})
	require.NoError(t, err)
	require.EqualValues(t, 6, st.QuestionLimit, "zero must not remove an active period's existing cap")
}

func TestQuestionExpiredExtensionDoesNotRestoreConsumedQuestions(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 3)
	user := questionUser(admin, "alice")
	delivered, err := s.BeginQuestion(user, "answered-before-expiry", "alice-session")
	require.NoError(t, err)
	require.NoError(t, s.SettleQuestion(context.Background(), delivered, true))
	pending, err := s.BeginQuestion(user, "pending-at-expiry", "alice-session")
	require.NoError(t, err)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Minute)).Error)
	_, err = s.Apply(admin, "alice", Mutation{OperationID: "extension-while-pending", Kind: "extend", DurationDays: 1})
	require.ErrorIs(t, err, ErrConflict)
	require.NoError(t, s.SettleQuestion(context.Background(), pending, false))
	st, err := s.Apply(admin, "alice", Mutation{OperationID: "extension-after-settlement", Kind: "extend", DurationDays: 1})
	require.NoError(t, err)
	require.EqualValues(t, 3, st.QuestionLimit)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	require.EqualValues(t, 2, st.RemainingQuestions)
	require.Zero(t, st.TokenLimit, "extending days must not revive expired Token balances")
	st, err = s.Apply(admin, "alice", Mutation{OperationID: "topup-after-extension", Kind: "topup", Tokens: 100})
	require.NoError(t, err)
	require.Equal(t, "active", st.Status)
	require.EqualValues(t, 3, st.QuestionLimit)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.NoError(t, s.SettleQuestion(context.Background(), delivered, true))
	st, err = s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 1, st.UsedQuestions, "an old completion retry cannot consume the extended period twice")
}

func TestQuestionRecoveryUsesPersistedVisibleAnswerAndLeavesLiveRequestsAlone(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 10)
	user := questionUser(admin, "alice")
	require.NoError(t, s.db.Exec(`CREATE TABLE messages (
		id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT,
		is_completed BOOLEAN, is_fallback BOOLEAN DEFAULT false, deleted_at DATETIME
	)`).Error)
	old := time.Now().Add(-21 * time.Minute)
	for _, tc := range []struct {
		id        string
		content   string
		role      string
		completed bool
		fallback  bool
		sessionID string
		deleted   bool
		missing   bool
		fresh     bool
	}{
		{id: "completed", content: "已经完成的回答", role: "assistant", completed: true},
		{id: "partial", content: "已经展示出来的一部分", role: "assistant"},
		{id: "blank", content: " \n\t", role: "assistant", completed: true},
		{id: "missing", missing: true},
		{id: "deleted", content: "已删除的内容", role: "assistant", completed: true, deleted: true},
		{id: "user-role", content: "用户的问题不是助手回答", role: "user", completed: true},
		{id: "fallback", content: "生成失败的占位回复", role: "assistant", fallback: true, completed: true},
		{id: "other-session", content: "其他会话的正文", role: "assistant", sessionID: "bob-session", completed: true},
		{id: "live", content: "还在生成中的回答", role: "assistant", fresh: true},
	} {
		id, err := s.BeginQuestion(user, tc.id, "alice-session")
		require.NoError(t, err)
		require.NotEmpty(t, id)
		if !tc.fresh {
			require.NoError(t, s.db.Model(&QuestionCall{}).Where("id = ?", id).Update("created_at", old).Error)
		}
		if !tc.missing {
			var deleted *time.Time
			if tc.deleted {
				now := time.Now()
				deleted = &now
			}
			sessionID := tc.sessionID
			if sessionID == "" {
				sessionID = "alice-session"
			}
			require.NoError(t, s.db.Exec("INSERT INTO messages (id,session_id,role,content,is_completed,is_fallback,deleted_at) VALUES (?,?,?,?,?,?,?)", tc.id, sessionID, tc.role, tc.content, tc.completed, tc.fallback, deleted).Error)
		}
	}
	require.NoError(t, s.RecoverPending(context.Background()))
	require.NoError(t, s.RecoverPending(context.Background()))
	st, err := s.Status(admin, "alice")
	require.NoError(t, err)
	require.EqualValues(t, 2, st.UsedQuestions, "completed and already-delivered partial responses both count")
	require.EqualValues(t, 1, st.ReservedQuestions, "the fresh in-progress response must keep its reservation")
	require.EqualValues(t, 7, st.RemainingQuestions)
	require.Zero(t, st.UsedTokens, "question recovery must not invent provider usage")
	var live QuestionCall
	require.NoError(t, s.db.First(&live, "message_id = ?", "live").Error)
	require.Equal(t, "reserved", live.Status)
}
