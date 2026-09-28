## MODIFIED Requirements

### Requirement: Hosted-only production runner routing
The production workflow SHALL run authorization, native AMD64 image construction, and final restricted deployment on pinned standard `ubuntu-24.04` runners. CI and Storefront SHALL use the same pinned hosted label. No job SHALL require `musuw-build-x64`, `musuw-release`, repository-variable runner routing, QEMU, or the Tokyo production host as a runner.

#### Scenario: Production construction starts natively
- **WHEN** an authorized revision reaches construction
- **THEN** a fresh hosted job verifies X64 runner, x86_64 kernel, and AMD64 Docker server architecture before building

#### Scenario: Production deployment is scheduled
- **WHEN** both validated image references are ready
- **THEN** the deploy job is scheduled on `ubuntu-24.04` and receives production SSH inputs only through `server-production`

### Requirement: Secret-free immutable build handoff
The build job SHALL have only `contents: read` and `packages: write`, MUST NOT attach the production Environment or reference a production `secrets.*` value, and SHALL accept only the three documented browser-visible repository variables. Official GHCR login SHALL use the job token and logout cleanup. The deploy job SHALL retain only `contents: read` and `packages: read`, consume validated immutable image references, and MUST NOT rebuild them.

#### Scenario: Hosted build succeeds
- **WHEN** both image actions emit valid digests and the immutable tags resolve to those digests
- **THEN** the build exposes canonical app/frontend digest references to deploy

#### Scenario: Build output is incomplete or malformed
- **WHEN** either digest is missing, malformed, or differs from the remote immutable tag
- **THEN** deploy does not run and the current production release remains unchanged

### Requirement: Official exact-SHA source materialization
Authorization SHALL retain the full checkout needed for canonical CI and `origin/main` ancestry proof. The hosted build and deploy SHALL use official checkout for exactly the authorized SHA and assert `HEAD` before using source. The workflow MUST NOT use a source projection, Actions Artifact source transport, REST/blob downloader, or ranged request.

#### Scenario: Authorized source is materialized
- **WHEN** authorization emits a CI-green canonical SHA
- **THEN** the hosted jobs check out and verify that SHA directly before construction or deployment

### Requirement: Bounded official BuildKit cache
The hosted build SHALL use `docker/setup-buildx-action` with the checked-in BuildKit configuration and cleanup enabled. App and frontend build actions SHALL use separate `type=gha` scopes with `mode=max`; they MUST NOT publish mutable registry cache tags, retain persistent runner-local state, configure a regional mirror, or use a custom Docker credential lifecycle.

#### Scenario: Fresh hosted job starts
- **WHEN** construction starts without runner-local state
- **THEN** the official action creates a bounded Docker-container builder and imports any available image-specific GHA cache

#### Scenario: Hosted job finishes or fails
- **WHEN** official post actions run
- **THEN** they remove the builder and GHCR login from the ephemeral runner without a custom cleanup protocol

### Requirement: Stable dependency layers and bounded network work
The application Dockerfile SHALL use official signed Debian sources from pinned base images with bounded retries and HTTP/HTTPS timeouts, `proxy.golang.org,direct`, and `sum.golang.org`. It MUST NOT require regional mirror arguments or disable Go checksum verification. Go module/compiler mounts and the external GHA layer cache SHALL preserve reusable dependency work without changing release identity.

#### Scenario: Official dependency endpoint stalls
- **WHEN** apt or Go dependency acquisition cannot make progress
- **THEN** bounded retries or request timeouts surface failure and deploy remains unrun

#### Scenario: Release SHA changes without dependency changes
- **WHEN** a later authorized revision changes only release metadata or application source
- **THEN** BuildKit may reuse unchanged dependency layers while the compiled application and OCI revision remain bound to the new exact SHA

### Requirement: Serialized activation and safe rerun
Production releases SHALL remain serialized in one non-cancelling concurrency group. Browser bundles and both images SHALL be built sequentially with the browser V8 old-space ceiling set to 3072 MiB. The final restricted deploy SHALL run on GitHub-hosted Ubuntu and retain the existing finite preparation and upload retries. It MUST NOT blindly retry the final activation command after an ambiguous lost response.

#### Scenario: Two releases are requested
- **WHEN** a release is active and another is triggered
- **THEN** the second release cannot construct or deploy concurrently

#### Scenario: Hosted SSH delivery fails
- **WHEN** the direct hosted connection exhausts its finite safe retries or activation returns failure
- **THEN** the release fails visibly and an operator may rerun the exact CI-green SHA without adding an alternate delivery system
