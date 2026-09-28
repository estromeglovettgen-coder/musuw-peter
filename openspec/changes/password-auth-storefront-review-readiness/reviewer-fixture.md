# English reviewer fixture and capture matrix

## Identity boundary

The reviewer identity is a dedicated Musuw account. Its email address and
password are operational credentials and are never part of this fixture, the
repository, screenshots, DOM snapshots, test output, or release evidence.
Credentials live only in the approved macOS Keychain entries and the Paddle
review submission field. The product locale is `en-US` before any workspace
content is created.

All visible reviewer-owned names use this fixed vocabulary:

- Workspace: `Musuw Review Workspace`
- Knowledge base: `Aurora Research Notes`
- Source file: `aurora-observation-guide.md`
- Supporting source: `aurora-maintenance-window.md`
- Conversation: `Aurora evidence review`
- Video source: `aurora-observation-briefing.mp4`

No visible fixture contains customer names, private data, real credentials,
email addresses, billing details, or claims that the demonstration content is
owned by a real organization.

## Knowledge source

The committed source at
`e2e/reviewer-fixtures/aurora-observation-guide.md` is the canonical text
fixture. It is an original product demonstration, not customer data. The
retrieval acceptance prompt is:

> What is the Northstar calibration phrase, and which source states it?

The response must report `ORBITAL SAGE 4826`, remain scoped to the bound
knowledge base, and expose a citation that opens the canonical source. This
unique phrase proves that the answer came through the uploaded and parsed
fixture instead of generic model knowledge.

The video fixture presents the same English-only material in a short title and
caption sequence. It is generated locally from the canonical text, contains no
person, voice identity, customer mark, or private data, and is uploaded once to
the current Production reviewer workspace under its active Paddle Sandbox Pro
entitlement. The normal path uses no per-upload model override. Its retrieval
prompt is:

> According to the video briefing, when should the Northstar calibration be
> recorded?

The expected answer is `after the second horizon scan` with evidence from the
parsed video source. The existing upload later completed through the default
route after exactly one product Retry parsing/Reparse action; the grounded
answer and openable full-MP4 citation now provide observed acceptance evidence.

## Capture settings

- Real deployed product; no mocked API responses or browser overrides.
- Locale `en-US`; browser and account UI visibly English.
- Fixed desktop viewport of 1440 by 1000 CSS pixels and device scale factor 2.
- PNG source captures; no JPEG recompression and no CSS upscaling beyond the
  intrinsic image dimensions.
- Animations, caret blinking, transient toasts, and cursor highlights disabled
  only for deterministic capture; application state and data remain real.
- Browser chrome, automation/debug banners, extensions, developer tools, email,
  OTP, password, recovery token, account identifiers, and unrelated test data
  excluded from every crop.
- Before acceptance, OCR/DOM text is rejected when it contains CJK characters,
  `Musnow`, an email-shaped value, `OTP`, or the obsolete circular mark.

## Screenshot matrix

| Asset | Environment and route | Required visible state | Privacy crop |
| --- | --- | --- | --- |
| Hero product view | Production, new chat | English empty-state composer, Musuw navigation, compact model/effort trigger | Exclude user menu and browser chrome |
| Source library | Production, reviewer knowledge base | `Aurora Research Notes`, canonical source, completed parsing status | Exclude account footer |
| Upload and processing | Production, reviewer knowledge base | English upload confirmation or bounded processing state using a disposable copy | No local path or account identifier |
| Grounded answer and citation | Production, bound conversation | Expected calibration phrase, exact source citation, evidence drawer | Crop before account footer |
| Living Wiki | Production, reviewer knowledge base | English generated Wiki page backed by the canonical source | Exclude account footer |
| Knowledge graph | Production, Wiki graph view | English nodes/edges derived from the reviewer source | Exclude account footer |
| Model and reasoning | Production, new chat | Compact Codex-style model or reasoning list with a real allowed selection | No explanatory overflow or account footer |
| Plans | Production, `/plans` | English Free/Plus/Pro/Max comparison with server-truthful limits | Stop before any checkout personal field |
| Settings | Production, account settings | English General, Usage & billing, or Profile layout without email | Crop or mask identity values before capture |
| Video evidence | Production Paddle Sandbox Pro, reviewer knowledge base/conversation | One no-override upload, completed default-route reparse, grounded answer, and openable full-MP4 citation | No credential, internal host detail, or provider response data |

The storefront uses only the strongest representative product images needed by
its final information architecture. The matrix is the capture inventory, not a
requirement to publish every image on the home page.

## Lifecycle order and cleanup

1. Verify deployed password sign-in, logout, and fresh re-login.
2. Create the English knowledge base and upload the canonical source.
3. Wait for completed parsing, run scoped retrieval, open the exact citation,
   and verify Wiki/graph behavior.
4. Verify model/reasoning and supported tool flows, plans, Paddle handoff, and
   settings without completing a Live transaction.
5. On the current Production Paddle Sandbox Pro reviewer path, upload the
   English video once with no model override. If the provider fails at its
   funding boundary and that boundary is later resolved, use the product's
   Retry parsing/Reparse action exactly once on the existing item; do not upload
   another copy or change models or environments. Verify parsing, retrieval,
   and the full-source citation through the approved default route.
6. Capture the approved matrix after transient acceptance data is removed.
7. Keep only the reviewer fixture intended for ongoing review. The two Markdown
   sources, MP4, and related bound chat are intentionally retained for the
   Paddle reviewer; delete one-off duplicate uploads, unrelated temporary
   conversations, and disposable knowledge bases through authorized product
   actions.
