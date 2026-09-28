# Musuw delivery workflow

GitHub is the only source of production code. The repository is
`estromeglovettgen-coder/musuw` and `main` is the release branch.

The delivery surfaces are deliberately small:

- `storefront/` is the public marketing site and is deployed to the existing
  Cloudflare Worker `musuw-site` (`musuw.com` and `www.musuw.com`).
- GitHub Actions builds the `weknora/frontend/` and `auth/` browser bundles,
  builds the Go application and frontend runtime images, pushes those two
  images to GHCR, and records their immutable digests. The workflow deploys
  those digests to staging automatically; production only pulls the same
  staging-approved pair after the manual promotion gate. Both targets use
  their checked-in Compose wrappers with `--no-build`.

## Runtime topology

- `musuw.com` and `www.musuw.com` → Cloudflare Worker `musuw-site` (the
  `storefront/` static site built by GitHub).
- `partners.musuw.com` → the same Worker, serving the isolated static partner
  demonstration from `storefront/public/partner-board/`. Its labeled scenario
  is separate from the production billing ledger and has no API access.
- `app.musuw.com` → Cloudflare Tunnel → the server's Nginx → the GitHub-built
  GHCR `frontend` and `app` images. This keeps API, login, uploads, and
  streaming responses on the existing server path instead of adding a Worker
  proxy.

The current production Lighthouse is the Tokyo host (`musuw-tokyo`). The
Cloudflare tunnel has one active connector at a time; keep the former Hong
Kong runtime intact as a stopped recovery copy and never run both connectors
for the same production hostname during a cutover.

The single credential inventory is [`external-credentials-registry.yaml`](external-credentials-registry.yaml),
with the operator playbook in [`SECRETS_AND_INTEGRATIONS.md`](SECRETS_AND_INTEGRATIONS.md)
and the staging runbook in [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md). The
reviewed production boundary is one complete Paddle Live unit. Staging is a
separate Sandbox test unit; a Sandbox value in production or a mixed Live/Sandbox
unit is a configuration error.

## Normal path

1. Push a change to a branch and open a pull request. CI runs the required
   frontend, auth, storefront, Go, DocReader, source-boundary and secret checks.
2. Merge the reviewed change to `main`. The successful CI run identifies the
   resulting full 40-character SHA; branch names and dirty checkouts are never
   release identities.
3. The storefront workflow receives that successful CI result, checks the
   exact SHA,
   builds only `storefront/`, and deploys it to `musuw-site`. It then checks
   both public domains and the documented product handoff.
4. The production workflow receives the same successful CI result and builds
   the app/frontend pair exactly once on native `ubuntu-24.04`. Authorization
   proves that the selected full SHA belongs to canonical `origin/main` and has
   successful CI; the build pushes both immutable GHCR digests and records them.
   The hosted build receives no production or staging secret and no SSH input.
   The workflow then runs `staging-only` through the independent GitHub
   `staging` Environment and restricted staging SSH gate. `workflow_run` is
   staging-only by default; it never promotes production.
5. Operators complete the full Paddle Sandbox billing/entitlement acceptance
   in [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md), including purchase,
   upgrade, cancellation/expiry, recovery, signed webhook retry/idempotency and
   ordering, membership, OpenRouter allowance, customer portal and history.
   Only after every item is green may a manual `promote` dispatch provide the
   exact staging run ID and the same full SHA and select
   `full-sandbox-e2e-green`. Promotion downloads and validates the prior staging
   deployment record, verifies the currently running staging SHA/digest pair
   through the remote gate, compares both refs, verifies that
   `server-production` still has a required reviewer, and only after the owner
   approves that Environment enters production. Promote does not rebuild or
   resolve mutable tags; an automatic smoke result never claims full E2E acceptance.
6. Production receives a short-lived GitHub token over the restricted stdin
   channel, logs in to GHCR using a temporary Docker config, pulls the exact
   digests, recreates only `app` and `frontend` with `--no-build`, and checks
   `/health`. The token and temporary config are removed at exit. A failed
   staging or promotion command is reported as failed; production data, Live
   billing, runtime secrets, and named volumes remain untouched.

