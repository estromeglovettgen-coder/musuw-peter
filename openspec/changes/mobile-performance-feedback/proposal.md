## Why
Mobile users can wait without feedback during application startup, and intermittent authentication/network failures cannot currently be correlated with browser phase timings. The production bundle also pulls diagram and syntax-highlighting dependencies into initial navigation through shared dependencies.

## What Changes
- Preserve the independently verified OIDC callback ordering fix.
- Show localized startup feedback and an explicit retry after slow or failed startup, using existing visual conventions.
- Correct manual chunk dependency ownership without changing document rendering.
- Record bounded, anonymous browser phase diagnostics through existing application logging, retain rotating logs across container replacement, and expose proxy timing metadata.
- Release through the existing immutable staging/production workflow with targeted login, loading and privacy acceptance.

## Capabilities
### New Capabilities
- `mobile-performance-feedback`: responsive startup feedback, smaller initial loading dependencies, and bounded diagnostic evidence.

## Impact
Auth shell, frontend entry/build configuration and request diagnostics, a public write-only diagnostic handler, and deployment logging/acceptance. No payment tests, model calls, new analytics platform, database, auth bypass, or changes to business permissions. Mobile carrier and cross-border network latency remain external constraints.
