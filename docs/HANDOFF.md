# Musuw current project handoff

**Audience:** a fresh reviewer with no prior task context.

**Snapshot:** 2026-09-04 (America/Phoenix). This is the single current
continuity document. Source, checked-in configuration, and the runbooks linked
below remain authoritative if this snapshot becomes stale.

## 1. Executive state

| Item | Current state |
| --- | --- |
| Repository | `estromeglovettgen-coder/musuw` |
| Primary branch | `main` |
| Fixed upstream | WeKnora `main` at `81142dfd17b2778087e95d3a317483a2fd909b91` |
| Checked implementation baseline | `1d215c338c59118b5f032a195edd424365802dfa` (`fix(billing): align plan copy with storefront`) |
| Account-erasure correction | `0a5f3fe3fd019c8425545708b9779114b8d592d3` |
| Current CI/deployed staging baseline | `1d215c338c59118b5f032a195edd424365802dfa` |
| Staging release | CI `33860306655`; automatic staging-only workflow `33860991149`; app digest `sha256:ae39e6354aa994c1671c15facf3021ce2d02419c055cef2e83f88669f9cda7db`; frontend digest `sha256:403a304f371151d757f1adab3abf4678b2cac676bd05c4f1f43269512218d0df`; six-service health, init, SearXNG, noindex, Sandbox public config, isolated volumes/network and exact-digest release record passed |
| Storefront release | `1d215c3`; workflow `33860991086` succeeded, including public alias, locale and auth-handoff smoke checks |
| Current source status | `1d215c3` is on `origin/main`, CI-green and deployed to staging; the subsequent handoff commit is documentation-only and may have a newer SHA |
| Production application | At the 2026-09-04 remote read-only check: source `886bd74a8619cecb0dc897295cd02cb9010eb72a`; app digest `sha256:ed1e35802e26aaefe543460529d0a08ce711a1c29c70568c67deaf23f6da65c0`; frontend digest `sha256:2b2d8feebd16a7fadea2792e0e58ce28c903f7d3bc1b6d384b29eaa89eba6933`; both containers running with restart count `0` |
| Production promotion | **Not performed.** The workflow named `Deploy production application` automatically runs in `staging-only` mode after CI; its production job is skipped unless an exact immutable release is deliberately promoted under the deployment contract |
| Paddle Sandbox lifecycle | **Partial**, with a verified immediate-cancellation slice described in §8 |

Do not infer deployment from a merge, successful CI, a workflow name, or a
generated artifact. A release is deployed only when the matching workflow and
remote runtime evidence say so. In particular, this handoff commit may be newer
than the implementation baseline because documentation is being refreshed
after the code change.

## 2. Read order and authority

Read these in order:

1. [`AGENTS.md`](../AGENTS.md) for repository rules and source ownership.
2. [`README.md`](../README.md) for the source/product map.
3. This file for the current implementation and operational state.
4. [`FULL_PRODUCT_ACCEPTANCE_CHECKLIST.md`](FULL_PRODUCT_ACCEPTANCE_CHECKLIST.md)
   for the durable scenario matrix and historical execution log.
5. [`DEPLOYMENT.md`](DEPLOYMENT.md) and
   [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md) for release mechanics.
6. [`SECRETS_AND_INTEGRATIONS.md`](SECRETS_AND_INTEGRATIONS.md) and
   [`external-credentials-registry.yaml`](external-credentials-registry.yaml)
   for provider ownership and safe secret handling.
7. [`PADDLE_LIVE_READINESS.md`](PADDLE_LIVE_READINESS.md) for the provider
   readiness checklist. Its dated facts are historical until freshly checked.
8. Active specifications in [`openspec/changes/`](../openspec/changes/).
9. [`third_party/weknora/upgrades/81142df/README.md`](../third_party/weknora/upgrades/81142df/README.md),
   its generated resolution ledger, summary, and verification report for the
   upstream merge provenance.

Screenshots, task-chat prose, old workflow names, and historical sections of
verification reports are evidence, not present-state authority. Do not create a
second dated handoff document.

## 3. Product boundary

Musuw Lite is a managed, consumer-facing, single-account experience. The
product assumptions that must stay coherent across frontend and backend are:

- one person owns one private tenant/workspace;
- authentication is managed OIDC; provider credentials stay server-side;
- the primary loop is chat, document knowledge bases, Wiki/graph exploration,
  and curated agents;
