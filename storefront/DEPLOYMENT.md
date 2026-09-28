# Storefront deployment boundary

The Cloudflare Worker named `musuw-site` owns the marketing site at
`musuw.com` and `www.musuw.com`, including locale-aware document metadata, and
the independent static partner-board demonstration at `partners.musuw.com`. It
must not receive payment credentials or expose an `/api/checkout` route.

The only application-scoped runtime credential allowed in this Worker is the
publish token for the homepage customer-service embed. Bind it as
`MUSUW_CUSTOMER_SERVICE_PUBLISH_TOKEN` together with the non-secret
`MUSUW_CUSTOMER_SERVICE_CHANNEL_ID`; do not put either value in source or the
static bundle. The Worker exposes only a bounded config response and exchanges
the publish token server-side for the existing 30-minute embed session token.
The optional `MUSUW_CUSTOMER_SERVICE_APP_ORIGIN` defaults to
`https://app.musuw.com` and accepts HTTPS origins only. Configure the channel
with `https://app.musuw.com`, `https://musuw.com`, and
`https://www.musuw.com` in `allowed_origins`.

The deploy workflow first exchanges that exact channel/token pair against the
production application from `https://musuw.com`. A configured release stops
before Cloudflare changes if the application runtime, channel, or origin is not
ready. Wrangler receives the code and both secrets in one `--secrets-file`
deployment, so no mixed channel/token version can receive traffic. When both
protected GitHub secrets are absent, the same atomic deployment writes invalid
sentinels that the Worker treats as disabled; removing only one secret fails
closed.

Product actions cross to `https://app.musuw.com/auth/start`. Pricing actions carry
only a bounded local plan and billing period. The product origin owns Google
login, the opaque musuw session, enforced entitlement state, and optional signed
Paddle Webhook billing state. When Paddle is not configured, upgrades remain
unavailable.

After a successful `main` CI run, GitHub Actions builds this package, deploys
the exact commit to `musuw-site`, and probes both public domains plus the app
handoff. A failed smoke check is reported and may restore the immediately
previous Worker version; rerun a known-good full SHA through the same workflow.
Local workstations are not a production deployment path.

The partner hostname serves only the five owned assets under
`public/partner-board/`. Its bilingual scenario is explicitly labeled as
simulated data; it does not call Paddle or the production application API.
The Worker blocks the internal asset prefix on the marketing domains and
does not add a homepage navigation entry. GET/HEAD are the only supported
methods, and unknown partner routes return 404. The existing deployment smoke
step checks the hostname, both languages, all assets, and the API boundary.

The application release owns the authenticated product origin separately from
this homepage. Keep homepage deployment free of authentication, model-provider,
and payment credentials; the scoped customer-service publish token cannot grant
account, tenant-management, billing, or model-provider access.

See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for the canonical end-to-end
delivery path and production evidence fields.
