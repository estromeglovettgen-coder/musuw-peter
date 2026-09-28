## Context

Musuw Lite already contains the upstream WeKnora knowledge-base editor, custom-agent runtime, agent CRUD, chat agent selection, and remote MCP management. The supplied `musnow-ai-workspace (7).zip` and the accompanying screenshots are the visual authority for the agent, MCP, knowledge settings, and combined chat capsule surfaces; the clean WeKnora 0.7.2 tree is the functional authority for types, APIs, permissions, defaults, selectors, persistence, and execution paths.

The implementation must remain a thin product layer. It must preserve the user's unrelated TikHub/social-import work and must not add a parallel configuration model, agent engine, MCP client, rebuild endpoint, database migration, or provider protocol.

## Goals / Non-Goals

**Goals:**

- Expose the agreed native knowledge-base fields during creation and later editing.
- Expose native agent lifecycle, reduced configuration, cards, and chat selection.
- Expose native tenant-admin MCP management and allow smart agents to select configured services.
- Mechanically translate the reference React component hierarchy and style values into the active Vue/TDesign frontend, while retaining native WeKnora event handlers and state.
- Narrow Lite gates only for the native route families required by these surfaces.
- Verify real create/edit/select flows in the browser.
- Verify the affected surfaces in both light and dark themes and compare fixed-viewport screenshots against the reference structure.

**Non-Goals:**

- No new database columns, API endpoints, queues, agent modes, prompt schema, MCP protocol, or `/rebuild-index` implementation.
- No custom model/provider management or replacement for existing tenant authorization and credential storage.
- No automatic reprocessing of existing knowledge when Wiki settings change; the UI must not claim that native WeKnora performs it.
- No general redesign of unrelated settings, chat, or knowledge-base pages.

## Decisions

### Reuse native contracts end to end

The Vue surfaces SHALL submit the existing WeKnora request objects and call the existing APIs. Hidden controls retain native defaults and existing persisted values. This is smaller and safer than introducing consumer-specific DTOs or adapters, and keeps Standard and Lite behavior on the same runtime.

### Treat the reference archive as presentation authority only

Agent cards, editor navigation, MCP list/editor, and chat selector SHALL follow the reference component structure, spacing, hierarchy, empty states, and interaction states. The implementation SHALL translate React primitives into existing Vue and TDesign components rather than copying runtime logic or adding a second component system.

The clean WeKnora 0.7.2 implementation SHALL be diffed first for every affected production component. Native functions, request fields, stores, events, permissions, and persistence SHALL be retained. Where the reference changes placement, a thin presentation container may invoke the existing native selector or handler, but MUST NOT duplicate its state or selection workflow.

### Compose native chat controls inside one capsule

The chat composer SHALL present one grey capsule matching the supplied reference. Its expanded panel contains Agent, Model, and native reasoning controls. Agent selection delegates to the existing `AgentSelector`; model selection delegates to the existing model selector; reasoning uses only the capability already supported by WeKnora and the selected model. No synthetic reasoning levels or parallel chat settings state are introduced.

### Treat light and dark as equal acceptance modes

Every translated surface SHALL use the existing application theme mechanism and semantic tokens. Dialogs, drawers, overlays, cards, labels, helper text, inputs, menus, hover/focus states, disabled states, and loading/error states must remain visible in both modes. A page that loads only in one theme or loses readable controls in the other fails acceptance.

### Expose a deliberately reduced agent editor

The editor SHALL expose name, description, quick-answer/smart-reasoning mode, conversation model, one system prompt, and knowledge-base scope. Smart reasoning additionally exposes MCP service selection. The separate agent-type preset, file-type restriction, query rewrite prompts, fallback prompts, temperatures, token limits, thinking controls, rerank controls, tools, skills, iteration limits, and timeouts remain hidden. Quick and smart retain their native distinct default prompts; changing mode loads the existing default for that mode, while one saved agent still stores one mode and one prompt.

This uses the existing `CustomAgentConfig` instead of inventing a dual-prompt or consumer-agent model.

### Keep MCP permissions and transport native

The global MCP settings page SHALL expose the full existing remote-service form from the reference while preserving native tenant-admin authorization, SSE/Streamable HTTP support, encrypted credentials, OAuth, SSRF checks, connection testing, and tool approval behavior. Agent MCP selection references configured services and appears only for smart reasoning. No user-supplied stdio execution or custom transport is added.

### Expose only agreed knowledge settings

Knowledge-base create/edit SHALL expose name, description, RAG, Wiki, Wiki granularity, the two native Wiki instruction fields, and the summary LLM. Graph remains enabled by the platform default but is not presented as a consumer choice. Native validation remains authoritative. Saving settings persists the native fields; it does not imply that historical content is rebuilt.

### Narrow Lite gates instead of bypassing them

The backend Lite product gate SHALL permit only the existing agent CRUD/runtime, MCP management/OAuth/approval, and chat payload paths required by this feature. The existing route-level roles, tenant filtering, credential handling, and service validation remain in force. UI visibility is not treated as authorization.

FAQ remains outside the Lite product: native FAQ creation and mutation routes,
plus FAQ copy/duplicate paths, are rejected server-side while Standard keeps
the upstream behavior. Historical FAQ rows remain untouched in storage and are
reported by the read-only startup audit, but no Lite HTTP read/search/delete
route exposes them. Web search follows the opposite policy: Lite forces
the existing native request field on at both router and service seams while
keeping its UI toggle hidden; Standard retains the caller's native choice.

## Risks / Trade-offs

- **Hidden legacy agent values can remain persisted** → Hide without rewriting them unless the visible choice requires a native field change; test mode changes and save/reload behavior.
- **Moving the model control can break validation focus/navigation** → Update the existing section mapping and validation target with the same field binding.
- **Lite gate changes can expose more than the UI** → Add policy tests for allowed native routes and retain native role checks.
- **React and Vue/TDesign differ internally** → Mechanically match visible hierarchy, dimensions, spacing, typography, colors, radii, states, and fixed-viewport browser screenshots without copying the reference's mock business handlers.
- **Wiki edits do not rebuild historical content** → Use honest helper copy and preserve native behavior; do not call the frontend's unimplemented rebuild API.
- **MCP can perform external actions** → Preserve native admin permissions, enable switches, connection testing, OAuth/credential isolation, and tool approval rather than creating shortcuts.

## Migration Plan

1. Add source-contract tests for the intended Lite visibility and hidden fields.
2. Port the reference presentation into the existing native components.
3. Narrow Lite route gates and add backend policy tests.
4. Run frontend tests, type-check/build, backend tests, and browser acceptance.
5. Roll back by reverting the UI visibility/presentation and Lite gate changes; no data migration is required.

## Open Questions

None. Existing WeKnora behavior is authoritative wherever the reference archive contains only presentation.