- Lite onboarding and language must not expose WeKnora organization/member
  concepts;
- `Standard` remains an internal/full-WeKnora compatibility surface, not the
  default consumer UI;
- hidden organization, member, sharing, BYOK, Sandbox, Skills, environment,
  shell, and artifact controls must not become reachable merely because their
  upstream implementation exists;
- server authorization, quota, billing, and capability guards are the
  authority. Hiding a control is not an authorization boundary.

`MUSUW_PRODUCT_EDITION=lite|standard` selects the edition. The server-side
`liteProductGate` is the Lite authority; frontend visibility is only the
presentation layer and must not be treated as route/API authorization.

The source is a curated merge of Musuw behavior and fixed upstream WeKnora,
not a small visual fork. Preserve the generated upgrade ledger whenever source
under `weknora/` changes.

The fixed-main upgrade audit compared every source-relevant Musuw difference
with upstream: 708 Musuw-changed paths, 1,051 target-changed paths, 158 overlaps
reviewed with three-way semantics, 893 target-only paths imported, and 1,601
paths in the final resolution union. The generated ledger currently has zero
unexplained blockers. PostgreSQL migration history extends through `104` and
SQLite through `23`; earlier Musuw migration meanings were preserved and new
upstream changes were appended rather than renumbered. Full upstream code for
Memory, agents/tools, MCP, Wiki/graph, parsers, storage, data sources, Sandbox,
Skills, environments and artifacts remains available for compatibility even
where Lite intentionally hides the management surface.

## 4. Runtime and module map

| Surface | Owning source / role |
| --- | --- |
| Public website | [`storefront/`](../storefront/) — homepage, pricing, public trust/legal/contact pages |
| Auth entry | [`auth/`](../auth/) — managed sign-in and callback surface |
| Application UI | [`weknora/frontend/`](../weknora/frontend/) — Lite chat, knowledge bases, agents, settings and billing |
| Application API/domain | [`weknora/internal/`](../weknora/internal/) — tenancy, documents, agents, quota, billing, memory, account erasure |
| External integrations | [`weknora/internal/infrastructure/`](../weknora/internal/infrastructure/), model, data-source and provider adapters |
| Release automation | [`.github/workflows/`](../.github/workflows/), [`scripts/`](../scripts/), and deployment runbooks |
| Primary state | PostgreSQL; Redis for runtime coordination/cache; R2-compatible object storage for uploaded originals |
| Retrieval pipeline | AnyDoc/document processing, embeddings, Neo4j graph/Wiki support and SearXNG where enabled |
| Commercial providers | Paddle for checkout/subscription state; OpenRouter/provider routing for metered model calls |

Do not collapse these into one deployment assumption: storefront, auth, app
frontend, app backend, workers, and external providers have separate health and
evidence boundaries.

## 5. Implemented user behavior

### 5.1 Knowledge bases and documents

- A new Lite knowledge base is prefilled as `我的知识库`; subsequent default names
  use the smallest available suffix, for example `我的知识库（2）`.
- The empty-state drop zone accepts drag-and-drop and click-to-upload, including
  the central upload icon/area.
- Document upload and webpage import are distinct actions and distinct
  onboarding targets.
- Document toolbar filters share a consistent visual contract. They use the
  application filter implementation, not the exact Settings-select DOM.
- Graph settings are not open on first entry, sit at the intended graph control
  location, and close when another graph interaction takes focus.
- A terminally failed document card reports failure. The separate historical
  attempt-timeline issue is intentionally deferred in §9.1.

### 5.2 Agents and chat defaults

- A new Lite agent is prefilled as `我的智能体`; subsequent default names receive
  `（2）`, `（3）`, and so on.
- New-agent description is empty.
- New Lite agents and the current bundled-agent catalog default to DeepSeek V4
  Flash rather than V4 Pro; Standard retains its compatibility fallback when
  that managed model is absent.
- A newly registered Lite user's home composer defaults to DeepSeek V4 Flash
  with reasoning off.
- The model name in the expanded composer overview is allowed to occupy the
  required width and is not replaced by an ellipsis. The compact bottom capsule
  remains a separate follow-up noted in §9.2.
- User messages used for provider/trace acceptance are ordinary neutral
  requests; tests must not coach the model toward the expected answer.
- Generated conversation titles use an atomic “update only if still empty”
  repository contract so a late generated title cannot overwrite a manual
  title written first.

