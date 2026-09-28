package tikhub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

const (
	ProductionBaseURL = "https://api.tikhub.io"
	// Prefer a low-bitrate H.264 rendition that remains useful to the VLM. A
	// 360p floor reduces source size against the existing upload limit while
	// avoiding the tiny thumbnail renditions some providers expose. Codec
	// compatibility remains the first constraint.
	minimumVLMVideoShortSide = 360

	tiktokSharePath      = "/api/v1/tiktok/app/v3/fetch_one_video_by_share_url"
	douyinSharePath      = "/api/v1/douyin/app/v3/fetch_one_video_by_share_url"
	douyinWebSharePath   = "/api/v1/douyin/web/fetch_one_video_by_share_url"
	youtubeStreamsV2Path = "/api/v1/youtube/web_v2/get_video_streams_v2"
	xhsImagePath         = "/api/v1/xiaohongshu/app_v2/get_image_note_detail"
	xhsVideoPath         = "/api/v1/xiaohongshu/app_v2/get_video_note_detail"
	instagramPostPath    = "/api/v1/instagram/v3/get_post_info_by_code"
	xTweetPath           = "/api/v1/twitter/web/fetch_tweet_detail"
)

var (
	ErrMissingAPIKey       = errors.New("TIKHUB_API_KEY is not configured")
	ErrMissingRouteValue   = errors.New("TikHub route is missing its required value")
	ErrUnsupportedPlatform = errors.New("TikHub route uses an unsupported platform")
)

type ResultKind string

const (
	ResultVideo    ResultKind = "video"
	ResultDocument ResultKind = "document"
)

// Result is the only contract between TikHub and the existing ingestion
// pipeline: one social work becomes either a video file or a Markdown document.
type Result struct {
	Kind        ResultKind `json:"kind"`
	Title       string     `json:"title,omitempty"`
	Description string     `json:"description,omitempty"`
	MediaURL    string     `json:"media_url,omitempty"`
	FileName    string     `json:"file_name,omitempty"`
	FileType    string     `json:"file_type,omitempty"`
	Markdown    string     `json:"markdown,omitempty"`
	ImageURLs   []string   `json:"image_urls,omitempty"`
}

// TikHubImporter is deliberately concrete and small: fixed provider host,
// fixed endpoint table, one HTTP client, and no retry/plugin abstraction.
type TikHubImporter struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func NewTikHubImporter() (*TikHubImporter, error) { return NewFromEnv() }

func NewFromEnv() (*TikHubImporter, error) {
	key := strings.TrimSpace(os.Getenv("TIKHUB_API_KEY"))
	if key == "" {
		return nil, ErrMissingAPIKey
	}
	return &TikHubImporter{baseURL: ProductionBaseURL, apiKey: key, client: newTikHubHTTPClient()}, nil
}

func NewTikHubImporterForTest(baseURL, apiKey string, client *http.Client) *TikHubImporter {
	if client == nil {
		client = newTikHubHTTPClient()
	}
	return &TikHubImporter{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		client:  client,
	}
}

