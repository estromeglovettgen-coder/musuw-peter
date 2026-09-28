## Context

The editor currently creates a custom agent from a legacy-safe form object, applies an agent-type preset, and then selects default models. Upload and web-retrieval booleans are false or absent, while the default `rag-qa` preset replaces the tool allowlist with only RAG tools. Standard exposes those switches; Lite intentionally hides the advanced tabs but sends the same durable agent configuration through the existing API.

The built-in Quick Answer and Smart Reasoning agents already demonstrate the desired upload and web defaults. Smart Reasoning also supplies the exact regular/RAG/Wiki/data tool set requested by the user. Sandbox and Skill execution remain outside the Musuw Lite product and must not become transitively enabled.

## Goals / Non-Goals

**Goals:**

- Make agents created through the Musuw editor immediately capable of image/audio attachment handling and web retrieval.
- Make newly created smart-reasoning agents select every tool shown in Tool Configuration.
- Resolve VLM and ASR defaults through the existing model catalogs and consumer-scene policy.
- Preserve dependency, permission, quota, capability, and edition gates at runtime.
- Preserve every existing persisted agent configuration.
- Inventory all agent, knowledge-base, and bottom-left settings that the platform can preseed, force, or hide, without changing undecided values.

**Non-Goals:**

- Enabling Sandbox, shell, artifact, or Skill execution.
- Enabling MCP services or changing Memory policy.
- Rewriting existing customer agents or adding a database migration.
- Changing upload/parser UI design, provider management, or adding a new configuration architecture.
- Selecting product defaults for settings the user has not yet decided.

## Decisions

### Apply the policy only in the editor's create path

Keep the legacy-safe edit fallback values unchanged and apply a small creation policy after the existing agent-type preset. This makes the requested defaults observable on new agents without interpreting a missing historical boolean as a request to enable it.

Alternative considered: change the shared form fallback values. Rejected because editing an old agent that lacks a newer field would silently enable that field on save.

### Reuse the Tool Configuration catalog boundary

The default allowlist is the complete set of tool identifiers rendered by the existing Tool Configuration UI: reasoning, RAG, database, Wiki read/write/issue, and data tools. It also retains the built-in Smart Reasoning agent's regular `search_conversations` capability, which is runtime-governed rather than rendered as a checkbox. Sandbox/Skill identifiers are not present in that catalog and are additionally denied by the Lite execution filter. Memory search remains dynamically governed by Memory's three existing switches.

Alternative considered: use backend `DefaultAllowedTools`. Rejected because it intentionally omits Wiki write tools and therefore does not satisfy the explicit request to enable all Tool Configuration entries.

### Resolve attachment models through existing edition-specific sources

Standard chooses the configured default active ReRank, VLLM, and ASR models from the existing model catalog. Lite loads the existing `rerank`, `vision`, and `asr` consumer-scene options alongside `rag` and uses their effective model IDs. ReRank is required because the ready smart-tool allowlist includes knowledge search; without the existing scene fallback a Lite agent could save successfully and fail on its first request. No platform model ID is hard-coded into the editor.

### Keep runtime filtering authoritative

Selecting a tool expresses user intent; it does not bypass KB-capability checks, row/tenant authorization, provider readiness, model resolution, quotas, or edition gates. Tools whose dependencies are absent remain visibly inactive in Standard and are not registered at runtime.

Wiki mutation tools receive a request-local list of writable Wiki KB IDs. The
authenticated session tenant remains the caller identity even when shared-agent
execution overlays the context with the source tenant for model and retrieval
resolution. Own-tenant Agent mutation scope uses a conservative role/creator
policy: Admins may write tenant KBs and Contributors may write only KBs they created.
Cross-tenant viewer/unknown/error cases fail closed; reads retain their
authorized search scope.

### Keep terminal Agent errors in the message row

Terminal Agent errors carry one runtime-only `agent_error` marker. The main and
embedded message components use that marker to render the existing mapped
user-facing text as a compact accessible error card, while arbitrary completed
Agent content and genuinely empty shells remain hidden.

### Do not migrate existing agents

No schema or data migration is added. The local acceptance agent is updated once through the existing authenticated API so the user can inspect the new policy immediately; this is test data, not a production migration.

### Keep the preset inventory separate from runtime policy

The inventory records each configurable field's current source/default, edition and role visibility, platform enforcement seam, and material cost or risk. It is a product decision aid, not an additional configuration store, and therefore does not introduce schema, feature flags, or runtime abstractions.

## Risks / Trade-offs

- **Network, VLM, and ASR usage can increase cost when users exercise the enabled capability** → Existing quota, plan, model-policy, and provider gates remain authoritative; merely enabling upload does not invoke a model until a relevant attachment is used.
- **Wiki write/delete tools are destructive** → They remain constrained to Wiki-capable KBs and existing authorization, and Standard keeps the current danger presentation. Their default enablement is an explicit product requirement.
- **Agent chat is reachable by tenant Viewers** → Own-tenant mutation scope checks both tenant role and KB creator; source-tenant context and search-target tenant metadata are never treated as ownership.
- **Shared-agent execution uses the source tenant for retrieval** → Wiki mutation authorization uses the authenticated session tenant explicitly and passes only the exact writable KB subset to tool constructors.
- **Provider failures can arrive before an Agent timeline exists** → Both chat surfaces retain a persistent error card instead of relying on a short-lived toast.
- **A deployment may lack a usable VLM or ASR model** → Creation uses the existing resolver and fails with the current model-required feedback instead of saving a silently broken agent.
- **All selected tools can look noisy on a non-Wiki KB** → Existing capability evaluation marks unusable tools inactive and runtime registration omits them.

## Migration Plan

1. Ship the creation-policy and model-resolution changes without a database migration.
2. Existing agents retain their stored booleans and allowlists.
3. New agents receive the new defaults when created through the editor.
4. Update only the local acceptance agent through the normal API.
5. Rollback is a code revert; agents already created retain their explicit saved configuration and remain editable.

## Open Questions

None.
