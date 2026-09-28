## Context

Musuw already has one Paddle integration: a server-created automatic transaction is handed to Paddle.js for the official checkout, official SDK subscription updates and customer portal sessions, raw-body signature verification, a bounded Asynq queue, and tenant-row event ordering/idempotency. The reviewed source now guards fixed production with a complete Live-only wrapper, while the running production release remains on its prior Sandbox unit until the atomic cutover. Paddle Live already contains the intended three SaaS products, six recurring prices, active public clients, an approved `app.musuw.com` checkout domain, and one production webhook destination. Verification, default-link, credential permissions, commercial settings, and the Retain sender identity have been checked; destination expansion, exact-SHA deployment, Paddle.js detection, Live enablement, and no-charge delivery evidence remain.

This is a payment and production-infrastructure change. It must preserve the exact-SHA GitHub delivery path, root-owned file-backed server secrets, the metadata-only external credential registry, and an independently usable Sandbox. The user has expressly prohibited any real charge, refund, transfer, payment-method entry, or payout-account change during implementation and verification.

## Goals / Non-Goals

**Goals:**

- Turn the fixed production contract into a complete Paddle Live-only contract and reject every partial, mixed, duplicated, or Sandbox-shaped production unit.
- Reuse the existing Live catalog, client token, API key, checkout domain, destination, entitlement mirror, and deployment paths instead of creating parallel resources or state.
- Verify the checkout through price preview and the real Live payment form, stopping before any payment method or purchase action.
- Verify signature, retry, idempotency, ordering, customer/subscription ownership, and entitlement mapping with provider-supported non-charge simulations and focused tests.
- Close the deferred full-refund, chargeback, and reversal entitlement policy with the smallest extension of the current signed-event path.
- Deploy one reviewed SHA and leave a reproducible rollback and provider/runtime evidence record without credential values.

**Non-Goals:**

- Creating or completing a real transaction, refund, credit, chargeback, transfer, payout, or any other movement of money.
- Entering, changing, or submitting payout bank, Payoneer, payment-card, or other payment-method data.
- Building a payment form, billing ledger, customer/subscription mirror table, periodic reconciler, or second webhook processor.
- Replacing Paddle's tax, currency conversion, dunning, buyer portal, or notification delivery semantics with local rules.
- Deleting or repurposing Sandbox resources.

## Decisions

### Treat Live as one atomic runtime unit

The fixed production wrapper will require `live`, a `live_` client token, a `pdl_live_apikey_` server key, one non-empty destination secret, and six distinct `pri_` mappings. The generic validator remains dual-environment for development and tests, but production no longer accepts Sandbox. The example, static release test, metadata registry, GitHub Environment public input, protected server files, operations console, and running container must move together.

Changing environment variables alone was rejected because it could mix a Live client and catalog with a Sandbox server key or signing secret. Creating a second deployment overlay was rejected because it would duplicate the same integration and expand rollback states.

### Reuse provider objects and verify their meaning

The cutover selects the existing named production client, the one existing webhook endpoint, the approved app domain, and the existing active catalog. Catalog verification is semantic: exactly Plus/Pro/Max, monthly/yearly recurring periods, expected USD base prices and existing China CNY overrides, active status, and SaaS tax category. The repository stores only the six public price IDs and public token; the API key and destination-specific secret remain file-backed.

Creating replacement products, prices, client tokens, or destinations was rejected because the existing objects already match the product contract and duplicates make provider ownership ambiguous.

### Keep payment authority in Paddle with one minimal initiation fence

For Free-to-paid self-service checkout, only an authenticated tenant Admin (including Owner) may request one allow-listed Live price. Musuw asks Paddle to create one automatic transaction with exactly one mapped item and tenant-bound signed custom data, stores only the provider transaction ID and immutable request coordinates in the existing `paddle_billing_operations` row, and passes that `transactionId` to Paddle.js. Paddle owns the checkout UI, payment data, tax, currency, eligible payment methods, transaction lifecycle, receipts, and subscription creation. Musuw grants no entitlement from the browser or transaction response; only the signed active subscription notification, whose custom data Paddle copies from the transaction, can initialize paid access.

The single durable row is deliberately a control-plane fence, not a local payment state machine or billing ledger: it prevents two tabs from opening parallel provider transactions and records enough identity to reuse or safely release one unresolved attempt. Paddle status reads and signed webhooks remain authoritative; no card, amount, tax, currency, payment-method, invoice, or local transaction history is stored. The same fence serializes the paid subscription-update API because Paddle exposes no client idempotency key, until an enabled official Customer Portal Product Collections capability can fully replace that custom upgrade entry point.

### Keep the existing entitlement mirror and add only adjustment decisions

Subscription lifecycle notifications remain the plan authority and `transaction.completed` remains the renewal allowance authority. The tenant row remains the only customer/subscription mirror and its Paddle event ID/time markers remain the durable ordering guard.

