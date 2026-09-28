package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

func TestParseSocialShareInputRoutesSupportedWorks(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		platform string
		objectID string
		url      string
	}{
		{
			name:     "douyin URL embedded in Chinese share text",
			input:    "复制打开抖音，看看【示例】 https://v.douyin.com/AbCdEf12/ 复制此链接",
			platform: "douyin",
			url:      "https://v.douyin.com/AbCdEf12",
		},
		{
			name:     "tiktok video",
			input:    "https://www.tiktok.com/@creator/video/1234567890123456789?lang=en#comments",
			platform: "tiktok",
			objectID: "1234567890123456789",
			url:      "https://www.tiktok.com/@creator/video/1234567890123456789",
		},
		{
			name:     "youtube watch keeps only the video ID query",
			input:    "看这个：https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=provider-token",
			platform: "youtube",
			objectID: "dQw4w9WgXcQ",
			url:      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
		},
		{
			name:     "youtube shorts",
			input:    "https://youtube.com/shorts/aqz-KE-bpKQ/",
			platform: "youtube",
			objectID: "aqz-KE-bpKQ",
			url:      "https://youtube.com/shorts/aqz-KE-bpKQ",
		},
		{
			name:     "xiaohongshu note",
			input:    "https://www.xiaohongshu.com/explore/64f123456789abcdef123456?xsec_token=secret",
			platform: "xiaohongshu",
			objectID: "64f123456789abcdef123456",
			url:      "https://www.xiaohongshu.com/explore/64f123456789abcdef123456",
		},
		{
			name:     "xiaohongshu discovery item",
			input:    "https://www.xiaohongshu.com/discovery/item/64f123456789abcdef123456",
			platform: "xiaohongshu",
			objectID: "64f123456789abcdef123456",
			url:      "https://www.xiaohongshu.com/discovery/item/64f123456789abcdef123456",
		},
		{
			name:     "xiaohongshu official short link uses share_text",
			input:    "复制链接：https://xhslink.cn/a/AbCdEf12/",
			platform: "xiaohongshu",
			url:      "https://xhslink.cn/a/AbCdEf12",
		},
		{
			name:     "xiaohongshu mobile short link uses share_text",
			input:    "https://xhslink.com/m/AbCdEf12",
			platform: "xiaohongshu",
			url:      "https://xhslink.com/m/AbCdEf12",
		},
		{
			name:     "xiaohongshu current short link uses share_text",
			input:    "https://xhslink.com/n/AbCdEf12",
			platform: "xiaohongshu",
			url:      "https://xhslink.com/n/AbCdEf12",
		},
		{
			name:     "instagram reel",
			input:    "https://www.instagram.com/reel/C0ffee_1234/?igsh=secret",
			platform: "instagram",
			objectID: "C0ffee_1234",
			url:      "https://www.instagram.com/reel/C0ffee_1234",
		},
		{
			name:     "x status",
			input:    "https://x.com/example/status/1234567890123456789?s=20",
			platform: "x",
			objectID: "1234567890123456789",
			url:      "https://x.com/example/status/1234567890123456789",
		},
		{
			name:     "x id-only status",
			input:    "https://x.com/i/status/1234567890123456789",
			platform: "x",
			objectID: "1234567890123456789",
			url:      "https://x.com/i/status/1234567890123456789",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			route, cleanedURL, err := ParseSocialShareInput(tc.input)
			require.NoError(t, err)
			require.NotNil(t, route)
			require.Equal(t, tc.platform, string(route.Platform))
			require.Equal(t, tc.objectID, route.ObjectID)
			require.Equal(t, tc.url, route.InputURL)
			require.Equal(t, tc.url, cleanedURL)
			require.NotContains(t, route.InputURL, "secret")
			require.NotContains(t, route.InputURL, "provider-token")
		})
	}
}

