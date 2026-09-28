## Why

Musuw needs a durable reviewer account that can sign in without mailbox access,
and the public site must explain the real product through clear English content,
current high-resolution product evidence, and an accurate comparison of the
available plans. The current OTP-only reviewer path and inherited marketing
sections create avoidable friction for Paddle review and understate the product.

## What Changes

- Add secure email-and-password sign-in, sign-up, password recovery, and
  password-update states through the existing Supabase Production Auth project.
  Keep Google OAuth and email OTP as parallel entry methods.
- Recompose the auth entry as a conventional single-focus surface with explicit
  sign-in and registration paths, inline recovery, direct Terms and Privacy
  notice, complete error recovery, and no consent checkbox gate.
- Create one dedicated English-only reviewer account and fixture workspace for
  screenshots and production lifecycle acceptance. The account must not depend
  on access to a private mailbox for routine reviewer sign-in.
- Reframe the storefront around the real Musuw job: turn private source files
  into searchable, explainable knowledge with citations, Wiki, graph, model
  choice, and lifecycle control.
- Hide, without deleting source assets, the horizontal capability marquee,
  unverified user-story content, and footer social links. Remove repeated
  `View Plans` actions from feature sections.
- Replace oversized or empty feature media frames with bounded, responsive
  compositions that use real English product captures at native sharpness.
- Preserve the pricing UI but replace weak comparison copy with capability
  groups and plan distinctions derived from server-enforced entitlements.
- Rework Contact using the reference site's simple direct-contact composition,
  while retaining Musuw branding and truthful support channels.
- Publish the footer copyright exactly as `© 2026 musuw. All rights reserved.` and repair favicon,
  manifest, structured-data, Open Graph, and search-logo brand assets.
- Replace obsolete or Chinese product captures with a complete English-only
  reviewer screenshot set generated from the dedicated account.
- Validate paid-plan behavior without creating a new Live charge or refund.
  Use the active Paddle Sandbox Pro reviewer path or an existing verified
  signed-event/test-entitlement path; Paddle Live remains unauthorized.

## Capabilities

### New Capabilities

- `review-ready-authentication`: Google, email OTP, and secure email-password
  account flows share one mature auth surface with recovery and legal notice.
- `review-ready-storefront`: The public site presents truthful product value,
  plan comparison, contact, English product media, concise footer, and correct
  searchable brand metadata.
- `review-account-lifecycle`: A dedicated English reviewer account can exercise
  the supported product lifecycle and paid-plan evidence without an unauthorized
  Live billing mutation.

### Modified Capabilities

<!-- None. Repository-level capability specs have not been archived into openspec/specs. -->

## Impact

- `auth/` state machine, Supabase client calls, localization, styles, and tests.
- Supabase Production Auth provider configuration, redirect/recovery URLs, and
  one reviewer credential stored only in an approved secret location.
- `storefront/` information architecture, content data, home components, CSS,
  public media, metadata, icons, sitemap/robots behavior, and contract tests.
- Existing consumer plan, Paddle, OpenRouter, WeKnora, Cloudflare, GHCR, and
  exact-SHA release paths. No new identity provider, billing provider, database,
  marketing CMS, analytics stack, or deployment protocol is introduced.
