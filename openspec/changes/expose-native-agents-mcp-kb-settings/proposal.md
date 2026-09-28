## Why

Musuw Lite currently hides complete WeKnora knowledge-base, custom-agent, and MCP management workflows that the consumer product now needs. The product should expose a deliberately small subset of those native capabilities while using the supplied React workspace as the visual authority, without introducing parallel execution, storage, or configuration contracts.

## What Changes

- Restore the native WeKnora knowledge-base editor for consumer users with only the agreed name, description, RAG, Wiki, Wiki granularity, Wiki instructions, and summary-model controls visible.
- Restore native custom-agent listing, cards, creation, editing, deletion, and chat selection.
- Reduce the native agent editor to basic information, the selected conversation model, one system prompt, knowledge-base scope, and smart-reasoning MCP selection. Hidden fields retain native defaults.
- Restore the native MCP settings routes and tenant-admin management workflow, while mechanically porting the supplied `McpSettingsPanel` presentation and exposing the complete native remote-service form.
- Add the supplied `musnow-ai-workspace (7).zip` agent card, editor, MCP settings, knowledge settings, and combined chat capsule presentation by mechanically translating the reference React structure and style values into the existing Vue and TDesign stack.
- Restore WeKnora 0.7.2 native component behavior before visual translation; the reference archive controls presentation only and MUST NOT replace native state, persistence, selectors, or execution logic.
- Make every affected surface usable and legible in both light and dark modes.
- Let an authorized user reopen knowledge-base settings from the existing card overflow menu.
- Keep quick-answer and smart-reasoning as native WeKnora modes. MCP remains available only to smart-reasoning agents.
- Preserve existing WeKnora APIs, database models, execution paths, credential storage, tenant authorization, and provider integrations.

## Capabilities

### New Capabilities

- `consumer-knowledge-settings`: Consumer-visible configuration of the supported native knowledge-base fields and subsequent editing.
- `consumer-agent-management`: Consumer-visible native agent cards, lifecycle, reduced editor, and chat selection.
- `consumer-mcp-management`: Tenant-admin native MCP configuration plus smart-agent MCP selection.

### Modified Capabilities

None.

## Impact

- Frontend: knowledge-base editor, agent list/editor/card surfaces, chat composer agent selector, settings navigation, and MCP settings.
- Backend policy: Lite product gates for the existing agent and MCP route families and native chat MCP payloads.
- Tests: source-contract, unit, type-check, build, backend policy tests, and browser end-to-end acceptance.
- No new dependency, database migration, provider protocol, queue, execution module, agent selector state machine, or duplicate settings contract is expected.
