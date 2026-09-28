package service

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/vlm"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
)

type videoResourceCatalogStub struct {
	interfaces.ResourceCatalog
	physical string
	resource *types.StoredResource
	err      error
}

func (s *videoResourceCatalogStub) ResolvePath(
	_ context.Context,
	_ string,
) (string, *types.StoredResource, error) {
	return s.physical, s.resource, s.err
}

func TestVideoURLSourcePathUsesPhysicalObjectForResource(t *testing.T) {
	ref := types.BuildResourcePath(strings.Repeat("a", types.ResourceHandleLength))
	physical := "storage://backend-1/s3://bucket/videos/source.mp4"
	svc := &knowledgeService{resourceCatalog: &videoResourceCatalogStub{
		physical: physical,
		resource: &types.StoredResource{PhysicalPath: physical},
	}}

	got, err := svc.videoURLSourcePath(context.Background(), ref)
	if err != nil {
		t.Fatalf("videoURLSourcePath() error = %v", err)
	}
	if got != physical {
		t.Fatalf("videoURLSourcePath() = %q, want %q", got, physical)
	}
}

func TestVideoURLSourcePathLeavesDirectStoragePathUnchanged(t *testing.T) {
	direct := "storage://backend-1/s3://bucket/videos/source.mp4"
	svc := &knowledgeService{resourceCatalog: &videoResourceCatalogStub{
		err: errors.New("must not resolve a direct path"),
	}}

	got, err := svc.videoURLSourcePath(context.Background(), direct)
	if err != nil {
		t.Fatalf("videoURLSourcePath() error = %v", err)
	}
	if got != direct {
		t.Fatalf("videoURLSourcePath() = %q, want %q", got, direct)
	}
}

func TestVideoURLSourcePathRejectsProxyFallbackWhenResourceResolutionFails(t *testing.T) {
	ref := types.BuildResourcePath(strings.Repeat("b", types.ResourceHandleLength))
	svc := &knowledgeService{resourceCatalog: &videoResourceCatalogStub{
		err: errors.New("catalog unavailable"),
	}}

	if got, err := svc.videoURLSourcePath(context.Background(), ref); err == nil || got != "" {
		t.Fatalf("videoURLSourcePath() = (%q, %v), want empty path and error", got, err)
	}
}

func TestVideoURLSourcePathRejectsNestedResourceHandle(t *testing.T) {
	ref := types.BuildResourcePath(strings.Repeat("c", types.ResourceHandleLength))
	nested := types.BuildResourcePath(strings.Repeat("d", types.ResourceHandleLength))
	svc := &knowledgeService{resourceCatalog: &videoResourceCatalogStub{
		physical: nested,
		resource: &types.StoredResource{PhysicalPath: nested},
	}}

	if got, err := svc.videoURLSourcePath(context.Background(), ref); err == nil || got != "" {
		t.Fatalf("videoURLSourcePath() = (%q, %v), want empty path and error", got, err)
	}
}

type videoIngestionRepoStub struct {
	interfaces.KnowledgeRepository
	updates                    []types.Knowledge
	automaticTitleUpdates      []string
	rejectAutomaticTitleUpdate bool
}

func (s *videoIngestionRepoStub) UpdateKnowledge(_ context.Context, knowledge *types.Knowledge) error {
	if knowledge != nil {
		s.updates = append(s.updates, *knowledge)
	}
	return nil
}

type videoIngestionModelServiceStub struct {
	interfaces.ModelService
	model       vlm.VLM
	requestedID string
	err         error
}

func (s *videoIngestionModelServiceStub) GetVLMModel(_ context.Context, id string) (vlm.VLM, error) {
	s.requestedID = id
	return s.model, s.err
}

type videoIngestionFileServiceStub struct {
	interfaces.FileService
	url          string
	urlErr       error
	bytes        []byte
	getFileErr   error
	getURLCalls  int
	getFileCalls int
}

func (s *videoIngestionFileServiceStub) GetFileURL(context.Context, string) (string, error) {
	s.getURLCalls++
	return s.url, s.urlErr
}

