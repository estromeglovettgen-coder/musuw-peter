package firebilling

import (
	"context"
	"fmt"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"sync"
	"testing"
	"time"
)

func fixture(t *testing.T) (*Service, context.Context) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id INTEGER, is_system_admin BOOLEAN, is_active BOOLEAN)").Error)
	require.NoError(t, db.Exec("INSERT INTO users VALUES ('admin',1,true,true),('alice',2,false,true),('bob',3,false,true)").Error)
	require.NoError(t, db.AutoMigrate(&Plan{}, &Membership{}, &Adjustment{}, &Call{}))
	ctx := context.WithValue(context.Background(), types.UserIDContextKey, "admin")
	return NewService(db), ctx
}

func TestMembershipLifecycleAndIdempotency(t *testing.T) {
	s, ctx := fixture(t)
	req := Mutation{OperationID: "grant-1", Kind: "grant", DurationDays: 30, Tokens: 1000}
	a, e := s.Apply(ctx, "alice", req)
	require.NoError(t, e)
	require.EqualValues(t, 1000, a.RemainingTokens)
	b, e := s.Apply(ctx, "alice", req)
	require.NoError(t, e)
	require.Equal(t, a.ExpiresAt, b.ExpiresAt)
	req.Tokens++
	_, e = s.Apply(ctx, "alice", req)
	require.ErrorIs(t, e, ErrConflict)
	_, e = s.Apply(context.WithValue(ctx, types.UserIDContextKey, "bob"), "alice", Mutation{OperationID: "bad", Kind: "topup", Tokens: 1})
	require.ErrorIs(t, e, ErrForbidden)
	a, e = s.Apply(ctx, "alice", Mutation{OperationID: "topup", Kind: "topup", Tokens: 7})
	require.NoError(t, e)
	require.EqualValues(t, 1007, a.TokenLimit)
	require.Equal(t, b.ExpiresAt, a.ExpiresAt)
	before := a.ExpiresAt
	a, e = s.Apply(ctx, "alice", Mutation{OperationID: "renew", Kind: "renew", DurationDays: 5, Tokens: 20})
	require.NoError(t, e)
	require.EqualValues(t, 1027, a.TokenLimit)
	require.Equal(t, before.Add(5*24*time.Hour), *a.ExpiresAt)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Hour)).Error)
	a, e = s.Apply(ctx, "alice", Mutation{OperationID: "restart", Kind: "renew", DurationDays: 1, Tokens: 100})
	require.NoError(t, e)
	require.EqualValues(t, 100, a.RemainingTokens)
}

func TestReservationsCannotOversellAndSettlementIsOnce(t *testing.T) {
	s, ctx := fixture(t)
	_, e := s.Apply(ctx, "alice", Mutation{OperationID: "g", Kind: "grant", DurationDays: 1, Tokens: 100})
	require.NoError(t, e)
	userCtx := context.WithValue(ctx, types.UserIDContextKey, "alice")
	var wg sync.WaitGroup
	var mu sync.Mutex
	ids := []string{}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, e := s.Reserve(userCtx, "chat", "model", 25)
			if e == nil {
				mu.Lock()
				ids = append(ids, id)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	require.Len(t, ids, 4)
	require.NoError(t, s.Settle(context.Background(), ids[0], 10, 5, false, false))
	require.NoError(t, s.Settle(context.Background(), ids[0], 10, 5, false, false))
	a, e := s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 15, a.UsedTokens)
	require.EqualValues(t, 75, a.ReservedTokens)
	require.EqualValues(t, 10, a.RemainingTokens)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "pause", Kind: "suspend"})
	require.NoError(t, e)
	_, e = s.Reserve(userCtx, "chat", "m", 1)
	require.ErrorIs(t, e, ErrSuspended)
	for _, id := range ids[1:] {
		require.NoError(t, s.Settle(context.Background(), id, 0, 0, false, true))
	}
	a, e = s.Status(ctx, "alice")
	require.NoError(t, e)
	require.Zero(t, a.ReservedTokens)
	id, e := s.Reserve(ctx, "chat", "m", 999999)
	require.NoError(t, e)
	require.Empty(t, id)
}

