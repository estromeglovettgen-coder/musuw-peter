package service

import (
	"context"
	"testing"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func contextWithConsumerPlan(tenantID uint64, plan types.ConsumerPlan) context.Context {
	tenant := &types.Tenant{ID: tenantID, Plan: plan, PlanStatus: "active"}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenantID)
	return context.WithValue(ctx, types.TenantInfoContextKey, tenant)
}

func contextWithComplimentaryPlan(tenantID uint64, plan types.ConsumerPlan, expiresAt time.Time) context.Context {
	tenant := &types.Tenant{
		ID: tenantID, Plan: types.ConsumerPlanFree, PlanStatus: "active",
		StorageQuota:      types.LimitsForConsumerPlan(types.ConsumerPlanFree).StorageBytes,
		ComplimentaryPlan: plan, ComplimentaryExpiresAt: &expiresAt, ComplimentaryGrantID: "grant-1234567890",
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, tenantID)
	return context.WithValue(ctx, types.TenantInfoContextKey, tenant)
}

func TestFreePlanRejectsSecondKnowledgeBase(t *testing.T) {
	repo := newFakeKBRepo()
	repo.rows["existing"] = &types.KnowledgeBase{ID: "existing", TenantID: 1}
	svc := &knowledgeBaseService{repo: repo}

	_, err := svc.CreateKnowledgeBase(contextWithConsumerPlan(1, types.ConsumerPlanFree), &types.KnowledgeBase{Name: "second"})
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)
	assert.Len(t, repo.rows, 1)
}

func TestFreePlanRejectsCopyThatWouldCreateSecondKnowledgeBase(t *testing.T) {
	repo := newFakeKBRepo()
	repo.rows["source"] = &types.KnowledgeBase{
		ID:       "source",
		Name:     "Source",
		Type:     types.KnowledgeBaseTypeDocument,
		TenantID: 1,
	}
	svc := &knowledgeBaseService{repo: repo}

	_, _, err := svc.CopyKnowledgeBase(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		"source",
		"",
	)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)
	assert.Len(t, repo.rows, 1, "rejected copy must not create a target knowledge base")
}

func TestPaidPlanCopyStillUsesNativeCreateTargetPath(t *testing.T) {
	repo := newFakeKBRepo()
	repo.rows["source"] = &types.KnowledgeBase{
		ID:       "source",
		Name:     "Source",
		Type:     types.KnowledgeBaseTypeDocument,
		TenantID: 1,
	}
	svc := &knowledgeBaseService{repo: repo}

	source, target, err := svc.CopyKnowledgeBase(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		"source",
		"",
	)
	require.NoError(t, err)
	assert.Equal(t, "source", source.ID)
	require.NotNil(t, target)
	assert.NotEqual(t, source.ID, target.ID)
	assert.Len(t, repo.rows, 2)
}

func TestFreePlanRejectsSettingsOnlyDuplicateThatWouldCreateSecondKnowledgeBase(t *testing.T) {
	repo := newFakeKBRepo()
	repo.rows["source"] = &types.KnowledgeBase{
		ID:       "source",
		Name:     "Source",
		Type:     types.KnowledgeBaseTypeDocument,
		TenantID: 1,
	}
	svc := &knowledgeBaseService{repo: repo}

	_, err := svc.DuplicateKnowledgeBase(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		"source",
	)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)
	assert.Len(t, repo.rows, 1, "rejected duplicate must not create a target knowledge base")
}

func TestPaidPlanSettingsOnlyDuplicateKeepsLegacySemantics(t *testing.T) {
	repo := newFakeKBRepo()
	repo.rows["source"] = &types.KnowledgeBase{
		ID:             "source",
		Name:           "Source",
		Description:    "settings survive",
		Type:           types.KnowledgeBaseTypeDocument,
		TenantID:       1,
		KnowledgeCount: 7,
	}
	svc := &knowledgeBaseService{repo: repo}

	target, err := svc.DuplicateKnowledgeBase(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		"source",
	)
	require.NoError(t, err)
	require.NotNil(t, target)
	assert.NotEqual(t, "source", target.ID)
	assert.Equal(t, "settings survive", target.Description)
	assert.Zero(t, target.KnowledgeCount, "legacy endpoint must remain settings-only")
	assert.Len(t, repo.rows, 2)
}

type planKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	count int64
}

func (r *planKnowledgeRepo) CountKnowledgeByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return r.count, nil
}

