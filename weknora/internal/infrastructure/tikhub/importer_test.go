package tikhub

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func testVideoRendition(url, gearName string, bitrate, width, height float64) map[string]any {
	return map[string]any{
		"bit_rate":  bitrate,
		"gear_name": gearName,
		"play_addr": map[string]any{
			"width": width, "height": height, "url_list": []any{url},
		},
	}
}

func TestTikHubImporterFetchesTikTokAndDouyinShareURLs(t *testing.T) {
	t.Parallel()

	const token = "test-token"
	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("Authorization = %q, want Bearer token", got)
		}
		if r.Method != http.MethodGet {
			t.Errorf("method = %s, want GET", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/tiktok/app/v3/fetch_one_video_by_share_url":
			if got := r.URL.Query().Get("share_url"); got != "抖音外的 share text https://www.tiktok.com/t/abc" {
				t.Errorf("TikTok share_url = %q", got)
			}
			io.WriteString(w, `{"code":200,"data":{"aweme_details":[{"desc":"TikTok title","video":{"play_addr_h264":{"url_list":["https://cdn.example/tiktok.mp4"]}}}]}}`)
		case "/api/v1/douyin/app/v3/fetch_one_video_by_share_url":
			if got := r.URL.Query().Get("share_url"); got != "https://v.douyin.com/abc/" {
				t.Errorf("Douyin share_url = %q", got)
			}
			_, _ = io.WriteString(
				w,
				`{"code":200,"data":{"aweme_detail":{"desc":"Douyin title",`+
					`"video":{"play_addr_h264":{"url_list":["https://cdn.example/douyin.mp4"]}}}}}`,
			)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	importer := NewTikHubImporterForTest(server.URL, token, server.Client())
	tiktok, err := importer.Fetch(context.Background(), Route{
		Platform: PlatformTikTok,
		InputURL: "抖音外的 share text https://www.tiktok.com/t/abc",
	})
	if err != nil {
		t.Fatalf("TikTok Fetch() error = %v", err)
	}
	if tiktok.Kind != ResultVideo || tiktok.Title != "TikTok title" || tiktok.MediaURL != "https://cdn.example/tiktok.mp4" || tiktok.FileType != "mp4" {
		t.Fatalf("TikTok result = %+v", tiktok)
	}

	douyin, err := importer.Fetch(context.Background(), Route{
		Platform: PlatformDouyin,
		InputURL: "https://v.douyin.com/abc/",
	})
	if err != nil {
		t.Fatalf("Douyin Fetch() error = %v", err)
	}
	if douyin.Kind != ResultVideo || douyin.Title != "Douyin title" || douyin.MediaURL != "https://cdn.example/douyin.mp4" {
		t.Fatalf("Douyin result = %+v", douyin)
	}
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("request count = %d, want 2", got)
	}
}

func TestTikHubImporterFallsBackToDouyinWebWhenAppFiltersTheWork(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/douyin/app/v3/fetch_one_video_by_share_url":
			_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_details":[],"filter_list":[{"aweme_id":"7680316918494022931","reason":8}],"status_code":0}}`)
		case "/api/v1/douyin/web/fetch_one_video_by_share_url":
			_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_detail":{"aweme_id":"7680316918494022931","desc":"Public video","video":{"play_addr_h264":{"url_list":["https://cdn.example/douyin-web.mp4"]}}}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	result, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(
		context.Background(),
		Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/NPPgS-cqjno"},
	)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if result.Kind != ResultVideo || result.Title != "Public video" || result.MediaURL != "https://cdn.example/douyin-web.mp4" {
		t.Fatalf("result = %+v", result)
	}
}

func TestTikHubImporterDoesNotUseDouyinWebForPrivateWork(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/douyin/app/v3/fetch_one_video_by_share_url":
			_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_details":[],"filter_list":[{"aweme_id":"private","reason":5}],"status_code":0}}`)
		case "/api/v1/douyin/web/fetch_one_video_by_share_url":
			_, _ = io.WriteString(w, `{"code":200,"data":{"aweme_detail":{"desc":"must not be fetched","video":{"play_addr_h264":{"url_list":["https://cdn.example/private.mp4"]}}}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(
		context.Background(),
		Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/private"},
	)
	if err == nil {
		t.Fatal("Fetch() error = nil, want private work to remain unavailable")
	}
}

func TestTikHubImporterFetchesYouTubeByVideoID(t *testing.T) {
	t.Parallel()

	const token = "youtube-token"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/youtube/web_v2/get_video_streams_v2" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("video_id"); got != "dQw4w9WgXcQ" {
			t.Errorf("video_id = %q", got)
		}
		if got := r.URL.Query().Get("video_url"); got != "" {
			t.Errorf("video_url = %q, want omitted", got)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"code":200,"data":{"title":"A YouTube title","description":"A description","formats":[{"mime_type":"video/mp4","height":1080,"bitrate":4000000,"url":"https://googlevideo.example/high.mp4"},{"mime_type":"video/mp4","height":144,"bitrate":120000,"url":"https://googlevideo.example/low.mp4"}],"adaptive_formats":[{"mime_type":"video/mp4","height":72,"url":"https://googlevideo.example/adaptive.mp4"}]}}`)
	}))
	defer server.Close()

	result, err := NewTikHubImporterForTest(server.URL, token, server.Client()).Fetch(context.Background(), Route{
		Platform: PlatformYouTube,
		ObjectID: "dQw4w9WgXcQ",
	})
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if result.Kind != ResultVideo || result.Title != "A YouTube title" || result.Description != "A description" || result.MediaURL != "https://googlevideo.example/low.mp4" || result.FileName != "youtube-dQw4w9WgXcQ.mp4" {
		t.Fatalf("result = %+v", result)
	}
}

