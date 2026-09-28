# Upgrade verification record

This record separates inherited-worktree evidence from post-upgrade evidence so
pre-existing failures are not misclassified as vendor-update regressions.

> **Current handoff:** [`docs/HANDOFF.md`](../../../../docs/HANDOFF.md) supersedes
> the historical first-version snapshot at the end of this file. It records the
> current deployed branch/ledger commit (`8e1c69c1`), generated-title correction
> (`b62ad6d9`), structural UI correction (`f092dfee`), Memory correction
> (`cd52965f`), the earlier exhaustive browser release (`a965a85...`), the
> current title-safe staging-only release, the explicit production hold, and the
> remaining Paddle matrix. The title corrective review found 0 current blockers
> and retained one pre-existing P1 follow-up: asynchronous generated-title
> completion may overwrite a concurrent manual rename (not introduced by this
> task). The fresh no-context reviewer passed with 0 blockers and one long-title
> follow-up that was subsequently addressed. Keep the evidence below as
> source-upgrade history; do not use its old implementation SHA or completion
> line as current deployment
> status.

## Pre-upgrade baseline

Source state: prefixed current-worktree audit tree
`fb468c34a8ed49142aee7f1aeaa0e81db2daa561`, before importing official target
`81142dfd17b2778087e95d3a317483a2fd909b91`.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Upgrade contract red phase | Expected failure | `npm run upgrade:contract`: 3/3 tests failed for the intended reasons: provenance still v0.7.2, appended migrations absent, and representative target modules absent. |
| Go route and Wiki handler focus | Pass | `cd weknora && go test ./internal/router ./internal/handler`; both packages passed, including inherited Lite gate and untracked Wiki graph handler tests. |
| Auth shell | Pass | `cd auth && npm test`; 6 files and 100 tests passed. |
| Workspace router + Obsidian graph focus | Pass | `cd weknora/frontend && npm test -- src/router/index.test.mjs src/views/knowledge/wiki/graph/*.test.ts`; 41 tests passed. |
| Storefront production build | Pass with size warning | Vite built the inherited storefront successfully. |
| Storefront tests | Pre-existing failure | 62 tests passed; `tests/responsiveLayout.test.js` failed because its required `max-width: 1080px` media block is absent from the inherited CSS. `tests/storefrontStructure.test.js` then retained a pending promise and the run was interrupted after 104 seconds. This state predates the kernel import and must be repaired before final acceptance. |
| Dependency installation | Completed | `npm ci` completed in `auth/`, `storefront/`, and `weknora/frontend/`. npm reported no auth vulnerabilities, four storefront advisories, and eight workspace-frontend advisories; dependency reconciliation and final audit remain pending. |

## Post-upgrade verification

