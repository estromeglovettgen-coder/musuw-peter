## Context

The user authorizes remote delivery after local Peter customization. The target is the existing `musuw-build-x64` SSH host, `62.234.188.55`, x86_64, 4 vCPU, approximately 3.7 GiB RAM, 6 GiB swap and 14 GiB free disk. At the initial audit it hosted `pay.musret.com` and a GitHub runner; both have since been removed under the explicit reset instruction. Peter's local state contains a real DeepSeek chat model and synthetic preview customers, but no embedding model, parser process, sandbox configuration or end-to-end ingestion evidence.

## Goals / Non-Goals

**Goals:** Native skill management and execution; browser-configurable agents/models; a separately deployed persistent Peter workspace; real customer and knowledge workflows; evidence for normal, error, isolation and restart scenarios; reproducible release and rollback instructions.

**Non-Goals:** Replacing the operating system/SSH, modifying other hosts, deploying the Musuw consumer product, enabling its billing/marketplace, promising all optional third-party integrations work without credentials, or rewriting the native skill engine. Existing local changes are part of the Peter application and must be preserved. The user's subsequent explicit instruction authorizes deleting the target host's old business contents without backup.

## Decisions

1. Extend the existing `workspaceSurface` policy with skills, sandbox and personal skill environment variables. Keep role/capability checks authoritative. No separate instruction-only skill subsystem.
2. Remove the old payment site, runner, containers and business data on this host without backup per the latest authorization; retain OS/SSH/cloud management agents. Deploy under Peter-owned paths, service/container names, storage and network. Use persistent secrets and database storage, and Redis-backed sandbox session bindings. A fixed release directory/image with a pointer to the active version permits rollback of future Peter releases.
3. Use the existing authorized DeepSeek key only with its existing DeepSeek endpoint for chat, planning and Wiki generation. The configured DeepSeek Flash endpoint was verified with a real image request as well as chat; it does not provide this deployment’s embedding, rerank or speech-recognition service. Configure an appropriate local retrieval/parser dependency where practical; record model modality boundaries honestly. Never call an unconfigured provider or fabricate parser/embedding output.
4. Reuse native Docker sandbox snapshots, installation APIs, session pinning and artifact download. Provide one named default with bounded CPU, memory, process count and idle lifetime suitable for the 4GB host. Only the trusted app connects to the Docker socket; guest code receives no host directory or socket mount.
5. Use explicit synthetic acceptance customers/documents/skills. Verify actual stored/returned results and browser behavior. Keep provider keys, auth tokens, passwords and raw private configuration out of logs, tracked artifacts and final reports.
6. Retain a scenario matrix in deployment acceptance documentation. Complete one consolidated adversarial review, fix blockers, then retest the corrective delta. No zero-bug guarantee or blanket claim for untested optional plugins.

## Risks / Trade-offs

- Limited memory/disk → bounded runtime resources, inspect peak use during real tasks, record supported concurrency; the obsolete runner and caches may now be deleted under explicit user authorization.
- Native deployment/source may contain inherited regressions → build and package against the actual working tree, targeted contract tests plus deployed browser/API acceptance.
- Credentials and customer isolation → encrypted model storage, controlled secret transfer, authenticated artifact downloads and cross-customer/cross-user negative tests.
- Model/service availability → actual DeepSeek calls and honest failures, persistent state and dependency recovery checks.

## Migration Plan

Audit host; delete old target-host business data without backup under the latest instruction; expose native settings with a red/green policy test; build a dedicated release; provision persistent dependencies and configuration; publish through nginx with TLS; create/configure the Peter account and default model/skill resources; execute acceptance; restart Peter-owned services and recheck; record delivery and rollback. Local preview data remains untouched. Future Peter schema migrations require paired release/data recovery; the deleted old host contents intentionally have no recovery copy.

## Resolved deployment choices

- Public route: `https://62.234.188.55/`, nginx with a Let's Encrypt short-lived IP certificate and a persistent twice-daily certbot timer. Renewal dry-run and restart recovery passed.
- Native docreader v0.8.0 plus local BAAI/bge-small-zh-v1.5 embedding and a multilingual cross-encoder reranker. DeepSeek supplies verified chat, Wiki synthesis and image understanding; ASR and external channels remain unconfigured.
- Native sandbox resume now refreshes its activity marker before releasing the lifecycle lock. Idle cleanup uses the existing lifecycle lock and turn lease, so it cannot delete a session while attachments are restored. Race tests, real Docker tests and a fresh full-host reboot passed.
- Customer overview follows native Wiki pending/active statistics after source parsing completes; disabled Wiki does not issue unsupported reads. Existing timers, API and components are reused.
- The latest request removes the eight-hour minimum and rejects overdesign. This release closes verified blockers and retains explicit capacity/provider limits; it does not add a new design system, CRM engine, scheduler or configuration service.
