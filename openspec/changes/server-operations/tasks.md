## 1. Runtime and recovery

- [x] 1.1 Specify private server access, source authority, credential boundaries and observable recovery scenarios.
- [x] 1.2 Add explicit protected server configuration with local-mode regression tests.
- [x] 1.3 Add bounded database readiness and restart recovery with current container endpoint discovery.
- [x] 1.4 Add failed-read frontend recovery with real browser red/green coverage and no write replay.

## 2. Delivery

- [x] 2.1 Build a revisioned GitHub artifact and validate safe extraction, integrity and rollback.
- [ ] 2.2 Install the restricted operations deploy seam, unprivileged supervisor and protected existing credentials.
- [x] 2.3 Configure the separate required-reviewer operations deployment environment and include targeted checks in CI.
- [ ] 2.4 Consolidate adversarial review, resolve blockers and merge the reviewed revision.

## 3. Acceptance

- [ ] 3.1 Deploy the CI-green artifact and verify real read-only queries and authorization/CSRF rejection.
- [ ] 3.2 Verify process-failure automatic restart, database readiness, and private-only listener.
- [ ] 3.3 Switch the Mac to persistent HTTP forwarding and verify disconnected-client/server-continuity and frontend recovery.
- [ ] 3.4 Record the released revision, verification evidence and tested rollback instructions.
