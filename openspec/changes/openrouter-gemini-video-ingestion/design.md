## Context

Musuw already saves uploaded and social-source videos to private object storage, converts them to Markdown with an OpenRouter VLM, and rejoins the text ingestion pipeline. The former Gemini Base64 route is bounded below the product file limit, while the MiMo URL route failed on a valid 112,301,200-byte H.264 MP4. Qwen 3.7 Flash through Alibaba accepted that exact signed object URL repeatedly.

## Goals / Non-Goals

**Goals:**

- Convert a supported stored video into searchable Markdown with the platform's approved native-video VLM.
- Reuse existing upload storage, status, chunking, embedding, indexing, and summary behavior.
- Use one fixed model and the same stored-object URL path for local and materialized social videos.

**Non-Goals:**

- Transcoding, frame extraction, duration probing, another model router, or a new worker/service.
- Supporting containers that OpenRouter does not document.

## Decisions

- Extend the existing remote VLM adapter with an optional video prediction contract; existing decorators forward it.
- Generate a short-lived HTTPS URL for the already stored object and send it as `video_url` to the existing `/chat/completions` endpoint.
- Bypass DocReader only for video-to-Markdown conversion, then immediately rejoin the existing document pipeline.
- Fix normal stored-video ingestion to `builtin-openrouter-vlm-qwen-3-7-flash`
  and its single Alibaba route. Keep the service-level environment override only
  as the existing rollback seam; do not add automatic cross-model retry.
- Keep public YouTube links on the existing dedicated Google AI Studio model;
  they do not enter the stored-object model selection.
- Preserve `builtin-openrouter-vlm-mimo-v2-5` only as the identifier used to
  repair stale still-image settings from the previous release.

## Risks / Trade-offs

- The Alibaba endpoint is a single-provider dependency; provider failures use
  the existing one-retry and failed-status path, and the stored source remains
  available for explicit reparse.
- Signed URLs expire, so each processing or reparse attempt generates a fresh
  URL from the durable private object.
- Only MP4, MPEG, MOV, and WebM are admitted in browser and server validation.

## Migration Plan

- The YAML-managed Qwen catalog row is reconciled on application startup from
  Base64 mode to URL mode; no schema or data migration is required.
- Deploy the immutable image to staging, verify the row is `url`/`alibaba`, and
  run the retained large Xiaohongshu sample through parsing and downstream Wiki/graph generation.
- Promote the same revision only after that gate passes. Roll back by restoring
  the previous immutable image or using the existing server model override.

## Open Questions

None.
