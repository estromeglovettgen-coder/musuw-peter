> **Superseded:** `migrate-builds-to-github-hosted` replaces the runner routing, source transport, regional mirrors, and persistent BuildKit decisions below. This document is retained only as the history of the former Beijing path.

## Context

The current production image build targets `linux/amd64` from an ARM64 GitHub runner container inside Docker Desktop on an Apple Silicon Mac. A failed run stopped advancing during Debian package retrieval for more than fifty minutes; a retry crashed inside amd64 Go runtime code with `SIGSEGV`. Successful historical app builds still spent about 348 seconds compiling Go, 136 seconds installing runtime packages, and 136 seconds exporting/pushing. The Mac listener itself remained online and idle after cancellation. A zero BuildKit-container count was the expected post-job cleanup from `setup-buildx-action`, not a stopped runner.

GitHub-hosted private-repository minutes are exhausted. A separate Tencent lightweight-cloud Linux host is already paid and has been reinstalled as a dedicated construction node: native x86_64, 4 vCPU, 4 GB RAM, 40 GB disk, Docker Engine and Buildx. Its public uplink is constrained, and direct Docker Hub registry access from the host timed out while Tencent Cloud's official regional mirror was immediately reachable. The Tokyo production host, forced-command SSH gate, immutable GHCR digest contract, and server runtime remain unchanged.

The first native production attempt exposed a separate source-transport mismatch. `actions/checkout` used `fetch-depth: 0`, so it requested every branch and tag even though the build job consumes only one already-authorized source tree. The Beijing route to `github.com:443` then failed during TLS/connect establishment across all of the action's retries, while lightweight API probes remained reachable. Reducing the fetch depth would reduce bytes only after a connection succeeds; it would not remove the failing Git endpoint.

After the exact-SHA REST/codeload source path removed that Git dependency, the next attempt failed earlier still: the self-hosted Runner's ActionManager tried to download `docker/setup-buildx-action` from codeload before executing any inline `run` step, and every bounded regional request timed out. GitHub prepares referenced actions at job start, so replacing only checkout or only one Docker action cannot fix this class; any `uses:` in the Beijing job retains an Action download prerequisite before native preflight or source materialization can run.

Removing all Beijing `uses:` steps proved the native preflight could run, but the following production attempt then exhausted all three bounded full-archive transfers from codeload before Node or BuildKit started. In contrast, a bounded read-only probe downloaded an existing Actions Artifact from the same host through GitHub's documented API/blob path in seconds. The durable source seam therefore uses the trusted Mac authorization checkout to create the exact tarball and GitHub's existing immutable same-run Artifact service to transport it; Beijing neither prepares an Action bundle nor downloads source from Git/codeload.

The first real full-tree Actions Artifact exposed a size/slow-link interaction rather than an identity or implementation failure. Its outer ZIP was 38.31 MiB; two Beijing blob requests returned no body and the third advanced at roughly 15 KiB/s, so all three 300-second attempts ended before the exact archive arrived. A producer-equivalent deterministic exact-HEAD measurement showed that the full inner archive was 38.33 MiB, while excluding only `weknora/website-docs/**` and `weknora/docs/images/**` reduced it to 11.41 MiB. Those trees are documentation assets outside every production build and release consumer; the projection explicitly retains `weknora/docs/docs.go`, `weknora/internal/assets/asr_test.wav`, `weknora/frontend/packages/xlsx-0.20.2.tgz`, and `scripts/weknora-production/lib.sh` as regression sentinels.

## Goals / Non-Goals

**Goals:**

- Remove ARM-to-amd64 emulation from every heavy production build.
- Avoid any required GitHub-hosted execution minutes or additional paid build provider.
- Make the x64 host build-only: no production Environment, SSH key, Tokyo credential, or untrusted pull-request job.
- Keep authorization/deploy on the trusted release runner and pass only validated immutable image refs across the boundary.
- Persist ordinary BuildKit layers and Go cache mounts locally without adding large registry-cache uploads.
- Bound Docker and BuildKit cache pressure to retain disk headroom on the dedicated builder.
- Preserve exact-SHA provenance, serialized release behavior, server health checks, and cold-cache correctness.

**Non-Goals:**

- Moving CI or storefront to the 4 GB x64 build runner.
- Running application, database, or public web workloads on the build-only host.
- Making Tokyo a runner or building images on Tokyo.
- Adding Docker Build Cloud, Depot, another vendor, or a custom builder service.
- Skipping builds merely because a mutable tag exists, or promising a duration before cold/warm native runs are measured.

