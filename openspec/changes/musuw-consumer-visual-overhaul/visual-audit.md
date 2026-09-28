# Visual authority audit

Authority: `/Users/yangdi/Desktop/musnow-ai-workspace (2).zip`, exported from Google AI Studio on 2026-08-16. The extracted reference is used only for presentation; `weknora/frontend` remains the behavior authority.

## Reference system

- App shell: 256px light-gray sidebar, white content stage, 1px neutral dividers.
- Type: Inter with Noto Sans SC fallback; 12-14px controls, 14-16px body, 20-24px page titles.
- Color: white and cool-gray surfaces, near-black primary actions, blue only for focus/selection.
- Geometry: 8px controls, 12px cards, compact 40px inputs, restrained shadows.
- Core compositions: 3-column knowledge-base cards; breadcrumb and segmented document/Wiki/graph header; 224px document/Wiki rail; 768px chat reading/composer column; 896x520 settings modal.

## Scope mapping

- Reuse the existing Vue/TDesign controls, routes, handlers, loading states, and API contracts.
- Restyle the shell, chat, knowledge-base list/detail, document/Wiki surfaces, dialogs, drawers, dropdowns, and settings modal.
- Do not add or remove user actions. Existing actions may move within the same page composition.
- Do not change graph rendering or graph-specific styles. Do not change agent trace rendering.
- Reference-only sample content, decorative account fields, and prototype-only actions are not copied.

## Verification

- Local/reference browser review covered the shell, chat composition, knowledge-base cards, document/Wiki rails, settings modal, and excluded graph surface. The fresh checkout had no untracked authenticated runtime secrets, so the authenticated journey was exercised against the equivalent deployed application rather than fabricating a local account.
- Frontend tests, type checking, locale audit, production build, release contracts, auth shell, Go, and DocReader checks passed in CI run `31974092001` for revision `ccc83c2cca31bc366aa13e33967feb53b8805145`.
- Storefront Worker release `31974305937` and immutable application release `31974305854` both completed successfully.
- Production browser acceptance covered chat, knowledge-base list/detail, document/Wiki layouts, settings, and graph. The graph retained its native renderer. The corrected knowledge-base action measured 204x40 at the top-right, was visible and hit-testable, opened the native creation dialog, and canceled without creating data.
