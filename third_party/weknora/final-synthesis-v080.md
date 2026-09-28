# Final synthesis alignment, 2026-09-20

Source: [Tencent/WeKnora v0.8.0, commit 1edcd54](https://github.com/Tencent/WeKnora/blob/1edcd54b43606d9079bb36650efe3f68707a79ea/internal/agent/finalize.go).
The application remains based on main `81142df`; this is not a version upgrade.

At the user's request, agent defaults are 50 iterations. Explicit saved limits
remain authoritative. Reaching the limit invokes final synthesis rather than
returning immediately. Research calls retain the user's thinking settings;
synthesis leaves `Thinking` unset and `ReasoningEffort` empty, as upstream does.
The upstream `clampCompletionBudgetToContext` function and its 4096-token safety
margin are copied unchanged from `internal/agent/const.go` and used for synthesis.
No new context compaction or model-window discovery is included.

`internal/agent/finalize.go` retains the upstream messages, prompt, event flow,
usage accumulation, think-block stripping and maximum-iteration fallback.
The remaining file differences from the pinned source are explicit:

- Pipeline logs retain Musuw's `query_len` instead of logging the user's query.
- `PromptCacheKey: sessionID` is omitted. The current model adapter lacks its
  consumers; adding a field alone would not restore caching. Cache transport
  changes are deferred by request.
- Upstream's misleading `Thinking disabled` comment is omitted: an unset
  parameter allows model-adapter defaults, including low-effort reasoning.

This is final-synthesis alignment with stated compatibility differences, not
byte-for-byte or end-to-end equivalence to the entire v0.8.0 engine.

## Known boundaries

The existing stream caller still imposes a 120-second total per-call timeout.
The v0.8.0 idle watchdog, retry changes and new compression system are deferred.
The upstream finalizer itself accepts an empty completed stream and marks the
turn complete; this was reproduced against the official v0.8.0 source with a
reasoning-only stream. Its error path uses an apology fallback. Restoring these
semantics does not fix empty-success or timeout handling.

Final synthesis rebuilds all tool results from `RoundSteps`, independently of
iteration-history compression. The copied clamp reduces output allowance,
with a minimum of one token; it does not shorten oversized input. Existing
`MaxContextTokens` values remain unchanged.

## Verification

`internal/agent/finalize_upstream_test.go` exercises real loop exhaustion at
10 and 50 rounds, the separate synthesis call, omission of thinking parameters,
answer/completion events and usage preservation. Budget cases cover an unset
window, ample room, limited room and an exhausted window. Model calls are
replaced by deterministic fixtures; these are not production-provider tests.

Fresh local checks passed on 2026-09-20:

- `go test ./internal/agent ./internal/types ./internal/models/chat ./internal/handler/session -count=1`
- Service tests for default validation, installer fallback and platform-managed modes.
- `go build ./cmd/server` (existing macOS dependency/linker warnings only).
- Frontend settings/editor tests: 39 passed; `npm run build-with-types` passed.
- Source manifest, resolution ledger (1601 paths, zero blockers), upgrade contract
  (6 tests) and `git diff --check` passed.

Independent review found no blockers within this requested alignment scope.
No production deployment or live model request was performed.
