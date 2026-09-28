# Verification evidence

## 2026-08-24 production disposable E2E (current shell evidence)

- The authenticated shell completed one password sign-up/confirmation path,
  one logout, and one password re-login; each transition succeeded.
- `Aurora Research Notes` displayed a persistent root directory with one direct
  file and one first-level `Operations` folder. Sidebar expanded/collapsed
  data-equivalence=true, and one native knowledge-base copy preserved source /
  target documents `3/3`, folders `1/1`, chunks `34/34`, and vectors `34/34`.
- `Gemini 3.7 Flash` and `Claude Haiku 4.5` each completed one independent
  session with a non-empty answer, error=false, and pending=false. Two
  readiness-only chats were deleted; two citation chats remain retained.
- The separate one-copy knowledge base was deleted once through the UI; active
  same-name knowledge bases changed from `2` to `1`, the copy had zero active
  documents and chunks, and the surviving source retained four documents, 36
  ready chunks, and 36 ready indexes with source unaffected=true. No new
  release claim is made here.

## 2026-08-22 implementation verification

- The installed Codex Desktop bundle at
  `/Applications/ChatGPT.app/Contents/Resources/app.asar` was inspected
  read-only. Musuw reuses its compact interaction geometry without copying
  proprietary source or assets: a two-row overview, 280 px model menu,
  single-line selected check rows, and a 250 px scroll bound.
- Authentication keeps the existing Supabase/WeKnora runtime contract while
  replacing the checkbox gate with an adjacent continuation notice. The auth
  suite passed 48/48 tests, TypeScript type checking, and its production Vite
  build.
- The active Vue frontend passed 534/534 tests, `vue-tsc`, and a production
  Vite build. The focused Codex-style picker suite passed 4/4 after the final
  dark-mode correction.
- Strict OpenSpec validation passed for this change and the three active
  delivery changes.
- A consolidated adversarial review found no remaining P0/P1 blocker. Its one
  reproducible dark-mode trigger mismatch was corrected and locked by a
  focused regression assertion.

## Real Chrome layout evidence

- At 1440 x 900, the authentication card measured 408 px wide, was exactly
  centered, exposed one Google action and one email input, had two canonical
  legal links, no checkbox, and no horizontal overflow.
- At 390 x 844, the authentication card measured 358 px wide with 16 px side
  gutters, both primary actions retained 46 px targets, and no horizontal
  overflow occurred.
- The settings route rendered a full-height Codex-style 280 px sidebar plus a
  main pane at desktop width. Consumer Lite exposed exactly its three
  authorized sections and one settings search field.
- At 390 x 844, settings reflowed to the compact stacked navigation/content
  layout with no horizontal overflow.
- At 390 x 844, the chat picker overview contained exactly two 44 px rows. The
  model submenu measured 280 px wide, exposed 11 entitlement-filtered models,
  contained no search, provider groups, or explanatory copy, and scrolled
  internally rather than expanding the popup. The reasoning submenu used the
  same compact one-line/check contract.

## 2026-08-23 current deployed final-release closure

- Before this evidence-only sync, local `main` matched its canonical remote and
  the worktree was clean. The selected revision completed all seven CI jobs on
  the first run; Cloudflare storefront delivery and Tokyo production delivery
  then each reached terminal success.
- Tokyo's source pointer, source manifest, runtime and image labels, and
  immutable image references all matched the selected revision. Required
  containers and the Tunnel were healthy, and loopback plus public health,
  root, and auth probes returned HTTP 200.
- Both storefront domains returned HTTP 200. English and Chinese output rendered
  the exact footer `© 2026 musuw. All rights reserved.`; all eight public legal
  routes and the Merchant-of-Record, refund, cancellation, and buyer-support
  links were present and reachable. One first probe of the primary domain was
  transiently unsuccessful; its bounded retry returned HTTP 200 and every
  subsequent grouped probe passed, so it is not a release blocker.
- The already-recorded same-account Production lifecycle proves registration,
  logout and password re-login, authoritative Free, one Paddle Sandbox Plus
  checkout, the official same-subscription Pro update, paid model access,
  knowledge parsing and cited retrieval, and one no-override video reparse
  through indexing, retrieval, and an opened source citation. Paddle remains one
  complete Sandbox unit; runtime sensitive-file permissions and read-only mounts
  passed their release checks.

Task 4.2 now satisfies its exact release and lifecycle wording. The retained
reviewer fixtures, consumer account/data deletion, public support phone, and
Alibaba control-plane receipt remain governed by their separate unchecked or
open boundaries.
