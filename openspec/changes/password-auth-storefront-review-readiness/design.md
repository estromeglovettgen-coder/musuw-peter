## Context

Musuw currently has a dedicated React auth shell backed by the same Supabase
Production Auth project used for Google OAuth and email OTP. The shell owns the
Supabase identity session and then resumes the existing OAuth 2.1 continuation
into WeKnora. It deliberately does not own tenants, plans, or product data.

The storefront is a React/Vite application deployed through the existing
Cloudflare Worker release. Its content is mostly data-driven, but several
sections still inherit the reference template's density and media geometry.
Some public images show an older Chinese Musnow product and are rendered into
large low-information frames. Pricing UI already exposes four plans, while the
comparison strings do not yet mirror the server-enforced entitlement model.

Paddle review needs stable credentials and an English product environment.
Routine reviewer login cannot depend on reading a private mailbox. Credentials
and any test-account recovery material remain outside the repository. Production
must not receive a new Live charge or refund during this work.

## Goals / Non-Goals

**Goals:**

- Reuse Supabase Auth for password sign-in, registration, email confirmation,
  recovery, and password update without adding another identity service.
- Preserve Google OAuth, email OTP, checkout intent, and the current hardened
  OAuth continuation into the WeKnora application.
- Make the public auth page recognizable as a mature sign-in surface with one
  focused card, explicit sign-in/register modes, stable recovery states, and
  localized direct legal notice.
- Produce a concise, truthful storefront for foreign review using only current
  capabilities and sharp English product captures.
- Use one dedicated English reviewer identity on the deployed Production path.
  Its current paid reviewer path is Paddle Sandbox Pro; any older TEST Max
  evidence is historical only. Paddle Live remains unauthorized and is never
  used for this change.
- Retain the exact-SHA CI, Cloudflare, GHCR, and server release protocol.

**Non-Goals:**

- No custom password database, password hashing, identity proxy, new auth
  provider, account-linking database, or service-role key in browser code.
- No redesign of the authenticated application beyond what is needed to create
  accurate English screenshot fixtures.
- No fabricated customers, testimonials, metrics, capabilities, plan benefits,
  discounts, or support commitments.
- No copy of proprietary source code, brand assets, customer content, or
  copyrighted imagery from ClientHub or another company. Public layout patterns
  may be reproduced with Musuw components and assets.
- No new Live Paddle payment, refund, coupon, or manual database plan mutation.
- No deletion of the hidden legacy marketing components or source images in
  this change. They remain available for later reconsideration.

## Decisions

### 1. Extend the existing identity boundary

`IdentityClient` will expose thin typed adapters for Supabase's current
`signInWithPassword`, `signUp`, `resetPasswordForEmail`, and `updateUser`
methods. `AuthRuntime` will normalize email input, apply request deadlines, map
provider errors into a bounded view union, and call the existing
`resumeAfterIdentity()` only after a real session exists.

This preserves the critical architecture: Supabase remains authoritative for
credentials and session issuance, while the runtime remains authoritative for
safe continuation into WeKnora. Calling Supabase directly from `AuthApp` was
rejected because it would duplicate normalization, timeout, continuation, and
failure mapping inside the view.

### 2. Use explicit auth modes, not a single overloaded form

The entry card will default to Sign in. It will present Google first, then an
email/password form, a Forgot password action, and a quiet `Use an email code`
alternative. A direct `Create account` action switches the same card to a
registration mode. Registration has email, password, confirm-password, and a
clear return to Sign in. No checkbox blocks any action; the Terms and Privacy
notice stays directly below the identity controls.

Separate route-safe states cover registration confirmation, password-reset
request acknowledgement, recovery callback/password update, email OTP entry,
and terminal status. This is simpler and more accessible than placing password,
OTP, registration, and recovery controls on one screen.

### 3. Keep account-enumeration and credential failures bounded

Visible errors use stable localized categories such as invalid credentials,
weak password, mismatched confirmation, unavailable network, and expired
recovery. Registration, unconfirmed-account, and recovery outcomes do not expose
whether an address exists. Provider messages and secrets are not rendered.
Busy states disable competing actions, inputs use appropriate autocomplete
tokens, password reveal controls have labels, and password values are cleared on
every terminal or mode-switch path.

Supabase's PKCE verifier must survive the common case where a confirmation or
recovery email opens in a new browser tab. The browser therefore routes only the
SDK's exact PKCE verifier keys, plus the opaque signup/recovery flow descriptor,
through a ten-minute shared-storage envelope. Supabase session, access token,
refresh token, email, and password data remain in session-scoped storage or the
live form. The SDK-provided `sb_flow_id` selects one exact verifier slot; missing,
wrong, expired, or replayed identifiers fail closed and successful exchange
removes the shared material. Recovery then replaces the one-time callback URL
with `/auth/recovery` and uses a short session-only marker plus a real Supabase
session to support a safe refresh before password update.

### 4. Provision reviewer identity without repository credentials

The reviewer address and generated password will be stored in macOS Keychain
and in the user's chosen Paddle review credential field only. They will not be
committed, printed, put in screenshots, or copied into browser-visible fixture
content. The account's visible profile, workspace, knowledge bases, document
titles, prompts, responses, and screenshot state will be English only.

The current reviewer identity is exercised on the deployed Production path,
whose active paid entitlement is Paddle Sandbox Pro after the official Sandbox
checkout/update lifecycle. Older TEST Max evidence remains a historical record
and is not substituted for the current path. All paid model/video checks use
server-reported entitlement and the default no-override model route; Paddle
Live remains forbidden without a separately reviewed authorization change.

### 5. Recompose the existing storefront instead of changing stacks