## Decisions

### Route only production construction to `musuw-build-x64`

CI and storefront retain `${{ vars.MUSUW_ACTIONS_RUNNER || 'ubuntu-latest' }}`. When that variable selects the persistent self-hosted runner, Node and Go setup reuse the host's ordinary npm/module/compiler caches and disable their redundant remote restore/save; the official Actions caches remain enabled only for the disposable `ubuntu-latest` fallback. Production authorization and deploy use `musuw-release`; only the `build` job uses the exact `musuw-build-x64` label. Authorization is lightweight and remains on the trusted Mac so the release has no GitHub-hosted dependency. The x64 build checks `runner.arch == X64`, `uname -m == x86_64`, and Docker server architecture before any build. No QEMU action is installed.

The x64 runner must be registered only to the canonical repository and used only by the trusted CI-green production workflow. Docker socket access is effectively host-privileged, so routing pull-request or general CI jobs to it would violate the isolation boundary. The runner polls GitHub outbound and does not require a new inbound service.

### Use only the preinstalled official CLIs in the regional build job

The Beijing job contains no `uses:` step. It selects the exact `.nvmrc` version from the Runner-managed Node toolcache, prepends only that existing binary directory to the current step's `PATH` before npm's `/usr/bin/env node` launcher is invoked, verifies Node, npm, and x64 architecture, and appends the same directory to `GITHUB_PATH` for later steps; it does not download another runtime. Docker Engine and Buildx are host prerequisites and are feature-checked before source or dependency work.

The workflow binds Buildx configuration, state, and logs to the exact owner-only `$RUNNER_WORKSPACE/.musuw-production-buildx-config` directory while reserving a separate runner-temporary `DOCKER_CONFIG` for the GHCR credential. If persistent Buildx metadata shows that a prior interrupted job left `musuw-production-native-amd64-v1` registered, setup removes that exact builder with `--keep-state` before `docker buildx create` supplies the current checked-in BuildKit config and bootstraps it again. The activation inventory confirmed that no same-name registration or container remains from the former action while its single same-name state volume is present, so the first CLI creation has no name conflict and reuses the intended cache. At job end it logs out of GHCR, executes `docker buildx rm --force --keep-state`, deletes only the temporary Docker credential directory, and retains the persistent Buildx client state. The container is therefore recreated from current repository configuration each job, interrupted registrations are recoverable, and the same-name BuildKit volume retains ordinary layers and cache mounts without persisting a registry token. This is the direct official CLI equivalent of the prior action's cleanup/keep-state behavior and adds no wrapper, dependency, proxy, or service.

Both images are pushed by explicit `docker buildx build` commands using the same fixed builder. Each command retains the former tags, OCI labels, build arguments, native platform, and private-repository default `mode=min,inline-only=true` provenance with the exact GitHub Actions run attempt URL as `builder-id`. Buildx writes a separate metadata file for each push; the workflow requires a matching immutable tag, descriptor/digest consistency, a lowercase SHA-256 digest, successful immutable-ref registry inspection, and the remote tag resolving to that same digest before exposing either canonical digest ref. Every validation failure returns explicitly from the command-substituted shell function rather than relying on Bash `errexit`, whose suppression in that context could otherwise accept a mismatch.

### Materialize the authorized SHA through a same-run Actions Artifact

The trusted `musuw-release` authorization job retains its full checkout, successful-CI proof, and `origin/main` ancestry check. Without executing source, it uses `git archive` and deterministic gzip to package the exact-SHA production source projection under one fixed root. The command starts from `.` and permits exactly two negative pathspecs, `:(exclude)weknora/website-docs/**` and `:(exclude)weknora/docs/images/**`; no other tracked tree may be omitted. It validates member types, build and release consumer sentinels, executable mode, and a 256 MiB bound, then computes an inner SHA-256. The official immutable `upload-artifact@v4` action uploads only `musuw-source.tar.gz` with outer ZIP compression disabled and seven-day retention. The job exposes the artifact id/name, upload digest, and inner digest to its dependent build job.

