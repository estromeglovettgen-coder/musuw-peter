# TikHub authentication reference package

Captured from `https://user.tikhub.io/login` on 2026-08-30 into the ignored local directory `.tmp/tikhub-login-package/`. The public deployment contains compiled assets only; attempted `.map` paths resolve to the 3,732-byte SPA `index.html`, not source maps.

| Asset | Bytes | SHA-256 | Use |
| --- | ---: | --- | --- |
| `assets/Login-YACIUmq4.js` | 6,586 | `04506385287bdea8776cc48a22a48e35720840dd3128cc0370c6218cf2869fb0` | DOM order and form geometry reference |
| `assets/AuthSplitLayout-208S6n5n.js` | 131,653 | `26b81705f2f055ab599223819a91d913a4f662c2976e85f496cf125a2cd9c7c9` | desktop/mobile split structure and narrative placement reference |
| `assets/index-BvQG0cpT.css` | 139,776 | `78ca0c3b64a7c068198ea3b197074e2106bbb8329452fba340b4d02f6ac95006` | generated spacing, typography, color, and responsive utility reference |
| `assets/GeistVF-BfrrXRGr.woff` | 28,356 | `1b5ebfb3a01a97343ac96873e6d59a8cb285c66012b6a1ac509cb2765e995ba8` | copied as the proportional auth font |
| `assets/GeistMonoVF-B9bzV8FE.woff` | 31,288 | `b7ac144b394cbd81052d6397ec0c33397977b1d7e9bc095e744e652a378c6fb3` | reference-only; not used by the Musuw auth shell |

The following downloaded compiled files are reference-only and MUST NOT ship verbatim in Musuw:

- `index-CljciQ9q.js`: TikHub application runtime, API clients, routing, identity state, and dashboard code.
- `LiquidEther-D4K-Agkl.js`: compiled reference chunk. Musuw instead ships a locally integrated, lazy-loaded source implementation using the project's React runtime plus Motion and Three.
- customer-service/support/chat chunks or scripts.
- TikHub API endpoints, authentication handlers, local/session-storage keys, logos, and product copy.

Musuw keeps its existing React/runtime and authentication boundary, recreates the observable view structure, and selectively ports the left-panel motion behavior without TikHub API or session code. The ignored capture directory is evidence, not a build input.
