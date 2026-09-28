## Context

Musuw runs the complete upstream WeKnora v0.7.2 application with a deliberately simplified consumer information architecture. The current screen treatment still inherits upstream colors, spacing, dense management framing, and visual brand cues. Earlier Musuw interfaces provide the visual authority, while the WeKnora frontend continues to own all application behavior.

This change spans the shared Vue presentation layer, the core consumer route surfaces, host-mode development scripts, and release verification. It must not alter knowledge-base creation, retrieval, graph data, uploads, chat streaming, authentication, or API contracts.

## Goals / Non-Goals

**Goals:**

- Recompose the app into a recognizably Musuw consumer workspace while preserving routes and native behavior.
- Establish shared visual tokens for typography, palette, spacing, borders, cards, focus states, and light/dark themes.
- Make chat, knowledge-base, and document interactions legible without exposing unavailable or administrative capabilities.
- Leave the knowledge-graph rendering, controls, layout, and graph-specific styles unchanged.
- Use host Go/Vite processes for everyday work and reserve full application containers for preview and release.
- Validate the result using the actual local application and browser user journeys before server release.

**Non-Goals:**

- Reimplement WeKnora runtime features, data models, graph layout algorithms, retrieval semantics, or agent orchestration.
- Add visual controls that do not invoke an existing capability.
- Replace the native Vue/TDesign component system or add a second UI framework.
- Change public route paths or authentication semantics as part of the visual change.

## Decisions

### Use prior Musuw as the visual authority and WeKnora as the runtime authority

The redesign will mechanically carry over verified Musuw visual principles rather than imitate WeKnora styles or invent a new product shell. The implementation will use shared CSS tokens and existing components, preserving their event and data contracts.

Alternative considered: reskin individual upstream components. Rejected because isolated color changes leave the upstream composition and management-oriented hierarchy visible.

### Rebuild the shell and core content compositions separately

The application shell owns global typography, themes, navigation geometry, responsive behavior, and shared controls. Chat, knowledge-base, and document views own their content arrangement. This limits visual changes to presentation seams and prevents a global style from silently breaking the excluded graph surface or streaming behavior.

Alternative considered: one large stylesheet override. Rejected because it would be brittle against view-specific states and make accessibility regressions difficult to verify.

### Preserve native controls only

Every visible control must correspond to an active native handler. The redesign will remove unnecessary visual chrome and hidden administrative structure rather than create illustrative controls.

Alternative considered: add a bespoke consumer dashboard. Rejected because it would duplicate existing flows and violate the zero-new-runtime scope.

### Prefer host-mode development with isolated dependency containers

Normal development runs Go and both Vite apps on the host for fast hot reload. Dependency services remain independently controllable and full Docker images are reserved for preview and release. Release scripts sync the verified source and build only the required production artifacts.

Alternative considered: full Docker compose for all local edits. Rejected because application image rebuilds consume memory and delay ordinary visual iteration.

## Risks / Trade-offs

- [Upstream component styles override shared tokens] -> Scope overrides under an explicit Musuw root and verify chat, forms, dialogs, light mode, and dark mode in a browser; verify separately that graph-specific selectors were not changed.
- [Visual changes obscure an active control] -> Preserve DOM handlers and provide keyboard/focus checks for all newly composed surfaces.
- [Working-tree concurrency overwrites unrelated improvements] -> Use narrow file ownership, inspect diffs before each patch, and integrate only targeted changes.
- [Release differs from host Vite development] -> Run a production frontend build, preview/runtime validation, then the existing release verification before cutover.
- [Browser acceptance creates persistent test data] -> Use a disposable local user/workspace or remove created resources through existing UI flows.

## Migration Plan

1. Record the old Musuw visual authority and audit current consumer routes.
2. Implement shared tokens and the shell, then recompose the core pages while retaining existing APIs and controls.
3. Run targeted tests, type checking, and production builds under host mode.
4. Exercise login, chat, knowledge-base creation/upload/search, settings, and logout in a browser; separately confirm the graph view is unchanged.
5. Use the existing source-only release workflow to publish the verified build. If runtime health or browser checks fail, restore the previous release symlink/container state through the existing rollback script.

## Open Questions

- The exact old Musuw typeface will be taken from the archived visual source before token values are finalized.
