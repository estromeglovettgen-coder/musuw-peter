## 1. Authentication failure recovery

- [x] 1.1 Add a red-capable frontend regression proving an `oidc_error` is
  handed to the Musuw failure route rather than `/auth/start`.
- [x] 1.2 Add the dedicated external-auth failure handoff and make all native
  OIDC callback failures use it.
- [x] 1.3 Render a generic, explicit-retry failure state in the Musuw auth
  shell and cover its route behavior.
- [x] 1.4 Preserve a native token on temporary native-session validation
  failures, classify native persistence failures as 503, and cover the 5xx
  validation and refresh recovery paths.
- [x] 1.5 Keep OIDC redirect fragments free of provider and backend error
  descriptions, with handler regression coverage.

## 2. Capacity-safe full release

- [x] 2.1 Add a focused release-script test for a below-reserve remote
  filesystem and confirm it performs no release action.
- [x] 2.2 Add the remote capacity preflight before release-directory creation
  and source transfer, using a conservative configurable reserve.
- [x] 2.3 Reuse the locally present pinned DocReader image and test both the
  present and absent cases.

## 3. Verification and safe delivery

- [x] 3.1 Run focused auth and release-script tests, module typechecks, and
  production builds.
- [x] 3.2 Rerun the real browser OIDC-error repro and verify it stops at the
  explicit failure route.
- [x] 3.3 Verify production capacity and health; deploy only the safe affected
  surface or report the remaining capacity blocker.
