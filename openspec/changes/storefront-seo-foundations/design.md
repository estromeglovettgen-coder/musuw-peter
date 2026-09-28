## Context

Public pages are built with Vite/React SSR and served by an existing Cloudflare Worker. Article URLs are already language-specific; homepages are selected by cookies and region. GSC's September 20 report shows 11 discovered but not indexed URLs, with no crawl evidence; this is not proof of a technical exclusion.

## Goals / Non-Goals

Goals: deterministic homepage language, discoverable useful content, honest metadata and production acceptance. Non-goals: ranking guarantees, mass articles, paid links, private application telemetry, product redesign, billing changes.

## Decisions

- Keep `/` as Chinese and add `/en` as English, preserving the existing root and article addresses. A small shared public-route helper supplies links and language selection. Do not migrate every legal/document route.
- Resolve legacy homepage language queries before rendering and combine www canonicalization into a single permanent document redirect. Preserve remaining query/hash. Keep API, widget and partner behavior outside document redirects.
- Reuse the existing prerender variants and region-derived currency independently of language. Worker HTML and React hydration must agree on URL language.
- Add a compact resource section and existing-style language links. Improve existing guides/comparisons only; use repository history for publication dates and visible current revision dates.
- Use stable Organization/WebSite entities and a separate WebPage entity; article dates and breadcrumbs must match visible content and existing URLs.
- Update the existing deployment smoke consumer for the intentional www redirect and the new homepage routes. Add only the reviewed exact workflow blob to the existing release allowlist.

## Risks / Trade-offs

- Language routing could regress pricing or app handoff → test conflicting country/cookie/URL combinations; preserve existing region pricing and product targets.
- Permanent redirects affect indexing → do not relocate indexed articles; test single-hop legacy and www redirects, query preservation and unknown routes.
- Reports lag → record report dates and distinguish live HTTP/browser acceptance from Google's indexing decisions. Do not claim CWV without data.
- Privacy → retain default-off consent and update only the public `/en` analytics allowlist.

## Migration Plan

Build and test, perform one independent review, merge reviewed PR through required checks, wait for main CI and automatic storefront deployment, then verify live HTML, navigation, mobile layout and key URLs. Existing workflow rollback remains available; no database migration is needed.
