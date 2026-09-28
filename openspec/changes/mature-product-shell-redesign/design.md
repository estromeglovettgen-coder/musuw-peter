## Context

Musuw already has production-capable React authentication and Vue consumer surfaces. The current implementation preserves the right runtime, entitlement, route, and permission contracts, but authentication requires an uncommon legal checkbox, the chat controls use a narrow nested overlay that truncates labels, and the three Lite settings sections sit in a small modal with inconsistent inner typography. The redesign must improve those surfaces without replacing TDesign, changing provider integrations, or disturbing the completed operations console.

## Goals / Non-Goals

**Goals:**

- Give authentication, chat controls, and Lite settings one restrained, desktop-product visual grammar based on familiar patterns from mature developer and productivity products.
- Expose every existing state and control with complete labels, predictable focus behavior, keyboard operation, and useful narrow-screen fallbacks.
- Preserve legal links and explicit notice while removing the checkbox as a prerequisite for Google or email-code authentication.
- Let a larger future model catalog remain quickly scannable and scrollable without changing the model and reasoning contracts.

**Non-Goals:**

- No new authentication methods, providers, plans, settings capabilities, account fields, model identifiers, or inference parameters.
- No copy of third-party source code, trademarks, branded artwork, or proprietary assets.
- No framework, component-library, route, API, database, provider, operations-console, or release-protocol replacement.

## Decisions

### Preserve behavior owners and refactor only presentation seams

The React auth runtime and Vue stores, composables, API calls, permission checks, and event contracts remain behavior authorities. Templates, semantic structure, local presentation state, CSS, and focused contract tests may change. Replacing the surfaces with a new design system was rejected because it would duplicate TDesign, enlarge the release, and risk breaking already verified production behavior.

### Use one compact neutral product grammar

The surfaces use the repository's existing font stacks and icons, neutral surfaces, one focus accent, 10-12px controls/cards, 8px compact navigation items, restrained shadows, and borders only where they clarify grouping. Motion is limited to state feedback and SHALL honor reduced-motion preferences. This matches the product's existing shell and avoids decorative AI motifs.

### Present legal assent as persistent notice, not a gate

Authentication actions remain available after valid input without a separate checkbox. A short notice immediately below the action area states that continuing means agreeing to the Terms and acknowledging the Privacy Policy, with both links independently focusable and locale-correct. The legal documents and authentication runtime remain unchanged.

### Use one scalable selector hierarchy for model and reasoning

The composer retains one compact current-selection trigger. Its overlay mechanically follows the supplied Codex Desktop reference: a content-sized two-row overview and compact, single-line, scrollable model and reasoning lists with complete labels and a visible current check. It does not add search chrome, provider headings, secondary descriptions, or explanatory copy beneath choices. Entitlement-disabled choices remain visible through their existing gate behavior. Keyboard behavior follows the ARIA listbox pattern while preserving current `selectedModelId`, reasoning effort, and send contracts.

### Recompose settings as a large two-pane workspace

Desktop settings use a near-viewport surface: a muted fixed-width sidebar with a back/close action, settings search, category label, and compact navigation; the main pane provides a consistent title, description, and grouped rows at a readable line length. Lite exposes exactly General, Usage and billing, and User profile. Search filters only permitted navigation items and never bypasses role checks. Small screens collapse to a full-height single-column surface with an accessible horizontal or drill-in navigation fallback.

## Risks / Trade-offs

- [Removing the checkbox could be mistaken for removing legal notice] -> Keep the notice adjacent to the actions, preserve both direct links, add contract tests, and verify both locales in production Chrome.
- [Selector presentation changes could alter model or reasoning values] -> Treat IDs and existing handlers as immutable contracts; test selection, gating, escape, and send behavior separately from visual checks.
- [A larger settings surface could regress non-Lite administrator pages] -> Keep the same component host and permission filtering; apply the shell generically, then test Lite and existing role contracts, with extra-width sections explicitly supported.
- [Responsive CSS can hide permitted controls] -> Verify desktop, narrow desktop, and mobile layouts with DOM visibility/focus assertions and a real browser pass.
- [Concurrent production release and UI work can create evidence drift] -> Release and validate a single final SHA after all UI and evidence changes merge; public revision labels must match that SHA.

## Migration Plan

1. Land focused UI contract tests and the three presentation changes without API or data migrations.
2. Run auth tests/build, Vue tests/build, storefront tests, secret scan, and strict OpenSpec validation.
3. Deploy through the existing exact-SHA CI, Cloudflare, and immutable GHCR server path.
4. Complete real production Chrome acceptance for both locales, auth methods, selector states, all three settings sections, and the previously required knowledge/chat/video/billing lifecycle.
5. Roll back by redeploying the prior immutable SHA if a production-only regression appears; no data rollback is required.

## Open Questions

None. The user supplied the visual reference and explicitly authorized the scoped redesign.