// Fetch makes one billed request, except for provider-documented conditional
// fallbacks: Douyin App filter reason 8 to Web, and Xiaohongshu image to video
// when the first response identifies a video note.
func (i *TikHubImporter) Fetch(ctx context.Context, route Route) (Result, error) {
	if i == nil || i.client == nil {
		return Result{}, errors.New("TikHub importer is unavailable")
	}
	if strings.TrimSpace(i.apiKey) == "" {
		return Result{}, ErrMissingAPIKey
	}

	switch route.Platform {
	case PlatformTikTok, PlatformDouyin:
		input, err := requireInputURL(route)
		if err != nil {
			return Result{}, err
		}
		endpoint := tiktokSharePath
		if route.Platform == PlatformDouyin {
			endpoint = douyinSharePath
		}
		data, err := i.get(ctx, endpoint, url.Values{"share_url": {input}})
		if err != nil {
			return Result{}, err
		}
		result, normalizeErr := normalizeWork(route.Platform, route.ObjectID, data, true)
		if normalizeErr == nil || route.Platform != PlatformDouyin || !douyinAppRequiresWebFallback(data) {
			return result, normalizeErr
		}
		data, err = i.get(ctx, douyinWebSharePath, url.Values{"share_url": {input}})
		if err != nil {
			return Result{}, err
		}
		return normalizeWork(route.Platform, route.ObjectID, data, true)

	case PlatformYouTube:
		id, err := requireObjectID(route)
		if err != nil {
			return Result{}, err
		}
		data, err := i.get(ctx, youtubeStreamsV2Path, url.Values{"video_id": {id}})
		if err != nil {
			return Result{}, err
		}
		return normalizeWork(route.Platform, id, data, false)

	case PlatformXiaohongshu:
		params, err := xhsParams(route)
		if err != nil {
			return Result{}, err
		}
		data, err := i.get(ctx, xhsImagePath, params)
		if err != nil {
			return Result{}, err
		}
		if xhsResponseIsVideo(data) {
			data, err = i.get(ctx, xhsVideoPath, params)
			if err != nil {
				return Result{}, err
			}
			return normalizeWork(route.Platform, route.ObjectID, data, false)
		}
		return normalizeDocument(route.Platform, route.ObjectID, data, false)

	case PlatformInstagram:
		code, err := requireObjectID(route)
		if err != nil {
			return Result{}, err
		}
		data, err := i.get(ctx, instagramPostPath, url.Values{"code": {code}})
		if err != nil {
			return Result{}, err
		}
		return normalizeInstagram(data)

	case PlatformX:
		id, err := requireObjectID(route)
		if err != nil {
			return Result{}, err
		}
		data, err := i.get(ctx, xTweetPath, url.Values{"tweet_id": {id}})
		if err != nil {
			return Result{}, err
		}
		return normalizeX(data)

	default:
		return Result{}, fmt.Errorf("%w: %q", ErrUnsupportedPlatform, route.Platform)
	}
}

func douyinAppRequiresWebFallback(data any) bool {
	object, ok := data.(map[string]any)
	if !ok {
		return false
	}
	filters, ok := object["filter_list"].([]any)
	if !ok {
		return false
	}
	for _, rawFilter := range filters {
		filter, ok := rawFilter.(map[string]any)
		if !ok {
			continue
		}
		reason, ok := numberValue(filter["reason"])
		if ok && reason == 8 {
			return true
		}
	}
	return false
}

func requireInputURL(route Route) (string, error) {
	value := strings.TrimSpace(route.InputURL)
	if value == "" {
		return "", fmt.Errorf("%w: %s InputURL", ErrMissingRouteValue, route.Platform)
	}
	return value, nil
}

func requireObjectID(route Route) (string, error) {
	value := strings.TrimSpace(route.ObjectID)
	if value == "" {
		return "", fmt.Errorf("%w: %s ObjectID", ErrMissingRouteValue, route.Platform)
	}
	return value, nil
}

func xhsParams(route Route) (url.Values, error) {
	if id := strings.TrimSpace(route.ObjectID); id != "" {
		return url.Values{"note_id": {id}}, nil
	}
	if input := strings.TrimSpace(route.InputURL); input != "" {
		return url.Values{"share_text": {input}}, nil
	}
	return nil, fmt.Errorf("%w: Xiaohongshu ObjectID or InputURL", ErrMissingRouteValue)
}

type responseEnvelope struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
}

func (i *TikHubImporter) get(ctx context.Context, endpoint string, params url.Values) (any, error) {
	base, err := url.Parse(i.baseURL)
	if err != nil || base.Scheme == "" || base.Host == "" || !strings.HasPrefix(endpoint, "/") {
		return nil, errors.New("TikHub endpoint configuration is invalid")
	}
	base.Path = strings.TrimRight(base.Path, "/") + endpoint
	base.RawQuery = params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
	if err != nil {
		return nil, errors.New("could not create TikHub request")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+i.apiKey)
	resp, err := i.client.Do(req)
	if err != nil {
		// Do not wrap url.Error: it contains the full query/share text.
		if errors.Is(err, context.Canceled) {
			return nil, context.Canceled
		}
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, context.DeadlineExceeded
		}
		return nil, errors.New("TikHub request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("TikHub request returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, errors.New("could not read TikHub response")
	}
	var envelope responseEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, errors.New("TikHub returned invalid JSON")
	}
	if envelope.Code != http.StatusOK {
		// Provider messages are intentionally omitted because they can echo input.
		return nil, fmt.Errorf("TikHub request returned code %d", envelope.Code)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return nil, errors.New("TikHub returned empty data")
	}
	var data any
	if err := json.Unmarshal(envelope.Data, &data); err != nil || data == nil {
		return nil, errors.New("TikHub returned invalid data")
	}
	return data, nil
}