func (s *videoIngestionFileServiceStub) GetFile(context.Context, string) (io.ReadCloser, error) {
	s.getFileCalls++
	if s.getFileErr != nil {
		return nil, s.getFileErr
	}
	return io.NopCloser(strings.NewReader(string(s.bytes))), nil
}

type videoIngestionVLM struct {
	urlResult    string
	urlErr       error
	inlineResult string
	inlineErr    error
	urlCalls     int
	inlineCalls  int
}

func (m *videoIngestionVLM) Predict(context.Context, [][]byte, string) (string, error) {
	return "", errors.New("unexpected image prediction")
}

func (m *videoIngestionVLM) PredictVideo(context.Context, []byte, string, string) (string, error) {
	m.inlineCalls++
	return m.inlineResult, m.inlineErr
}

func (m *videoIngestionVLM) PredictVideoURL(context.Context, string, string, string) (string, error) {
	m.urlCalls++
	return m.urlResult, m.urlErr
}

func (*videoIngestionVLM) SupportsVideoURL() bool { return true }
func (*videoIngestionVLM) GetModelName() string   { return "internal-test-model" }
func (*videoIngestionVLM) GetModelID() string     { return "internal-test-id" }

func newVideoIngestionService(
	model *videoIngestionVLM,
	fileSvc *videoIngestionFileServiceStub,
) (*knowledgeService, *videoIngestionRepoStub, *videoIngestionModelServiceStub) {
	repo := &videoIngestionRepoStub{}
	models := &videoIngestionModelServiceStub{model: model}
	return &knowledgeService{repo: repo, modelService: models, fileSvc: fileSvc}, repo, models
}

func videoIngestionFixture(size int64) (types.DocumentProcessPayload, *types.KnowledgeBase, *types.Knowledge) {
	return types.DocumentProcessPayload{
			FilePath: "storage://videos/source.mp4", FileName: "source.mp4", FileType: "mp4",
		}, &types.KnowledgeBase{}, &types.Knowledge{
			ID: "video-knowledge", FilePath: "storage://videos/source.mp4", FileType: "mp4", FileSize: size,
		}
}

func TestConvertVideoUsesFixedModelAndSignedURLWithoutReadingObject(t *testing.T) {
	t.Setenv("MUSUW_VIDEO_VLM_MODEL_ID", "")
	model := &videoIngestionVLM{urlResult: "# Parsed video"}
	fileSvc := &videoIngestionFileServiceStub{url: "https://objects.example.test/source.mp4?signature=short"}
	svc, _, models := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(300_000_000)
	knowledge.Type = "url"
	knowledge.Source = "https://www.instagram.com/reel/example/"
	knowledge.Title = knowledge.Source

	result, err := svc.convertVideo(
		types.WithTaskRetryMetadata(context.Background(), 0, 3),
		payload,
		kb,
		knowledge,
		types.EffectiveProcessConfig{
			VLMConfig: types.VLMConfig{ModelID: "user-selected-model"},
		},
		false,
	)
	if err != nil {
		t.Fatalf("convertVideo: %v", err)
	}
	if result == nil || result.MarkdownContent != "# Parsed video" {
		t.Fatalf("result = %#v", result)
	}
	if result.Metadata["title"] != "Parsed video" {
		t.Fatalf("analysis title = %q, want %q", result.Metadata["title"], "Parsed video")
	}
	if models.requestedID != defaultVideoModelID {
		t.Fatalf("requested model = %q, want %q", models.requestedID, defaultVideoModelID)
	}
	if model.urlCalls != 1 || model.inlineCalls != 0 || fileSvc.getFileCalls != 0 {
		t.Fatalf("calls: url=%d inline=%d getFile=%d", model.urlCalls, model.inlineCalls, fileSvc.getFileCalls)
	}
	if _, ok := result.Metadata["video_model"]; ok {
		t.Fatalf("internal model leaked in metadata: %#v", result.Metadata)
	}
	if _, ok := result.Metadata["video_input_mode"]; ok {
		t.Fatalf("transport leaked in metadata: %#v", result.Metadata)
	}
}

