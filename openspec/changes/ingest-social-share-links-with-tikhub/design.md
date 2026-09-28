## Context

The current URL flow is `URL dialog -> POST /knowledge-bases/:id/knowledge/url -> CreateKnowledgeFromURL -> DocumentProcessPayload.URL -> WebParser`. The frontend and handler reject any value that is not already a URL, while the worker has no social-media branch. Video upload and Markdown processing already exist and are the authority for downstream ingestion.

TikHub exposes platform-specific REST endpoints but no embeddable Go router or typed cross-platform response. Its current official downloader skill also dispatches by platform rather than using Hybrid as a universal endpoint. The implementation therefore needs a small deterministic input/router layer and one concrete TikHub importer, not a second ingestion architecture.

## Goals / Non-Goals

**Goals:**

- Preserve one existing input and API field for a naked URL or share text containing exactly one URL.
- Support single public works from TikTok, YouTube, Xiaohongshu, Instagram, and X/Twitter, plus Douyin share text containing a URL.
- Reuse the current video-VLM and Markdown/chunk/index pipelines.
- Keep paid calls bounded, credentials server-side, and returned media downloads SSRF-safe.

**Non-Goals:**

- Profiles, channels, playlists, stories, live streams, private/login-only content, or multiple URLs.
- A platform dropdown, LLM routing, provider plugin framework, new queue, new knowledge type, or new table.
- Automatic fallback to Hybrid, yt-dlp, Cobalt, or a second paid TikHub endpoint, except the documented Xiaohongshu image-detail to video-detail branch.
- Exactly-once billing across process crashes or short links whose stable work ID is not locally available. Version one deduplicates extractable stable IDs and reports the residual short-link/crash window honestly.

## Decisions

### 1. Extract and route deterministically before existing URL classification

The existing Vue URL modal mechanically ports the supplied React link-import section: the same three-row textarea, clear affordance, gray supported-platform strip, compact explanatory copy, and black primary action. It shows Instagram, X, Xiaohongshu, TikTok, and YouTube as informational marks, not selectable state; Douyin compatibility is described beside TikTok. No frontend platform router is added.

The frontend submits up to 4 KiB of raw input without calling `new URL`. `CreateKnowledgeFromURL` first removes zero-width characters, extracts exactly one HTTP(S) URL, validates that URL with the existing SSRF rules, and classifies exact host/path patterns. This happens before `isFileURL`. Multiple URLs are rejected without echoing candidates. Unknown safe hosts continue through the existing file/web flow.

Supported social paths are intentionally narrow: TikTok video/share paths, YouTube `watch` and `shorts`, Xiaohongshu note paths or official short hosts, Instagram `p|reel|reels|tv`, X/Twitter `status/<numeric-id>`, and Douyin work/share paths. Platform IDs are validated before any paid call.

Short TikTok, Xiaohongshu, and Douyin URLs are passed only to the matching TikHub share parameter after host validation; Musuw does not expand them locally. YouTube, Instagram, X, and recognized long Xiaohongshu inputs use locally extracted IDs/codes. Query strings and fragments are removed whenever the provider does not require them.

### 2. Reuse the existing URL payload and rerun the pure router in the worker

Creation stores the extracted, provider-safe URL in the existing `Knowledge.Source` and `DocumentProcessPayload.URL`. No adapter field or public metadata is added. The worker reruns the same side-effect-free classifier on `payload.URL`; known social URLs enter `TikHubImporter`, while all other URLs retain `convert -> WebParser`.

When the route exposes a stable object ID, the existing `FileHash` dedupe input is `platform + object ID` rather than the display URL. This collapses host/username aliases without a schema change; unresolved short links continue to use their cleaned URL.

The duplicate local classification is cheaper and safer than a new persisted contract. It also means a recognized social URL can never silently fall back to WebParser merely because private metadata is missing.

### 3. Use one concrete TikHub importer and direct REST

