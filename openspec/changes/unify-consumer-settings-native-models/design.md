## Context

The existing consumer resolver is a deep, server-authoritative module, but its closed scene enum and catalog are limited to `chat`, `rag`, and `wiki`, all mapped to `KnowledgeQA`. WeKnora exposes five native model interfaces: `KnowledgeQA`, `Embedding`, `Rerank`, `VLLM`, and `ASR`. RAG uses Embedding internally for vector work, optional Rerank for result ordering, and KnowledgeQA for answer generation. Lite consumers use the fixed platform agent and must not choose a separate plain-Chat model; Embedding must remain bound to the KB/vector index rather than act as a casual user preference.

The latest UI reference supplies presentation and interaction behavior only. Its hard-coded model pools, TTS entry, user data, and local-storage business logic are placeholders and are not product contracts. Musuw must continue to source IDs from its own catalog and preserve the existing entitlement, billing, tenant, knowledge-base, and session interfaces.

## Goals / Non-Goals

**Goals:**

- Expose five fixed consumer-configurable boundaries backed by KnowledgeQA, Rerank, VLLM, and ASR.
- Keep model authorization in the existing resolver/model modules and keep `/models` semantics unchanged.
- Make every displayed option originate from a real active builtin OpenRouter catalog row of the required type.
- Connect selections to the existing session, retrieval, Wiki, and knowledge-base configuration seams.
- Apply one source-faithful structure and complete light/dark token set to all four consumer settings pages, shared selects, locked states, and UserMenu.

**Non-Goals:**

- TTS, consumer Embedding selection, standalone Chat selection, video-generation model types, new providers, user-supplied credentials, custom agents, IM, evaluation, taxonomy, FAQ, automatic failover, dynamic scenes, or a new preference/policy table.
- Copying reference ZIP model IDs, plan fixtures, account data, or local-storage business rules.

## Decisions

### 1. Deepen the existing closed resolver instead of adding another model policy module

Extend `ConsumerScene` with `rerank`, `vision`, and `asr`, retaining the existing internal compatibility scenes. The consumer settings surface uses only the following five configurable boundaries:

| Consumer boundary | Native type | Runtime responsibility |
|---|---|---|
| `rag` (product label: Agent Model / 智能体模型) | KnowledgeQA | final answer generation after knowledge-base, Wiki, or web retrieval |
| `wiki` | KnowledgeQA | Wiki synthesis |
| `rerank` | Rerank | ordering retrieved chunks |
| `vision` | VLLM | KB/image/video understanding |
| `asr` | ASR | audio transcription |

The resolver's existing interface remains sufficient: resolve one fixed boundary, list safe options, and answer the Free generic-gate predicate. Its implementation queries the repository using the mapped native type and validates active+builtin+OpenRouter status. The old `chat` path remains an internal compatibility fallback but is omitted from consumer settings; Embedding never enters the consumer resolver.

Alternative rejected: one resolver per model type. It would duplicate entitlement, invalid-policy, safe-DTO, and settings behavior without a second implementation or distinct lifecycle.

### 2. Reuse ordered system settings and deterministic platform defaults

Each configurable boundary uses the existing `free_default` string and ordered `paid_options` string list. Three new boundaries add six registry keys; no table, cache, or schema migration is required. Compatibility defaults are the existing platform IDs for the mapped type, never the first arbitrary repository row. Invalid or partial policy ignores both policy values and explicit candidates.

Paid options remain ordered and the first item is the paid default. The SystemAdmin Models section draws choices from the same active builtin OpenRouter catalog and does not accept free-form IDs.

### 3. Connect at existing durable configuration seams

- The product-facing Agent Model continues to send its browser candidate through `summary_model_id`; the backend retains the internal `rag` key because it classifies the effective retrieval scope before resolving. Lite platform answer paths always resolve that same Agent (`rag`) KnowledgeQA policy, even when the effective retrieval scope is empty; the scope classifier still controls retrieval behavior, and no request is switched to a separate Chat policy.
- Wiki continues to store its candidate in `WikiConfig.SynthesisModelID` and resolves at both synthesis entry points.
- Rerank uses the existing tenant `RetrievalConfig.RerankModelID`; selection updates that existing configuration and the runtime resolver validates it before the platform RAG rerank stage. Lite platform builtin AgentQA with `knowledge_search` enabled uses the current consumer tenant candidate through `ConsumerSceneRerank` before engine creation, while custom agents, IM, and Standard retain agent configuration authority.
- New knowledge-base creation may carry the chosen Agent Model (`rag` scene), Wiki, VLLM, and ASR IDs. The knowledge-base module resolves them before persistence and then all ingestion/search calls continue reading the persisted KB fields.
- Embedding remains entirely platform/KB-owned. Existing and new KB vector identity follows the current platform default and existing KB editor invariants; it is not exposed on this consumer settings surface.

Custom agents, shared KB ownership, IM, evaluation, and internal/background calls retain their existing model authority.

### 4. Extend the narrow options DTO without exposing model configuration

The existing scene-options route remains the only consumer lock/catalog endpoint. The DTO may include the fixed scene/native type needed for rendering, but never provider parameters, base URLs, credentials, or arbitrary model metadata. `/models` stays plan-filtered and unchanged.

### 5. Translate ZIP4 presentation while keeping Musuw behavior

Vue templates and CSS reproduce the source structure and exact values for modal geometry, navigation, page headers, row cadence, CustomSelect, lock/check icons, UserMenu, capsule/flyout motion, and responsive breakpoints. ZIP4 dark zinc values are translated through Musuw's existing `theme-mode` tokens so Teleports and TDesign controls receive the same effective colors.

All four pages use one shared structural contract: title strip (`pb:12`, `mb:8`, bottom border), rows (`py:14`, `gap:16`, bottom border), responsive column-to-row layout, and the same label/control typography. Light-only late overrides are removed or narrowed. Dropdown ancestors must allow the popup to escape row bounds.

## Risks / Trade-offs

- **[Embedding selection could invalidate existing vectors]** → Do not expose it as a consumer setting; preserve the current platform/KB binding and immutable-after-files behavior.
- **[A forged stored Rerank/KB model could otherwise fail late]** → Validate at the write seam and again at the runtime resolver seam.
- **[Some native types currently have only one builtin OpenRouter row]** → Show only real catalog rows; do not fabricate choice. Operators can expand the catalog through the existing builtin model configuration workflow.
- **[Global dark overrides can regress unrelated pages]** → Scope settings fixes to the current visual classes and add browser/computed-style regression assertions for both themes.
- **[Existing dirty worktree contains other requested changes]** → Edit only overlapping current files and preserve quota/model work. The user's final release instruction supersedes the earlier local-only handoff: integrate the authorized homepage branch and latest `main`, commit once coherent, then rely on the existing CI and production deployment workflows.

## Migration Plan

1. Register the three new fixed boundaries and defaults without changing existing compatibility keys.
2. Deploy resolver/options changes before frontend consumers; old clients continue using the existing scenes.
3. Enable the five-row frontend and existing configuration write seams.
4. Existing KB rows remain unchanged; new defaults apply only when a valid model is explicitly selected or a new KB is created.
5. Rollback removes the new frontend rows and runtime calls while leaving harmless system-setting rows; no data downgrade is needed.

## Open Questions

None. The repository establishes the native type set and persistence constraints; the latest user request establishes the five consumer-configurable boundaries and ZIP4 as presentation authority.
