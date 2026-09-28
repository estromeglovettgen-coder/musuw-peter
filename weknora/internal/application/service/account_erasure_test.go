package service

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"testing"
	"time"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type accountErasureRepoStub struct {
	target        *types.AccountErasureTarget
	targets       []*types.AccountErasureTarget
	preflights    int
	preflightErr  error
	fenced        bool
	fenceAt       time.Time
	boundProvider string
	boundSubject  string
	bindErr       error
	pending       []*types.AccountErasureTarget
	remaining     int64
	purged        bool
	order         *[]string
}

func (r *accountErasureRepoStub) BindIdentity(_ context.Context, _ string, provider, subject string) error {
	if r.bindErr != nil {
		return r.bindErr
	}
	r.boundProvider = provider
	r.boundSubject = subject
	if r.target != nil {
		r.target.IdentityProvider = provider
		r.target.IdentitySubject = subject
	}
	return nil
}

func (r *accountErasureRepoStub) Preflight(context.Context, string) (*types.AccountErasureTarget, error) {
	if len(r.targets) > 0 {
		index := r.preflights
		if index >= len(r.targets) {
			index = len(r.targets) - 1
		}
		r.preflights++
		return r.targets[index], r.preflightErr
	}
	r.preflights++
	return r.target, r.preflightErr
}

func (r *accountErasureRepoStub) Fence(_ context.Context, _ string, requestedAt time.Time) error {
	r.fenced = true
	r.fenceAt = requestedAt
	return nil
}

func (r *accountErasureRepoStub) ListPending(context.Context, int) ([]*types.AccountErasureTarget, error) {
	return r.pending, nil
}

func (r *accountErasureRepoStub) RemainingActiveKnowledgeCount(context.Context, uint64) (int64, error) {
	return r.remaining, nil
}

func (r *accountErasureRepoStub) ListActiveResourceReferences(context.Context, uint64) ([]string, error) {
	return nil, nil
}

func (r *accountErasureRepoStub) Purge(context.Context, *types.AccountErasureTarget) error {
	r.purged = true
	if r.order != nil {
		*r.order = append(*r.order, "purge")
	}
	return nil
}

type accountErasureBillingStub struct {
	prepareErr    error
	terminalErr   error
	prepareCalls  int
	terminalCalls int
	lastID        string
}

func (b *accountErasureBillingStub) EnsureAccountTerminal(_ context.Context, customerID, id string) error {
	b.terminalCalls++
	b.lastID = customerID + "/" + id
	return b.terminalErr
}

func (b *accountErasureBillingStub) PrepareAccountDeletion(_ context.Context, customerID, id string) error {
	b.prepareCalls++
	b.lastID = customerID + "/" + id
	return b.prepareErr
}

type accountErasureIdentityStub struct {
	err              error
	validateErr      error
	resolveErr       error
	resolvedProvider string
	resolvedSubject  string
	calls            int
	validations      int
	resolutions      int
	lastEmail        string
	order            *[]string
}

func (i *accountErasureIdentityStub) ResolveIdentityDeletion(
	_ context.Context, provider, subject, email string,
) (string, string, error) {
	i.resolutions++
	i.lastEmail = email
	if i.resolveErr != nil {
		return "", "", i.resolveErr
	}
	if i.resolvedProvider != "" || i.resolvedSubject != "" {
		return i.resolvedProvider, i.resolvedSubject, nil
	}
	return provider, subject, i.validateErr
}

func (i *accountErasureIdentityStub) ValidateIdentityDeletion(string, string) error {
	i.validations++
	return i.validateErr
}

func (i *accountErasureIdentityStub) DeleteIdentity(context.Context, string, string) error {
	i.calls++
	if i.order != nil {
		*i.order = append(*i.order, "identity")
	}
	return i.err
}

type accountErasureTaskStub struct {
	tasks []*asynq.Task
	opts  [][]asynq.Option
	err   error
	errs  []error
}

