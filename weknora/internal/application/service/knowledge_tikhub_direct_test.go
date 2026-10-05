package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/infrastructure/tikhub"
	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/models/vlm"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

const directDouyinTestURL = "https://www.douyin.com/aweme/v1/play/dash/?video_id=one-work&signature=private-source-token"

func directDouyinTestService(t *testing.T, size int64, model vlm.VLM) (*knowledgeService, *tikHubWorkerRepoStub, *tikHubWorkerFileServiceStub, *youtubeDirectModelServiceStub, *int, *int) {
	t.Helper()
	apiCalls, downloads := new(int), new(int)
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*apiCalls++
		require.Equal(t, "/api/v1/douyin/web/fetch_one_video_by_share_url", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]any{"aweme_detail": map[string]any{
			"desc": "provider caption", "video": map[string]any{"bit_rate": []any{map[string]any{
				"gear_name": "normal_540_0", "codec_type": "h264", "bit_rate": 500000,
				"width": 960, "height": 540,
				"play_addr": map[string]any{"url_key": "h264", "data_size": size, "width": 960, "height": 540,
					"url_list": []string{"https://cdn.example/one-work.mp4", directDouyinTestURL}},
			}}},
		}}})
		require.NoError(t, err)
	}))
	t.Cleanup(api.Close)
	files := &tikHubWorkerFileServiceStub{}
	repo := &tikHubWorkerRepoStub{}
	models := &youtubeDirectModelServiceStub{model: model}
	svc := &knowledgeService{
		repo: repo, fileSvc: files, modelService: models,
		tikhubImporter: tikhub.NewTikHubImporterForTest(api.URL, "metadata-key", api.Client()),
		tikhubMediaClient: &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
			*downloads++
			require.Empty(t, req.Header.Get("Authorization"))
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"video/mp4"}},
				Body: io.NopCloser(bytes.NewBufferString("source-bytes")), ContentLength: 12, Request: req}, nil
		})},
	}
	return svc, repo, files, models, apiCalls, downloads
}

func directDouyinTestKnowledge() (*types.DocumentProcessPayload, *types.Knowledge) {
	const share = "https://v.douyin.com/same-work/"
	return &types.DocumentProcessPayload{TenantID: 17, URL: share},
		&types.Knowledge{ID: "douyin-direct", TenantID: 17, Type: "url", Source: share, Title: share, FileType: "html"}
}

