# Verification evidence

## 2026-08-24 production disposable E2E (current evidence)

- One fresh disposable account completed password sign-up once, confirmation
  once, authenticated-shell entry, logout once, and password re-login once;
  each shell transition succeeded. Credentials and identity values are omitted.
- One `Aurora Research Notes` knowledge base was created with a description.
  `aurora-observation-guide.md` and `aurora-maintenance-window.md` were each
  uploaded once; parsing, summaries, chunks, and indexes completed for both.
  The root directory remained present and displayed one direct file plus one
  first-level `Operations` folder. Expanded and collapsed sidebar states had
  identical root data.
- One public Terms webpage parsed successfully. One scoped retrieval answer
  was non-empty, exposed a knowledge citation, and its source drawer matched
  `aurora-observation-guide.md`.
- `aurora-observation-briefing.mp4` was uploaded once with no model override.
  One worker completed with retry count zero; parsing and summary completed,
  two chunks and two indexes were materialized, and the override relation was
  empty. The deployed model was `google/gemini-2.5-flash`. A video-bound
  answer was non-empty, exposed a knowledge citation, and its source drawer
  matched `aurora-observation-briefing.mp4`.
- Independent sessions for `Gemini 3.7 Flash` and `Claude Haiku 4.5` each
  returned a non-empty completed answer with error=false and pending=false.
- One native knowledge-base copy completed with source/target documents
  `3/3`, `Operations` folders `1/1`, chunks `34/34`, vectors `34/34`, URL
  documents `1/1`, and workers `3/3` with retry count zero. The copied
  knowledge base was then deleted once through the UI; active same-name
  knowledge bases changed from `2` to `1`. Database evidence reported one
  soft-deleted copy, zero active copied documents and chunks, terminal worker
  success=true, and worker errors=`0`. The surviving source retained four
  documents, 36 ready chunks, and 36 ready indexes; source unaffected=true.
  No new release claim is made here.
- Two readiness-only chats were deleted and two citation chats were retained.
  The original Aurora fixture, the disposable account, and the active Pro
  subscription remain intentionally retained. Account deletion=false.
- The account moved from Free to one monthly Plus checkout and one same-
  subscription native Pro update. Signed delivery groups were `3` and `2`;
  every delivery succeeded with attempt count `1`. Final plan state was active
  monthly Pro, credits available=true, the hosted billing portal opened
  read-only=true, and Live charge=false.

## Historical 2026-08-23 reviewer lifecycle (TEST Max baseline)

This block records the earlier TEST Max baseline. It is not the current
Production reviewer entitlement; the active reviewer path is Production Paddle
Sandbox Pro, and Paddle Live remains unauthorized. Its reviewer-account payment
evidence is retained only as history and is superseded by the stronger
same-account Free-to-Plus-to-Pro lifecycle below.

- Fresh real Supabase recovery flows completed in both TEST and Production:
  reset email accepted, Gmail recovery message opened, official Supabase
  recovery session established, `updateUser({ password })` succeeded, and a
  subsequent password-token sign-in succeeded in each project. The rotated
  password was written only to the approved macOS Keychain item. No email,
  OTP, recovery token, password, or secret is recorded here.
- TEST Max was activated only through Paddle Sandbox. Official transaction and
  subscription state reported a completed monthly Sandbox purchase and active
  Max entitlement; no Live charge, refund, fake webhook, SQL mutation, or
  manual plan override was used. The active Sandbox entitlement remains for
  reviewer access.
- Production and TEST reviewer fixtures were English-only. Production grounded
  retrieval/citation, source library, Wiki, and graph states were captured
  before cleanup. Four active storefront JPEGs were replaced with real DPR2
  captures at 3024x1898 and visually reviewed for English-only content and
  absence of account or credential data.
- Production Aurora fixture knowledge base and conversation were deleted via
  the authenticated product API. TEST guide/video documents, knowledge base,
  and temporary conversations were deleted via the product UI/API. Reviewer
  accounts and the active Sandbox Max subscription were retained.
- Fresh local checks passed: storefront `npm test` (51 tests), auth `npm test`
  (74 tests), frontend `npm test` (536 tests), frontend
  `npm run build-with-types`, targeted OpenRouter HTTP-402/tenant-key tests,
  `openspec validate --all --strict` (13 changes), and `git diff --check`.
