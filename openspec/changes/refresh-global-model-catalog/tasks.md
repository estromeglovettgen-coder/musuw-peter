## 1. Audit

- [x] 1.1 Confirm the shared catalog, production baseline and retired endpoint with real inference.
- [x] 1.2 Probe candidate chat models and all exposed auxiliary interfaces.

## 2. Implementation

- [x] 2.1 Add failing catalog, scene, ASR and mandatory-vision acceptance tests; refresh verified entries and defaults and pass affected tests.
- [x] 2.2 Verify saved IDs, Free restrictions and downstream selector contracts; complete one consolidated review and provenance checks.
- [x] 2.3 Reproduce the custom-agent mandatory-reasoning failure on staging and cover the saved-model factory and actual outbound request.
- [x] 2.4 Apply the user's enabled-at-minimum defaults; cover model switching, preference migration, the first-message depth handoff and a reproduced historical model/depth mismatch.

## 3. Delivery

- [x] 3.1 Initial catalog PR #44 passed CI and reached staging at 947e6d5. Production promotion remains held by the user.
- [ ] 3.2 Pass correction tests and CI, deploy the immutable correction to staging, then verify all chat models at their minimum, new/legacy custom agents and the homepage depth picker.
- [ ] 3.3 Record the exact staging revision and fresh evidence, clean up only task-owned test data, and confirm production was not promoted.