There are two server Compose projects and two current-release roots. Production
is `weknora-v072-production`; staging is `weknora-v072-staging`. They share only
the deliberately shared Cloudflare edge network and the immutable app/frontend
image digests. PostgreSQL, Redis, Redis namespace, files, DocReader temporary
data, runtime directories, Supabase projects, Paddle environments, OpenRouter
workspaces, R2 buckets, secrets, and current pointers are separate. Do not add
parallel repositories, temporary runtime modes, extra release state, or a second
deployment protocol.

The delivery intentionally has no release-transaction ledger, backup
choreography, blue/green stack, secondary edge/readiness path, or server-side
build. Staging failure stops only the staging project and retains its test data
for review. Production preflight failure performs no runtime mutation. If an
app/frontend replacement later fails health or public checks, the release
helper restores the prior runtime files and recreates the prior immutable image
pair from the prior release source; the current pointer and Live unit remain on
the prior release. A failed automatic restore escalates to the existing manual
stop-and-retain-disk procedure.

## Source and upload boundary

The owner's immediate model release on 2026-09-19 has a separately recorded,
exact-version acceptance class, `reviewed-model-release`; see
[`MODEL_RELEASE_20260919.md`](MODEL_RELEASE_20260919.md). It retains all normal
production approval and immutable-artifact checks, rejects other version/run
combinations, and explicitly does not claim full Sandbox lifecycle acceptance.

The release bundle is materialized from tracked files at the selected SHA. It
contains application source, lockfiles, the production and staging Compose
definitions, scripts, safe examples and documentation only. It must not contain
`.env` values, private keys, dependency directories, generated output, logs,
databases, volumes or server runtime files.

The restricted SSH key and pinned `known_hosts` entry are supplied only to the
deploy job, never to the native image-build job. The gate must reject a mutable ref, an unsafe path, an
unallowlisted file or an arbitrary shell command. Runtime secrets, database and
object-store data, Redis/Neo4j data and tunnel credentials stay on the server;
the upload never copies or prints their values.

## Cloudflare storefront

The Worker-scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are
secrets of the `storefront-production` GitHub Environment. The storefront job
receives no database, model-provider, account-authentication or billing
credentials. `storefront/wrangler.jsonc` is the deployment configuration. The
Worker serves the public site and, when configured, the bounded homepage
customer-service config and short-token exchange endpoints. Its only
application-scoped credential is `MUSUW_CUSTOMER_SERVICE_PUBLISH_TOKEN`, an
embed-channel publish token that cannot grant account, tenant-management,
billing, or provider access. Product actions hand off to
`https://app.musuw.com/auth/start`.

After deployment, check both domains, the HTML language signal and the auth
handoff. A Cloudflare command succeeding without these probes is not enough.

## Staging edge and application

`staging.musuw.com` is an exact, separate Cloudflare hostname. Cloudflare
terminates TLS and the existing Tunnel routes it to the staging frontend's
`staging-web` alias; production's `web` alias and `app.musuw.com` route remain
unchanged. No staging app, database, Redis or DocReader port is publicly bound.
Reuse Cloudflare Access when it can protect the hostname without another network
layer, but explicitly bypass Access only for the public
`POST /api/v1/billing/paddle/webhook` destination (and the minimum health probes
needed for verification). The origin always verifies Paddle's raw-body signature.

Every staging workspace, auth, API and static response must carry
`X-Robots-Tag: noindex, nofollow`. Verify the exact host over HTTPS, check the
noindex header on `/`, `/auth/start`, `/api/v1/billing/paddle/public-config` and
an asset, and confirm the public config reports Sandbox without exposing server
credentials. See [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md) for the full
edge, Compose and provider checklist.

## Production server

