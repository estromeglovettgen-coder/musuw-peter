# Verification evidence

## 2026-09-07 AI titles, official platform icons, and final production acceptance

- Main revision `d648c90c` combines PR #37 (generate a concise document title in
  the existing summary-model call) and PR #38 (six distinct official platform
  icons for Instagram, X, Xiaohongshu, Douyin, TikTok, and YouTube). No extra
  title-model request, media adapter, fallback router, or transcode service was
  added. The import dialog retains both the supported-input hint and the
  ownership/private-index usage notice.
- CI run `34082332110` and isolated staging run `34083073845` completed
  successfully for the exact immutable revision. The staging browser displayed
  all six labelled icon cards and both compliance paragraphs in light and dark
  themes.
- A fresh staging Wiki knowledge base
  `42d01af1-fca5-4825-b01a-b5c182946f14` imported the original Douyin image-post
  short link through the product UI after deployment. New knowledge
  `9e454abc-7da4-426b-b274-1d9e8a6afb8c` materialized as a 434-byte Markdown
  document with seven images, one ready chunk, and the generated title
  `夕阳图集配文与视觉分享`. Parsing and summary completed with no pending tasks or
  error. The root, document reader, chunking, embedding, seven-image multimodal,
  summary, and Wiki spans all completed. The result produced five source-backed
  Wiki pages plus the index, four links, zero orphans, and a complete 6/6-node
  graph.
- On the same deployed staging revision, the retained cross-platform regression
  knowledge base `f97bb5ad-423b-468a-92dd-64fd6e7363a1` remained green for nine
  independent rows: YouTube; Instagram image and video; X image and video;
  Douyin image and video; and Xiaohongshu image and video. Every row had parsing
  and summary completed, pending count zero, a blank error, and ready chunks.
  Its Wiki/graph had 71 pages, 189 links, zero orphans, and no pending task.
- Production promotion run `34084084181` reused the accepted immutable staging
  image pair and completed through the restricted `server-production` seam.
  Its release manifest records application digest
  `sha256:2b6c4d9feb4a902ef8f2a984d4a11752fc0ea6d5261bb45d63af3262b949ab91`
  and frontend digest
  `sha256:183af582e54263501e6d9cff2230d64d8a0c85ea4a6630614f09708f04b380de`.
  Both healthy Tokyo production containers expose revision `d648c90c`,
  `/health` returns `status=ok`, and the homepage and authentication entrypoint
  return HTTP 200.
  The production browser displayed the same six icon cards and both compliance
  paragraphs. The retained Douyin image-post row
  `3835621c-5c29-4c0b-86db-636ee4e3721e` was reparsed once after its old caption
  title was reset to the source URL; the deployed summary call generated
  `关于相遇与承诺的图文分享`. Parsing, summary, and Wiki completed with pending
  count zero, a blank error, a done root span, and no failed span.
- The final production knowledge base
  `a8967560-fa43-4d87-a26c-9f95c3439861` contains ten completed rows: the eight
  requested social inputs plus local JPG and MP4 uploads. All ten have completed
  parsing and summaries, zero pending tasks, blank errors, and 49 chunks in
  total. Its Wiki has 91 pages and 353 current page links after the Douyin
  reparse; the graph UI displays all 91/91 nodes, and Wiki reports no pending
  task or issue.
- This proves the supported final state, not mathematical first-attempt uptime
  for third-party services. Earlier concurrent requests observed recoverable
  TikHub HTTP 400 responses, an Instagram V2 contract mismatch fixed by the
  official V3 endpoint, and a provider HTTP 429 recovered by the existing
  bounded retry. No unstable alternate provider or product-specific retry maze
  was introduced.

## 2026-09-07 deployed Qwen/Instagram-V3 acceptance (production matrix complete)

- Main revision `595c5a30` contains PR #34 (Qwen URL-based video ingestion) and
  PR #35 (TikHub Instagram V2→V3). CI, staging delivery, and production
  promotion are recorded by runs `34073985165`, `34074604558`, and
  `34075907013`, respectively.