func TestPrepareDouyinDirectPersistsMarkdownAndReusesCheckpoint(t *testing.T) {
	withSSRFWhitelist(t, "www.douyin.com")
	t.Setenv("MUSUW_VIDEO_VLM_MODEL_ID", "configured-fixed-video")
	model := &youtubeDirectVLMStub{result: "# 视频分析标题\n\n00:00—11:13 完整观点及原声内容。"}
	svc, repo, files, models, apiCalls, downloads := directDouyinTestService(t, 68204514, model)
	payload, knowledge := directDouyinTestKnowledge()
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(17))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{ID: 17,
		SystemPromptConfig: types.SystemPromptConfig{"video.understanding": "工作区视频规则：只保留姓名。"}})
	handled, images, err := svc.prepareTikHubArtifact(ctx, payload, &types.KnowledgeBase{ID: "kb-direct"}, knowledge,
		types.EffectiveProcessConfig{VLMConfig: types.VLMConfig{DescriptionLanguage: "中文", CustomInstructions: "只写姓名，其他内容不要写"}})
	require.NoError(t, err)
	require.True(t, handled)
	require.Empty(t, images)
	require.Equal(t, 1, *apiCalls)
	require.Zero(t, *downloads)
	require.Equal(t, 1, model.calls)
	require.Equal(t, "configured-fixed-video", models.requestedID)
	require.Equal(t, directDouyinTestURL, model.url)
	require.Equal(t, "video/mp4", model.mimeType)
	require.Contains(t, model.prompt, "工作区视频规则：只保留姓名。")
	require.Contains(t, model.prompt, "<output_language>中文</output_language>")
	require.Contains(t, model.prompt, "按其范围生成，不强制添加范围外的内容")
	require.Greater(t, strings.Index(model.prompt, "只写姓名，其他内容不要写"), strings.Index(model.prompt, "<source_video_requirements>"))
	require.True(t, strings.HasPrefix(string(files.savedData), model.result))
	require.Contains(t, string(files.savedData), "## 作品原文（来自发布页面）\n\n> provider caption")
	require.NotContains(t, model.prompt, "provider caption", "caption is source evidence, not model instructions")
	require.False(t, files.savedTemp)
	require.Equal(t, 1, files.saveCalls)
	require.Zero(t, files.saveReaderCalls)
	require.Equal(t, 1, repo.claimCalls)
	require.Equal(t, int64(len(files.savedData)), knowledge.FileSize)
	require.Equal(t, "视频分析标题", knowledge.Title)
	require.Equal(t, "md", knowledge.FileType)
	require.Equal(t, "md", payload.FileType)
	require.Empty(t, payload.URL)
	require.True(t, strings.HasSuffix(payload.FilePath, ".md"))
	require.Equal(t, "https://v.douyin.com/same-work/", knowledge.Source)
	retry := &types.DocumentProcessPayload{TenantID: 17, URL: knowledge.Source}
	require.True(t, resumeMaterializedTikHubArtifact(retry, knowledge))
	require.Empty(t, retry.URL)
	require.Equal(t, payload.FilePath, retry.FilePath)
	require.Equal(t, "md", retry.FileType)
	require.Equal(t, 1, *apiCalls)
	require.Equal(t, 1, model.calls)
}

func TestPrepareDouyinDirectRejectsKnownOversizeBeforeModelOrDownload(t *testing.T) {
	model := &youtubeDirectVLMStub{result: "# not used"}
	svc, repo, files, _, _, downloads := directDouyinTestService(t, 101, model)
	payload, knowledge := directDouyinTestKnowledge()
	_, _, err := svc.prepareTikHubArtifactWithVideoLimit(context.Background(), payload, &types.KnowledgeBase{}, knowledge, types.EffectiveProcessConfig{}, 100)
	require.ErrorIs(t, err, errSocialVideoTooLarge)
	require.False(t, socialImportShouldRetry(err, 0))
	require.Zero(t, model.calls)
	require.Zero(t, *downloads)
	require.Zero(t, files.saveCalls)
	require.Zero(t, repo.claimCalls)
}

func TestPrepareDouyinUnknownSizeRetainsBoundedArchivePath(t *testing.T) {
	model := &youtubeDirectVLMStub{result: "# not used"}
	svc, _, files, _, _, downloads := directDouyinTestService(t, 0, model)
	payload, knowledge := directDouyinTestKnowledge()
	_, _, err := svc.prepareTikHubArtifact(context.Background(), payload, &types.KnowledgeBase{}, knowledge, types.EffectiveProcessConfig{})
	require.NoError(t, err)
	require.Zero(t, model.calls)
	require.Equal(t, 1, *downloads)
	require.Equal(t, 1, files.saveReaderCalls)
	require.Equal(t, "mp4", payload.FileType)
}

func TestPrepareDouyinDirectFailedClaimDeletesOnlyNewMarkdown(t *testing.T) {
	withSSRFWhitelist(t, "www.douyin.com")
	model := &youtubeDirectVLMStub{result: "# saved analysis"}
	svc, repo, files, _, _, downloads := directDouyinTestService(t, 68204514, model)
	repo.claimErr = errors.New("storage quota exceeded")
	payload, knowledge := directDouyinTestKnowledge()
	_, _, err := svc.prepareTikHubArtifact(context.Background(), payload, &types.KnowledgeBase{}, knowledge, types.EffectiveProcessConfig{})
	require.ErrorContains(t, err, "failed to persist social artifact state")
	require.Equal(t, 1, files.deleteCalls)
	require.Equal(t, "stored/"+files.savedFileName, files.deletedPath)
	require.Zero(t, *downloads)
	require.Empty(t, knowledge.FilePath)
	require.NotEmpty(t, payload.URL)
}