The hosted build job receives the selected full SHA, three browser-visible
repository variables required by the auth shell, and a job-only `GITHUB_TOKEN`
with `contents: read` and `packages: write`. It is not attached to the
`server-production` Environment. The deploy job receives the restricted
`musuw-deploy` SSH key,
pinned host keys, the existing public server environment file, the same three
repository variables used to generate `auth-public.env`, the validated image
refs, and a separate job-only token with `packages: read`. The server owns all
private configuration and never stores that token. The deploy job also runs on
standard GitHub-hosted `ubuntu-24.04`; no local or self-hosted runner is part of
the normal path.

The fixed production Compose files remain the production runtime definition. The
update sequence is GitHub build/push → upload/verify SHA and manifest → GHCR
login → pull exact digests →
`scripts/weknora-production/compose.sh --edge up -d --no-build --no-deps
--force-recreate app frontend` → health checks. Do not replace the checked-in
wrapper with raw `docker compose`: the wrapper fixes the production project,
Compose files, profiles, OIDC boundary and target architecture. Keep named
volumes and server-owned runtime files in place; the server never builds images
or prunes its build cache. Staging uses its own overlay, project name and runtime
root as documented in
[`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md); it never changes this
production sequence.

On a fresh host, install the tunnel token with
`scripts/weknora-production/install-tunnel-token.sh` (the token file is
server-owned, not tracked). The installer rejects symlinks and requires the
cloudflared runtime UID (65532) to own the file with mode `0600`; it reports
only numeric ownership and mode. During a cutover, quiesce the current writers,
seal and verify the data snapshot, stop the old connector, restore and
health-check the target, and only then start the target connector. The current
rollback posture is stop-and-retain-disk: stop Tokyo public traffic and keep
the Hong Kong runtime, releases, volumes, and Tunnel inputs stopped for an
operator-led recovery. After the migration observation window the Hong Kong
guest was powered off only after a zero-public-service precheck; its disk and
volumes remain retained. This migration does not promise a hot reverse-sync or
safe traffic flip without a separately verified data restore.

Useful checks after a release are:

```text
curl -fsS https://musuw.com/
curl -fsS https://www.musuw.com/
curl -fsS https://app.musuw.com/
curl -fsS https://app.musuw.com/health
curl -fsS https://app.musuw.com/auth/start
# Staging probes are read-only and must report Sandbox/noindex.
curl -fsS https://staging.musuw.com/health
curl -fsSI https://staging.musuw.com/ | grep -i '^x-robots-tag:.*noindex'
```

The public storefront and the server release are independent: a green
storefront job does not imply a green server job, and a server upload never
changes the Cloudflare Worker.

## Required repository settings

All CI jobs, Storefront build/deploy, and production authorize/build/deploy
jobs are pinned to `ubuntu-24.04`. The repository variable
`MUSUW_ACTIONS_RUNNER` and the `musuw-release` runner label are not required.
The Tokyo production host must never be registered as a GitHub Actions runner.

Production authorization retains the exact-SHA ancestry and successful-CI
proof. Production construction checks out that exact SHA with official
`actions/checkout`, disables persisted checkout credentials, and verifies
`HEAD` before installing dependencies or pushing images. There is no production
source Artifact, custom ranged downloader, Git/codeload workaround, or Beijing
builder dependency.

The hosted build validates native AMD64 Docker, installs the `.nvmrc` Node
version with official `actions/setup-node`, and uses global Debian and Go
sources. It does not require Tencent Docker daemon, BuildKit, APT or Go mirrors,
preinstalled Node, or persistent runner-local state. Official
`docker/setup-buildx-action`, `docker/login-action`, and
`docker/build-push-action` own setup and cleanup. App and frontend layers use
separate `type=gha,mode=max` scopes so they cannot overwrite each other's
cache. Cache export failure is non-fatal; source construction, image push,
digest validation, and deployment are still fail-closed.

GHCR login uses the job token through the official login action and its
always-running logout cleanup. Each official Buildx push keeps the immutable
tag, labels, build arguments, native platform and minimum provenance. The
action digest and its remote immutable tag are resolved from GHCR and must
match before deploy receives them. The hosted build must not store or receive
the production SSH key, host data, server environment secrets, or Tokyo
credentials.

Keep the following values in GitHub settings or on the server, never in checked-in
files:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- workflow `GITHUB_TOKEN` package-write permission for the hosted build job
  and package-read permission for the deploy job
- repository variables `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_WEKNORA_OAUTH_CLIENT_ID`; these are
  browser-visible public-client values, never server/admin credentials
- the restricted production SSH key and pinned `known_hosts`
- the public server environment file; `auth-public.env` is generated from the
  same three repository variables used by the browser build
- all database, object-store, model, OIDC, Supabase service and tunnel secrets

The target-specific split is intentionally narrow:

| Settings location | Allowed production inputs |
| --- | --- |
| `storefront-production` | Cloudflare account ID, Worker-scoped API token, and the one bounded homepage embed channel ID/publish token pair. |
| Repository variables | Three browser-visible `VITE_*` values shared by native build and deploy. |
| `staging` | Staging SSH key/host settings, staging public/auth runtime files, and job-only GHCR read token; never production credentials. |
| `server-production` | Required account-owner reviewer plus restricted SSH key/host settings and the public server input file consumed only by deploy; least-privilege package-read token. |

Private runtime credentials remain on the server; they are not copied into the
repository, Cloudflare Worker, or browser bundles.

The protected production secret directory must include the file-backed
OpenRouter Management key, TikHub `tikhub_api_key`, Live Paddle API key and
destination-specific secret for the one production notification destination.
TikHub is mounted read-only and exported only inside the backend process; it
must never appear in a public or generated environment. The non-secret public
environment carries only `live`, its matching `live_` client token, and six
provider-verified Live Plus/Pro/Max monthly/yearly price IDs. The preflight and
app entrypoint require `live_` with `pdl_live_apikey_`; they reject Sandbox,
mixed pairs, an invalid destination-secret shape, missing or duplicate prices,
and any server secret placed in the generated environment.

Keep `production.env.example`, the protected key, all six prices, and the exact
destination on Live as one unit. Price IDs and destination secrets do not
encode their environment, so prefix checks are necessary but not sufficient:
resolve all six recurring prices through the Live API, verify the existing
approved app domain/default payment link, and accept official signed no-charge
simulation from that exact destination before calling billing healthy. Never
rotate one field in isolation.

Staging keeps a separate Sandbox unit in `/opt/weknora/staging-runtime`: its
`staging.public.env` and `auth-public.env` contain only public coordinates, while
database/Redis/AES/JWT/OIDC/Supabase service, OpenRouter, TikHub, Paddle Sandbox,
R2 and Langfuse test credentials stay in the staging `secrets/` directory. Production and
staging keep separate protected TikHub file mounts even when the provider
credential is environment-agnostic; it never travels through a public env or
release artifact. The six Sandbox price IDs,
Sandbox destination and approved `staging.musuw.com` checkout domain are
validated together. Staging acceptance must finish before a manual exact-digest
promotion; it must never alter this production Live unit.

The staging public identities are not arbitrary URLs or names. Runtime preflight
requires the commissioned Supabase test project and `musuw-staging` R2 bucket,
and compares `OPENROUTER_WORKSPACE_ID` with the root-owned mode-0600
`/opt/weknora/staging-runtime/openrouter-workspace-id` pin. A mismatch stops the
release before the application starts. The pin contains non-secret resource
identity only; the OpenRouter management key remains file-backed under `secrets/`.

Sandbox data is disposable and is never migrated into Live. Do not add a
parallel subscription-recovery path or repair billing state with SQL. Only a
correctly signed active `subscription.created` or `subscription.activated`
event with the tenant binding and a confirmed period grants an initial paid
period; later allowance renewals require a signed `transaction.completed` with
`subscription_recurring` origin. Approved full refunds and chargebacks follow
the reviewed adjustment policy. Browser callbacks never grant state.

The checked-in lockfiles are used by CI (`npm ci`). When a dependency changes,
regenerate its lockfile in the same change.