func newTikHubHTTPClient() *http.Client {
	return &http.Client{
		Timeout:       60 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func normalizeWork(platform Platform, routeID string, data any, allowDocument bool) (Result, error) {
	title := firstString(data, "title", "display_title", "name", "desc", "caption", "accessibility_caption", "full_text", "text")
	description := firstString(data, "description", "desc", "caption", "accessibility_caption", "full_text", "text")
	if allowDocument && (platform == PlatformTikTok || platform == PlatformDouyin) && len(imageURLs(data)) > 0 {
		return normalizeDocument(platform, routeID, data, false)
	}
	if mediaURL := videoURL(platform, data); mediaURL != "" {
		return Result{
			Kind: ResultVideo, Title: title, Description: description, MediaURL: mediaURL,
			FileName: artifactName(platform, routeID, extensionForURL(mediaURL, "mp4")),
			FileType: extensionForURL(mediaURL, "mp4"),
		}, nil
	}
	if allowDocument {
		return normalizeDocument(platform, routeID, data, false)
	}
	return Result{}, fmt.Errorf("TikHub %s response has no video URL", platform)
}

func normalizeInstagram(data any) (Result, error) {
	return normalizeWork(PlatformInstagram, "", data, true)
}

func normalizeX(data any) (Result, error) {
	return normalizeDocumentOrVideo(PlatformX, data)
}

func normalizeDocumentOrVideo(platform Platform, data any) (Result, error) {
	if mediaURL := videoURL(platform, data); mediaURL != "" {
		title := firstString(data, "full_text", "text", "title", "name")
		return Result{Kind: ResultVideo, Title: title, Description: title, MediaURL: mediaURL, FileName: artifactName(platform, "", "mp4"), FileType: extensionForURL(mediaURL, "mp4")}, nil
	}
	return normalizeDocument(platform, "", data, platform == PlatformX)
}

func normalizeDocument(platform Platform, routeID string, data any, allowTextOnly bool) (Result, error) {
	title := firstString(data, "title", "display_title", "name", "desc", "caption", "accessibility_caption", "full_text", "text")
	description := firstString(data, "description", "desc", "caption", "accessibility_caption", "full_text", "text")
	if platform == PlatformDouyin || platform == PlatformTikTok {
		if workDescription := stringValue(nestedMapValue(data, "aweme_detail", "desc")); workDescription != "" {
			title = workDescription
			description = workDescription
		}
	}
	images := imageURLs(data)
	if len(images) == 0 && !(allowTextOnly && title != "") {
		return Result{}, fmt.Errorf("TikHub %s response has no document content", platform)
	}
	result := documentResult(title, description, images)
	result.FileName = artifactName(platform, routeID, "md")
	return result, nil
}

func videoURL(platform Platform, data any) string {
	var keys []string
	switch platform {
	case PlatformTikTok, PlatformDouyin:
		// TikHub exposes codec-specific alternatives in video.bit_rate. The
		// lowest-bitrate entry is not necessarily H.264 (Douyin can return a
		// ByteVC2 stream in an MP4 container), and downstream video models may
		// accept the container while producing no text for that codec. Select the
		// lowest explicitly identified H.264 rendition that keeps a 360p short
		// side, then use the provider's primary H.264 address.
		h264Candidates := workH264BitrateCandidates(data)
		if candidate := lowestH264BitrateURL(h264Candidates, minimumVLMVideoShortSide); candidate != "" {
			return candidate
		}
		if candidate := primaryWorkVideoURL(data, "play_addr_h264"); candidate != "" {
			return candidate
		}
		// If every explicitly identified H.264 alternative is below the quality
		// floor, it is still safer for the VLM than an unknown/ByteVC stream.
		if candidate := lowestH264BitrateURL(h264Candidates, 0); candidate != "" {
			return candidate
		}
		// Do not fall back to play_addr, download_addr, video_url, a codec-mixed
		// bit_rate entry, or play_addr_265. Their container/extension does not
		// prove codec compatibility and can silently reintroduce ByteVC2/HEVC.
		return ""
	case PlatformYouTube:
		// TikHub's merged formats are already audio+video MP4 candidates.
		// adaptive_formats are intentionally ignored (they require a merge).
		for _, value := range valuesByKey(data, "formats") {
			if candidate := lowestQualityURL(value); candidate != "" {
				return candidate
			}
		}
		return ""
	case PlatformXiaohongshu:
		return xiaohongshuH264VideoURL(data)
	case PlatformInstagram:
		for _, key := range []string{"video_versions", "videoVersions"} {
			for _, value := range valuesByKey(data, key) {
				if candidate := lowestQualityURL(value); candidate != "" {
					return candidate
				}
			}
		}
		keys = []string{"video_url", "videoUrl"}
	case PlatformX:
		for _, key := range []string{"variants", "video_variants"} {
			for _, value := range valuesByKey(data, key) {
				if candidate := lowestQualityURL(value); candidate != "" {
					return candidate
				}
			}
		}
		keys = []string{"video_info", "videoInfo"}
	}
	for _, key := range keys {
		for _, value := range valuesByKey(data, key) {
			if candidate := firstPlayableURL(value); candidate != "" {
				return candidate
			}
		}
	}
	return ""
}

// xiaohongshuH264VideoURL reads the requested work (the first item) instead of
// recursively mixing it with related works, and never falls back to the HEVC
// stream that Xiaohongshu marks as the default rendition.
func xiaohongshuH264VideoURL(data any) string {
	work := data
	switch items := nestedMapValue(data, "data").(type) {
	case []any:
		if len(items) == 0 {
			return ""
		}
		work = items[0]
	case map[string]any:
		work = items
	}

	stream, ok := nestedMapValue(work, "video_info_v2", "media", "stream").(map[string]any)
	if !ok {
		return ""
	}
	return lowestQualityURL(stream["h264"])
}

type h264Candidate struct {
	url         string
	bitrate     float64
	dataSize    float64
	width       float64
	height      float64
	hasBitrate  bool
	hasDataSize bool
	hasSize     bool
}

// workH264BitrateCandidates walks only the deterministic work video objects,
// preserving provider array order and aggregating plural TikTok responses.
// A recursive map walk would make the selected work depend on Go map order.
func workH264BitrateCandidates(data any) []h264Candidate {
	var result []h264Candidate
	for _, rawVideo := range workVideoObjects(data) {
		video, ok := rawVideo.(map[string]any)
		if !ok {
			continue
		}
		items, ok := video["bit_rate"].([]any)
		if !ok {
			if video["bit_rate"] != nil {
				items = []any{video["bit_rate"]}
			}
		}
		for _, item := range items {
			object, ok := item.(map[string]any)
			if !ok || !isH264Rendition(object) {
				continue
			}
			candidateURL := firstPlayableURL(item)
			if candidateURL == "" {
				continue
			}
			candidate := h264Candidate{url: candidateURL}
			candidate.bitrate, candidate.hasBitrate = numberField(object, "bitrate", "bit_rate", "bitRate")
			candidate.dataSize, candidate.hasDataSize = numberField(object, "data_size", "dataSize")
			width, hasWidth := numberField(object, "width", "video_width")
			height, hasHeight := numberField(object, "height", "video_height")
			if playAddress, ok := object["play_addr"].(map[string]any); ok {
				if !candidate.hasDataSize {
					candidate.dataSize, candidate.hasDataSize = numberField(playAddress, "data_size", "dataSize")
				}
				if !hasWidth {
					width, hasWidth = numberField(playAddress, "width", "video_width")
				}
				if !hasHeight {
					height, hasHeight = numberField(playAddress, "height", "video_height")
				}
			}
			candidate.width = width
			candidate.height = height
			candidate.hasSize = hasWidth && hasHeight && width > 0 && height > 0
			result = append(result, candidate)
		}
	}
	return result
}

// lowestH264BitrateURL chooses only renditions that positively identify as
// H.264/AVC. Unknown codecs are deliberately excluded: an MP4 container alone
// does not make ByteVC2 decodable by a VLM.
func lowestH264BitrateURL(candidates []h264Candidate, minimumShortSide float64) string {
	var best *h264Candidate
	for index := range candidates {
		candidate := &candidates[index]
		if minimumShortSide > 0 && (!candidate.hasSize || min(candidate.width, candidate.height) < minimumShortSide) {
			continue
		}
		if best == nil || lowerH264Cost(*candidate, *best) {
			best = candidate
		}
	}
	if best == nil {
		return ""
	}
	return best.url
}

func lowerH264Cost(a, b h264Candidate) bool {
	if a.hasBitrate != b.hasBitrate {
		return a.hasBitrate
	}
	if a.hasBitrate && a.bitrate != b.bitrate {
		return a.bitrate < b.bitrate
	}
	if a.hasDataSize != b.hasDataSize {
		return a.hasDataSize
	}
	if a.hasDataSize && a.dataSize != b.dataSize {
		return a.dataSize < b.dataSize
	}
	if a.hasSize && b.hasSize {
		return a.width*a.height < b.width*b.height
	}
	return false
}

func isH264Rendition(value map[string]any) bool {
	metadata := []string{
		stringValue(value["codec"]),
		stringValue(value["codec_name"]),
		stringValue(value["codec_type"]),
		stringValue(value["gear_name"]),
		stringValue(value["vcodec"]),
		stringValue(nestedMapValue(value, "play_addr", "url_key")),
	}
	if isH264, exists := boolField(value, "is_h264"); exists && !isH264 {
		return false
	}
	codecFlagSeen := false
	for _, key := range []string{"is_h265", "is_bytevc1", "is_bytevc2"} {
		flag, exists := boolField(value, key)
		if !exists {
			continue
		}
		codecFlagSeen = true
		if flag {
			return false
		}
	}
	for _, field := range metadata {
		normalized := strings.ToLower(strings.TrimSpace(field))
		for _, incompatible := range []string{"bytevc", "h265", "hevc", "vp9", "av1"} {
			if strings.Contains(normalized, incompatible) {
				return false
			}
		}
	}
	if isH264, exists := boolField(value, "is_h264"); exists {
		return isH264
	}
	for _, field := range metadata {
		normalized := strings.ToLower(strings.TrimSpace(field))
		if strings.Contains(normalized, "h264") || strings.Contains(normalized, "avc") {
			return true
		}
	}
	return codecFlagSeen
}

// primaryWorkVideoURL reads the deterministic primary work object used by the
// TikTok/Douyin App endpoints. Douyin commonly returns aweme_detail while
// TikTok commonly returns aweme_details; a recursive key search is unsuitable
// here because it can select the same-named play_addr nested in bit_rate.
func primaryWorkVideoURL(data any, keys ...string) string {
	videoObjects := workVideoObjects(data)
	for _, video := range videoObjects {
		for _, key := range keys {
			if candidate := firstPlayableURL(nestedMapValue(video, key)); candidate != "" {
				return candidate
			}
		}
	}
	return ""
}

func workVideoObjects(data any) []any {
	videoObjects := []any{
		nestedMapValue(data, "aweme_detail", "video"),
		nestedMapValue(data, "video"),
	}
	if object, ok := data.(map[string]any); ok {
		if details, ok := object["aweme_details"].([]any); ok {
			for _, detail := range details {
				videoObjects = append(videoObjects, nestedMapValue(detail, "video"))
			}
		}
	}
	return videoObjects
}

type qualityCandidate struct {
	url        string
	height     float64
	bitrate    float64
	hasHeight  bool
	hasBitrate bool
}

func lowestBitrateURL(value any) string {
	candidates := qualityCandidates(value)
	if len(candidates) == 0 {
		return ""
	}
	var best *qualityCandidate
	for index := range candidates {
		candidate := &candidates[index]
		if !candidate.hasBitrate {
			continue
		}
		if best == nil || candidate.bitrate < best.bitrate {
			best = candidate
		}
	}
	if best == nil {
		return ""
	}
	return best.url
}

func lowestQualityURL(value any) string {
	candidates := qualityCandidates(value)
	if len(candidates) == 0 {
		return ""
	}
	// If all candidates omit quality metadata, preserve the provider's order.
	known := candidates[:0]
	for _, candidate := range candidates {
		if candidate.hasHeight || candidate.hasBitrate {
			known = append(known, candidate)
		}
	}
	if len(known) == 0 {
		return candidates[0].url
	}
	best := known[0]
	for _, candidate := range known[1:] {
		if lowerQuality(candidate, best) {
			best = candidate
		}
	}
	return best.url
}

func lowerQuality(a, b qualityCandidate) bool {
	if a.hasHeight && b.hasHeight && a.height != b.height {
		return a.height < b.height
	}
	if a.hasBitrate && b.hasBitrate && a.bitrate != b.bitrate {
		return a.bitrate < b.bitrate
	}
	return false
}

func qualityCandidates(value any) []qualityCandidate {
	items, ok := value.([]any)
	if !ok {
		items = []any{value}
	}
	result := make([]qualityCandidate, 0, len(items))
	for _, item := range items {
		candidateURL := firstPlayableURL(item)
		if candidateURL == "" {
			continue
		}
		candidate := qualityCandidate{url: candidateURL}
		if typed, ok := item.(map[string]any); ok {
			candidate.height, candidate.hasHeight = numberField(typed, "height", "video_height", "quality_label", "qualityLabel")
			candidate.bitrate, candidate.hasBitrate = numberField(typed, "bitrate", "bit_rate", "bitRate")
		}
		result = append(result, candidate)
	}
	return result
}

func numberField(values map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if number, ok := numberValue(values[key]); ok {
			return number, true
		}
	}
	return 0, false
}

func boolField(values map[string]any, key string) (bool, bool) {
	value, exists := values[key]
	if !exists {
		return false, false
	}
	switch typed := value.(type) {
	case bool:
		return typed, true
	case float64:
		return typed != 0, true
	case float32:
		return typed != 0, true
	case int:
		return typed != 0, true
	case int64:
		return typed != 0, true
	case json.Number:
		number, err := typed.Float64()
		return number != 0, err == nil
	case string:
		normalized := strings.ToLower(strings.TrimSpace(typed))
		switch normalized {
		case "1", "true":
			return true, true
		case "0", "false":
			return false, true
		}
	}
	return false, false
}

func numberValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		number, err := typed.Float64()
		return number, err == nil
	case string:
		number, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(typed, "p")), 64)
		return number, err == nil
	default:
		return 0, false
	}
}