func TestDouyinDirectModelErrorsUseNativeRetryWithoutDownloadFallback(t *testing.T) {
	withSSRFWhitelist(t, "127.0.0.1,www.douyin.com")
	for _, tc := range []struct {
		name   string
		status int
		body   string
		retry  bool
	}{
		{"auth", 401, `{"error":{"message":"bad key"}}`, false},
		{"access", 403, `{"error":{"message":"access denied"}}`, false},
		{"credit", 402, `{"error":{"message":"insufficient credits"}}`, false},
		{"expired source", 400, `{"error":{"message":"expired source https://www.douyin.com/aweme/v1/play/dash/?signature=private-source-token"}}`, false},
		{"rate limit", 429, `{"error":{"message":"rate limited"}}`, true},
		{"upstream", 503, `{"error":{"message":"temporarily unavailable"}}`, true},
		{"empty success", 200, `{"choices":[{"finish_reason":"stop","message":{"content":""}}]}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			modelCalls := 0
			modelAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				modelCalls++
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer modelAPI.Close()
			model, err := vlm.NewRemoteAPIVLM(&vlm.Config{BaseURL: modelAPI.URL + "/v1", APIKey: "local-test-key", ModelName: "qwen/qwen3.8-flash", Provider: string(provider.ProviderOpenRouter), Extra: map[string]any{"video_input_mode": "url", "video_provider": "alibaba"}})
			require.NoError(t, err)
			svc, repo, files, _, _, downloads := directDouyinTestService(t, 68204514, model)
			payload, knowledge := directDouyinTestKnowledge()
			_, _, err = svc.prepareTikHubArtifact(context.Background(), payload, &types.KnowledgeBase{}, knowledge, types.EffectiveProcessConfig{})
			require.Error(t, err)
			require.NotContains(t, err.Error(), "private-source-token")
			require.NotContains(t, err.Error(), directDouyinTestURL)
			require.Equal(t, 1, modelCalls, "no inner paid model retry")
			require.Equal(t, tc.retry, socialImportShouldRetry(err, 0))
			require.False(t, socialImportShouldRetry(err, 1))
			require.Zero(t, *downloads)
			require.Zero(t, files.saveCalls)
			require.Zero(t, repo.claimCalls)
		})
	}
}

func TestDouyinDirectCancelledContextDoesNotCallModel(t *testing.T) {
	model := &youtubeDirectVLMStub{result: "# not used"}
	svc := &knowledgeService{modelService: &youtubeDirectModelServiceStub{model: model}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, direct, err := svc.analyzeDouyinVideoURL(ctx, tikhub.Result{MediaURL: directDouyinTestURL}, types.VLMConfig{})
	require.True(t, direct)
	require.ErrorIs(t, err, context.Canceled)
	require.False(t, socialImportShouldRetry(err, 0))
	require.Zero(t, model.calls)
}

func TestDouyinDirectKeepsArchiveWhenNoOfficialAddressOrURLCapability(t *testing.T) {
	withSSRFWhitelist(t, "www.douyin.com")
	imageOnly := &struct{ vlm.VLM }{VLM: &youtubeDirectVLMStub{}}
	svc := &knowledgeService{modelService: &youtubeDirectModelServiceStub{model: imageOnly}}
	for _, candidate := range []string{"https://cdn.example/video.mp4", directDouyinTestURL} {
		markdown, direct, err := svc.analyzeDouyinVideoURL(context.Background(), tikhub.Result{MediaURL: candidate}, types.VLMConfig{})
		require.NoError(t, err)
		require.False(t, direct)
		require.Empty(t, markdown)
	}
}
