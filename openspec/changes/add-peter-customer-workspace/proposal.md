## Why

Local review requires separate customer and public-library surfaces under Workspace. Customer source/Wiki/graph navigation must retain the customer shell, and every exposed settings section must have complete editable defaults. Remove redundant list rails and permanent explanatory copy.

Peter needs to use his editable agents with persistent, separate customer backgrounds. The existing knowledge bases, Wiki and conversations provide the foundation, but do not yet form a customer workspace.

## What Changes

- Add a customer purpose to document knowledge bases, with status, tags and manual notes/follow-up records.
- Add a customer list and overview, reusing native documents, Wiki and graph views.
- Bind conversations to one customer, preserve that context when changing agents, and isolate customer knowledge and memory.
- Reuse the existing two Wiki instruction fields with customer defaults. Provide an editable sales agent preset.
- Allow customer-chat source attachments to be archived, enabled by default.
- Seed explicitly fictional local records for user review. Do not deploy or run automated tests at the user's request; perform compilation and startup checks only.

## Capabilities

### New Capabilities
- `peter-customer-workspace`: customer knowledge-base identity, management, conversations, source archival and local preview.

### Modified Capabilities
None.

## Impact

Native Go knowledge-base/session types, storage migration, API handlers, chat scope, Vue knowledge/chat views and local seed tooling. No new CRM dependency, production changes, case promotion, follow-up scheduling or field designer.
