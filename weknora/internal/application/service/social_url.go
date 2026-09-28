package service

import (
	"errors"
	"net/url"
	"regexp"
	"strings"

	"github.com/Tencent/WeKnora/internal/infrastructure/tikhub"
)

// socialShareInputMaxBytes bounds the request value before any parsing. The
// URL import endpoint is intentionally small: a share message only needs a
// few lines around one link, and bounding the raw bytes prevents a pasted
// document from becoming a parser/logging workload.
const socialShareInputMaxBytes = 4096

var (
	// These errors are deliberately stable and contain no user input. Callers
	// can turn them into a 400 response without echoing a pasted share message
	// or a provider query token.
	ErrSocialInputTooLong   = errors.New("share input exceeds 4096 bytes")
	ErrNoHTTPURL            = errors.New("share input must contain one HTTP(S) URL")
	ErrMultipleHTTPURLs     = errors.New("share input must contain exactly one HTTP(S) URL")
	ErrInvalidHTTPURL       = errors.New("share input contains an invalid HTTP(S) URL")
	ErrUnsupportedSocialURL = errors.New("social URL is not a supported single-work link")
)

var (
	// Social share messages often put Chinese copy immediately after the URL
	// without a space. Restrict the candidate to the ASCII URL alphabet so the
	// extraction stops at that copy instead of treating it as path text.
	httpURLPattern = regexp.MustCompile(`(?i)https?://[A-Za-z0-9][A-Za-z0-9._~:/?#[\]@!$&()*+,;=%_-]*`)
	// Collapse a Markdown link to its destination before the generic URL scan.
	// Otherwise a URL-shaped label followed by its destination can either look
	// like two links or be consumed as one malformed `URL](URL)` candidate.
	markdownHTTPLinkPattern = regexp.MustCompile(`(?i)\[[^\]\r\n]*\]\(\s*(https?://[^\s)]+)\s*\)`)

	// Work IDs are intentionally narrower than an arbitrary path segment. The
	// parser should fail closed for profile/channel/playlist URLs before a
	// paid provider request can be made.
	tiktokVideoIDPattern   = regexp.MustCompile(`^[0-9]{6,30}$`)
	youtubeVideoIDPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	xiaohongshuNotePattern = regexp.MustCompile(`^[A-Za-z0-9]{24}$`)
	instagramCodePattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{5,64}$`)
	tweetIDPattern         = regexp.MustCompile(`^[0-9]{6,30}$`)
	shortCodePattern       = regexp.MustCompile(`^[A-Za-z0-9_-]{4,80}$`)
	usernamePattern        = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
)

// ParseSocialShareInput removes copy/paste artefacts, extracts exactly one
// HTTP(S) URL, and applies the deterministic social-work route rules.
//
// A non-nil route means the URL is a supported social work and must be sent to
// TikHub by the worker. A nil route with a non-empty cleanedURL is an ordinary
// URL and retains the existing file/WebParser path. A known social host with a
// bad path returns ErrUnsupportedSocialURL so it cannot silently fall back to
// WebParser.
func ParseSocialShareInput(input string) (*tikhub.Route, string, error) {
	cleanedURL, err := extractNormalizedHTTPURL(input)
	if err != nil {
		return nil, "", err
	}

	parsed, err := url.Parse(cleanedURL)
	if err != nil {
		// extractNormalizedHTTPURL already parsed the value; this is defensive and keeps
		// malformed values out of the routing switch without echoing them.
		return nil, "", ErrInvalidHTTPURL
	}

	route, err := classifySocialURL(parsed, cleanedURL)
	if err != nil {
		return nil, "", err
	}
	if route == nil {
		return nil, cleanedURL, nil
	}
	return route, route.InputURL, nil
}

func extractNormalizedHTTPURL(input string) (string, error) {
	if len([]byte(input)) > socialShareInputMaxBytes {
		return "", ErrSocialInputTooLong
	}

	cleanedInput := removeMarkdownEscapes(removeZeroWidth(input))
	cleanedInput = markdownHTTPLinkPattern.ReplaceAllString(cleanedInput, "$1")
	candidates := httpURLPattern.FindAllString(cleanedInput, -1)
	if len(candidates) == 0 {
		return "", ErrNoHTTPURL
	}

	// Count distinct normalized URLs. Repeating the same URL in a copied
	// message is unambiguous; two different links are rejected rather than
	// guessing which work the user intended.
	seen := make(map[string]struct{}, len(candidates))
	cleanedURLs := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		candidate = trimURLTrailingPunctuation(candidate)
		cleaned, parsed, ok := normalizeHTTPURL(candidate)
		if !ok {
			return "", ErrInvalidHTTPURL
		}
		if _, exists := seen[cleaned]; exists {
			continue
		}
		seen[cleaned] = struct{}{}
		cleanedURLs = append(cleanedURLs, cleaned)
		_ = parsed
	}

	if len(cleanedURLs) == 0 {
		return "", ErrNoHTTPURL
	}
	if len(cleanedURLs) > 1 {
		return "", ErrMultipleHTTPURLs
	}
	return cleanedURLs[0], nil
}

// ExtractSingleHTTPURL is the extraction-only seam used by tests and by any
// future import surface that needs the same one-link contract. It does not
// classify the host or perform SSRF checks.
func ExtractSingleHTTPURL(input string) (string, error) {
	return extractNormalizedHTTPURL(input)
}

func removeZeroWidth(input string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case '\u00ad', // soft hyphen, frequently introduced by rich text
			'\u200b', // zero-width space
			'\u200c', // zero-width non-joiner
			'\u200d', // zero-width joiner
			'\u2060', // word joiner
			'\ufeff': // byte-order mark / zero-width no-break space
			return -1
		default:
			return r
		}
	}, input)
}

// removeMarkdownEscapes normalizes URLs copied from rich-text/chat surfaces.
// Those clients commonly serialize an underscore as `\_` inside the visible
// label of `[URL](URL)`. Without this pass the first candidate stops at the
// backslash and looks different from the link target, so one logical link is
// rejected as two distinct URLs.
func removeMarkdownEscapes(input string) string {
	const escapable = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
	var builder strings.Builder
	builder.Grow(len(input))
	for index := 0; index < len(input); index++ {
		if input[index] == '\\' && index+1 < len(input) && strings.ContainsRune(escapable, rune(input[index+1])) {
			index++
		}
		builder.WriteByte(input[index])
	}
	return builder.String()
}

func trimURLTrailingPunctuation(raw string) string {
	// These marks are separators commonly attached by Chinese, Markdown, and
	// chat clients. A URL's slash, hyphen, underscore, and query ampersand are
	// intentionally not trimmed.
	const punctuation = ".,!?;:'\"，。！？；：、)]}》」』”’）】》…"
	for raw != "" {
		runes := []rune(raw)
		if !strings.ContainsRune(punctuation, runes[len(runes)-1]) {
			break
		}
		runes = runes[:len(runes)-1]
		raw = string(runes)
	}
	return raw
}

func normalizeHTTPURL(raw string) (string, *url.URL, bool) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil {
		return "", nil, false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Hostname() == "" || parsed.User != nil {
		return "", nil, false
	}
	// Reject malformed/explicit ports on social hosts later in classification;
	// for ordinary URLs preserve the existing URL semantics and only normalize
	// scheme/host casing plus the copy/paste fragment.
	parsed.Scheme = scheme
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.Fragment = ""
	return parsed.String(), parsed, true
}

func classifySocialURL(parsed *url.URL, cleanedURL string) (*tikhub.Route, error) {
	host := parsed.Hostname()
	knownHost := isKnownSocialHost(host)
	if !knownHost {
		return nil, nil
	}
	// Provider links are public HTTPS/HTTP origins, not authenticated URLs or
	// alternate service ports. Keep the host/path match exact before any paid
	// call. A known host with an invalid path is unsupported, not generic.
	if parsed.User != nil || parsed.Port() != "" {
		return nil, ErrUnsupportedSocialURL
	}

	segments, ok := socialPathSegments(parsed.Path)
	if !ok {
		return nil, ErrUnsupportedSocialURL
	}

	switch {
	case isTikTokHost(host):
		return classifyTikTok(parsed, cleanedURL, segments)
	case isYouTubeHost(host):
		return classifyYouTube(parsed, cleanedURL, segments)
	case isXiaohongshuHost(host):
		return classifyXiaohongshu(parsed, cleanedURL, segments)
	case isInstagramHost(host):
		return classifyInstagram(parsed, cleanedURL, segments)
	case isXHost(host):
		return classifyX(parsed, cleanedURL, segments)
	case isDouyinHost(host):
		return classifyDouyin(parsed, cleanedURL, segments)
	default:
		return nil, nil
	}
}

func classifyTikTok(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	host := parsed.Hostname()
	if isTikTokShortHost(host) {
		if len(segments) == 1 && shortCodePattern.MatchString(segments[0]) {
			return socialRoute(tikhub.PlatformTikTok, canonicalSocialURL(parsed, "/"+segments[0], ""), ""), nil
		}
		return nil, ErrUnsupportedSocialURL
	}
	if len(segments) == 2 && segments[0] == "t" && shortCodePattern.MatchString(segments[1]) {
		return socialRoute(tikhub.PlatformTikTok, canonicalSocialURL(parsed, "/t/"+segments[1], ""), segments[1]), nil
	}
	if len(segments) == 3 && strings.HasPrefix(segments[0], "@") &&
		usernamePattern.MatchString(strings.TrimPrefix(segments[0], "@")) &&
		segments[1] == "video" && tiktokVideoIDPattern.MatchString(segments[2]) {
		path := "/" + segments[0] + "/video/" + segments[2]
		return socialRoute(tikhub.PlatformTikTok, canonicalSocialURL(parsed, path, ""), segments[2]), nil
	}
	return nil, ErrUnsupportedSocialURL
}

func classifyYouTube(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	host := parsed.Hostname()
	if host == "youtu.be" {
		if len(segments) == 1 && youtubeVideoIDPattern.MatchString(segments[0]) {
			return socialRoute(tikhub.PlatformYouTube, canonicalSocialURL(parsed, "/"+segments[0], ""), segments[0]), nil
		}
		return nil, ErrUnsupportedSocialURL
	}
	if len(segments) == 1 && segments[0] == "shorts" {
		return nil, ErrUnsupportedSocialURL
	}
	if len(segments) == 2 && segments[0] == "shorts" && youtubeVideoIDPattern.MatchString(segments[1]) {
		return socialRoute(tikhub.PlatformYouTube, canonicalSocialURL(parsed, "/shorts/"+segments[1], ""), segments[1]), nil
	}
	if len(segments) == 1 && segments[0] == "watch" {
		values, err := url.ParseQuery(parsed.RawQuery)
		if err != nil || len(values["v"]) != 1 || !youtubeVideoIDPattern.MatchString(values.Get("v")) {
			return nil, ErrUnsupportedSocialURL
		}
		videoID := values.Get("v")
		return socialRoute(tikhub.PlatformYouTube, canonicalSocialURL(parsed, "/watch", "v="+url.QueryEscape(videoID)), videoID), nil
	}
	_ = cleanedURL // retained in the signature for uniform classifier seams
	return nil, ErrUnsupportedSocialURL
}

func classifyXiaohongshu(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	host := parsed.Hostname()
	if isXiaohongshuShortHost(host) {
		shortPrefix := false
		if len(segments) == 2 {
			switch segments[0] {
			case "a", "m", "n", "o":
				shortPrefix = true
			}
		}
		if (len(segments) == 1 || shortPrefix) && shortCodePattern.MatchString(segments[len(segments)-1]) {
			// xhslink short tokens are share-text values, not note IDs. TikHub
			// must receive share_text so it can resolve the token itself.
			return socialRoute(tikhub.PlatformXiaohongshu, canonicalSocialURL(parsed, "/"+strings.Join(segments, "/"), ""), ""), nil
		}
		return nil, ErrUnsupportedSocialURL
	}
	if len(segments) == 2 && segments[0] == "explore" && xiaohongshuNotePattern.MatchString(segments[1]) {
		return socialRoute(tikhub.PlatformXiaohongshu, canonicalSocialURL(parsed, "/"+segments[0]+"/"+segments[1], ""), segments[1]), nil
	}
	if len(segments) == 3 && segments[0] == "discovery" && segments[1] == "item" && xiaohongshuNotePattern.MatchString(segments[2]) {
		return socialRoute(tikhub.PlatformXiaohongshu, canonicalSocialURL(parsed, "/discovery/item/"+segments[2], ""), segments[2]), nil
	}
	return nil, ErrUnsupportedSocialURL
}

func classifyInstagram(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	if len(segments) == 2 && (segments[0] == "p" || segments[0] == "reel" || segments[0] == "reels" || segments[0] == "tv") && instagramCodePattern.MatchString(segments[1]) {
		return socialRoute(tikhub.PlatformInstagram, canonicalSocialURL(parsed, "/"+segments[0]+"/"+segments[1], ""), segments[1]), nil
	}
	_ = cleanedURL
	return nil, ErrUnsupportedSocialURL
}

func classifyX(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	if len(segments) == 3 && usernamePattern.MatchString(segments[0]) && segments[1] == "status" && tweetIDPattern.MatchString(segments[2]) {
		return socialRoute(tikhub.PlatformX, canonicalSocialURL(parsed, "/"+segments[0]+"/status/"+segments[2], ""), segments[2]), nil
	}
	if len(segments) == 3 && segments[0] == "i" && segments[1] == "status" && tweetIDPattern.MatchString(segments[2]) {
		return socialRoute(tikhub.PlatformX, canonicalSocialURL(parsed, "/i/status/"+segments[2], ""), segments[2]), nil
	}
	_ = cleanedURL
	return nil, ErrUnsupportedSocialURL
}

func classifyDouyin(parsed *url.URL, cleanedURL string, segments []string) (*tikhub.Route, error) {
	if parsed.Hostname() == "v.douyin.com" {
		if len(segments) == 1 && shortCodePattern.MatchString(segments[0]) {
			return socialRoute(tikhub.PlatformDouyin, canonicalSocialURL(parsed, "/"+segments[0], ""), ""), nil
		}
		return nil, ErrUnsupportedSocialURL
	}
	if len(segments) == 2 && segments[0] == "video" && tiktokVideoIDPattern.MatchString(segments[1]) {
		return socialRoute(tikhub.PlatformDouyin, canonicalSocialURL(parsed, "/video/"+segments[1], ""), segments[1]), nil
	}
	if len(segments) == 3 && segments[0] == "share" && segments[1] == "video" && tiktokVideoIDPattern.MatchString(segments[2]) {
		return socialRoute(tikhub.PlatformDouyin, canonicalSocialURL(parsed, "/share/video/"+segments[2], ""), segments[2]), nil
	}
	return nil, ErrUnsupportedSocialURL
}

func socialRoute(platform tikhub.Platform, inputURL, objectID string) *tikhub.Route {
	return &tikhub.Route{Platform: platform, InputURL: inputURL, ObjectID: objectID}
}

// socialURLDedupeSource uses the provider's stable work identifier when one
// is available. Display URLs can contain usernames or alternate hosts, so
// hashing the URL alone would charge twice for the same YouTube video, tweet,
// Instagram post, or long-form social work shared through two aliases.
func socialURLDedupeSource(route *tikhub.Route, cleanedURL string) string {
	if route == nil || strings.TrimSpace(route.ObjectID) == "" {
		return cleanedURL
	}
	return "social:" + string(route.Platform) + ":" + route.ObjectID
}

func socialPathSegments(rawPath string) ([]string, bool) {
	if rawPath == "" || !strings.HasPrefix(rawPath, "/") {
		return nil, false
	}
	trimmed := strings.TrimSuffix(strings.TrimPrefix(rawPath, "/"), "/")
	if trimmed == "" || strings.Contains(trimmed, "//") {
		return nil, false
	}
	parts := strings.Split(trimmed, "/")
	for i := range parts {
		if parts[i] == "" {
			return nil, false
		}
		decoded, err := url.PathUnescape(parts[i])
		if err != nil || decoded != parts[i] {
			// Encoded separators/IDs make the work path ambiguous; reject them
			// instead of silently changing the provider route.
			return nil, false
		}
		parts[i] = decoded
	}
	return parts, true
}

func canonicalSocialURL(parsed *url.URL, rawPath, rawQuery string) string {
	copyURL := *parsed
	copyURL.Scheme = strings.ToLower(parsed.Scheme)
	copyURL.Host = strings.ToLower(parsed.Hostname())
	copyURL.Path = rawPath
	copyURL.RawPath = ""
	copyURL.RawQuery = rawQuery
	copyURL.Fragment = ""
	copyURL.ForceQuery = false
	return copyURL.String()
}

// urlForLog returns only a host/path hint. Query strings and fragments are
// deliberately omitted because share links routinely carry signed provider
// tokens. It is used by URL creation logs, never as the persisted source.
func urlForLog(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Hostname() == "" {
		return "[invalid-url]"
	}
	host := strings.ToLower(parsed.Hostname())
	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}
	return host + path
}

func isKnownSocialHost(host string) bool {
	return isTikTokHost(host) || isYouTubeHost(host) || isXiaohongshuHost(host) || isInstagramHost(host) || isXHost(host) || isDouyinHost(host)
}

func isTikTokHost(host string) bool {
	switch host {
	case "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com":
		return true
	default:
		return false
	}
}

func isTikTokShortHost(host string) bool {
	return host == "vm.tiktok.com" || host == "vt.tiktok.com"
}

func isYouTubeHost(host string) bool {
	switch host {
	case "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be":
		return true
	default:
		return false
	}
}

func isXiaohongshuHost(host string) bool {
	switch host {
	case "xiaohongshu.com", "www.xiaohongshu.com", "m.xiaohongshu.com", "xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn":
		return true
	default:
		return false
	}
}

func isXiaohongshuShortHost(host string) bool {
	return host == "xhslink.com" || host == "www.xhslink.com" || host == "xhslink.cn" || host == "www.xhslink.cn"
}

func isInstagramHost(host string) bool {
	switch host {
	case "instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am":
		return true
	default:
		return false
	}
}

func isXHost(host string) bool {
	switch host {
	case "x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com":
		return true
	default:
		return false
	}
}

func isDouyinHost(host string) bool {
	switch host {
	case "douyin.com", "www.douyin.com", "m.douyin.com", "v.douyin.com", "iesdouyin.com", "www.iesdouyin.com":
		return true
	default:
		return false
	}
}