The entries below are fresh runs against the composed working tree. Final
whole-product reruns and the committed-tree identity are appended during the
release gate; diagnostic failures are recorded instead of being hidden.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Fixed-source and migration contract | Pass | `npm run upgrade:contract` passes 4/4, including fixed commit/tree provenance, unique appended migration meanings, representative target capabilities, and high-risk Musuw auth/SaaS/storage/model-policy contracts. |
| Active source manifest | Pass | Fresh `node scripts/ci/source-manifest.mjs` reports 3,626 active source files and satisfies the fixed target floor of 3,284 files. `tracked-source-scan.mjs` reviews 4,087 tracked files and 96 approved binary assets. |
| Resolution ledger (final run) | Pass, zero blockers | `npm run upgrade:ledger` at ledger refresh commit `8e1c69c1` classifies the complete 1,601-path union (708 Musuw, 1,051 target, 158 overlap) with no missing, invalid, or unexplained exact-target replacement. |
| PostgreSQL existing database | Pass | Disposable `paradedb/paradedb:v0.22.2-pg17`: Musuw v93 migrated to v104 cleanly; tenant/session/message sentinel values survived and new artifacts/sandbox/memory/skills/env schema was present. |
| PostgreSQL fresh/retry path | Pass | Empty database reached clean v104; representative target and Musuw schema objects existed; v104 down then up returned to clean v104. |
| SQLite existing/fresh path | Pass | `go test ./internal/database` exercises a Musuw-v12 fixture and fresh history through v23, including `tenant_sandbox_configs`, `messages.artifacts`, and `sessions.sandbox_config_id`. |
| Backend focused security/data suites | Pass | Fresh `go test` runs pass for `internal/container`, `internal/sandbox`, `internal/types`, `internal/database`, `internal/router`, `internal/handler`, and the complete `internal/application/service` package. |
| Go full suite, vet and builds | Pass | Final `env -u LOG_FORMAT go test ./...`, `go vet ./...`, and `go build ./...` pass for the main module. The same test/vet/build sequence passes for CLI and Go SDK modules. AnyDoc-tagged test, vet and full build also pass. The first diagnostic run found and repaired a stale AES fixture, VPN synthetic-DNS assumptions, inherited log-capture behavior, and legacy skill-installer branding without weakening production encryption, SSRF, or logging policy. |
| CLI module | Pass | `go test ./...`, `go vet ./...`, and `go build ./...` pass after preserving the Musuw client's variadic resource-URL search contract in the target CLI interfaces. |
| Docreader | Pass | Python 3.12/uv CI runner passes 192 tests with 12 intentional tool/fixture skips. Port validation was moved ahead of DNS so an invalid port remains an invalid-port error under synthetic DNS. |
| Auth shell | Pass | `npm test` passes 100/100; production Vite build passes with explicit CI placeholder public/OAuth variables. Missing production variables still fail closed. |
| Storefront | Pass | `npm test` passes 63/63 and production Vite build passes. The inherited responsive assertion was aligned to the intentional 1023px breakpoint; the SSR fixture runs in a child process so Vite cannot retain the Node test runner. |
| Musuw WeKnora frontend | Pass | Final frontend baseline passes 955/955 tests, 11/11 i18n checks, type checking, and production build. The corrective Lite/Standard editor audit passes 98 focused tests: Lite deep links and validation redirects cannot expose hidden tabs, while Standard exposes the fixed-target settings. |
| Musuw product-policy defaults | Pass | Fresh current-tree run passes 1017/1017 frontend tests, 11/11 i18n checks, type checking and production build. New editor-created agents default image/audio attachment handling, web search/fetch and the existing Tool Configuration catalog on; existing agents retain saved values, while Sandbox, Skills, MCP and governed Memory are not implicitly enabled. |
| Structural settings-UI correction | Pass locally, in CI and on staging | Commit `f092dfee` rebuilds KB Basic/Advanced, personal/workspace Memory and Lite/Standard Agent settings on the existing Musuw `VisualSettingsShell`, left navigation, unboxed row grammar, header/divider/footer/scroll contracts and neutral switches. The current full frontend run passes 1017/1017 plus 11/11 i18n, type-check and production build; consolidated visual review reports P0/P1=0. The deployed `8e1c69c1` Lite-user pass verified KB Basic/Advanced, complete Memory basic/Advanced, reduced Agent navigation and light/dark layout. |
| Generated session-title safety | Pass, 0 current blockers; 1 pre-existing P1 follow-up | Commit `b62ad6d9` rejects multiline/URL/Markdown and overlong model output, falling back to the user's bounded first question. Browser session `cced5197-945e-4196-9dcd-dd1cf3e28ed2` returned a grounded answer with two document citations and, after reload, persisted `只根据选中的知识库回答：1）校准短语是什么` with no fake URL/Markdown. The title corrective review retained one pre-existing P1 follow-up: asynchronous generated-title completion may overwrite a concurrent manual rename (not introduced by this task). |
| Memory draft creation race | Pass locally, in CI and on staging | The original UI had no pending/re-entry guard: a slow first create looked inert, permitted a second submit, and its late response could clear a newer draft and show a stale success toast. Commit `cd52965f` serializes creation, disables draft controls while pending, and gates completion/error UI on the submitted draft's version/content/kind. The concurrent-create tests are included in the current 1017/1017 run. On deployed `72716632`, one click created exactly one `ORCHID CLOCK 5942` item (database count 1), while a second unsaved `SILVER LANTERN 8461` draft remained unchanged for 3.5 seconds without a stale toast, tab switch, or clear. |
| Wiki tool authorization corrective | Pass | Wiki reads retain the authorized search scope, while six mutation tools receive only request-local writable Wiki KB IDs. The caller identity comes from the authenticated session even when shared-agent execution overlays the context with the source tenant. Own-tenant Agent writes use a conservative role/creator rule; viewer, non-owner Contributor, unknown, and error scopes fail closed. Focused tests, `internal/application/service`, `internal/agent/tools`, `internal/handler/session`, `internal/sandbox`, and fresh `go test ./...`, `go vet ./...`, `go build ./...` pass. |
| Real-browser Agent failure path | Pass with local credential prerequisite | A fresh Chrome send against the isolated candidate reproduced the provider failure and now leaves a persistent Musuw `role=alert` card after the toast lifetime; timestamps and the question minimap also render after registering their wrapper components. The underlying request is rejected before provider inference because candidate lacks a dedicated TEST `OPENROUTER_MANAGEMENT_API_KEY`. Production/staging already mount that secret; no production/Default Workspace key was copied and entitlement was not bypassed. A successful local model answer still requires an isolated TEST OpenRouter workspace/key and corresponding disposable tenant child key. |
| DSH integration package | Pass | `npm ci`, typecheck, build, and 58/58 tests pass. A cold install of pinned `@deepseek-ai/dsh@0.1.0-rc.8` then passed all three real-harness scenarios: shipped env defaults, renamed profile override, and automatic visible-KB scope; each exercised search/read tool calls through mock WeKnora and produced a grounded answer. |
| AnyDoc native parser | Pass | Pinned source checksum/build, cargo audit, and `go test -tags anydoc ./internal/infrastructure/docparser/anydoc` pass. Audit reports only the pinned upstream warnings for unmaintained `ttf-parser` and yanked `chacha20`. |
| CI and production wiring | Pass | Workflow validator, root CI simulation, secret/credential scans, production and staging static verifiers, source manifest, and Dockerfile BuildKit checks pass. No nested WeKnora delivery workflow or parallel publisher is tracked. |
| Candidate image and existing-data runtime | Pass | BuildKit produced `weknora-v072-candidate-app:81142df` from the composed source with AnyDoc and the exact upstream revision label, plus the Musuw frontend/auth image. The isolated native stack started against the existing v0.7.2 PostgreSQL volume; direct and frontend-proxied health, UI/auth shell, OIDC PKCE binding cookie, clean migration 104, and absence of legacy services all passed `verify-runtime.sh`. A first module download ended on a transient proxy EOF and the cached retry completed. Real startup also found and fixed two candidate-only wiring defects: inherited production Langfuse enablement without local production keys, and missing public browser identity coordinates. Candidate tracing now stays disabled and its public identity uses the same fail-closed runtime seam as staging/production. |
| Artifact resource safety | Pass | Artifact collection now requires `SessionBoundedFileReader`; `SessionBoundManager` executes provider-side `head -c max+1` as the sandbox user and never falls back to an unbounded read. Tests cover a falsely advertised small file, provider argv/cap, oversize rejection, and sources without bounded capability. |
| Source corrective adversarial review | Pass, 0 current blockers; 1 pre-existing P1 follow-up | Review of the `cd52965f` Memory draft serialization fix and the prior corrective delta verified the Lite editor allow-list/deep-link behavior, mixed global/named sandbox leases, account-erasure transient-error handling, provider-side artifact bounds, and concurrent Memory create ownership. The title corrective review found 0 current blockers but retained one pre-existing P1 follow-up: asynchronous generated-title completion may overwrite a concurrent manual rename (not introduced by this task). Post-deploy read-only review verified the exact staging revision/digests, resource/data isolation and production preservation. The only other observation is inherited quick-answer `EventError` terminal behavior, unchanged from the checkpoint. |
| Remote staging/browser acceptance (`a965a85...`) | Pass for ordinary Lite flows | Fresh staging Viewer/owner sessions exercised document-only KB creation, AnyDoc DOCX/Markdown parsing/query/citations, automatic tags, full Memory settings and cross-session recall, chat/model/agent defaults, web retrieval, image OCR, audio ASR, and Lite-hidden Sandbox/Skills/Env surfaces; Musuw compact UI states remained intact. |
| Current corrective staging (`72716632`) | Pass, zero blockers | CI `33498204284` and staging-only deploy `33498781725` succeeded; production promote job `99827895863` was skipped. App digest is `sha256:9c851f4e84368b5f2bee1468a1a1cb4ef68e49ca565b288bde082c1aeb5bf40f`, frontend digest is `sha256:56fc7fe2c4fba097816a73ebc1626fee058a80311e7d5635d181ad8bcb8afe42`; staging init exited 0 and all services are healthy/running with restart 0 and no OOM, DB is `104|f`, and noindex, Paddle Sandbox, SearXNG, AnyDoc/R2 and isolation checks pass. Browser corrective smoke passed Memory creation/ownership, the existing two-document KB, real DeepSeek V4 Flash chat and memory recall. |
| Prior structural-corrective staging (`09b1bc0b`) | Pass, zero blockers | CI `33509979358` and staging-only deploy `33510660189` succeeded; the restricted production job was skipped. App digest is `sha256:6682abc73f912cd7629f7980ad446fca029d4b32da17414bdeb289a0bcfd6f12`, frontend digest is `sha256:3a021ce6729673c50658f85cec58a148fde24743344a2413e08a8baf065c5864`; the remote gate passed six-service health plus init, SearXNG, noindex, Sandbox config, isolated volumes/network and exact digest identity. Browser acceptance passed structural settings convergence, a fresh DeepSeek V4 Flash answer, a fresh AnyDoc-backed answer with document/web citations, hidden Sandbox/Skills/env deep-link fallback and exactly-one manual Memory creation followed by cleanup. |
| Current title-safe staging (`8e1c69c1`) | Pass, zero current blockers | CI `33524501266` and staging-only release `33525281345` succeeded; the restricted production job was skipped. App digest is `sha256:d703524041b19d06e99bdd9f6cc7cdbbf5a3d517a480b6645a8afa3859c01c0c`, frontend digest is `sha256:d455f424d1822a27acdeb13565313ee3d07d8cb66553e065de81d6240b0a6823`; independent storefront release `33525281393` succeeded. Migration `104|f`, health/init/digest/noindex/Sandbox and isolation gates passed. Browser session `cced5197-945e-4196-9dcd-dd1cf3e28ed2` returned the grounded two-citation answer and persisted `只根据选中的知识库回答：1）校准短语是什么` after reload without fake URL/Markdown. |
| Fresh no-context reviewer | Pass, 0 blockers; 1 follow-up | Task `01a05d3d-2155-78d0-aca4-a0056b7a8b8e` passed before the title correction; its one follow-up concerned long generated-title behavior and was subsequently addressed. |
| Creem Test cleanup | Complete, unrelated to current Paddle task | A retired Creem Test subscription auto-renewed $19 at `2026-09-01 19:17:33` Beijing; it was canceled and `CREEM_API_KEY` was removed/unset from shell startup. Musuw current billing is Paddle and production was untouched. |
| Local candidate model diagnosis | Pass with explicit local prerequisite | The isolated local candidate intentionally lacks a dedicated TEST `OPENROUTER_MANAGEMENT_API_KEY`, so the strict Musuw tenant-spend guard rejects inference before the provider call. This is not an upstream merge or model-default regression. Staging uses an independent test secret and fresh inference passed; no production/Default Workspace credential was copied or printed. |
| Paddle Sandbox acceptance | Partial | Sandbox public config/test token, three products/six recurring prices, exact 11-event destination, official transaction/cancellation simulations, portal-session/history API and related tests pass. Real checkout success/decline, upgrade, period-end/resume/recovery/dunning, entitlement/allowance and full hosted-portal browser actions remain untested. Tenant `10002` has a stale in-flight checkout operation as a follow-up; production Paddle Live was not touched. |
| Production preservation | Pass (read-only audit) | Production remains on old revision `ea614b077dc0b9fb7fbe742c8defee2e24bc8461` with PostgreSQL `93|f`, Paddle Live and its isolated resources; all nine container identities/start times remain old, restart 0 and no OOM. The `72716632`, `09b1bc0b` and current `8e1c69c1` production jobs were skipped and no promotion or mutation occurred. |