func nestedMapValue(value any, keys ...string) any {
	current := value
	for _, key := range keys {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = object[key]
	}
	return current
}

func firstPlayableURL(value any) string {
	switch typed := value.(type) {
	case string:
		candidate := validHTTPURL(typed)
		if strings.Contains(strings.ToLower(candidate), ".m3u8") {
			return ""
		}
		return candidate
	case []any:
		for _, item := range typed {
			if candidate := firstPlayableURL(item); candidate != "" {
				return candidate
			}
		}
	case map[string]any:
		mime := strings.ToLower(stringValue(typed["content_type"]))
		if mime == "" {
			mime = strings.ToLower(stringValue(typed["mime_type"]))
		}
		if strings.Contains(mime, "mpegurl") {
			return ""
		}
		if mime != "" && !strings.HasPrefix(mime, "video/") {
			return ""
		}
		for _, key := range []string{"url", "video_url", "videoUrl", "url_default", "master_url", "play_url", "play_addr", "play_addr_h264", "play_addr_265", "download_addr"} {
			if candidate := firstPlayableURL(typed[key]); candidate != "" {
				return candidate
			}
		}
		for _, key := range []string{"url_list", "urlList", "variants", "video_versions", "videoVersions", "formats", "adaptive_formats", "stream", "media"} {
			if candidate := firstPlayableURL(typed[key]); candidate != "" {
				return candidate
			}
		}
	}
	return ""
}