func TestConvertVideoKeepsInlineFallbackSmall(t *testing.T) {
	model := &videoIngestionVLM{inlineResult: "# Small compatibility video"}
	fileSvc := &videoIngestionFileServiceStub{url: "local://videos/source.mp4", bytes: []byte("tiny-video")}
	svc, _, _ := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(int64(len(fileSvc.bytes)))

	result, err := svc.convertVideo(context.Background(), payload, kb, knowledge, types.EffectiveProcessConfig{}, false)
	if err != nil {
		t.Fatalf("convertVideo: %v", err)
	}
	if result == nil || model.inlineCalls != 1 || fileSvc.getFileCalls != 1 {
		t.Fatalf("result=%#v inline=%d getFile=%d", result, model.inlineCalls, fileSvc.getFileCalls)
	}
}

func TestConvertVideoNeverFallsBackToInlineNearLimit(t *testing.T) {
	model := &videoIngestionVLM{}
	fileSvc := &videoIngestionFileServiceStub{url: "local://videos/source.mp4", bytes: []byte("must-not-read")}
	svc, _, _ := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(int64(vlm.MaxInlineVideoBytes) + 1)

	_, err := svc.convertVideo(context.Background(), payload, kb, knowledge, types.EffectiveProcessConfig{}, false)
	if !errors.Is(err, asynq.SkipRetry) {
		t.Fatalf("error = %v, want SkipRetry", err)
	}
	if fileSvc.getFileCalls != 0 || model.inlineCalls != 0 {
		t.Fatalf("large fallback read object: getFile=%d inline=%d", fileSvc.getFileCalls, model.inlineCalls)
	}
	if knowledge.ErrorMessage != VideoSourceFailedPublicMessage {
		t.Fatalf("public error = %q", knowledge.ErrorMessage)
	}
}

func TestConvertVideoRejectsOverProductLimitBeforeModel(t *testing.T) {
	model := &videoIngestionVLM{urlResult: "unexpected"}
	fileSvc := &videoIngestionFileServiceStub{url: "https://objects.example.test/source.mp4"}
	svc, _, models := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(300_000_001)

	_, err := svc.convertVideo(context.Background(), payload, kb, knowledge, types.EffectiveProcessConfig{}, false)
	if !errors.Is(err, asynq.SkipRetry) {
		t.Fatalf("error = %v, want SkipRetry", err)
	}
	if models.requestedID != "" || model.urlCalls != 0 || fileSvc.getURLCalls != 0 {
		t.Fatalf("oversized video reached downstream model/storage")
	}
	if knowledge.ErrorMessage != VideoTooLargePublicMessage {
		t.Fatalf("public error = %q", knowledge.ErrorMessage)
	}
}

func TestConvertVideoRetriesTransientFailureExactlyOnce(t *testing.T) {
	transient := vlm.RetryableVideoError(errors.New("upstream 503 diagnostic"))
	model := &videoIngestionVLM{urlErr: transient}
	fileSvc := &videoIngestionFileServiceStub{url: "https://objects.example.test/source.mp4"}
	svc, _, _ := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(1024)

	_, firstErr := svc.convertVideo(
		types.WithTaskRetryMetadata(context.Background(), 0, 3),
		payload,
		kb,
		knowledge,
		types.EffectiveProcessConfig{},
		false,
	)
	if firstErr == nil || errors.Is(firstErr, asynq.SkipRetry) {
		t.Fatalf("first error = %v, want one queue retry", firstErr)
	}
	if knowledge.ParseStatus != types.ParseStatusProcessing || knowledge.ErrorMessage != VideoRetryingPublicMessage {
		t.Fatalf("first state = %s / %q", knowledge.ParseStatus, knowledge.ErrorMessage)
	}

	_, secondErr := svc.convertVideo(
		types.WithTaskRetryMetadata(context.Background(), 1, 3),
		payload,
		kb,
		knowledge,
		types.EffectiveProcessConfig{},
		false,
	)
	if !errors.Is(secondErr, asynq.SkipRetry) {
		t.Fatalf("second error = %v, want SkipRetry", secondErr)
	}
	if knowledge.ParseStatus != types.ParseStatusFailed || knowledge.ErrorMessage != VideoParseFailedPublicMessage {
		t.Fatalf("second state = %s / %q", knowledge.ParseStatus, knowledge.ErrorMessage)
	}
	if model.urlCalls != 2 || fileSvc.getURLCalls != 2 || fileSvc.getFileCalls != 0 {
		t.Fatalf(
			"retry did not reuse URL source: url=%d sign=%d read=%d",
			model.urlCalls,
			fileSvc.getURLCalls,
			fileSvc.getFileCalls,
		)
	}
}

