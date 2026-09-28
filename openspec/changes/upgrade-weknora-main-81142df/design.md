## Context

The repository contains the complete official WeKnora v0.7.2 tree under `weknora/`, followed by a large, intentional Musuw product delta. The current worktree adds further uncommitted Musuw source. Official commit `81142dfd17b2778087e95d3a317483a2fd909b91` is 1,051 changed paths beyond v0.7.2, while the current Musuw kernel differs from v0.7.2 on hundreds of tracked and untracked paths. Those sets overlap in core HTTP, data, background-task, model, agent, document, frontend, configuration, and migration modules.

The v0.7.2 versioned PostgreSQL migration chain ends at 79. Musuw already owns versions 80 through 93, while the requested upstream commit independently owns versions 80 through 90. Musuw's SQLite chain similarly owns versions 3 through 12 while upstream independently reuses those versions. Filename replacement or a naive vendor copy would therefore corrupt the meaning of existing migration histories. The same upstream source also introduces large generated, dependency, CLI, frontend, sandbox, memory, skill, connector, and document-reader changes.

Musuw is the product authority. All current differences are presumed intentional, regardless of whether the user listed the affected capability as an example. WeKnora remains the implementation authority for upstream capabilities, so the upgrade must deepen existing modules rather than add a parallel runtime or duplicate interface.

## Goals / Non-Goals

**Goals:**

- Import exactly the requested official commit and retain a reproducible provenance record.
- Account for every source-relevant current-worktree difference from official v0.7.2 before the import.
- Preserve all intentional Musuw semantics while accepting additive and semantically compatible upstream implementation improvements.
- Integrate upstream capabilities at the existing owning module and interface, including their real downstream consumers.
- Preserve existing database histories and support empty initialization with one unambiguous migration chain.
- Complete fresh tests, builds, migration checks, and local product acceptance, then commit the result on the requested branch.
- Produce a first-version completion score of at least 99% from explicit OpenSpec tasks and verification gates, with any residual item documented and non-blocking.

**Non-Goals:**

- Rebrand Musuw as upstream WeKnora or restore upstream login/product assumptions over Musuw's product contract.
- Replace existing Musuw behavior merely because it was not named in the request.
- Introduce a second API, authentication system, billing path, storage path, settings architecture, frontend runtime, or migration runner.
- Deploy or promote the branch to production as part of local upgrade acceptance.
- Redesign unrelated Musuw features or pre-build abstractions for possible future upstream changes.

## Decisions

### 1. Use official v0.7.2 as the merge base and the current worktree as Musuw's complete side

Fetch both official commits into local Git object refs. Build a source-relevant alternate index from the official v0.7.2 tree, overlay the current `weknora/` worktree (including non-ignored untracked files), and record every add, modify, delete, and rename before changing the kernel. The record includes path, base/working hashes where applicable, whether upstream also changes the path, and the default preservation decision.

This is preferred over comparing only `HEAD`, because `HEAD` omits the explicitly in-scope current worktree. It is preferred over a plain directory copy because Git blob identities provide a real three-way seam.

### 2. Checkpoint the audited Musuw worktree, then apply the official v0.7.2-to-target patch with three-way semantics

After the audit ledger is generated and checked, create a recoverable checkpoint commit containing the inherited Musuw worktree. Apply the exact official diff beneath `weknora/` using blob-aware three-way merging. Unchanged local paths mechanically adopt upstream; local-only paths mechanically remain; overlapping paths either auto-merge non-overlapping hunks or enter the conflict review queue.

A raw overwrite was rejected because it drops local behavior. Reimplementing upstream features manually was rejected because it creates drift and needless custom code. A parallel upstream tree was rejected because it creates duplicate runtime and interface authority.

### 3. Existing owning modules and interfaces remain authoritative

For each new upstream capability, keep its official implementation at the existing WeKnora module whenever possible. Translate Musuw-specific authentication, entitlement, storage, configuration, and presentation concerns at their existing seams. Extend an existing interface only when a real caller needs new behavior; do not add speculative adapters or pass-through modules.

The caller-visible interface and its downstream consumer are the test surface. Generated clients, routes, jobs, settings, and UI controls are traced through actual use rather than accepted merely because the source file exists.

### 4. Resolve overlaps with an explicit preservation hierarchy and ledger

The resolution order is:

1. Preserve Musuw product semantics and current intentional behavior.
2. Add upstream behavior when it is compatible or can be gated through an existing Musuw seam.
3. Prefer an upstream implementation only with path-specific evidence that the Musuw code is a bug, a dead duplicate, or semantically equivalent and strictly weaker.
4. Preserve both implementations' license notices and generated-source requirements.

