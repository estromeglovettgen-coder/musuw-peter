## Why

Musuw already exposes a complete knowledge workspace, but its visible web UI
still reads as a themed upstream application rather than a focused, native-like
desktop research tool. The product direction is now a Codex Desktop-inspired
workspace: calm, compact, and structurally clear while retaining Musuw's
existing information architecture and behavior.

## What Changes

- Replace the current consumer visual skin with one Codex Desktop-inspired
  visual language for the user-visible application shell, sidebar, chat,
  composer, knowledge-base, document, citation, reference, dialog, and drawer
  surfaces.
- Use the existing Inter, Noto Sans SC, and JetBrains Mono assets, neutral gray tokens, thin separators,
  compact sidebar hierarchy, restrained rounded controls, and a single
  accessible accent state. Preserve the Musuw product name and all existing
  route labels, actions, model modes, and data behavior.
- Treat the supplied legacy Musnow / Google AI Studio export as a visual
  reference only. It SHALL NOT introduce routes, navigation items, actions,
  storage/account controls, or knowledge concepts absent from the active
  product.
- Scope global component-library overrides so body-teleported dialogs, drawers,
  citation previews, and selectors participate in the same visual system.
- Explicitly exclude knowledge-graph canvases, graph drawers, graph nodes,
  graph toolbars, and graph rendering behavior from the migration.
- Add contract checks that prevent the global presentation layer from styling
  graph-only surfaces or reinstating a competing visual token source.

## Capabilities

### New Capabilities

- `codex-workspace-visual-system`: A visual-only Codex Desktop-inspired
  presentation contract for Musuw's workspace, including graph isolation and
  responsive, accessible light and dark themes.

### Modified Capabilities

- None.

## Impact

- Affected frontend presentation files include the theme token layer, the
  workspace visual stylesheet, the application entrypoint, sidebar markup, and
  existing chat, knowledge-base, document, reference, dialog, and drawer
  selectors.
- No API, database, authentication, model, upload, retrieval, or graph data
  contract changes are introduced.
- The existing component library remains in place; this change does not add a
  second UI runtime or change user-visible product branding to Codex.