func TestFreePlanRejectsEleventhDocumentAndVideo(t *testing.T) {
	svc := &knowledgeService{repo: &planKnowledgeRepo{count: 10}}
	ctx := contextWithConsumerPlan(1, types.ConsumerPlanFree)

	err := svc.checkCreateKnowledgeEntitlement(ctx, "kb-1", "pdf", 1024)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)

	svc.repo = &planKnowledgeRepo{count: 0}
	err = svc.checkCreateKnowledgeEntitlement(ctx, "kb-1", "mp4", 1024)
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)
}

func TestComplimentaryPlanUsesPaidContentAndBoundedStorageLimits(t *testing.T) {
	expiresAt := time.Now().UTC().Add(time.Hour)
	ctx := contextWithComplimentaryPlan(1, types.ConsumerPlanPro, expiresAt)

	repo := newFakeKBRepo()
	repo.rows["existing"] = &types.KnowledgeBase{ID: "existing", TenantID: 1}
	err := (&knowledgeBaseService{repo: repo}).checkCreateKnowledgeBaseEntitlement(ctx)
	require.NoError(t, err)

	knowledge := &knowledgeService{repo: &planKnowledgeRepo{count: 10}}
	require.NoError(t, knowledge.checkCreateKnowledgeEntitlement(ctx, "kb-1", "mp4", 1024))

	tenant, ok := types.TenantInfoFromContext(ctx)
	require.True(t, ok)
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanPro).StorageBytes, effectiveStorageQuota(tenant, time.Now().UTC()))
	assert.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanFree).StorageBytes, effectiveStorageQuota(tenant, expiresAt))
}

func TestComplimentaryStorageNeverLowersAnOperatorQuota(t *testing.T) {
	now := time.Now().UTC()
	expiresAt := now.Add(time.Hour)
	tenant := &types.Tenant{
		Plan: types.ConsumerPlanFree, PlanStatus: "active",
		StorageQuota:           80 * 1024 * 1024 * 1024,
		ComplimentaryPlan:      types.ConsumerPlanPlus,
		ComplimentaryExpiresAt: &expiresAt,
		ComplimentaryGrantID:   "grant-1234567890",
	}
	assert.Equal(t, tenant.StorageQuota, effectiveStorageQuota(tenant, now))
}

type planModelRepo struct {
	defaultModelRepo
	models []*types.Model
}

func (r *planModelRepo) List(context.Context, uint64, types.ModelType, types.ModelSource) ([]*types.Model, error) {
	return r.models, nil
}

func TestFreePlanFiltersAndRejectsPaidModels(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	cheap := platformOpenRouterTestModel(types.CheapestChatModelID)
	paid := platformOpenRouterTestModel("builtin-deepseek-v4-pro")
	repo := &planModelRepo{models: []*types.Model{cheap, paid}}
	repo.model = paid
	svc := NewModelServiceWithEntitlement(
		repo, nil, nil, nil, nil, nil,
		&consumerSceneResolverEntitlement{plan: types.ConsumerPlanFree},
	)
	ctx := contextWithConsumerPlan(1, types.ConsumerPlanFree)

	models, err := svc.ListModels(ctx)
	require.NoError(t, err)
	require.Len(t, models, 1)
	assert.Equal(t, types.CheapestChatModelID, models[0].ID)

	_, err = svc.GetModelByID(ctx, paid.ID)
	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, apperrors.ErrForbidden, appErr.Code)
}

func TestFreePlanFiltersPaidModelsForBackgroundContext(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	cheap := platformOpenRouterTestModel(types.CheapestChatModelID)
	paid := platformOpenRouterTestModel("builtin-deepseek-v4-pro")
	repo := &planModelRepo{models: []*types.Model{cheap, paid}}
	entitlements := NewEntitlementService(&entitlementRepoStub{tenant: &types.Tenant{
		ID:         1,
		Plan:       types.ConsumerPlanFree,
		PlanStatus: "active",
	}})
	svc := NewModelServiceWithEntitlement(repo, nil, nil, nil, nil, nil, entitlements)

	models, err := svc.ListModels(entitlementContext(1, "worker"))
	require.NoError(t, err)
	require.Len(t, models, 1)
	assert.Equal(t, types.CheapestChatModelID, models[0].ID)
}

func platformOpenRouterTestModel(id string) *types.Model {
	return &types.Model{
		ID:        id,
		Type:      types.ModelTypeKnowledgeQA,
		Status:    types.ModelStatusActive,
		IsBuiltin: true,
		Source:    types.ModelSourceRemote,
		Parameters: types.ModelParameters{
			Provider: "openrouter",
			BaseURL:  provider.OpenRouterBaseURL,
		},
	}
}