func (q *accountErasureTaskStub) Enqueue(task *asynq.Task, opts ...asynq.Option) (*asynq.TaskInfo, error) {
	q.tasks = append(q.tasks, task)
	q.opts = append(q.opts, opts)
	if len(q.errs) > 0 {
		err := q.errs[0]
		q.errs = q.errs[1:]
		return &asynq.TaskInfo{ID: "accepted"}, err
	}
	return &asynq.TaskInfo{ID: "accepted"}, q.err
}

type accountErasureRuntimeInspectorStub struct {
	interfaces.TaskInspector
	interfaces.RuntimeTaskInspector
	task      *types.RuntimeTaskInfo
	supported bool
	getErr    error
	deleteErr error
	deleted   int
}

func (s *accountErasureRuntimeInspectorStub) GetRuntimeTask(
	context.Context, string, string,
) (*types.RuntimeTaskInfo, bool, error) {
	return s.task, s.supported, s.getErr
}

func (s *accountErasureRuntimeInspectorStub) DeleteRuntimeTask(
	context.Context, string, string,
) (bool, error) {
	s.deleted++
	return s.supported, s.deleteErr
}

type accountErasureKBStub struct {
	interfaces.KnowledgeBaseService
	kbs                   []*types.KnowledgeBase
	deleted               []string
	strictDeleted         []string
	erasureFiles          interfaces.FileService
	erasureFileTenantIDs  []uint64
	erasureFileReferences []string
}

func (k *accountErasureKBStub) ListKnowledgeBasesByTenantID(context.Context, uint64) ([]*types.KnowledgeBase, error) {
	return k.kbs, nil
}

func (k *accountErasureKBStub) DeleteKnowledgeBase(_ context.Context, id string) error {
	k.deleted = append(k.deleted, id)
	return nil
}

func (k *accountErasureKBStub) DeleteKnowledgeBaseForAccountErasure(_ context.Context, id string) error {
	k.strictDeleted = append(k.strictDeleted, id)
	return nil
}

func (k *accountErasureKBStub) deleteFileForAccountErasure(
	ctx context.Context,
	tenantID uint64,
	reference string,
) error {
	k.erasureFileTenantIDs = append(k.erasureFileTenantIDs, tenantID)
	k.erasureFileReferences = append(k.erasureFileReferences, reference)
	return deleteFileIdempotent(ctx, k.erasureFiles, reference)
}

type accountErasureFileStub struct {
	interfaces.FileService
	deleted []string
	err     error
	errs    []error
	order   *[]string
}

func (s *accountErasureFileStub) DeleteFile(_ context.Context, path string) error {
	s.deleted = append(s.deleted, path)
	if s.order != nil {
		*s.order = append(*s.order, "file")
	}
	if len(s.errs) > 0 {
		err := s.errs[0]
		s.errs = s.errs[1:]
		return err
	}
	return s.err
}

type accountErasureTenantStub struct {
	interfaces.TenantService
	tenant  *types.Tenant
	getErr  error
	deleted []uint64
	order   *[]string
}

func (s *accountErasureTenantStub) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return s.tenant, s.getErr
}

func (s *accountErasureTenantStub) DeleteTenant(_ context.Context, id uint64) error {
	s.deleted = append(s.deleted, id)
	if s.order != nil {
		*s.order = append(*s.order, "tenant")
	}
	return nil
}

func (s *accountErasureTenantStub) DeleteTenantProviderCredentials(_ context.Context, id uint64) error {
	s.deleted = append(s.deleted, id)
	if s.order != nil {
		*s.order = append(*s.order, "tenant")
	}
	return nil
}

func eligibleErasureTarget() *types.AccountErasureTarget {
	return &types.AccountErasureTarget{
		UserID:               "user-1",
		Email:                "owner@example.com",
		TenantID:             7,
		IdentityProvider:     "supabase",
		IdentitySubject:      "00000000-0000-0000-0000-000000000007",
		PaddleSubscriptionID: "sub_legacy",
		OwnerTenantCount:     1,
		IsDeletionPending:    true,
	}
}

