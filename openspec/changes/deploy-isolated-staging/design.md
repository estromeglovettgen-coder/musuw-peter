## Context

Tokyo currently runs one healthy `weknora-v072-production` Compose project plus one Cloudflare Tunnel project. The production app and frontend images are immutable GHCR digests labelled with Git revision `ec407d242ef22f39d9b5a4de561a709ef452bebb`; production data volumes, R2 bucket, protected secrets, and Paddle Live configuration are established and must not be changed while staging is commissioned. No staging containers, volumes, runtime directory, GitHub Environment, stable DNS/TLS route, or R2 test bucket exist.

The native frontend already reads `/config.js` at container startup and Paddle public configuration already comes from the app at runtime. The remaining same-image blocker is the auth shell: Supabase project settings, OAuth client ID, and public origin are currently baked by Vite and its hostname allowlist contains an obsolete hyphenated staging host. The production app entrypoint and deployment gate are also deliberately Live- and production-only.

This change spans identity, billing, deployment, external providers, and production infrastructure. Its acceptance evidence must therefore disprove cross-environment mixing, duplicate image builds, unsigned billing mutation, and accidental production money or data access.

## Goals / Non-Goals

**Goals:**

- Run production and staging as separate Compose projects on the existing Tokyo host while sharing only the deliberate Cloudflare edge network and immutable app/frontend image digests.
- Give staging separate runtime files, secrets, PostgreSQL, Redis, local file volume, R2 test bucket, Supabase test identity project, and Paddle Sandbox unit.
- Select public auth configuration at container startup and select Paddle through the existing backend runtime adapter, without putting server credentials in images, JavaScript, GitHub artifacts, or logs.
- Build each release SHA once, deploy its exact digest pair to staging first, and allow production promotion only with the same recorded pair after staging acceptance.
- Prove the complete Sandbox billing and entitlement lifecycle with official Paddle test mechanisms and no real financial action.

**Non-Goals:**

- A new server, Kubernetes, repository copy, persistent staging branch, duplicate image pipeline, payment ledger, billing state machine, or second webhook queue.
- Replacing Paddle Checkout, tax, currency selection, payment-method eligibility, invoices, or customer portal with Musuw code.
- Modifying the production Paddle Live catalog, notification destination, credentials, data volumes, or R2 bucket while staging is configured.
- Implementing the original-file storage accounting correction. That work receives a separate change only after this change is verified.

## Decisions

### Use one thin staging overlay and a distinct Compose identity

Staging uses the upstream WeKnora Compose plus a checked-in staging overlay, fixed project name `weknora-v072-staging`, fixed staging container names, and explicit staging volume/network names. PostgreSQL, Redis, local files, docreader temporary data, and any enabled graph/search data stay on the staging internal network and volumes. Only the staging frontend joins the existing external Cloudflare edge network under a unique `staging-web` alias. Production keeps its current `web` alias and project.

External identities also fail closed rather than accepting any syntactically valid test-shaped value. Staging pins the commissioned Supabase test project URL and `musuw-staging` R2 bucket. Its public OpenRouter workspace UUID must match a separately installed root-owned mode-0600 server pin; production keeps the workspace selector unset. This thin identity anchor prevents a GitHub public-input typo from selecting production/default provider state without adding a new service or state machine.

The overlay pins the same app/frontend digest references as production and uses `--no-build`. It adds memory and CPU limits sized against the host's two CPUs, 3.6 GiB RAM, and swap, while leaving production resource policy unchanged during commissioning. Optional services are enabled only when an acceptance scenario consumes them.

Alternatives rejected: a second server violates the brief; a repository copy or long-lived branch creates drift; sharing PostgreSQL, Redis, volumes, or the production R2 bucket defeats the test boundary; a second tunnel connector adds an unnecessary network/control plane.

### Extend the existing public runtime file for auth and fail closed

`/config.js` remains the single public runtime seam. It gains a bounded auth object containing only the exact public origin, Supabase URL, Supabase publishable key, and native OAuth client ID. The auth shell reads that object before creating its client. Docker-built auth assets require the runtime object; local Vite development may continue using `import.meta.env`. A present but incomplete runtime object never falls back field-by-field to baked values.

The entrypoint validates and safely serializes these public values, accepts only `https://app.musuw.com`, `https://staging.musuw.com`, or the existing fixed local development origin, and never accepts a credential. The auth callback trust checks use the same origin function. Paddle remains on its existing same-origin public-config endpoint and server-only SDK adapter.

Alternatives rejected: one frontend build per environment violates digest parity; rewriting hashed assets at startup is brittle; moving public configuration into a new service is unnecessary.

### Keep production Live strict and add an equally strict Sandbox launch wrapper

The generic Paddle shell validator remains the shared shape check. Production continues to call its Live-only wrapper. Staging calls a new Sandbox-only wrapper and requires one `test_` client token, one `pdl_sdbx_apikey_` server key, one `pdl_ntfset_` destination secret, and six distinct `pri_` values. Both wrappers read server credentials only from regular, non-symlink, non-empty mode-0600 files in separate runtime directories.

Provider-side reads prove the six prices belong to Sandbox and represent Plus, Pro, and Max monthly/yearly recurring USD prices with location-based tax. A signed event from the exact staging destination proves the otherwise opaque price and notification identifiers are from the selected environment.

### Reuse the Cloudflare tunnel and keep billing ingress independent of interactive access

