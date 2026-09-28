## Context

The operations console runs on loopback and needs both TEST and PRODUCTION
available without waiting for a frontend rebuild. The launcher owns two
environment-specific runtime files, process records, fixed ports (TEST 4186,
PRODUCTION 4187), production unlock handling, frontend build, and temporary
Tokyo SSH tunnel lifecycle. Each server process owns one read-only PostgreSQL
pool and one target-specific session namespace. The browser previously
displayed the alternate environment as a non-actionable hint.

Consumer model policy already lives in ten typed system-setting keys for five
fixed boundaries: `rag`, `rerank`, `wiki`, `vision`, and `asr`. Chat is an
internal compatibility path and Embedding is bound to each KB/vector index.
The operations console needs a safe projection of those settings and the real
builtin catalog, not a new policy store or placeholder IDs.

## Goals / Non-Goals

**Goals:**

- Change environments with one menu click by navigating between two already
  healthy, fixed-origin processes while retaining one target per process and a
  read-only database pool in each.
- Render and update the five real model policies from existing authorities.
- Offer a broader, cost-conscious catalog without inventing model IDs or
  exposing provider credentials.
- Fix the dark-only popup stacking bug and remaining white KB surfaces.

**Non-Goals:**

- In-browser database URLs, credentials, arbitrary shell commands, shared
  cross-target sessions/proxies, arbitrary system-setting access, Chat/Embedding/TTS
  policy rows, provider configuration, or KB behavior changes.

## Decisions

### 1. Keep two fixed-origin processes instead of restarting on every click

The launcher has per-target `start`, `stop`, and `status` paths and a `start`
mode that brings up TEST on 4186 and PRODUCTION on 4187. Starting one target
never stops or changes the other. Each child receives only its target-specific
clean environment and writes target-specific pid/log/session state. The
browser environment menu is a same-host, cross-port navigation link; it does
not call a switch endpoint, add a target header, or reuse the other port's
session cookie. The server uses target-specific cookie names because browsers
scope cookies by host rather than port.

PRODUCTION startup still invokes the launcher's fixed
`prepare-production-tunnel` command before trusting the local DB port. That
command reuses the existing `musuw-tokyo` restricted SSH alias (or a validated
non-secret override), requires BatchMode and strict host-key checking, uses the
restricted account's `sudo -n` permission to discover the fixed production
PostgreSQL container's validated IPv4, and establishes the ControlMaster
loopback forward as that same account. A failed target startup preserves its
log and leaves the already-running other target untouched. Production runtime
values remain authoritative from the ignored production runtime file and
cannot be overridden by TEST variables.

Alternative rejected: restart one process and poll for the other target. It
makes a normal environment click wait on a cold frontend build, drops the
operator session, and provides no benefit once the two isolated processes are
already safe to run concurrently.

### 2. Expose a narrow model-policy control plane

The backend route returns exactly five scenes in product order and only
`model_id`, display name, and native model type. It reads the model repository
without a tenant plan filter, then admits only active builtin OpenRouter rows
whose type matches the scene. It reads and updates the existing
`consumer_models.<scene>.free_default` and ordered `paid_options` settings.

Each PUT changes exactly one field. The server rejects empty/duplicate lists,
unknown fields, wrong-type or unsafe IDs, and unsupported scenes before
calling the settings service. The loopback server proxies only this exact API;
it does not expose the general SystemAdmin settings family.

### 3. Fix stacking state at the selector root and close theme tokens late

An open selector root receives a higher stacking order than its sibling rows,
so its absolute popup remains above controls rendered later in the document.
The final theme closure provides explicit dark semantic surfaces, text,
borders, hover/active states, and teleported popup colors for the settings
selector and the visible KB Document, Wiki, and Graph structures. Business
templates, data requests, and click behavior remain unchanged.

### 4. Treat OpenRouter discovery and inference as separate acceptance gates

New builtin rows use exact model identifiers returned by OpenRouter's current
model discovery endpoints and retain the existing five native WeKnora model
types. Catalog discovery alone is insufficient evidence: before release, a
representative free and low-cost chat model plus every newly expanded native
role must be exercised through the real provider transport. Verification must
record only non-sensitive response metadata (requested/returned model role and
success), never keys, tenant identifiers, prompts containing user data, or
provider credentials.

## Risks / Trade-offs

- **One target can fail to start.** Static runtime and tunnel-ownership checks
  reject missing files or unavailable production forwarding before spawning.
  The target process then validates its read-only database session and health;
  a failed startup preserves its log while the other target remains healthy,
  so no rollback or cross-target restart is required.
- **A future catalog row could be unsafe.** Both reads and writes reapply the
  active+builtin+OpenRouter+native-type filter; no provider parameters or
  credentials enter browser DTOs.
- **Late dark CSS can affect adjacent pages.** Selectors are scoped to current
  visual settings/knowledge classes and verified in both themes.
- **Provider catalogs change.** Startup reconciliation and policy filtering
  keep unavailable rows out of selection, while live provider smoke tests catch
  stale or transport-incompatible identifiers before release.

## Migration Plan

1. Deploy the local console build and launch both fixed target processes.
2. Verify each target's health and five-row matrix independently.
3. Exercise TEST → PRODUCTION → TEST navigation and leave the default entry on
   TEST (4186).
4. Rollback by stopping the affected target process; stored policy settings need
   no migration and remain valid for the existing runtime resolver.