### 5.3 Lite onboarding and shared UI

- The retained onboarding is based on upstream WeKnora's Driver.js flow, with
  hidden/non-Lite controls removed and Musuw consumer language substituted.
- The first knowledge-base flow highlights the centered empty-state create
  button and provides a default name so the final create action is immediately
  available.
- Inside a knowledge base, upload and webpage import are separate steps.
- Chat onboarding covers agent, model, and reasoning choices and makes paid
  availability visible without presenting organization/member concepts.
- Account menu rows, settings shell, selects, segmented controls, deletion
  confirmation, page headers/cards/backgrounds, and light/dark states received
  the current Musuw styling corrections.
- The upgrade-plan row includes its icon; the replay-tutorial question-mark
  affordance is absent because replay is unsupported.

### 5.4 Quota, billing and account lifecycle

- One tenant-scoped Pinia entitlement store supplies the sidebar account menu
  and the Settings usage view, preventing those surfaces from calculating
  different snapshots.
- Entitlements use stale-while-revalidate behavior: cached data renders
  immediately, prefetch starts before a menu is opened, and model completion,
  successful metered upload/import, payment return, and relevant settings/menu
  events trigger a background refresh.
- UI text shows the remaining allowance rather than a competing “used percent”
  figure. Backend quota enforcement and metering remain authoritative.
- Paddle webhook state, local entitlements and provider budget synchronization
  are separate contracts; all three must be checked in lifecycle acceptance.
- Account erasure clears tenant-owned chat, knowledge, processing, API-key and
  current Memory data in one repository transaction. Required audit/billing
  operation evidence is retained only in its minimized/anonymized form.
  External-provider cleanup follows the documented lifecycle rather than being
  inferred from the local transaction.

### 5.5 Public pricing, trust and contact

- The public homepage is the copy authority for marketed plan entitlements.
- The in-app Plans and Checkout surfaces now use the same active Chinese and
  English descriptions and feature lines as
  [`storefront/src/homepageMarketingRefresh.js`](../storefront/src/homepageMarketingRefresh.js):
  Free has `1 GiB 存储空间`, `1 个知识库（10 篇文档）`, `标准模型`, and
  `文档与网页导入`; paid plans use their storage tier, unlimited knowledge
  bases/documents, advanced models, and video/link import.
- The obsolete per-capability “one lowest-cost model” marketing bullet is not
  rendered on plan or checkout cards.
- This copy correction deliberately does **not** add or expand Korean/Russian
  translations. The active public marketing contract is Chinese/English.
- Public service terms, privacy, refund/cancellation, cookie, acceptable-use,
  security and contact pages exist under the storefront. Contact routes expose
  the configured support email and telephone action; secrets and payment-card
  data must never be requested by email.

## 6. Fresh verification for the current implementation

The following checks were freshly run against `1d215c3` before this handoff:

| Check | Result |
| --- | --- |
| `node --test src/views/billing/entitlementCopy.test.mjs` | PASS, 2/2 |
| `npm run check-i18n` | PASS, 11/11 |
| `npm run build-with-types` | PASS; TypeScript and production Vite build completed; only existing chunk-size warnings |
| `go test ./internal/application/repository -run 'TestAccountErasureRepository' -count=1` | PASS |
| `npm run upgrade:ledger` | PASS; 1,601 paths, 0 blockers |
| `npm run upgrade:contract` | PASS, 6/6 |

The billing copy regression test reads the active homepage source and asserts
that Plans/Checkout use those exact strings. It is a cross-surface contract,
not a duplicated expected-value fixture.

Useful rerun commands:

```bash
cd weknora/frontend
node --test src/views/billing/entitlementCopy.test.mjs
npm run check-i18n
npm run build-with-types

cd ..
go test ./internal/application/repository -run 'TestAccountErasureRepository' -count=1

cd ..
npm run upgrade:ledger
npm run upgrade:contract
```

CI for `1d215c3` is run `33860306655` and succeeded. Storefront workflow
`33860991086` and staging-only application workflow `33860991149` also
succeeded. These workflow results prove their recorded gates; they do not turn
the unrun checklist scenarios into `PASS-CURRENT`.

## 7. Deployment contract and observed environments

The immutable-release flow is defined in [`DEPLOYMENT.md`](DEPLOYMENT.md):

