# Musuw documentation map

This directory contains the current Musuw operator documentation. Source code,
checked-in configuration, and these documents are authoritative; dated handoff
snapshots are not retained as operating instructions.

## Current operator documents

| Document | Purpose |
| --- | --- |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Immutable build, staging, promotion, rollback, and production delivery contract. |
| [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md) | Staging environment operation and acceptance workflow. |
| [`CREATOR_MARKETPLACE_OPERATIONS.md`](CREATOR_MARKETPLACE_OPERATIONS.md) | Creator submission, platform publication assets, product billing, buyer access, and market withdrawal operations. |
| [`HANDOFF.md`](HANDOFF.md) | Current no-context project handoff: source identity, Musuw product boundary, merged capabilities, deployment status, and remaining acceptance matrix. |
| [`FULL_PRODUCT_ACCEPTANCE_CHECKLIST.md`](FULL_PRODUCT_ACCEPTANCE_CHECKLIST.md) | Durable scenario matrix and chronological evidence log; unchecked items are not implied complete. |
| [`SECRETS_AND_INTEGRATIONS.md`](SECRETS_AND_INTEGRATIONS.md) | Secret ownership, provider boundaries, and safe operator handling. |
| [`PADDLE_LIVE_READINESS.md`](PADDLE_LIVE_READINESS.md) | Paddle Live readiness and evidence requirements. |
| [`LOCAL_ADMIN.md`](LOCAL_ADMIN.md) | Loopback-only operations console. |
| [`VIDEO_SOURCE_SINGLE_MODEL_PLAN.md`](VIDEO_SOURCE_SINGLE_MODEL_PLAN.md) | 第一版单模型视频导入、原文件复用、同模型重试和供应商中性 UI 计划。 |
| [`external-credentials-registry.yaml`](external-credentials-registry.yaml) | Metadata-only credential inventory; never store secret values here. |

## Product and source documentation

- The repository [`README.md`](../README.md) and [`AGENTS.md`](../AGENTS.md)
  define the active Musuw source tree and local workflow.
- [`storefront/README.md`](../storefront/README.md) defines the public-site
  behavior and its responsive visual contract.
- [`weknora/website-docs/`](../weknora/website-docs/) is the canonical upstream
  WeKnora product documentation. Files under `weknora/docs/` are compatibility,
  generated API, or upstream historical material and must not override Musuw's
  local or deployment instructions.
- Active OpenSpec changes retain feature decisions and acceptance criteria.
  Completed changes should be archived with OpenSpec rather than treated as a
  current runbook.

[`HANDOFF.md`](HANDOFF.md) is the current continuity document for a fresh
reviewer. It does not replace the deployment or staging runbooks and must not be
used to infer that an unrecorded or partial check passed.

Document roles are intentionally separate: `HANDOFF.md` records the current
snapshot, the acceptance checklist retains durable scenarios and historical
evidence, runbooks define procedures, and OpenSpec retains product decisions.
The handoff and the checklist's current metadata may advance with the product;
historical execution-log evidence must stay explicitly dated rather than being
rewritten or presented as current proof.

When a document conflicts with current source or configuration, correct or
remove it in the same change. Do not add another dated handoff file as a second
source of truth.