func TestConvertVideoDoesNotRetryPermanentFailure(t *testing.T) {
	model := &videoIngestionVLM{urlErr: errors.New("permanent request validation failure")}
	fileSvc := &videoIngestionFileServiceStub{url: "https://objects.example.test/source.mp4"}
	svc, _, _ := newVideoIngestionService(model, fileSvc)
	payload, kb, knowledge := videoIngestionFixture(1024)

	_, err := svc.convertVideo(
		types.WithTaskRetryMetadata(context.Background(), 0, 3),
		payload,
		kb,
		knowledge,
		types.EffectiveProcessConfig{},
		false,
	)
	if !errors.Is(err, asynq.SkipRetry) {
		t.Fatalf("error = %v, want SkipRetry on the first permanent failure", err)
	}
	if knowledge.ParseStatus != types.ParseStatusFailed || knowledge.ErrorMessage != VideoParseFailedPublicMessage {
		t.Fatalf("terminal state = %s / %q", knowledge.ParseStatus, knowledge.ErrorMessage)
	}
	if model.urlCalls != 1 || fileSvc.getURLCalls != 1 || fileSvc.getFileCalls != 0 {
		t.Fatalf(
			"permanent failure calls: url=%d sign=%d read=%d",
			model.urlCalls,
			fileSvc.getURLCalls,
			fileSvc.getFileCalls,
		)
	}
}

func TestFixedVideoModelAllowsSingleServerOverride(t *testing.T) {
	t.Setenv("MUSUW_VIDEO_VLM_MODEL_ID", "rollback-video-model")
	if got := fixedVideoModelID(); got != "rollback-video-model" {
		t.Fatalf("fixedVideoModelID = %q", got)
	}
}

func TestFixedVideoModelDefaultsToQwenURLModel(t *testing.T) {
	t.Setenv("MUSUW_VIDEO_VLM_MODEL_ID", "")
	if got := fixedVideoModelID(); got != "builtin-openrouter-vlm-qwen-3-7-flash" {
		t.Fatalf("fixedVideoModelID = %q, want Qwen 3.7 Flash", got)
	}
}

func TestValidateMaterializedSocialSourceRejectsUnreadableCheckpoint(t *testing.T) {
	fileSvc := &videoIngestionFileServiceStub{getFileErr: errors.New("object missing")}
	svc := &knowledgeService{fileSvc: fileSvc}
	err := svc.validateMaterializedSocialSource(context.Background(), &types.KnowledgeBase{}, &types.Knowledge{
		FilePath: "storage://videos/source.mp4",
		FileType: "mp4",
		FileSize: 1024,
	})
	if err == nil || !strings.Contains(err.Error(), "object missing") {
		t.Fatalf("error = %v, want unreadable checkpoint", err)
	}
}

func TestValidateMaterializedSocialSourceAcceptsReadableCheckpoint(t *testing.T) {
	fileSvc := &videoIngestionFileServiceStub{bytes: []byte("video")}
	svc := &knowledgeService{fileSvc: fileSvc}
	err := svc.validateMaterializedSocialSource(context.Background(), &types.KnowledgeBase{}, &types.Knowledge{
		FilePath: "storage://videos/source.mp4",
		FileType: "mp4",
		FileSize: int64(len(fileSvc.bytes)),
	})
	if err != nil {
		t.Fatalf("validateMaterializedSocialSource: %v", err)
	}
	if fileSvc.getFileCalls != 1 {
		t.Fatalf("GetFile calls = %d, want 1", fileSvc.getFileCalls)
	}
}
