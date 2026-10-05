package service

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	filesvc "github.com/Tencent/WeKnora/internal/application/service/file"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

func TestSocialMediaHTTPTimeoutConfiguration(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  time.Duration
	}{
		{"", 10 * time.Minute},
		{"bad", 10 * time.Minute},
		{"0", 10 * time.Minute},
		{"-5", 10 * time.Minute},
		{" 1800 ", 30 * time.Minute},
		{"3600", time.Hour},
		{"7200", time.Hour},
		{"9223372036854775807", time.Hour},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("SOCIAL_MEDIA_HTTP_TIMEOUT_SECONDS", tc.value)
			require.Equal(t, tc.want, socialMediaHTTPTimeout())
		})
	}
}

func TestDownloadTikHubMediaPreservesTimeoutWithoutLeakingURL(t *testing.T) {
	const mediaURL = "https://media.example/video.mp4?signature=private-token"
	client := &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, &url.Error{Op: "Get", URL: mediaURL, Err: context.DeadlineExceeded}
	})}
	stream, err := downloadTikHubMedia(context.Background(), mediaURL, client, 1024)
	require.Nil(t, stream)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.NotContains(t, err.Error(), mediaURL)
	require.NotContains(t, err.Error(), "private-token")
	code, message := socialImportPublicState(err)
	require.Equal(t, "VIDEO_SOURCE_FAILED", code)
	require.Equal(t, SocialDownloadTimeoutPublicMessage, message)
	require.True(t, socialImportShouldRetry(err, 0))
	require.False(t, socialImportShouldRetry(err, 1))
}

type socialMediaDeadlineReader struct{}

func (socialMediaDeadlineReader) Read([]byte) (int, error) {
	return 0, context.DeadlineExceeded
}

func TestSocialMediaBodyTimeoutDoesNotKeepTruncatedSource(t *testing.T) {
	client := &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"video/mp4"}},
			Body:       io.NopCloser(io.MultiReader(strings.NewReader("partial"), socialMediaDeadlineReader{})),
			Request:    req,
		}, nil
	})}
	stream, err := downloadTikHubMedia(context.Background(), "https://media.example/video.mp4", client, 1024)
	require.NoError(t, err)
	t.Cleanup(func() { _ = stream.Close() })
	baseDir := t.TempDir()
	storage := filesvc.NewLocalFileService(baseDir, "").(interfaces.StreamingFileService)
	path, err := storage.SaveReader(context.Background(), stream, -1, 1, "video.mp4", "video/mp4", false)
	require.Empty(t, path)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Equal(t, SocialDownloadTimeoutPublicMessage, socialImportPublicMessage(err))
	files, globErr := filepath.Glob(filepath.Join(baseDir, "1", "exports", "*"))
	require.NoError(t, globErr)
	require.Empty(t, files, "the partial source must be removed rather than treated as a complete video")
}
