## ADDED Requirements

### Requirement: Supported video upload
Musuw SHALL accept MP4, MPEG, MOV, and WebM knowledge uploads and SHALL reject undocumented video containers.

#### Scenario: Consumer selects a supported video
- **WHEN** an authenticated paid consumer selects a supported video in the native upload flow
- **THEN** the file SHALL be stored and queued through the existing document-processing task

#### Scenario: Free consumer selects a video
- **WHEN** a Free consumer attempts a video upload
- **THEN** the existing entitlement gate SHALL reject it before model inference

### Requirement: Native OpenRouter video understanding
Musuw SHALL convert each supported video to Markdown using the default
`builtin-openrouter-vlm-qwen-3-7-flash` catalog row bound to
`qwen/qwen3.7-flash` and routed to the OpenRouter `alibaba` provider. A
per-upload model override SHALL NOT be required for the normal consumer path,
and the worker SHALL NOT silently switch models on failure.

#### Scenario: Worker processes a private video
- **WHEN** the document worker reads a supported stored video
- **THEN** it SHALL generate a short-lived HTTPS object URL, send it as `video_url` to OpenRouter, and receive factual searchable Markdown

#### Scenario: Worker reparses a retained video
- **WHEN** an authenticated consumer reparses a supported video whose stored object is still available
- **THEN** the worker SHALL generate a fresh object URL and SHALL NOT download the original social source again

### Requirement: Native ingestion continuation
Musuw SHALL feed generated video Markdown through the existing chunking, embedding, indexing, status, and summary pipeline. A failed native-video request SHALL retain its typed provider cause after the existing failure state is persisted so the document worker can apply terminal provider policy without parsing error text.

#### Scenario: Video understanding succeeds
- **WHEN** the approved native-video model returns non-empty Markdown
- **THEN** the knowledge item SHALL use the same downstream lifecycle as another parsed document

#### Scenario: Video understanding fails
- **WHEN** the provider rejects or cannot understand the video
- **THEN** the existing retry and failed-status behavior SHALL surface the failure without partial indexed content

#### Scenario: Native-video credits are exhausted
- **WHEN** OpenRouter returns a typed credit-exhaustion error for the native-video request
- **THEN** the existing document stage SHALL retain `DOCREADER_PARSE_FAILED`, the worker SHALL return `SkipRetry` on that delivery, and no automatic provider retry SHALL occur
