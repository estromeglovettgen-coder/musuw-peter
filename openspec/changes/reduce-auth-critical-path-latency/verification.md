# Verification Evidence

## Read-only baseline (2026-08-30)

All probes used public health, authentication-start, OIDC URL, or Supabase
discovery/settings endpoints. No email address, verification code, credential,
token, or customer data was submitted or recorded.

| Vantage point | Public route | Representative result |
|---|---|---|
| Beijing server | `app.musuw.com/health` | 10 runs: p50 1.050 s, min 0.704 s, max 1.827 s |
| Beijing server | `app.musuw.com/auth/start` | 10 runs: p50 0.991 s, min 0.700 s, max 1.670 s |
| Beijing server | Supabase Auth settings | 10 runs: p50 0.365 s, min 0.351 s, max 0.571 s |
| Beijing server | WeKnora OIDC URL | 5 runs: p50 1.371 s, min 0.852 s, max 4.440 s |
| Tokyo server | app health/auth start | 10 runs: p50 0.043 s / 0.039 s |
| Tokyo server | Supabase Auth settings | 10 runs: p50 0.054 s |

Mainland public probes observed the dynamic app route between approximately
0.95 s and 3.26 s across Beijing, Shanghai, Guangzhou, Shenzhen, and Chengdu.
The corresponding direct Supabase discovery/settings route was generally
faster but still variable (approximately 0.30 s to 1.25 s). Some mainland
requests reached distant Cloudflare points of presence, which explains part of
the tail latency but does not change the application-level remedy: avoid
serial dynamic round trips that are not required for correctness.

External public probes returned HTTP 200 from all sampled regions. Approximate
observed ranges for the dynamic auth-start route were:

- United States: 0.37-0.64 s (Los Angeles and New York)
- Canada: 0.49-0.55 s
- Brazil: 0.99-1.25 s
- Western Europe: 0.75-0.83 s
- Singapore: 0.26-0.29 s
- India: 0.88-0.95 s
- Australia: 0.36-0.62 s
- Japan: 0.04-0.16 s
- South Korea, Taiwan, and Hong Kong: 0.19-0.81 s

The static storefront was normally served as a Cloudflare cache hit, whereas
the app authentication routes were dynamic. This separates a general CDN
failure from the measured dynamic-origin and serial-authentication cost.

## Server-side separation

Anonymized production timing aggregates showed that the WeKnora endpoints do
relatively little server work compared with mainland network time:

| Endpoint | Samples | Server duration |
|---|---:|---:|
| OIDC URL | 26 | min 32.1 ms, average 107.3 ms, max 395.8 ms |
| OIDC callback | 5 | min 122.8 ms, average 193.7 ms, max 249.4 ms |
| Auth context (`/auth/me`) | 14 | min 2.2 ms, average 37.7 ms, max 104.5 ms |

Supabase Auth logs showed OTP provider acceptance at about 2.1 s, while OTP
verification itself was tens of milliseconds. The frontend therefore must not
blindly retry OTP sends. This change is deliberately limited to eliminating
repeated OIDC discovery and removing the already-redundant blocking
`/auth/me` round trip after a complete, backend-signed-in callback snapshot.

## Explicit non-goals

- No same-origin Tokyo relay is added for browser-to-Supabase OTP calls; it
  would add another slow mainland-to-Tokyo hop.
- No new CDN, proxy, database, authentication provider, retry state machine,
  or mainland infrastructure is introduced.
- The existing user-info verification call in the backend remains mandatory.
- The existing OTP timeout behavior is recorded separately and is not changed
  without a cancellable SDK request contract.

## Implementation verification

The provider discovery documents for both configured Supabase projects were
read immediately before release preparation. Their published authorization,
token, and user-info endpoints exactly matched the three paths derived by the
Compose overlays.

- Frontend tests: 715 passed, 0 failed.
- Focused OIDC callback contracts: 4 passed, 0 failed.
- Vue TypeScript check: passed.
- Production frontend build: passed.
- WeKnora OIDC service and handler tests: passed.
- Production static/Compose contract: passed with Live Paddle and production
  identity endpoints.
- Staging static/Compose contract: passed with Sandbox Paddle and staging
  identity endpoints.
- Production release/rollback seam contract: passed with inherited OIDC
  coordinates cleared before either the forward or older-wrapper rollback path.
- Bounded adversarial review: the initial callback-capability, stale-session,
  inherited-Compose, and older-wrapper rollback findings were corrected; the
  corrective-delta review reported no remaining blocker.
- Strict OpenSpec validation: passed.
