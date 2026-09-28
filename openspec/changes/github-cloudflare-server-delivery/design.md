> **Historical baseline.** Steps below record the previously verified direct
> production path. `deploy-isolated-staging` supersedes it with automatic
> staging-only delivery and manual same-digest production promotion. Do not use
> this file as the current runbook; use `docs/DEPLOYMENT.md`.

## Delivery boundaries

The repository is the only source of code used for a release. The active
packages are:

1. `storefront/` — the public `musuw-site` Cloudflare Worker.
2. `auth/` and `weknora/frontend/` — browser assets built into the production
   frontend image by GitHub Actions.
3. `weknora/`, `integration/` and the production scripts — the app image,
   fixed Compose definition and server delivery seam.

The Worker never receives server credentials or authenticated API behavior.
The server never receives Cloudflare credentials.

## One release path

Every release starts with a full 40-character Git SHA that exists on `main`
and has a successful CI run. The two target jobs use that same SHA:

1. CI checks the active packages, source allowlist, lockfiles and secret
   boundary and emits its immutable run/SHA identity.
2. The successful CI run starts the storefront job, which builds only
   `storefront/`, deploys `musuw-site`, and
   probes `musuw.com` and `www.musuw.com`.
3. The same successful CI run starts the production job, which builds and
   pushes the app/frontend images from that SHA to GHCR, records their returned
   digests, then materializes and uploads the allowlisted source with the
   restricted SSH key and pinned host keys. Manual full-SHA reruns use the same
   checks and path.
4. The server gate verifies the SHA and manifest, receives the short-lived
   GHCR token over stdin, and invokes the one checked-in Compose file.
5. The server logs in with a temporary Docker config, pulls the exact digests,
   runs `docker compose up -d --no-build --force-recreate app frontend` in the
   existing project, and checks `/health`.

The release is intentionally in place in the existing server project and uses
the one checked-in deployment handoff.

## Source bundle

The source manifest is generated with Git from the selected commit. It lists
tracked application code, lockfiles, Compose files, scripts, documentation,
licenses and provenance. The upload excludes credentials, `.env` values,
private keys, dependencies, generated output, logs, volumes, database dumps
and server runtime directories. Browser bundles are built in GitHub and remain
inside the GHCR images; generated build output is not uploaded as source. The
restricted gate accepts only the expected
source path and the selected SHA.

## Server state

The Compose file references exact GHCR image digests, server-owned environment
files and named volumes. The server never builds images or prunes its build
cache, and it never removes application data, volumes or secrets. No server
state or long-lived registry credential is copied into GitHub or the source
bundle.

## Verification

The target jobs fail when their health probes fail. The operator checks:

- `https://musuw.com/` and `https://www.musuw.com/` for the storefront;
- `https://app.musuw.com/health` for the server; and
- the selected SHA in the workflow log and server release output.

The release record needs only the SHA, target, workflow run, source-manifest
hash and health result so that an operator can identify what is serving.

The verified release is commit `e85c95abe5041f80107983fef4387449a4b647e4`,
with CI run `31968180478`, storefront run `31968398025`, and production run
`31968398026`. `app.musuw.com` remains the Cloudflare Tunnel entry point to
the server; it is not a Worker deployment target.
