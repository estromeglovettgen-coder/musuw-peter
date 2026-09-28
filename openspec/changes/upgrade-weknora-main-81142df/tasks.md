## 1. Establish the audited upgrade baseline

- [x] 1.1 Verify the official v0.7.2 and `81142dfd17b2778087e95d3a317483a2fd909b91` commit identities and trees in local Git objects.
- [x] 1.2 Generate a path-level current-worktree delta ledger against official v0.7.2, including non-ignored untracked source and content hashes.
- [x] 1.3 Generate the official v0.7.2-to-target path ledger and classify every local path as local-only or overlapping.
- [x] 1.4 Review all local delta categories and document that named examples are not a preservation whitelist.
- [x] 1.5 Add a failing preservation/upgrade contract test at the narrowest stable seam before importing the target.
- [x] 1.6 Run focused inherited-worktree tests for the dirty Musuw changes and record any pre-existing failures.
- [x] 1.7 Create a recoverable checkpoint commit containing the complete inherited Musuw worktree and baseline audit.

## 2. Mechanically import the fixed upstream tree

- [x] 2.1 Produce the exact official v0.7.2-to-target binary patch with blob identities and apply it under `weknora/` using three-way semantics.
- [x] 2.2 Resolve every textual or modify/delete conflict using the Musuw-first preservation hierarchy.
- [x] 2.3 Review every clean auto-merged overlap for syntactic and semantic composition rather than trusting conflict-free status.
- [x] 2.4 Confirm every local-only pre-upgrade add, modification, deletion, and rename remains represented.
- [x] 2.5 Record a per-path final resolution and evidence for every overlapping or intentionally replaced Musuw delta.
- [x] 2.6 Confirm all upstream-only target paths are imported or record a product-compatible reason for any deliberate exclusion.
- [x] 2.7 Update active source provenance, license notices, source manifests, version references, and operator-facing upgrade record to the fixed commit.

## 3. Reconcile database and persisted-data contracts

- [x] 3.1 Preserve Musuw PostgreSQL migration versions 80-93 and import upstream migrations 80-90 in original order as unique appended versions 94-104.
- [x] 3.2 Update migration-number references and add a contract test proving unique ordered up/down pairs and stable Musuw version meanings.
- [x] 3.3 Preserve Musuw SQLite migrations 3-12, append colliding upstream SQLite changes after version 12 in dependency order, and merge empty initialization so it contains all required Musuw and upstream schema/data defaults.
- [x] 3.4 Reconcile MySQL and ParadeDB initialization/migration assets without dropping either product or upstream objects.
- [x] 3.5 Verify PostgreSQL at Musuw version 93 and SQLite at Musuw version 12 upgrade cleanly to their appended latest versions with representative existing data intact.
- [x] 3.6 Verify a fresh empty supported database applies the complete combined migration history and reaches a clean latest version.
- [x] 3.7 Verify migration retry/inspection and application repository consumers for the newly imported schema.

## 4. Reconcile backend product semantics and upstream capabilities

- [x] 4.1 Reconcile route registration and middleware so all new routes retain Musuw authentication, tenant, permission, product-gate, and hidden-rule semantics.
- [x] 4.2 Reconcile Musuw SaaS, billing, plan, entitlement, quota, complimentary-access, and account-lifecycle behavior with new upstream types and handlers.
- [x] 4.3 Reconcile managed model catalogs, paid-model selection, credential redaction, provider transports, and model usage accounting.
- [x] 4.4 Reconcile R2/original-file storage ownership, storage quotas, signed access, source-usage accounting, and upstream storage abstractions.
- [x] 4.5 Reconcile document ingestion, parsing, Wiki/Obsidian graph data, folders, tags, metadata, revisions, and background processing.
- [x] 4.6 Integrate upstream agent skills, sandbox, memory, artifacts, auto-tag, environment-variable, and related settings through existing owning modules.
- [x] 4.7 Reconcile sessions, streaming, retrieval, MCP, connectors, IM integrations, audit/operations routes, and scheduled/background jobs.
- [x] 4.8 Reconcile generated client/DTO/docs contracts and prove new backend outputs are consumed by their intended caller.
- [x] 4.9 Add or retain focused behavior tests for every high-risk merged backend interface and regression found during reconciliation.