func imageURLs(data any) []string {
	keys := []string{"images", "image_list", "images_list", "imageList", "image_versions", "image_versions2", "imageVersions2", "display_url", "media_url_https", "media_url"}
	seen := map[string]bool{}
	var result []string
	for _, key := range keys {
		for _, value := range valuesByKey(data, key) {
			for _, candidate := range collectImageItems(value) {
				if !seen[candidate] {
					seen[candidate] = true
					result = append(result, candidate)
				}
			}
		}
	}
	return result
}

func collectImageItems(value any) []string {
	if candidate := validHTTPURL(value); candidate != "" {
		return []string{candidate}
	}
	if items, ok := value.([]any); ok {
		result := make([]string, 0, len(items))
		for _, item := range items {
			if candidate := firstImageURL(item); candidate != "" {
				result = append(result, candidate)
			}
		}
		return result
	}
	if candidate := firstImageURL(value); candidate != "" {
		return []string{candidate}
	}
	return nil
}

func firstImageURL(value any) string {
	if candidate := validHTTPURL(value); candidate != "" {
		return candidate
	}
	switch typed := value.(type) {
	case []any:
		fallback := ""
		for _, item := range typed {
			if candidate := firstImageURL(item); candidate != "" {
				if isStandardImageURL(candidate) {
					return candidate
				}
				if fallback == "" {
					fallback = candidate
				}
			}
		}
		return fallback
	case map[string]any:
		fallback := ""
		for _, key := range []string{
			"url", "url_default", "display_url", "media_url_https", "media_url", "src",
			"url_list", "urlList", "download_url_list", "downloadUrlList",
			"url_pre", "url_orig", "candidates", "items",
		} {
			if candidate := firstImageURL(typed[key]); candidate != "" {
				if isStandardImageURL(candidate) {
					return candidate
				}
				if fallback == "" {
					fallback = candidate
				}
			}
		}
		return fallback
	}
	return ""
}

