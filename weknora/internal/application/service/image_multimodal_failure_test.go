package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/infrastructure/docparser"
	"github.com/Tencent/WeKnora/internal/models/vlm"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
)

type multimodalFailureVLM struct {
	ocrText     string
	ocrErr      error
	captionText string
	captionErr  error
	seenImages  [][]byte
}

func (m *multimodalFailureVLM) Predict(_ context.Context, images [][]byte, prompt string) (string, error) {
	if len(images) > 0 {
		m.seenImages = append(m.seenImages, append([]byte(nil), images[0]...))
	}
	if strings.Contains(prompt, "OCR assistant") || strings.Contains(prompt, "OCR and document layout") {
		return m.ocrText, m.ocrErr
	}
	return m.captionText, m.captionErr
}

func TestImageMultimodalHandleNormalizesStoredHEICBeforeVLM(t *testing.T) {
	jpegPath, converterDir := installMultimodalFakeHEICConverter(t)
	t.Setenv("MUSUW_TEST_JPEG", jpegPath)
	t.Setenv("PATH", converterDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	model := &multimodalFailureVLM{
		ocrText:     "Readable text",
		captionText: "A useful caption",
	}
	chunks := &multimodalFailureChunkService{}
	svc := newMultimodalFailureService(model, chunks)
	svc.fileSvc = multimodalFailureFileService{
		data: []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf"),
	}

	if err := svc.Handle(context.Background(), multimodalFailureTask(t)); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(model.seenImages) != 2 {
		t.Fatalf("VLM inputs = %d, want OCR and caption inputs", len(model.seenImages))
	}
	for i, input := range model.seenImages {
		if _, err := jpeg.Decode(bytes.NewReader(input)); err != nil {
			t.Fatalf("VLM input %d is not normalized JPEG: %v", i, err)
		}
	}
	if len(chunks.chunks) != 2 {
		t.Fatalf("created chunks = %d, want OCR and caption chunks", len(chunks.chunks))
	}
}

func installMultimodalFakeHEICConverter(t *testing.T) (jpegPath, converterDir string) {
	t.Helper()
	dir := t.TempDir()
	img := image.NewRGBA(image.Rect(0, 0, 200, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 200; x++ {
			img.Set(x, y, color.RGBA{R: byte(x), G: byte(y), B: 96, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode test JPEG: %v", err)
	}
	jpegPath = filepath.Join(dir, "expected.jpg")
	if err := os.WriteFile(jpegPath, encoded.Bytes(), 0o600); err != nil {
		t.Fatalf("write test JPEG: %v", err)
	}
	converter := filepath.Join(dir, "heif-convert")
	if err := os.WriteFile(converter, []byte("#!/bin/sh\ncp \"$MUSUW_TEST_JPEG\" \"$4\"\n"), 0o700); err != nil {
		t.Fatalf("write fake heif-convert: %v", err)
	}
	return jpegPath, dir
}

func (m *multimodalFailureVLM) GetModelName() string { return "multimodal-failure-test" }
func (m *multimodalFailureVLM) GetModelID() string   { return "multimodal-failure-test" }

type multimodalFailureModelService struct {
	interfaces.ModelService
	model       vlm.VLM
	requestedID *string
}

func (s multimodalFailureModelService) GetVLMModel(_ context.Context, id string) (vlm.VLM, error) {
	if s.requestedID != nil {
		*s.requestedID = id
	}
	return s.model, nil
}

type multimodalFailureKBService struct {
	interfaces.KnowledgeBaseService
	kb *types.KnowledgeBase
}

func (s multimodalFailureKBService) GetKnowledgeBaseByIDOnly(context.Context, string) (*types.KnowledgeBase, error) {
	return s.kb, nil
}

type multimodalFailureTenantRepo struct {
	interfaces.TenantRepository
	tenant *types.Tenant
}

func (r multimodalFailureTenantRepo) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return r.tenant, nil
}

type multimodalFailureFileService struct {
	interfaces.FileService
	data []byte
	err  error
}

func (s multimodalFailureFileService) GetFile(context.Context, string) (io.ReadCloser, error) {
	if s.err != nil {
		return nil, s.err
	}
	return io.NopCloser(bytes.NewReader(s.data)), nil
}

type multimodalFailureKnowledgeRepo struct {
	interfaces.KnowledgeRepository
	knowledge *types.Knowledge
	failErr   error
	failCalls int
}

func (r *multimodalFailureKnowledgeRepo) GetKnowledgeByIDOnly(context.Context, string) (*types.Knowledge, error) {
	return r.knowledge, nil
}

func (r *multimodalFailureKnowledgeRepo) FailKnowledgeParseAttempt(
	_ context.Context,
	_ string,
	_ int,
	errorMessage string,
) (bool, error) {
	r.failCalls++
	if r.failErr != nil {
		return false, r.failErr
	}
	if r.knowledge == nil || r.knowledge.ParseStatus != types.ParseStatusProcessing {
		return false, nil
	}
	r.knowledge.ParseStatus = types.ParseStatusFailed
	r.knowledge.ErrorMessage = errorMessage
	return true, nil
}

type multimodalFailureChunkService struct {
	interfaces.ChunkService
	chunks []*types.Chunk
}

func (s *multimodalFailureChunkService) CreateChunks(_ context.Context, chunks []*types.Chunk) error {
	s.chunks = append(s.chunks, chunks...)
	return nil
}

func (s *multimodalFailureChunkService) GetChunkByIDOnly(_ context.Context, id string) (*types.Chunk, error) {
	for _, chunk := range s.chunks {
		if chunk.ID == id {
			return chunk, nil
		}
	}
	return nil, fmt.Errorf("chunk %s not found", id)
}

func (s *multimodalFailureChunkService) UpdateChunk(_ context.Context, _ *types.Chunk) error {
	return nil
}

type multimodalFailureTaskEnqueuer struct {
	interfaces.TaskEnqueuer
	tasks []*asynq.Task
	err   error
}

type multimodalFailureSpanTracker struct {
	SpanTracker
	latest int
}

func (t multimodalFailureSpanTracker) LatestAttempt(context.Context, string) int { return t.latest }

func (e *multimodalFailureTaskEnqueuer) Enqueue(task *asynq.Task, _ ...asynq.Option) (*asynq.TaskInfo, error) {
	if e.err != nil {
		return nil, e.err
	}
	e.tasks = append(e.tasks, task)
	return &asynq.TaskInfo{ID: "post-process"}, nil
}

func TestEnqueueImageMultimodalFailureFailsParentBeforePartialCompletion(t *testing.T) {
	repo := &multimodalFailureKnowledgeRepo{knowledge: &types.Knowledge{
		ID: "knowledge-1", ParseStatus: types.ParseStatusProcessing,
	}}
	queue := &multimodalFailureTaskEnqueuer{err: errors.New("queue unavailable")}
	service := &knowledgeService{repo: repo, task: queue}

	service.enqueueImageMultimodalTasks(
		withAttempt(context.Background(), 1),
		repo.knowledge,
		&types.KnowledgeBase{ID: "kb-1"},
		[]docparser.StoredImage{{ServingURL: "local://image.png"}},
		nil,
		nil,
	)

	require.Equal(t, types.ParseStatusFailed, repo.knowledge.ParseStatus)
	require.Equal(t, 1, repo.failCalls)
}

func newMultimodalFailureService(model vlm.VLM, chunks *multimodalFailureChunkService) *ImageMultimodalService {
	kb := &types.KnowledgeBase{
		ID:        "kb-1",
		VLMConfig: types.VLMConfig{Enabled: true, ModelID: "vlm-1"},
	}
	return &ImageMultimodalService{
		chunkService: chunks,
		modelService: multimodalFailureModelService{model: model},
		kbService:    multimodalFailureKBService{kb: kb},
		knowledgeRepo: &multimodalFailureKnowledgeRepo{knowledge: &types.Knowledge{
			ID: "knowledge-1", ParseStatus: types.ParseStatusProcessing,
		}},
		tenantRepo: multimodalFailureTenantRepo{tenant: &types.Tenant{ID: 1}},
		fileSvc:    multimodalFailureFileService{data: []byte("not-really-an-image")},
	}
}

func multimodalFailureTask(t *testing.T) *asynq.Task {
	t.Helper()
	payload, err := json.Marshal(types.ImageMultimodalPayload{
		TenantID:        1,
		KnowledgeID:     "knowledge-1",
		KnowledgeBaseID: "kb-1",
		ChunkID:         "chunk-1",
		ImageURL:        "local://image.png",
		EnableOCR:       true,
		EnableCaption:   true,
		Attempt:         1,
	})
	if err != nil {
		t.Fatal(err)
	}
	return asynq.NewTask(types.TypeImageMultimodal, payload)
}

func TestImageMultimodalHandleReturnsErrorWhenOCRAndCaptionFail(t *testing.T) {
	t.Parallel()
	modelErr := errors.New("OpenAI VLM response contained no choices")
	chunks := &multimodalFailureChunkService{}
	svc := newMultimodalFailureService(&multimodalFailureVLM{
		ocrErr:     modelErr,
		captionErr: modelErr,
	}, chunks)

	err := svc.Handle(context.Background(), multimodalFailureTask(t))
	if err == nil {
		t.Fatal("expected handler to return an error when both VLM calls fail")
	}
	if !strings.Contains(err.Error(), "image multimodal extraction failed") {
		t.Fatalf("error = %q, want extraction failure", err)
	}
	if len(chunks.chunks) != 0 {
		t.Fatalf("created %d chunks after two failed VLM calls, want 0", len(chunks.chunks))
	}
}

func TestImageMultimodalHandlePersistsSuccessfulCaptionWhenOCRFails(t *testing.T) {
	t.Parallel()
	modelErr := errors.New("OCR unavailable")
	chunks := &multimodalFailureChunkService{}
	svc := newMultimodalFailureService(&multimodalFailureVLM{
		ocrErr:      modelErr,
		captionText: "A useful caption",
	}, chunks)

	if err := svc.Handle(context.Background(), multimodalFailureTask(t)); err != nil {
		t.Fatalf("handler returned error with a successful caption: %v", err)
	}
	if len(chunks.chunks) != 1 {
		t.Fatalf("created %d chunks, want one caption chunk", len(chunks.chunks))
	}
	chunk := chunks.chunks[0]
	if chunk.ChunkType != types.ChunkTypeImageCaption || chunk.Content != "A useful caption" {
		t.Fatalf("created chunk = %+v, want caption content", chunk)
	}
	if chunk.ParentChunkID != "chunk-1" || !chunk.IsEnabled {
		t.Fatalf("created chunk parent/enabled = %q/%v, want chunk-1/true", chunk.ParentChunkID, chunk.IsEnabled)
	}
}

func TestImageMultimodalHandleRejectsEmptyImageWithoutEvidence(t *testing.T) {
	t.Parallel()
	chunks := &multimodalFailureChunkService{}
	svc := newMultimodalFailureService(&multimodalFailureVLM{
		ocrText:     "No text content.",
		captionText: "",
	}, chunks)

	err := svc.Handle(context.Background(), multimodalFailureTask(t))
	if err == nil || !strings.Contains(err.Error(), "no usable image content") {
		t.Fatalf("empty image error = %v, want no usable image content", err)
	}
	if len(chunks.chunks) != 0 {
		t.Fatalf("created %d chunks for an empty image, want 0", len(chunks.chunks))
	}
}

func TestImageMultimodalHandleFinalFailedAttemptFailsParentWithoutPostProcess(t *testing.T) {
	t.Parallel()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("start miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	modelErr := errors.New("OpenAI VLM response contained no choices")
	chunks := &multimodalFailureChunkService{}
	enqueuer := &multimodalFailureTaskEnqueuer{}
	svc := newMultimodalFailureService(&multimodalFailureVLM{
		ocrErr:     modelErr,
		captionErr: modelErr,
	}, chunks)
	svc.redisClient = rdb
	svc.taskEnqueuer = enqueuer
	repo := svc.knowledgeRepo.(*multimodalFailureKnowledgeRepo)

	redisKey := multimodalPendingKey("knowledge-1", 1)
	if err := rdb.Set(context.Background(), redisKey, 1, 0).Err(); err != nil {
		t.Fatal(err)
	}
	ctx := types.WithTaskRetryMetadata(context.Background(), 3, 3)
	err = svc.Handle(ctx, multimodalFailureTask(t))
	if err == nil {
		t.Fatal("expected final failed attempt to return the VLM error")
	}
	if !mr.Exists(redisKey) {
		t.Fatal("terminal failure must keep the success fan-in gate closed")
	}
	if len(enqueuer.tasks) != 0 {
		t.Fatalf("post-process enqueue = %d tasks after failed image, want zero", len(enqueuer.tasks))
	}
	if repo.knowledge.ParseStatus != types.ParseStatusFailed {
		t.Fatalf("parent status = %q, want failed", repo.knowledge.ParseStatus)
	}
	if repo.knowledge.ErrorMessage != ImageParseFailedPublicMessage {
		t.Fatalf("parent error = %q, want %q", repo.knowledge.ErrorMessage, ImageParseFailedPublicMessage)
	}
	if repo.failCalls != 1 {
		t.Fatalf("guarded failure calls = %d, want one", repo.failCalls)
	}
}

func TestImageMultimodalHandleUnreadableImageRetries(t *testing.T) {
	t.Parallel()
	svc := newMultimodalFailureService(&multimodalFailureVLM{}, &multimodalFailureChunkService{})
	svc.fileSvc = multimodalFailureFileService{err: errors.New("stored image unavailable")}

	err := svc.Handle(context.Background(), multimodalFailureTask(t))
	if err == nil || !strings.Contains(err.Error(), "read image") {
		t.Fatalf("unreadable image error = %v, want retryable read error", err)
	}
}

func TestImageMultimodalHandleDropsSupersededAttemptBeforeVLM(t *testing.T) {
	t.Parallel()
	model := &multimodalFailureVLM{captionText: "must not run"}
	svc := newMultimodalFailureService(model, &multimodalFailureChunkService{})
	svc.spanTracker = multimodalFailureSpanTracker{SpanTracker: noopSpanTracker{}, latest: 2}

	if err := svc.Handle(context.Background(), multimodalFailureTask(t)); err != nil {
		t.Fatalf("Handle stale attempt: %v", err)
	}
	if len(model.seenImages) != 0 {
		t.Fatalf("stale attempt made %d VLM calls, want zero", len(model.seenImages))
	}
	if calls := svc.knowledgeRepo.(*multimodalFailureKnowledgeRepo).failCalls; calls != 0 {
		t.Fatalf("stale attempt failure writes = %d, want zero", calls)
	}
}

func TestImageMultimodalMissingPendingCounterDoesNotPostProcess(t *testing.T) {
	t.Parallel()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	enqueuer := &multimodalFailureTaskEnqueuer{}
	svc := newMultimodalFailureService(
		&multimodalFailureVLM{captionText: "usable caption"},
		&multimodalFailureChunkService{},
	)
	svc.redisClient = rdb
	svc.taskEnqueuer = enqueuer

	if err := svc.Handle(context.Background(), multimodalFailureTask(t)); err != nil {
		t.Fatalf("Handle successful image: %v", err)
	}
	if len(enqueuer.tasks) != 0 {
		t.Fatalf("missing counter enqueued %d post-process tasks, want zero", len(enqueuer.tasks))
	}
	repo := svc.knowledgeRepo.(*multimodalFailureKnowledgeRepo)
	if repo.knowledge.ParseStatus != types.ParseStatusProcessing {
		t.Fatalf("parent status = %q, want processing for housekeeping recovery", repo.knowledge.ParseStatus)
	}
}

func TestImageMultimodalSuccessfulFanInPreservesAttempt(t *testing.T) {
	t.Parallel()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	requireSet := func(key string, value int) {
		if err := rdb.Set(context.Background(), key, value, 0).Err(); err != nil {
			t.Fatal(err)
		}
	}
	requireSet(multimodalPendingKey("knowledge-1", 1), 1)

	enqueuer := &multimodalFailureTaskEnqueuer{}
	svc := newMultimodalFailureService(
		&multimodalFailureVLM{captionText: "usable caption"},
		&multimodalFailureChunkService{},
	)
	svc.redisClient = rdb
	svc.taskEnqueuer = enqueuer
	require.NoError(t, svc.Handle(context.Background(), multimodalFailureTask(t)))
	require.Len(t, enqueuer.tasks, 1)

	var payload types.KnowledgePostProcessPayload
	require.NoError(t, json.Unmarshal(enqueuer.tasks[0].Payload(), &payload))
	require.Equal(t, 1, payload.Attempt)
}

func TestImageMultimodalResolveVLMRoutesLegacyVideoModelToImageModel(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	requestedID := ""
	model := &multimodalFailureVLM{}
	svc := newMultimodalFailureService(model, &multimodalFailureChunkService{})
	svc.modelService = multimodalFailureModelService{model: model, requestedID: &requestedID}
	svc.kbService = multimodalFailureKBService{kb: &types.KnowledgeBase{
		ID: "kb-1",
		VLMConfig: types.VLMConfig{
			Enabled: true,
			ModelID: legacyMiMoVideoModelID,
		},
	}}

	_, config, err := svc.resolveVLM(context.Background(), "kb-1", "knowledge-1")
	if err != nil {
		t.Fatalf("resolveVLM: %v", err)
	}
	if requestedID != types.PlatformKnowledgeBaseVLMModelID || config.ModelID != types.PlatformKnowledgeBaseVLMModelID {
		t.Fatalf(
			"requested/config model = %q/%q, want %q",
			requestedID,
			config.ModelID,
			types.PlatformKnowledgeBaseVLMModelID,
		)
	}
}

func TestImageMultimodalResolveVLMRoutesLegacyVideoModelInStandard(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	requestedID := ""
	model := &multimodalFailureVLM{}
	svc := newMultimodalFailureService(model, &multimodalFailureChunkService{})
	svc.modelService = multimodalFailureModelService{model: model, requestedID: &requestedID}
	svc.kbService = multimodalFailureKBService{kb: &types.KnowledgeBase{
		ID: "kb-1",
		VLMConfig: types.VLMConfig{
			Enabled: true,
			ModelID: legacyMiMoVideoModelID,
		},
	}}

	_, config, err := svc.resolveVLM(context.Background(), "kb-1", "knowledge-1")
	if err != nil {
		t.Fatalf("resolveVLM: %v", err)
	}
	if requestedID != types.PlatformKnowledgeBaseVLMModelID || config.ModelID != types.PlatformKnowledgeBaseVLMModelID {
		t.Fatalf(
			"requested/config model = %q/%q, want %q",
			requestedID,
			config.ModelID,
			types.PlatformKnowledgeBaseVLMModelID,
		)
	}
}
