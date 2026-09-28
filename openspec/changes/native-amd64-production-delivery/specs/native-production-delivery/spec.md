> **Superseded:** `migrate-builds-to-github-hosted` modifies this capability for standard hosted construction. The requirements below describe the retired Beijing path and are retained as historical evidence.

## ADDED Requirements

### Requirement: Native build-only runner routing
The production workflow SHALL run lightweight authorization and deployment on `musuw-release` and SHALL run only its heavy construction job on the exact `musuw-build-x64` label. CI and storefront SHALL retain their existing runner-variable fallback and MUST NOT use the x64 production-builder label. No required job SHALL use a GitHub-hosted-only label, the Beijing build job MUST contain only inline `run` steps and no `uses:` step, and the Tokyo production host MUST NOT be a runner.

#### Scenario: Production build starts natively
- **WHEN** an authorized production revision reaches the build job
- **THEN** the job verifies X64 runner architecture, x86_64 kernel architecture, and amd64 Docker server architecture before building, without installing QEMU

#### Scenario: Hosted minutes remain exhausted
- **WHEN** no GitHub-hosted private-repository minutes are available
- **THEN** authorize, native build, and deploy can still be scheduled on their explicit self-hosted labels

#### Scenario: Regional Action archive transport is unavailable
- **WHEN** the Runner cannot download a referenced Action bundle before job execution
- **THEN** the native build has no Action reference to prepare and can reach its inline native preflight and official exact-SHA source retrieval

#### Scenario: General CI is scheduled
- **WHEN** a CI or storefront job is evaluated
- **THEN** it uses `MUSUW_ACTIONS_RUNNER || ubuntu-latest` and cannot consume `musuw-build-x64`

### Requirement: Secret-free immutable build handoff
The production workflow SHALL authorize an exact CI-green SHA, build both images in a distinct x64 job, and deploy only after both image outputs validate. The build job SHALL have only `actions: read`, `contents: read`, and `packages: write`, MUST NOT attach the production Environment or reference any `secrets.*` value, and SHALL accept only the three documented browser-visible repository variables. Artifact read access SHALL be used only for the immutable source bundle produced by the authorization job in the same workflow run. The build SHALL authenticate to GHCR over stdin using a runner-temporary Docker configuration, log out, and delete that configuration in an always-running cleanup. Build and deploy SHALL generate auth-public input from those same variables rather than independent secret sources. The deploy job SHALL have only `contents: read` and `packages: read`, SHALL consume the returned immutable refs, and MUST NOT rebuild browser bundles or images.

#### Scenario: Native build succeeds
- **WHEN** both image pushes write metadata bound to their expected immutable tags, matching descriptor digests, registry-resolvable lowercase SHA-256 digests, and remote tags that resolve to those same digests
- **THEN** the build job exposes exactly the app/frontend digests and canonical `ghcr.io/...@sha256:...` refs for deploy

#### Scenario: Build output is incomplete or malformed
- **WHEN** either build fails or either digest/ref has an invalid shape
- **THEN** the build job fails and the dependent deploy job does not run

#### Scenario: Deploy receives production credentials
- **WHEN** both immutable refs are available
- **THEN** only the `musuw-release` deploy job receives the restricted SSH/server inputs and passes the refs through the existing exact-SHA forced-command release seam with no server-side build

### Requirement: Official same-run exact-SHA source artifact materialization
The trusted authorization job SHALL retain the full Git checkout required to prove successful CI and `origin/main` ancestry. It SHALL package the authorized tree without executing source as one deterministic, bounded exact-SHA production source projection in `musuw-source.tar.gz`. The projection SHALL start at the repository root, SHALL use exactly the two negative pathspecs `:(exclude)weknora/website-docs/**` and `:(exclude)weknora/docs/images/**`, and MUST NOT contain another projection exclusion. It SHALL retain and validate required production consumers including `weknora/docs/docs.go`, `weknora/internal/assets/asr_test.wav`, `weknora/frontend/packages/xlsx-0.20.2.tgz`, and `scripts/weknora-production/lib.sh`, along with its fixed safe root, member types, other required inputs, and executable mode, compute its inner SHA-256, and upload only that file through GitHub's immutable Actions Artifact service with finite retention. It SHALL expose the artifact id/name, upload digest, and inner digest to the dependent native build. The native build MUST NOT fetch Git history or source from `github.com` or `codeload.github.com`; it SHALL retrieve only that same-run artifact through the fixed official REST endpoint. It SHALL bind metadata to the expected id, name, current workflow run, non-expired state, bounded size, and outer digest. Each of three bounded download attempts SHALL obtain a fresh redirect, accept only GitHub's official HTTPS blob authority, and MUST NOT forward the API credential to the blob request. API metadata and redirect calls SHALL retain their 15-second connect and 30-second total bounds. The credential-free blob request SHALL use a 15-second connect bound, a 900-second total bound, and abort if transfer speed remains below 1024 bytes per second for 120 seconds. The complete retry envelope MUST remain below the build job's 90-minute bound. The build SHALL require downloaded size and outer digest to match metadata, exactly one ZIP member named `musuw-source.tar.gz`, and the inner digest to match authorization before validating the tar tree. It SHALL reject special members and verify required build inputs and executable modes in runner-temporary staging before replacing only the exact repository workspace. It SHALL retain the prior workspace until the new tree passes post-move validation and restore or preserve the old tree on failure. The deploy job SHALL retain its exact-SHA checkout and existing manifest-backed server upload.

