package service

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type fireActorKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	actor string
}

func (r *fireActorKnowledgeRepo) GetKnowledgeByIDOnly(ctx context.Context, _ string) (*types.Knowledge, error) {
	r.actor, _ = types.UserIDFromContext(ctx)
	return nil, errors.New("test stops before model execution")
}
func TestFirePostProcessRestoresInitiatorBeforeDocumentWork(t *testing.T) {
	repo := &fireActorKnowledgeRepo{}
	svc := &KnowledgePostProcessService{knowledgeRepo: repo}
	err := svc.Handle(context.Background(), asynq.NewTask(types.TypeKnowledgePostProcess, []byte(`{"tenant_id":7,"knowledge_id":"doc","knowledge_base_id":"kb","initiator":{"user_id":"real-operator","role":"admin"}}`)))
	require.Error(t, err)
	require.Equal(t, "real-operator", repo.actor, "worker must preserve the operator instead of charging the tenant owner")
}

type fireActorPendingRepo struct {
	interfaces.TaskPendingOpsRepository
	rows     []*types.TaskPendingOp
	released []int64
}

func (r *fireActorPendingRepo) PeekBatch(context.Context, string, string, string, int) ([]*types.TaskPendingOp, error) {
	return r.rows, nil
}
func (r *fireActorPendingRepo) ClaimBatch(context.Context, string, string, string, int, time.Time) ([]*types.TaskPendingOp, error) {
	return r.rows, nil
}
func (r *fireActorPendingRepo) ReleaseByIDs(_ context.Context, ids []int64) error {
	r.released = append(r.released, ids...)
	return nil
}
func fireActorRow(id int64, doc, actor string) *types.TaskPendingOp {
	raw, _ := json.Marshal(map[string]any{"op": "ingest", "knowledge_id": doc, "initiator": map[string]any{"user_id": actor, "role": "owner"}})
	return &types.TaskPendingOp{ID: id, DedupKey: doc, Payload: raw}
}
func TestFireWikiBatchDoesNotMixAdminAndCustomerInitiators(t *testing.T) {
	for _, claim := range []bool{false, true} {
		repo := &fireActorPendingRepo{rows: []*types.TaskPendingOp{fireActorRow(1, "admin-document", "operator"), fireActorRow(2, "customer-document", "customer")}}
		svc := &wikiIngestService{pendingRepo: repo}
		var ops []WikiPendingOp
		var ids []int64
		var err error
		if claim {
			ops, ids, err = svc.claimPendingList(context.Background(), "kb", 20)
		} else {
			ops, ids, err = svc.peekPendingList(context.Background(), "kb", 20)
		}
		require.NoError(t, err)
		require.Len(t, ops, 1)
		require.Equal(t, []int64{1}, ids)
		if claim {
			require.Equal(t, []int64{2}, repo.released)
		}
	}
}

func TestFireWikiActorPartitionKeepsLatestDocumentDeduplication(t *testing.T) {
	rows := []*types.TaskPendingOp{fireActorRow(1, "same-document", "customer"), fireActorRow(2, "other-document", "customer"), fireActorRow(3, "same-document", "operator")}
	selected, deferred := oneWikiInitiatorRows(rows, true)
	require.Equal(t, []int64{2}, deferred)
	svc := &wikiIngestService{}
	ops, ids := svc.decodePendingRows(context.Background(), selected)
	require.Equal(t, []int64{1, 3}, ids)
	require.Len(t, ops, 1)
	require.Equal(t, "operator", ops[0].Initiator.UserID)
	require.Equal(t, int64(3), ops[0].dbID)
}

