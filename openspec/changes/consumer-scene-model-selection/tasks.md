## 1. Scene Policy Settings

- [x] 1.1 Add focused tests for the six fixed `consumer_models.<scene>.*` registry entries, ordered paid defaults, runtime updates, and invalid-value fallback.
- [x] 1.2 Register the `chat`, `rag`, and `wiki` Free-default and paid-options settings using the existing `system_settings` authority with defaults that preserve current behavior.
- [x] 1.3 Add a Models section to the existing SystemAdmin settings page, source only active built-in OpenRouter `KnowledgeQA` rows, render Free as a single select and paid options as an ordered multi-select whose first item is labeled as default, and prevent arbitrary ID input while reusing the current settings API/audit path.

## 2. Resolver and Consumer Options

- [x] 2.1 Add the fixed scene type, minimal safe option DTO, and failing resolver tests for Free, paid, forged IDs, invalid policy, and compatibility fallback.
- [x] 2.2 Implement one thin application-level scene resolver over the existing settings, model catalog, and effective-plan source without changing provider adapters or adding storage/cache infrastructure.
- [x] 2.3 Make the generic model gate load the union of valid configured Free scene defaults while the resolver enforces the exact scene; add cross-scene and direct-bypass authorization tests.
- [x] 2.4 Add one read-only scene-options handler/route that exposes lock/selectability/default state without provider configuration or credentials; do not change `/models` response semantics.

## 3. Runtime Call-Site Integration

- [x] 3.1 Record a code-level call-site checklist that classifies platform chat, retrieval-assisted answers, Wiki synthesis, custom agents, and hidden/internal model calls before moving any path.
- [x] 3.2 Resolve `chat` versus `rag` at the existing interactive session boundary after effective search scope is known, and propagate the effective ID through the existing query-understanding/title path.
- [x] 3.3 Route both Wiki ingest processing and Wiki finalize processing through one shared `wiki` resolver helper while reusing `WikiConfig.SynthesisModelID` and the fail-closed compatibility default.
- [x] 3.4 Prove with focused tests that custom-agent models and Embedding/Rerank/VLM/ASR/ingestion/taxonomy/FAQ/IM/evaluation/admin paths retain their existing authority.

## 4. Consumer UI

- [x] 4.1 Add frontend API types/client for scene options and extend the existing browser settings store with one non-authoritative candidate per fixed scene.
- [x] 4.2 Extend the shared `ModelSelector` to render locked options accessibly, keep selection unchanged on locked clicks, and open the existing plans route.
- [x] 4.3 Wire the composer to the current `chat` or `rag` options and reuse the same selector in consumer settings; replace stale remembered choices with the server default.
- [x] 4.4 Feed the accepted Wiki candidate through the existing Wiki configuration/action path without adding a user-preference table.

## 5. Verification and Release

- [x] 5.1 Run focused Go tests for settings, resolver, model authorization, session routing, and Wiki synthesis, including race checks for touched concurrent code.
- [x] 5.2 Run focused frontend tests, the complete frontend test suite, type-check, and production frontend build.
- [x] 5.3 Run `go test ./...`, native server build, repository validators, `git diff --check`, and strict OpenSpec validation; classify unrelated failures honestly.
- [x] 5.4 Perform one bounded adversarial review against the acceptance scenarios and fix only current blockers introduced or exposed by this change.
- [ ] 5.5 Commit and push the coherent change, observe CI and authorized downstream release to terminal state, then verify Free locked display, paid selection, server rejection of forged IDs, and unaffected knowledge ingestion in the deployed product.
