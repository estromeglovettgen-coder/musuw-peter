package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func legacyFireUser(t *testing.T, fire *FireWorkspaceService) *types.User {
	t.Helper()
	user := &types.User{ID: "legacy-user", TenantID: 200, Username: "legacy", Email: "legacy@example.test", PasswordHash: "preserved password hash", IsActive: true}
	require.NoError(t, fire.db.Create(&types.Tenant{ID: 200, Name: "legacy workspace", Status: "active"}).Error)
	require.NoError(t, fire.db.Create(user).Error)
	return user
}

func TestFireExistingAccountProvisioningPreservesIdentityPersonalDataAndPlan(t *testing.T) {
	fire := fireFixture(t)
	user := legacyFireUser(t, fire)
	require.NoError(t, fire.db.AutoMigrate(&firebilling.Plan{}, &firebilling.Membership{}, &firebilling.Adjustment{}, &firebilling.Call{}))
	_, err := firebilling.NewService(fire.db).Apply(fireAdminContext(), user.ID, firebilling.Mutation{OperationID: "legacy-plan", Kind: "grant", DurationDays: 3, Tokens: 500})
	require.NoError(t, err)
	personal := &types.CustomAgent{ID: "legacy-personal-agent", TenantID: user.TenantID, Name: "我的旧智能体", Config: types.CustomAgentConfig{SystemPrompt: "my own prompt"}}
	require.NoError(t, fire.db.Create(personal).Error)
	knowledge := &types.KnowledgeBase{ID: "legacy-private-target", TenantID: user.TenantID, Name: "已有目标资料", CustomerProfile: &types.CustomerProfile{}}
	require.NoError(t, fire.db.Create(knowledge).Error)
	var membershipBefore firebilling.Membership
	require.NoError(t, fire.db.Where("user_id = ?", user.ID).First(&membershipBefore).Error)
	userBefore, _ := json.Marshal(user)
	personalBefore, _ := json.Marshal(personal)
	knowledgeBefore, _ := json.Marshal(knowledge)

	result, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.NoError(t, err)
	require.Equal(t, user.ID, result.UserID)
	require.Equal(t, user.TenantID, result.TenantID)
	require.False(t, result.Existing)
	var grant types.FireWorkspaceAccount
	require.NoError(t, fire.db.Where("user_id = ?", user.ID).First(&grant).Error)
	require.Equal(t, types.FireDefaultAgentID, grant.DefaultAgentID)
	require.Equal(t, uint64(100), grant.SourceTenantID)
	grantBefore, _ := json.Marshal(grant)
	storedUser, err := repository.NewUserRepository(fire.db).GetUserByID(context.Background(), user.ID)
	require.NoError(t, err)
	userAfter, _ := json.Marshal(storedUser)
	require.JSONEq(t, string(userBefore), string(userAfter))
	require.Equal(t, user.PasswordHash, storedUser.PasswordHash)
	storedPersonal, err := repository.NewCustomAgentRepository(fire.db).GetAgentByID(context.Background(), personal.ID, user.TenantID)
	require.NoError(t, err)
	personalAfter, _ := json.Marshal(storedPersonal)
	require.JSONEq(t, string(personalBefore), string(personalAfter))
	storedKnowledge, err := repository.NewKnowledgeBaseRepository(fire.db).GetKnowledgeBaseByID(context.Background(), knowledge.ID)
	require.NoError(t, err)
	knowledgeAfter, _ := json.Marshal(storedKnowledge)
	require.JSONEq(t, string(knowledgeBefore), string(knowledgeAfter))
	var membershipAfter firebilling.Membership
	require.NoError(t, fire.db.Where("user_id = ?", user.ID).First(&membershipAfter).Error)
	require.Equal(t, membershipBefore, membershipAfter)

	again, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.NoError(t, err)
	require.True(t, again.Existing)
	require.NoError(t, fire.db.Where("user_id = ?", user.ID).First(&grant).Error)
	grantAfter, _ := json.Marshal(grant)
	require.JSONEq(t, string(grantBefore), string(grantAfter))
	var count int64
	require.NoError(t, fire.db.Model(&types.FireWorkspaceAccount{}).Where("tenant_id = ?", user.TenantID).Count(&count).Error)
	require.EqualValues(t, 1, count)
	require.NoError(t, fire.db.Model(&firebilling.Adjustment{}).Count(&count).Error)
	require.EqualValues(t, 1, count, "the maintenance action must not grant or renew a paid plan")

	shares := NewKBShareService(repository.NewKBShareRepository(fire.db), repository.NewOrganizationRepository(fire.db), repository.NewKnowledgeBaseRepository(fire.db), nil, nil, nil)
	allowed, err := shares.HasTenantKBPermission(context.Background(), "public-course", user.TenantID, types.TenantRoleOwner, types.OrgRoleViewer)
	require.NoError(t, err)
	require.True(t, allowed)
	allowed, err = shares.HasTenantKBPermission(context.Background(), "private-source-target", user.TenantID, types.TenantRoleOwner, types.OrgRoleViewer)
	require.NoError(t, err)
	require.False(t, allowed)
}

