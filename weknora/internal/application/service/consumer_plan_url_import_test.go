package service

import (
	"context"
	"net/http"
	"testing"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

// urlImportPlanRepo is deliberately tiny: it exercises the URL-create service
// boundary without a database or network. The embedded interface keeps this
// test aligned with the existing repository contract while the methods below
// cover exactly the calls made before URL admission.
type urlImportPlanRepo struct {
	interfaces.KnowledgeRepository
	createCalls int
}

func (r *urlImportPlanRepo) CheckKnowledgeExists(
	context.Context,
	uint64,
	string,
	*types.KnowledgeCheckParams,
) (bool, *types.Knowledge, error) {
	return false, nil, nil
}

func (r *urlImportPlanRepo) CountKnowledgeByKnowledgeBaseID(context.Context, uint64, string) (int64, error) {
	return 0, nil
}

func (r *urlImportPlanRepo) CreateKnowledge(context.Context, *types.Knowledge) error {
	r.createCalls++
	return nil
}

func (r *urlImportPlanRepo) CreateURLKnowledgeIfAbsent(
	ctx context.Context,
	knowledge *types.Knowledge,
	_ *types.KnowledgeCheckParams,
) (*types.Knowledge, bool, error) {
	if err := r.CreateKnowledge(ctx, knowledge); err != nil {
		return nil, false, err
	}
	return knowledge, true, nil
}

func (r *urlImportPlanRepo) CreateKnowledgeWithStorage(
	ctx context.Context,
	knowledge *types.Knowledge,
	_ int64,
) error {
	return r.CreateKnowledge(ctx, knowledge)
}

func (r *urlImportPlanRepo) GetKnowledgeTags(context.Context, []string) (map[string][]*types.KnowledgeTag, error) {
	return map[string][]*types.KnowledgeTag{}, nil
}

// URL imports are a paid consumer capability. Drive the actual URL-create
// service path so this signal cannot be satisfied by changing the shared
// file-type gate and accidentally blocking local .html uploads.
func TestFreePlanRejectsURLKnowledgeImport(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")

	repo := &urlImportPlanRepo{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      &createKnowledgeTaskEnqueuerStub{},
	}
	knowledge, err := svc.CreateKnowledgeFromURL(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		"kb-1",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"",
		"",
		nil,
		"",
		nil,
		"",
		nil,
	)

	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	require.Nil(t, knowledge)
	require.Zero(t, repo.createCalls, "a rejected URL must not persist a knowledge row")
	require.Equal(t, apperrors.ErrForbidden, appErr.Code)
	require.Equal(t, http.StatusForbidden, appErr.HTTPCode)
	require.Equal(t, "Free plan does not support URL import", appErr.Message)
}

// A paid-only URL gate must not turn the shared html file parser into a paid
// feature. This stays green today and protects the source-mode distinction
// while the URL regression above remains red.
func TestFreePlanStillAllowsLocalHTMLFileUpload(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")

	repo := &urlImportPlanRepo{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      &createKnowledgeTaskEnqueuerStub{},
	}
	knowledge, err := svc.CreateKnowledgeFromFile(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		"kb-1",
		newMultipartFileHeader(t, "page.html", "<html><body>local page</body></html>"),
		nil,
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, "html", knowledge.FileType)
	require.Equal(t, 1, repo.createCalls)
}

// Paid plans retain the existing URL ingestion path: the entitlement change
// should deny only Free tenants and must not disable URL creation for Plus.
func TestPaidPlanAllowsURLKnowledgeImport(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")

	repo := &urlImportPlanRepo{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      &createKnowledgeTaskEnqueuerStub{},
	}
	knowledge, err := svc.CreateKnowledgeFromURL(
		contextWithConsumerPlan(1, types.ConsumerPlanPlus),
		"kb-1",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"",
		"",
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, repo.createCalls)
}

func TestStandardEditionFreeTenantStillAllowsURLKnowledgeImport(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")

	repo := &urlImportPlanRepo{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      &createKnowledgeTaskEnqueuerStub{},
	}
	knowledge, err := svc.CreateKnowledgeFromURL(
		contextWithConsumerPlan(1, types.ConsumerPlanFree),
		"kb-1",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		"",
		"",
		nil,
		"",
		nil,
		"",
		nil,
	)

	require.NoError(t, err)
	require.NotNil(t, knowledge)
	require.Equal(t, 1, repo.createCalls)
}