func TestAccountErasureRequestRejectsMissingTargetBeforeSideEffects(t *testing.T) {
	repo := &accountErasureRepoStub{}
	billing := &accountErasureBillingStub{}
	queue := &accountErasureTaskStub{}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, billing, &accountErasureIdentityStub{})

	err := svc.Request(context.Background(), "user-1")
	require.ErrorIs(t, err, ErrAccountErasureIneligible)
	require.False(t, repo.fenced)
	require.Zero(t, billing.prepareCalls)
	require.Zero(t, billing.terminalCalls)
	require.Empty(t, queue.tasks)
}

func TestAccountErasureRequestLeavesAccountActiveWhenPaddleCancellationCannotBePrepared(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	billing := &accountErasureBillingStub{prepareErr: ErrAccountBillingUnavailable}
	queue := &accountErasureTaskStub{}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, billing, &accountErasureIdentityStub{})

	err := svc.Request(context.Background(), "user-1")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
	require.False(t, repo.fenced)
	require.Empty(t, queue.tasks)
}

func TestAccountErasureRequestPreparesPaidCancellationBeforeFencing(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	billing := &accountErasureBillingStub{}
	queue := &accountErasureTaskStub{}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, billing, &accountErasureIdentityStub{})

	require.NoError(t, svc.Request(context.Background(), "user-1"))
	require.Equal(t, 1, billing.prepareCalls)
	require.Zero(t, billing.terminalCalls)
	require.True(t, repo.fenced)
	require.Len(t, queue.tasks, 1)
}

func TestAccountErasureRequestAutomaticallyLeavesOrdinaryOrganizationMembership(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target}
	billing := &accountErasureBillingStub{}
	queue := &accountErasureTaskStub{}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, billing, &accountErasureIdentityStub{})

	require.NoError(t, svc.Request(context.Background(), "user-1"))
	require.True(t, repo.fenced)
	require.Equal(t, 1, billing.prepareCalls)
	require.Zero(t, billing.terminalCalls)
	require.Len(t, queue.tasks, 1)
}

func TestAccountErasureRequestFencesAndEnqueuesOneSecretFreeTask(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	queue := &accountErasureTaskStub{}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, &accountErasureBillingStub{}, &accountErasureIdentityStub{})

	require.NoError(t, svc.Request(context.Background(), "user-1"))
	require.True(t, repo.fenced)
	require.Len(t, queue.tasks, 1)
	require.Equal(t, types.TypeAccountErasure, queue.tasks[0].Type())
	var payload types.AccountErasureTaskPayload
	require.NoError(t, json.Unmarshal(queue.tasks[0].Payload(), &payload))
	require.Equal(t, "user-1", payload.UserID)
	require.NotContains(t, string(queue.tasks[0].Payload()), "owner@example.com")
	require.NotContains(t, string(queue.tasks[0].Payload()), "sub_legacy")
}

func TestAccountErasureRequestResolvesAndPersistsLegacySupabaseIdentityWithoutUserConfirmation(t *testing.T) {
	target := eligibleErasureTarget()
	target.IdentityProvider = ""
	target.IdentitySubject = ""
	repo := &accountErasureRepoStub{target: target}
	identity := &accountErasureIdentityStub{
		resolvedProvider: "supabase",
		resolvedSubject:  "00000000-0000-0000-0000-000000000007",
	}
	svc := newAccountErasureService(repo, nil, nil, nil, &accountErasureTaskStub{}, nil, &accountErasureBillingStub{}, identity)

	require.NoError(t, svc.Request(context.Background(), "user-1"))
	require.Equal(t, 1, identity.resolutions)
	require.Equal(t, "owner@example.com", identity.lastEmail)
	require.Equal(t, "supabase", repo.boundProvider)
	require.Equal(t, "00000000-0000-0000-0000-000000000007", repo.boundSubject)
	require.True(t, repo.fenced)
}

