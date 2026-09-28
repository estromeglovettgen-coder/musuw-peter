## Why

New Musuw agents currently expose capable upload, web-retrieval, and tool runtimes but start with most of them disabled, forcing operators to understand implementation-level switches before the agent delivers its intended value. Musuw should seed a ready-to-use configuration while retaining dependency checks and the existing product decision that Sandbox and Skills remain disabled.

## What Changes

- Enable image and audio attachment handling by default when the Musuw editor creates a custom agent.
- Enable web search and web-page fetching by default when the Musuw editor creates a custom agent, using the tenant's existing default provider resolution.
- Seed smart-reasoning agents created through the editor with every regular, RAG, data, and Wiki tool exposed in the existing Tool Configuration UI, including Wiki write tools.
- Enforce Wiki mutation permissions per request and per KB using the authenticated session tenant, including shared-agent source-tenant execution.
- Keep terminal Agent failures visible in both main and embedded chat instead of leaving an empty reply row.
- Continue to exclude Sandbox filesystem/command tools, Skill tools, and dynamically governed Memory search from the default tool allowlist.
- Preserve all existing persisted agent choices; do not bulk-rewrite customer agents. Synchronize only the explicitly created local acceptance agent so the requested behavior can be inspected immediately.
- Keep runtime capability, knowledge-scope, permission, provider, and model checks authoritative when a default-enabled capability is not usable in a particular request.
- Produce a decision-ready inventory of every configuration Musuw can preseed, force, or hide across agents, knowledge bases, and the bottom-left settings area; do not change undecided settings while compiling the inventory.

## Capabilities

### New Capabilities

- `agent-default-capabilities`: Defines ready-to-use defaults for uploads, web retrieval, and smart-agent tools while preserving Sandbox/Skills exclusions and existing saved configuration.

### Modified Capabilities

None.

## Impact

- Affects custom-agent creation defaults and agent-type preset seeding in the existing frontend and backend-owned tool catalog.
- Requires regression coverage for both Standard and Lite creation flows, dependency filtering, and preservation of persisted agents.
- Adds a user-facing configuration inventory outside the runtime codebase so product defaults can be decided explicitly in a follow-up pass.
- Does not add APIs, dependencies, migrations, infrastructure, or a parallel configuration path.
