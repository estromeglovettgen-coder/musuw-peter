# Musuw active-source manifest

This file records the allowlist used for the first `estromeglovettgen-coder/musuw`
repository baseline. It is intentionally written as a release boundary, not
as a dump of a local workspace. The active Musuw source, delivery workflows,
deployment contracts, OpenSpec records, and provenance files are reviewed
together before each publication.

## Included

- Root product metadata and safe configuration examples: `README.md`,
  `AGENTS.md`, `THIRD_PARTY_NOTICES.md`, `UPSTREAM_PROVENANCE.md`,
  `SOURCE_MANIFEST.json`, `SOURCE_MANIFEST.md`, `.gitignore`, package/lock/
  config files, and the root OpenSpec tree.
- `weknora/`: the active WeKnora v0.7.2 application source, including the Go
  API (`cmd/server`, `internal`), document reader, migrations, workspace
  frontend source, tests, docs, examples, and build configuration.
- `auth/`: the Musuw Google/email-OTP login shell source and tests.
- `storefront/`: the `musuw-site` Worker source, public assets, tests, and
  lockfile.
- `integration/`: the local host-mode and production composition files used by
  the app/auth/backend release seam.
- `.github/workflows/`: the root CI, storefront, and production delivery
  authorities. Nested upstream workflows remain excluded.
- `docs/`: release and deployment runbooks.
- `scripts/`: the Musuw local/preview/release entry points, CI scanners,
  local development and production release scripts, and release simulation
  checks.
- `openspec/`: the reviewed product and delivery change records.
- `third_party/`: upstream source and license provenance records.

## Explicit exclusions

- Credentials and local values: `.env.local`, non-example `.env` files,
  private keys/certificates, runtime secrets, and local state.
- Generated/dependency output: `node_modules`, `dist`, `build`, `.next`,
  `.vite`, `.wrangler`, caches, coverage, logs, test results, databases,
  object-store dumps, and compiler metadata.
- The upstream root `weknora/server` and `weknora/desktop` binaries. The
  backend source at `weknora/cmd/server` is retained because it is the source
  used to build the server image.
- Unused `weknora/frontend/src/assets/fonts/TencentSans.ttf`.
- Legacy product trees and release experiments: top-level `backend/`, `web/`,
  `src/`, `migrations/`, `fixtures/`, `conformance/`, `contracts/`,
  `toolchains/`, `docker/`, root `tests/`, `test-results/`, `.runtime/`,
  `.codex/`, `compose.m35.*`, and `scripts/m35/` (including their M1/M2/M3
  and M35 historical fixtures).
- Upstream nested GitHub workflow files. The root workflow is the only product
  delivery authority; upstream issue templates and dependency metadata are
  retained under `weknora/.github/`.

## Review gates

Before committing this baseline, CI must fail closed when a tracked path
matches an exclusion, a secret/private-key sentinel, an unexpected large
binary, or a symlink outside the allowlist. The approved `xlsx-0.20.2.tgz`
archive is the one intentional source archive and is covered by the notices
in `THIRD_PARTY_NOTICES.md`.

The public `/press` downloads additionally include four reviewed Musuw MP4
feature videos and `musuw-media-kit.zip` under `storefront/public/media/press/`.
The scanner pins each of those five exact paths to its reviewed SHA-256 digest;
this also permits that specific media kit to exceed the normal 8 MiB binary
limit. Other video/archive paths and changed bytes remain rejected. The kit
contains only public media and its public README, not internal reports.

The baseline count scope is all Git-tracked regular files selected by this
allowlist, excluding the dynamic `SOURCE_MANIFEST.json` publication metadata
and generated output. `SOURCE_MANIFEST.json` records the current baseline
commit, remote/ref, file count, and byte total. Updating that publication
metadata does not change the selected-file scope or its recorded totals.