- The full `go test ./...` sweep was also run. Core service, router, OpenRouter,
  VLM, and runtime packages passed; connector/model/security suites that resolve
  public domains failed because this runner maps them to the restricted
  `198.18.0.0/15` test range (plus a pre-existing Feishu summary-log assertion).
  The authoritative exact-SHA CI run passed the complete configured matrix;
  this local network gate is retained as a reproducibility note, not a release
  failure.

## 2026-08-23 consumer capability smoke

- Using the canonical TEST reviewer native OIDC session and the real consumer
  endpoints, Flash and Pro each returned a bounded non-empty English SSE
  answer with HTTP 200 and a completed stream.
- A high-reasoning request returned HTTP 200 with `thinking`, retrieval-tool,
  answer, and completion events. A KB-scoped retrieval request returned three
  evidence chunks and a non-empty answer through the supported consumer tool
  path.
- The temporary English knowledge base and all four smoke sessions were removed
  through the product API after the checks. The reviewer account and active
  Paddle Sandbox Max entitlement were retained.

## Release and public smoke baseline

- Exact-revision CI, Cloudflare storefront delivery, and immutable-GHCR server
  delivery each reached terminal success, and the public `/health` revision
  matched the release.
- Public English smoke returned 200 for the storefront root/contact and the
  app auth/platform/plans entry routes. The four active product image URLs
  returned 200 `image/jpeg` at 3024x1898 source scale; metadata probes found
  OG, Twitter, icon, and manifest references with no Musnow text.
- This documentation-only evidence sync is intentionally not committed or
  pushed by this task, so it makes no new release claim.

## Historical deferred gate (before the current Production Sandbox Pro smoke)

The earlier TEST video fixture reached the terminal provider-classified HTTP
402 / `DOCREADER_PARSE_FAILED` state even though the root wallet and tenant
allowance were not exhausted. That run exercised the historical Qwen fallback
and did not prove current video parsing or retrieval. The Tokyo default VLM was
then pinned to Gemini 2.5 Flash on the OpenRouter Google Vertex route. At this
boundary the no-override Production smoke was still pending; the current
recovery recorded below supersedes that provider blocker without adding a
service. The zero-config consumer model, reasoning, and retrieval checks remain
recorded in their dedicated verification file.

That historical gate did not make a claim for a future evidence-sync release.
This documentation-only sync remains uncommitted and undeployed as recorded
above.

## Historical final video gate (2026-08-23)

- Qwen original-fixture and tiny-video provider smokes both classified as HTTP
  402 while the observed wallet and tenant allowance were non-exhausted.
- Approved Gemini direct-route probes classified as HTTP 403 with temporary
  provider-management credentials; this did not establish a canonical app
  failure or success.
- One canonical TEST Max upload using the then-supported per-upload
  `builtin-openrouter-gemini-flash` override returned HTTP 200, then moved
  from `processing` to normalized `provider_error` failure at roughly two
  minutes. That catalog row was bound to Gemini 3.7 at the time, so the run is
  not Gemini 2.5 evidence; no video retrieval or citation success is claimed.
- The current default `builtin-openrouter-vlm` row was pinned to Gemini 2.5
  Flash for the Tokyo no-override path; at this historical boundary a fresh
  Production smoke was still pending.
- The documented Japan transport was unavailable. No recharge, new service,
  DNS/server change, fake event, or manual entitlement mutation was used, and
  all temporary video fixtures and conversations were cleaned up.

Reviewer tasks 5.4 and 5.6 and video task 4.3 were left unchecked at this
historical boundary. The current recovery below supersedes its provider-route
failure.

## 2026-08-23 current Production same-account lifecycle and reviewer fixture

- A fresh disposable Production password account was created through
  `/auth/start` → `Create account`. The generic confirmation flow completed
  once into the authenticated product shell; no identity or credential value is
  recorded here.
- The official `/auth/logout` route then cleared the session. Re-entering the
  same password credentials in the deployed auth shell restored the
  authenticated product shell. No email address, password, code, token, or user
  identifier is recorded here.
