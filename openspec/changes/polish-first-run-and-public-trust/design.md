## Context

The product already has the necessary primitives: one Pinia entitlement store, browser-persisted chat settings, a Driver.js guide engine based on fixed WeKnora source, and a shared storefront content/theme system. The observed problems come from presentation and initialization at the consumers: loading state replaces an existing entitlement snapshot, new settings still default reasoning to `high`, guide adaptation omitted visible upstream steps, and public trust pages combine light-only values, duplicated list numbering and incomplete or hard-to-verify disclosure copy.

This change spans the authenticated frontend and public storefront, but it does not require a new API, persistence model, legal CMS, polling loop or UI library.

## Goals / Non-Goals

**Goals:**

- Make quota feel immediate while preserving server-authoritative values and identity isolation.
- Make the first-ever Lite chat start on V4 Flash with reasoning off, while preserving explicit and historical choices.
- Reconstruct onboarding from the fixed upstream journey and filter it by actual Lite visibility rather than inventing a parallel tour.
- Make public trust pages readable, accurate, reachable and consistent in light and dark themes.
- Produce testable evidence for code behavior, legal links, browser rendering and deployed first-run behavior.

**Non-Goals:**

- Changing quota calculation, OpenRouter settlement, billing, plan gates or payment lifecycle.
- Visually redesigning the homepage chat composer.
- Removing WeKnora multi-tenant, member, sharing, sandbox or administrative source code.
- Adding analytics experiments, a contact form backend, a legal-content service or jurisdiction-specific consent orchestration.
- Representing this engineering audit as a substitute for retained legal counsel.

## Decisions

### Use stale-while-revalidate inside the existing scoped store

The store continues to own one user-and-tenant-scoped snapshot and one in-flight request. Consumers render cached values even while `loading` is true. Model-response completion, persisted file uploads and confirmed payment transitions trigger an immediate background revalidation; opening the account menu remains a final forced calibration. A failed background refresh no longer destroys a previously successful snapshot; an initial failure still resolves to the existing unavailable state. This is smaller and safer than session storage, a service worker, optimistic quota arithmetic, polling or a second cache.

### Change only the no-preference Lite chat default

The shared Standard defaults remain unchanged. When Lite is resolved for an identity with no saved chat preference, the existing settings store fills DeepSeek V4 Flash with reasoning `none`. Existing persisted values and session `last_request_state` remain authoritative. The managed Free catalog continues to resolve V4 Flash through the existing plan filter and model resolver. No model capability or request schema changes.

The compact model overview keeps its existing width and hierarchy, but the selected model value never uses an ellipsis. Current names stay on one line; a future longer name wraps inside the value column instead of being hidden or widening the floating menu beyond the viewport.

### Derive onboarding from the fixed upstream source

The implementation will build a step inventory from WeKnora commit `81142df`, retain the existing Driver.js lifecycle and translate only product names or hidden-surface references. A target is included when the current Lite DOM exposes it and the task contributes to first value; hidden tenant/member/share/admin/infrastructure targets are excluded at the edition boundary. This avoids a second guide engine or a long one-shot wizard.

### Treat the storefront as a preserve-mode, trust-first redesign

Routes, navigation labels, logo, information architecture and brand neutrals remain. Security and contact pages receive shared semantic surface/text/divider/action tokens, with design dials set to low motion and moderate density. Ordered-list markers have one source. The contact page uses configured `mailto:` and `tel:` links; it does not add a form whose delivery backend would need new operational ownership.

### Audit legal text against primary sources and current runtime facts

Only claims supported by code, operations documentation, official vendor terms or primary law/regulator guidance are stated as facts. Unknown retention or vendor details are expressed as criteria or categories rather than invented periods. Terms and privacy copy use the current single-user consumer model, Paddle merchant-of-record relationship, model-provider processing and existing deletion/contact mechanisms. High-risk jurisdictional questions that need counsel remain explicit release notes rather than false certainty.

## Risks / Trade-offs

- [A stale quota snapshot remains briefly visible] -> Revalidate after successful metered actions, keep the existing short freshness window, and force a background refresh on account-menu open; never perform client-side quota arithmetic.
- [A failed refresh hides a real plan transition] -> Retain the previous value only until the next retry, keep account scope isolation, and refresh on navigation/open instead of extending cache lifetime.
- [Changing reasoning defaults affects existing users] -> Change the no-storage default only; do not migrate explicit stored values or session state.
- [An upstream guide target is not present at one breakpoint] -> Use current optional target resolution and browser-check empty, populated, desktop and narrow states.
- [Legal copy overstates operational facts] -> Trace every material statement to code, operator documentation or a primary source and keep qualified language where delivery or certification cannot be proven.
- [Passing DNS checks is mistaken for monitored support] -> Report DNS/link verification separately from actual inbox delivery and response, which requires an intentionally sent support request.
- [Storefront styling drifts from the rest of the site] -> Reuse existing variables and components, change shared legal-page selectors, and run light/dark visual plus accessibility checks.

## Migration Plan

1. Add failing regression tests for cached entitlement rendering, refresh failure preservation and new-user reasoning defaults.
2. Inventory upstream and current guide steps, then add only missing Lite-visible targets and localized copy.
3. Audit public policies and contact destinations, update content and shared trust-page styles, and add structural/link tests.
4. Run targeted tests, full frontend/storefront type checks and production builds, followed by one adversarial review.
5. Deploy the verified commit to staging, validate with a newly registered Lite account in both themes, then promote the exact successful revision to production and repeat health/link smoke checks.

Rollback is a normal revision rollback. There is no data, schema, API or payment migration.

## Open Questions

None block implementation. Human inbox monitoring and jurisdiction-specific legal adequacy will be reported with their evidence limits.
