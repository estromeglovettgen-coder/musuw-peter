## Why

Musuw accepts video, but the former MiMo URL route rejects valid stored social videos and the earlier Gemini Base64 route cannot carry files near the product limit. OpenRouter's Qwen 3.7 Flash Alibaba endpoint accepts the existing private-object signed URL directly, so the reliable path needs no frame extraction, transcoding, or new service.

## What Changes

- Accept OpenRouter's documented MP4, MPEG, MOV, and WebM upload formats.
- Send the stored video once to `builtin-openrouter-vlm-qwen-3-7-flash` (`qwen/qwen3.7-flash`) as a short-lived HTTPS `video_url` through Alibaba and turn the response into Markdown.
- Feed that Markdown through the existing WeKnora chunking, embedding, indexing, status, and summary path.
- Keep YouTube on its dedicated public-link model, reject unsupported containers, and add no model router, transcoder, new worker type, or new storage format.

## Capabilities

### New Capabilities

- `video-knowledge-ingestion`: Upload and index a supported video through an approved native-video OpenRouter model while reusing the native document pipeline.

## Impact

- Affects the fixed video-model selection, built-in OpenRouter VLM transport configuration, and existing video conversion path.
- Adds no external dependency or public route.
