package tikhub

// Platform identifies the social platform handled by TikHubImporter.
//
// InputURL carries a platform URL or the original platform share text (for
// example, a Douyin/TikTok message containing a URL). ObjectID carries the
// platform object identifier when the endpoint accepts one. Keeping both
// values lets the input parser avoid re-encoding provider-specific semantics.
type Platform string

const (
	PlatformTikTok      Platform = "tiktok"
	PlatformYouTube     Platform = "youtube"
	PlatformXiaohongshu Platform = "xiaohongshu"
	PlatformInstagram   Platform = "instagram"
	PlatformX           Platform = "x"
	PlatformDouyin      Platform = "douyin"

	// Short aliases keep call sites readable while the Platform-prefixed names
	// make the exported enum-like values discoverable in documentation.
	TikTok      = PlatformTikTok
	YouTube     = PlatformYouTube
	Xiaohongshu = PlatformXiaohongshu
	Instagram   = PlatformInstagram
	X           = PlatformX
	Douyin      = PlatformDouyin
)

// Route is the normalized input produced by the social-share parser.
//
// The importer deliberately does not parse arbitrary share text itself. For
// URL/share-text endpoints, InputURL is sent as-is. For ID/code endpoints,
// ObjectID is sent as the endpoint's required ID parameter.
type Route struct {
	Platform Platform `json:"platform"`
	InputURL string   `json:"input_url,omitempty"`
	ObjectID string   `json:"object_id,omitempty"`
}
