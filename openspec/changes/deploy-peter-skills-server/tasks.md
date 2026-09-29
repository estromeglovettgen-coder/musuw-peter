## 1. Scope and native capability exposure

- [x] 1.1 Audit the designated host and local model/runtime state; record the subsequent authorization to delete old host business data without backup.
- [x] 1.2 Expose skills, sandbox and personal skill credentials through the Peter policy, with targeted red/green regression tests and native permission checks intact.

## 2. Server preparation and release

- [x] 2.1 Remove the identified obsolete host business services and data, retaining OS/SSH and documenting the resulting resource inventory.
- [x] 2.2 Build a reproducible Peter release and install persistent database, Redis, parsing/retrieval and bounded sandbox dependencies.
- [x] 2.3 Configure the public TLS route, application secrets, login and existing DeepSeek model without leaking credentials; establish restart and rollback procedures.

## 3. Deployed functional acceptance

- [x] 3.1 Verify browser login, model configuration, actual DeepSeek replies, agent creation/edit/copy, persisted settings and unavailable-provider feedback.
- [x] 3.2 Verify native skill installation, selection, execution, attachment handling, independently checked downloadable output, script errors/timeouts and recovery.
- [x] 3.3 Verify customer template creation/edit/application, status/tag drag ordering, optional uploads, immutable context binding and customer isolation.
- [x] 3.4 Verify actual knowledge ingestion, search/filter, grounded citation, Wiki generation, graph rendering and tab/refresh behavior.
- [x] 3.5 Verify credential masking, role/resource authorization, attachment/artifact access and absence of hidden billing/marketplace entry points.

## 4. Reliability and delivery

- [x] 4.1 Run the relevant unit/integration suites, frontend typecheck/build and one consolidated adversarial review; fix blockers and retest affected paths.
- [x] 4.2 Restart the deployed stack and verify state, ongoing sandbox bindings, downloads, queue recovery and acceptable resource usage.
- [x] 4.3 Record sanitized live acceptance evidence, release identity, access and operating instructions, explicit limits and rollback; report only when blockers are resolved.

## 5. Bounded Peter-perspective release hardening

Latest steering removes the earlier eight-hour requirement. Finish the existing
acceptance and confirmed fixes promptly, without adding features or unnecessary
abstractions. Broader untested capacity/integration scenarios are explicit limits.

- [x] 5.1 Inventory every Peter-visible entry and build a human-journey acceptance matrix with current evidence and gaps.
- [x] 5.2 Verify the main customer/template creation and saved configuration flows, agent copy/edit, browser model save/reopen and native skill lifecycle; review remaining controls without expanding functionality.
- [x] 5.3 Exercise upload/parse/search/cite/analyze/archive/download chains and targeted failures: malformed skill, timeout, cross-customer selection, failed save/refresh and recovery.
- [x] 5.4 Audit desktop/narrow-window layout, keyboard/focus, stable tabs/navigation, empty/loading/error states and feedback latency against applicable official design principles.
- [x] 5.5 Verify the demonstration workload and bounded sandbox limits, service/queue recovery and resource usage. Record large-volume and multi-user capacity as untested rather than adding a load-testing project.
- [x] 5.6 Consolidate review, final deployed verification, release/runbook/evidence and explicit unconfigured-provider limits; finish after acceptance closure.

Final evidence: see `docs/PETER_SERVER_ACCEPTANCE.md`. App 20260929-04 and frontend 20260929-10; corrected native Docker recovery, full-host reboot, final browser feedback/navigation, typecheck/build and scoped tests passed. Larger-scale capacity and unconfigured integrations are explicit limits, not acceptance claims. Latest steering removes the previous minimum work window.