The native build has `actions: read` solely for this transport. It queries the fixed repository artifact endpoint and requires the returned id, name, current workflow-run id, non-expired state, bounded byte size, and `sha256:` digest to match the authorization outputs. Each of three bounded attempts obtains a fresh short-lived `/zip` redirect, accepts only an HTTPS `*.blob.core.windows.net` authority, and performs no credentialed request to the blob host. Metadata and redirect calls retain 15-second connect and 30-second total bounds. Each fresh redirect starts four concurrent, non-overlapping HTTP/1.1 byte-range requests. Every range must return `206`, exactly match its expected `Content-Range` and `Content-Length`, and have the expected local size; all four parts are joined in order before the metadata size and outer SHA-256 are checked. Each credential-free range uses a 900-second total bound plus curl's low-speed abort at less than 1 KiB/s for 120 continuous seconds. Any failed part clears the partial ZIP and the next of three attempts obtains a fresh redirect; the complete retry envelope remains below the 90-minute job bound even at its worst case. The ZIP must contain exactly `musuw-source.tar.gz`; the extracted inner file must match the authorization digest. The tar is then staged under `RUNNER_TEMP`, must contain only the fixed safe root, regular files/directories, no symlink, required lockfiles/Dockerfiles/BuildKit input, and the executable static-build helper. Only the validated tree is copied to a same-filesystem staging directory and moved into the exact expected `GITHUB_WORKSPACE`; the prior tree is retained until post-move validation commits, and an unsuccessful replacement restores or preserves it for recovery. The build continues to inject the authorized SHA explicitly into browser and OCI revision metadata, while deploy retains its own exact-SHA Git checkout because the existing server source-manifest seam uses the Git index.

`fetch-depth: 1` was rejected as the complete fix because it still depends on the intermittently unreachable Git transport. Direct REST/codeload archives were rejected after real bounded full transfers failed. A cross-workflow CI artifact, source OCI package, COS/TCR bucket, third-party mirror, and custom proxy add selection, credentials, lifecycle, or a second source authority and remain out of scope. The selected same-workflow artifact is an existing GitHub transport record with one producer, one consumer, dual digests, and seven-day retention; it is not a permanent backup or deployable release artifact.

### Prefer bounded local cache over maximum-mode registry export

The Docker-container builder volume retains normal layers and BuildKit cache mounts, including `/go/pkg/mod` and `/root/.cache/go-build`, across jobs. `.github/buildkitd.production.toml` enables OCI-worker GC with `reservedSpace = "2GB"`, `maxUsedSpace = "10GB"`, and `minFreeSpace = "12GB"`. These are cache policies, not filesystem quotas; disk-free monitoring remains an operator responsibility. Docker daemon builder GC is intentionally not presented as an authority over this separate Docker-container cache.

The daemon routes the one-time `moby/buildkit` bootstrap pull through `https://mirror.ccs.tencentyun.com`, while BuildKit routes `docker.io` Dockerfile bases through the same official regional mirror. The workflow's native preflight verifies that the daemon mirror is installed before dependency work. This removes the observed direct-Docker-Hub timeout without adding a mirror service or a second artifact pipeline.

The app and frontend build commands do not use `cache-from` or `cache-to`. A `mode=max` registry export would upload intermediate records over the constrained uplink after each build. Optional BuildKit record-artifact upload is also disabled; GitHub job summaries/logs and the repository's release evidence remain. Immutable image push remains mandatory; GHCR's content-addressed registry skips already-present blobs, so unchanged release layers are not uploaded twice. If the local builder state disappears, BuildKit performs a correct cold build and produces new validated image digests. BuildKit is capped at two parallel steps, matching the 4 GB host's memory constraint while retaining limited concurrency.

### Keep volatile metadata after stable dependency work

The app Dockerfile installs apt/tool dependencies before source and release metadata, pins `migrate` to the application dependency version, applies bounded apt retries/timeouts in both stages, and uses Go module/compiler cache mounts. The release SHA reaches the first layer that consumes it, so stable runtime package work remains cache-eligible while the binary and OCI provenance stay bound to the selected revision.

The workflow supplies the Dockerfile's existing `APT_MIRROR_ARG` with Tencent Cloud's regional Debian host. The builder stage sets Tencent Cloud's documented Go module mirror before its first Go network command and uses `sum.golang.google.cn`, which the Go toolchain recognizes as the mainland endpoint for the same authenticated public checksum database. This single configuration covers both the standalone pinned `migrate` build and every later application module download. It is preferred over copying the official `migrate` container binary because that would address only the first failed command, leave `go mod download` on the unreachable default path, and replace the current Go 1.26/PostgreSQL-only build with a separately compiled artifact.

### Keep production secrets on the deploy side