The current React/Vite, CSS, Switzer font, Phosphor icon, localization, and
Cloudflare Worker stack remains. No design-system or animation dependency is
added. The design language remains a calm light canvas, off-black text, one blue
accent, soft cards only where they represent product media, and restrained
reveal motion with reduced-motion support.

The target information architecture is:

1. Navigation and split product hero
2. A short product proof strip or static capability summary
3. Three differentiated product stories using real English captures
4. A compact `How it works` sequence
5. Security and ownership summary
6. Pricing cards and an accurate grouped comparison
7. Focused FAQ
8. Direct Contact composition
9. Compact legal footer

The horizontal capability marquee and user-story/testimonial grid remain in
source but are gated off. Repeated feature-level plan buttons are removed. Each
product story gets a bounded aspect-ratio media frame sized to its real capture;
no empty full-screen rectangle is reserved around a small screenshot.

### 6. Derive pricing comparison from existing entitlement facts

The comparison keeps its current visual component but replaces generic rows
with auditable groups: workspace limits, source ingestion, model access, monthly
AI allowance, connected knowledge, and account/data controls. Values match the
current server contract: Free has 1 GiB, one knowledge base, ten documents, no
video, and the least-cost model set; Plus/Pro/Max have 10/30/100 GiB, larger
monthly allowance, no plan cap on knowledge-base/document count, video, and the
configured paid model catalog. All plans keep grounded chat, citations, Wiki,
graph, export, and deletion. Unsupported team administration and uncommitted
support levels are omitted.

### 7. Treat screenshots as versioned product evidence

Every public product image will be replaced by a fresh PNG or WebP capture from
the English reviewer workspace. Capture names describe the real surface, and
source images are recorded at a minimum 2x rendering scale for their largest CSS
slot. Storefront layout uses `width`, `height`, `aspect-ratio`, and object-fit
rules to avoid upscaling, layout shift, or blurry raster interpolation. Captures
must contain no Chinese text, browser automation banners, email addresses,
secrets, OTPs, recovery tokens, or fictional performance claims.

### 8. Make one canonical brand mark authoritative

The approved Musuw mark will be used consistently for favicon sizes,
apple-touch-icon, web manifest, Open Graph/Twitter media, and JSON-LD
`Organization.logo`. Metadata uses canonical `https://musuw.com` URLs and a
square crawlable logo asset. The obsolete circular inherited icon is no longer
referenced. Search-engine recrawl is external and may lag the release, so the
deployed metadata and Search Console request are the acceptance evidence.

## Risks / Trade-offs

- [Email confirmation or recovery redirect is misconfigured] -> Verify current
  Supabase Production Auth settings and allowlisted URLs, including the SDK's
  appended `sb_flow_id`, before enabling the UI; test same-tab and new-tab
  sign-up, confirmation, reset, update, logout, and sign-in in real Chrome.
- [Password flow weakens the hardened continuation] -> Keep all new provider
  calls behind `AuthRuntime` and reuse `resumeAfterIdentity()`; add regression
  tests for checkout intent, pending authorization, callback safety, and logout.
- [Provider errors reveal account existence] -> Map registration/recovery errors
  to bounded user-facing states and render no raw Supabase error text.
- [A reviewer account becomes a standing privileged credential] -> Use a unique
  generated password, English-only non-sensitive fixtures, least required plan,
  Keychain storage, documented rotation, and no admin or operations capability.
- [Historical TEST Max and current Production Sandbox Pro appear inconsistent]
  -> Label the environment and plan from server truth. Treat the older TEST Max
  run as historical, use the current Production Sandbox Pro path for reviewer
  evidence, and never imply Paddle Live authorization.
- [A reference-site copy creates legal or brand risk] -> Reuse only generic
  layout and interaction patterns; retain Musuw copy, components, icons, assets,
  accessibility, and legal identity.
- [Marketing screenshots become stale] -> Keep a deterministic English fixture
  checklist and asset-to-section contract in tests; regenerate only when the
  represented UI materially changes.
- [Search results retain the old logo after release] -> Verify crawlable assets,
  manifest, JSON-LD, and canonical tags, then request recrawl and report expected
  propagation delay rather than claiming immediate search-index replacement.

## Migration Plan

1. Add failing auth runtime and UI contract tests for password login, sign-up,
   recovery acknowledgement, update, failure mapping, and OTP/OAuth regression.
2. Implement the thin Supabase adapters and auth state machine locally.
3. Verify Supabase TEST settings, exercise all password states, then mirror only
   the required non-secret Production settings and allowlisted URLs.
4. Gate hidden storefront sections, revise IA/copy/comparison, and replace brand
   metadata while preserving routes and legal pages.
5. Provision the English reviewer identity in TEST and Production, store its
   password only in Keychain, and verify routine password sign-in.
6. Use the active Production Paddle Sandbox Pro path, populate English fixtures,
   and capture the approved screenshot set. Retain older TEST Max evidence only
   as explicitly historical; do not create a Live transaction.
7. Run unit, integration, type, build, static contract, accessibility,
   responsive, dark-mode-auth, Lighthouse, and real Chrome lifecycle checks.
8. Commit and push one exact SHA through CI, Cloudflare storefront, and immutable
   server release. Verify public revision, health, metadata, login, and media.

Rollback uses the existing exact-SHA release mechanism. Supabase password UI can
be rolled back independently while Google and OTP remain available. Reviewer
credentials can be rotated or the reviewer user disabled without changing
application data contracts.

## Open Questions

No product decision blocks implementation. The exact public sites and pricing
references, approved square logo source, and Supabase configuration values are
verified during implementation and recorded in the final evidence without
exposing credentials.
