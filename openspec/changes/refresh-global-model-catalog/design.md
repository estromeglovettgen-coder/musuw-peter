## Context

The three consumer selectors use the database reconciled from builtin_models.yaml. Scene options also use the existing system-setting policy defaults. MiniMax M3 free inference returned HTTP 404. A real production Nemotron Lightning conversation failed with upstream 429 overload; GLM 5.2 worked and is upgraded to the current family endpoint.

## Goals / Non-Goals

**Goals:** working international and Chinese model choices, synchronized selectors, preserved saved selections, lowest enabled reasoning defaults and staging evidence. Production deployment is held by the user.

**Non-Goals:** video ingestion redesign, new providers, changing memberships, automatic background catalog updates.

## Decisions

Keep the existing YAML registry and native reconciliation. Verify actual inference before admission. Preserve existing stable IDs for compatible model-family upgrades, including legacy IDs with a free suffix, while removing misleading display labels and provider slugs. Use new IDs for new families; add them to existing scene policy defaults. Test the actual native interfaces for vision, rerank, ASR and embeddings rather than assuming the chat model listing describes them.

Remove the account-gated Muse vision option and the unavailable MiniMax free vision option. MiniMax's paid endpoint passed conversation/tool tests but repeatedly failed a simple image observation, so it is not admitted as a vision scene option. Existing production knowledge bases, agents and system settings have no references to the removed vision IDs.

Preserve mandatory reasoning capability when constructing the native vision client. Optional models retain the existing disabled-reasoning extraction behavior; mandatory models omit the unsupported override and use the provider default. Configure GPT-4o mini transcription to request JSON; retain verbose JSON and timestamps for existing Whisper clients. Both incompatibilities were reproduced with failing regression tests before the fixes.

Custom agents default thinking to true while preserving explicit saved values. Native OpenRouter chat configuration carries the catalog default and mandatory capability into the final request: omitted or enabled reasoning uses the configured minimum, optional explicit Off remains Off, and mandatory legacy Off uses the configured minimum. Each chat catalog entry uses its lowest supported positive effort.

The frontend stores a reasoningModelId next to its existing effort. Different-model selection resolves to that model's minimum; a valid explicit same-model depth survives refresh. Unloaded metadata does not rewrite preferences. First-message depth is passed through the existing menu store so homepage navigation cannot replace it with a global fallback. Session state binds its restored depth to the restored model. The composer prioritizes that restored model over browser scene defaults, and model updates during the existing conversation snapshot do not persist temporary state, including delayed metadata repair. An explicit change in the scene settings modal still updates the saved browser defaults without persisting the historical model or depth. Placeholder scene rows wait for real capability metadata before selecting a depth. Tests execute the real storage module rather than a copied implementation.

## Risks / Trade-offs

- Provider listings can outlive endpoints → perform real bounded inference and retain dated evidence.
- A new catalog entry can be omitted by scene policy → compare all three user-facing lists and policy defaults.
- Existing user selection can reference a retired slug → preserve compatible stable IDs.
- Production deployment is held by the user → use the existing staging-only path, retain the production revision, and do not attest the full Sandbox promotion gate.

## Migration Plan

Run catalog reconciliation via the normal release. Preserve user overrides. Return to prior immutable image pair for rollback. Test a saved MiniMax selection, default conversation and new models after release.

## Verification

The initial candidate catalog passed 40 native-client probes against a short-lived, capped child key in the production OpenRouter workspace: 25 conversations with a tool-result round trip and streaming answer, 7 image observations, 4 transcriptions, 3 rerank requests and one 4096-dimensional embedding. The existing two dedicated video routes are unchanged and excluded from the selectable vision scene list. The child key was deleted after testing. Release, browser and staging reconciliation evidence is recorded separately as delivery proceeds. The production deployment is held by the user.

Staging acceptance at 9421720 then exercised each conversation model at its lowest enabled reasoning depth. Qwen 3.8 Flash returned one successful answer but timed out in two of three independent low-depth calls; the server also logged an upstream stream deadline. It is therefore removed from the shipped catalog and paid policy before acceptance. Qwen 3.7 Flash and Qwen 3.8 Max remain available. The final exposed catalog contains 39 interfaces (24 chat plus 15 auxiliary), and 41 managed rows including the two dedicated video routes. Existing YAML reconciliation soft-deletes the removed row on startup; no new migration is needed.
