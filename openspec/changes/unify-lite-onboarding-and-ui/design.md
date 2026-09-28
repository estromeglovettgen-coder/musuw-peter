## Context

Musuw Lite is a single-user, single-tenant consumer product built on the preserved WeKnora frontend. The current surface already contains the required flows and several mature visual primitives, but local overrides and partially adapted upstream guides have created visible drift: onboarding targets the wrong controls, consumer copy still refers to members and workspaces, dropdowns differ across settings, related list pages use slightly different geometry, and one-off dialogs and notifications do not follow the global theme.

This change is a presentation and activation refinement. It must not alter backend APIs, persisted field meanings, authorization, entitlements, payments, quota accounting, multi-tenant behavior, sharing, sandbox behavior, or the homepage new-chat composer UI. Existing WeKnora components, Driver.js guides, TDesign controls, and Musuw CSS authority layers remain the implementation source.

## Goals / Non-Goals

**Goals:**

- Take a new Lite user from an empty knowledge-base list to a created knowledge base, then clearly introduce file upload, webpage import, and first chat.
- Make every affected consumer dropdown outside the homepage new-chat composer use one existing settings-selector geometry, typography, popup, option, focus, and theme contract.
- Make the knowledge-base and agent directories share one page skeleton and card grid without page-switch jitter.
- Make related toolbar buttons, account-menu rows, confirmation dialogs, and memory controls visually consistent in light and dark themes.
- Remove Lite-visible team terminology and unsupported tutorial-replay affordances while preserving Standard behavior.
- Prevent repeated success notifications during memory autosave without changing the saved payload or timing contract.

**Non-Goals:**

- Redesigning or restructuring the homepage new-chat input/composer.
- Replacing TDesign, Driver.js, Vue components, or the existing Musuw theme system.
- Removing or modifying WeKnora multi-tenant, member, sharing, sandbox, Standard-edition, or administrative source behavior.
- Changing payment, plan, quota, storage, model eligibility, authentication, API, database, or background-job behavior.
- Adding a design-token framework, guide engine, notification queue, or other future-facing abstraction.

## Decisions

### Existing controls are the authority

The selector used in General Settings and the consumer branch of `ModelSelector` is the visual authority. Existing TDesign selects receive the repository's `visual-scene-select` bridge; model selectors use their existing consumer mode. We will correct the shared bridge once where necessary instead of restyling each page. The homepage new-chat composer is excluded and may receive only inert `data-guide` targeting attributes.

### Guides remain contextual and Lite-specific

The existing Driver.js contextual-guide mechanism remains the only guide engine. Lite guide steps target controls already present in the product. The empty knowledge-base guide targets the centered empty-state action before any header fallback. Lite creation starts with a localized editable default name and ends on the existing submit button. New Lite knowledge bases and custom agents derive that suggestion from the names already loaded by the existing store: use the localized base name first, then the first available localized numeric suffix beginning at 2. This is only a convenience default; existing server validation remains authoritative. Knowledge-base detail teaching separates file upload from webpage import. The chat guide teaches the existing combined agent/model/reasoning control in one concise step and mentions that some models require an upgrade.

Guide completion remains stored by the existing per-user mechanism. Lite hides the unsupported replay question mark and uses copy that does not promise replay; Standard retains the existing replay affordance and upstream flow.

### Shared CSS contracts resolve page drift

The existing Musuw post-import authority styles own page padding, header baseline, divider, content start, grid columns, card size, and theme tokens for both knowledge-base and agent directories. Page-specific markup is retained unless a semantic attribute or class is required. Exact equality is tested at the CSS-contract level and verified in the browser at the same viewport.

The knowledge document toolbar uses one neutral button geometry for folder, filters, view, and webpage import. Add Document uses the same geometry with inverse foreground/background by theme. Filter menus use the authoritative selector popup geometry and never truncate the fixed “All …” labels.

### One confirmation-dialog treatment, not another dialog system

Agent and knowledge-base destructive confirmations retain their existing handlers and TDesign dialog lifecycle. One shared dialog class supplies title, body, semantic buttons, spacing, radius, overlay, focus, and light/dark tokens. Page-local dialog overrides are removed. No modal service or state layer is introduced.

### Memory keeps its contracts and loses presentation noise

Long-term Memory keeps the same fields, defaults, validation, debounced persistence, permissions, and minimum interval of one second. The existing agent segmented control is reused for write mode. Consumer copy describes the current user and their memory rather than members or a workspace. Successful autosaves are silent because the updated control state already confirms success; failures remain explicit. Pending debounce timers are cleared on unmount.

### Lite adaptation is visibility-scoped

All copy and affordance changes that would narrow an upstream collaboration workflow are gated by the existing Lite/Standard edition boundary. Standard source and reachable behavior remain present. The change does not delete member, tenant, share, sandbox, or administration modules.

## Risks / Trade-offs

- [A broad CSS selector changes the homepage composer] → Scope authority selectors to settings, knowledge, agent, and overlay classes; add regression assertions that composer class structure and styling remain unchanged.
- [Guide targets disappear in an empty or populated state] → Use ordered scoped target fallbacks and skip optional steps through the existing guide resolver.
- [A default name duplicates an already loaded object] → Choose the first available localized suffix and keep the value editable.
- [Two clients create the same suggested name concurrently] → Treat the suffix as a best-effort client suggestion based on loaded data; keep existing server validation and error handling authoritative.
- [Exact page parity breaks responsive behavior] → Share desktop and breakpoint values in the existing authority stylesheet and browser-check desktop plus narrow layouts.
- [Silent autosave hides failure] → Suppress success only; keep one explicit error message and existing validation.
- [Lite wording leaks into Standard] → Use existing edition branches for guide/menu behavior and limit shared locale changes to copy that is valid for both editions, otherwise add Lite-specific keys.
- [Dialog unification changes deletion behavior] → Preserve handlers, confirmation requirement, close behavior, and irreversible-action warning; change only semantic markup and shared presentation.

## Migration Plan

1. Add/update contract tests for guides, selectors, toolbars, page parity, dialog semantics, account menu, and memory copy/notifications.
2. Apply the smallest markup attributes and shared-style corrections, then update all supported locales together.
3. Run targeted frontend tests, type checking, linting, and a production build.
4. Verify the affected flows in light and dark themes as a new Lite user, including empty-state onboarding and browser overlays.
5. Fast-forward or merge the verified branch into `main`, push, wait for CI and staging deployment, then repeat the critical browser checks.

Rollback is a normal revision rollback; there is no schema, data, API, or entitlement migration.

## Open Questions

None. Where the screenshots conflict with older local styling, the existing General Settings selector and shared Musuw settings shell are authoritative.
