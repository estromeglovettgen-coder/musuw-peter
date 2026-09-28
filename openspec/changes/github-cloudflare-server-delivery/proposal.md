> **Historical baseline.** The server-release portion of this change is
> superseded by `deploy-isolated-staging`: automatic delivery now stops at
> staging, and production requires full Sandbox E2E plus manual same-digest
> promotion. Use `README.md`, `docs/DEPLOYMENT.md`, and that later change for
> current operations.

## Why

Musuw needs one obvious delivery path. GitHub should contain the complete
active source, the public storefront should deploy to Cloudflare, and the
application should deploy to the existing server. The previous plan added
several layers around that path and made a normal release difficult to run.

## What changes

- Make `estromeglovettgen-coder/musuw` the canonical source repository.
- Keep pull-request CI for the active frontend, auth shell, storefront, Go
  application, source boundary and secret boundary.
- Build `storefront/` from the exact reviewed Git SHA and deploy it to the
  existing `musuw-site` Cloudflare Worker.
- Build and push immutable app/frontend images from the same exact SHA to GHCR,
  build browser bundles in GitHub Actions, upload the allowlisted source bundle
  through the restricted SSH gate, and let the existing server only pull those
  digests and run the fixed Compose definition.
- Keep server runtime secrets and data on the server. Verify the two public
  targets with small health checks after each deployment.

## Non-goals

This change keeps one server project and one short deployment path. The server
is updated in place during a short maintenance window. A failed release is
simply reported and can be rerun with an exact full SHA after the deployment
issue is corrected. The authenticated application is reached at `app.musuw.com` through
the existing Cloudflare Tunnel to the server; it is not moved into the
storefront Worker.

The authenticated application and auth shell remain served by the production
frontend container.

## Impact

- GitHub: one private repository, one reviewed `main` branch and target
  workflows that select a full SHA.
- Cloudflare: the existing `musuw-site` Worker receives only `storefront/`.
- Server: the existing production Compose services pull exact GHCR digests and
  start in place through the restricted upload path; no server image build is
  performed.
- Operators: the normal release is merge → CI → Cloudflare storefront and
  exact-SHA server upload → health checks. Manual full-SHA reruns use the same
  path.

## Verified release

The current path was exercised from commit
`e85c95abe5041f80107983fef4387449a4b647e4`:

- CI: `31968180478`
- Cloudflare storefront: `31968398025`
- Production server: `31968398026`

All three runs completed successfully and the storefront, app, health, and
auth-handoff probes were healthy.
