package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

// Exercise the same knowledge-target resolver used by both QA entry points,
// with native repositories and native organization sharing. No model calls or
// permissive share mocks can turn an unauthorized resource into a passing test.
func TestCustomerKnowledgeCombinesExplicitOwnAndNativeSharedKnowledge(t *testing.T) {
	fire := fireFixture(t)
	account, err := fire.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "customer-public-references"}, nil)
	require.NoError(t, err)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, account.User.TenantID)
	ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleOwner)
	kbRepo := repository.NewKnowledgeBaseRepository(fire.db)
	shares := NewKBShareService(repository.NewKBShareRepository(fire.db), repository.NewOrganizationRepository(fire.db), kbRepo, nil, nil, nil)
	svc := &sessionService{knowledgeBaseService: &knowledgeBaseService{repo: kbRepo}, kbShareService: shares}
	for _, kb := range []*types.KnowledgeBase{
		{ID: "bound-target", TenantID: account.User.TenantID, Name: "目标", Type: "document", CustomerProfile: &types.CustomerProfile{}},
		{ID: "my-other-notes", TenantID: account.User.TenantID, Name: "我的补充资料", Type: "document"},
		{ID: "other-shared-course", TenantID: 100, Name: "另一个获授权的课程", Type: "document"},
	} {
		require.NoError(t, fire.db.Create(kb).Error)
	}
	var org types.Organization
	require.NoError(t, fire.db.First(&org).Error)
	extraShare, err := shares.ShareKnowledgeBase(fireAdminContext(), "other-shared-course", org.ID, "source-user", 100, types.OrgRoleViewer)
	require.NoError(t, err)
	taylor, managed, err := fire.DefaultAgent(ctx, account.User.TenantID)
	require.NoError(t, err)
	require.True(t, managed)
	req := &types.QARequest{
		Session:          &types.Session{TenantID: account.User.TenantID, CustomerKnowledgeBaseID: "bound-target"},
		CustomAgent:      taylor,
		KnowledgeBaseIDs: []string{"bound-target", "my-other-notes", "other-shared-course", "my-other-notes"},
	}

	ids, docs, err := svc.resolveKnowledgeBases(ctx, req)
	require.NoError(t, err, "a public KB selected together with one target must not require permanent profile/agent reconfiguration")
	require.Equal(t, []string{"bound-target", "public-course", "my-other-notes", "other-shared-course"}, ids)
	require.Empty(t, docs)
	var stored types.KnowledgeBase
	require.NoError(t, fire.db.First(&stored, "id = ?", "bound-target").Error)
	require.Empty(t, stored.CustomerProfile.SharedKnowledgeBaseIDs, "per-message selection must not change the target's stored references")
	require.Equal(t, []string{"public-course"}, taylor.Config.KnowledgeBases, "per-message selection must not mutate the managed Taylor configuration")

	// A tag scope follows the explicitly authorized KB, but may not introduce a
	// different target behind the back of the KB selector.
	t.Run("tag in explicit shared reference", func(t *testing.T) {
		request := *req
		request.TagScopes = []types.TagScope{{KnowledgeBaseID: "other-shared-course", TagIDs: []string{"course-tag"}}}
		_, _, err := svc.resolveKnowledgeBases(ctx, &request)
		require.NoError(t, err)
	})

	for _, kb := range []*types.KnowledgeBase{
		{ID: "other-target", TenantID: account.User.TenantID, Name: "另一个目标", Type: "document", CustomerProfile: &types.CustomerProfile{}},
		{ID: "foreign-target", TenantID: 100, Name: "外部目标", Type: "document", CustomerProfile: &types.CustomerProfile{}},
		{ID: "private-not-shared", TenantID: 100, Name: "未授权资料", Type: "document"},
		{ID: "temporary-notes", TenantID: account.User.TenantID, Name: "临时资料", Type: "document", IsTemporary: true},
		{ID: "deleted-notes", TenantID: account.User.TenantID, Name: "已删除资料", Type: "document"},
	} {
		require.NoError(t, fire.db.Create(kb).Error)
	}
	require.NoError(t, fire.db.Where("id = ?", "deleted-notes").Delete(&types.KnowledgeBase{}).Error)
	for _, id := range []string{"other-target", "foreign-target", "private-not-shared", "temporary-notes", "deleted-notes", "missing-notes"} {
		t.Run("reject "+id, func(t *testing.T) {
			request := *req
			request.KnowledgeBaseIDs = append(append([]string(nil), req.KnowledgeBaseIDs...), id)
			ids, docs, err := svc.resolveKnowledgeBases(ctx, &request)
			require.Error(t, err)
			var appErr *apperrors.AppError
			require.ErrorAs(t, err, &appErr)
			require.Equal(t, apperrors.ErrBadRequest, appErr.Code)
			require.Empty(t, ids, "a partial authorized scope must not execute after any explicit selector is rejected")
			require.Empty(t, docs)
		})
	}
	t.Run("other target hidden in tag scope", func(t *testing.T) {
		request := *req
		request.TagScopes = []types.TagScope{{KnowledgeBaseID: "other-target", TagIDs: []string{"private-tag"}}}
		_, _, err := svc.resolveKnowledgeBases(ctx, &request)
		require.Error(t, err)
	})
	t.Run("API key restriction is still authoritative", func(t *testing.T) {
		restricted := types.WithTenantAPIKeyScope(ctx, types.TenantAPIKeyScope{KnowledgeBaseIDs: types.StringArray{"bound-target", "public-course"}})
		_, _, err := svc.resolveKnowledgeBases(restricted, req)
		require.Error(t, err)
		var appErr *apperrors.AppError
		require.ErrorAs(t, err, &appErr)
		require.Equal(t, apperrors.ErrForbidden, appErr.Code)
	})
	t.Run("binding cannot be moved to the source tenant", func(t *testing.T) {
		request := *req
		request.Session = &types.Session{TenantID: 100, CustomerKnowledgeBaseID: "bound-target"}
		_, _, err := svc.resolveKnowledgeBases(ctx, &request)
		require.Error(t, err)
	})
	t.Run("native share revocation takes effect immediately", func(t *testing.T) {
		require.NoError(t, shares.RemoveShare(fireAdminContext(), extraShare.ID, "source-user", 100))
		_, _, err := svc.resolveKnowledgeBases(ctx, req)
		require.Error(t, err, "a formerly shared KB cannot be used after the source owner revokes it")
	})
}