## 5. Reconcile Musuw frontend, independent surfaces, and interaction defaults

- [x] 5.1 Adopt the target frontend dependency and build configuration changes while retaining all Musuw dependencies and generated assets.
- [x] 5.2 Reconcile frontend routes, auth/session state, request handling, command palette, menu defaults, and route visibility rules.
- [x] 5.3 Reconcile knowledge, document, Wiki/Obsidian graph, folder, tag, preview, and ingestion UI with new upstream contracts.
- [x] 5.4 Reconcile chat, streaming progress, artifacts, memory, skills, sandbox, model selection, usage, and agent UI.
- [x] 5.5 Expose compatible new settings through existing Musuw settings surfaces and intentionally gate or hide unsupported controls with recorded rationale.
- [x] 5.6 Preserve Musuw visual tokens, layout, responsive behavior, empty/loading/error states, and interaction defaults across all merged upstream views.
- [x] 5.7 Reconcile all supported locale keys and verify no user-visible key regressions or untranslated target controls.
- [x] 5.8 Preserve and verify the independent Musuw auth shell and public storefront behavior, build wiring, and visual authority.
- [x] 5.9 Add or retain focused frontend contract tests for high-risk merged routes, gates, graph behavior, settings, and interactions.

## 6. Reconcile runtimes, tooling, and auxiliary modules

- [x] 6.1 Reconcile Go modules/toolchain, generated code, formatters, linters, and build tags required by the fixed target.
- [x] 6.2 Reconcile Python docreader dependencies/runtime and verify the target DOCX table-content behavior.
- [x] 6.3 Reconcile the WeKnora CLI/client wire contract and run the CLI module's required tests, vet, and build.
- [x] 6.4 Reconcile Dockerfiles, Compose files, health checks, environment examples, entrypoints, and host-mode scripts with Musuw deployment contracts.
- [x] 6.5 Reconcile bundled skills, website/API docs, embedded assets, third-party sources, and generated manifests required by runtime consumers.
- [x] 6.6 Scan committed configuration and generated artifacts for accidental credentials or production secret values.

## 7. Verify the complete product

- [x] 7.1 Run formatting, static analysis, and focused Go tests for every touched backend package.
- [x] 7.2 Run the full feasible WeKnora Go test suite and compile the server/application binaries.
- [x] 7.3 Run frontend unit/contract tests, type checking, linting, and production build.
- [x] 7.4 Run auth-shell and storefront tests, type checking/linting where configured, and production builds.
- [x] 7.5 Run docreader and CLI tests/builds plus any target-specific package suites introduced upstream.
- [x] 7.6 Build the actual Musuw local/preview runtime targets and perform host-mode smoke acceptance for auth, workspace load, core API, and frontend assets.
- [x] 7.7 Exercise representative normal, unauthorized/hidden, quota/entitlement, failure, and recovery paths for the merged product.
- [x] 7.8 Regenerate the final preservation ledger and verify no unexplained pre-upgrade Musuw delta or target upstream path is missing.
- [x] 7.9 Perform one consolidated adversarial review of preservation, contracts, migrations, security, UI states, downstream consumption, runtime, and rollback.
- [x] 7.10 Fix all current blockers, rerun affected verification, and record only genuine non-blocking follow-ups or environment-gated residual risk.

## 8. Complete and commit the first version

- [x] 8.1 Validate the OpenSpec change and map every requirement/scenario to implementation and fresh evidence.
- [x] 8.2 Calculate first-version completion from tasks and mandatory gates, confirming at least 99% with no masked blocker.
- [x] 8.3 Review the final staged diff, status, provenance, and secret scan, then commit all upgrade results on `codex/upgrade-weknora-main-81142df`.
- [x] 8.4 Verify the branch commit, clean working tree, fixed upstream identity, and concise handoff record.
