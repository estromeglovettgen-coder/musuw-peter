## Why

Musuw currently vendors WeKnora v0.7.2 while upstream `main` has accumulated substantial product, runtime, database, CLI, document-processing, agent, and frontend improvements. Musuw needs those capabilities from one reproducible upstream commit without regressing any intentional Musuw behavior or treating the examples named in the upgrade request as a preservation whitelist.

## What Changes

- Replace the vendored WeKnora source baseline with official commit `81142dfd17b2778087e95d3a317483a2fd909b91` and update source/license provenance.
- Audit every tracked and untracked current-worktree difference from official v0.7.2 before merging, then preserve every intentional Musuw business rule, data meaning, background job, route/permission, operations capability, independent frontend, visual treatment, interaction, and default.
- Mechanically three-way merge upstream changes through the existing WeKnora modules. A Musuw difference may be replaced only when it is demonstrated to be a bug, dead duplicate, or semantically equivalent behavior for which upstream is strictly better; each such judgment is recorded.
- Expose useful upstream capabilities and settings through Musuw's existing product surfaces and product gates, with Musuw-native styling and consumer-safe defaults.
- Carry the complete upstream migration chain forward while retaining Musuw migrations and proving both upgrade-from-existing-data and empty-database initialization paths.
- Update dependency locks, runtime composition, tests, and operator documentation required by the new fixed baseline.
- Produce a path-level preservation ledger and a verification matrix so the upgrade can be reviewed and reproduced.

No intentional Musuw product contract is declared breaking by this change.

## Capabilities

### New Capabilities

- `weknora-main-kernel-upgrade`: Pins the WeKnora kernel to the requested official commit, integrates its capabilities through existing Musuw modules, preserves the complete local product delta, and defines migration and verification requirements.

### Modified Capabilities

None. The repository has no synchronized active capability specs, and this change is explicitly compatibility-preserving for existing Musuw behavior.

## Impact

- Affected source: the complete `weknora/` tree plus the existing Musuw runtime adapters, independent `auth/` and `storefront/` surfaces, release composition, provenance records, and upgrade documentation where compatibility requires it.
- Affected interfaces: WeKnora HTTP routes and DTOs, database schemas and migration runner, background tasks, model/agent/document pipelines, frontend routes/settings, CLI/client contracts, and container/runtime configuration.
- Affected dependencies: Go modules, frontend packages, Python/docreader dependencies, images, and generated lock or interface artifacts introduced or changed upstream.
- Operational risk: a large three-way vendor update can silently drop local semantics or strand an existing database; the preservation ledger, conflict rationale, targeted behavior tests, builds, and fresh/upgrade migration checks are release gates.