func TestAccountErasureRequestDoesNotFenceWhenResolvedIdentityCannotBePersisted(t *testing.T) {
	target := eligibleErasureTarget()
	target.IdentityProvider = ""
	target.IdentitySubject = ""
	repo := &accountErasureRepoStub{target: target, bindErr: errors.New("identity conflict")}
	identity := &accountErasureIdentityStub{
		resolvedProvider: "supabase",
		resolvedSubject:  "00000000-0000-0000-0000-000000000007",
	}
	svc := newAccountErasureService(repo, nil, nil, nil, &accountErasureTaskStub{}, nil, &accountErasureBillingStub{}, identity)

	err := svc.Request(context.Background(), "user-1")
	require.Error(t, err)
	require.NotErrorIs(t, err, ErrAccountIdentityBindingRequired)
	require.False(t, repo.fenced)
}

func TestAccountErasureRequestReportsResolvedIdentityConflictWithoutFencing(t *testing.T) {
	target := eligibleErasureTarget()
	target.IdentityProvider = ""
	target.IdentitySubject = ""
	repo := &accountErasureRepoStub{target: target, bindErr: types.ErrAccountErasureIdentityConflict}
	identity := &accountErasureIdentityStub{
		resolvedProvider: "supabase",
		resolvedSubject:  "00000000-0000-0000-0000-000000000007",
	}
	svc := newAccountErasureService(repo, nil, nil, nil, &accountErasureTaskStub{}, nil, &accountErasureBillingStub{}, identity)

	err := svc.Request(context.Background(), "user-1")
	require.ErrorIs(t, err, ErrAccountIdentityBindingRequired)
	require.False(t, repo.fenced)
}

func TestAccountErasureWorkerUsesExistingKnowledgeLifecycleBeforeTenantDeletion(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target, remaining: 2}
	kbs := &accountErasureKBStub{kbs: []*types.KnowledgeBase{{ID: "kb-a"}, {ID: "kb-b"}}}
	tenants := &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}}
	svc := newAccountErasureService(repo, kbs, &accountErasureFileStub{}, tenants, nil, nil, &accountErasureBillingStub{}, &accountErasureIdentityStub{})
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	err = svc.Process(context.Background(), task)
	require.ErrorIs(t, err, ErrAccountErasureCleanupPending)
	require.ElementsMatch(t, []string{"kb-a", "kb-b"}, kbs.strictDeleted)
	require.Empty(t, kbs.deleted)
	require.Empty(t, tenants.deleted)
	require.False(t, repo.purged)
}

func TestAccountErasureWorkerWaitsForTerminalPaddleState(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	billing := &accountErasureBillingStub{terminalErr: ErrAccountBillingActionRequired}
	tenant := &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}}
	svc := newAccountErasureService(
		repo, &accountErasureKBStub{}, &accountErasureFileStub{}, tenant,
		nil, nil, billing, &accountErasureIdentityStub{},
	)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	err = svc.Process(context.Background(), task)

	require.ErrorIs(t, err, ErrAccountBillingActionRequired)
	require.Equal(t, 1, billing.terminalCalls)
	require.Empty(t, tenant.deleted)
	require.False(t, repo.purged)
}

func TestAccountErasureWorkerPropagatesTenantLookupFailure(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target}
	lookupErr := errors.New("tenant database unavailable")
	tenants := &accountErasureTenantStub{getErr: lookupErr}
	svc := newAccountErasureService(
		repo, &accountErasureKBStub{}, &accountErasureFileStub{}, tenants,
		nil, nil, &accountErasureBillingStub{}, &accountErasureIdentityStub{},
	)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	err = svc.Process(context.Background(), task)
	require.ErrorIs(t, err, lookupErr)
	require.False(t, repo.purged)
}

func TestAccountErasureWorkerDeletesProviderIdentityBeforeFinalLocalPurge(t *testing.T) {
	order := []string{}
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target, order: &order}
	tenants := &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}, order: &order}
	identity := &accountErasureIdentityStub{order: &order}
	svc := newAccountErasureService(repo, &accountErasureKBStub{}, &accountErasureFileStub{order: &order}, tenants, nil, nil, &accountErasureBillingStub{}, identity)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.NoError(t, svc.Process(context.Background(), task))
	require.Equal(t, []string{"tenant", "identity", "purge"}, order)
	require.True(t, repo.purged)
}

