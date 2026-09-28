> **Historical completion record.** The direct production-delivery steps below
> were completed for the recorded release and are now superseded by
> `deploy-isolated-staging`. Current production promotion is manual and consumes
> the staging-approved SHA/digests.

## 1. GitHub source

- [x] 1.1 Use `estromeglovettgen-coder/musuw` as the private canonical
  repository and keep `main` as the release branch.
- [x] 1.2 Track the active source under `weknora/`, `auth/`, `storefront/`,
  `integration/`, `scripts/`, tests, documentation, licenses and provenance.
- [x] 1.3 Keep credentials, `.env` values, dependencies, generated output,
  logs, dumps, volumes and unrelated historical copies out of Git.
- [x] 1.4 Keep lockfiles, safe examples and upstream license/provenance files.

## 2. CI authority

- [x] 2.1 Keep one root CI workflow; nested upstream workflows must not publish
  the product.
- [x] 2.2 Run the frontend, auth shell and storefront tests, type checks and
  builds with their checked-in lockfiles.
- [x] 2.3 Run the active Go/DocReader checks and the source/secret boundary
  checks.
- [x] 2.4 Require a successful CI run for the exact full SHA before either
  target receives deployment credentials.

## 3. Cloudflare storefront

- [x] 3.1 Keep a Worker-scoped Cloudflare token in the
  `storefront-production` GitHub Environment.
- [x] 3.2 Build only `storefront/` from the selected SHA and deploy `musuw-site`
  from GitHub Actions.
- [x] 3.3 Probe `musuw.com`, `www.musuw.com`, locale output and the documented
  `app.musuw.com/auth/start` handoff.
- [x] 3.4 Keep app/auth/backend source and credentials out of the Worker bundle.

## 4. Server upload and Compose

- [x] 4.1 Materialize an allowlisted source bundle from the selected full SHA
  and include a checksum manifest.
- [x] 4.2 Upload only that bundle through the restricted SSH gate with pinned
  host keys; reject mutable refs, unsafe paths and arbitrary commands.
- [x] 4.3 Invoke the one checked-in production Compose definition on the
  existing server project. The update is in place and may include a short
  maintenance window.
- [x] 4.4 Build and push the app/frontend images in GitHub Actions, record the
  returned GHCR digests, and write those exact refs into the release input.
- [x] 4.5 Stream the short-lived workflow token over the restricted gate,
  pull the exact digests on the server, run Compose with `--no-build`, and
  check `/health`; never remove application data, volumes or secrets.

## 5. Handoff

- [x] 5.1 Document merge → CI → exact SHA → Cloudflare/server deployment in
  `docs/DEPLOYMENT.md`.
- [x] 5.2 Configure the production GitHub Environment secrets and restricted
  server key; keep storefront and server credentials isolated.
- [x] 5.3 Run one final production release from a CI-green SHA and record the
  storefront/server health results. Verified commit:
  `e85c95abe5041f80107983fef4387449a4b647e4`; CI run `31968180478`, storefront
  run `31968398025`, and production run `31968398026` all succeeded, with
  public storefront, app, health, and auth-handoff probes healthy.

## Scope guard

Keep one source path, one server project and one deployment protocol. If a
deployment fails, fix the source and rerun the same short path.
