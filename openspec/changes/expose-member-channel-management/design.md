## Context

Current Musuw code already implements IM and webpage-embed channels with Musuw-styled panels, tenant-aware services, and an API-key `manage_channels` capability. Three independent gates prevent member self-service: Admin-only route guards, the Lite product gate, and Admin-only UI controls. IM edit responses and full-object credential updates also make a wider member audience unsafe because secrets can be echoed or erased.

The change must use the existing channel services and Musuw visual components, remain tenant-scoped, preserve API-key policy, and deploy through the isolated staging release path.

## Goals / Non-Goals

**Goals:**

- Give every authenticated tenant member complete IM/embed channel management inside the current tenant.
- Keep the ordinary-member settings surface limited to the two channel pages.
- Preserve stored secrets during partial edits and remove secret-bearing response fields.
- Keep the change small enough to back out as one application commit.

**Non-Goals:**

- Adding channel types, changing public embed runtime behavior, or changing callback authentication.
- Broadening model, tenant, billing, member, API-key, or system administration permissions.
- Designing new UI or copying another style layer; the existing Musuw components remain authoritative.
- Promoting the staging release to production.

## Decisions

### Use one narrow member channel guard

Add a dedicated JWT member guard for channel-management routes instead of weakening the general Admin guard. The guard accepts valid tenant membership at Viewer or higher and delegates API-key principals to the unchanged capability authorizer. Reusing `Viewer()` on every mutation was considered, but a named guard makes the exceptional self-service contract auditable without changing the repository-wide role matrix.

### Remove only channel management from the Lite product deny list

The Lite product gate will allow the authenticated IM/embed management routes while leaving other unsupported surfaces blocked. Public embed runtime and IM callback routes retain their existing authentication mechanisms.

### Treat credentials as write-only key patches

List and mutation responses use a safe summary without `credentials` or `bot_identity`. Update requests distinguish an omitted field from a present JSON object and shallow-merge only present keys. A shallow merge matches the flat provider credential schemas and preserves explicit falsy values without introducing a new secret store or nested patch protocol.

### Reuse the current Musuw settings shell and panels

Frontend policy helpers decide which settings and integration tabs are exposed. Existing IM/embed panel controls switch from Admin checks to the member channel permission. No CSS, visual abstraction, or new component family is added.

## Risks / Trade-offs

- [A member can reconfigure a tenant-wide bot] → This is the requested self-service contract; tenant scoping and cross-tenant agent validation remain mandatory.
- [Write-only non-secret options may appear unset while editing] → Untouched keys are omitted and preserved; only an explicit user change sends a patch.
- [A global duplicate constraint can become an enumeration oracle] → Return one generic conflict and omit foreign channel metadata.
- [Staging and production share a host] → Use the existing resource-bounded staging workflow and immutable images; do not run a second manual stack or promote.

## Migration Plan

1. Land tests and implementation on a feature branch based on current Musuw `main`.
2. Merge through the protected repository flow after CI succeeds.
3. Let successful main CI build immutable app/frontend images and deploy `staging-only`.
4. Verify the deployed revision, health/noindex/Sandbox boundary, member navigation, channel authorization, and credential-safe behavior.
5. On deployment failure, rely on the staging release gate to stop the staging project and retain volumes; no production runtime is changed.

## Open Questions

None for the staging release. Production promotion requires a separate user instruction and acceptance decision.
