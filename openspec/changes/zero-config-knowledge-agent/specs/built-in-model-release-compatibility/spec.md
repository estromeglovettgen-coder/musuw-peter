## ADDED Requirements

### Requirement: Managed chat IDs have release catalog definitions
The UI-only release path MUST reject a source tree whose managed chat-model IDs
are not all defined in that tree's `builtin_models.yaml` catalog.

#### Scenario: UI source references a missing managed model
- **WHEN** an operator starts a UI-only release whose frontend names a managed
  model absent from its builtin-model catalog
- **THEN** the release fails before files are published

### Requirement: Complete release verifies the platform catalog
A release carrying standard chat or knowledge-base defaults MUST use the full
application release path and MUST verify that its required builtin model rows
are available after startup.

#### Scenario: Full release has seeded required models
- **WHEN** the full application release starts successfully
- **THEN** Flash, Pro, embedding, rerank, VLM, and ASR built-in model rows are
  available for the standard flow

### Requirement: Full release recovers capacity only from unused Docker caches
When the full-release preflight finds root or Docker-root free capacity below
`WEKNORA_DEPLOY_MIN_FREE_KIB`, it MUST make one bounded cache-only recovery
attempt before transferring source: `docker buildx prune --all --force --filter
inuse=false`, followed by `docker image prune --force`. It MUST recheck the
same capacity reserve and fail before transfer when it remains insufficient.
It MUST NOT prune containers, volumes, source releases, or run this maintenance
for a UI-only release.

#### Scenario: Unused Docker cache restores the full-release reserve
- **WHEN** full-release capacity is initially below the configured reserve and
  the bounded cache cleanup restores it
- **THEN** the full source release may continue

#### Scenario: Cache cleanup cannot restore the full-release reserve
- **WHEN** capacity remains below the configured reserve after the bounded
  cache cleanup
- **THEN** the release fails before source transfer or activation
