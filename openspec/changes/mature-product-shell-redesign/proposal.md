## Why

The production authentication, chat controls, and settings surfaces expose the right business capabilities but use inconsistent hierarchy, cramped overlays, and avoidable consent friction. They need a coherent, familiar product-shell treatment before the final production acceptance so that users can understand and operate the same capabilities without changing their contracts.

## What Changes

- Replace the login card's mandatory legal checkbox with the conventional “continue means you agree” notice while keeping direct Terms and Privacy links, Google login, email-code login, and all existing security behavior.
- Make authentication loading, validation, sent-code, retry, error, keyboard, narrow-screen, and dark-mode states visually coherent and accessible.
- Replace the nested, truncated model/reasoning menus with a scalable selector surface that supports complete labels, search or efficient scanning, scrolling, alignment, keyboard operation, and entitlement gating.
- Recompose the three consumer settings sections into one Codex-inspired two-pane shell with compact navigation, searchable sections, consistent grouped rows, and responsive single-pane fallback.
- Preserve all routes, model identifiers, inference parameters, billing/entitlement behavior, auth runtime contracts, brand mark, and production provider boundaries.

## Capabilities

### New Capabilities

- `consumer-product-shell`: Consistent, accessible behavior and layout for consumer authentication, chat model controls, and settings navigation/content.

### Modified Capabilities

None.

## Impact

- Affects the React authentication shell under `auth/` and the Vue consumer frontend under `weknora/frontend/`.
- Adds or updates focused UI contract tests and production browser acceptance; no API, database, provider, deployment-protocol, or dependency change is intended.
- Existing legal documents remain authoritative and linked; this change alters presentation of assent notice, not the legal text or account lifecycle.