#### Scenario: Git and codeload are regionally unavailable
- **WHEN** the same-run Actions Artifact API/blob path is reachable but Git smart HTTP and codeload full-archive transfer are unreliable
- **THEN** the native build materializes the approved source tree without fetching branch, tag, or commit history and without adding an unofficial mirror, proxy, bucket, or registry

#### Scenario: Artifact identity or redirect is untrusted
- **WHEN** metadata does not match the expected artifact/current run/digests or the fresh download redirect is not an HTTPS official blob authority
- **THEN** the build fails without forwarding its token, installing dependencies, publishing an image, or mutating Tokyo

#### Scenario: Artifact or archive is malformed or incomplete
- **WHEN** the downloaded ZIP has an unexpected member/size/digest, or its inner archive has an unsafe root, a symbolic link, a missing required lockfile/Dockerfile/BuildKit input/production-consumer sentinel, or loses the executable build helper
- **THEN** the staged source is rejected before it can replace the exact runner workspace or begin construction

#### Scenario: Official blob route is slow but progressing
- **WHEN** the credential-free artifact blob remains above 1024 bytes per second but needs more than 300 seconds to deliver the bounded source projection
- **THEN** the attempt SHALL use four concurrent non-overlapping HTTP/1.1 byte ranges, each at most 900 seconds with a 120-second low-speed guard; every response SHALL be `206` with the exact expected `Content-Range`, `Content-Length`, and local size, while metadata and redirect API calls retain their shorter bounds

#### Scenario: Deploy prepares the server source manifest
- **WHEN** validated immutable image refs reach the deploy job
- **THEN** the trusted release runner uses its exact-SHA Git checkout to materialize the existing allowlisted source manifest and restricted server upload unchanged

### Requirement: Bounded persistent local BuildKit cache
The x64 build SHALL use the host's preinstalled official Docker/Buildx CLI with a fixed Docker-container builder name, the checked-in BuildKit configuration, and `docker buildx rm --keep-state` cleanup. Buildx configuration, state, and logs SHALL use the exact private persistent `$RUNNER_WORKSPACE/.musuw-production-buildx-config` directory, while GHCR credentials SHALL use only a separate runner-temporary `DOCKER_CONFIG`. Both image builds SHALL select that builder. Every job SHALL remove an already registered same-name builder with `--keep-state`, recreate the container from current repository configuration, and retain the same-name local cache volume; cleanup SHALL delete the credential configuration without deleting persistent Buildx client state. Docker daemon bootstrap pulls and BuildKit Dockerfile-base pulls SHALL use the checked-in Tencent Cloud regional mirror configuration. BuildKit SHALL run at most two parallel build steps, and GC SHALL use a 10 GB maximum-use threshold while preserving at least 12 GB free space. The workflow MUST NOT import or export a separate registry cache or create optional build-record artifacts, while immutable release images MUST still be pushed to GHCR with minimum provenance and normal workflow/release evidence MUST remain available.

#### Scenario: Warm build reuses local state
- **WHEN** the persistent x64 runner retains the named builder volume
- **THEN** BuildKit can reuse unchanged ordinary layers and Go module/compiler cache mounts without uploading a maximum-mode cache artifact

#### Scenario: Warm cache survives the job
- **WHEN** a trusted production build finishes
- **THEN** always-running CLI cleanup removes the builder container with `--keep-state` while its named local state remains available for the next serialized production build

