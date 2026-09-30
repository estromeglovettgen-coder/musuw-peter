## 1. Model readiness

- [x] 1.1 Inventory Peter's live model records and resource bindings; identify stale or unsupported references.
- [x] 1.2 Keep tested DeepSeek defaults for supported text/vision work and server-hosted embedding/rerank; configure an optional modality only after native debug succeeds.
- [x] 1.3 Verify new and existing knowledge bases and agents save, reopen, and call their selected models.
- [x] 1.4 Enable bounded Neo4j with APOC and prove real entity/relationship extraction plus restart recovery on an isolated Peter test knowledge base.

## 2. Peter settings and skills

- [x] 2.1 Hide Peter-only sandbox, font, storage/parser/vector infrastructure, chunking, advanced, image/audio, and graph controls without changing non-Peter surfaces or saved values.
- [x] 2.4 Default tested image/audio/graph processing on for new Peter document knowledge bases and customers; preserve existing resource values on edit and verify real ingestion.
- [x] 2.2 Make skill install and agent assignment use the existing default sandbox, with clear unavailable/error states and preserved native permission checks.
- [x] 2.3 Verify the real path: install/select a skill, attach it to an agent, run it, and use customer/knowledge evidence in a conversation.

## 3. Release and review

- [x] 3.1 Run focused behavior tests, frontend typecheck/build, and relevant server checks; perform one adversarial review of the integrated result.
- [x] 3.2 Deploy only to Peter's server, verify after release in the browser, update the delivery record and remaining limits, and keep a rollback image.
