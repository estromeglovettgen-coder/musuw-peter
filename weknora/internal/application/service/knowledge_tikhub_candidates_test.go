package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/infrastructure/tikhub"
	"github.com/stretchr/testify/require"
)

func TestTikHubMediaUsesAvailableAddressOfSelectedRendition(t *testing.T) {
	var visited []string
	client := &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		visited = append(visited, req.URL.Host)
		status, content := http.StatusForbidden, "forbidden"
		if req.URL.Host == "play.example" {
			status, content = http.StatusOK, "complete-video"
		}
		return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": []string{"video/mp4"}}, Body: io.NopCloser(strings.NewReader(content)), Request: req}, nil
	})}
	result := tikhub.Result{MediaURL: "https://cdn.example/video.mp4", MediaURLs: []string{"https://cdn.example/video.mp4", "https://play.example/video.mp4", "https://unused.example/video.mp4"}}
	stream, err := downloadTikHubResultMedia(context.Background(), result, client, 100)
	require.NoError(t, err)
	defer stream.Close()
	content, err := io.ReadAll(stream)
	require.NoError(t, err)
	require.Equal(t, "complete-video", string(content))
	require.Equal(t, []string{"cdn.example", "play.example"}, visited)
}

func TestTikHubMediaDoesNotSwitchAddressOnInvalidSource(t *testing.T) {
	for _, tc := range []struct {
		name          string
		status        int
		contentType   string
		contentLength int64
	}{
		{"rate_limit", http.StatusTooManyRequests, "video/mp4", 1},
		{"unsupported_content", http.StatusOK, "text/html", 1},
		{"size_limit", http.StatusOK, "video/mp4", 101},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			client := &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: tc.status, ContentLength: tc.contentLength, Header: http.Header{"Content-Type": []string{tc.contentType}}, Body: io.NopCloser(strings.NewReader("invalid")), Request: req}, nil
			})}
			stream, err := downloadTikHubResultMedia(context.Background(), tikhub.Result{MediaURL: "https://one.example/video.mp4", MediaURLs: []string{"https://two.example/video.mp4"}}, client, 100)
			require.Nil(t, stream)
			require.Error(t, err)
			require.Equal(t, 1, calls)
		})
	}
}

func TestTikHubMediaAddressAttemptsRemainBounded(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: tikHubWorkerRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: http.StatusNotFound, Body: io.NopCloser(strings.NewReader("missing")), Request: req}, nil
	})}
	_, err := downloadTikHubResultMedia(context.Background(), tikhub.Result{MediaURL: "https://one.example/video.mp4", MediaURLs: []string{"https://two.example/video.mp4", "https://three.example/video.mp4", "https://four.example/video.mp4"}}, client, 100)
	require.Error(t, err)
	require.Equal(t, 3, calls)
}
