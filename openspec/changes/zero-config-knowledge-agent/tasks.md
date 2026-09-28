## 1. Reuse and harden platform defaults

- [x] 1.1 Verify existing document knowledge-base defaults against the active
  built-in model rows before persistence, with a focused unavailable-catalog
  regression test.
- [x] 1.2 Retain the existing default/backfill migration and remove standard
  user navigation that treats incomplete legacy data as a reason to expose
  settings.

## 2. Fix the consumer to the full-capability agent

- [x] 2.1 Keep `builtin-smart-reasoning` as the single full-capability consumer
  agent while retaining upstream built-ins for Standard compatibility.
- [x] 2.2 Keep the smart-reasoning pipeline authoritative, apply the
  already-authorized selected model and reasoning effort request-scoped, and
  reject disallowed overrides.
- [x] 2.3 Remove the consumer agent-mode selector, keep only the separate
  plan-catalog model and supported reasoning-effort picker, and preserve those
  choices across reload.

## 3. Remove configuration exposure and release mismatch

- [x] 3.1 Remove standard knowledge-base settings and uninitialized-model
  entrances while retaining create/upload/content actions.
- [x] 3.2 Add the smallest release checks that prevent a UI-only catalog/model
  mismatch, plus focused source/simulation coverage.

## 4. Verify and deliver

- [x] 4.1 Run focused Go and frontend tests, build checks, and strict OpenSpec
  validation.
- [x] 4.2 After production capacity is restored, run one full release and
  browser-test create, upload, retrieval, Flash, Pro, deep thinking, and
  tool-capability flows; remove intentional preset test knowledge bases only
  as part of that acceptance run.
