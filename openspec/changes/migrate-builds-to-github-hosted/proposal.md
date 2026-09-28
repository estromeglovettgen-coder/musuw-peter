## Why

The public repository can use standard GitHub-hosted runners without consuming the private-repository minutes allowance. Production construction already moved off the Beijing builder, but its measured cold build took over eight minutes and the final `musuw-release` runner still introduced a separate availability dependency. Use the shortest complete path: GitHub-hosted CI and construction, GHCR, then GitHub-hosted SSH deployment to Tokyo.

## What Changes

- Remove repository-variable runner routing, pin CI and Storefront to standard `ubuntu-24.04`, and use official Actions caches.
- Run the production image build on standard GitHub-hosted AMD64 Linux instead of `musuw-build-x64`.
- Use official Docker Buildx, login, and build/push actions with separate maximum-mode GitHub Actions cache scopes for the app and frontend images.
- Run the final restricted SSH deployment on `ubuntu-24.04`, removing `musuw-release` from the delivery path without changing the Tokyo server gate or firewall.
- Preserve exact-SHA authorization, immutable GHCR tags and digest validation, serialized releases, production environment isolation, pinned host keys, and the restricted two-verb server command.
- Retire local and Beijing runners from required production infrastructure; do not add a tunnel, VPN, proxy, new server, or second deployment protocol.

## Capabilities

### New Capabilities

- `github-hosted-delivery`: Run CI, Storefront, production image construction, and final deployment on standard GitHub-hosted runners while preserving the existing release security and server contracts.

### Modified Capabilities

- `native-production-delivery`: Replace all runner-specific production delivery dependencies with standard hosted construction and deployment while retaining immutable image proof and the restricted deploy seam.

## Impact

Affected areas are GitHub Actions runner selection, official Docker actions, GitHub Actions cache usage, workflow validation, and deployment documentation. No application API, data model, runtime secret, server topology, or payment behavior changes.
