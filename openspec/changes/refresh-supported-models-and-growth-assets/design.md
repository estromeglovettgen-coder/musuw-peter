## Context

The existing Go/Vue application owns the YAML-managed catalog and maintains stable model IDs in persisted knowledge bases, sessions and agents. Production has 41 managed entries and 8 manual entries. All 38 knowledge bases use the same Qwen3 embedding model and dimension. The storefront has a final bilingual copy override that incorrectly adds webpage import to Free.

## Goals / Non-Goals

**Goals:** Refresh supported model endpoints and accurate labels while keeping existing bindings, plan authorization, native request capabilities and saved reasoning selections valid. Correct acquisition claims and publish factual free marketing material with a verifiable action ledger.

**Non-Goals:** No new provider, model architecture, billing plan, vector migration, manual customer-model rewrite, paid acquisition, giveaways, automated spam, or new tracking service.

## Decisions

1. Keep the existing YAML and model-metadata utilities authoritative. Update six entries with confirmed successors: DeepSeek Flash, Qwen Flash chat/vision, GPT Nano, Gemini VLM, and Gemini YouTube. A version string alone is insufficient; capability-specific interface acceptance determines admission. Creating a second model registry would duplicate existing ownership.
2. Preserve stable built-in IDs and existing vector space. Do not replace Pro with Flash merely because Flash is newer. Keep preview labels truthful. Unsupported saved reasoning efforts fall back through existing model-specific logic, not blanket new defaults.
3. Use the existing storefront copy layer and tests. Describe Free as documents and notes, and paid imports as webpages and supported video links. No entitlement or checkout changes are needed.
4. Reuse real public demonstration screenshots; visibly label feature showcases. Distinguish submissions pending moderation, actual public pages, and prepared assets. Platform restrictions determine where automated publishing is possible; lack of publication must remain explicit.
5. Follow the exact-SHA GitHub release flow. Website delivery and app production delivery are separate outcomes. Keep the existing Sandbox acceptance and protected production approval requirements.

## Risks / Trade-offs

- New model prices or context/effort semantics differ → record provider metadata, exercise actual native request formats, preserve quotas, and verify UI matches runtime.
- Replacing embedding invalidates old vectors → retain the current embedding model and dimension; a future migration is separate work.
- Existing manual entries may refer to older provider versions → inventory their references and report them; do not silently change a user's custom configuration.
- Localized prices vary → use verified USD figures only where a directory explicitly asks for USD, and disclose localization; avoid hardcoded universal prices in creative material.
- Review queues and account limitations reduce immediate reach → diversify eligible free channels and report status honestly without bypassing restrictions.

## Migration Plan

No schema migration. Run targeted behavior tests, typechecks/builds and one consolidated review. Merge via GitHub, verify storefront deployment, build immutable app images, complete real Sandbox acceptance, then promote the same SHA/digests through the existing production workflow. Verify model labels and real DeepSeek behavior after deployment. Roll back with the previously recorded immutable revision if acceptance fails.

## Open Questions

Provider-native inference and video-link compatibility remain to be exercised; unverified entries must retain their working predecessor rather than be marked complete. External publication outcomes depend on each platform's current account and moderation state.