Cloudflare maps `staging.musuw.com` to `http://staging-web:8080` through the existing tunnel. TLS terminates at Cloudflare; no new host port is public. Nginx emits `X-Robots-Tag: noindex, nofollow` on staging HTML, auth, API, and static responses, and the existing robots metadata remains.

If the existing Access configuration can protect the staging hostname directly, it is reused. The exact `POST /api/v1/billing/paddle/webhook` path is an explicit bypass and remains protected by Paddle's raw-body signature verification; health may be bypassed only as needed for external probes. No new proxy or VPN is introduced merely to add Access.

### Make one release record drive staging and production

One GitHub release workflow authorizes a full SHA with successful CI, builds the app and frontend once, resolves their immutable GHCR digests, and records the SHA/digest pair. A staging job using the independent `staging` Environment materializes only allowlisted source/runtime inputs and invokes a separate staging deployment account and root-owned fixed helper. Its key, forced command, sudoers rule, spool, release root, current pointer, and runtime root are staging-specific. It deploys the digest pair with `--no-build` and proves revision labels, public health, Sandbox public configuration, isolation, and noindex. If Compose has begun mutating staging and a later health/record/pointer check fails, the helper stops that project while retaining named volumes.

The automatic record proves staging deployment only and never labels smoke checks as full acceptance. Production requires a manual `full-sandbox-e2e-green` attestation, verifies that the `server-production` Environment still has a required reviewer, waits for that owner approval, and consumes the same recorded digest pair; it never invokes a build. A separately resumed/manual promotion must load and verify the prior staging release record and current staging container digests rather than resolving mutable tags or rebuilding. Production continues through its existing proven `musuw-deploy` two-verb gate and roots without widening that key or sudoers contract. The independent staging gate likewise exposes only fixed verbs and cannot execute caller-selected commands or paths.

Production activation keeps its current atomic symlink and rollback behavior. Staging uses a separate current pointer and release root; these are immutable materialized source bundles, not another Git clone or branch. Runtime state and Compose projects are never shared.

### Treat Paddle and product behavior as one release gate

Initial commissioning uses a fresh test identity and Paddle's official Sandbox cards plus simulations. Evidence covers: checkout creation and completion; signed queue-before-ack webhook delivery; tenant binding; paid upgrade with Paddle preview and `prorated_immediately`/`prevent_change`; scheduled cancellation and period-end Free downgrade; resume/recovery; replay/retry; duplicate and out-of-order delivery; local plan/membership; OpenRouter child-key cycle allowance; customer portal and billing history. The exact 11-event destination includes the nine subscription/transaction events and `adjustment.created`/`adjustment.updated`.

No response callback, transaction creation result, upgrade response, unsigned body, unknown price, or non-recurring event grants entitlement. No real card, Live entity, refund, chargeback, transfer, payout, or withdrawal is created. Provider-owned default payment link, tax, currency, and payment methods are verified rather than reimplemented.

## Risks / Trade-offs

- [The small Tokyo host cannot safely run two full stacks] → Start only the services consumed by staging acceptance, enforce explicit limits, observe memory/swap/OOM state, and stop rather than starving production.
- [Runtime auth config is absent or malformed] → The production image fails closed at the auth shell and container preflight; it never falls back to another environment's identity project.
- [A staging credential or price is mixed with Live] → Sandbox launch validation, provider catalog reads, signed-destination proof, and public-config probes reject the unit before app health is accepted.
- [Cloudflare Access blocks Paddle] → Use an exact webhook bypass and prove an official signed simulation from Paddle reaches the public endpoint; do not weaken signature validation.
- [A mutable tag changes between environments] → Carry and compare `repo@sha256` references plus OCI revision labels and the stored release record; production promotion rejects any mismatch.
- [A manual promotion bypasses staging] → The promotion path requires the prior staging release record and verifies currently running staging digests/revision before touching production.
- [Sandbox test data is stale] → Delete only the disposable test account through the supported lifecycle and create a fresh identity; do not add cross-environment reconciliation.
- [A provider/dashboard step needs account-owner confirmation] → Stop on the exact approval or verification page, preserve all configured state, and request only that bounded action.

## Migration Plan

1. Add failing contract tests for dotted staging origin, runtime auth completeness, Sandbox-only launch, staging Compose isolation/resource limits, source allowlist, noindex, and one-build workflow ordering.
2. Implement the runtime auth seam, staging overlay/scripts, release record, target-specific restricted gate, and documentation without weakening the existing production Live tests.
3. Create the GitHub `staging` Environment and server staging runtime directories; install opaque secrets without printing them; create dedicated volumes and R2 test storage.
4. Configure Cloudflare routing/TLS/optional Access bypass and the complete Paddle Sandbox unit. Confirm production Live objects are unchanged.
5. Build the staging-enablement SHA once, deploy its digest pair to staging, run all static, integration, browser, official Sandbox card, simulation, retry, ordering, entitlement, allowance, portal, and history checks.
6. Promote the exact same digest pair to production, then prove production remains Live and staging remains Sandbox with different container/project, database, Redis, file, and R2 identities.
7. Record verification evidence. Only then propose and implement the separate original-file storage-accounting change.

Rollback stops the staging project and removes its Cloudflare route; its volumes and R2 bucket are retained until explicitly reviewed. A production preflight failure performs no mutation. If failure occurs after app/frontend replacement, the release helper restores the prior runtime files and recreates the prior immutable digest pair from the prior release source while keeping the existing current pointer; container instances may be recreated. Production data and secrets are never rolled back by deleting volumes.

## Open Questions

None. Provider credentials and bounded account-owner approvals are operational inputs, not product decisions.
