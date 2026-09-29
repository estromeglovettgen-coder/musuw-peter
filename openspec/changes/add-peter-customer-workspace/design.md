## Context

Native Go/Vue knowledge bases already own files, Wiki, graph and processing settings. Sessions own messages; agents supply configuration. Local preview uses SQLite. The user confirmed a lightweight first version and will perform functional acceptance personally.

## Goals / Non-Goals

**Goals:** one customer per document KB; persistent customer metadata; customer-aware conversations; reuse both Wiki instruction fields; local fictional seed data.

**Non-Goals:** CRM integration, scheduled tasks, automatic case promotion, custom-field builder, new AI processing engine, production deployment or automated test execution in this iteration.

## Decisions

- Add nullable `customer_profile` to KBs; keep processing type `document`. Use the native KB update contract and authorization. Notes/follow-ups are native manual source documents, avoiding a duplicate activity store.
- Add immutable `customer_knowledge_base_id` to sessions. Select the customer at creation; switching customer opens another conversation. Native session owner checks remain.
- Resolve customer queries against that customer plus explicitly associated non-customer KBs. Reject unrelated document/tag targets. Customer memory scope is customer + operator + tenant, preserved across background context cloning.
- Reuse native Wiki pages for overview, with a selectable profile page when needed. Do not parse the bounded Wiki index intro into a fabricated customer profile.
- Add customer list/overview; reuse native source/Wiki/graph screens, agent editor and upload endpoints. The mention picker has a separate customer group using the existing KB wire type; customer chips link to details. There is no separate chat context bar. Native agent JSON persists the optional `archive_customer_sources` setting (missing means enabled), read before original attachments are archived. No additional database migration is needed for this setting.
- After local feedback, Workspace has separate public-library and customer list routes. Public-library lists and switchers exclude customer records. All six customer tabs render inside the customer shell; native content receives an embedded presentation flag and keeps its existing processing logic. Legacy customer KB URLs redirect to the customer route, preserving tab, source and Wiki query parameters. Both shell and embedded content derive their active tab from the URL; an unavailable Wiki does not render the document tab in its place. The development controller compiler watches its source dependencies so hot updates cannot mix old controllers with new views.
- Keep aligned list headers and create actions, remove the list scope rail and promotional helper copy in Peter's surface. Remove customer letter avatars. Preserve actionable errors, upload status and empty states.
- Standard KB creation needs the complete native form state and submission payload; the Lite zero-configuration form must not be reused as Standard defaults. Closing/reopening a dialog must not allow delayed resets to clear a newly opened form.
- Source archival uses the existing file upload API with actual originals; default on. Surface partial upload failures and preserve retry information. No automatic archival of AI replies.
- Seed fictional sources, Wiki pages and conversations locally and label them as demonstration data. Do not use live model quota to manufacture fixtures or claim seeded output is live AI generation.
- New customer KBs default to Wiki-only indexing with the selected native chat model. Standard creation must preserve configured models instead of forcing the hosted Lite catalog. Consumer plan limits apply only to Lite; otherwise the local Free tenant cannot create multiple customer KBs.

## Customer setup revision

- Use the full native KB editor in customer mode for creation, editing and reusable customer-type templates. Templates store a bounded snapshot of native processing configuration and reusable profile defaults in tenant `customer_config`; no new processing engine or migration. Template creation/editing never creates a KB or starts ingestion. Applying a template copies its settings into a new-customer draft, preserving personal identity, contact, notes already entered and staged files. Later template edits/deletion do not mutate existing customers. Only native model/storage references are stored, never provider credentials, source files or generated Wiki identifiers.
- Customer settings manages multiple named templates alongside status/tag choices. Templates use the existing full editor and return to the settings draft; the outer Save persists the whole configuration. Both choice lists support drag ordering (with keyboard access), replacing visible arrow buttons. New customers select their profile Wiki automatically; existing customers can select the page displayed as the home-page profile under a plain-language label.
- Store available status/tag choices in nullable tenant `customer_config`, accessed through the native tenant KV endpoint. Existing admin write authorization applies. Removing an option does not rewrite customer records; existing values remain displayed and filterable. The first configured status is the new-customer default.
- Optional files are staged in the editor, then uploaded through the native source API only after creation succeeds. Once a customer exists, the dialog switches to upload results; retries target only failed files and the same customer ID. Exiting this state enters the existing customer, never recreates it. Saved processing settings apply before any source enters the pipeline.

## Risks / Trade-offs

- Local document parser/vision/graph dependencies may be unconfigured → show native errors/status; seeded Wiki/graph demonstrates presentation separately from live generation.
- No functional tests requested → compile frontend/backend and start the app, disclose that user acceptance remains outstanding.
- Changing Wiki instructions affects future/reprocessed outputs, not existing data automatically.
- The first overview aggregates the latest 100 source documents and 50 conversations. Native source pagination remains available; aggregate timeline pagination is deferred.

## Migration Plan

Additive SQLite and PostgreSQL migrations. Preserve local DB backup before restart; rollback code and restore the local backup together if necessary. No production migration.
