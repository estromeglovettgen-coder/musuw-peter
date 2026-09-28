## Context

Musuw already has a server-owned Lite/Standard edition split, role checks, deployment capabilities, plan entitlements, and a Musuw visual shell. The fixed main kernel added useful document, memory, sandbox, skill, artifact, connector, and management behavior, but the mechanically complete Standard surface exposes infrastructure decisions that a managed SaaS user cannot safely or usefully make.

This change is a product-boundary refinement. It must preserve upstream code and existing Musuw business/data semantics, make no parallel runtime, and remain compatible with existing and empty databases.

## Goals / Non-Goals

**Goals:**

- Make the Lite server gate the authoritative production boundary and the Lite frontend an exact projection of it.
- Present document, automatic-tag, parsing, memory, and low-cost chat improvements through existing Musuw visual modules.
- Guarantee that Lite users cannot create FAQ knowledge bases or reach excluded capabilities through crafted requests, stale browser state, or deep links.
- Keep Sandbox and Skill providers unconfigured and unprovisioned in production Lite.
- Preserve Standard as the complete internal upstream acceptance surface.

**Non-Goals:**

- Removing upstream Sandbox, Skill, Artifact, FAQ, connector, provider, or administration implementations.
- Building a new feature-flag, permission, artifact, model, parser, or storage architecture.
- Migrating or deleting unexpected legacy FAQ rows without a separate audited data decision.
- Exposing arbitrary code execution or user-installable extensions in the first Musuw release.

## Decisions

### Reuse the existing product seams

The backend `liteProductGate` remains the authoritative interface for product exposure. Frontend Lite allow-lists, route normalization, role checks, and deployment capabilities mirror that interface for usability. Standard behavior is not narrowed. This keeps one product-policy seam rather than distributing special cases across handlers.

### Make document-only knowledge bases a server invariant in Lite

The Lite frontend initializes and submits `document`; the server rejects or normalizes any consumer create request that attempts another type. Existing FAQ rows are not exposed as a product feature. A deployment audit reports unexpected rows before any separate migration.

### Keep provider choices server-owned

The knowledge editor renders only Basic and Advanced sections. Existing Musuw rows and drawers carry the UI. Consumer payloads retain compatible fields, but model, embedding, vector store, parser, image/audio model, chunking internals, and storage provider are resolved through existing server/consumer-scene defaults.

Automatic tagging is a product switch, not a model configuration surface. Lite forces `builtin-deepseek-v4-flash`, three matches, and preservation of manual tags. AnyDoc remains an automatic parser implementation and has no consumer selector.

### Exclude executable infrastructure as one chain

Sandbox configs, Skills, environment variables, shell execution, sandbox files, and generated artifacts are treated as one executable capability chain. Lite removes every discovery/configuration/invocation path and rejects crafted Skill/Sandbox chat inputs. Production does not configure a provider, so no runtime instance is created. Existing ordinary attachment/document preview behavior is retained.

### Preserve memory ownership and progressive disclosure

Lite exposes personal memory and the complete workspace memory configuration through the existing Settings shell. Personal content remains scoped to its owner. Every member can inspect the workspace policy; only admins can update it. Common controls (enabled, write mode, retrieval conditioning, and retention limit) stay directly visible; model selection, semantic recall, extraction cadence, interest threshold, and custom extraction instructions remain fully visible inside one compact Advanced disclosure. Controls that do not apply to the selected mode stay visible but disabled with an explanation. Lite and Standard persist the same validated memory contract rather than silently discarding fields.

### Treat Musuw layout structure as a product contract

Matching colors is not sufficient. Every newly exposed settings surface must
reuse the existing Musuw structure at the component boundary: the shared
`VisualSettingsShell` modal, left-side section navigation, page header,
unboxed `settings-group` / `setting-row` rhythm, `setting-info` copy column,
bounded `setting-control` column, shared footer, and the existing narrow and
dark-mode behavior. A new surface must not substitute an upstream top-tab
dialog, card grid, isolated alert-card language, or a one-off form geometry
when an existing Musuw component or class contract can express the same
interaction.

Knowledge Basic/Advanced, personal and workspace Memory, Agent settings, and
upload-time settings are one visual family. Domain-specific controls may remain
specialized, but their placement, spacing, grouping, labels, descriptions,
focus states, loading/error/empty states, and responsive collapse follow the
shared Musuw shell. Standard may expose more sections than Lite, but it uses
the same shell and row grammar rather than a parallel upstream visual system.

### Separate review from correction

After implementation and automated verification, one consolidated adversarial review records findings without corrective edits. The exact reviewed tree is then exercised as an ordinary Lite user in a real browser. Findings are classified as reproducible, non-reproducible, or not browser-reachable before any later corrective pass.

## Risks / Trade-offs

- [Frontend and server policy drift] → Contract tests cover navigation, deep links, request bodies, and route families at the existing product seams.
- [Unexpected FAQ data] → Audit and report row counts; do not silently delete or reinterpret content.
- [Hidden executable API remains callable] → Deny route families and crafted chat fields in the Lite server gate, not only in templates.
- [Consumer defaults overwrite existing Musuw semantics] → Apply forced defaults only in Lite and only to newly submitted consumer configuration; Standard and stored non-consumer data remain intact.
- [Advanced UI becomes another technical settings dump] → Reuse Musuw rows, keep one disclosure, explain dependencies in product language, and avoid exposing provider credentials or a second model-management surface.
- [Colors match while structure drifts] → Contract-test shared shell/row reuse, prohibit top-tab and card-grid substitutes on exposed settings pages, and browser-check desktop/narrow plus light/dark layouts for clipping and hierarchy drift.
- [Review findings mutate before reproduction] → Record the reviewed commit/diff and prohibit corrective edits until browser reproduction is complete.

## Migration Plan

1. Add tests and server gates before exposing the new Lite pages.
2. Audit `knowledge_bases.type = 'faq'`; zero rows require no data action, nonzero rows are reported and backed up for a separate decision.
3. Deploy with no Sandbox/Skill provider configuration and the executable capability disabled.
4. Verify existing Lite tenants and an empty database, then verify Standard remains complete.
5. Roll back by returning to the prior revision; no destructive schema or data migration is introduced.

## Open Questions

None. Product defaults and excluded capabilities were explicitly confirmed for this first release.
