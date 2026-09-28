## 1. Diagnose and select the durable architecture

- [x] 1.1 Inspect failed/successful workflow logs, Mac runner state, Docker architecture, BuildKit cleanup, and GitHub-hosted quota without mutating external systems
- [x] 1.2 Compare Mac QEMU, GitHub-hosted x64, a dedicated x64 host, and managed remote builders against reliability, cost, cache, bandwidth, and operations constraints
- [x] 1.3 Select the already-paid native x64 host for production construction only while preserving existing CI/storefront and Mac authorize/deploy routes

## 2. Implement native routing and immutable handoff

- [x] 2.1 Restore CI/storefront runner-variable routing and lock out every required GitHub-hosted-only label
- [x] 2.2 Route production authorize/deploy to `musuw-release` and only build to `musuw-build-x64`, with native architecture preflight and no QEMU
- [x] 2.3 Remove the production Environment and every secret reference from build; generate build/deploy auth-public input from the same three browser-visible repository variables
- [x] 2.4 Validate and expose two immutable image digest refs from build, then consume them in deploy without rebuilding
- [x] 2.5 Package the authorized exact-SHA production source projection on Mac with only the two approved documentation-tree exclusions, deliver one digest-bound same-run Actions Artifact to the run-only Beijing build with four-way bounded range downloads and slow-link handling, and retain authorization and deploy Git contracts

## 3. Implement bounded persistent cache

- [x] 3.1 Configure the preinstalled official Buildx CLI with a fixed Docker-container builder name, checked-in config, private persistent client state, temporary credential-only Docker config, interrupted-registration recovery, and `docker buildx rm --keep-state` cleanup
- [x] 3.2 Bound BuildKit to two parallel steps, a 10 GB maximum-use threshold, and a 12 GB free-space floor
- [x] 3.3 Remove maximum-mode registry cache and optional build-record uploads while retaining immutable GHCR pushes, summaries/logs, and content-addressed layer reuse
- [x] 3.4 Pin migrate, preserve Go module/compiler mounts, retain bounded apt behavior, and keep volatile release metadata after stable layers
- [x] 3.5 Cap the production browser-build Node heap at 3072 MiB and keep browser/image construction sequential in one job
- [x] 3.6 Route daemon bootstrap and BuildKit base-image pulls through the Tencent Cloud regional mirror, check in the daemon contract, and fail preflight on daemon drift
- [x] 3.7 Consume the existing regional apt seam and configure Tencent Cloud's documented Go module mirror with Go's authenticated mainland checksum endpoint before every Go dependency command

## 4. Lock repository contracts and documentation

- [x] 4.1 Add red-first workflow contracts for routing, permissions, native preflight, zero build-job `uses:`, no secrets/QEMU/hosted dependency, immutable outputs, and local-builder selection
- [x] 4.2 Add Dockerfile and BuildKit contracts for cache mounts, GC/concurrency limits, apt policy, tool pin, and layer invalidation order
- [x] 4.3 Configure current actionlint custom labels and document host boundaries, bandwidth choice, activation, cold-cache recovery, and rollback
- [x] 4.4 Add a red-first contract for same-run Artifact identity, credential-separated REST/blob retrieval, dual digests, safe staging/workspace replacement, required source inputs, and the absence of Git/codeload in the build job

## 5. Verify and activate

- [x] 5.1 Run local workflow contracts, current actionlint, Dockerfile checks, strict OpenSpec validation, static production verification, and adjacent release-seam tests
- [x] 5.2 After the auth bridge is complete, register/verify `musuw-build-x64`, its exact `.nvmrc` Node toolcache and Docker/Buildx access, retain `MUSUW_ACTIONS_RUNNER=musuw-release`, and configure the three public `VITE_*` repository variables without deleting existing host services
- [x] 5.3 Superseded before activation by `migrate-builds-to-github-hosted`; no cold Beijing release measurement is claimed
- [x] 5.4 Superseded with 5.3; no warm Beijing cache measurement or speed claim is retained