// isStandardImageURL identifies renditions that the existing image pipeline
// and vision providers can consume directly. Some social APIs put a
// proprietary original first and a JPEG/WebP alternative later in the same
// list; preferring the standard rendition avoids adding a platform codec.
func isStandardImageURL(candidate string) bool {
	parsed, err := url.Parse(candidate)
	if err != nil {
		return false
	}
	switch strings.ToLower(path.Ext(parsed.Path)) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif":
		return true
	default:
		return false
	}
}

func valuesByKey(data any, wanted string) []any {
	var result []any
	var walk func(any)
	walk = func(node any) {
		switch typed := node.(type) {
		case map[string]any:
			for key, value := range typed {
				if strings.EqualFold(key, wanted) {
					result = append(result, value)
				}
				walk(value)
			}
		case []any:
			for _, item := range typed {
				walk(item)
			}
		}
	}
	walk(data)
	return result
}

func firstString(data any, keys ...string) string {
	for _, key := range keys {
		for _, value := range valuesByKey(data, key) {
			if text := strings.TrimSpace(stringValue(value)); text != "" {
				return text
			}
		}
	}
	return ""
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func xhsResponseIsVideo(data any) bool {
	// A response may contain contradictory type fields (for example a legacy
	// top-level `type: normal` alongside `note_type: video`). Scan all known
	// fields before deciding that the note is an image; a video marker anywhere
	// in the response must win.
	for _, key := range []string{"type", "note_type", "media_type"} {
		for _, value := range valuesByKey(data, key) {
			switch strings.ToLower(strings.TrimSpace(stringValue(value))) {
			case "video", "video_note", "2":
				return true
			}
		}
	}
	return len(valuesByKey(data, "video")) > 0
}

func documentResult(title, description string, images []string) Result {
	var markdown strings.Builder
	if title != "" {
		// Provider titles are frequently the complete social caption. Preserve
		// that text as content without declaring it to be the canonical document
		// heading; the analysis pipeline generates the actual concise title.
		markdown.WriteString(title + "\n\n")
	}
	if description != "" && description != title {
		markdown.WriteString(description + "\n\n")
	}
	for index, image := range images {
		fmt.Fprintf(&markdown, "![image %d](%s)\n\n", index+1, image)
	}
	return Result{Kind: ResultDocument, Title: title, Description: description, Markdown: markdown.String(), ImageURLs: images, FileType: "md"}
}

func artifactName(platform Platform, id, extension string) string {
	base := strings.TrimSpace(string(platform) + "-" + id)
	base = strings.TrimSuffix(base, "-")
	if base == "" {
		base = "social-work"
	}
	return sanitizeFilename(base) + "." + extension
}

func sanitizeFilename(value string) string {
	var result strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			result.WriteRune(r)
		}
	}
	if result.Len() == 0 {
		return "social-work"
	}
	return result.String()
}

func extensionForURL(raw, fallback string) string {
	parsed, err := url.Parse(raw)
	if err == nil {
		extension := strings.TrimPrefix(path.Ext(parsed.Path), ".")
		if extension != "" && len(extension) <= 8 {
			return strings.ToLower(extension)
		}
	}
	return fallback
}

func validHTTPURL(value any) string {
	text := strings.TrimSpace(stringValue(value))
	parsed, err := url.Parse(text)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return text
}
