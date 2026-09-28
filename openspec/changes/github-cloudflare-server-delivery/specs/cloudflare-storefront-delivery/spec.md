## ADDED Requirements

### Requirement: Existing storefront Worker remains the public-site boundary

The Cloudflare Worker named `musuw-site` SHALL serve only the tracked
`storefront/` static marketing, localization, pricing, trust, and legal
surface for `musuw.com` and `www.musuw.com`. Product actions SHALL hand off to
`https://app.musuw.com/auth/start`; the Worker MUST NOT become an account,
checkout, payment, model, or authenticated product API.

#### Scenario: Public site handoff is preserved

- **WHEN** a visitor opens a product or pricing action on either storefront
  custom domain
- **THEN** the Worker serves the tracked static page and hands the action to
  `app.musuw.com/auth/start` with only the bounded, documented plan intent
- **AND** no account, payment, or runtime secret is requested from the Worker

### Requirement: Storefront deploys automatically from verified GitHub source

After the root required checks succeed, a merge to `main` SHALL
build the `storefront/` package from its lockfile and deploy the exact commit
to the existing `musuw-site` Worker through GitHub Actions. Local workstation
`wrangler deploy` SHALL NOT be the supported production path. The workflow MUST
record the deployed commit and Worker version.

#### Scenario: Successful merge deploys one immutable storefront build

- **WHEN** a reviewed release-branch commit passes all required checks
- **THEN** GitHub Actions builds `storefront/`, deploys that commit to
  `musuw-site`, records the full SHA and Worker version, and does not build from
  a different branch or local checkout

#### Scenario: Failed checks prevent Worker mutation

- **WHEN** any required check for the candidate fails or is absent
- **THEN** the Cloudflare deploy job is skipped and the currently serving Worker
  version remains unchanged

### Requirement: Cloudflare credentials are scoped to the storefront

The storefront workflow SHALL use a Cloudflare API token scoped to the account,
zone, and `musuw-site` Worker deployment. It MUST NOT receive server SSH keys,
server runtime secrets, Supabase service credentials, model keys, billing
secrets, or other product credentials. Token values MUST remain in GitHub
Actions secrets or the environment secret store.

#### Scenario: Storefront job cannot access server secrets

- **WHEN** the Cloudflare workflow runs
- **THEN** its available secret set contains only the minimum Worker deployment
  credential and non-secret build configuration
- **AND** the job has no readable server secret file, SSH private key, or model,
  auth, or billing credential

### Requirement: Worker health is observable

After deployment, the workflow SHALL probe both `musuw.com` and `www.musuw.com`
for the static entry, expected product handoff, and locale signal. A Wrangler
command succeeding without these probes MUST NOT be reported as production
success.

#### Scenario: Route or handoff failure is reported

- **WHEN** either custom domain fails the static entry, handoff, or locale probe
- **THEN** the workflow marks the deployment failed and reports the failing
  probe
- **AND** it does not claim the storefront release is healthy

### Requirement: Automatic storefront delivery waits for completed CI

The storefront workflow SHALL listen for the `CI` workflow's `completed`
`workflow_run` on `main`, and SHALL start its build/deploy path only when the
event is from the canonical repository and has `conclusion: success`. The
workflow SHALL check out and deploy `workflow_run.head_sha`; it MUST NOT use
`github.sha` as the source identity for a `workflow_run` event. A manual
`workflow_dispatch` SHALL remain available only from `main`, accept a full
immutable SHA, and query the Actions API for a successful `CI` run whose
`head_sha` exactly matches that SHA before building or exposing Cloudflare
credentials.

#### Scenario: Successful main CI triggers the matching storefront revision

- **WHEN** the canonical repository's `CI` workflow completes successfully for
  a push to `main`
- **THEN** `Deploy storefront` selects `workflow_run.head_sha`, checks out that
  exact commit, and may proceed to the existing build, Cloudflare deploy and
  smoke steps

#### Scenario: Failed or non-canonical CI cannot mutate Cloudflare

- **WHEN** a completed `CI` run has a non-success conclusion, a non-main head
  branch, or a repository other than the canonical repository
- **THEN** the storefront build/deploy jobs are skipped and no Worker mutation
  or smoke probe is attempted

#### Scenario: Manual storefront dispatch rechecks the exact SHA

- **WHEN** an operator dispatches from `main` with a full immutable SHA
- **THEN** the workflow verifies that SHA is an ancestor of `main` and that the
  Actions API reports a successful `CI` run for the same SHA before any build
  or Cloudflare credential-bearing step starts

#### Scenario: Healthy storefront is recorded

- **WHEN** both custom domains pass the post-deploy probes
- **THEN** the release manifest records the Worker version, source SHA, probe
  results, and deployment timestamp

### Requirement: Authenticated app and auth remain server-delivered

This capability SHALL NOT deploy `weknora/frontend` or `auth/` as a Cloudflare
Worker. Those surfaces SHALL continue to follow the server release contract;
`app.musuw.com` SHALL remain the Cloudflare Tunnel entry point to the server.

#### Scenario: App boundary is not moved accidentally

- **WHEN** the storefront workflow packages or deploys its Worker
- **THEN** the artifact contains only the `storefront/` static/Worker surface
- **AND** the workflow fails if app/auth source or a product backend endpoint is
  included in the Worker artifact
