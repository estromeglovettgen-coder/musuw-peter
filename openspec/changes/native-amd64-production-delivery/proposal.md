> **Superseded:** `migrate-builds-to-github-hosted` replaces this Beijing build design after the repository became public. This change remains as historical evidence; its unrun activation measurements were closed as superseded, not reported as executed.

## Why

Production images are currently built as `linux/amd64` on an Apple Silicon Docker Desktop runner, so expensive QEMU emulation, intermittent emulation crashes, and disposable builder state make releases slow and unreliable. An already-paid, otherwise idle native x86_64 Linux host can remove that failure mode without consuming exhausted GitHub-hosted minutes or turning the Tokyo production server into a runner.

## What Changes

- Keep CI and storefront on their existing `MUSUW_ACTIONS_RUNNER || ubuntu-latest` route, and keep lightweight production authorization plus deployment on the trusted `musuw-release` Mac runner.
- Route only the heavy production build job to the exact `musuw-build-x64` label and fail closed unless the runner, kernel, and Docker server are native AMD64.
- Package the already-authorized SHA once on `musuw-release` as an exact-SHA production source projection with `git archive`, excluding only `weknora/website-docs/**` and `weknora/docs/images/**`, upload that single deterministic tarball through GitHub's existing immutable Actions Artifact service, and let the regional run-only build retrieve the same-run artifact through the official REST/blob path instead of Git or codeload.
- Give the build job only artifact-read, contents-read, and package-write access plus three browser-visible repository variables; do not attach the production Environment or reference any production/SSH secret.
- Pass only validated immutable app/frontend digest references from build to the existing Mac deploy job, which continues the forced-command SHA-only Tokyo release seam without rebuilding.
- Use the preinstalled official Docker/Buildx CLI with one fixed Docker-container builder, private persistent `BUILDX_CONFIG`, temporary credential-only `DOCKER_CONFIG`, and `docker buildx rm --keep-state` so ordinary layers and Go cache mounts survive jobs and interrupted registrations recover while each container is recreated from the current checked-in configuration; keep the regional build job free of Action downloads and bound automatic BuildKit GC to a 10 GB maximum-use threshold and a 12 GB free-space floor.
- Route Docker Hub bootstrap and base-image pulls through Tencent Cloud's official regional mirror at both the Docker daemon and BuildKit layers, and fail the native preflight if the daemon-side mirror is missing.
- Route Debian and Go dependency downloads through Tencent Cloud's documented regional mirrors while retaining Go's authenticated mainland checksum endpoint, so cold builds do not depend on unreachable global defaults.
- Avoid a separate `mode=max` registry cache over the roughly 3 Mbps uplink. Push only the immutable release images and rely on registry blob deduplication plus local BuildKit state.
- Preserve Dockerfile stable-layer ordering, bounded apt network behavior, and the pinned Go migrate tool.

## Capabilities

### New Capabilities

- `native-production-delivery`: Defines native build-only runner routing, immutable build-to-deploy handoff, secret isolation, bounded persistent local cache, and cold-cache recovery.

### Modified Capabilities

None.

## Impact

The change affects the production workflow, app Dockerfile, workflow/Dockerfile contracts, actionlint configuration, deployment documentation, and the checked-in Docker daemon and BuildKit configurations. CI and storefront runner routing, application APIs, databases, runtime topology, Tokyo, and the restricted release protocol do not change. Activation requires registering the x86_64 runner with the `musuw-build-x64` custom label, installing the checked-in daemon configuration, and configuring three public repository variables; it uses the repository's existing bounded Actions Artifact facility and does not require GitHub-hosted minutes or another build provider.
