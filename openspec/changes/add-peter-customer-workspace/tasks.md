## 1. Native data and scope
- [x] 1.1 Add customer metadata and immutable session binding with additive migrations.
- [x] 1.2 Enforce customer retrieval and memory scope in native chat.
## 2. Customer experience
- [x] 2.1 Add customer list, overview, records and native source/Wiki/graph navigation.
- [x] 2.2 Connect customer selection, conversations and optional original attachment archival.
## 3. Local handoff
- [x] 3.1 Seed fictional customers, sources, Wiki and editable sales preset.
- [x] 3.2 Compile and start locally; review the final delta without running automated tests.
- [x] 3.3 Open the local customer page and document remaining manual acceptance and external dependencies.

Implementation and local handoff complete; user functional acceptance is pending. Browser open request was queued by the desktop app. See `docs/PETER_CUSTOMER_PREVIEW.md`.

## 4. Local review corrections
- [x] 4.1 Restore complete Standard settings defaults and payload; fix dialog reset races.
- [x] 4.2 Separate Workspace customer and public-library routes, lists and switchers.
- [x] 4.3 Keep all customer content inside one persistent navigation shell; align list UI and remove permanent explanatory copy.
- [x] 4.4 Compile and diagnose the reported UI failures locally; hand the revised version back for user acceptance.

Review correction evidence: full frontend build passed; final TypeScript check passed; targeted browser reproduction confirmed processing controls, customer/public-library separation, Wiki/graph switching and legacy-link redirect. Customer letter avatars are removed. No paid model calls or automated business tests were run; full user acceptance is still pending.

## 5. Customer mention and agent preferences
- [x] 5.1 Remove the conversation customer bar and homepage archival checkbox; persist archival preference in native agent configuration.
- [x] 5.2 Expose an independent customer mention group without changing public-library agent filters or server customer isolation.
- [x] 5.3 Link selected customer/library chips to details and keep removal separate.
- [x] 5.4 Compile, restart the local backend and inspect the reported UI paths without model calls.

Final evidence: frontend production build and final TypeScript check passed; native Go build and the SQLite FTS5 development startup passed. Browser inspection confirmed the independent customer group under the selected-library sales preset, replacement of Ryan by Ben, navigation to Ben details and the public sales library, removal without navigation, and absence of the customer bar. The archival switch was saved off, reopened off, and restored on; SQLite confirmed both saved values. No model inference or attachment parsing was triggered. The user retains functional acceptance of actual conversations/ingestion.

## 6. Unified customer creation and settings
- [x] 6.1 Reuse the native full editor for customer creation and editing, with the same profile fields and processing configuration.
- [x] 6.2 Add workspace-persistent customer status/tag settings with native tenant authorization and additive migrations.
- [x] 6.3 Allow optional initial chat-source uploads, show individual results, and retry failures without recreating the customer or reuploading successes.
- [x] 6.4 Compile, migrate/start locally, review the integrated path and document remaining user acceptance without paid inference or automated business tests.

## 7. Reusable customer types and ordering
- [x] 7.1 Persist named customer templates through the existing workspace settings contract and native configuration types.
- [x] 7.2 Reuse the complete editor to manage templates and apply a detached copy before customer creation without copying identity or source data.
- [x] 7.3 Replace status/tag arrow buttons with drag ordering and simplify the overview Wiki field.
- [x] 7.4 Compile, restart locally, review the integrated path and document verification without paid inference or automated business tests.

Evidence: native SQLite FTS5 build/startup, frontend production build, final TypeScript compilation, strict OpenSpec validation and diff checks passed. SQLite migration 29 applied after a database backup. Background browser inspection confirmed status/tag saving and reopening, creation of fictional Jordan with custom status/tag, contact/note/public-library association and custom Wiki instructions, identical edit fields and a successful note update. Optional file selection/removal was verified without submitting the file to a paid model. Source ingestion and partial-upload retry were reviewed through the native API path; live parsing and fault-injected retries remain user acceptance, not claimed as exercised. Tenant persistence comparison showed no unrelated prior columns changed except updated_at. Existing bundle-size/circular-chunk warnings remain a follow-up.

Template revision evidence: native Go and Vue/TypeScript compilation passed; local backend restarted and health/frontend HTTP checks passed. Two demonstration templates were created and persisted through the UI. Applying the delivery template created Casey with the expected native Wiki/chunking configuration while retaining personal fields; original customer/library records were unchanged. Native pointer drag and keyboard status ordering were exercised, then original order restored. Multiple-tag drag, source ingestion and broad business acceptance remain with the user. No paid model requests or automated business test suite were run. See the preview document for details.