func TestParseSocialShareInputCleansZeroWidthAndTrailingPunctuation(t *testing.T) {
	t.Parallel()

	route, cleanedURL, err := ParseSocialShareInput("复制：https://www\u200b.tiktok.com/@creator/video/1234567890123456789。")
	require.NoError(t, err)
	require.NotNil(t, route)
	require.Equal(t, "https://www.tiktok.com/@creator/video/1234567890123456789", cleanedURL)
	require.Equal(t, cleanedURL, route.InputURL)

	route, cleanedURL, err = ParseSocialShareInput("打开链接https://v.douyin.com/AbCdEf12/复制此文本")
	require.NoError(t, err)
	require.NotNil(t, route)
	require.Equal(t, "https://v.douyin.com/AbCdEf12", cleanedURL)
}

func TestParseSocialShareInputAllowsMarkdownDuplicateWithEscapedUnderscore(t *testing.T) {
	t.Parallel()

	input := `9.28 复制打开抖音，看看【小白debug的作品】 [https://v.douyin.com/BBJQVsKr\_-w/](https://v.douyin.com/BBJQVsKr_-w/) RXz:/`
	route, cleanedURL, err := ParseSocialShareInput(input)
	require.NoError(t, err)
	require.NotNil(t, route)
	require.Equal(t, "douyin", string(route.Platform))
	require.Equal(t, "https://v.douyin.com/BBJQVsKr_-w", cleanedURL)
}

func TestParseSocialShareInputUsesMarkdownDestinationWhenLabelIsPlainText(t *testing.T) {
	t.Parallel()

	route, cleanedURL, err := ParseSocialShareInput(`[查看作品](https://v.douyin.com/BBJQVsKr_-w/)`)
	require.NoError(t, err)
	require.NotNil(t, route)
	require.Equal(t, "douyin", string(route.Platform))
	require.Equal(t, "https://v.douyin.com/BBJQVsKr_-w", cleanedURL)
}

func TestParseSocialShareInputRejectsDistinctMarkdownDestinations(t *testing.T) {
	t.Parallel()

	_, _, err := ParseSocialShareInput(`[作品一](https://example.com/one) [作品二](https://example.com/two)`)
	require.Error(t, err)
	require.ErrorIs(t, err, ErrMultipleHTTPURLs)
}

func TestParseSocialShareInputRejectsNoOrMultipleURLs(t *testing.T) {
	t.Parallel()

	_, _, err := ParseSocialShareInput("请打开这篇分享，但这里没有链接")
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrNoHTTPURL), "unexpected error: %v", err)

	first := "https://example.com/a"
	second := "https://example.com/b"
	_, _, err = ParseSocialShareInput("两个链接：" + first + " 和 " + second)
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrMultipleHTTPURLs), "unexpected error: %v", err)
	require.NotContains(t, err.Error(), first)
	require.NotContains(t, err.Error(), second)
}

func TestParseSocialShareInputRejectsOversizedInput(t *testing.T) {
	t.Parallel()

	_, _, err := ParseSocialShareInput(strings.Repeat("a", 4097))
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrSocialInputTooLong), "unexpected error: %v", err)
}

func TestParseSocialShareInputUnknownHostFallsBackToGenericURL(t *testing.T) {
	t.Parallel()

	route, cleanedURL, err := ParseSocialShareInput("普通网页：https://example.com/article?id=42#section")
	require.NoError(t, err)
	require.Nil(t, route)
	require.Equal(t, "https://example.com/article?id=42", cleanedURL)
}

func TestURLForLogOmitsCredentialQueryAndFragment(t *testing.T) {
	t.Parallel()

	redacted := urlForLog("https://Example.com/path/to/file.pdf?signature=secret-token&expires=123#fragment")
	require.Equal(t, "example.com/path/to/file.pdf", redacted)
	require.NotContains(t, redacted, "secret-token")
	require.NotContains(t, redacted, "expires")
}

