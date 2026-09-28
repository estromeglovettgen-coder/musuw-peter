## Why

Musuw members can see IM and webpage-embed integrations but cannot complete the corresponding setup because the UI and management routes still require an administrator. The staging release needs a narrow self-service channel surface without exposing unrelated workspace settings or channel credentials.

## What Changes

- Allow authenticated tenant members at Viewer or higher to create, read, update, toggle, rotate, preview, and delete IM and webpage-embed channels for their current tenant.
- Expose only IM and webpage-embed integration settings to ordinary members; keep the existing full settings surface for administrators and owners while hiding the API, Chrome, and Claw integration pages from every role.
- Remove the Musuw Lite product-gate block for authenticated IM and embed management routes while retaining tenant checks and the existing API-key capability policy.
- Make IM credential responses write-only and apply credential edits as key-level patches so changing one field cannot erase unrelated stored secrets.
- Reject cross-tenant agent bindings and return generic duplicate-bot conflicts without leaking another tenant's channel metadata.

## Capabilities

### New Capabilities

- `member-channel-management`: Defines the member-visible settings surface, tenant-scoped IM/embed management authorization, and write-only credential update contract.

### Modified Capabilities


## Impact

- Frontend settings routing, navigation, role checks, and the existing IM/embed panels under `weknora/frontend/src`.
- Authenticated channel management routes and the Lite product gate under `weknora/internal/router`.
- IM channel handlers, service response types, and credential update semantics under `weknora/internal/handler` and `weknora/internal/im`.
- Staging application images and tests; no database migration or production promotion is included.