`TikHubImporter` owns the fixed official base URL, bearer authentication, endpoint map, response validation, and platform normalizers. It has no provider interface because there is no second provider. The API key comes only from `TIKHUB_API_KEY`; a test-only constructor injects an `http.Client` and base URL. The client has a bounded timeout and no automatic retries. The production base host is fixed to the official TikHub host rather than user input.

Normal calls make one request. Xiaohongshu first calls image-note detail; only a successful `type=video` response triggers video-note detail. A missing key or malformed/unsupported social path fails closed without calling TikHub.

### 4. Adapt results directly at the existing worker seam

The importer returns only:

```text
Video(title, description, media URL, filename, extension)
Document(title, Markdown, image URLs)
```

For `Video`, the worker validates and downloads the returned URL using the existing SSRF-safe client with the deploy-time `MAX_FILE_SIZE_MB` cap, persists bytes with the existing file service, updates the knowledge file fields, clears `payload.URL`, sets `FilePath/FileName/FileType`, and calls the existing file conversion path, which delegates to `convertVideo`. A configured VLM remains the same prerequisite as manual video upload.

For `Document`, the worker persists normalized Markdown as an ordinary `.md` file, updates the same file fields, clears `payload.URL`, and calls the existing document conversion path. Remote image URLs embedded in the Markdown remain untrusted and go through the existing image resolver. Persisting both result kinds before conversion also means a later user-requested reparse uses the saved artifact rather than billing TikHub again.

### 5. Paid TikHub calls do not automatically retry

Social URL tasks use the normal document retry budget. The social worker branch records a failed/unknown result and returns success to the queue when the TikHub request itself fails, so provider timeout and business errors do not re-enter Asynq's retry loop. After TikHub succeeds, the worker persists the returned video or Markdown and records the file checkpoint before entering the existing document pipeline. A later downstream retry restores that file checkpoint and skips TikHub, allowing transient VLM, parser, embedding, or post-processing failures to recover without another paid call. A user may still explicitly request a fresh import. A crash or concurrent delivery between provider success and the durable source claim can cause an additional charge; eliminating that narrow window would require durable billing state, which is deliberately outside this lightweight version.

### 6. Do not log raw share input or signed URLs

The URL handler and creation service log only knowledge IDs and sanitized host/path fingerprints. TikHub request parameters, response bodies, provider media URLs, and API keys are excluded from logs and audit metadata. The queue contains only the sanitized user work URL, never the TikHub key or returned signed media URL.

## Risks / Trade-offs

- **TikHub response bodies are not typed by OpenAPI** -> Lock each normalizer with provider-shaped fixtures and fail closed when required fields are absent.
- **A social video exceeds `MAX_FILE_SIZE_MB` or no VLM is configured** -> Mark the knowledge failed with an actionable message; do not fall back to a web page or fetch another format automatically.
- **A short and long link for one work can still bypass deduplication when the short link hides the object ID** -> Use stable-ID hashes wherever the ID is locally extractable and accept the unresolved-short-link trade-off without a schema migration.
- **Shared TikHub balance can be consumed by authenticated users** -> Limit each job to its fixed request count, use existing URL-import authorization, and expose provider errors; each Musuw overlay must also set an operator balance alert before enabling `TIKHUB_API_KEY`.
- **Provider success followed by worker crash or a concurrent pre-claim delivery is not exactly once** -> Consume provider failures without queue retry, reuse every durable source checkpoint on downstream retries, and make the remaining pre-claim uncertainty visible rather than adding a transaction/lease subsystem.

## Migration Plan

1. Local/community deployments may leave `TIKHUB_API_KEY` unset; ordinary URL behavior remains active and recognized social inputs fail with a configuration message.
2. The Musuw production and staging overlays each require their own file-backed
   `tikhub_api_key` secret and an operator balance alert before rollout. Their
   preflights inspect only safe file metadata; the app entrypoint reads the
   mounted value solely inside the backend process.
3. Run one authorized fixture per supported content kind and verify downstream video/Markdown ingestion.
4. Roll back by disabling social input or reverting the change; no schema rollback is required.

## Open Questions

None for the first implementation. Pure no-URL Douyin share codes and multi-asset video carousels remain explicit future scope.
