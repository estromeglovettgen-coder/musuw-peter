## Why

Lite consumers currently see three KnowledgeQA selectors, including a meaningless standalone Chat choice, while the real Rerank, VLLM, and ASR controls are absent. The settings surfaces also diverge structurally and fail dark-mode contrast because late light-only styles override the current theme tokens.

This change supersedes the product-visible scene scope and release handoff in the still-pending `consumer-scene-model-selection` change. That earlier implementation remains the compatibility foundation for the resolver and safe options API, but its three-row consumer UI and deferred native-type boundary are no longer the accepted product contract and MUST NOT be released independently.

## What Changes

- Expose exactly five consumer-configurable boundaries: the product-facing Agent Model for knowledge-backed final answers, Wiki synthesis, retrieval Rerank, visual understanding through VLLM, and speech recognition through ASR.
- Remove standalone Chat and Embedding controls from consumer settings. Lite uses the fixed platform agent rather than a user-selected plain-chat model, while Embedding remains bound to the knowledge base and vector index.
- Populate every selector exclusively from active builtin OpenRouter models of the required native WeKnora model type; do not copy placeholder model IDs or the unsupported TTS example from the UI reference.
- Keep RAG responsibilities explicit: Embedding performs vector query/index work, Rerank orders retrieved chunks, and KnowledgeQA generates the final answer.
- Apply new VLLM/ASR selections at knowledge-base setup boundaries and connect Rerank to the existing retrieval configuration; preserve all existing Embedding identities and vector behavior.
- Preserve backend resolver and model-plan enforcement as runtime authority, including locked Free options, paid allowlists, forged-ID rejection, and the existing `/models` response semantics.
- Mechanically translate the latest ZIP settings, selector, lock, UserMenu, and dark-mode presentation into the existing Vue surfaces while retaining current routes, entitlement data, billing portal behavior, authentication, and tenant contracts.
- Give General, Usage, Models, and User Profile the same header, row cadence, spacing, responsive layout, and theme behavior; remove stale Lite-only legacy model-management presentation and dropdown clipping.

## Capabilities

### New Capabilities

- `native-consumer-model-settings`: Fixed, type-safe consumer configuration and authorization for the five native WeKnora model boundaries consumers are allowed to choose.
- `consumer-settings-visual-consistency`: Source-faithful unified settings, selector, lock, UserMenu, and light/dark presentation with preserved Musuw behavior contracts.

### Modified Capabilities

None.

## Impact

- Backend consumer-scene types, system-setting registry, model resolver, safe options DTO/route, plan enforcement, and the existing KB/retrieval runtime seams. Existing internal Chat and Embedding behavior remains compatible but is not consumer-configurable.
- Frontend model API/store/settings, knowledge-base defaults, retrieval settings, shared selectors, UserMenu, theme tokens, and four consumer settings pages.
- Focused resolver/authorization/runtime tests, frontend source-contract and browser acceptance tests, OpenSpec validation, full Go/frontend builds, and local authenticated visual verification.
- No new model type, provider layer, policy table, user-preference table, dependency, TTS capability, payment behavior, or automatic model failover.
