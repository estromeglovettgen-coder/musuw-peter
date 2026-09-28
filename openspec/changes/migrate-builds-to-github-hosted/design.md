## Context

The repository is public, so standard GitHub-hosted runners are the simplest delivery substrate. CI, Storefront, production authorization, and image construction now use hosted Ubuntu, but the last deployment job still depends on `musuw-release`. A real hosted cold build took 8m9s because the workflow explicitly discarded BuildKit state between runs. The final self-hosted job also failed direct Tokyo SSH independently of successful image construction.

## Goals / Non-Goals

**Goals:**

- Run every CI, Storefront, authorization, native AMD64 construction, and production deployment job on pinned `ubuntu-24.04`.
- Use official Docker actions and separate GitHub Actions cache scopes for the two immutable images.
- Preserve the existing CI-green exact-SHA authority, immutable GHCR digest checks, and restricted deployment protocol.
- Keep the Tokyo runtime, server-side restricted command, secrets, and network topology unchanged.

**Non-Goals:**

- Changing the server firewall, SSH account, host keys, or restricted server command.
- Unregistering, stopping, or reconfiguring old runners as part of this code change.
- Adding larger runners, Docker Build Cloud, a proxy, a second build service, or a new cache backend.
- Changing production topology, runtime secrets, images, APIs, or data.

## Decisions

### Pin every delivery job to `ubuntu-24.04`

CI, Storefront, production authorization, production construction, and final SSH deployment use the explicit standard label. The deploy job keeps the `server-production` Environment, exact-SHA checkout, GitHub Secrets, pinned `known_hosts`, restricted `musuw-deploy` account, and existing server gate. No runner-specific label remains.

### Replace the regional source artifact transport with exact-SHA checkout

Authorization still proves a full SHA belongs to `origin/main` and has successful canonical CI. The build job then uses official `actions/checkout` with that output SHA and asserts `HEAD` matches it before executing source. The custom projection, ranged Azure Blob downloader, and source artifact exist only for the slow Beijing route and are removed rather than adapted.

### Use official Docker actions and scoped GitHub Actions caches

Official `actions/setup-node`, `docker/setup-buildx-action`, `docker/login-action`, and `docker/build-push-action` own tool setup and cleanup. The app and frontend use distinct `type=gha` scopes with `mode=max`, preventing one image from overwriting the other's cache. Cache export is an optimization and uses `ignore-error=true`; image construction, push, remote tag-to-digest validation, and deployment remain fail-closed.

### Preserve the existing image and release proof

The two official Buildx pushes retain immutable tags, minimum provenance, OCI source/revision labels, and distinct digest outputs. A shell validation step resolves both immutable tags from GHCR and requires equality with the action digests before deploy receives `repository@sha256` references. The production Environment, non-cancelling concurrency group, exact-SHA checkout, and restricted deploy script remain unchanged.

## Risks / Trade-offs

- [Cache contents are reusable input, not release authority] → Cache only BuildKit layers; still build an exact checkout, push an immutable SHA tag, and validate the registry digest on every run.
- [GitHub-hosted SSH can occasionally fail] → Keep the existing finite prepare and upload retries, make no network topology change, and require a real successful hosted deployment for acceptance.
- [A lost SSH response can make final-command retry ambiguous] → Do not blindly retry the activation command; the workflow reports failure and an operator reruns the exact CI-green SHA.
- [Standard runners have finite ephemeral disk] → Keep BuildKit concurrency bounded and retain the 90-minute job limit; official post actions remove login and builder state.

## Migration Plan

1. Pin the final deploy to `ubuntu-24.04` and replace raw Docker setup/build commands with official actions.
2. Add separate GHA cache scopes for app and frontend while retaining exact digest validation.
3. Update static workflow contracts and deployment documentation.
4. Push and require fresh CI, Storefront, production image construction, hosted SSH deploy, and public health success.

Rollback is a workflow revert and an exact-SHA redeploy of the previous green revision. No production data, image, firewall, or secret migration is involved.

## Open Questions

None.
