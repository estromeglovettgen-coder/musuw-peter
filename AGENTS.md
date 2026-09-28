# Musuw / WeKnora workspace

This repository is a thin Musuw product wrapper around the complete upstream
WeKnora v0.7.2 source in [`weknora/`](weknora/).

## Start here

1. Read the root [`README.md`](README.md).
2. Treat [`weknora/`](weknora/) as the application authority.
3. Treat [`auth/`](auth/) as the Musuw login shell and
   [`storefront/`](storefront/) as the public homepage.
4. Use [`scripts/musuw-dev`](scripts/musuw-dev) for day-to-day host-mode
   development. Docker is dependency-only locally; use preview/release only
   for container validation or a server update.
5. Use [`integration/`](integration/) and [`scripts/`](scripts/) for runtime
   wiring only.

## Rules

- Prefer an existing WeKnora capability over a custom parallel implementation.
- Keep model keys, Supabase secrets, and provider credentials on the server;
  never expose them to browser code or checked-in configuration.
- Treat [`docs/external-credentials-registry.yaml`](docs/external-credentials-registry.yaml)
  as the single metadata-only credential inventory and
  [`docs/SECRETS_AND_INTEGRATIONS.md`](docs/SECRETS_AND_INTEGRATIONS.md) as the
  operator playbook. Do not duplicate values in project docs or examples.
- Paddle Live production is one separately reviewed unit: keep SDK mode,
  client token, six price IDs, API key, webhook secret, destination and default
  payment link in Live together. Sandbox remains development/test-only and the
  two environments must never be mixed.
- Preserve upstream licensing and update the v0.7.2 provenance records when an
  application-source change needs a durable attribution record.
- Do not revive historical runtime, protocol, or documentation trees without
  explicit user direction. They are intentionally absent from this project.
- The legacy top-level source folders outside `weknora/`, `auth/`,
  `storefront/`, `integration/`, `scripts/`, and `third_party/` are not an
  active product authority. Do not build new work on them.

Run the targeted tests for the module you touch. For the active frontend, use
`weknora/frontend`; for the login shell, use `auth`; for the public homepage,
use `storefront`.