func TestFireExistingAccountRequiresRealActiveAdministrator(t *testing.T) {
	fire := fireFixture(t)
	user := legacyFireUser(t, fire)
	for _, tc := range []struct {
		name  string
		ctx   context.Context
		actor string
	}{
		{"anonymous", context.Background(), "source-user"},
		{"mismatched actor", fireAdminContext(), user.ID},
		{"forged admin flag", context.WithValue(context.WithValue(context.Background(), types.UserIDContextKey, user.ID), types.SystemAdminContextKey, true), user.ID},
		{"platform API key", types.WithTenantAPIKeyScope(fireAdminContext(), types.TenantAPIKeyScope{ScopeType: types.APIKeyScopePlatform, FullAccess: true}), "source-user"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := fire.ProvisionExistingAccount(tc.ctx, tc.actor, user.ID)
			require.ErrorIs(t, err, ErrFireProvisionForbidden)
		})
	}
	for _, update := range []map[string]any{{"is_active": false}, {"is_active": true, "deletion_requested_at": time.Now()}} {
		require.NoError(t, fire.db.Model(&types.User{}).Where("id = ?", "source-user").Updates(update).Error)
		_, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
		require.ErrorIs(t, err, ErrFireProvisionForbidden)
	}
	var count int64
	require.NoError(t, fire.db.Model(&types.FireWorkspaceAccount{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestFireExistingAccountResourceFailureRollsBackAndCanRetry(t *testing.T) {
	fire := fireFixture(t)
	user := legacyFireUser(t, fire)
	// Fail the final grant write after the native organization, share, member
	// and default agent were created. Every preceding write must roll back.
	require.NoError(t, fire.db.Callback().Create().Before("gorm:create").Register("fail_existing_grant", func(tx *gorm.DB) {
		if tx.Statement.Table == "fire_workspace_accounts" {
			tx.AddError(errors.New("injected grant persistence failure"))
		}
	}))
	_, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.ErrorContains(t, err, "injected grant persistence failure")
	var count int64
	for _, model := range []any{&types.FireWorkspaceAccount{}, &types.Organization{}, &types.OrganizationTenantMember{}, &types.KnowledgeBaseShare{}} {
		require.NoError(t, fire.db.Model(model).Count(&count).Error)
		require.Zero(t, count)
	}
	require.NoError(t, fire.db.Model(&types.CustomAgent{}).Where("tenant_id = ?", user.TenantID).Count(&count).Error)
	require.Zero(t, count)
	require.NoError(t, fire.db.Callback().Create().Remove("fail_existing_grant"))
	result, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.NoError(t, err)
	require.False(t, result.Existing)
	// An already-provisioned account does not replay resource or quota writes.
	result, err = fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.NoError(t, err)
	require.True(t, result.Existing)
}

func TestFireExistingAccountReusesExistingNativeGrantAndPreservesProtectedSnapshot(t *testing.T) {
	fire := fireFixture(t)
	user := legacyFireUser(t, fire)
	seeded, err := fire.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "seed-course-organization"}, nil)
	require.NoError(t, err)
	var org types.Organization
	require.NoError(t, fire.db.First(&org).Error)
	orgs := NewOrganizationService(repository.NewOrganizationRepository(fire.db), repository.NewUserRepository(fire.db), repository.NewKBShareRepository(fire.db), repository.NewAgentShareRepository(fire.db))
	require.NoError(t, orgs.AddTenantMember(fireAdminContext(), org.ID, user.TenantID, user.ID, types.OrgRoleViewer))
	snapshot := &types.CustomAgent{ID: types.FireDefaultAgentID, TenantID: user.TenantID, Name: "保留旧快照", Config: types.CustomAgentConfig{SystemPrompt: "preserved historical settings"}}
	require.NoError(t, fire.db.Create(snapshot).Error)
	result, err := fire.ProvisionExistingAccount(fireAdminContext(), "source-user", user.ID)
	require.NoError(t, err)
	require.False(t, result.Existing)
	stored, err := repository.NewCustomAgentRepository(fire.db).GetAgentByID(context.Background(), types.FireDefaultAgentID, user.TenantID)
	require.NoError(t, err)
	require.Equal(t, snapshot.Config, stored.Config, "an existing protected snapshot must not be overwritten")
	result, err = fire.ProvisionExistingAccount(fireAdminContext(), "source-user", seeded.User.ID)
	require.NoError(t, err)
	require.True(t, result.Existing)
	current, managed, err := fire.DefaultAgent(context.Background(), user.TenantID)
	require.NoError(t, err)
	require.True(t, managed)
	require.Equal(t, "original Taylor prompt", current.Config.SystemPrompt, "runtime still uses the current source, not the historical snapshot")
}
