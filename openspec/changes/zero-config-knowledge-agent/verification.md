# Verification evidence

## 2026-08-23 consumer capability acceptance

- The TEST canonical reviewer completed a native OIDC handoff and reached the
  authenticated consumer API. The check used the existing local TEST stack and
  the plan-approved `builtin-smart-reasoning` consumer agent; no hidden MCP or
  administrative capability was invoked.
- A temporary English-only knowledge base was created through the supported
  consumer API and populated from the repository reviewer fixture. The source
  reached the completed parse state before the model checks.
- Flash flow: `builtin-deepseek-v4-flash` returned HTTP 200, a closed SSE
  stream, five events, and non-empty answer content.
- Pro flow: `builtin-deepseek-v4-pro` returned HTTP 200, a closed SSE stream,
  five events, and non-empty answer content.
- Deep-thinking flow: a Flash request with `thinking=true` and
  `reasoning_effort=high` returned HTTP 200 and a closed stream containing the
  expected `thinking`, `tool_call`, `tool_result`, `answer`, and `complete`
  response types with non-empty answer content.
- Tool-capability flow: a KB-scoped English question returned HTTP 200 with
  `tool_call`/`tool_result` events, three retrieved evidence chunks, and
  non-empty answer content. This is the existing consumer retrieval/citation
  path, not an administrative tool surface.
- All temporary sessions and the temporary knowledge base were deleted through
  the authenticated product API (four session deletes returned 200; knowledge
  base delete returned 200 and a subsequent read returned 404). No account or
  active Sandbox Max entitlement was removed.

## Release evidence

- The preceding complete release was
  `42395dbf9df923bc75d841d694531102d7adc06c`. Its exact-SHA CI run was
  `32625412806`, Cloudflare storefront run `32625936901`, and immutable-GHCR
  server run `32625936888`; all reached terminal success.
- Public probes for that release returned healthy status from `/health`, 200
  from the auth and platform entry routes, and 200 `image/jpeg` for all four
  English DPR2 product captures. The storefront root contained no Chinese or
  obsolete Musnow text in the rendered HTML.

## Deferred provider gate

The native-video fixture remains intentionally unclaimed: the supported TEST
Qwen video path reached terminal provider-classified HTTP 402 /
`DOCREADER_PARSE_FAILED` despite non-exhausted wallet and tenant allowances.
No provider credit was purchased and no alternate service was added. Video
task 4.3 and the paid-fixture tasks remain unchecked until an approved route
can complete without changing that boundary.
