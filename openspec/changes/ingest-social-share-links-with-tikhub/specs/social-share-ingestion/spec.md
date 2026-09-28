## ADDED Requirements

### Requirement: One-field share input
The system SHALL accept either one HTTP(S) URL or share text containing exactly one HTTP(S) URL through the existing URL import field, up to 4 KiB.

#### Scenario: Pasted share text contains one URL
- **WHEN** an authenticated user submits share text containing one supported social work URL
- **THEN** the system extracts that URL and creates one asynchronous knowledge import without requiring a platform selection

#### Scenario: Input contains multiple URLs
- **WHEN** the input contains more than one distinct HTTP(S) URL
- **THEN** the system rejects the request with an actionable error and does not echo the candidate URLs

### Requirement: Supplied link-import visual contract
The existing URL import modal SHALL reproduce the supplied `DocumentListView.tsx` link-import composition using the project's current Vue/TDesign stack, without a new platform-selection state.

#### Scenario: Link modal is opened
- **WHEN** the user chooses URL import
- **THEN** the modal presents the supplied three-row share-input layout, clear control, supported-platform strip for Instagram, X, Xiaohongshu, TikTok, and YouTube, concise video/document behavior copy, and one primary import action

#### Scenario: Mobile viewport
- **WHEN** the modal is opened below 768 pixels
- **THEN** the platform strip wraps without horizontal overflow and the action remains reachable

### Requirement: Deterministic platform routing
The system MUST classify supported social works from TikTok, YouTube, Xiaohongshu, Instagram, X/Twitter, and URL-bearing Douyin share text using exact hostname and work-path rules before any paid call.

#### Scenario: Supported work route
- **WHEN** an extracted URL matches one supported platform work pattern
- **THEN** the worker calls only that platform's configured TikHub endpoint, except for the documented conditional Xiaohongshu video-detail call

#### Scenario: Malformed social URL
- **WHEN** a known social host does not match a supported single-work path or valid object ID
- **THEN** the import fails without calling TikHub or falling back to WebParser

#### Scenario: Ordinary URL compatibility
- **WHEN** a safe URL does not belong to a known social host
- **THEN** the system preserves the existing file-URL or generic WebParser behavior

### Requirement: Two-form ingestion result
The system SHALL normalize a successful TikHub response into either an existing video-file ingestion or an existing Markdown-document ingestion.

#### Scenario: Video result
- **WHEN** TikHub returns one supported playable video
- **THEN** the worker safely downloads and persists it, sets the existing file fields, and runs the existing video understanding pipeline

#### Scenario: Document result
- **WHEN** TikHub returns a text/image post or note
- **THEN** the worker persists Markdown with image references as an existing document file and continues through the existing image, chunk, embedding, and index pipeline

#### Scenario: Reprocess a materialized document
- **WHEN** a persisted social Markdown document is reprocessed
- **THEN** the worker preserves the durable images still referenced by that source file

#### Scenario: Multiple renditions of one video
- **WHEN** a response contains multiple playable renditions of one video
- **THEN** the worker first selects the lowest explicitly identified H.264 rendition whose known short side is at least 480 pixels, then falls back to the provider's primary H.264 address, and never substitutes an unknown, ByteVC, or HEVC rendition

### Requirement: Paid-call safety
The system MUST keep TikHub credentials server-side, MUST NOT probe endpoints to discover the platform, and MUST NOT automatically retry a social TikHub call.

#### Scenario: TikHub is not configured
- **WHEN** a supported social URL is processed without a server-side TikHub key
- **THEN** the knowledge import fails with a configuration error before any provider request

#### Scenario: Provider timeout or error
- **WHEN** an attempted TikHub call times out or returns an invalid business response
- **THEN** the knowledge import records a failed or unknown result and the queue does not automatically call TikHub again

#### Scenario: Downstream retry after durable materialization
- **WHEN** TikHub media has been persisted and a later video or document processing step fails transiently
- **THEN** the normal document retry budget reuses the persisted file and does not call TikHub again

#### Scenario: Returned media URL
- **WHEN** TikHub returns a media URL
- **THEN** the worker treats it as untrusted, enforces SSRF-safe redirects and the configured file-size limit, and never forwards the TikHub bearer token

### Requirement: Sensitive input handling
The system MUST NOT record raw share text, provider query tokens, TikHub response bodies, signed media URLs, or the TikHub API key in application logs or public knowledge metadata.

#### Scenario: URL import logging
- **WHEN** a share import is accepted, rejected, or fails in the worker
- **THEN** logs contain only non-sensitive identifiers and a sanitized host/path or fingerprint