func TestNormalizeYouTubeDoesNotUseAdaptiveOnlyFormats(t *testing.T) {
	t.Parallel()

	result, err := normalizeWork(PlatformYouTube, "video123456", map[string]any{
		"adaptive_formats": []any{
			map[string]any{"mime_type": "audio/mp4", "url": "https://cdn.example/audio.mp4"},
			map[string]any{"mime_type": "video/mp4", "url": "https://cdn.example/video.mp4"},
		},
	}, false)
	if err == nil {
		t.Fatalf("normalizeWork() = %+v, want adaptive-only response rejected", result)
	}
}

func TestTikHubImporterFetchesXiaohongshuImageAndConditionallyVideo(t *testing.T) {
	t.Parallel()

	const token = "xhs-token"
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if got := r.URL.Query().Get("note_id"); got != "note123" {
			t.Errorf("note_id = %q", got)
		}
		if got := r.URL.Query().Get("share_text"); got != "" {
			t.Errorf("share_text = %q, want omitted when ObjectID is present", got)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/xiaohongshu/app_v2/get_image_note_detail":
			io.WriteString(w, `{"code":200,"data":{"type":"video","title":"XHS video","desc":"caption","image_list":[{"url":"https://img.example/cover.jpg"}]}}`)
		case "/api/v1/xiaohongshu/app_v2/get_video_note_detail":
			_, _ = io.WriteString(
				w,
				`{"code":200,"data":{"data":[{"title":"XHS video","desc":"caption",`+
					`"video_info_v2":{"media":{"stream":{"h264":[`+
					`{"master_url":"https://cdn.example/xhs.mp4","video_codec":"h264"}]}}}}]}}`,
			)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	result, err := NewTikHubImporterForTest(server.URL, token, server.Client()).Fetch(context.Background(), Route{
		Platform: PlatformXiaohongshu,
		ObjectID: "note123",
		InputURL: "https://xhslink.com/o/abc",
	})
	if err != nil {
		t.Fatalf("video Fetch() error = %v", err)
	}
	if result.Kind != ResultVideo || result.Title != "XHS video" || result.Description != "caption" || result.MediaURL != "https://cdn.example/xhs.mp4" {
		t.Fatalf("video result = %+v", result)
	}
	if got, want := strings.Join(paths, ","), "/api/v1/xiaohongshu/app_v2/get_image_note_detail,/api/v1/xiaohongshu/app_v2/get_video_note_detail"; got != want {
		t.Fatalf("paths = %q, want %q", got, want)
	}

	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/xiaohongshu/app_v2/get_image_note_detail" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("share_text"); got != "https://xhslink.com/o/image" {
			t.Errorf("share_text = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"code":200,"data":{"type":"image","title":"XHS image","desc":"image caption","image_list":[{"url":"https://img.example/one.jpg"},{"url":"https://img.example/two.jpg"}]}}`)
	}))
	defer imageServer.Close()
	imageResult, err := NewTikHubImporterForTest(imageServer.URL, token, imageServer.Client()).Fetch(context.Background(), Route{
		Platform: PlatformXiaohongshu,
		InputURL: "https://xhslink.com/o/image",
	})
	if err != nil {
		t.Fatalf("image Fetch() error = %v", err)
	}
	if imageResult.Kind != ResultDocument || imageResult.Title != "XHS image" || len(imageResult.ImageURLs) != 2 || imageResult.ImageURLs[1] != "https://img.example/two.jpg" {
		t.Fatalf("image result = %+v", imageResult)
	}
	if !strings.Contains(imageResult.Markdown, "image caption") {
		t.Fatalf("image markdown lost description: %q", imageResult.Markdown)
	}
	if !strings.Contains(imageResult.Markdown, "![image 1](https://img.example/one.jpg)") {
		t.Fatalf("image markdown = %q", imageResult.Markdown)
	}
}

