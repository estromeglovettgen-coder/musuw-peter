# WeKnora `81142df` upgrade audit

This directory is the preservation record for upgrading Musuw's complete
WeKnora v0.7.2 source to official commit
`81142dfd17b2778087e95d3a317483a2fd909b91`.

The user-provided examples are **not** a preservation whitelist. Every
source-relevant difference in the current Musuw worktree is presumed
intentional unless a later resolution records evidence that it is a bug, a
dead duplicate, or semantically identical code for which upstream is strictly
better.

## Fixed inputs

| Input | Commit | Tree |
| --- | --- | --- |
| Official merge base (`v0.7.2`) | `3d5d8bfcdfeeea266b292b71cea616847af28d0f` | `7251449b3d71ef5d7d157874c2c705c58a210202` |
| Official target (`main` at audit time) | `81142dfd17b2778087e95d3a317483a2fd909b91` | `37eaafdd6c276d2d1ddffffe1f39f8b38fd7cc03` |
| Prefixed v0.7.2 audit tree | n/a | `212384e2a8ca5c036159bc8a6386e994e7b29ee6` |
| Prefixed current-worktree audit tree | n/a | `fb468c34a8ed49142aee7f1aeaa0e81db2daa561` |

Both official commits were fetched directly from
`https://github.com/Tencent/WeKnora.git` into local read-only remote refs. The
target commit was also verified as the advertised official `main` head during
the audit. The branch name is not used as a build input after the fixed commit
is recorded.

The applied v0.7.2-to-target patch is pinned by SHA-256
`bb6b28cef7804885271284c33339c9b27ad96888c21755074a72198a034b18c6`.
The four modified upstream workflow paths remain intentionally excluded from
the vendored product tree because Musuw's root workflows are the only CI and
delivery authority:

- `.github/workflows/app.yml`
- `.github/workflows/cli.yml`
- `.github/workflows/docker-image.yml`
- `.github/workflows/docreader.yml`

The target-only `anydoc.yml`, `dsh-plugin.yml`, `go-lint.yml`, and
`go-lint-cache.yml` paths are likewise absent from the final vendored tree.
Their build, test, pinned-harness E2E, and new-findings lint checks are composed
into Musuw's root CI; the upstream npm publisher and cache-only workflow do not
become parallel release authorities.

## Pre-upgrade inventory

The alternate-index audit starts from the complete official v0.7.2 tree under
the `weknora/` prefix, overlays the real current worktree with `git add -A`
(therefore including non-ignored untracked source), and compares the two Git
trees without rename collapsing.

| Set | Added | Modified | Deleted | Total |
| --- | ---: | ---: | ---: | ---: |
| Current Musuw worktree vs v0.7.2 | 343 | 344 | 21 | 708 |
| Official target vs v0.7.2 | 490 | 557 | 4 | 1,051 |

Of the 708 Musuw paths, 550 are local-only and 158 overlap an official target
change. Of the 1,051 official target paths, 893 do not overlap a Musuw delta
and default to mechanical import. The 158 overlaps default to a three-way
merge that preserves Musuw semantics; preliminary merge analysis found 85
clean textual merges and 68 textual conflicts among modified common files,
plus one add/add collision and four intentional delete/modify workflow cases.

The Musuw delta spans all product areas, not only the examples in the upgrade
request. Its largest groups are `frontend/` (332 paths), `internal/` (271),
`migrations/` (53), then runtime/configuration/docs/CLI assets. The backend
group includes product business rules, persisted types, repositories,
handlers, jobs, routes, middleware, model transports, billing/entitlements,
storage, account lifecycle, operations, social/video ingestion, Wiki/graph,
and tests. The frontend group includes business-controller baselines, Musuw
shells and visuals, auth/onboarding, operations, billing/entitlements, model
policy, knowledge/chat behavior, Obsidian graph, settings, and tests.

The 21 current deletions remain preservation inputs:

- eight upstream workflow files are absent because Musuw's root workflows own
  build and delivery;
- eight desktop/Wails files are outside the supported Musuw runtime;
- the upstream widget, Tencent font/logo assets, and `AgentSelector.vue` are
  replaced by Musuw product surfaces and defaults.

Four of the deleted workflow paths are modified by the target and therefore
appear in the overlap queue; their deletion remains authoritative unless a
real Musuw consumer requires the upstream workflow implementation.

## Files

- `pre-upgrade-local-delta.tsv` records status, modes, full Git blob IDs,
  overlap state, and default preservation decision for every current Musuw
  delta path.
- `upstream-delta.tsv` records the equivalent official target delta and its
  default import/three-way decision.
- `overlap-paths.txt` is the complete 158-path manual/semantic review queue.
- `resolution-ledger.tsv` is generated after the merge and records the final
  disposition and evidence for every path in the union.
- `verification.md` records fresh tests, builds, migration exercises, smoke
  acceptance, and any environment-gated residual risk.

Pre-upgrade file digests:

```text
f42dce8a2e0f5d6c672ab2769de5954d0a8bb4d4e440a06040ed43c4cf4d23b9  pre-upgrade-local-delta.tsv
61dbd256a98f6fa1ba27f5e3febf880da062558a62d5dce5d1bb27a17ce14812  upstream-delta.tsv
b848de10dc098f9bd7816feea460e000f09de6c7915c1e30c19bf25bb04c607b  overlap-paths.txt
```

## Resolution policy

1. A local-only path remains byte-identical to the audited worktree unless an
   evidence-gated replacement is entered in the final ledger.
2. An upstream-only path is imported from the fixed target unless its absence
   is required by an existing Musuw product/runtime decision and that decision
   is recorded.
3. An overlapping path is merged from official v0.7.2 (base), the audited
   current worktree (Musuw), and the fixed target (upstream). Clean textual
   merges still receive compile/test and semantic review.
4. Existing Musuw product and migration semantics win conflicts. Compatible
   upstream behavior is added at the existing owning module and interface.
5. No prompt omission is evidence for deleting a Musuw behavior.

The migration resolution keeps Musuw PostgreSQL `000080`–`000093` and SQLite
`000003`–`000012` meanings unchanged. Upstream PostgreSQL changes are appended
as `000094`–`000104`, upstream SQLite changes as `000013`–`000022`, and
`000023_sandbox_artifacts_compat` applies the sandbox/artifact schema to
existing SQLite databases that already reached Musuw version 12. The active
and fixed-target records are linked from
[`active-upstream-source.json`](../../active-upstream-source.json) and
[`target-81142df-provenance.json`](../../target-81142df-provenance.json).

The authoritative acceptance contract is
`openspec/changes/upgrade-weknora-main-81142df/`.
