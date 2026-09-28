## Context

Musuw already has a platform-owned built-in OpenRouter catalog, server-side plan checks, a consumer chat picker, browser-local choice memory, and request-scoped model binding for the two platform answer modes. The current `/models` response removes models that the caller's plan cannot use, so it cannot power a "visible but locked" UI. The current selection chain also treats the request as one generic chat model: pure chat and retrieval-assisted answers share the same candidate, while Wiki synthesis reads the knowledge base's existing `WikiConfig.SynthesisModelID` and summary fallback.

There is no existing consumer-scene policy object. The existing `system_settings` registry and SystemAdmin settings screen already provide audited, runtime-updatable platform settings without a new table. The model catalog, model repository, entitlement-derived effective plan, knowledge-base configuration, and provider adapters remain authoritative for their current responsibilities.

This change extends the completed native multi-model behavior. Historical OpenSpec changes remain historical evidence; this contract defines the newer scene-specific behavior when the new settings are valid.

## Goals / Non-Goals

**Goals:**

- Let a SystemAdmin configure model policy for exactly three scenes: `chat`, `rag`, and `wiki`.
- Let Free users see paid choices as locked while the server always resolves their runtime call to the configured Free default.
- Let paid users choose only the configured paid options and reuse the existing browser settings/model selector and knowledge-base Wiki configuration.
- Centralize scene resolution without changing provider invocation, credentials, billing, or model infrastructure.
- Preserve a safe compatibility path when the new settings are missing or invalid.

**Non-Goals:**

- Consumer selection for Embedding, Rerank, VLM, ASR, ingestion, taxonomy, FAQ generation, IM, evaluations, model debugging, or other internal jobs.
- Dynamic scenes, a policy table, server-side user-preference table, new provider/router layer, Redis cache, rules engine, approval/version workflow, or automatic model failover.
- Changing knowledge-base vector bindings or allowing arbitrary/BYOK model IDs.
- Making temporary provider failures silently switch models.

## Decisions

### 1. Reuse six typed system settings

Register two existing setting types per fixed scene:

- `consumer_models.<scene>.free_default`: one model ID (`string`).
- `consumer_models.<scene>.paid_options`: ordered model IDs (`string_list`); the first valid entry is the paid default.

This is the smallest complete representation of "what Free uses" and "what paid users may choose." The existing `system_settings` table, audit log, cache invalidation, SystemAdmin routes, and management page are reused; no schema migration or second source of truth is introduced. The existing page SHALL add a Models section that renders the Free value as a single select and paid values as an ordered multi-select using only the active, built-in, OpenRouter-backed `KnowledgeQA` catalog visible to SystemAdmin. It SHALL preserve list order, explain that the first paid item is the default, and SHALL NOT accept arbitrary typed model IDs. This is a bounded extension of the existing page, not a new policy page.

Only active, built-in, OpenRouter-backed `KnowledgeQA` IDs are semantically valid. The runtime resolver validates every loaded setting against the current catalog. A malformed or stale setting never widens access: the affected scene uses the compatibility behavior and records a diagnostic. This fail-closed read validation also protects direct SystemAdmin API edits without adding a second privileged mutation endpoint.

### 2. Add one thin scene resolver, not a routing system

Introduce one application-level resolver with the conceptual boundary:

```text
ResolveConsumerModel(ctx, scene, requestedModelID) -> effective model
ListConsumerModelOptions(ctx, scene) -> safe consumer options
```

It reads the six settings, the existing platform catalog, and the existing effective consumer plan. It does not call providers, retry requests, select by latency/cost, or own credentials. Keeping the resolver above concrete `GetChatModel` calls lets the three consumers share policy while leaving provider adapters and the many non-consumer model call sites unchanged.

Resolution is straight-line:

1. Validate the fixed scene and load a valid scene policy.
2. Free: allow the configured Free ID; an explicit different ID is rejected as plan-required.
3. Paid: allow an explicit ID only when it is in `paid_options`; otherwise use the first valid paid option.
4. Revalidate the final row as active, built-in, OpenRouter-backed, and `KnowledgeQA` before returning it.
5. If the scene policy itself is incomplete or invalid, ignore its values and any explicit candidate, then use only the existing deterministic server default for that plan/call boundary. An invalid policy never re-enables arbitrary paid-catalog selection.