func TestNormalizeXiaohongshuSelectsTargetH264Stream(t *testing.T) {
	t.Parallel()

	data := map[string]any{"data": []any{
		map[string]any{
			"title": "Requested work",
			"video_info_v2": map[string]any{"media": map[string]any{"stream": map[string]any{
				"h265": []any{map[string]any{
					"master_url":  "https://cdn.example/target-hevc.mp4",
					"video_codec": "hevc",
					"size":        float64(39_084_007),
				}},
				"h264": []any{map[string]any{
					"master_url":  "https://cdn.example/target-h264.mp4",
					"video_codec": "h264",
					"size":        float64(112_301_200),
				}},
			}}},
		},
		map[string]any{
			"title": "Related work",
			"video_info_v2": map[string]any{"media": map[string]any{"stream": map[string]any{
				"h264": []any{map[string]any{
					"master_url":  "https://cdn.example/related-smaller-h264.mp4",
					"video_codec": "h264",
				}},
			}}},
		},
	}}

	for range 50 {
		result, err := normalizeWork(PlatformXiaohongshu, "", data, false)
		if err != nil {
			t.Fatalf("normalizeWork() error = %v", err)
		}
		if result.MediaURL != "https://cdn.example/target-h264.mp4" {
			t.Fatalf("MediaURL = %q, want the requested work's H.264 stream", result.MediaURL)
		}
	}
}

func TestNormalizeXiaohongshuRejectsExplicitHEVCOnlyStream(t *testing.T) {
	t.Parallel()

	data := map[string]any{"data": []any{map[string]any{
		"video_info_v2": map[string]any{"media": map[string]any{"stream": map[string]any{
			"h265": []any{map[string]any{
				"master_url":  "https://cdn.example/target-hevc.mp4",
				"video_codec": "hevc",
			}},
		}}},
	}}}

	if got := videoURL(PlatformXiaohongshu, data); got != "" {
		t.Fatalf("videoURL() = %q, want no HEVC fallback", got)
	}
}

func TestXHSResponseIsVideoScansContradictoryTypeFields(t *testing.T) {
	t.Parallel()

	// The image-first response can expose a normal/image type before a nested
	// video marker. A video marker anywhere in the type fields must win rather
	// than being short-circuited by the first non-video value.
	response := map[string]any{
		"type":      "normal",
		"note_type": "video",
		"media": map[string]any{
			"media_type": "image",
		},
	}
	if !xhsResponseIsVideo(response) {
		t.Fatal("xhsResponseIsVideo() = false, want true when any type field is video")
	}
}

func TestTikHubImporterFetchesInstagramAndX(t *testing.T) {
	t.Parallel()

	const token = "meta-token"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/instagram/v3/get_post_info_by_code":
			if got := r.URL.Query().Get("code"); got != "C0dE" {
				t.Errorf("code = %q", got)
			}
			_, _ = io.WriteString(
				w,
				`{"code":200,"data":{"items":[{"caption":{"text":"Instagram caption"},`+
					`"media_type":2,"video_versions":[{"height":720,`+
					`"url":"https://cdn.example/instagram.mp4"}]}]}}`,
			)
		case "/api/v1/twitter/web/fetch_tweet_detail":
			if got := r.URL.Query().Get("tweet_id"); got != "12345" {
				t.Errorf("tweet_id = %q", got)
			}
			io.WriteString(w, `{"code":200,"data":{"legacy":{"full_text":"Tweet text","extended_entities":{"media":[{"type":"video","video_info":{"variants":[{"content_type":"video/mp4","url":"https://cdn.example/tweet.mp4"}]}}]}}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	importer := NewTikHubImporterForTest(server.URL, token, server.Client())
	instagram, err := importer.Fetch(context.Background(), Route{Platform: PlatformInstagram, ObjectID: "C0dE"})
	if err != nil {
		t.Fatalf("Instagram Fetch() error = %v", err)
	}
	if instagram.Kind != ResultVideo || instagram.Title != "Instagram caption" || instagram.MediaURL != "https://cdn.example/instagram.mp4" {
		t.Fatalf("Instagram result = %+v", instagram)
	}

	tweet, err := importer.Fetch(context.Background(), Route{Platform: PlatformX, ObjectID: "12345"})
	if err != nil {
		t.Fatalf("X Fetch() error = %v", err)
	}
	if tweet.Kind != ResultVideo || tweet.Title != "Tweet text" || tweet.MediaURL != "https://cdn.example/tweet.mp4" {
		t.Fatalf("X result = %+v", tweet)
	}
}

func TestTikHubImporterNormalizesCurrentXiaohongshuImagesList(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/xiaohongshu/app_v2/get_image_note_detail" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"code":200,"data":{"code":0,"success":true,"data":[{"note_list":[{"desc":"A current XHS note","images_list":[{"url":"https://img.example/current.jpg"}]}]}]}}`)
	}))
	defer server.Close()

	result, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{
		Platform: PlatformXiaohongshu,
		InputURL: "https://xhslink.cn/o/current",
	})
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if result.Kind != ResultDocument || result.Title != "A current XHS note" || len(result.ImageURLs) != 1 || result.ImageURLs[0] != "https://img.example/current.jpg" {
		t.Fatalf("result = %+v", result)
	}
}

