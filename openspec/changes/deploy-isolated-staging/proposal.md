## Why

Musuw has a healthy Tokyo production deployment but no production-like staging environment in which Sandbox billing, entitlement, and release behavior can be proven without risking Live data or money. The next storage-accounting correction must not reach production until the exact candidate images have passed that isolated gate.

## What Changes

- Add `staging.musuw.com` as a second, resource-bounded Docker Compose project on the existing Tokyo host, with separate PostgreSQL, Redis, file, and R2 test storage.
- Make only public browser configuration environment-selectable at container startup so one frontend image digest can serve production and staging; keep every credential server-side and preserve the production Live-only fence.
- Add a GitHub `staging` Environment and a one-build release sequence that deploys exact app/frontend digests to staging, runs acceptance checks, then promotes the same digests to production.
- Reuse the existing Cloudflare Tunnel and edge network for staging TLS and routing, require `noindex`, and leave the Paddle webhook path publicly reachable even when interactive staging pages use Access.
- Configure and verify one complete Paddle Sandbox unit: API key, Sandbox client token, destination-specific webhook secret, six recurring prices, approved checkout domain, payment link, portal, billing history, tax/currency/payment-method ownership, and the exact webhook event set.
- Exercise first purchase, paid upgrade, cancellation/period-end downgrade, recovery, signed delivery, retry, duplicate and out-of-order handling, tenant membership, local entitlement, OpenRouter allowance, customer portal, and billing history with official Sandbox cards and simulations only.
- Keep production data, secrets, Paddle Live settings, and money movement untouched. The later original-file storage correction is explicitly blocked until this staging gate is green.

## Capabilities

### New Capabilities

- `isolated-staging-runtime`: Defines staging identity, resource and data isolation, public routing, secret boundaries, immutable-image parity, and safe promotion on the existing Tokyo host.
- `sandbox-billing-release-gate`: Defines the complete Paddle Sandbox configuration and end-to-end acceptance evidence required before any candidate digest may be promoted or storage accounting work may begin.

### Modified Capabilities

None.

## Impact

- GitHub Actions environments, workflow contracts, GHCR image promotion, and the restricted Tokyo deployment gate.
- Docker Compose overlays, frontend/auth runtime public configuration, Nginx headers, Cloudflare Tunnel routing, R2, and server runtime directories.
- Paddle Sandbox catalog, checkout domain, notification destination, simulations, and non-monetary end-to-end verification.
- Deployment, integration, secrets, Paddle readiness, and verification documentation. Production continues to use the existing Paddle Live and production data contracts.