- Staging real-link checks passed for the retained Xiaohongshu video and the
  Instagram share fixture: provider materialization, Qwen video analysis or
  image resolution, parsing, summaries, and Wiki/graph generation completed.
  The Instagram route now sends only the parsed shortcode as V3 `code` and
  normalizes the documented `items`, `caption.text`, `video_versions`,
  `image_versions2`, and image-only `carousel_media` fields.
- Production browser acceptance completed in KB
  `a8967560-fa43-4d87-a26c-9f95c3439861`. The eight social inputs are retained
  as knowledge rows: XHS video `0181f366-28db-496f-9c50-da766813b06d`, XHS
  image `f9f96ea4-ccaf-46ac-84db-0e6113e37a88`, Douyin image
  `3835621c-5c29-4c0b-86db-636ee4e3721e`, Douyin video
  `317752fd-3c46-40d2-be7f-962bc1269dfb`, X video
  `7b0db5a7-890d-4836-9ed0-6a23f0911ead`, X image
  `0555359a-c433-4277-8593-d79b58f8e8c8`, YouTube
  `70644bf6-18ed-4acb-835d-76a245b199de`, and Instagram
  `f4df6f34-98c5-42ff-b567-5736abc5ca28`. All eight social rows and the local
  JPG and MP4 rows are terminal `parse_status=completed`, `summary=completed`,
  and root `done`, with no bad spans. Instagram completed at
  `2026-09-07T10:30:07+08`, materialized a 10,544,836-byte MP4 titled
  `国家地理“地球月”企鹅特别节目预告片`, and produced four chunks. The local
  JPG and MP4 rows are
  `b0907230-8566-43c4-9793-ef8e39380788` and
  `46f6326d-c773-4cb3-a72b-b1c5155fc2ea`.
- The completed 10-row matrix produced 49 chunks, 10 published summary slugs,
  and an untruncated Wiki/graph result with 91 Wiki pages (41 concept, 39
  entity, 1 index, 10 summary), 91 graph nodes, and 365 edges.
- The first concurrent production TikHub batch exposed upstream HTTP 400
  responses on some social routes. TikHub documents HTTP 400 as including
  provider-side internal errors. The existing bounded retry recovered the XHS
  materializations; Instagram V2 remained failed until the official V3 endpoint
  was deployed and the same row was reparsed. This is not evidence that every
  first concurrent request succeeds, and no extra adapter, transcode service,
  automatic fallback, or model router was added.
- Task 4.3 is complete: the staging XHS gate, immutable promotion, and the
  paid production social/local matrix all reached their required terminal
  states with downstream Wiki/graph evidence.

## 2026-08-24 production disposable E2E (current video evidence)

- `aurora-observation-briefing.mp4` was uploaded once through the default
  no-override path. One worker completed with retry count zero; parsing and
  summary completed, two chunks and two indexes were materialized, and the
  override relation was empty.
- The deployed video model was `google/gemini-2.5-flash`. A video-bound answer
  was non-empty, exposed a knowledge citation, and its source drawer matched
  `aurora-observation-briefing.mp4`.
- The corresponding reviewer knowledge base and citation chat are intentionally
  retained. The separate one-copy knowledge base was deleted once through the
  UI; active same-name knowledge bases changed from `2` to `1`, the copy had
  zero active documents and chunks, and the surviving source retained four
  documents, 36 ready chunks, and 36 ready indexes with source unaffected=true.
  This does not claim cleanup of the intentionally retained video fixture or a
  new release.

## 2026-08-23 typed credit propagation repair

- A deterministic red-first worker-boundary test used the real
  `ProcessDocument` video path and existing OpenRouter credit middleware. The
  typed credit error reached video failure persistence, then became a plain
  formatted error; `errors.As` failed and the middleware could not return
  `SkipRetry`.