func TestNormalizeDouyinPhotoChoosesOneURLPerImage(t *testing.T) {
	t.Parallel()

	result, err := normalizeWork(PlatformDouyin, "photo-id", map[string]any{
		"aweme_detail": map[string]any{
			"desc":  "A Douyin photo note",
			"music": map[string]any{"title": "Background music"},
			// Douyin photo notes can also expose a generated video stream.
			// The explicit image list is the reliable content-kind signal.
			"video": map[string]any{"play_addr": map[string]any{"url_list": []any{"https://cdn.example/generated.mp4"}}},
			"images": []any{
				map[string]any{"url_list": []any{"https://img.example/one.jpg", "https://img-backup.example/one.jpg"}},
				map[string]any{"url_list": []any{"https://img.example/two.jpg", "https://img-backup.example/two.jpg"}},
			},
		},
	}, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.Kind != ResultDocument || result.Title != "A Douyin photo note" || len(result.ImageURLs) != 2 || result.ImageURLs[0] != "https://img.example/one.jpg" || result.ImageURLs[1] != "https://img.example/two.jpg" {
		t.Fatalf("result = %+v", result)
	}
}

func TestNormalizeDouyinSelectsLowestH264AtQualityFloor(t *testing.T) {
	t.Parallel()

	lowH264 := testVideoRendition("https://cdn.example/low-h264.mp4", "", 600000, 1024, 576)
	lowH264["play_addr"].(map[string]any)["url_key"] = "video_h264_576p_600000"
	data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
		"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/primary-h264.mp4"}},
		"bit_rate": []any{
			testVideoRendition("https://cdn.example/high-h264.mp4", "h264_720p", 1800000, 1280, 720),
			lowH264,
			testVideoRendition("https://cdn.example/low-bitrate-h264.mp4", "h264_360p", 200000, 640, 360),
			map[string]any{"play_addr": map[string]any{"url_list": []any{"https://cdn.example/unknown.mp4"}}},
			testVideoRendition("https://cdn.example/bytevc2-low.mp4", "bytevc2_576p", 240000, 1024, 576),
		},
	}}}
	for i := 0; i < 50; i++ {
		result, err := normalizeWork(PlatformDouyin, "video-id", data, true)
		if err != nil {
			t.Fatalf("normalizeWork() error = %v", err)
		}
		if result.MediaURL != "https://cdn.example/low-bitrate-h264.mp4" {
			t.Fatalf("MediaURL = %q, want lowest H.264 rendition at or above 360p", result.MediaURL)
		}
	}
}

func TestNormalizeDouyinUsesLowBitrateH264BeforePrimaryAddress(t *testing.T) {
	t.Parallel()

	data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
		"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/primary-h264.mp4"}},
		"bit_rate": []any{
			testVideoRendition("https://cdn.example/small-h264.mp4", "h264_360p", 200000, 640, 360),
			testVideoRendition("https://cdn.example/bytevc2.mp4", "bytevc2_576p", 120000, 1024, 576),
		},
	}}}
	result, err := normalizeWork(PlatformDouyin, "video-id", data, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.MediaURL != "https://cdn.example/small-h264.mp4" {
		t.Fatalf("MediaURL = %q, want the compatible low-bitrate H.264 rendition", result.MediaURL)
	}
}

func TestNormalizeDouyinUsesLowestExplicitH264WhenPrimaryAddressIsMissing(t *testing.T) {
	t.Parallel()

	high := testVideoRendition("https://cdn.example/high.mp4", "", 1800000, 0, 0)
	high["is_h265"] = float64(0)
	low := testVideoRendition("https://cdn.example/low.mp4", "", 240000, 0, 0)
	low["is_h265"] = float64(0)
	data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
		"bit_rate": []any{high, low},
	}}}
	result, err := normalizeWork(PlatformDouyin, "video-id", data, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.MediaURL != "https://cdn.example/low.mp4" {
		t.Fatalf("MediaURL = %q, want lowest explicit H.264 fallback", result.MediaURL)
	}
}

