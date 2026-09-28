## Why

Musuw already exposes a plan-filtered chat model catalog, but model choice and defaults are not consistently resolved across consumer chat, RAG answers, and Wiki generation. We need one small server-authoritative policy over existing WeKnora model and entitlement capabilities so operators can configure those real scenes and consumers see paid choices as locked instead of having each call site invent its own rules.

## What Changes

- Add three fixed consumer model scenes: `chat`, `rag`, and `wiki`.
- Reuse the existing `system_settings` registry and management surface for each scene's Free default and ordered paid selectable model IDs; the first paid ID is the paid default. Do not add a policy table.
- Add one application-service resolver that reads the scene settings, current plan, requested or remembered choice, and existing model catalog before returning the effective model.
- Add a consumer scene-options response that keeps paid models visible to Free users with server-computed `locked` and `selectable` state.
- Reuse the existing model selector and existing upgrade route for both the composer and consumer settings UI.
- Keep all runtime authorization on the server and retain the current model/type defaults only as a compatibility fallback when scene configuration is absent or invalid.
- Explicitly defer consumer selection for Embedding, Rerank, vision, and speech; dynamic scenes; new model/provider infrastructure; Redis caching; rules engines; and automatic provider-failure switching.

## Capabilities

### New Capabilities

- `consumer-scene-model-selection`: Operator-configured, plan-aware model defaults and consumer choices for the fixed chat, RAG, and Wiki scenes.

### Modified Capabilities

None.

## Impact

The existing system settings registry and management UI, model application services, consumer model API/DTO boundary, chat/RAG/Wiki model call sites, and shared frontend model selector are affected. Existing WeKnora model rows, provider adapters, knowledge-base Embedding/Rerank bindings, plan source, OpenRouter credentials, and production infrastructure are unchanged.
