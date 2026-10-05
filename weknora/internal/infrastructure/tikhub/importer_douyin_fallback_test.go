package tikhub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"sync/atomic"
	"testing"
)

func TestDouyinWebBadRequestFallsBackOnceToSameShareURL(t *testing.T) {
	t.Parallel()
	const shareURL = "https://v.douyin.com/requested-work/"
	var appCalls, webCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("share_url") != shareURL {
			t.Error("fallback changed the requested work")
		}
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Error("provider authorization missing")
		}
		switch r.URL.Path {
		case douyinWebSharePath:
			webCalls.Add(1)
			w.WriteHeader(http.StatusBadRequest)
		case douyinSharePath:
			appCalls.Add(1)
			if webCalls.Load() != 1 {
				t.Error("Web must be requested first")
			}
			_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_detail":{"aweme_id":"requested-work","desc":"Requested work","video":{"play_addr_h264":{"url_list":["https://cdn.example/a.mp4","https://cdn.example/b.mp4"]}}}}}`)
		default:
			t.Error("unexpected endpoint")
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	result, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{
		Platform: PlatformDouyin, InputURL: shareURL, ObjectID: "requested-work",
	})
	if err != nil {
		t.Fatal(err)
	}
	if appCalls.Load() != 1 || webCalls.Load() != 1 {
		t.Fatalf("request counts app=%d web=%d, want one each", appCalls.Load(), webCalls.Load())
	}
	if result.Title != "Requested work" || result.MediaURL != "https://cdn.example/a.mp4" || !reflect.DeepEqual(result.MediaURLs, []string{"https://cdn.example/a.mp4", "https://cdn.example/b.mp4"}) {
		t.Fatal("fallback did not preserve the requested work and its primary H.264 address")
	}
}

func TestDouyinWebAuthenticationCreditsOrRateLimitDoNotFallback(t *testing.T) {
	t.Parallel()
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusPaymentRequired, http.StatusTooManyRequests} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path != douyinWebSharePath {
					t.Error("must not call App for authorization/credit/rate-limit failures")
				}
				w.WriteHeader(status)
			}))
			defer server.Close()
			_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/work/"})
			var statusErr *HTTPStatusError
			if !errors.As(err, &statusErr) || statusErr.StatusCode != status || calls.Load() != 1 {
				t.Fatal("authorization/credit status was not preserved as a single request failure")
			}
		})
	}
}

func TestDouyinAppBadRequestDoesNotRecurse(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()
	_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/work/"})
	var statusErr *HTTPStatusError
	if !errors.As(err, &statusErr) || statusErr.StatusCode != http.StatusBadRequest || calls.Load() != 2 {
		t.Fatal("App/Web bad requests must stop after one request to each endpoint")
	}
}

func TestDouyinWebMissingContentFallsBackOnce(t *testing.T) {
	t.Parallel()
	for _, data := range []string{"null", "{}", `{"aweme_details":[]}`} {
		t.Run(data, func(t *testing.T) {
			var webCalls, appCalls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Query().Get("share_url") != "https://v.douyin.com/work/" {
					t.Error("fallback changed the requested work")
				}
				switch r.URL.Path {
				case douyinWebSharePath:
					webCalls.Add(1)
					_, _ = io.WriteString(w, `{"code":200,"data":`+data+`}`)
				case douyinSharePath:
					appCalls.Add(1)
					_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_detail":{"video":{"play_addr_h264":{"url_list":["https://cdn.example/full-work.mp4"]}}}}}`)
				default:
					t.Error("unexpected endpoint")
					w.WriteHeader(http.StatusNotFound)
				}
			}))
			defer server.Close()
			result, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/work/"})
			if err != nil || result.Kind != ResultVideo || result.MediaURL != "https://cdn.example/full-work.mp4" || webCalls.Load() != 1 || appCalls.Load() != 1 {
				t.Fatal("missing Web content must use the same work through App once")
			}
		})
	}
}

func TestDouyinWebTransportFailuresDoNotFallbackOrLeakShareURL(t *testing.T) {
	t.Parallel()
	for _, cause := range []error{context.DeadlineExceeded, context.Canceled} {
		t.Run(cause.Error(), func(t *testing.T) {
			calls := 0
			client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
				calls++
				if req.URL.Path != douyinWebSharePath {
					t.Error("must not fall back after transport failure")
				}
				return nil, &url.Error{Op: "Get", URL: req.URL.String(), Err: cause}
			})}
			_, err := NewTikHubImporterForTest("https://api.tikhub.test", "token", client).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/private-share-token/"})
			if !errors.Is(err, cause) || calls != 1 || err.Error() != cause.Error() {
				t.Fatal("transport failure must retain its cause without repeating or exposing the request")
			}
		})
	}
}

func TestDouyinWebResponseErrorsDoNotFallback(t *testing.T) {
	t.Parallel()
	for _, body := range []string{
		`{"code":400,"data":{}}`, `{"code":401,"data":{}}`,
		`{"code":402,"data":{}}`, `{"code":403,"data":{}}`,
		`{"code":429,"data":{}}`, `not-json`,
	} {
		t.Run(body, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path != douyinWebSharePath {
					t.Error("must not fall back after a provider/JSON response error")
				}
				_, _ = io.WriteString(w, body)
			}))
			defer server.Close()
			_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/work/"})
			if err == nil || calls.Load() != 1 {
				t.Fatal("provider/JSON errors must not trigger the HTTP-400/content fallback")
			}
		})
	}
}

