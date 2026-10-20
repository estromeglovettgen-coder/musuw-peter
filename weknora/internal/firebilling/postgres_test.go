package firebilling

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// This runs against a disposable PostgreSQL database/schema, never production.
func TestPostgresNativeMigrationAndConcurrentLedger(t *testing.T) {
	dsn := os.Getenv("FIRE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("FIRE_TEST_DATABASE_URL not set")
	}
	db, e := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	require.NoError(t, e)
	schema := "firetest_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	require.NoError(t, db.Exec("CREATE SCHEMA "+schema).Error)
	defer db.Exec("DROP SCHEMA " + schema + " CASCADE")
	u, e := url.Parse(dsn)
	require.NoError(t, e)
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	scoped, e := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	require.NoError(t, e)
	require.NoError(t, scoped.Exec("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, tenant_id BIGINT, is_system_admin BOOLEAN, is_active BOOLEAN)").Error)
	require.NoError(t, scoped.Exec("INSERT INTO users VALUES ('admin',1,true,true),('alice',2,false,true),('bob',3,false,true)").Error)
	require.NoError(t, scoped.Exec("CREATE TABLE tenants (id BIGINT PRIMARY KEY)").Error)
	for _, name := range []string{"000112_fire_token_memberships", "000113_fire_workspace_accounts"} {
		migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", "versioned", name+".up.sql"))
		require.NoError(t, err)
		require.NoError(t, scoped.Exec(string(migration)).Error)
	}
	// The upgrade must retain an existing paid cycle and its actual usage.
	require.NoError(t, scoped.Exec("INSERT INTO fire_token_memberships (user_id,tenant_id,period_id,starts_at,expires_at,token_limit,used_tokens) VALUES ('bob',3,'old-period',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '1 day',700,123)").Error)
	migration, e := os.ReadFile(filepath.Join("..", "..", "migrations", "versioned", "000114_fire_question_allowances.up.sql"))
	require.NoError(t, e)
	require.NoError(t, scoped.Exec(string(migration)).Error)
	migration, e = os.ReadFile(filepath.Join("..", "..", "migrations", "versioned", "000115_fire_image_allowances.up.sql"))
	require.NoError(t, e)
	require.NoError(t, scoped.Exec(string(migration)).Error)
	var prior Membership
	require.NoError(t, scoped.Where("user_id = ?", "bob").Take(&prior).Error)
	require.Equal(t, "old-period", prior.PeriodID)
	require.EqualValues(t, 123, prior.UsedTokens)
	require.Zero(t, prior.QuestionLimit)
	require.Zero(t, prior.ReservedQuestions)
	require.Zero(t, prior.ImageLimit)
	require.Zero(t, prior.UsedImages)
	require.Zero(t, prior.ReservedImages)
	require.NoError(t, scoped.Exec("CREATE TABLE sessions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36), tenant_id BIGINT, deleted_at TIMESTAMPTZ)").Error)
	require.NoError(t, scoped.Exec("CREATE TABLE messages (id VARCHAR(36) PRIMARY KEY, session_id VARCHAR(36), role TEXT, content TEXT, is_fallback BOOLEAN NOT NULL DEFAULT FALSE, deleted_at TIMESTAMPTZ)").Error)
	require.NoError(t, scoped.Exec("INSERT INTO sessions VALUES ('alice-session','alice',2,NULL)").Error)
	s := NewService(scoped)
	ctx := context.WithValue(context.Background(), types.UserIDContextKey, "admin")
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "grant", Kind: "grant", DurationDays: 1, Tokens: 1000})
	require.NoError(t, e)
	userCtx := context.WithValue(ctx, types.UserIDContextKey, "alice")
	var wg sync.WaitGroup
	var mu sync.Mutex
	ids := []string{}
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, e := s.Reserve(userCtx, "chat", "fixture", 100)
			if e == nil {
				mu.Lock()
				ids = append(ids, id)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	require.Len(t, ids, 10)
	for _, id := range ids {
		for j := 0; j < 3; j++ {
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				require.NoError(t, s.Settle(context.Background(), id, 50, 25, false, false))
			}(id)
		}
	}
	wg.Wait()
	st, e := s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 750, st.UsedTokens)
	require.Zero(t, st.ReservedTokens)
	require.EqualValues(t, 250, st.RemainingTokens)
	// The same mutation request concurrently commits once, including all audit rows.
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, e := s.Apply(ctx, "alice", Mutation{OperationID: "same-topup", Kind: "topup", Tokens: 50})
			require.NoError(t, e)
		}()
	}
	wg.Wait()
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 300, st.RemainingTokens)
	id, e := s.Reserve(userCtx, "embedding", "fixture", 100)
	require.NoError(t, e)
	require.NoError(t, scoped.Model(&Call{}).Where("id = ?", id).Update("created_at", time.Now().Add(-time.Hour)).Error)
	require.NoError(t, s.RecoverPending(ctx))
	require.NoError(t, s.RecoverPending(ctx))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 100, st.EstimatedTokens)
	require.Zero(t, st.ReservedTokens)
	var count int64
	require.NoError(t, scoped.Model(&Adjustment{}).Count(&count).Error)
	require.EqualValues(t, 2, count)
	// A caller-selected user ID cannot authorize another user's mutations.
	_, e = s.Apply(userCtx, "bob", Mutation{OperationID: "forged", Kind: "grant", DurationDays: 1, Tokens: 1})
	require.ErrorIs(t, e, ErrForbidden)
	// Native PG row locks must admit exactly one last question. Provider
	// billing remains active while that question owns its reservation.
	one := int64(1)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "question-cap", Kind: "set_question_limit", QuestionLimit: &one})
	require.NoError(t, e)
	questionIDs := []string{}
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id, err := s.BeginQuestion(userCtx, fmt.Sprintf("assistant-%d", i), "alice-session")
			if err == nil {
				mu.Lock()
				questionIDs = append(questionIDs, id)
				mu.Unlock()
			} else {
				require.ErrorIs(t, err, ErrUnavailable)
			}
		}(i)
	}
	wg.Wait()
	require.Len(t, questionIDs, 1)
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.Equal(t, "active", st.Status)
	providerID, e := s.Reserve(userCtx, "chat", "fixture", 20)
	require.NoError(t, e)
	require.NoError(t, s.Settle(ctx, providerID, 4, 6, false, false))
	require.NoError(t, s.SettleQuestion(ctx, questionIDs[0], false))
	require.NoError(t, s.SettleQuestion(ctx, questionIDs[0], true))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.Zero(t, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	questionID, e := s.BeginQuestion(userCtx, "delivered-question", "alice-session")
	require.NoError(t, e)
	require.NoError(t, scoped.Exec("INSERT INTO messages (id,session_id,role,content) VALUES ('delivered-question','alice-session','assistant','  部分正文  ')").Error)
	require.NoError(t, scoped.Model(&QuestionCall{}).Where("id = ?", questionID).Update("created_at", time.Now().Add(-time.Hour)).Error)
	require.NoError(t, s.RecoverPending(ctx))
	require.NoError(t, s.RecoverPending(ctx))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 1, st.UsedQuestions)
	require.Zero(t, st.ReservedQuestions)
	require.Equal(t, "exhausted", st.Status)
	// New periods keep the old call history without reviving old charges.
	require.NoError(t, scoped.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Hour)).Error)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "question-renew", Kind: "renew", DurationDays: 1, Tokens: 500, Questions: &one})
	require.NoError(t, e)
	require.NoError(t, s.SettleQuestion(ctx, questionID, true))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.Zero(t, st.UsedQuestions)
	require.EqualValues(t, 1, st.RemainingQuestions)
	var history int64
	require.NoError(t, scoped.Model(&QuestionCall{}).Count(&history).Error)
	require.EqualValues(t, 2, history)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "image-cap", Kind: "set_image_limit", ImageLimit: &one})
	require.NoError(t, e)
	require.NoError(t, scoped.Model(&Membership{}).Where("user_id = ?", "alice").Updates(map[string]any{"used_tokens": 500, "used_questions": 1}).Error)
	imageTasks := []string{}
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task := uuid.NewString()
			_, err := s.ReserveImage(userCtx, task)
			if err == nil {
				mu.Lock()
				imageTasks = append(imageTasks, task)
				mu.Unlock()
			} else {
				require.ErrorIs(t, err, ErrUnavailable)
			}
		}()
	}
	wg.Wait()
	require.Len(t, imageTasks, 1)
	require.NoError(t, s.SettleImage(userCtx, imageTasks[0], "unknown"))
	require.NoError(t, scoped.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Hour)).Error)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "pending-image-renew", Kind: "renew", DurationDays: 1, Tokens: 100})
	require.ErrorIs(t, e, ErrConflict)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "image-resolve", Kind: "resolve_image", ImageTaskID: imageTasks[0], ImageOutcome: "succeeded"})
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(userCtx, imageTasks[0], "succeeded"))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 1, st.UsedImages)
	require.Zero(t, st.ReservedImages)
	require.EqualValues(t, 500, st.UsedTokens)
	require.EqualValues(t, 1, st.UsedQuestions)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "image-renew", Kind: "renew", DurationDays: 1, Tokens: 100, Images: &one})
	require.NoError(t, e)
	require.NoError(t, s.SettleImage(userCtx, imageTasks[0], "succeeded"))
	st, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.Zero(t, st.UsedImages)
	require.EqualValues(t, 1, st.RemainingImages)
	t.Log("PostgreSQL 113→114 preserves paid usage; token concurrency, question final-slot concurrency, idempotency, release, recovery and renewal passed")
	t.Log("PostgreSQL 114→115 preserves paid data; 20 concurrent final-image reservations, unknown retention, audited resolve and renewed-cycle idempotency passed")
}