The existing generic model gate remains in place and SHALL recognize the union of valid configured Free scene defaults as Free-approved chat rows so downstream chat construction can load a resolver-approved model. Scene-specific allow-list enforcement SHALL remain at the resolver boundary, where a direct request for another scene's Free default is still rejected.

### 3. Classify scenes only at existing call boundaries

- `chat`: an interactive platform answer with no effective knowledge or web retrieval scope.
- `rag`: an interactive platform answer whose existing request routing has knowledge, tag, or web retrieval scope.
- `wiki`: the existing asynchronous Wiki synthesis model candidate.

Chat/RAG classification reuses the effective search scope already produced by the session setup; the setup may move model resolution after search-target construction, but it does not infer scenes from prompts or change the pipeline decision. The effective resolved ID SHALL be carried through the existing request-scoped field used by platform-mode title generation, so an omitted browser candidate cannot make the title path fall back to a different model. The same resolved model continues to feed answer generation, query understanding, data analysis, and entity extraction exactly as it does today.

Both existing Wiki synthesis entry points—ingest processing and finalize processing—SHALL call one shared Wiki scene resolver helper. Wiki continues to persist its accepted candidate in the existing knowledge-base `WikiConfig.SynthesisModelID`; an invalid scene policy ignores that candidate and uses only the deterministic legacy default. Embedding and Wiki taxonomy bindings remain untouched.

Custom agents retain their own configured models. This V1 applies only to the platform-owned consumer answer modes and Wiki synthesis; it does not silently override Standard WeKnora agent configuration.

### 4. Add a narrow safe options response

Do not weaken `/models`, whose filtered response is already an authorization boundary used by existing consumers. Add one read-only consumer scene-options response adjacent to the model routes. It returns only safe display/capability metadata plus:

```text
model_id, display_name, selectable, locked,
required_plan, is_scene_default, is_effective
```

It never returns provider endpoints, credentials, raw provider configuration, or arbitrary catalog rows. Free responses include the scene's paid options as `locked=true` and `selectable=false`; paid responses mark configured options selectable. The resolver, not these UI flags, remains runtime authority.

### 5. Reuse current UI and preference carriers

Extend the existing `ModelSelector` rather than building a second selector. The composer and the consumer settings surface read the same scene-options response. Clicking a locked option does not change local selection and opens the existing plans route.

Browser-local settings may remember one candidate per scene, as they do for the current chat choice, but are UX only. Every request is revalidated by the resolver. Wiki uses its existing knowledge-base configuration as the durable accepted candidate; no user-preference table is added.

When an operator removes a remembered paid model, the next options response supplies the current scene default and the browser replaces its stale local value before sending. A forged or stale direct request is rejected rather than silently invoking an unconfigured model.

## Risks / Trade-offs

- **System settings can temporarily form an invalid pair during edits** → validate the complete scene at read time, ignore explicit candidates, and use only the deterministic legacy default; never partially grant a model.
- **A Free default differs by scene while the generic gate historically knew one cheapest chat ID** → treat the union of valid configured Free scene defaults as Free-approved for downstream loading, while enforcing the exact scene at the resolver boundary.
- **A hidden model call is accidentally treated as consumer-selectable** → keep the explicit V1 call-site allow-list and add an inventory test/documented checklist; all unlisted calls retain their current model source.
- **The browser shows stale policy after an operator edit** → use the existing settings invalidation on the server and refresh scene options before accepting/sending a changed selection.
- **The configured model is deleted or disabled** → use compatibility behavior and surface an operator diagnostic; do not switch because of a transient inference error.
- **Per-browser preferences do not roam across devices** → accepted for V1 to avoid a new preference table; runtime correctness does not depend on them.

## Migration Plan

1. Add the six virtual registry entries with defaults that preserve the currently intended catalog behavior; no database migration is required.
2. Add resolver/options behavior and focused authorization tests before moving call sites.
3. Move only platform chat/RAG and Wiki synthesis to the resolver; keep all other model bindings unchanged.
4. Update the existing SystemAdmin settings UI and shared consumer selector.
5. Release with compatibility fallback enabled. Rollback removes the new call-site usage and UI while existing settings rows remain inert and harmless.

## Open Questions

None. Cross-device preference sync, more scenes, and consumer-selectable Embedding/Rerank remain explicitly deferred until a concrete product need exists.
