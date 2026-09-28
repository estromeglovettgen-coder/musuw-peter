# Musuw

Musuw turns documents and notes into cited answers, connected Wiki pages, and a knowledge graph.

[Open app](https://app.musuw.com/auth/start) · [View demo](https://musuw.com/#demo) · [Media kit](https://musuw.com/press)

![Musuw answering a question with a source citation](storefront/public/images/musuw-query-citation.jpg)

Musuw is a consumer knowledge workspace built from the complete upstream
[WeKnora main source at fixed commit `81142df`](https://github.com/Tencent/WeKnora/tree/81142dfd17b2778087e95d3a317483a2fd909b91)
(the upstream `VERSION` remains `0.7.2`).
Users enter through Musuw's Google or email-OTP sign-in, then use a single,
preconfigured knowledge workspace. Model credentials and infrastructure remain
server-side.

Credential ownership is recorded once in the metadata-only
[`docs/external-credentials-registry.yaml`](docs/external-credentials-registry.yaml);
the operator-facing rules live in
[`docs/SECRETS_AND_INTEGRATIONS.md`](docs/SECRETS_AND_INTEGRATIONS.md). The
production billing contract is **Paddle Live** as one atomic unit. Sandbox is
retained for development/test only; Live and Sandbox client, catalog, API and
destination inputs must never be mixed. Live acceptance is proved without
entering a payment method or creating a real charge.

## Active source

| Path | Responsibility |
| --- | --- |
| [`weknora/`](weknora/) | Application source, including the API, workspace UI, document processing, RAG, Wiki, graph, and built-in model support. |
| [`auth/`](auth/) | Musuw's public Google/email-OTP entry and the handoff to WeKnora's native OIDC session. |
| [`storefront/`](storefront/) | Source for the public homepage at `musuw.com`; its product actions enter the app at `app.musuw.com/auth/start`. |
| [`integration/`](integration/) | Runtime composition for local host-mode work and the production release. |
| [`scripts/`](scripts/) | The small local, preview, and release entry points. |
| [`third_party/weknora/`](third_party/weknora/) | The fixed-main source provenance record and historical v0.7.2 baseline. |

The vendored application is the authority. Keep changes small and local to the
existing WeKnora modules; do not introduce a second product runtime, API, or
authentication system.

## Local use

For everyday work, run the application on the host with hot reload:

```bash
npm run dev
# http://localhost:4190
```

This starts Docker only for PostgreSQL, Redis, DocReader, Neo4j, and SearXNG.
The Go API, authentication shell, and workspace UI run directly from this
checkout. `npm run dev:down` stops both host processes and those dependency
containers while preserving their data volumes.

Use `npm run preview` only for a production-like full Docker rebuild. Successful
`main` CI automatically starts the immutable build and staging-only delivery;
production still requires the documented manual promotion. Reserve
`npm run release -- <full-sha>` for an explicit exact-SHA rerun.

## Production delivery

GitHub is the only production code entry point. Pull requests run CI; after a
successful CI run on `main`, GitHub Actions automatically deploys the public
storefront and builds the immutable app/frontend pair for staging acceptance:

- `storefront/` is built in GitHub and deployed to the Cloudflare Worker
  `musuw-site`, serving `musuw.com`, `www.musuw.com`, and the separate labeled
  static partner demonstration at `partners.musuw.com`.
- The authenticated frontend and auth shell bundles, plus the Go application
  and frontend runtime images, are built in GitHub. The two runtime images are
  pushed to GHCR and deployed by immutable digest to `staging.musuw.com`; the
  server only pulls them and runs the checked-in Compose wrapper with
  `--no-build`.
- Production is never promoted by the automatic `workflow_run`. Operators must
  complete the full Paddle Sandbox E2E, then manually promote the same Git SHA
  and recorded image digests through the protected `server-production`
  Environment and its account-owner approval.

`app.musuw.com` stays on the simple Cloudflare Tunnel → server Nginx path for
the API, login, uploads, and streaming responses. It is not a second Worker
proxy. `storefront-production` contains only Cloudflare credentials;
`server-production` contains only the restricted deploy key, public build
inputs, and pinned host keys. Runtime/database/model/tunnel secrets remain on
the server.

There is no release transaction, backup choreography, blue/green stack,
secondary edge/readiness path, or server-side build. A failed release is a
failed run; rerun or return to a known-good revision by manually dispatching
the workflow with its full 40-character SHA. Local preview is for development
and verification only and is not a production deployment path.

## Provenance and licenses

- [WeKnora source provenance](third_party/weknora/active-upstream-source.json)
- [v0.7.2 local-delta provenance](third_party/weknora/v0.7.2-provenance.json)
- [WeKnora license and upstream notices](weknora/LICENSE)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Historical OpenSpec, verification, and handoff records document past decisions;
they are not current runtime instructions. This README, the operator documents
listed in [`docs/README.md`](docs/README.md), the checked-in release scripts,
and the active source are the current authority.