func TestDouyinMediaURLsStayWithinSelectedH264Rendition(t *testing.T) {
	t.Parallel()
	playbackURL := "https://www.douyin.com/aweme/v1/play/dash/?video_id=requested-work"
	selected := testVideoRendition("https://cdn.example/selected-1.mp4", "h264_576p", 600000, 1024, 576)
	selected["data_size"] = float64(68204514)
	selected["play_addr"].(map[string]any)["url_list"] = []any{
		"https://cdn.example/selected-1.mp4", "https://cdn.example/selected-2.mp4", playbackURL,
		"https://cdn.example/selected-1.mp4", playbackURL, "ftp://cdn.example/invalid", "https://cdn.example/list.m3u8",
	}
	data := map[string]any{
		"aweme_detail": map[string]any{"desc": "Requested work", "video": map[string]any{
			"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/primary-other-quality.mp4"}},
			"play_addr_265":  map[string]any{"url_list": []any{"https://cdn.example/hevc.mp4"}},
			"bit_rate": []any{selected,
				testVideoRendition("https://cdn.example/high.mp4", "h264_720p", 1200000, 1280, 720),
				testVideoRendition("https://cdn.example/bytevc.mp4", "bytevc2_576p", 100000, 1024, 576),
			},
		}},
		"related": map[string]any{"video": map[string]any{"bit_rate": []any{
			testVideoRendition("https://cdn.example/related.mp4", "h264_576p", 100000, 1024, 576),
		}}},
	}
	result, err := normalizeWork(PlatformDouyin, "requested-work", data, true)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{playbackURL, "https://cdn.example/selected-1.mp4", "https://cdn.example/selected-2.mp4"}
	if result.MediaURL != want[0] || !reflect.DeepEqual(result.MediaURLs, want) || result.MediaSizeBytes != 68204514 {
		t.Fatal("media candidates must retain only equivalent addresses from the selected rendition")
	}
	raw, err := json.Marshal(result)
	var decoded Result
	if err != nil || json.Unmarshal(raw, &decoded) != nil || !reflect.DeepEqual(decoded.MediaURLs, want) || decoded.MediaSizeBytes != result.MediaSizeBytes {
		t.Fatal("media candidate contract did not survive JSON encoding")
	}
	tiktokResult, err := normalizeWork(PlatformTikTok, "requested-work", data, true)
	if err != nil || tiktokResult.MediaURL != "https://cdn.example/selected-1.mp4" || len(tiktokResult.MediaURLs) != 0 {
		t.Fatal("other platform's primary URL and candidate policy must remain unchanged")
	}
}

func TestDouyinPlaybackAddressPriorityUsesOnlyOfficialHTTPSPath(t *testing.T) {
	t.Parallel()
	for _, address := range []string{
		"https://www.douyin.com/aweme/v1/play/?video_id=requested-work",
		"https://www.douyin.com/aweme/v1/play/dash/?video_id=requested-work",
		"http://www.douyin.com/aweme/v1/play/?video_id=requested-work",
		"https://www.douyin.com.evil.example/aweme/v1/play/?video_id=requested-work",
		"https://v26.douyinvod.com/aweme/v1/play/?video_id=requested-work",
		"https://www.douyin.com/aweme/v1/play/other?video_id=requested-work",
		"https://www.douyin.com/aweme/v1/play/dash/other?video_id=requested-work",
		"https://www.douyin.com:443/aweme/v1/play/?video_id=requested-work",
		"https://user@www.douyin.com/aweme/v1/play/?video_id=requested-work",
	} {
		t.Run(address, func(t *testing.T) {
			primary := "https://cdn.example/primary.mp4"
			backup := "https://cdn.example/backup.mp4"
			data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
				"play_addr_h264": map[string]any{"url_list": []any{primary, address, backup}},
			}}}
			result, err := normalizeWork(PlatformDouyin, "requested-work", data, true)
			want := []string{primary, address, backup}
			if address == "https://www.douyin.com/aweme/v1/play/?video_id=requested-work" ||
				address == "https://www.douyin.com/aweme/v1/play/dash/?video_id=requested-work" {
				want = []string{address, primary, backup}
			}
			if err != nil || result.MediaURL != want[0] || !reflect.DeepEqual(result.MediaURLs, want) {
				t.Fatalf("normalizeWork() = %+v, %v; want address order %v", result, err, want)
			}
		})
	}
}

func TestDouyinMediaSizeIsOnlySelectedRenditionMetadata(t *testing.T) {
	t.Parallel()
	for _, size := range []float64{0, -1, 1.5, math.NaN(), math.Inf(1), float64(math.MaxInt64), 123456} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			selected := testVideoRendition("https://cdn.example/selected.mp4", "h264_576p", 600000, 1024, 576)
			selected["play_addr"].(map[string]any)["data_size"] = size
			other := testVideoRendition("https://cdn.example/other.mp4", "h264_720p", 1200000, 1280, 720)
			other["data_size"] = float64(999999)
			data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
				"data_size": float64(888888), "bit_rate": []any{selected, other},
			}}}
			result, err := normalizeWork(PlatformDouyin, "requested-work", data, true)
			want := int64(0)
			if size == 123456 {
				want = 123456
			}
			if err != nil || result.MediaSizeBytes != want {
				t.Fatalf("selected rendition size=%d, error=%v; want %d", result.MediaSizeBytes, err, want)
			}
		})
	}
}
