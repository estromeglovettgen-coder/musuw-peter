## Context

The new repository initially contained only a README. Its baseline is an attributed source import of Musuw main. The native application already has a Standard editor with comprehensive configuration, model CRUD, service managers and runtime consumers. Public-product restrictions must not control this private workspace.

## Goals / Non-Goals

**Goals:** local acceptance; isolated persistent development data; all applicable native agent editor panels; browser model credentials and model selection; tenant-scoped built-in customization; saved settings consumed by conversations.

**Non-Goals:** server deployment, customer messaging, CRM, case-review workflows, dual-agent comparison, provider subscriptions or replacement inference/retrieval engines.

## Decisions

1. Use `MUSUW_PRODUCT_EDITION=standard` and native authentication. Avoid a third edition or a second configuration API. Keep Lite behavior explicitly covered by regression tests.
2. Use the native SQLite database (FTS5 + sqlite-vec) and local storage owned by this checkout. The native application can use its in-process queue/stream manager when Redis is absent. The host PostgreSQL lacks ParadeDB pg_search and Docker is unavailable, so native SQLite is the smallest complete local option; this storage choice does not switch the product to Lite. Alibaba Cloud database selection remains part of the later server phase. Startup must bind loopback, preserve generated secrets and data, reject occupied ports, and never import Musuw runtime credentials.
3. Keep `CustomAgentConfig` and existing model/service tables authoritative. Reuse existing Vue controls. Fix only missing reachability, serialization or runtime behavior found during acceptance. Configuration IDs used solely to resolve server-side template defaults are not a second user-facing editing mechanism.
4. Scope immutable platform answer modes and consumer model defaults to Lite. Standard administrators can persist native built-in overrides; missing private model configuration stays visibly unconfigured instead of silently selecting a public platform model.
5. Test both service behavior and browser-to-backend flows. A loopback OpenAI-compatible test fixture verifies outbound prompts, selected model and generation settings without consuming paid model quota. Fixture calls are explicitly distinguished from live provider validation.

## Risks / Trade-offs

- Optional skills, sandbox, web search and multimodal execution require configured providers → keep agent selection controls and clearly report unavailable runtime dependencies; do not open unrelated global administration pages; never claim they ran without services.
- Inherited defaults reference Musuw model IDs → use an empty local built-in model catalog and require browser configuration; verify model selection and missing-model feedback.
- Inherited deployment automation → disable original product workflows in this repository and retain source attribution. No release or deployment operation is part of acceptance.
- Browser field visibility varies by mode, selected knowledge sources and permissions → verify both modes and meaningful configurations rather than forcing irrelevant controls into every mode.

## Migration Plan

No existing Peter data migration is required. Native schema migrations initialize only the new local database. Reverting the feature commit restores the imported baseline; local database/files remain outside Git. Stop the local processes before switching incompatible code. Future Alibaba Cloud deployment is a separate phase.

## Open Questions

No product clarification blocks this increment. Peter supplies live model credentials through the browser; paid-provider behavior is not fabricated by local fixture acceptance.