func TestNormalizeTikTokAggregatesH264CandidatesAcrossPluralWorks(t *testing.T) {
	t.Parallel()

	data := map[string]any{"aweme_details": []any{
		map[string]any{"video": map[string]any{"bit_rate": []any{
			testVideoRendition("https://cdn.example/first-high.mp4", "h264_720p", 1800000, 1280, 720),
		}}},
		map[string]any{"video": map[string]any{"bit_rate": []any{
			testVideoRendition("https://cdn.example/second-low.mp4", "h264_576p", 620000, 576, 1024),
		}}},
	}}
	result, err := normalizeWork(PlatformTikTok, "video-id", data, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.MediaURL != "https://cdn.example/second-low.mp4" {
		t.Fatalf("MediaURL = %q, want lowest H.264 across all works", result.MediaURL)
	}
}

func TestNormalizeDouyinUsesShortSideForPortraitAndLandscapeQualityFloor(t *testing.T) {
	t.Parallel()

	data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
		"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/primary-h264.mp4"}},
		"bit_rate": []any{
			testVideoRendition("https://cdn.example/portrait.mp4", "h264_portrait", 650000, 576, 1024),
			testVideoRendition(
				"https://cdn.example/landscape-too-small.mp4", "h264_landscape", 200000, 426, 240,
			),
		},
	}}}
	result, err := normalizeWork(PlatformDouyin, "video-id", data, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.MediaURL != "https://cdn.example/portrait.mp4" {
		t.Fatalf("MediaURL = %q, want portrait rendition whose short side is at least 360", result.MediaURL)
	}
}

func TestNormalizeDouyinRejectsUnknownAndByteVCFallbacks(t *testing.T) {
	t.Parallel()

	data := map[string]any{"aweme_detail": map[string]any{"video": map[string]any{
		"play_addr":     map[string]any{"url_list": []any{"https://cdn.example/unknown-primary.mp4"}},
		"download_addr": map[string]any{"url_list": []any{"https://cdn.example/unknown-download.mp4"}},
		"play_addr_265": map[string]any{"url_list": []any{"https://cdn.example/hevc.mp4"}},
		"bit_rate": []any{
			testVideoRendition("https://cdn.example/bytevc2.mp4", "bytevc2_576p", 120000, 1024, 576),
		},
	}}}
	if got := videoURL(PlatformDouyin, data); got != "" {
		t.Fatalf("videoURL() = %q, want no unverified codec fallback", got)
	}
}

func TestIsH264RenditionRejectsConflictingCodecSignals(t *testing.T) {
	t.Parallel()

	for name, rendition := range map[string]map[string]any{
		"metadata": {"codec": "h264", "gear_name": "bytevc2_576p"},
		"flag":     {"codec": "h264", "is_bytevc2": true},
		"negative": {"codec": "h264", "is_h264": false},
	} {
		t.Run(name, func(t *testing.T) {
			if isH264Rendition(rendition) {
				t.Fatalf("isH264Rendition(%v) = true, want false", rendition)
			}
		})
	}
}

func TestNormalizeTikTokPrefersPrimaryH264InPluralWorkResponse(t *testing.T) {
	t.Parallel()

	data := map[string]any{"aweme_details": []any{map[string]any{"video": map[string]any{
		"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/h264.mp4"}},
		"bit_rate": []any{
			testVideoRendition("https://cdn.example/bytevc2-low.mp4", "", 240000, 1024, 576),
		},
	}}}}
	result, err := normalizeWork(PlatformTikTok, "video-id", data, true)
	if err != nil {
		t.Fatalf("normalizeWork() error = %v", err)
	}
	if result.MediaURL != "https://cdn.example/h264.mp4" {
		t.Fatalf("MediaURL = %q, want primary H.264 address", result.MediaURL)
	}
}

func TestTikHubImporterNormalizesTextOnlyTweetAsDocument(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/twitter/web/fetch_tweet_detail" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("tweet_id"); got != "987654" {
			t.Errorf("tweet_id = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"code":200,"data":{"legacy":{"full_text":"A text-only tweet"}}}`)
	}))
	defer server.Close()

	result, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformX, ObjectID: "987654"})
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if result.Kind != ResultDocument || result.Title != "A text-only tweet" || result.Description != "A text-only tweet" {
		t.Fatalf("result = %+v", result)
	}
	if !strings.Contains(result.Markdown, "A text-only tweet") {
		t.Fatalf("markdown = %q", result.Markdown)
	}
}

