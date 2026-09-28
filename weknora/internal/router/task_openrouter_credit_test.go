package router

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/models/vlm"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type openRouterCreditRepoStub struct {
	interfaces.KnowledgeRepository
	knowledgeID string
	updates     map[string]interface{}
}

func (r *openRouterCreditRepoStub) UpdateKnowledgeColumns(
	_ context.Context,
	knowledgeID string,
	updates map[string]interface{},
) error {
	r.knowledgeID = knowledgeID
	r.updates = updates
	return nil
}

type openRouterCreditKnowledgeServiceStub struct {
	interfaces.KnowledgeService
	repo interfaces.KnowledgeRepository
}

func (s *openRouterCreditKnowledgeServiceStub) GetRepository() interfaces.KnowledgeRepository {
	return s.repo
}

func TestOpenRouterCreditExhaustionStopsRetryAndMarksKnowledge(t *testing.T) {
	repo := &openRouterCreditRepoStub{}
	ks := &openRouterCreditKnowledgeServiceStub{repo: repo}
	middleware := openRouterCreditExhaustionMiddleware(ks, nil)
	handler := middleware(asynq.HandlerFunc(func(context.Context, *asynq.Task) error {
		return &openrouter.CreditExhaustedError{StatusCode: 402}
	}))

	payload, err := json.Marshal(map[string]interface{}{
		"knowledge_id": "knowledge-credit-test",
	})
	require.NoError(t, err)
	task := asynq.NewTask(types.TypeDocumentProcess, payload)

	err = handler.ProcessTask(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
	require.True(t, openrouter.IsCreditExhausted(err))
	require.Equal(t, "knowledge-credit-test", repo.knowledgeID)
	require.Equal(t, types.ParseStatusFailed, repo.updates["parse_status"])
	require.Equal(t, openRouterCreditExhaustedMessage, repo.updates["error_message"])
}

func TestOpenRouterCreditExhaustionSkipsRetryWithoutRegressingCompletedEnrichment(t *testing.T) {
	repo := &openRouterCreditRepoStub{}
	ks := &openRouterCreditKnowledgeServiceStub{repo: repo}
	middleware := openRouterCreditExhaustionMiddleware(ks, nil)
	handler := middleware(asynq.HandlerFunc(func(context.Context, *asynq.Task) error {
		return &openrouter.CreditExhaustedError{StatusCode: 402}
	}))

	payload, err := json.Marshal(map[string]interface{}{
		"knowledge_id": "knowledge-enrichment-test",
	})
	require.NoError(t, err)
	task := asynq.NewTask(types.TypeSummaryGeneration, payload)

	err = handler.ProcessTask(context.Background(), task)
	require.Error(t, err)
	require.True(t, errors.Is(err, asynq.SkipRetry))
	require.Empty(t, repo.knowledgeID)
	require.Nil(t, repo.updates)
}

type videoCreditKnowledgeRepoStub struct {
	interfaces.KnowledgeRepository
	knowledge *types.Knowledge
	updates   map[string]interface{}
}

func (r *videoCreditKnowledgeRepoStub) GetKnowledgeByID(
	context.Context,
	uint64,
	string,
) (*types.Knowledge, error) {
	return r.knowledge, nil
}

func (r *videoCreditKnowledgeRepoStub) UpdateKnowledge(context.Context, *types.Knowledge) error {
	return nil
}

func (r *videoCreditKnowledgeRepoStub) UpdateKnowledgeColumns(
	_ context.Context,
	_ string,
	updates map[string]interface{},
) error {
	r.updates = updates
	return nil
}

type videoCreditKnowledgeBaseServiceStub struct {
	interfaces.KnowledgeBaseService
	kb *types.KnowledgeBase
}

func (s *videoCreditKnowledgeBaseServiceStub) GetKnowledgeBaseByID(
	context.Context,
	string,
) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

type videoCreditTenantRepoStub struct {
	interfaces.TenantRepository
	tenant *types.Tenant
}

func (s *videoCreditTenantRepoStub) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return s.tenant, nil
}

type videoCreditFileServiceStub struct {
	interfaces.FileService
}

func (videoCreditFileServiceStub) GetFile(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("bounded-video-fixture")), nil
}

type videoCreditModelServiceStub struct {
	interfaces.ModelService
	model vlm.VLM
}

func (s *videoCreditModelServiceStub) GetVLMModel(context.Context, string) (vlm.VLM, error) {
	return s.model, nil
}

type creditExhaustedVideoVLM struct{}

func (creditExhaustedVideoVLM) Predict(context.Context, [][]byte, string) (string, error) {
	return "", errors.New("unexpected image prediction")
}