func TestExtractSingleHTTPURLDoesNotClassifyHost(t *testing.T) {
	t.Parallel()

	cleanedURL, err := ExtractSingleHTTPURL("普通分享：https://www.youtube.com/channel/UC1234567890。")
	require.NoError(t, err)
	require.Equal(t, "https://www.youtube.com/channel/UC1234567890", cleanedURL)
}

type socialURLTaskCapture struct {
	task    *asynq.Task
	options []asynq.Option
}

type concurrentSocialClaimRepo struct {
	interfaces.KnowledgeRepository
	mu     sync.Mutex
	winner *types.Knowledge
	claims int
}

func (r *concurrentSocialClaimRepo) CheckKnowledgeExists(
	context.Context,
	uint64,
	string,
	*types.KnowledgeCheckParams,
) (bool, *types.Knowledge, error) {
	return false, nil, nil
}

func (r *concurrentSocialClaimRepo) CreateURLKnowledgeIfAbsent(
	_ context.Context,
	knowledge *types.Knowledge,
	_ *types.KnowledgeCheckParams,
) (*types.Knowledge, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.claims++
	if r.winner != nil {
		winnerCopy := *r.winner
		return &winnerCopy, false, nil
	}
	winnerCopy := *knowledge
	r.winner = &winnerCopy
	return knowledge, true, nil
}

func (r *concurrentSocialClaimRepo) UpdateKnowledge(context.Context, *types.Knowledge) error {
	return nil
}

func (r *concurrentSocialClaimRepo) GetKnowledgeTags(
	context.Context,
	[]string,
) (map[string][]*types.KnowledgeTag, error) {
	return map[string][]*types.KnowledgeTag{}, nil
}

type socialURLCountingTask struct {
	enqueues atomic.Int32
}

func (c *socialURLCountingTask) Enqueue(*asynq.Task, ...asynq.Option) (*asynq.TaskInfo, error) {
	c.enqueues.Add(1)
	return &asynq.TaskInfo{ID: "social-task", Queue: types.QueueDefault}, nil
}

func (c *socialURLTaskCapture) Enqueue(task *asynq.Task, options ...asynq.Option) (*asynq.TaskInfo, error) {
	c.task = task
	c.options = options
	return &asynq.TaskInfo{ID: "social-task", Queue: types.QueueDefault}, nil
}

