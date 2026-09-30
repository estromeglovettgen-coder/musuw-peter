## Context

Peter's server has working DeepSeek text/vision, server-hosted BGE embedding and MMARCO rerank, and an isolated skill sandbox. Wiki links form the graph visible to customers. Neo4j entity extraction and ASR were not part of the earlier verified delivery, yet the user now requires both to be enabled and verified while their low-level configuration remains out of the daily form.

## Goals / Non-Goals

**Goals:** Make common Peter actions short and honest: working image/audio/graph defaults for new customer and knowledge resources, appropriate model defaults, one skill path backed by the existing sandbox, and focused settings that preserve existing data.

**Non-Goals:** A new model abstraction, replacement knowledge pipeline, or a separate skill runtime. Optional modalities are accepted only after real native debug calls.

## Decisions

- Extend Peter-specific visibility policy at existing frontend seams. Leave ordinary Musuw behavior and backend authorization intact. Hidden knowledge settings retain their existing saved values on edit.
- Resolve the existing default sandbox behind Peter's skill forms. Keep the native skill upload, agent assignment, and runtime interfaces.
- Reuse native model records and tenant defaults. Keep the two server-hosted retrieval containers because the current DeepSeek endpoint does not supply their model interfaces. Use OpenRouter only for a category that the native client can call and that passes a real test.
- Deploy the repository's native Neo4j graph adapter in a bounded, private container with APOC, a persistent volume, and a reversible release. Hide extraction controls in Peter's form, but default graph extraction on for newly created document knowledge bases and customers once the service is ready. Existing saved values are preserved.
- Select a tested vision and ASR model for new Peter document knowledge bases and customers. Hide image/audio setup after those defaults are saved. An unavailable provider must fail honestly rather than silently save a broken model reference.

## Risks / Trade-offs

- [Hiding fields can reset configuration on save] → Preserve original form values and test a save/reopen path.
- [A default model can point to a stale ID] → Check active live model records and run native debug plus resource creation/reopen tests.
- [Skill UI can hide an unavailable sandbox] → Check default sandbox readiness and surface explicit failure; keep backend isolation and permission checks.
- [4 GB host and 7 GB free disk have limited headroom] → Bound Neo4j heap, page cache, process count, and memory; retain a rollback path; monitor memory/disk and stop if health or capacity degrades.

## Migration Plan

Release frontend, bounded Neo4j service, and idempotent model configuration to the Peter server, retain prior frontend and compose state for rollback, then verify real image/audio ingestion, entity extraction, model requests, skill execution, and customer-bound retrieval in the browser. Existing data is preserved.