func TestAccountErasureRecoveryReusesDeterministicTaskIdentity(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{pending: []*types.AccountErasureTarget{target, target}}
	queue := &accountErasureTaskStub{err: asynq.ErrTaskIDConflict}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, nil, nil)

	require.NoError(t, svc.RecoverPending(context.Background()))
	require.Len(t, queue.tasks, 2)
}

func TestAccountErasureRecoveryReplacesArchivedTaskWithFreshRetryBudget(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{pending: []*types.AccountErasureTarget{target}}
	queue := &accountErasureTaskStub{errs: []error{asynq.ErrTaskIDConflict, nil}}
	inspector := &accountErasureRuntimeInspectorStub{
		task:      &types.RuntimeTaskInfo{State: types.RuntimeTaskArchived},
		supported: true,
	}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, inspector, nil, nil)

	require.NoError(t, svc.RecoverPending(context.Background()))
	require.Len(t, queue.tasks, 2)
	require.Equal(t, 1, inspector.deleted)
}

func TestAccountErasureRecoveryLeavesLiveConflictingTaskAlone(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{pending: []*types.AccountErasureTarget{target}}
	queue := &accountErasureTaskStub{err: asynq.ErrTaskIDConflict}
	inspector := &accountErasureRuntimeInspectorStub{
		task:      &types.RuntimeTaskInfo{State: types.RuntimeTaskRetry},
		supported: true,
	}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, inspector, nil, nil)

	require.NoError(t, svc.RecoverPending(context.Background()))
	require.Len(t, queue.tasks, 1)
	require.Zero(t, inspector.deleted)
}

func TestAccountErasureWorkerPropagatesExternalFailureAndDoesNotPurge(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	identity := &accountErasureIdentityStub{err: errors.New("provider unavailable")}
	svc := newAccountErasureService(repo, &accountErasureKBStub{}, &accountErasureFileStub{}, &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}}, nil, nil, &accountErasureBillingStub{}, identity)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.Error(t, svc.Process(context.Background(), task))
	require.False(t, repo.purged)
}

func TestAccountErasureRequestResolvesIdentityAdapterBeforeFence(t *testing.T) {
	repo := &accountErasureRepoStub{target: eligibleErasureTarget()}
	identity := &accountErasureIdentityStub{validateErr: ErrAccountIdentityDeletionUnavailable}
	svc := newAccountErasureService(repo, nil, nil, nil, &accountErasureTaskStub{}, nil, &accountErasureBillingStub{}, identity)

	err := svc.Request(context.Background(), "user-1")
	require.ErrorIs(t, err, ErrAccountIdentityDeletionUnavailable)
	require.False(t, repo.fenced)
	require.Equal(t, 1, identity.resolutions)
	require.Zero(t, identity.calls)
}

func TestAccountErasureRequestUsesCustomerInventoryWithCustomerOnlyBinding(t *testing.T) {
	target := eligibleErasureTarget()
	target.PaddleCustomerID = "ctm_bound"
	target.PaddleSubscriptionID = ""
	repo := &accountErasureRepoStub{target: target}
	svc := newAccountErasureService(repo, nil, nil, nil, &accountErasureTaskStub{}, nil, &accountErasureBillingStub{}, &accountErasureIdentityStub{})

	require.NoError(t, svc.Request(context.Background(), "user-1"))
	require.True(t, repo.fenced)
}

