## 1. Baseline and failing contracts

- [x] 1.1 Verify `HEAD`, `main`, `origin/main`, production source pointer, OCI revision labels, immutable app/frontend digests, and untouched user Storefront changes.
- [x] 1.2 Audit Tokyo capacity, Docker projects, volumes, networks, secret metadata, public DNS/TLS, GitHub environments/workflows, Paddle Sandbox/Live metadata, and current production health without reading secret values.
- [x] 1.3 Run the existing focused Go, race, frontend, type-check, build, external-credential, admin, and production static contracts to establish a green baseline.
- [x] 1.4 Add red tests for dotted staging auth origin, required runtime auth configuration, fail-closed partial values, and no server credential in generated browser config.
- [x] 1.5 Add red shell/workflow contracts for staging project isolation, resource limits, Sandbox-only launch, source manifest/gate targets, noindex, build-once ordering, and same-digest promotion.

## 2. Shared image runtime behavior

- [x] 2.1 Extend `/config.js` with safely serialized public auth coordinates and make Docker-built auth assets require the complete runtime object while preserving local Vite development fallback.
- [x] 2.2 Accept only the exact production, dotted staging, and fixed local origins in auth config and callback trust checks; remove the obsolete hyphenated staging origin.
- [x] 2.3 Generate the Nginx noindex header on workspace, auth, API, and static routes and verify each surface rather than relying on header inheritance.
- [x] 2.4 Add a Sandbox-only Paddle entrypoint wrapper that reuses the generic validator while leaving the production Live-only wrapper and tests unchanged.

## 3. Staging Compose and server runtime

- [x] 3.1 Add the thin staging Compose overlay with project-specific containers, internal network, volumes, loopback ports, separate runtime inputs, dedicated R2 test bucket, and the same digest variables used by production.
- [x] 3.2 Add explicit CPU/memory limits for each staging service and a capacity preflight that observes production health, host memory/swap, restarts, and OOM state.
- [x] 3.3 Add staging runtime preparation and Compose helpers that validate exact origins, Sandbox unit, secret file metadata, volume identity, and `--no-build` behavior without duplicating the production data path.
- [x] 3.4 Add a separate staging deployment account, immutable source allowlist, forced-command gate, root helper, roots, sudoers rule, and negative simulations; keep the existing production gate contract unchanged.
- [x] 3.5 Make the server retain one SHA/digest release record, verify staging container digests/revision before promotion, and keep production and staging current pointers separate.

## 4. GitHub delivery and documentation

- [x] 4.1 Change the application release workflow so one authorized SHA builds once, records two digests, deploys staging through the independent `staging` Environment, and promotes production only by consuming the same record after acceptance.
- [x] 4.2 Update CI path filters and workflow contract validation for staging files, target permissions, secret names, immutable references, and the prohibition on a second image build.
- [x] 4.3 Update deployment, secrets, Compose, Paddle readiness, rollback, and operator documentation; mark the obsolete Sandbox-production handoff as historical.
- [x] 4.4 Run all local staging/static contracts, existing production contracts, workflow validation, secret scan, OpenSpec strict validation, type checks, builds, focused tests, and race tests.

## 5. External staging configuration

- [x] 5.1 Create the GitHub `staging` Environment with only the required isolated public and SSH inputs; keep provider/runtime secrets in the protected server directory and never print or persist their values in artifacts.
- [x] 5.2 Create `/opt/weknora/staging-runtime`, including its own root-owned mode-0600 `secrets/tikhub_api_key` mounted read-only (local-file secrets retain the source mode), the remaining protected secret files, staging volumes/network, and the dedicated R2 test bucket/credentials; prove metadata and storage isolation without printing secret values.
- [x] 5.3 Add Cloudflare DNS/TLS/tunnel routing for `staging.musuw.com` to `staging-web`; reuse Access if directly applicable and add an exact webhook bypass.
- [ ] 5.4 Audit the Sandbox catalog and configure the active client token, approved staging domain, default `/pay` link, portal/history, Retain, location tax, USD base prices, and eligible payment methods.
- [x] 5.5 Create or update one active staging notification destination with the exact 11 events, install its opaque secret, and leave the production Live destination unchanged.

## 6. Staging deployment and Paddle acceptance

- [x] 6.1 Build the staging-enablement SHA once in GitHub, deploy the recorded digest pair only to staging, and prove TLS, health, noindex, Sandbox public config, revision labels, limits, and project/data/R2 isolation. (`72716632`: CI `33498204284`, staging-only deploy `33498781725`; production job skipped.)
- [ ] 6.2 Create a fresh test identity and complete Plus checkout with an official Sandbox success card; prove signed webhook authority, membership, local entitlement, paid period, and OpenRouter allowance.
- [ ] 6.3 Exercise an official Sandbox decline card and prove no paid entitlement or allowance is granted.
- [ ] 6.4 Preview and complete Plus-to-Pro/Max upgrade, including concurrent/retried/uncertain-operation behavior, and prove only the signed update changes local plan and limits.
- [ ] 6.5 Cancel through the Sandbox portal, prove paid access through period end and Free downgrade at the boundary, then prove valid recovery/resubscription restores paid state.
- [ ] 6.6 Use official simulations and replay to verify public signed ingress, provider retry, worker retry, duplicate idempotency, out-of-order protection, adjustment handling, and dead-letter visibility.
- [ ] 6.7 Verify tenant-scoped customer portal, payment method controls, transaction/invoice billing history, and denial for non-Admin or mismatched tenants.
- [ ] 6.8 Prove no real card, Live charge/refund/chargeback, transfer, payout, withdrawal, or production Retain/catalog/destination mutation occurred.

## 7. Promotion and bounded adversarial review

- [x] 7.1 Run one consolidated adversarial review across secret leakage, auth fallback, billing authority, webhook error paths, image/source parity, data isolation, capacity, rollback, and production Live preservation; fix blockers and recheck only the corrective delta.
- [ ] 7.2 Promote the exact staging app/frontend digest pair to production without rebuilding and prove both public production and staging health after activation.
- [x] 7.3 Record final evidence that production remains fully Live on `musuw-production`, staging remains fully Sandbox on its test bucket, OCI SHAs/digests match, and all database/cache/file/container identities differ.
- [ ] 7.4 Mark this OpenSpec verified and complete; only then create the separate original-file storage-accounting change.

> **Current acceptance note (2026-09-01):** The `a965a85...` staging release has
> passed the infrastructure gate and ordinary Lite browser flows, including
> document/AnyDoc, automatic tags, chat, web retrieval, image OCR, audio ASR,
> full Memory settings/cross-session recall, and the Lite-hidden Sandbox/Skills
> surfaces. The Memory draft race was fixed in source commit `cd52965f`; ledger
> refresh commit `72716632` passed CI `33498204284`, staging-only deployment
> `33498781725`, remote audit and corrective browser acceptance. Paddle Sandbox remains **PARTIAL**:
> catalog/webhook simulations/portal API are green, while real checkout,
> upgrade, period-end/resume/recovery, entitlement/allowance and full hosted
> portal browser flows are not complete; tenant `10002`'s stale checkout is a
> follow-up. The earlier `a965a85...` infrastructure/full-browser run remains
> evidence for unchanged flows; task 6.1 now records the current immutable
> release. Incomplete lifecycle items remain unchecked. Task 7.2
> (production promotion) is intentionally unchecked because the user requires
> production to remain on the old Live release.
