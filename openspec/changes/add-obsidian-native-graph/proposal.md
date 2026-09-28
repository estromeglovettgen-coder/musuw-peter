## Why

WeKnora's knowledge graph already has the correct product controls and navigation contract, but its hand-written SVG rendering feels comparatively rigid. The graph needs Obsidian-calibrated motion and rendering without turning the page into a different product or changing WeKnora data semantics.

## What Changes

- Replace only the graph drawing, physics, and camera implementation with the local Obsidian graph Worker plus a Pixi adapter.
- Keep the original WeKnora graph page structure, control order, legend, search, status, drawer, filtering, ego/bloom exploration, and API requests unchanged.
- Add one compact visual-settings button for node size, label fade, line thickness, force values, reset, restart, collapse, and close.
- Add a standalone growth-playback block inside graph settings with play, pause, resume, replay, and visible progress controls.
- Port the audited Obsidian progression behavior as live graph rendering: `progressionSpeed = clamp(0.5 * sqrt(totalLinks), 5, 100)` and requestAnimationFrame-driven progression ticks. This is a renderer timeline, not a video or screen recording.
- Keep the local `obsidian-1.13.7/graph-sim.js` Worker unchanged. Do not copy Obsidian's `UNLICENSED`/private `app.js`; only the observable progression state machine is clean-room ported at the renderer seam.
- Because the current graph API does not expose ctime/mtime, use the existing deterministic API node order for playback and record that this preserves stable behavior but does not claim chronological file order.
- Persist the visual settings and camera scale per knowledge base.
- Preserve the five original WeKnora page-type colors and the index fallback color.
- Make canvas background, lines, labels, outlines, panels, and controls follow WeKnora's active light/dark theme immediately.
- Preserve canvas affordances that existed in the original renderer, including hidden-neighbor rings, hover bloom, bidirectional arrows, selection, search focus, and the right-side source drawer.
- Keep the original graph endpoint limits and request bounds; the visual integration does not modify backend or graph-data contracts.

## Capabilities

### New Capabilities

- `obsidian-native-graph`: Obsidian-calibrated graph rendering and force controls behind the existing WeKnora graph UI contract.

### Modified Capabilities

- None outside the graph's visual and physics layer.

## Impact

- Frontend renderer seam, Pixi renderer, exact graph Worker adapter, compact settings panel with the growth-playback block, theme adapter, persistence, localization, and focused contract tests.
- No database migration, backend behavior change, endpoint limit change, permission change, or new runtime service.