#### Scenario: Prior build is interrupted before cleanup
- **WHEN** persistent Buildx metadata still contains the fixed builder at the start of a later serialized job
- **THEN** setup removes only that fixed builder with `--keep-state` and recreates it from the current checked-in configuration without persisting GHCR credentials

#### Scenario: Builder state is absent
- **WHEN** the builder or its local volume does not exist
- **THEN** the inline CLI setup creates it and the workflow performs a correct native cold build whose newly pushed image digests can be deployed

#### Scenario: Direct Docker Hub access is unavailable
- **WHEN** the native host cannot reach Docker Hub directly but its configured Tencent Cloud mirror is reachable
- **THEN** both the BuildKit bootstrap image and Dockerfile base images resolve through that mirror without introducing another build provider

#### Scenario: Regional mirror configuration drifts
- **WHEN** the daemon no longer reports the required regional mirror
- **THEN** native preflight fails before dependency installation, image construction, or Tokyo mutation

#### Scenario: Cache exceeds the host budget
- **WHEN** BuildKit cache crosses its configured thresholds
- **THEN** automatic OCI-worker GC reclaims cache toward the 10 GB maximum-use threshold while maintaining the 12 GB free-space floor according to BuildKit policy

#### Scenario: Build graph contains concurrent work
- **WHEN** BuildKit has more than two executable vertices
- **THEN** the OCI worker executes no more than two concurrently to limit memory pressure on the 4 GB host

#### Scenario: Immutable image layers already exist
- **WHEN** a later image push references content-addressed layers already stored by GHCR
- **THEN** the registry can reuse those blobs without a second `mode=max` cache export

### Requirement: Stable dependency layers and bounded network work
Volatile release metadata MUST NOT invalidate stable apt/tool or runtime-package layers. Debian network operations SHALL use bounded retries and HTTP/HTTPS timeouts and SHALL consume the existing regional mirror argument from the production workflow. Before any Go network command, the builder SHALL select Tencent Cloud's documented regional Go module mirror and Go's authenticated mainland checksum endpoint; it MUST NOT disable checksum verification or fall back to `proxy.golang.org`. The migrate tool SHALL be pinned to the application dependency version, and Go build steps SHALL use module/compiler cache mounts.

#### Scenario: Release SHA changes
- **WHEN** a new authorized SHA changes release metadata
- **THEN** stable package layers remain cache-eligible while the compiled artifact and OCI revision remain bound to the new SHA

#### Scenario: Debian mirror stalls
- **WHEN** apt cannot make progress
- **THEN** configured retries and per-request timeouts bound the wait and surface failure instead of leaving an unbounded build step

#### Scenario: Global Go module endpoints are unreachable
- **WHEN** the Beijing builder cannot reach `proxy.golang.org` or `sum.golang.org`
- **THEN** the pinned migrate tool and complete application module graph resolve through the regional module mirror and authenticated mainland checksum endpoint without disabling verification

#### Scenario: Dependency layers are already warm
- **WHEN** a later build has unchanged apt inputs, Go module files, migrate version, and source
- **THEN** BuildKit reuses those layers and cache mounts instead of downloading or compiling them from the beginning

### Requirement: Serialized activation and safe rollback
Production releases SHALL remain serialized in one non-cancelling concurrency group. Browser bundles and both images SHALL be built sequentially in one build job, with the browser V8 old-space ceiling set to 3072 MiB. The browser build SHALL select and verify the exact `.nvmrc` Node version already present in the Runner toolcache and MUST NOT download a runtime. Activation SHALL require an online `musuw-build-x64` runner, its preinstalled Node/Docker/Buildx toolchain, the repository's existing bounded Actions Artifact facility, and the three public repository variables, but MUST NOT require GitHub-hosted execution minutes, Docker Build Cloud, another build provider, deletion of existing host services, or production-host mutation.

#### Scenario: Two releases are requested
- **WHEN** a release is already active and another is triggered
- **THEN** the second release cannot build or deploy concurrently

#### Scenario: Native runner is unavailable
- **WHEN** no online runner matches `musuw-build-x64`
- **THEN** build waits and deploy remains unrun without changing GHCR release images or Tokyo

#### Scenario: Local cache reset is required
- **WHEN** the named builder state is removed after operator inspection
- **THEN** the next build is cold while existing immutable images and the running production release remain unchanged