## Preservation decisions recorded during reconciliation

- Named workspace sandbox configurations are authoritative for provider
  identity, credentials, template, TTL, and private-network policy. Existing
  env-only deployments retain the deployment-wide Docker manager, image and
  timeout contract when no named config is selected. The old `local` host
  process mode is intentionally rejected because it executes model-authored
  code outside an isolation boundary.
- Session pinning uses the stable `-` global-default sentinel so old sessions
  remain bound to the compatible Docker backend across instances and restarts.
- Secret writes for tenant, API-key, sandbox, skill and user environment data
  fail closed without an exact 32-byte `SYSTEM_AES_KEY`; legacy reads remain
  tolerant so operators can migrate existing rows.
- Musuw lifecycle fences, PKCE/OIDC identity binding, Lite product gates,
  Paddle/account-erasure queues, entitlements, OpenRouter metering, R2/storage
  accounting, TikHub ingestion, hidden platform defaults, consumer model
  policy, reasoning/error fields, and redacted logging remain authoritative.
  Target memory, artifacts, skills, sandbox configs, auto-tagging and env-var
  capabilities are composed at those existing owners.
- The final product tree contains no nested delivery workflows: twelve
  official workflow paths remain absent (eight inherited Musuw deletions,
  including four target-modified paths, plus four target-only additions).
  Musuw root CI directly validates the CLI, Go SDK, AnyDoc, DSH package and
  pinned harness E2E, and runs the target lint policy without introducing a
  second publisher. No runtime source is excluded.
- The local candidate intentionally disables Langfuse because it never copies
  production tracing credentials. Production remains enabled and reads both
  keys from protected files. Candidate browser identity values remain public,
  are generated from the existing root-only auth input, and pass through the
  same strict frontend serializer used by staging and production.

## Historical first-version handoff (source-upgrade checkpoint)

- Branch: `codex/upgrade-weknora-main-81142df`.
- Implementation commit: `0746755d5300bf5c38df0dba6ddbb435a49646a7`;
  recoverable pre-import checkpoint: `4749954d26b1b113252b7be2183fdca396279076`.
- Fixed upstream: `81142dfd17b2778087e95d3a317483a2fd909b91`, tree
  `37eaafdd6c276d2d1ddffffe1f39f8b38fd7cc03`.
- Completion: 59/59 OpenSpec tasks (100%), every mandatory gate passed,
  consolidated current blockers 0. The implementation commit was verified
  from a clean working tree and `git fsck --full --no-dangling --no-reflogs`
  passed before this handoff record was added.
