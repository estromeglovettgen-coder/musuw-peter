## Context

The active frontend is a Vue and TDesign workspace with a prior global
consumer skin. That skin changes TDesign variables and some teleported
controls at `:root` and `body`, which means it can accidentally alter the
Wiki knowledge graph even when no graph selector is named. The new direction
is a Codex Desktop-inspired web workspace, not a copy of the Codex desktop
runtime: Musuw keeps its own name, routes, behaviors, and existing component
library.

The references include the Codex desktop screenshot and the supplied legacy
Musnow / Google AI Studio source export. They define visual tone only: a
neutral, high-density application shell, compact navigation, precise type,
fine dividers, and a modest number of rounded interactive surfaces. The
active Vue application remains the sole authority for routes, actions,
permissions, knowledge concepts, and data behavior.

## Goals / Non-Goals

**Goals:**

- Make every regular user-facing workspace surface share one Codex
  Desktop-inspired visual language in light and dark modes.
- Preserve all existing information architecture, behavior, product branding,
  accessibility semantics, focus behavior, model controls, uploads, and data
  contracts.
- Keep the knowledge graph as a visually isolated island, including its
  canvas, graph search popup, help popup, graph drawer, nodes, controls, and
  graph-tab content.
- Enable fixed-view screenshot comparison for the normal-size, default-font
  Mac browser experience.

**Non-Goals:**

- Rebuild Codex, copy its product branding, or add an Electron/native window
  shell, traffic lights, native menus, or native window effects.
- Guarantee identical physical pixels across native and browser font
  rasterizers, OS versions, display scaling, or user-selected font/zoom
  preferences.
- Change routing, APIs, storage, model selection, knowledge-base defaults,
  RAG behavior, upload behavior, or graph behavior.
- Add a second component library, icon library, design-system runtime, or
  global animation framework.

## Decisions

### 1. Use a single Codex-inspired presentation seam, not a new UI runtime

The existing Vue components, TDesign controls, and user workflows remain the
source of truth. The visual migration will be implemented through the existing
theme stylesheet, presentation stylesheet, and a minimal sidebar or page-state
class where precise DOM scoping is needed.

This is smaller and safer than porting Codex's desktop UI or replacing TDesign.
It keeps routing, state, accessibility, and hidden managed-experience controls
intact while allowing CSS-level geometry and hierarchy changes.

### 2. Use the existing restrained product typography

The normal visual default will use the existing Inter variable font with Noto
Sans SC for Chinese and JetBrains Mono for code and technical values. Existing
explicit user font and zoom preferences remain authoritative, with system
stacks retained as fallbacks.

These fonts are already installed and match the supplied visual reference, so
the change introduces no additional typography runtime or font family.

### 2a. Copy presentation, never template product structure

The legacy Musnow export can inform spacing, type scale, grayscale, borders,
card proportions, composer geometry, and reference-panel hierarchy. Its
template-only navigation items, views, account/storage widgets, models, and
knowledge concepts must not be ported. Existing Vue templates and handlers are
preserved except for explicitly requested visual relocation of the existing
knowledge-base create action.

### 3. Scope component-library tokens to non-graph workspace surfaces

Codex-style TDesign variable mappings must not live at `:root`. They will be
applied only to named regular workspace containers and known non-graph
teleported surfaces. Semantic `--codex-*` tokens can remain globally defined
because graph code does not consume them, but generic `--td-*`, scrollbar,
select, drawer, and dialog overrides cannot be global.

The knowledge-base root receives an explicit graph-tab state class. Document
and library presentation rules apply only when that class is absent. The graph
search control receives a dedicated overlay class so a generic select popup
rule can never restyle it. Graph drawer and graph help popup classes remain
excluded from every regular drawer/dialog rule.

This is preferred over CSS reset tricks because it preserves the upstream
graph's own component variables and avoids relying on incomplete token resets.

### 4. Reuse the existing icon family and preserve Musuw branding

The sidebar and controls use the installed TDesign outline icon family with a
consistent compact size and stroke treatment. The Musuw wordmark remains
Musuw, styled with the same restrained hierarchy as the reference application.
No custom SVG approximation of Codex product marks is introduced.

### 5. Treat visual parity as a content-surface screenshot contract

Acceptance is visual parity of the browser content area at the reference
logical viewport and default settings: structure, neutral palette, density,
row geometry, typography stack, borders, radii, state styling, and panel
relationships. Native macOS titlebar/window chrome and platform font
rasterization are expressly outside comparison scope.

## Risks / Trade-offs

- [A global TDesign override reaches graph popups] -> Restrict overrides to
  named regular surface classes, give the graph select an explicit overlay
  class, and enforce this through a static visual contract test.
- [CSS layering makes a late stylesheet override the intended skin] -> Keep a
  single final presentation import after upstream TDesign and dropdown styles;
  remove competing root token declarations.
- [The compact target weakens accessibility] -> Retain semantic controls,
  visible keyboard focus rings, non-color state cues, and WCAG AA text/input
  contrast in both themes.
- [A wide global selector changes an unexamined view] -> Favor explicit
  surface selectors and run focused visual checks for sidebar, chat, composer,
  KB list/detail/documents, teleports, and graph isolation.
- [Screenshot comparison is misread as native-pixel equality] -> Use a fixed
  browser viewport, default user font, default zoom, and a documented
  content-area-only comparison baseline.

## Migration Plan

1. Record the visual contract and audit existing global theme and teleport
   selectors.
2. Add graph state and graph-popup isolation where needed, then replace global
   root TDesign mappings with scoped workspace mappings.
3. Update typography, sidebar, chat/composer, KB/document, reference, dialog,
   drawer, and menu presentation in one coherent stylesheet.
4. Verify the existing Inter/Noto/JetBrains imports and explicit user font
   preference behavior.
5. Run managed-experience tests, visual contract tests, type checking, build,
   and fixed-viewport browser verification when the browser is available.
6. Release as a frontend-only update. Roll back by returning the frontend
   release pointer to the immediately prior UI release; no data migration is
   involved.

## Open Questions

- Fixed-viewport screenshot comparison is deferred until the desktop browser
  is available. The reference viewport and default-font baseline are already
  defined, so this does not block the source implementation.
