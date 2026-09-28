## ADDED Requirements

### Requirement: Each deployment identifies its source and result

Every Cloudflare or server deployment SHALL record the canonical repository,
the selected full SHA, source-manifest hash, workflow run, target, deployment
time and health result. The record MUST be enough to answer which reviewed
commit is serving at each target.

#### Scenario: A running target resolves to one SHA

- **WHEN** an operator inspects a Worker or server deployment
- **THEN** its record resolves to one full SHA in
  `estromeglovettgen-coder/musuw`
- **AND** the recorded source-manifest hash and health result match the job
  output

#### Scenario: Missing identity stops publication

- **WHEN** a candidate lacks a full SHA, source-manifest hash, target or
  successful health result
- **THEN** the target job reports the missing field and does not claim success

### Requirement: Deployment credentials are target-scoped

The storefront job SHALL receive only its Worker-scoped Cloudflare credential.
The server job SHALL receive the restricted SSH key, pinned host keys and the
ephemeral workflow `GITHUB_TOKEN` package permission required to push/pull the
release images. The token MUST be streamed through stdin and never persisted.
Runtime, model, OIDC, Supabase service, billing, database, object-store,
Redis/Neo4j and tunnel secrets SHALL remain in their target-owned stores and
MUST NOT be committed, embedded in bundles or written to logs.

#### Scenario: Cross-target credentials are unavailable

- **WHEN** either target job starts
- **THEN** it can read only its own deployment credential, public build
  configuration and short-lived GHCR token
- **AND** it cannot read the other target's key or server runtime secrets

#### Scenario: Source boundary is clean

- **WHEN** the source manifest and release bundle are scanned
- **THEN** no credential value, private key, dependency directory, generated
  output, log, dump or runtime path is present
- **AND** the scan fails when an excluded path is introduced

### Requirement: Deployment output is short and useful

The deployment job SHALL retain its source-manifest hash, target, selected SHA,
workflow log link and health probe output. It MUST NOT require a second release
record, a component matrix or an additional state store.

#### Scenario: Operator can inspect the last deployment

- **WHEN** the storefront or server job completes
- **THEN** its output shows the exact SHA, target and health probes
- **AND** an operator can rerun the normal exact-SHA path using that output