func TestAccountErasureWorkerDeletesRemainingResourcesBeforeTenant(t *testing.T) {
	order := []string{}
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target, order: &order}
	routedFiles := &accountErasureFileStub{order: &order}
	globalFiles := &accountErasureFileStub{err: errors.New("global storage must not receive a catalog reference")}
	// Override the repository method with a purpose-built wrapper so active
	// non-KB resources are included in the worker inventory.
	const resourceRef = "resource://y16XEhoTvy07RNTh7QUIfw"
	wrapped := &accountErasureRepoWithResources{accountErasureRepoStub: repo, refs: []string{resourceRef}}
	tenants := &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}, order: &order}
	identity := &accountErasureIdentityStub{order: &order}
	knowledge := &accountErasureKBStub{erasureFiles: routedFiles}
	svc := newAccountErasureService(
		wrapped, knowledge, globalFiles, tenants, nil, nil, &accountErasureBillingStub{}, identity,
	)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.NoError(t, svc.Process(context.Background(), task))
	require.Equal(t, []string{"file", "tenant", "identity", "purge"}, order)
	require.Equal(t, []uint64{7}, knowledge.erasureFileTenantIDs)
	require.Equal(t, []string{resourceRef}, knowledge.erasureFileReferences)
	require.Equal(t, []string{resourceRef}, routedFiles.deleted)
	require.Empty(t, globalFiles.deleted)
}

func TestAccountErasureWorkerTreatsAlreadyDeletedRemainingResourceAsRetrySuccess(t *testing.T) {
	target := eligibleErasureTarget()
	repo := &accountErasureRepoStub{target: target}
	const resourceRef = "resource://y16XEhoTvy07RNTh7QUIfw"
	wrapped := &accountErasureRepoWithResources{accountErasureRepoStub: repo, refs: []string{resourceRef}}
	routedFiles := &accountErasureFileStub{errs: []error{errors.New("catalog update failed"), fs.ErrNotExist}}
	globalFiles := &accountErasureFileStub{err: errors.New("global storage must not receive a catalog reference")}
	tenants := &accountErasureTenantStub{tenant: &types.Tenant{ID: 7}}
	knowledge := &accountErasureKBStub{erasureFiles: routedFiles}
	svc := newAccountErasureService(
		wrapped, knowledge, globalFiles, tenants, nil, nil,
		&accountErasureBillingStub{}, &accountErasureIdentityStub{},
	)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.Error(t, svc.Process(context.Background(), task))
	require.False(t, repo.purged)
	require.NoError(t, svc.Process(context.Background(), task))
	require.True(t, repo.purged)
	require.Equal(t, []string{resourceRef, resourceRef}, routedFiles.deleted)
	require.Empty(t, globalFiles.deleted)
}

type accountErasureRepoWithResources struct {
	*accountErasureRepoStub
	refs []string
}

func (r *accountErasureRepoWithResources) ListActiveResourceReferences(context.Context, uint64) ([]string, error) {
	return r.refs, nil
}

func TestAccountErasureWorkerRetriesAfterTenantWasSoftDeleted(t *testing.T) {
	target := eligibleErasureTarget()
	target.OwnerTenantCount = 0
	target.IsTenantDeleted = true
	repo := &accountErasureRepoStub{target: target}
	tenants := &accountErasureTenantStub{}
	identity := &accountErasureIdentityStub{}
	svc := newAccountErasureService(repo, &accountErasureKBStub{}, &accountErasureFileStub{}, tenants, nil, nil, &accountErasureBillingStub{}, identity)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.NoError(t, svc.Process(context.Background(), task))
	require.Empty(t, tenants.deleted)
	require.Equal(t, 1, identity.calls)
	require.True(t, repo.purged)
}

func TestAccountErasureWorkerAllowsKnownMissingTenantOnRetry(t *testing.T) {
	target := eligibleErasureTarget()
	target.OwnerTenantCount = 0
	target.IsTenantDeleted = true
	repo := &accountErasureRepoStub{target: target}
	tenants := &accountErasureTenantStub{getErr: apprepo.ErrTenantNotFound}
	identity := &accountErasureIdentityStub{}
	svc := newAccountErasureService(repo, &accountErasureKBStub{}, &accountErasureFileStub{}, tenants, nil, nil, &accountErasureBillingStub{}, identity)
	task, err := NewAccountErasureTask("user-1")
	require.NoError(t, err)

	require.NoError(t, svc.Process(context.Background(), task))
	require.True(t, repo.purged)
}