1. merge/push exact source;
2. pass CI;
3. build immutable app/frontend images;
4. deploy and accept staging;
5. promote those exact digests only through the restricted production path;
6. verify production health and rollback metadata.

At the last fresh probe, `musuw.com`, `www.musuw.com`, `app.musuw.com/health`,
`app.musuw.com/auth/start`, and `staging.musuw.com/health` returned HTTP 200.
Staging returned `X-Robots-Tag: noindex, nofollow`. Remote read-only inspection
showed production on `886bd74a`, running without container restarts. The later
staging workflow verified `1d215c3` against the exact digest pair recorded in
§1 and passed the isolated six-service gate. A database migration probe did not
complete and was interrupted; this handoff therefore makes no fresh
database-migration claim.

Never promote based solely on this paragraph. Resolve the exact candidate SHA,
workflow artifact, image digests, target environment, backup/rollback point and
post-deploy acceptance immediately before promotion.

## 8. Paddle lifecycle evidence and limits

The latest Sandbox slice verified:

- a Max subscription was created and immediately canceled in Paddle Sandbox;
- the signed cancellation notification was delivered once with HTTP 200;
- the application downgraded the account to Free/canceled, cleared the billing
  period and restored the 1 GiB storage entitlement;
- a later stale update was ignored;
- the OpenRouter budget target was recalculated to lifetime use plus the Free
  `400000` micro-USD allowance.

The browser entitlement JSON was not reread after cancellation because the
platform-admin API key used by the acceptance session had expired. This is
therefore useful lifecycle evidence but **not** a complete hosted end-to-end
Paddle acceptance. Do not mark the full lifecycle
complete until registration, free gates, top-up, metering/storage deltas,
upgrade, renewal/cancellation, webhook replay/idempotency, provider budget and
browser-visible entitlements are all freshly proven for one traceable account.
This acceptance slice did not touch Paddle Live. Any Live deployment/readiness
statement in the 2026-08-30 readiness document is dated historical evidence and
must be freshly verified before use.

## 9. Deliberately deferred items and evidence limits

### 9.1 Failed document attempt timeline

A document card could be terminally failed while an old processing-attempt
timeline still displayed `进行中`. Investigation found:

- the timeline component matched the fixed upstream source byte-for-byte;
- the original social/video import failed with provider/processing error and
  no automatic application retry;
- a later explicit reparse created a second attempt and completed;
- after completion, observed traffic was browser polling of the stale attempt's
  span endpoint, not repeated parser, TikHub, VLM or model work.

The displayed 45-minute duration was stale/orphan trace presentation, not
evidence of continuing compute consumption. The user explicitly deferred this
change. No timeline code was modified.

### 9.2 UI follow-ups not claimed as pixel-identical

- Knowledge-base filters share the intended look but are not a mechanical DOM
  transplant of the Settings `t-select` component.
- Knowledge-base and agent index pages share tokens and geometry but remain
  separate page modules; no current automated pixel-diff proves one-pixel DOM
  identity.
- The expanded model overview shows the full model name; the compact bottom
  composer capsule has its own overflow behavior.
- Chat onboarding highlights the selector and advances; it is not a nested
  interactive tour inside the selector.

These are follow-ups, not blockers for the final copy-only scope. Do not report
them as completed merely because related visual changes exist.

## 10. Safety and secret handling

- Never print, copy into documents, or commit credential values.
- Use the metadata-only integration registry to identify owners and variable
  names.
- Treat screenshots, browser storage, workflow logs and shell history as
  possible secret-bearing surfaces.
- Production data writes, billing mutations and deployment promotion require
  the exact scope and evidence demanded by their runbooks even when broad
  operator access is available.
- Preserve unrelated worktree changes. Use immutable commits/digests and record
  rollback points for deployments.

## 11. Protocol for a new no-context reviewer

The reviewer should:

1. read this document and every authority in §2;
2. inspect owning source/configuration for each material claim rather than
   trusting prose alone;
3. distinguish checked implementation, CI, staging and production states;
4. understand the Lite product boundary, runtime/module ownership, quota and
   billing contracts, current verification, Paddle evidence and deferred work;
5. make no code, configuration, provider, data or deployment change during the
   handoff review;
6. post a concise understanding/readiness summary and stop.

That final summary confirms knowledge transfer only. It is not a new acceptance
run and must not be represented as deployment or production proof.
