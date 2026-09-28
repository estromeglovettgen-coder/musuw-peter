> **Historical delta.** `deploy-isolated-staging` supersedes automatic server
> publication: CI now builds once and deploys staging; production promotion is
> manual after full Sandbox E2E and reuses the same SHA/digests.

## ADDED Requirements

### Requirement: Server releases use one exact Git SHA

The production workflow SHALL accept a full 40-character Git SHA that exists
on `main` and has a successful CI run. It MUST reject a branch name, mutable
tag, dirty checkout or unverified source before uploading anything.

#### Scenario: A CI-green SHA is selected automatically

- **WHEN** canonical CI succeeds for a full SHA on `main`
- **THEN** the workflow verifies the exact SHA and its successful CI run
- **AND** it builds/pushes the app and frontend images from that SHA to GHCR,
  records their immutable digests, and uploads only the allowlisted source at
  that SHA

#### Scenario: An unverified ref is rejected

- **WHEN** the workflow receives a branch name, an unknown SHA or a SHA without
  a successful CI run
- **THEN** it stops before source upload and server mutation

### Requirement: Upload uses the restricted SSH gate

The production job SHALL upload an allowlisted source bundle through the
restricted `musuw-deploy` SSH key and pinned host keys. The gate MUST accept
only the expected source path and selected SHA; arbitrary shell commands,
unsafe paths, credentials and runtime files MUST be rejected.

#### Scenario: A clean source bundle is accepted

- **WHEN** the bundle contains tracked application source, lockfiles, Compose
  files, scripts, documentation and a checksum manifest
- **THEN** the gate verifies the manifest and SHA and accepts the upload

#### Scenario: Secret or runtime state is excluded

- **WHEN** the bundle contains a private key, `.env` value, dependency tree,
  generated output, log, database dump, volume or server runtime file
- **THEN** the boundary check fails before the server starts the application

### Requirement: The server uses the fixed production Compose definition

After a verified upload, the server SHALL use the checked-in production Compose
file in the existing project. The update is in place: receive the short-lived
workflow token over the restricted stdin channel, log in with a temporary
Docker config, pull the exact GHCR digests, run `docker compose up -d
--no-build --force-recreate app frontend`, and check the application health
endpoints. The deployment MUST stay in the existing server project.

#### Scenario: In-place Compose update is healthy

- **WHEN** the selected SHA has passed CI and the restricted upload succeeds
- **THEN** the server pulls and starts the fixed Compose services in place
- **AND** `/health` returns success for the selected release

#### Scenario: Compose or health check fails

- **WHEN** the image pull, start or health check exits non-zero
- **THEN** the workflow reports a failed server release and does not claim it
  is serving successfully

### Requirement: Server data and secrets remain server-owned

The production workflow MUST NOT upload, print, overwrite or delete server
runtime secrets, databases, object-storage data, Redis/Neo4j volumes or tunnel
credentials. The short-lived GitHub token used for the GHCR pull MUST remain
in stdin/temporary Docker config only and be removed at process exit. Named
volumes and application data remain untouched.

#### Scenario: Application code updates without copying state

- **WHEN** the fixed Compose services start from a new SHA
- **THEN** they use the existing server-owned environment files and named
  volumes
- **AND** no secret value or data volume is present in the upload

### Requirement: The public app hostname remains server-bound

`app.musuw.com` SHALL continue to enter through the existing Cloudflare Tunnel
and reach the server's production Compose services. The storefront Worker
MUST NOT proxy authenticated app, API, upload, or event-stream traffic.

#### Scenario: App traffic uses the server path

- **WHEN** a user opens `app.musuw.com` or the storefront hands off to
  `/auth/start`
- **THEN** Cloudflare Tunnel routes the request to the server
- **AND** no app or auth surface is added to the `musuw-site` Worker

### Requirement: Production publishing follows canonical CI

Pull requests, failed CI runs, mutable tags and the storefront workflow MUST
NOT start a server deployment or expose the server SSH key. A successful
canonical CI run for `main` SHALL start the production workflow with its exact
head SHA. A manual dispatch from `main` SHALL remain available only for an
exact full-SHA rerun that already has successful CI.

#### Scenario: Only a successful canonical CI identity can publish

- **WHEN** canonical CI succeeds for a full SHA on `main`
- **THEN** the production workflow receives that CI run ID and exact head SHA
- **AND** a failed or non-canonical run cannot access the server environment

#### Scenario: Exact SHA can be rerun manually

- **WHEN** an operator dispatches the workflow from `main` with a full SHA
- **THEN** the workflow rechecks that SHA is on `main` and has successful CI
- **AND** it uses the same build, upload and health path as automatic delivery
