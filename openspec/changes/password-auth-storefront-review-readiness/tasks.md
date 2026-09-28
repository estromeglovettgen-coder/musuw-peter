## 1. Research and contracts

- [x] 1.1 Record first-party evidence from at least twelve mature password/OAuth login and registration surfaces, including their layout, recovery, error, and method-switching contracts.
- [x] 1.2 Record first-party evidence from ClientHub and at least ten mature SaaS/AI storefronts for navigation, product media, contact, pricing comparison, footer, and trust content.
- [x] 1.3 Verify the current Supabase Auth changelog and official password sign-in, sign-up, confirmation, recovery, update-user, redirect allowlist, and error-handling documentation.
- [x] 1.4 Audit current auth, storefront sections, plan facts, public media, metadata, icons, structured data, routes, and release contracts against the three change specs.

## 2. Password authentication

- [x] 2.1 Add failing public-interface tests for password sign-in, registration with and without confirmation, weak password, confirmation mismatch, generic recovery acknowledgement, password update, invalid recovery, and duplicate-submission blocking.
- [x] 2.2 Extend the typed Supabase identity adapter with signInWithPassword, signUp, resetPasswordForEmail, and updateUser while preserving PKCE storage and preventing raw provider errors from crossing the boundary.
- [x] 2.3 Extend AuthRuntime result unions and methods for password login, registration, recovery request, recovery-session completion, and password update using the existing normalization, deadline, and resumeAfterIdentity paths.
- [x] 2.4 Recompose AuthApp into Sign in, Create account, email-code, recovery request, recovery update, confirmation, and status states with complete English and Chinese copy.
- [x] 2.5 Implement visible labels, autocomplete tokens, password visibility controls, inline errors, busy-state exclusion, keyboard behavior, legal notice, mobile layout, dark mode, focus treatment, and reduced motion.
- [x] 2.6 Run auth unit tests, runtime tests, locale/build contracts, typecheck, production build, and focused adversarial regression review for OAuth, OTP, checkout intent, redirect safety, logout, and session continuation.

## 3. Storefront structure and content

- [x] 3.1 Add contract tests that keep the capability marquee, user-story/testimonial content, and footer social links out of the rendered production home while retaining their source modules.
- [x] 3.2 Recompose the home-page information architecture around one split product hero, three differentiated product stories, compact workflow, security/ownership, pricing comparison, FAQ, direct Contact, and legal footer.
- [x] 3.3 Remove feature-level View Plans actions and replace oversized or empty product media frames with bounded responsive compositions that do not repeat the same layout family more than twice.
- [x] 3.4 Rewrite English and Chinese storefront copy from current Musuw capabilities, remove template residue and unverified customer claims, and keep navigation, legal routes, and analytics-stable anchor IDs intact.
- [x] 3.5 Rework Contact with Musuw content using the reference site's direct two-part layout pattern and no copied customer, brand, text, imagery, or proprietary code.
- [x] 3.6 Set the visible copyright exactly to `© 2026 musuw. All rights reserved.` and verify social links are absent from all rendered footer variants.
- [x] 3.7 Replace comparison groups and rows with the enforced Free/Plus/Pro/Max storage, knowledge/document, video, model, AI allowance, connected-knowledge, export, and deletion facts while leaving the comparison UI system unchanged.

## 4. Brand metadata and English product media

- [x] 4.1 Select the repository's canonical Musuw mark and generate required favicon, apple-touch-icon, manifest, Open Graph, and crawlable square-logo variants without introducing a second logo design.
- [x] 4.2 Update canonical metadata, web manifest, JSON-LD Organization logo, Open Graph/Twitter data, sitemap, and static contract tests so no active reference points to the obsolete circular or Musnow mark.
- [x] 4.3 Define the English reviewer fixture and deterministic screenshot matrix for hero, source library, upload/processing, grounded answer/citation, Wiki, graph, model/reasoning, video, plans, and settings.
- [x] 4.4 Capture fresh real product images at a minimum 2x source scale with no Chinese, browser chrome, automation banner, email, OTP, recovery token, secret, or unrelated test data.
- [x] 4.5 Replace every production-referenced obsolete, blurry, Chinese, or Musnow product image and add intrinsic-dimension, aspect-ratio, responsive-size, and no-upscale contracts.

## 5. Reviewer account and paid-path evidence

- [x] 5.1 Verify and apply the minimal Supabase TEST and Production password/confirmation/recovery redirect configuration without changing SMTP credentials or exposing settings values.
- [x] 5.2 Provision one dedicated English reviewer identity in Production and TEST where required, store its generated password only in macOS Keychain, and document rotation without committing or printing the credential.
- [x] 5.3 On the same freshly confirmed disposable Production password account,
  prove initial Free, exactly one Paddle Sandbox Plus monthly checkout, and the
  official same-subscription Pro update through signed deliveries without a
  Live charge, refund, fake webhook, raw SQL mutation, or browser override.
- [x] 5.4 Populate the reviewer workspace with English-only knowledge, source, conversation, and video fixtures that demonstrate real current behavior and contain no private or fictional customer data.
- [x] 5.5 In real Chrome, verify Production password sign-in, logout, re-login, knowledge creation, upload/completed parsing, scoped retrieval, citations, available model/reasoning/tool flows, plans, Paddle checkout handoff, settings, and authorized cleanup.
- [x] 5.6 In the active Paddle Sandbox paid reviewer environment, verify
  server-authorized model access, supported video upload/parsing/indexing/
  retrieval, and relevant plan limits using the same English fixture contract.
  The current reviewer path is Production Sandbox Pro and uses the default
  no-override video route.

## 6. Consolidated verification and release

- [x] 6.1 Run storefront tests, auth tests, frontend tests, Go tests, DocReader tests, typechecks, lint where configured, production builds, static preflight, OpenSpec strict validation, and git diff checks.
- [x] 6.2 Run one consolidated adversarial review covering credential security, account enumeration, redirect/recovery abuse, plan truth, screenshot privacy, SEO assets, responsive layout, dark mode auth, accessibility, performance, and release rollback.
- [x] 6.3 Record non-sensitive verification evidence in this change and reconcile any superseded lifecycle tasks in the previously active OpenSpec changes without claiming unavailable paid-video evidence.
- [x] 6.4 Commit and push main through the existing unique release path, then require terminal success for exact-SHA CI, Cloudflare storefront, immutable GHCR server release, manifests, public revision binding, and health.
- [x] 6.5 Re-run public English auth, storefront, metadata/logo, screenshot, legal, plans, reviewer login, and representative lifecycle smoke against the final deployed revision.
