## Why

Musuw's existing URL import accepts only a syntactically valid URL and sends social pages through the generic WebParser, which cannot reliably turn public social posts into the same video or document inputs users can upload directly. Users need one lightweight entry point that accepts either a URL or a pasted share message and delegates platform parsing to TikHub without adding a second ingestion system.

## What Changes

- Keep the existing URL input and API, but allow one public URL embedded in pasted share text.
- Mechanically port the social-link modal layout, spacing, platform strip, and action states from the supplied `DocumentListView.tsx` into the existing Vue upload control rather than designing a parallel screen.
- Deterministically route single public works from TikTok, YouTube, Xiaohongshu, Instagram, and X/Twitter to one fixed TikHub endpoint per platform; retain ordinary safe-URL behavior for all other hosts.
- Normalize TikHub responses to only two existing ingestion forms: a locally persisted video file or a Markdown document with images.
- Add Douyin compatibility for share text containing a URL; pure no-URL share codes remain an explicit unsupported input in this first implementation.
- Keep TikHub credentials server-side, prevent paid endpoint probing/retries, and validate all returned media URLs with the existing SSRF-safe download path.
- Do not add a platform dropdown, provider framework, new queue, new knowledge type, or new database table.

## Capabilities

### New Capabilities

- `social-share-ingestion`: One-field social share ingestion, deterministic platform routing, TikHub normalization, and safe reuse of the existing document/video worker.

### Modified Capabilities

None.

## Impact

- `weknora/frontend`: the existing URL dialog adopts the supplied link-import styling and stops rejecting share text before submission.
- `weknora/internal/handler` and `weknora/internal/application/service`: input extraction moves ahead of URL/file classification; known social URLs branch inside the existing document worker.
- Server/container wiring: one server-only TikHub credential, required as a
  file-backed secret by the Musuw production and staging overlays but optional
  for local/community deployments, plus a fixed provider base URL.
- Existing URL import API remains compatible; no new public endpoint or request field is introduced.