func TestCreateKnowledgeFromURLNormalizesShareTextAndUsesNormalDocumentRetries(t *testing.T) {
	repo := &createKnowledgeFileRepoStub{}
	task := &socialURLTaskCapture{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      task,
	}

	knowledge, err := svc.CreateKnowledgeFromURL(
		newCreateKnowledgeFileContext(),
		"kb-1",
		"复制打开抖音：https://v.douyin.com/AbCdEf12/复制此文本",
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
	require.Equal(t, "https://v.douyin.com/AbCdEf12", knowledge.Source)
	require.NotNil(t, task.task)
	require.NotContains(t, string(task.task.Payload()), "复制打开抖音")
	var payload types.DocumentProcessPayload
	require.NoError(t, json.Unmarshal(task.task.Payload(), &payload))
	require.Equal(t, knowledge.Source, payload.URL)
	_, _, maxRetry := parseDocumentProcessOpts(t, task.options)
	require.NotNil(t, maxRetry)
	require.Equal(t, 3, *maxRetry)
}

func TestConcurrentSocialURLSubmissionsEnqueueProviderWorkOnce(t *testing.T) {
	repo := &concurrentSocialClaimRepo{}
	task := &socialURLCountingTask{}
	svc := &knowledgeService{
		repo:      repo,
		kbService: &createKnowledgeFileKBServiceStub{kb: &types.KnowledgeBase{ID: "kb-1"}},
		fileSvc:   &createKnowledgeFileServiceStub{},
		task:      task,
	}

	type result struct {
		knowledge *types.Knowledge
		err       error
	}
	results := make(chan result, 2)
	for range 2 {
		go func() {
			knowledge, err := svc.CreateKnowledgeFromURL(
				newCreateKnowledgeFileContext(),
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
			results <- result{knowledge: knowledge, err: err}
		}()
	}
	first := <-results
	second := <-results
	require.NotNil(t, first.knowledge)
	require.NotNil(t, second.knowledge)
	require.Equal(t, first.knowledge.ID, second.knowledge.ID)
	require.Equal(t, int32(1), task.enqueues.Load(), "only the database claim winner may call the provider worker")
	require.Equal(t, 2, repo.claims)
	require.True(t, (first.err == nil) != (second.err == nil), "one request succeeds and one reports the duplicate")
}

func TestReparseMaterializableSocialURLKeepsDownstreamRetryBudget(t *testing.T) {
	task := &socialURLTaskCapture{}
	knowledge := &types.Knowledge{
		ID:              "knowledge-social-reparse",
		TenantID:        7,
		KnowledgeBaseID: "kb-1",
		Type:            "url",
		Source:          "https://v.douyin.com/AbCdEf12",
		ParseStatus:     types.ManualKnowledgeStatusDraft,
	}
	svc := &knowledgeService{
		repo:      &reparseFailureKnowledgeRepo{knowledge: knowledge},
		kbService: &reparseFailureKBService{kb: &types.KnowledgeBase{ID: "kb-1"}},
		task:      task,
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))

	got, err := svc.ReparseKnowledge(ctx, knowledge.ID, nil)
	require.NoError(t, err)
	require.Same(t, knowledge, got)
	require.NotNil(t, task.task)
	_, _, maxRetry := parseDocumentProcessOpts(t, task.options)
	require.NotNil(t, maxRetry)
	require.Equal(t, 3, *maxRetry,
		"the source may retry once and later video-model failures must reuse the stored artifact")
}

func TestParseSocialShareInputKnownHostBadPathFailsClosed(t *testing.T) {
	t.Parallel()

	badURLs := []string{
		"https://www.youtube.com/channel/UC1234567890",
		"https://www.instagram.com/explore/",
		"https://x.com/example/likes/1234567890123456789",
		"https://www.tiktok.com/@creator",
		"https://www.xiaohongshu.com/user/profile/64f123456789abcdef123456",
		"https://www.xiaohongshu.com/discovery/item/not-a-note-id",
		"https://xhslink.cn/profile/AbCdEf12",
		"https://www.douyin.com/user/MS4wLjABAAAA",
	}
	for _, rawURL := range badURLs {
		rawURL := rawURL
		t.Run(rawURL, func(t *testing.T) {
			_, _, err := ParseSocialShareInput(rawURL)
			require.Error(t, err)
			require.True(t, errors.Is(err, ErrUnsupportedSocialURL), "unexpected error: %v", err)
			require.NotContains(t, err.Error(), rawURL)
		})
	}
}

func TestParseSocialShareInputUsesExactHostBoundaries(t *testing.T) {
	t.Parallel()

	route, cleanedURL, err := ParseSocialShareInput("https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ")
	require.NoError(t, err)
	require.Nil(t, route)
	require.Equal(t, "https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ", cleanedURL)
}

func TestSocialURLDedupeSourceUsesStableWorkID(t *testing.T) {
	t.Parallel()

	first, firstURL, err := ParseSocialShareInput("https://x.com/old-name/status/1234567890123456789")
	require.NoError(t, err)
	second, secondURL, err := ParseSocialShareInput("https://twitter.com/new-name/status/1234567890123456789")
	require.NoError(t, err)
	require.NotEqual(t, firstURL, secondURL)
	require.Equal(t, socialURLDedupeSource(first, firstURL), socialURLDedupeSource(second, secondURL))

	generic := "https://example.com/article"
	require.Equal(t, generic, socialURLDedupeSource(nil, generic))
}
