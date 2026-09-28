# Verification

Verified on 2026-09-28 against main `baa4744e` plus this narrowly scoped fix.

- Real bootstrap + real HTTP interceptor regression: before 4 failures / 2 passes; after 6 passes.
- Independent neighboring auth/router tests: 30 passes. Additional controlled ordinary-startup checks confirm that rejected refresh credentials still clear the stale session, while temporary 503 failures retain it.
- The frontend's normal `tsx --test` command automatically discovers the new `.mjs` regression file; no CI workflow change is required.
- Full frontend suite: 1,281 passed, 0 failed.
- Vue type check: passed.
- Vite production build: passed, 35.98 seconds; existing large-chunk warnings remain.
- Upstream source contract: 6 passed; resolution ledger regenerated with 1,601 paths and no blockers.
- Strict OpenSpec validation and `git diff --check`: passed.
- Independent review found no authorization bypass: the guard skips only obsolete preflight; callback processing and server authorization are unchanged.

The isolated manual-editor loading candidate was withdrawn after build evidence showed that Mermaid and Highlight remained in the initial static dependency graph. No editor lifecycle or loading-state changes are included.

The regression fixtures simulate framework/network boundaries; real-device mobile weak-network end-to-end acceptance has not been performed. This change demonstrates and repairs a reachable callback ordering defect, not the exclusive cause of any particular incident.

No production deployment, runtime configuration change, credential change, model call, payment request or real OTP request was performed by this change. Customer incident evidence and operational details are retained outside the source repository.
