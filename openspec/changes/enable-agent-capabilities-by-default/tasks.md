## 1. Contract and regression tests

- [x] 1.1 Add focused failing tests for creation-only upload, web-retrieval, model, and regular-tool defaults
- [x] 1.2 Add regression assertions that existing agents, Lite hidden rules, Sandbox, Skills, MCP, and governed Memory behavior remain unchanged
- [x] 1.3 Add regressions for per-caller Wiki mutation authorization and persistent Agent terminal errors

## 2. Creation defaults

- [x] 2.1 Add the minimal creation-only capability policy and apply it after the existing agent-type preset
- [x] 2.2 Resolve Standard and Lite default VLM/ASR model IDs through their existing model authorities
- [x] 2.3 Keep explicit quick-answer and mode-switch semantics aligned with the new creation policy without changing legacy edit fallbacks

## 3. Acceptance state and preset inventory

- [x] 3.1 Update only the current local admin acceptance agent through the authenticated API while preserving all unrelated configuration
- [x] 3.2 Browser-verify upload, network, tools, model selection, and Sandbox/Skill exclusions from the Standard admin view
- [x] 3.3 Produce the decision-ready inventory of every presettable agent, knowledge-base, and bottom-left setting without changing undecided defaults

## 4. Verification and delivery

- [x] 4.1 Run focused and full frontend tests, i18n validation, type-check, and production build
- [x] 4.2 Run one bounded adversarial review, fix only confirmed blockers, and rerun affected verification
- [x] 4.3 Validate the OpenSpec change, inspect the final diff, and commit the completed change on the upgrade branch
- [x] 4.4 Reconcile the preset-inventory finding for the independent web-fetch gate with focused frontend and runtime regressions