func TestFireWikiFinalizeRowsKeepTheirOwnInitiator(t *testing.T) {
	rows := []*types.TaskPendingOp{fireActorRow(1, "", "operator"), fireActorRow(2, "", "customer"), fireActorRow(3, "", "operator")}
	selected, deferred := oneWikiInitiatorRows(rows, false)
	require.Len(t, selected, 2)
	require.Equal(t, []int64{2}, deferred)
	legacy := &types.TaskPendingOp{ID: 4, Payload: json.RawMessage(`{"slug":"index"}`)}
	selected, deferred = oneWikiInitiatorRows(append([]*types.TaskPendingOp{legacy}, rows...), false)
	require.Equal(t, []*types.TaskPendingOp{legacy}, selected)
	require.Equal(t, []int64{1, 2, 3}, deferred)
}

type fireTemporaryActorRepo struct {
	interfaces.TemporaryDocumentRepository
	doc         *types.TemporaryDocument
	readyTenant uint64
}

func (r *fireTemporaryActorRepo) Create(_ context.Context, doc *types.TemporaryDocument) error {
	doc.ID = "temporary-doc"
	r.doc = doc
	return nil
}
func (r *fireTemporaryActorRepo) GetByID(_ context.Context, tenantID uint64, _ string) (*types.TemporaryDocument, error) {
	if tenantID != r.doc.TenantID {
		return nil, errors.New("wrong attachment owner")
	}
	return r.doc, nil
}
func (r *fireTemporaryActorRepo) MarkProcessing(context.Context, uint64, string, time.Time) error {
	return nil
}
func (r *fireTemporaryActorRepo) MarkReady(_ context.Context, tenantID uint64, _, _ string, _, _, _ types.JSON, _, _ int, _ time.Time) error {
	r.readyTenant = tenantID
	return nil
}

type fireTemporaryActorFile struct {
	interfaces.FileService
	actor  string
	tenant uint64
}

func (f *fireTemporaryActorFile) SaveBytes(context.Context, []byte, uint64, string, bool) (string, error) {
	return "provider://test/doc", nil
}
func (f *fireTemporaryActorFile) GetFile(ctx context.Context, _ string) (io.ReadCloser, error) {
	f.actor, _ = types.UserIDFromContext(ctx)
	f.tenant, _ = types.TenantIDFromContext(ctx)
	return io.NopCloser(strings.NewReader("# 真实资料\n\n一些可以解析的文字。")), nil
}

type fireTemporaryActorTenant struct{ interfaces.TenantService }

func (*fireTemporaryActorTenant) GetTenantByID(_ context.Context, id uint64) (*types.Tenant, error) {
	return &types.Tenant{ID: id}, nil
}

type fireTemporaryActorQueue struct{ task *asynq.Task }

func (q *fireTemporaryActorQueue) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	q.task = task
	return &asynq.TaskInfo{}, nil
}

func TestFireTemporaryAttachmentKeepsCallerAcrossSharedParserTenant(t *testing.T) {
	for _, actor := range []string{"real-operator", "paying-customer", "api-platform:7"} {
		t.Run(actor, func(t *testing.T) {
			repo, files, queue := &fireTemporaryActorRepo{}, &fireTemporaryActorFile{}, &fireTemporaryActorQueue{}
			svc := &temporaryDocumentService{repo: repo, fileService: files, tenantService: &fireTemporaryActorTenant{}, taskEnqueuer: queue}
			ctx := context.WithValue(context.Background(), types.UserIDContextKey, actor)
			ctx = context.WithValue(ctx, types.TenantIDContextKey, uint64(11))
			text := "# 资料\n\n正文。"
			_, err := svc.Create(ctx, 11, "session", "notes.md", "text/markdown", int64(len(text)), strings.NewReader(text), types.TemporaryDocumentCreateOptions{ResourceTenantID: 99})
			require.NoError(t, err)
			require.NotNil(t, queue.task)
			// Run the actual queued native worker with a fresh context. The shared
			// parser may resolve in 99, but the billable caller must remain actor.
			require.NoError(t, svc.Process(context.Background(), queue.task))
			require.Equal(t, actor, files.actor)
			require.Equal(t, uint64(99), files.tenant)
			require.Equal(t, uint64(11), repo.readyTenant, "the attachment itself must remain owned by the original tenant")
		})
	}
}