func TestNormalizeInstagramTreatsVideoVersionsAsAlternatives(t *testing.T) {
	t.Parallel()

	result, err := normalizeInstagram(map[string]any{
		"caption": "A reel",
		"media": []any{map[string]any{
			"media_type": "VIDEO",
			"video_versions": []any{
				map[string]any{"url": "https://cdn.example/high.mp4", "width": float64(1080), "height": float64(1920)},
				map[string]any{"url": "https://cdn.example/low.mp4", "width": float64(480), "height": float64(854)},
			},
		}},
	})
	if err != nil {
		t.Fatalf("normalizeInstagram() error = %v", err)
	}
	if result.Kind != ResultVideo || result.MediaURL != "https://cdn.example/low.mp4" {
		t.Fatalf("result = %+v, want first playable video alternative", result)
	}
}

func TestNormalizeInstagramUnwrapsV2Data(t *testing.T) {
	t.Parallel()

	result, err := normalizeInstagram(map[string]any{
		"data": map[string]any{
			"accessibility_caption": "A nested photo",
			"image_versions": map[string]any{
				"items": []any{map[string]any{"url": "https://images.example/nested.jpg"}},
			},
		},
	})
	if err != nil {
		t.Fatalf("normalizeInstagram() error = %v", err)
	}
	if result.Kind != ResultDocument || result.Title != "A nested photo" || len(result.ImageURLs) != 1 {
		t.Fatalf("result = %+v, want nested V2 photo document", result)
	}
}

func TestNormalizeXTreatsVariantsAsAlternatives(t *testing.T) {
	t.Parallel()

	result, err := normalizeX(map[string]any{
		"legacy": map[string]any{
			"full_text": "A video tweet",
			"extended_entities": map[string]any{"media": []any{map[string]any{
				"type": "video",
				"video_info": map[string]any{"variants": []any{
					map[string]any{"content_type": "application/x-mpegURL", "url": "https://cdn.example/master.m3u8"},
					map[string]any{"content_type": "video/mp4", "bitrate": float64(2176000), "url": "https://cdn.example/high.mp4"},
					map[string]any{"content_type": "video/mp4", "bitrate": float64(256000), "url": "https://cdn.example/low.mp4"},
				}},
			}}},
		},
	})
	if err != nil {
		t.Fatalf("normalizeX() error = %v", err)
	}
	if result.Kind != ResultVideo || result.MediaURL != "https://cdn.example/low.mp4" {
		t.Fatalf("result = %+v, want first playable MP4 alternative", result)
	}
}

func TestNormalizeXSupportsCardVideoVariants(t *testing.T) {
	t.Parallel()

	result, err := normalizeX(map[string]any{
		"card": map[string]any{
			"text": "A card video tweet",
			"media": map[string]any{"video_variants": []any{
				map[string]any{"content_type": "video/mp4", "url": "https://cdn.example/card.mp4"},
			}},
		},
	})
	if err != nil {
		t.Fatalf("normalizeX() error = %v", err)
	}
	if result.Kind != ResultVideo || result.MediaURL != "https://cdn.example/card.mp4" {
		t.Fatalf("result = %+v, want card video", result)
	}
}

func TestNormalizeInstagramAndXCollectCommonPhotoFields(t *testing.T) {
	t.Parallel()

	instagram, err := normalizeInstagram(map[string]any{
		"items": []any{map[string]any{
			"caption":    map[string]any{"text": "A photo"},
			"media_type": float64(1),
			"image_versions2": map[string]any{"candidates": []any{
				map[string]any{"url": "https://images.example/instagram.jpg"},
			}},
		}},
	})
	if err != nil {
		t.Fatalf("normalizeInstagram() error = %v", err)
	}
	if instagram.Kind != ResultDocument || len(instagram.ImageURLs) != 1 || instagram.ImageURLs[0] != "https://images.example/instagram.jpg" {
		t.Fatalf("Instagram result = %+v", instagram)
	}

	tweet, err := normalizeX(map[string]any{
		"legacy": map[string]any{
			"full_text": "A photo tweet",
			"extended_entities": map[string]any{"media": []any{map[string]any{
				"type":            "photo",
				"media_url_https": "https://pbs.twimg.com/media/photo.jpg",
			}}},
		},
	})
	if err != nil {
		t.Fatalf("normalizeX() error = %v", err)
	}
	if tweet.Kind != ResultDocument || len(tweet.ImageURLs) != 1 || tweet.ImageURLs[0] != "https://pbs.twimg.com/media/photo.jpg" {
		t.Fatalf("X result = %+v", tweet)
	}
}

