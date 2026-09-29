## Why

Peter's local workspace exposes agent configuration but has no usable skill execution environment and has only previewed the customer/knowledge flows. The user now authorizes a dedicated deployment on Tencent Cloud `62.234.188.55`, with real DeepSeek-backed acceptance before delivery.

## What Changes

The latest user instruction on 2026-09-29 supersedes the earlier eight-hour
window: finish promptly, reuse existing capabilities and avoid overdesign.
The goal has no token budget. Close confirmed delivery blockers, verify their
deployed behavior and restart recovery, and deliver when acceptance passes;
do not add features or repeat unchanged tests to fill a time window.

- Expose native skills, sandbox configuration and personal skill credentials in the Peter workspace, retaining native authorization and hiding billing, marketplace and unrelated administration.
- Clear the host's old website, build runner, containers and business data without backup, as explicitly authorized in the user's subsequent instruction; retain the operating system and SSH access. Deploy Peter with persistent application data, encryption keys, uploads, skill snapshots and session bindings.
- Configure the existing test DeepSeek credential without exposing it; provide necessary parsing/retrieval dependencies for the supported document and customer workflows.
- Provision one resource-bounded default Docker sandbox and validate skill installation, execution, attachments, generated files and recovery.
- Exercise deployed browser and API workflows for models, agent DIY, customer creation/templates/history/isolation, knowledge ingestion/search/Wiki/graph, failure states and restart persistence. Repair delivery blockers and retain sanitized evidence.
- Audit natural user journeys, discoverability, form consistency, keyboard and narrow-screen operation, timely feedback, cancellation/retry and error recovery. Reuse TDesign and existing patterns; use official Carbon and Fluent guidance for interaction principles without replacing the component stack or adding unrelated features.

## Capabilities

### New Capabilities

- `peter-server-delivery`: Isolated, persistent Peter deployment and scenario-based acceptance of native agent, customer, knowledge and skill capabilities.

### Modified Capabilities

None. This extends the unarchived Peter workspace changes and reuses their existing native contracts.

## Impact

Peter navigation policy, deploy packaging, native runtime configuration and acceptance tooling. The user explicitly authorizes deleting old business contents on the specified host without backup; this supersedes the initial host preservation plan. Other hosts and Musuw production remain untouched. The latest explicit Tencent server request supersedes the earlier local-only phase. Live provider calls are authorized for this acceptance; fixtures must not be represented as real model or ingestion success.