- Video failure wrapping now uses `%w`, while `failKnowledge` uses the same
  formatted error for both its persisted message and returned cause. The test
  is green for the typed cause and `errors.Is(asynq.SkipRetry)` and confirms the
  existing failed row, credit message, OpenRouter root code, and
  `DOCREADER_PARSE_FAILED` document-stage code remain stable.
- Focused and complete router, OpenRouter transport, VLM native-video, and
  complete application service tests pass locally without contacting
  OpenRouter. The server build, strict validation of all configured OpenSpec
  changes, and diff whitespace check also pass.

## 2026-08-23 Tokyo default-route contract repair

- The consumer video path resolves `types.PlatformKnowledgeBaseVLMModelID`
  (`builtin-openrouter-vlm`) without a per-upload override. Its catalog contract
  now pins the exact model `google/gemini-2.5-flash`, matching display and
  description metadata, while the remote video transport pins its provider to
  `google-vertex`.
- The paid chat catalog row `builtin-openrouter-gemini-flash` intentionally
  remains the separate Gemini 3.7 chat choice; it is not the default video
  model and was not changed by this repair.
- The focused catalog contract was red against the previous Qwen VLLM row and
  green after the Gemini mapping was restored. Remote VLM video routing and
  process-configuration tests also pass.
- At that contract snapshot, a real Tokyo production upload without an override
  was still required before marking the regional video and reviewer lifecycle
  gates complete; the current smoke is recorded below.

## Historical 2026-08-23 initial Production no-override failure boundary

- The active reviewer tenant was on the server-authorized Production Paddle
  Sandbox Pro path. Paddle Live remained unauthorized and was not used.
- One English fictional MP4 was uploaded once to the bound reviewer knowledge
  base with no per-upload model override. The process-override relation was
  empty, and the default `builtin-openrouter-vlm` resolved to
  `google/gemini-2.5-flash` through the OpenRouter `google-vertex` route.
- The document ended in `DOCREADER_PARSE_FAILED` with inner
  `openrouter_credits_exhausted`. Four automatic worker attempts processed the
  same upload. The parent balance was positive but below the provider's required
  funding boundary, while the child limit and remaining allowance were positive
  and within the configured plan; activity exposed no failure reason.
- This was a provider-credit failure, not a successful video lifecycle. Tasks
  4.2 and 4.3 were left unchecked at that boundary. The later recovery below
  resolves the provider failure without replacing or uploading the source
  again.

## 2026-08-23 Production recovery through the default route

- The OpenRouter parent account later satisfied the provider's required funding
  boundary. The existing `aurora-observation-briefing.mp4` was not uploaded
  again; the product's Retry parsing/Reparse action was invoked exactly once on
  that same failed item, and its `process_overrides` relation remained empty.
- The historical first processing lineage retained four root attempts. The
  recovery created exactly one new root task, and the worker reported retry
  count zero for that task.
- The provider request used the deployed default `builtin-openrouter-vlm` →
  `google/gemini-2.5-flash` mapping through OpenRouter's `google-vertex` route,
  with no override. It returned HTTP 2xx and non-empty Markdown.
- Final state was `parse=completed`, `summary=completed`, and `pending=0`.
  DocReader, chunking, embedding, and post-processing were each `done`;
  multimodal processing was `skipped` because this video conversion produced no
  image subtask, which is the expected path. Chunks, the searchable index, and
  the summary were all materialized.
- In the knowledge-base-bound chat, the real fixture question returned `after
  the second horizon scan`. Its citation control opened successfully and showed
  the complete MP4 as the source.
- Task 4.2 is complete because both its focused catalog checks and its real
  bounded default-path Gemini request are now proven. Task 4.3 remains unchecked
  because its exact wording also requires cleanup: the MP4 and its reviewer chat
  are intentionally retained for Paddle review rather than deleted.

## Historical 2026-08-22 Hong Kong regional fallback

- OpenRouter's live model catalog reports `qwen/qwen3.7-flash` with native
  `text`, `image`, and `video` input modalities.