func TestAdminAsyncExemptionRechecksRevocablePlatformKey(t *testing.T) {
	s, ctx := fixture(t)
	require.NoError(t, s.db.AutoMigrate(&types.TenantAPIKey{}))
	key := types.TenantAPIKey{ID: 7, Name: "fixture", ScopeType: types.APIKeyScopePlatform, KeyHash: "test-only-hash", Capabilities: types.StringArray{string(types.APIKeyCapabilitySystemTenantsManage)}}
	require.NoError(t, s.db.Create(&key).Error)
	worker := types.TaskInitiator{UserID: types.PrincipalAPIPlatform + ":7", Role: types.TenantRoleOwner}.Apply(context.Background())
	id, _, e := s.Begin(worker, "summary", "model", 10, 20)
	require.NoError(t, e)
	require.Empty(t, id)
	now := time.Now()
	require.NoError(t, s.db.Model(&key).Update("revoked_at", &now).Error)
	_, _, e = s.Begin(worker, "summary", "model", 10, 20)
	require.Error(t, e)
	// A forged context flag must not bypass the DB-backed human admin check.
	ordinary := context.WithValue(ctx, types.UserIDContextKey, "bob")
	ordinary = context.WithValue(ordinary, types.SystemAdminContextKey, true)
	require.ErrorIs(t, s.RequireAdmin(ordinary), ErrForbidden)
}

func TestStartedCallSettlesAfterExpiryAndActualOverrunRemainsVisible(t *testing.T) {
	s, ctx := fixture(t)
	_, e := s.Apply(ctx, "alice", Mutation{OperationID: "g", Kind: "grant", DurationDays: 1, Tokens: 100})
	require.NoError(t, e)
	uctx := context.WithValue(ctx, types.UserIDContextKey, "alice")
	id, e := s.Reserve(uctx, "chat", "m", 100)
	require.NoError(t, e)
	require.NoError(t, s.db.Model(&Membership{}).Where("user_id = ?", "alice").Update("expires_at", time.Now().Add(-time.Minute)).Error)
	_, e = s.Apply(ctx, "alice", Mutation{OperationID: "bad-renew", Kind: "renew", DurationDays: 1, Tokens: 100})
	require.ErrorIs(t, e, ErrConflict)
	require.NoError(t, s.Settle(context.Background(), id, 80, 40, false, false))
	st, e := s.Status(ctx, "alice")
	require.NoError(t, e)
	require.EqualValues(t, 120, st.UsedTokens)
	require.Zero(t, st.RemainingTokens)
	require.Zero(t, st.ReservedTokens)
	require.Equal(t, "expired", st.Status)
	_, e = s.Reserve(uctx, "chat", "m", 1)
	require.ErrorIs(t, e, ErrExpired)
}

func TestQuotaDenialKeepsActionableStateSpecificCopy(t *testing.T) {
	s, ctx := fixture(t)
	user := context.WithValue(ctx, types.UserIDContextKey, "alice")
	_, _, err := s.Begin(user, "chat", "m", 1, 2)
	require.ErrorIs(t, err, ErrNotActivated)
	_, err = s.Apply(ctx, "alice", Mutation{OperationID: "grant-copy", Kind: "grant", DurationDays: 1, Tokens: 10})
	require.NoError(t, err)
	_, _, err = s.Begin(user, "chat", "m", 11, 12)
	require.ErrorIs(t, err, ErrUnavailable)
	require.Equal(t, "剩余额度不足，请联系管理员追加额度", err.Error())
	_, err = s.Apply(ctx, "alice", Mutation{OperationID: "pause-copy", Kind: "suspend"})
	require.NoError(t, err)
	_, _, err = s.Begin(user, "chat", "m", 1, 2)
	require.ErrorIs(t, err, ErrSuspended)
}
