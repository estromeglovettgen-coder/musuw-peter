## Why

WeKnora already contains model management and chat model selection, but Musuw needs a consumer-safe form of that behavior: the platform owns a small OpenRouter catalog while users select only the models their plan allows. Consumers must never configure providers, credentials, or arbitrary model IDs.

## What Changes

- Restore the existing chat model dropdown while keeping the consumer runtime on the single full-capability built-in agent.
- Keep model/provider/debug/credential management out of the consumer UI and require SystemAdmin on the retained WeKnora APIs.
- Return only server-owned built-in OpenRouter models and filter that catalog by the active consumer plan.
- Route the existing DeepSeek choices through OpenRouter and retain a small verified platform catalog.
- Retain the existing production-proven embedding, rerank, vision, and speech presets.

## Capabilities

### New Capabilities

- `native-multi-model-selection`: native conversation selection over a platform-managed, plan-filtered model catalog.

### Modified Capabilities

None.

## Impact

The existing WeKnora model API, Lite exposure gate, conversation input, and built-in model YAML are affected. No new model service, provider adapter, or catalog abstraction is introduced.
