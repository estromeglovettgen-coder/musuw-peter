package firebilling

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestQuestionTenantAPIUsesNativeOwnerQuotaAndPrincipalSessionScope(t *testing.T) {
	s, admin := questionFixture(t)
	grantQuestions(t, s, admin, "alice", 1)
	require.NoError(t, s.db.Exec("INSERT INTO sessions (id,user_id,tenant_id) VALUES ('key-session','api_tenant_key:2:7',2),('other-key','api_tenant_key:2:8',2)").Error)
	ctx := context.WithValue(context.Background(), types.UserIDContextKey, "system-2")
	ctx = context.WithValue(ctx, types.TenantIDContextKey, uint64(2))
	ctx = types.WithPrincipal(ctx, types.Principal{Type: types.PrincipalAPITenant, ID: "2"})
	ctx = types.WithTenantAPIKeyScope(ctx, types.TenantAPIKeyScope{KeyID: 7, ScopeType: types.APIKeyScopeTenant, FullAccess: true})
	_, err := s.BeginQuestion(ctx, "wrong-key-message", "other-key")
	require.ErrorIs(t, err, ErrForbidden)
	id, err := s.BeginQuestion(ctx, "api-question", "key-session")
	require.NoError(t, err)
	require.NotEmpty(t, id)
	var question QuestionCall
	require.NoError(t, s.db.Where("id = ?", id).Take(&question).Error)
	require.Equal(t, "alice", question.UserID)
	provider, err := s.Reserve(ctx, "chat", "fixture", 10)
	require.NoError(t, err)
	require.NoError(t, s.Settle(ctx, provider, 3, 2, false, false))
	require.NoError(t, s.SettleQuestion(ctx, id, true))
	_, err = s.BeginQuestion(questionUser(admin, "alice"), "web-question", "alice-session")
	require.ErrorIs(t, err, ErrUnavailable, "API questions and web questions share the same owner's cap")
	zero := int64(0)
	_, err = s.Apply(admin, "alice", Mutation{OperationID: "api-unlimited", Kind: "set_question_limit", QuestionLimit: &zero})
	require.NoError(t, err)
	id, err = s.BeginQuestion(ctx, "unlimited-api", "key-session")
	require.NoError(t, err)
	require.Empty(t, id)
	for _, bad := range []context.Context{
		context.WithValue(context.Background(), types.UserIDContextKey, "system-2"),
		context.WithValue(ctx, types.TenantIDContextKey, uint64(999)),
		context.WithValue(ctx, types.UserIDContextKey, "api_platform:999"),
	} {
		_, err = s.BeginQuestion(bad, "bad-identity", "key-session")
		require.ErrorIs(t, err, ErrForbidden)
	}
}
