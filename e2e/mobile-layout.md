# Mobile browser layout verification

The mobile overrides keep the existing Musuw theme and apply at widths up to
760 CSS pixels. Desktop layout and business controllers retain their existing
behavior. Phone directory disclosure does not overwrite the desktop preference.

## Reproduce locally

From the repository root, run `node e2e/mobile-fixture-api.mjs`. In a second
terminal, from `weknora/frontend`, run:

```sh
VITE_DEV_PROXY_TARGET=http://127.0.0.1:4194 npm run dev -- --host 127.0.0.1 --port 4193 --strictPort
```

Open `http://127.0.0.1:4193/e2e/mobile-harness.html` at 430 × 932 CSS pixels.
The harness mounts the actual workspace, knowledge, Wiki, graph, chat and agent
components. All data is synthetic; the local fixture rejects writes. The harness
is not an entry point of the production build. To open another page directly,
use, for example, `?page=/platform/chat/mobile-session`.

## Acceptance results — 2026-09-19

- At 430 × 932 and 390 × 844, the knowledge toolbar's nine primary controls are
  in the viewport, with touch targets at least 39 CSS pixels wide and high.
- The phone menu opens as an overlay and closes after navigation. The directory
  starts collapsed; expanding it does not leave a permanent narrow content rail.
- Document grid/list switching, folder navigation, Wiki reading, graph navigation,
  historical chat and agent editing were exercised in the browser.
- A document drawer fills the 390-pixel viewport without cropping; its close
  button is 44 × 44. Document row actions are visible and 40 × 40 on touch screens.
- Chat inputs use 16-pixel text. Tools are 40 × 40 and Send is 44 × 44. At an
  available viewport height of 520 pixels, the composer and Send remain visible.
- Agent settings use a compact horizontal header and a scrollable form. At
  430 × 932 and 700 × 600, the form and footer remain inside the viewport.
- At 1440 × 900, 14 visible knowledge-page elements had identical bounding boxes,
  font, color, background, padding and display values against the clean
  `d0074e33` baseline with identical fixture data.
- `npm run build-with-types` passed. The 18 existing visual and business-parity
  checks below passed. Existing bundle-size warnings remain.

```sh
node --test src/assets/musuwVisualContract.test.mjs \
  src/assets/musuwInputFieldBusinessParity.test.mjs \
  src/assets/musuwKnowledgeBaseBusinessParity.test.mjs \
  src/components/menu.resource-nav.visual-contract.test.mjs \
  src/views/knowledge/KnowledgeBase.filter-controls.visual-contract.test.mjs
```

Verification used Chromium viewport/touch emulation. It does not establish
physical iPhone Safari keyboard behavior, full pixel equivalence for every
desktop page, or production upload/payment behavior. No production data was
changed during these layout checks.

## Homepage, login and interaction follow-up

- The homepage remains 430 CSS pixels wide without horizontal overflow. Theme,
  language, billing-cycle and footer controls now have at least 44-pixel touch
  targets. These overrides are restricted to the existing mobile breakpoint.
- The login form at 430 pixels uses 16-pixel text in its 44-pixel input controls;
  both inputs remain inside the viewport. Login logic is unchanged.
- Touch emulation reproduced a failed first tap on the model/agent submenu:
  synthetic mouseenter competed with the click toggle. The hover handler now
  defers to click on devices without hover. The same first-tap assertion passed
  after the change, and the model at the end of a 30-item list was selectable.
- At 430 × 520, the previous model flyout started 58 pixels above the viewport.
  The mobile flyout now stays inside its scrollable parent (top 12 pixels),
  bounded by the measured space above the composer control.
- At 390 × 844, all six batch actions remain visible inside the screen with
  44-pixel height. Opening and cancelling deletion retained the selection.
  Type/status filter options also have 44-pixel height.
- Fresh local checks: 1227 frontend tests, 133 storefront tests and 100 auth
  tests passed. Frontend type/build, storefront build and auth type/build passed.
  Auth builds use the existing allowed localhost public origin and inert public
  fixture configuration; an unsupported preview origin was rejected as designed.

Release review covers only these presentation and touch-interaction changes.
The deployment gate pins exact content for the viewport shell, auth stylesheet
and local audit files; auth logic, payment/runtime paths and unreviewed edits
remain rejected. The application diff starts at live production SHA
`d0074e336d743cbc626d9a02050d58f0e2a19ea7`. Main commit `b587a89d` contains only
the exact delivery policy already used by production run `35459344687`. Those
unchanged policy blobs are pinned separately from application UI behavior; later
policy edits still fail the gate. The normal main-only staging restriction,
production reviewer, immutable image checks and rollback remain in force.