- The same account's authoritative entitlement initially reported Free. Exactly
  one Paddle Sandbox Plus monthly standard checkout then completed. Its exact
  signed initial delivery group—`subscription.created`,
  `subscription.activated`, and the initial `transaction.completed`—each
  reached delivered HTTP 2xx with `attempts=1`.
- The same subscription's official Pro preview returned HTTP 200 and its apply
  returned HTTP 202. The resulting signed `subscription.updated` and
  `transaction.completed` deliveries each reached HTTP 2xx with `attempts=1`;
  no browser response granted the plan.
- The final authoritative entitlement reported Pro, active, and monthly, with
  the required checkout/provider bindings and paid/credit periods present.
  Gemini 3.7 and Claude Haiku 4.5 were each exercised once in their first
  in-product UI proof; both completed with a non-empty answer, with neither an
  error nor a pending state remaining. The server-authorized Pro limits exposed
  the paid model and video paths. A following entitlement read reported
  `credits_status=available` and usable credits.
- This single confirmed account now supplies the stronger registration,
  re-login, Free baseline, checkout, signed-update, entitlement, and first paid
  model proof. Earlier reviewer-account payment evidence is historical only and
  no longer supplies current acceptance.
- In `Aurora Research Notes`, `aurora-observation-guide.md` and
  `aurora-maintenance-window.md` were each uploaded once. Both reached summary,
  chunk, and index completion. The bound chat prompt asking for the Northstar
  calibration phrase returned `ORBITAL SAGE 4826`, and the citation opened
  `aurora-observation-guide.md`.
- The English fictional MP4 was uploaded once to the same knowledge base with
  no per-upload model override. The process-override relation was empty, and
  the deployed default `builtin-openrouter-vlm` resolved to
  `google/gemini-2.5-flash` through OpenRouter's `google-vertex` route. Its
  initial processing lineage ended in `DOCREADER_PARSE_FAILED` with inner
  `openrouter_credits_exhausted` after four root attempts because the parent
  account had not yet met the provider's funding boundary. The child limit and
  remaining allowance were positive and within the configured plan.
- After the parent account satisfied that boundary, the same
  `aurora-observation-briefing.mp4` was not uploaded again. Retry
  parsing/Reparse was invoked exactly once through the product, the
  `process_overrides` relation remained empty, the recovery created exactly one
  new root task, and its worker retry count was zero.
- The no-override provider request returned HTTP 2xx and non-empty Markdown.
  Final state was `parse=completed`, `summary=completed`, and `pending=0`.
  DocReader, chunking, embedding, and post-processing were each `done`.
  Multimodal processing was `skipped` because there was no image subtask, which
  is expected for this video conversion. Chunks, the searchable index, and the
  summary were materialized.
- The bound Aurora question returned `after the second horizon scan`. Its
  citation button opened successfully and exposed the complete MP4 as the
  source.
- Reviewer tasks 5.4 and 5.6 and OpenRouter video task 4.2 now satisfy their
  exact wording. OpenRouter task 4.3 remains unchecked because its wording also
  requires cleanup, while the two Markdown sources, MP4, and related bound chat
  are intentionally retained as the ongoing Paddle reviewer fixture.
- No new-subscription cancellation or account deletion is claimed. Consumer
  task 4.13 therefore remains unchecked.

## 2026-08-23 Contact layout revision

- The live ClientHub reference was inspected at 3024x1898, 1291x782,
  1080x900, 767x1000, and 430x932. The implementation retains the Musuw
  header and uses the reference's centered max-width, two-column desktop
  composition, double-layer form shell, visible field labels, and single-column
  mobile breakpoint without copying reference branding or proprietary code.
- The rendered English Contact page now exposes a Contact Us pill, a Musuw
  product-specific headline, two grounded support reasons, and a keyboard-safe
  First name / Last name / Email / Message form. The form performs native
  required and email validation and opens an honest mail draft; it does not
  claim that Musuw sent a message. Operator, support, billing, privacy,
  security, and merchant-review details remain available in a lower-weight
  legal strip below the hero.
- No contact submission endpoint exists in the storefront contract, so no
  endpoint, database, mail provider, dependency, or fabricated delivery state
  was added. Real-render checks found no horizontal overflow, Chinese text, or
  obsolete route-card composition at the required viewports. Storefront
  `npm test` passed 52 tests and `npm run build` passed.