func (creditExhaustedVideoVLM) PredictVideo(context.Context, []byte, string, string) (string, error) {
	return "", vlm.RetryableVideoError(
		&openrouter.CreditExhaustedError{StatusCode: http.StatusPaymentRequired},
	)
}

func (creditExhaustedVideoVLM) GetModelName() string { return "video-credit-test" }
func (creditExhaustedVideoVLM) GetModelID() string   { return "video-credit-test" }

type videoCreditSpanTrackerStub struct {
	service.SpanTracker
	stage         *service.Span
	stageFailCode string
	rootFailCode  string
}

func (s *videoCreditSpanTrackerStub) BeginStage(
	_ context.Context,
	knowledgeID string,
	attempt int,
	stage string,
	_ types.JSONMap,
) *service.Span {
	s.stage = &service.Span{KnowledgeID: knowledgeID, Attempt: attempt, Name: stage}
	return s.stage
}

func (s *videoCreditSpanTrackerStub) LookupStage(
	context.Context,
	string,
	int,
	string,
) *service.Span {
	return s.stage
}

func (s *videoCreditSpanTrackerStub) FailSpan(
	_ context.Context,
	_ *service.Span,
	errorCode string,
	_ string,
	_ error,
) {
	s.stageFailCode = errorCode
	// The production tracker closes the root when a main pipeline stage fails.
	// Mirror that interface contract so this test can also prove the generic
	// credit middleware did not replace the video-safe root code afterward.
	s.rootFailCode = errorCode
}

func (s *videoCreditSpanTrackerStub) FinalizeAttempt(
	_ context.Context,
	_ string,
	_ int,
	_ string,
	_ types.JSONMap,
	errorCode string,
	_ string,
) {
	s.rootFailCode = errorCode
}

func TestOpenRouterVideoCreditExhaustionSurvivesIngestionAndStopsWorkerRetry(t *testing.T) {
	const (
		tenantID    = uint64(1)
		knowledgeID = "knowledge-video-credit-test"
		kbID        = "kb-video-credit-test"
	)
	repo := &videoCreditKnowledgeRepoStub{knowledge: &types.Knowledge{
		ID:              knowledgeID,
		TenantID:        tenantID,
		KnowledgeBaseID: kbID,
		FileType:        "mp4",
		FileSize:        int64(len("bounded-video-fixture")),
		ParseStatus:     types.ParseStatusPending,
	}}
	tracker := &videoCreditSpanTrackerStub{}
	ks, err := service.NewKnowledgeService(
		nil,
		repo,
		nil,
		&videoCreditKnowledgeBaseServiceStub{kb: &types.KnowledgeBase{
			ID:        kbID,
			TenantID:  tenantID,
			VLMConfig: types.VLMConfig{Enabled: true, ModelID: "builtin-openrouter-vlm"},
		}},
		&videoCreditTenantRepoStub{tenant: &types.Tenant{ID: tenantID}},
		nil,
		nil,
		nil,
		nil,
		nil,
		videoCreditFileServiceStub{},
		nil,
		nil,
		&videoCreditModelServiceStub{model: creditExhaustedVideoVLM{}},
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		tracker,
		nil,
	)
	require.NoError(t, err)

	payload, err := json.Marshal(types.DocumentProcessPayload{
		TenantID:        tenantID,
		KnowledgeID:     knowledgeID,
		KnowledgeBaseID: kbID,
		FilePath:        "stored/video.mp4",
		FileName:        "video.mp4",
		FileType:        "mp4",
		Attempt:         1,
	})
	require.NoError(t, err)
	task := asynq.NewTask(types.TypeDocumentProcess, payload)
	handler := openRouterCreditExhaustionMiddleware(ks, tracker)(asynq.HandlerFunc(ks.ProcessDocument))

	err = handler.ProcessTask(context.Background(), task)
	require.Error(t, err)
	var creditErr *openrouter.CreditExhaustedError
	require.ErrorAs(t, err, &creditErr)
	require.ErrorIs(t, err, asynq.SkipRetry)
	require.True(t, openrouter.IsCreditExhausted(err))
	require.Equal(t, openrouter.CreditExhaustedCode, tracker.stageFailCode)
	require.Equal(t, openrouter.CreditExhaustedCode, tracker.rootFailCode)
	require.Nil(t, repo.updates, "generic credit middleware must preserve the video-specific state")
	require.Equal(t, types.ParseStatusFailed, repo.knowledge.ParseStatus)
	require.Equal(t, service.VideoCreditExhaustedPublicMessage, repo.knowledge.ErrorMessage)
}