The build job is not attached to `server-production` and contains no `secrets.*` reference. Its only configuration inputs are three browser-visible repository variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_WEKNORA_OAUTH_CLIENT_ID`; the fixed public origin is written directly. The build token has only `actions: read`, `contents: read`, and `packages: write`. GHCR authentication uses stdin and a runner-temporary `DOCKER_CONFIG`, which is logged out and deleted by an `always()` cleanup step.

The deploy job waits for authorization and both image digests, has `contents: read` and `packages: read`, and alone receives the restricted SSH/server inputs. It generates `auth-public.env` from the same three repository variables, eliminating a second configuration source that could drift from the browser bundle. It validates the two canonical `repository@sha256` refs before calling the unchanged release seam with `--no-build` behavior on Tokyo.

### Retain serialized work and bounded timeouts

The constant `production-release` concurrency group with `cancel-in-progress: false` prevents overlapping image pushes and production mutations. Static bundles and both images stay sequential in one build job, avoiding simultaneous builders on a 4 GB host. The browser step caps V8 old space at 3072 MiB rather than the host's full physical memory. The cold build gets a 90-minute fail-safe; apt operations retain shorter per-request timeouts and bounded retries. CI keeps its existing same-ref cancellation behavior. A lower 2048 MiB ceiling is deferred until a real production build proves it sufficient.

## Risks / Trade-offs

- [The x64 runner is offline or mislabeled] → Authorization may finish, but build remains queued and deploy cannot start; runner service health is an activation prerequisite.
- [The 4 GB host reaches memory or disk pressure] → Keep builds sequential, cap BuildKit at two vertices, enforce daemon/BuildKit GC, and observe available memory/disk during the first cold run.
- [The regional mirror is removed or unavailable] → Fail the preflight when daemon configuration drifts; bounded pull failures stop build before any Tokyo mutation.
- [The same-run GitHub source artifact is missing, expired, malformed, or its official blob path is unavailable or persistently below 1 KiB/s] → Identity, size, redirect, ZIP, dual-digest, and low-speed checks fail before dependency work, image publication, or Tokyo mutation; do not fall back to a mutable branch, codeload, unofficial mirror, or custom proxy.
- [The preinstalled Node/Docker/Buildx toolchain drifts] → Exact version/architecture and required CLI feature checks fail before dependency work; update the persistent host deliberately rather than downloading tools inside the regional job.
- [A regional Debian or Go dependency endpoint is unavailable] → Bounded network commands fail the build before image publication; checksum authentication stays enabled, and no direct-default fallback silently reintroduces the observed timeout.
- [A 3 Mbps uplink makes the first image push slow] → Avoid separate registry-cache export; record actual push bytes/time and rely on content-addressed blob reuse in later pushes.
- [Persistent self-hosted execution expands trust] → Route only trusted production build code, inject no production secrets, and never point general CI or pull requests at `musuw-build-x64`.
- [Local builder state is lost or GC is aggressive] → A cold build remains correct; only performance is lost, while immutable GHCR releases and production state are unaffected.
- [Four GB RAM is insufficient for a future build] → Treat an observed OOM as capacity evidence; do not delete unrelated services or add swap/resource changes implicitly from this repository change.

## Migration Plan

1. Register the native x86_64 runner to the canonical repository with the exact custom label `musuw-build-x64`; install the exact `.nvmrc` Node release in its Runner toolcache, verify Docker/Buildx access, and do not install production credentials.
2. Install `.github/docker-daemon.production-builder.json`, validate it with `dockerd --validate`, restart Docker while the runner is idle, and verify the regional mirror through `docker info`.
3. Configure the three browser-visible `VITE_*` repository variables by copying their current public-client values; never use a service-role/admin key.
4. Merge the workflow, daemon/BuildKit configuration, Dockerfile, contracts, and documentation after the separate auth bridge is complete.
5. Run one CI-green release as the cold native baseline. Record runner architecture, BuildKit disk use, per-stage duration, pushed bytes, and both immutable digests.
6. Run a later ordinary change and record local cache hits, cache size, remaining disk, and push duration before making a quantitative speed claim.

Rollback is fail-closed: remove or disable the `musuw-build-x64` runner label to stop construction, or revert the workflow change before another release. Removing the named builder state forces the next job to build cold but does not delete immutable GHCR images or alter production. Never roll back by restoring ARM/QEMU construction or registering Tokyo as a runner.

## Open Questions

No provider or billing decision remains. Host capacity should be revisited only if measured native cold/warm runs show sustained memory pressure, insufficient disk margin, or unacceptable immutable-image upload time.