- OpenRouter's live endpoint catalog reports an Alibaba endpoint for that exact
  model. The application therefore keeps its existing OpenRouter transport and
  tenant-credit metering while routing Qwen to provider tag `alibaba`.
- The exact Gemini 2.5 Flash to `google-vertex` route remains allowlisted for a
  later Japan-host recheck; it is not the active built-in VLM in this release.
- Focused VLM, built-in catalog, and video-ingestion Go tests passed after the
  Qwen switch.
- A real 46,009-byte, three-second MP4 completed the TEST browser lifecycle:
  native upload, Qwen video summary, indexing, retrieval, exact answer
  `CODE COBALT 7319`, and product-UI knowledge-base cleanup.

Official evidence:

- <https://openrouter.ai/api/v1/models>
- <https://openrouter.ai/api/v1/models/qwen/qwen3.7-flash/endpoints>
- <https://openrouter.ai/docs/guides/overview/multimodal/videos>
- <https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions>

At that historical point, Production paid-term and post-deploy evidence was
still tracked by task 4.3.

## Historical 2026-08-23 final approved-route gate

- Two bounded Qwen native-video smokes (the reviewer fixture and a 1.5-second
  English MP4) reached the provider's HTTP 402 classification. The observed
  wallet and tenant allowance were not exhausted; no credit purchase, retry
  loop, alternate service, fake event, or manual entitlement mutation was
  used.
- Direct probes of the approved Gemini video routes returned HTTP 403 from
  temporary provider-management credentials. This is not treated as
  canonical consumer-path evidence.
- The canonical TEST consumer path was then exercised once with a fresh
  official OIDC session, a temporary English knowledge base, and the
  per-upload `builtin-openrouter-gemini-flash` override. Upload returned HTTP
  200, but polling reached `processing` and then the normalized
  `provider_error` failure at about two minutes; at that release the override
  row was incorrectly bound to Gemini 3.7, so this run is not evidence for
  Gemini 2.5 and no retrieval success is claimed.
- The documented Japan transport/SSH target was unavailable, so no DNS,
  server, or new provider path was added. All temporary knowledge bases,
  documents, and conversations from these checks were removed through the
  authenticated product capability.

At this historical boundary, tasks 4.3, 5.4, and 5.6 were left unchecked. The
current default-route recovery above supersedes the provider blocker without
changing the no-new-service boundary.

## Historical 2026-08-23 TEST reviewer gate

- A fresh English H.264/AAC MP4 was uploaded through the real TEST Max browser
  flow. The document reached the terminal `DOCREADER_PARSE_FAILED` state after
  the supported reparse/recovery path was exercised once.
- The first non-wrapper failure was the existing OpenRouter transport's HTTP
  402 credit-exhaustion classification on the native-video request. The root
  OpenRouter wallet and the tenant Max allowance were both available; no
  recharge, provider change, fake event, SQL edit, or repeated reparse was
  performed.
- At the time of this run Qwen 3.7 Flash was the configured OpenRouter/Alibaba
  fallback and its catalog metadata advertised video input. The result is
  historical external-provider evidence, not current Tokyo default-route
  evidence.
- The video item, TEST reviewer knowledge base, and temporary conversations
  were removed through the product capability after evidence capture. This was
  a historical residual risk; the later Production default-route recovery above
  resolved the provider-path failure.

## 2026-08-23 current deployed typed-error evidence

- The selected production revision completed all seven CI jobs on the first run,
  then reached terminal success through Cloudflare storefront and Tokyo
  production delivery.
- The typed video failure contract is true at all three required boundaries:
  source inspection finds the `%w` wrap, the focused behavior test preserves the
  provider cause through failure persistence and reaches `SkipRetry`, and the
  deployed application binary contains the corrected wrapping literal.
- The earlier same-item, no-override Production reparse remains the real video
  lifecycle evidence: parsing, indexing, retrieval, and the opened MP4 citation
  completed through the deployed default route.
- Task 4.3 remains unchecked because its exact wording also requires cleanup;
  the reviewer Markdown sources, MP4, and bound chat are intentionally retained.
