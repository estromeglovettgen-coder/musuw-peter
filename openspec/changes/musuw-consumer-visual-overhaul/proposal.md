## Why

The active application still presents the upstream WeKnora visual language even though Musuw is a consumer knowledge workspace with a distinct, previously proven product language. The result exposes more structure than consumers need and makes the product feel like an unadapted upstream application.

## What Changes

- Replace the active consumer-facing visual system, shell, and core page compositions with the established Musuw language: calm light surfaces, compact navigation, deep-blue actions, and readable research content.
- Preserve the existing WeKnora knowledge-base, graph, retrieval, upload, and agent runtime behavior. The knowledge-graph surface is explicitly excluded from this visual change. No data model, route contract, or unavailable feature is introduced for visual reasons.
- Remove remaining visible upstream product branding and upstream-oriented information architecture from regular user surfaces.
- Add a host-mode first development workflow and a narrowly scoped release workflow so UI work uses local Go/Vite processes and reserves container builds for preview or server release.

## Capabilities

### New Capabilities

- `musuw-consumer-visual-language`: A coherent Musuw presentation system and consumer workspace composition across the application shell, chat, knowledge-base, and document surfaces, while leaving the knowledge graph unchanged.
- `musuw-host-mode-workflow`: Fast, memory-conscious local development and a verified release path that do not require a full application container rebuild for normal UI work.

### Modified Capabilities

- None.

## Impact

- Affects `weknora/frontend` presentation components, styles, and visual assets only; application APIs and runtime behavior remain native WeKnora.
- Affects local developer and release scripts under `scripts/` and `integration/`.
- Requires browser-based user-journey verification before the release workflow updates the server.