For signed adjustment notifications, only a full, final approved `refund` or `chargeback` for the tenant's current customer/subscription revokes paid entitlement. Pending/rejected refunds, partial adjustments, credits, warnings, and unrelated subscriptions do not change access. A chargeback reversal restores no state from browser input or the adjustment body alone: the worker or bounded webhook reconciliation reads the current subscription from Paddle, requires the same stored customer/subscription, exactly one configured price, and a recognized provider status, then feeds that authoritative projection through the existing plan-application method. Duplicate and older events remain no-ops. This matches the public full-refund access language without inventing partial-refund arithmetic or a local adjustment ledger.

Ignoring adjustments was rejected because an approved full refund or chargeback could otherwise retain paid access indefinitely. Automatically canceling a Paddle subscription was rejected because that is a separate provider write and business action. A general adjustment ledger was rejected because current access needs only the final signed decision plus authoritative subscription state.

### Verify webhooks without fabricating or charging

The production destination subscribes only to the existing subscription lifecycle and recurring completion events plus `adjustment.created` and `adjustment.updated` required by the chosen policy. Official Paddle notification simulation is used to prove TLS delivery, destination signing, acknowledgement, retryable queue handoff, duplicate handling, and safe ignoring of non-applicable adjustment shapes. Local signed fixtures cover tenant-bound plan mutation and full-refund/chargeback/reversal policy. No webhook is hand-authored against production and no live transaction is created for verification.

The trusted Cloudflare Tunnel is also the sole public route to the frontend.
At deployment preflight, the fixed environment selects Paddle's official Live
or Sandbox `/ips` endpoint, validates a non-empty set of unique IPv4 `/32`
ranges, and atomically renders a non-secret Nginx `geo` include. Nginx checks
the Cloudflare-overwritten `CF-Connecting-IP` only for the exact Paddle webhook
path; direct or unlisted sources fail closed before the application, while the
raw-body `Paddle-Signature` verifier remains mandatory. The provider URL is
not caller-configurable, and a failed refresh preserves the prior file or
blocks first deployment rather than installing an empty allowlist.

### Use Paddle Retain instead of local dunning

The existing Paddle.js singleton initializes on the public app shell, including the stable public login page used by Paddle's Retain setup check. Once authenticated, it receives only the provider customer ID already derived from the signed tenant entitlement response, and tenant/logout changes update or clear that identity. Paddle owns recovery links, retry communication, payment-method recovery UI, and dunning behavior; Musuw adds no scheduler, retry rules, recovery table, or payment form.

### Separate accepting payments from receiving payouts

Seller approval, default checkout link, domain approval, catalog, credentials, webhook, and production runtime govern whether customers can open Live checkout and pay. Payout account configuration governs transfer of accumulated balance to the owner and remains explicitly untouched. The final report distinguishes those states rather than misrepresenting an incomplete payout setup as an application failure or silently changing sensitive financial details.

## Risks / Trade-offs

- [Provider onboarding or seller verification is not approved] → Keep the production cutover fail-closed, record the exact blocked provider step, and do not substitute a real transaction or payout configuration.
- [Live IDs or secrets are mixed with Sandbox] → Validate key/token classes and all six IDs at build, install, entrypoint, and smoke boundaries; install public and secret inputs before one container recreation.
- [A refund is pending or partial] → Do not revoke until a full refund is approved; keep the public policy's “may/usually” language and send edge cases through support.
- [A chargeback reversal arrives after local revocation] → Restore only from a current authoritative Paddle subscription read bound to the same stored customer/subscription and known one-price plan.
- [Paddle API reconciliation is temporarily unavailable] → Return/retry through the existing queue/delivery contract; do not acknowledge a mutation as applied or guess provider state.
- [Webhook simulation cannot reproduce every provider-only action] → Combine official simulation with local signed policy tests, state precisely which actions were simulated, and do not manufacture production events.
- [Deployment fails after secrets are installed] → Keep the prior immutable SHA and backed-up root-only runtime files available for the documented exact-SHA rollback; never roll back only one environment component.

## Migration Plan

1. Read every onboarding detail prompt and record seller-approval, checkout, catalog, tax, domain, credential, webhook, Retain, and payout boundaries.
2. Verify the existing Live catalog/client/domain/destination and exact event selection through official API/Dashboard reads. Change only missing configuration; never create duplicates.
3. Add failing contract and entitlement tests for Live-only production and adjustment decisions, then implement the smallest changes through the existing runtime and webhook seams.
4. Atomically install the public Live input in the GitHub production environment and server runtime, and install the existing API key and destination-specific signing secret in root-owned `0600` files. Run preflight before recreating containers.
5. Push one reviewed SHA; require CI, immutable image, server deployment, health, public config, public storefront, and checkout-to-payment-form evidence.
6. Run official non-charge notification simulation and duplicate/retry checks. Stop Live checkout before entering any payment details or confirming purchase.
7. Roll back by restoring the prior complete protected runtime unit and deploying the prior known-good exact SHA. A mixed Sandbox/Live rollback is forbidden.

## Resolved Provider Capability

The 2026-08-27 Dashboard audit found the standard Customer Portal but no Product Collections configuration entry in either Portal settings or Catalog. The narrow higher-tier subscription update therefore remains on Paddle's official preview/update API with one local uncertainty/serialization boundary; no broader custom subscription workflow is added. If Paddle later enables Product Collections and it fully expresses the same higher-tier-only rule, replacing that boundary is a separate reviewed change.
