## Why

The local operations console needs a narrow, authenticated system-admin seam
for seeing a tenant's effective entitlement and making support-safe changes.
Its current tables must not resort to raw SQL or duplicate the Paddle and
OpenRouter billing rules.

## What Changes

- Add a cross-tenant entitlement snapshot backed by the existing entitlement
  service and OpenRouter-managed child-key usage.
- Add a whitelist-only tenant mutation for account status and storage quota.
- Add a provider-backed OpenRouter remaining-credit adjustment/reset bounded by
  the existing Max plan allowance; Paddle plan and billing state remain
  webhook/API owned.
- Record each successful operator mutation in the existing system audit log.
- Add one bounded read-only user investigation projection for support
  correlations, reusing existing repositories and explicitly redacting user
  content, attachments, provider keys, and task/span payloads.
- Replace the rejected Appsmith prototype with one source-controlled TDesign
  Vue Next operations entry that reuses the scoped APIs, official provider
  reads/consoles, and existing WeKnora queue/audit components.

## Out of Scope

- A general SQL or arbitrary mutation endpoint.
- Manual Paddle plan, invoice, refund, or subscription writes.
- A Musuw usage ledger, OpenRouter HTTP client, or alternate provider adapter.
- A second account system, generic low-code platform, supplier-console clone,
  or browser-selectable production datasource.
