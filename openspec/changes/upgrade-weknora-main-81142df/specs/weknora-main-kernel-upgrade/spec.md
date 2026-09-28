## ADDED Requirements

### Requirement: Exact official kernel provenance
Musuw SHALL vendor the complete WeKnora source represented by official commit `81142dfd17b2778087e95d3a317483a2fd909b91`, retain applicable upstream notices, and record enough provenance to reproduce the imported tree and its local delta.

#### Scenario: Reviewer verifies the pinned source
- **WHEN** a reviewer inspects the committed provenance and vendored source
- **THEN** the official repository, exact 40-character commit, source location, import method, and verification evidence identify the requested tree without depending on a moving branch

### Requirement: Complete Musuw delta preservation
The upgrade SHALL audit every source-relevant tracked and untracked current-worktree difference from official WeKnora v0.7.2 and SHALL preserve every intentional Musuw behavior by default. The named product examples SHALL NOT be interpreted as a preservation whitelist.

#### Scenario: Local-only path survives the upgrade
- **WHEN** a pre-upgrade Musuw path differs from v0.7.2 and the target upstream commit does not change that path
- **THEN** its add, modification, deletion, or rename remains represented after the upgrade unless the ledger records concrete evidence for an allowed replacement

#### Scenario: Both Musuw and upstream changed a path
- **WHEN** a pre-upgrade Musuw delta overlaps an upstream v0.7.2-to-target delta
- **THEN** the result retains Musuw product semantics, integrates compatible upstream behavior, and records the path's merge or replacement rationale

#### Scenario: An unlisted product behavior is encountered
- **WHEN** an intentional Musuw business rule, data meaning, job, route permission, operations feature, independent frontend, visual treatment, interaction, or default was not individually named in the request
- **THEN** it receives the same default-preserve treatment as the named examples

### Requirement: Evidence-gated replacement
A Musuw delta MUST be replaced by upstream behavior only when it is demonstrated to be a bug, a dead duplicate, or semantically equivalent behavior for which upstream is strictly better, and the judgment MUST be recorded.

#### Scenario: Upstream code replaces a local overlap
- **WHEN** conflict resolution chooses upstream behavior instead of a current Musuw implementation
- **THEN** the ledger identifies the affected path, allowed replacement category, evidence, and verification that Musuw product semantics did not change

### Requirement: Existing module and interface authority
New upstream capabilities SHALL be integrated through the existing owning WeKnora and Musuw modules and interfaces, with no parallel runtime, API, authentication, billing, storage, settings, frontend, or migration architecture.

#### Scenario: Upstream introduces a new capability
- **WHEN** the target source adds a route, job, data type, agent/tool behavior, document feature, CLI operation, or setting
- **THEN** Musuw uses the upstream implementation at the existing owning module and connects real downstream consumers through the existing product seams

#### Scenario: An existing Musuw concern applies
- **WHEN** a new upstream capability handles tenant data, credentials, paid resources, storage, permissions, or user-visible configuration
- **THEN** it passes through Musuw's authoritative authentication, tenant, entitlement, quota, redaction, storage-ownership, visibility, and presentation rules as applicable

### Requirement: Musuw-native exposure of upstream capabilities
Useful upstream user-facing capabilities and settings SHALL be reachable in Musuw when compatible with the product, and their UI SHALL use Musuw visual tokens, localization, responsive behavior, interaction defaults, and hidden-rule policy.

#### Scenario: New setting is exposed
- **WHEN** upstream provides a user-appropriate setting that Musuw supports
- **THEN** the setting is reachable from an existing Musuw surface, is correctly gated, localized, and styled, and does not expose server credentials or infrastructure detail

#### Scenario: Capability is intentionally hidden
- **WHEN** exposing an upstream control would violate Musuw's consumer model, entitlement rules, security posture, or supported runtime
- **THEN** the implementation remains available behind the appropriate existing gate or is intentionally hidden with the decision recorded

### Requirement: Collision-free compatible database evolution
The combined database schema SHALL retain the meaning of every existing Musuw migration version, append upstream schema changes in dependency order under unique versions, and support both existing Musuw databases and empty initialization.

#### Scenario: Existing Musuw database upgrades
- **WHEN** a PostgreSQL database at Musuw migration 93 or a SQLite database at Musuw migration 12 starts the upgraded application
- **THEN** only the backend's appended upstream migrations run, existing Musuw data meanings remain intact, and the schema reaches the new clean latest version

#### Scenario: Empty database initializes
- **WHEN** the upgraded application initializes a fresh supported database
- **THEN** the full combined schema is created without duplicate migration versions, missing upstream objects, or missing Musuw objects

#### Scenario: Migration is retried or inspected
- **WHEN** migration ordering, down files, or a clean rerun are validated
- **THEN** each version has one unambiguous meaning and the runner reports a clean latest state without reinterpreting PostgreSQL versions 80 through 93 or SQLite versions 3 through 12

### Requirement: End-to-end verification and committed first version
The upgrade SHALL be committed on `codex/upgrade-weknora-main-81142df` only after focused behavior tests, affected module suites, type checks, builds, migration validation, and local product smoke acceptance provide fresh evidence and no known high-impact blocker remains.

#### Scenario: First version completion is measured
- **WHEN** the first-version handoff is prepared within the 12-hour goal
- **THEN** at least 99% of explicit OpenSpec tasks and mandatory acceptance gates are complete, every unrun check states its reason and residual risk, and numeric progress does not mask a failed mandatory gate

#### Scenario: Reviewer traces a new capability downstream
- **WHEN** source for a new upstream capability is present
- **THEN** verification demonstrates its owning module, adjacent interface, and actual route, job, UI, CLI, or runtime consumer rather than relying only on file presence
