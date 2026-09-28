## 1. Input and Routing Contract

- [x] 1.1 Add failing Go tests for one-URL share-text extraction, multiple/no-URL errors, five-platform and Douyin routing, strict work paths, and unknown-host fallback.
- [x] 1.2 Implement the pure input extractor/router and make `CreateKnowledgeFromURL` run it before SSRF and file/web classification without logging raw input.

## 2. TikHub Importer

- [x] 2.1 Add failing fixture tests for fixed endpoint requests, bearer isolation, business-error handling, and TikTok/YouTube/Xiaohongshu/Instagram/X/Douyin normalization.
- [x] 2.2 Implement one concrete, no-retry TikHub REST importer using only the server-side `TIKHUB_API_KEY` and the fixed official base host.

## 3. Existing Worker Integration

- [x] 3.1 Add worker-focused tests proving social documents bypass WebParser and social videos are safely persisted before entering the existing video path.
- [x] 3.2 Branch recognized social URLs inside `ProcessDocument`, enforce zero automatic retries and file-size/SSRF limits, and keep ordinary URL behavior unchanged.

## 4. Supplied UI Migration

- [x] 4.1 Add frontend source-contract tests for share text submission and the supplied modal's textarea, clear control, platform strip, behavior copy, and responsive layout.
- [x] 4.2 Mechanically port the supplied link-import UI into `KbUploadSourceDropdown.vue`, reuse TDesign icons/styles, and update all locale strings without adding platform selection.

## 5. Configuration and Verification

- [x] 5.1 Document `TIKHUB_API_KEY` in server-only credential metadata, require
  file-backed secrets in both Musuw production and staging overlays, and ensure
  it cannot enter frontend/public/generated runtime config or logs.
- [x] 5.2 Run targeted Go tests, frontend tests/typecheck/build, OpenSpec validation, and a bounded adversarial review; fix all current blockers.
