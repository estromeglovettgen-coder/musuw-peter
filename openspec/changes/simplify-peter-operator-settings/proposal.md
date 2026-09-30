## Why

Peter needs to configure agents, customers, and knowledge without navigating infrastructure settings. The current UI exposes sandbox, font, storage, parsing, image, audio, and graph controls even though these should be ready by default in his daily workflow.

## What Changes

- Keep the working server-hosted embedding and rerank models; use the tested DeepSeek models as defaults wherever their capabilities apply.
- Configure image and audio processing with tested providers and enable both by default for newly created Peter knowledge bases and customers.
- Simplify skill installation and agent selection around the existing default sandbox, while retaining backend authorization and sandbox isolation.
- Enable the independent Neo4j entity graph on Peter's bounded server and default graph extraction on for new knowledge bases and customers.
- Hide Peter-only operational controls that do not affect everyday customer, knowledge, and agent work, including sandbox administration, font controls, storage/parser/vector internals, image/audio setup, graph extraction setup, chunking, and advanced settings. Keep Wiki and graph navigation.
- Verify the deployed flow with saved settings, real image/audio and graph ingestion, model requests, a skill run, and customer/knowledge retrieval.

## Capabilities

### New Capabilities

- `peter-operator-workflow`: Focused Peter-facing settings and skill configuration without exposing low-level infrastructure controls.
- `peter-model-readiness`: Default selection and truthful readiness of deployed model modalities across knowledge and agent workflows.

### Modified Capabilities

None in the shared upstream baseline; this change refines the Peter deployment contract.

## Impact

Peter-specific frontend policy and settings, native agent/skill forms, model bootstrap and tenant configuration, deployment acceptance, and the Peter server only. The original Musuw deployment and authorization rules remain intact.
