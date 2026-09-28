# Verification Report: local-operations-admin

Verified locally on 2026-08-22 (America/Phoenix). The operations console remains
loopback-only. No production tenant mutation, payment, refund, account deletion,
or R2 mutation was performed. One bounded production chat request was made to
prove the consumer-to-Langfuse trace path.

2026-08-24 clarification: the historical Paddle Live API HTTP result below
proves only that the then-selected read adapter reached an official endpoint.
It does not prove domain/account approval, provider authorization, checkout
readiness, or permission to deploy Live. The current fixed product runtime is a
complete Sandbox unit and Live remains `not-authorized`.

## Result

- The rejected Appsmith prototype is not a runtime dependency. `127.0.0.1:4186`
  serves the source-controlled TDesign Vue Next console with overview, users,
  knowledge/documents, billing, identity, storage, and logs/tracing pages.
- TEST and PRODUCTION are separate process-level targets. PRODUCTION requires
  the exact unlock phrase plus an ignored runtime file; the browser cannot mix
  environments. PostgreSQL is forced read-only for console queries.
- User/tenant and queue writes use only the capability-scoped WeKnora APIs.
  Tenant updates require `UPDATE:<tenant_id>` and runtime actions retain the
  native confirmation dialog. Settings and API-key management remain outside
  the Lite allowlist.
- Paddle, Supabase, R2, and Langfuse use their official APIs. Provider secrets
  are server-only. Complex provider writes remain in the official dashboards;
  the console does not duplicate supplier control planes.
- TEST truthfully reports R2 as not applicable because the TEST product runtime
  uses local storage. PRODUCTION verifies the private R2 bucket through the
  official S3 API.

## Fresh automated evidence

- `npm run admin:test` passed 13/13 server tests, including provider isolation,
  TEST-local R2 semantics, Langfuse redaction, Keychain-only credentials and
  exact route boundaries.
- `npm run admin:build` passed Vue type-check and the production Vite build.
- `npm run admin:e2e` passed 3/3 Playwright workflows: the real operator flow,
  security/redaction boundaries, and a WCAG A/AA serious/critical scan of all
  seven pages.
- `scripts/weknora-production/verify-static.sh` and shell syntax checks passed
  for the production secret mounts, Langfuse runtime wiring and public-setting
  allowlist.
- Anonymous config returned 401; unapproved settings and API-key routes returned
  404; an unconfirmed mutation returned 403; CSP contained `default-src 'self'`
  and `X-Frame-Options` was `DENY`.
- Recursive investigation-response inspection found none of `prompt`,
  `content`, `attachments`, `keys`, `payload`, `api_key`, or `secret`.
- OpenSpec strict validation passed the complete repository change set.

## Fresh Chrome evidence

- PRODUCTION rendered 9 users, 9 workspaces, 7 knowledge bases and 20 documents.
  The user drawer showed complete account, entitlement, storage and OpenRouter
  fields; the management modal required the exact confirmation phrase and was
  cancelled without mutation.
- Paddle Live subscriptions and transactions both returned official HTTP 200
  responses. The current real pages contain 0 subscriptions and 0 transactions;
  the console presents that as a successful empty result.
- Supabase Auth Admin connected separately in the TEST process to Musuw Staging
  `achfnnicetupvtoqiwqd` (7 users) and in the PRODUCTION process to Musuw
  Production `phtveqtlswzokwsztsvu` (8 users). Each process left the other
  project unqueried and displayed only its public ref.
- Cloudflare R2 returned 40 objects and 10,220,178 bytes from
  `musuw-production/weknora/`. The storage page separately displayed source
  `file_size`, index `storage_size`, `tenant.storage_used`, quota, backend and
  physical object reference.
- A production consumer request reached WeKnora and the model, then appeared in
  Langfuse. The console read 5 official observations and displayed safe IDs,
  type, model, usage, environment, release and time. The original prompt and all
  input/output/content fields were absent from the browser response.
- TEST rendered its own real data, Paddle Sandbox returned 2 subscriptions and
  27 transactions, Supabase and Langfuse connected, and storage displayed the
  neutral `TEST 本地存储` not-applicable state rather than a credential error.

## Production runtime evidence

- The protected production secret directory contains the Langfuse public and
  secret files with mode `0600`; Compose mounts them read-only and the app
  entrypoint exports them only inside the container.
- The current production app was recreated without dependencies and is healthy.
  Its startup log records Langfuse enabled against JP Cloud with release
  `musuw-production` and environment `production`.
- A normal immutable-source release of the final repository commit remains part
  of the separate `production-legal-lifecycle-release` change; this local
  operations change does not claim that broader release complete.

## Assessment

All 10 tasks in this change have implementation and fresh verification. The
console is a small TDesign client over read-only queries, scoped WeKnora APIs and
official provider reads; it introduces no second business authority, provider
ledger, raw-SQL mutation path or public operations service.
