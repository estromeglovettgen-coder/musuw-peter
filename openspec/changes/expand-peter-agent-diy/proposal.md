## Why

Peter needs an independently configurable agent workspace, while the imported Musuw consumer edition deliberately hides advanced agent controls and locks platform answer modes. This first increment must expose the existing native configuration and browser model management, with real persistence and execution, for local acceptance before any server deployment.

## What Changes

- Bootstrap this repository from Musuw main `edae9fcbf95c196767688909ad09d7c21ea3ac67`, retaining source attribution.
- Provide an isolated local Standard-edition entry point, database and file storage without Musuw production credentials, consumer billing or public authentication dependencies.
- Expose the complete applicable native agent editor, agent CRUD/copy and tenant-admin customization of built-in answer modes.
- Support browser configuration of chat, embedding, rerank, vision and transcription models through the native model manager, including connection verification and agent selection.
- Correct consumer-only restrictions that currently leak into Standard behavior. Preserve permissions and explicit capability requirements.
- Verify configuration round trips and actual chat execution locally. No server deployment, CRM, customer automation or new agent engine in this increment.

## Capabilities

### New Capabilities
- `peter-agent-workspace`: Independent local workspace, complete applicable agent configuration, browser model configuration and runtime verification.

### Modified Capabilities
None. The inherited consumer edition's contract remains unchanged.

## Impact

Native Go agent services, Vue agent/model entry points where needed, local startup wiring, focused tests, operator documentation and provenance. Existing database tables and native APIs remain the configuration authority. No production data migration or external deployment is authorized in this increment.