func TestNormalizeInstagramSupportsV3CarouselImages(t *testing.T) {
	t.Parallel()

	result, err := normalizeInstagram(map[string]any{
		"items": []any{map[string]any{
			"media_type": float64(8),
			"caption":    map[string]any{"text": "A carousel"},
			"carousel_media": []any{
				map[string]any{
					"media_type": float64(1),
					"image_versions2": map[string]any{"candidates": []any{
						map[string]any{"url": "https://images.example/one.jpg"},
					}},
				},
				map[string]any{
					"media_type": float64(1),
					"image_versions2": map[string]any{"candidates": []any{
						map[string]any{"url": "https://images.example/two.jpg"},
					}},
				},
			},
		}},
	})
	if err != nil {
		t.Fatalf("normalizeInstagram() error = %v", err)
	}
	if result.Kind != ResultDocument || len(result.ImageURLs) != 2 {
		t.Fatalf("result = %+v, want two-image document", result)
	}
}

func TestNormalizeTikTokIgnoresCoverAndSupportsPhotoPost(t *testing.T) {
	t.Parallel()

	video, err := normalizeWork(PlatformTikTok, "123", map[string]any{
		"desc": "video",
		"video": map[string]any{
			"cover":          map[string]any{"url_list": []any{"https://images.example/cover.jpg"}},
			"origin_cover":   map[string]any{"url_list": []any{"https://images.example/origin.jpg"}},
			"play_addr_h264": map[string]any{"url_list": []any{"https://cdn.example/work.mp4"}},
		},
	}, true)
	if err != nil {
		t.Fatalf("normalizeWork(video) error = %v", err)
	}
	if video.Kind != ResultVideo || video.MediaURL != "https://cdn.example/work.mp4" {
		t.Fatalf("video result = %+v", video)
	}

	photo, err := normalizeWork(PlatformTikTok, "456", map[string]any{
		"desc": "photo post",
		"images": []any{
			map[string]any{"url_list": []any{"https://images.example/one.jpg"}},
			map[string]any{"url_list": []any{"https://images.example/two.jpg"}},
		},
	}, true)
	if err != nil {
		t.Fatalf("normalizeWork(photo) error = %v", err)
	}
	if photo.Kind != ResultDocument || len(photo.ImageURLs) != 2 {
		t.Fatalf("photo result = %+v", photo)
	}
}

func TestNormalizeDouyinPrefersStandardImageRendition(t *testing.T) {
	t.Parallel()

	vvicURL := "https://p26-sign.douyinpic.com/photo_vvic~tplv-origin.image?x-signature=vvic"
	jpegURL := "https://p3-sign.douyinpic.com/photo~tplv-aweme:q80.jpeg?x-signature=jpeg"
	webpURL := "https://p3-sign.douyinpic.com/photo~tplv-water:q80.webp?x-signature=webp"
	result, err := normalizeDocument(PlatformDouyin, "", map[string]any{
		"aweme_detail": map[string]any{
			"desc": "photo post",
			"images": []any{map[string]any{
				"url":               vvicURL,
				"url_list":          []any{vvicURL, jpegURL},
				"download_url_list": []any{webpURL},
			}},
		},
	}, false)
	if err != nil {
		t.Fatalf("normalizeDocument() error = %v", err)
	}
	if len(result.ImageURLs) != 1 || result.ImageURLs[0] != jpegURL {
		t.Fatalf("image URLs = %#v, want compatible JPEG rendition", result.ImageURLs)
	}
}

func TestFirstImageURLKeepsProviderFallbackWhenNoStandardRenditionExists(t *testing.T) {
	t.Parallel()

	want := "https://images.example/photo"
	if got := firstImageURL(map[string]any{"url_list": []any{want}}); got != want {
		t.Fatalf("firstImageURL() = %q, want fallback %q", got, want)
	}
}