Every conflicted path receives a resolution category and rationale. Auto-merged overlapping paths are recorded as retaining both non-overlapping deltas and are covered by focused tests or build evidence. Local-only pre-upgrade paths are checked after the merge so silent deletion is a hard failure.

### 5. Append upstream migrations after Musuw's existing migration namespaces

Musuw PostgreSQL versions 80-93 and SQLite versions 3-12 remain byte-for-byte authoritative because deployed databases already attach those numbers to Musuw meanings. The eleven upstream PostgreSQL migrations originally numbered 80-90 are imported in original order as versions 94-104. Colliding upstream SQLite migrations are likewise appended after Musuw's version 12 in their original dependency order. Names and SQL bodies remain as mechanical as possible, and references in tests, docs, and code are updated to the combined sequence.

Backend-specific empty schemas (SQLite, MySQL, ParadeDB where present) are three-way merged so a new database includes both Musuw and upstream schema. Validation covers at least:

- an existing PostgreSQL schema at Musuw version 93 upgrading through 94-104 and an existing SQLite schema at Musuw version 12 upgrading through the appended SQLite chain;
- a fresh empty database applying the whole combined chain;
- migration uniqueness/order and clean rerun behavior;
- application startup or repository behavior that consumes the new schema.

Renumbering Musuw's existing migrations was rejected because it would reinterpret production history. Replacing the migration table or adding a second runner was rejected because it introduces irreversible operational ambiguity.

### 6. Keep security, product gates, and visual authority centralized

New upstream routes and settings pass through Musuw's existing authentication, tenant, entitlement, hidden-rule, and credential-redaction mechanisms. Provider keys and infrastructure credentials remain server-side. New user-facing controls use existing Musuw route/settings access rules, theme tokens, responsive states, and localization; upstream defaults must not bypass quotas, billing, storage ownership, or consumer simplification.

### 7. Verification is risk-weighted and completion is evidence-based

Verification proceeds from focused behavior tests to module suites, type checks, builds, database checks, and host-mode smoke acceptance. One consolidated adversarial review challenges preservation, migration, security, downstream consumption, error/recovery behavior, and unnecessary duplication. Completion percentage is calculated from checked OpenSpec tasks plus mandatory acceptance gates; a failed mandatory gate is a blocker even if the numeric ratio exceeds 99%.

## Risks / Trade-offs

- **Large overlapping source sets can auto-merge into semantically invalid code** → Inventory all overlaps, compile affected modules, run behavior tests at the existing interfaces, and review the consolidated delta rather than trusting conflict count.
- **Migration number collision can reinterpret deployed data** → Keep Musuw 80-93 fixed and append upstream 80-90 as 94-104; test both existing and empty histories.
- **Upstream routes/settings can bypass Musuw gates** → Diff router registration, middleware, settings access, tenant scope, and frontend route visibility; add behavior tests before exposing controls.
- **Generated files can drift from their source** → Use upstream generators or exact generated artifacts where available, then run generation/parity tests and builds.
- **Dependency/toolchain jumps can break Musuw containers** → Adopt official lockfiles/config mechanically, reconcile only required Musuw runtime inputs, and build the actual runtime targets.
- **Preserving every local delta can retain old defects** → Replacement is allowed only with concrete evidence and a recorded rationale; non-blocking pre-existing observations remain follow-ups rather than silent rewrites.
- **A complete test matrix may exceed the first-version timebox** → Prioritize mandatory product, migration, build, and security gates; report any environment-gated test with alternative evidence and residual risk. The first version is not complete while a known high-impact blocker remains.

## Migration Plan

1. Fetch and verify official v0.7.2 and target commit identities.
2. Generate and review the pre-upgrade local-delta and overlap ledger from the current worktree.
3. Run focused inherited-worktree tests and create a checkpoint commit.
4. Apply the official delta with three-way semantics beneath `weknora/`.
5. Resolve overlaps using the preservation hierarchy; append upstream PostgreSQL migrations as 94-104, append colliding upstream SQLite migrations after Musuw version 12, and merge empty-schema variants.
6. Reconcile dependencies, runtime composition, generated artifacts, product gates, localization, and Musuw visual treatment.
7. Generate the final resolution ledger and prove no unexplained local-only delta disappeared.
8. Run the verification matrix and adversarial review, fix blockers, and commit the completed first version.

Rollback before deployment is the checkpoint commit or branch ref. After a non-production migration test, discard the disposable database. Production rollback is out of scope for this local task; any later deployment must use the repository's immutable release procedure and database backup policy, and must not reinterpret migration versions 80-104.

## Open Questions

- Which upstream capabilities require additional Musuw-visible controls after the mechanical merge will be decided from the target commit's real routes and consumers, not from speculative feature names.
- Environment-dependent integrations may not be runnable locally without production credentials; each such check must identify alternative evidence and remaining risk rather than fabricate success.