func TestTikHubImporterRejectsMalformedResponsesWithoutRetry(t *testing.T) {
	t.Parallel()

	var calls int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"code":500,"message":"upstream failure","data":null}`)
	}))
	defer server.Close()

	_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformTikTok, InputURL: "https://www.tiktok.com/t/abc"})
	if err == nil || !strings.Contains(err.Error(), "code 500") {
		t.Fatalf("error = %v, want code failure", err)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("request count = %d, want no retry", got)
	}

	statusServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		io.WriteString(w, `{"code":200,"data":{}}`)
	}))
	defer statusServer.Close()
	_, err = NewTikHubImporterForTest(statusServer.URL, "token", statusServer.Client()).Fetch(context.Background(), Route{Platform: PlatformTikTok, InputURL: "https://www.tiktok.com/t/abc"})
	if err == nil || !strings.Contains(err.Error(), "HTTP 502") {
		t.Fatalf("HTTP error = %v", err)
	}

	_, err = NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformYouTube})
	if err == nil || !strings.Contains(err.Error(), "ObjectID") {
		t.Fatalf("missing route field error = %v", err)
	}
}

func TestNewTikHubImporterRequiresAPIKeyAndUsesProductionBase(t *testing.T) {
	old, had := os.LookupEnv("TIKHUB_API_KEY")
	if had {
		defer os.Setenv("TIKHUB_API_KEY", old)
	} else {
		defer os.Unsetenv("TIKHUB_API_KEY")
	}

	os.Unsetenv("TIKHUB_API_KEY")
	if _, err := NewTikHubImporter(); err == nil {
		t.Fatal("NewTikHubImporter() succeeded without TIKHUB_API_KEY")
	}
	os.Setenv("TIKHUB_API_KEY", "production-token")
	importer, err := NewTikHubImporter()
	if err != nil {
		t.Fatalf("NewTikHubImporter() error = %v", err)
	}
	if importer.baseURL != ProductionBaseURL {
		t.Fatalf("baseURL = %q, want %q", importer.baseURL, ProductionBaseURL)
	}
	if importer.apiKey != "production-token" {
		t.Fatalf("apiKey = %q", importer.apiKey)
	}
}

func TestTikHubImporterDoesNotLeakBearerToReturnedMediaURL(t *testing.T) {
	t.Parallel()

	var mediaCalls int32
	mediaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&mediaCalls, 1)
		t.Fatalf("importer fetched returned media URL %s", r.URL)
	}))
	defer mediaServer.Close()

	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(
			w,
			`{"code":200,"data":{"aweme_detail":{"desc":"title",`+
				`"video":{"play_addr_h264":{"url_list":["`+mediaServer.URL+`/video.mp4"]}}}}}`,
		)
	}))
	defer apiServer.Close()

	result, err := NewTikHubImporterForTest(apiServer.URL, "secret", apiServer.Client()).Fetch(context.Background(), Route{Platform: PlatformTikTok, InputURL: "https://www.tiktok.com/t/abc"})
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if result.MediaURL != mediaServer.URL+"/video.mp4" {
		t.Fatalf("MediaURL = %q", result.MediaURL)
	}
	if got := atomic.LoadInt32(&mediaCalls); got != 0 {
		t.Fatalf("media calls = %d, want 0", got)
	}
}

func TestTikHubImporterRequestEscapesQueryValues(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("share_url"); got != "https://v.douyin.com/a b/?x=1&y=2" {
			t.Errorf("decoded share_url = %q", got)
		}
		if strings.Contains(r.RequestURI, "a b") {
			t.Errorf("unescaped RequestURI = %q", r.RequestURI)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(
			w,
			`{"code":200,"data":{"aweme_detail":{"desc":"title",`+
				`"video":{"play_addr_h264":{"url_list":["https://cdn.example/v.mp4"]}}}}}`,
		)
	}))
	defer server.Close()

	_, err := NewTikHubImporterForTest(server.URL, "token", server.Client()).Fetch(context.Background(), Route{Platform: PlatformDouyin, InputURL: "https://v.douyin.com/a b/?x=1&y=2"})
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
}

func TestResultAndRouteCanBeJSONEncoded(t *testing.T) {
	route := Route{Platform: PlatformInstagram, ObjectID: "ABC"}
	raw, err := json.Marshal(route)
	if err != nil || !strings.Contains(string(raw), `"platform":"instagram"`) {
		t.Fatalf("route JSON = %s, error = %v", raw, err)
	}
	var result Result
	if err := json.Unmarshal([]byte(`{"kind":"document","title":"title","markdown":"body","image_urls":["https://img.example/a.jpg"]}`), &result); err != nil {
		t.Fatal(err)
	}
	if result.Kind != ResultDocument || result.Title != "title" || len(result.ImageURLs) != 1 {
		t.Fatalf("result = %+v", result)
	}
}

func TestTikHubImporterPropagatesContextCancellation(t *testing.T) {
	t.Parallel()

	const privateShareToken = "private-share-token"
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		return nil, &url.Error{Op: http.MethodGet, URL: req.URL.String(), Err: context.Canceled}
	})}
	_, err := NewTikHubImporterForTest("https://api.tikhub.test", "token", client).Fetch(
		context.Background(),
		Route{Platform: PlatformTikTok, InputURL: "https://www.tiktok.com/t/" + privateShareToken},
	)
	if err == nil {
		t.Fatal("Fetch() succeeded with canceled context")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context cancellation", err)
	}
	if strings.Contains(err.Error(), privateShareToken) || strings.Contains(err.Error(), "share_url=") {
		t.Fatalf("cancellation error leaked request query: %v", err)
	}
}

func TestTikHubImporterBuildsExpectedURL(t *testing.T) {
	base, err := url.Parse("https://api.tikhub.io")
	if err != nil || base.Host != "api.tikhub.io" {
		t.Fatalf("base parse = %v", err)
	}
}
