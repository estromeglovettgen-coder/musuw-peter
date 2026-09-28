> Historical evidence. References to a voluntary 30-day refund guarantee were superseded by `remove-voluntary-refund-guarantee` and are not the current Musuw policy.

# Verification evidence

## 2026-08-24 production disposable E2E (current browser evidence)

- One fresh disposable account completed password sign-up once, confirmation
  once, authenticated-shell entry, logout once, and password re-login once;
  each shell transition succeeded. Credentials and identity values are omitted.
- One `Aurora Research Notes` knowledge base was created with a description.
  Two Markdown sources and one MP4 source completed parsing, summaries,
  chunks, indexes, and citation-backed retrieval. The root directory remained
  visible with one direct file and one first-level `Operations` folder; sidebar
  expanded/collapsed data-equivalence=true.
- The account moved from Free to one monthly Plus checkout and one
  same-subscription native Pro update. Signed delivery groups were `3` and
  `2`, all with attempt count `1` and success=true. Final plan was active
  monthly Pro, credits available=true, the hosted billing portal opened
  read-only=true, and Live charge=false.
- `Gemini 3.7 Flash` and `Claude Haiku 4.5` each completed one independent
  session with a non-empty answer, error=false, and pending=false. The video
  model was `google/gemini-2.5-flash`, with no override and one completed worker
  at retry count zero.
- Two readiness-only chats were deleted and two citation chats were retained.
  The original Aurora fixture, disposable account, and active Pro subscription
  remain intentionally retained. The separate one-copy knowledge base was
  deleted once through the UI; active same-name knowledge bases changed from
  `2` to `1`, the copy was soft-deleted with zero active documents and chunks,
  and the surviving source retained four documents, 36 ready chunks, and 36
  ready indexes with source unaffected=true. Worker terminal success=true and
  worker errors=`0`. Account deletion=false. No new release claim is made here.

## 2026-08-23 production lifecycle and release

- The complete production revision reached terminal success through exact-SHA
  CI, Cloudflare storefront delivery, and immutable-GHCR server delivery.
  Public health and revision probes matched that release.
- Real Chrome acceptance completed the English legal/auth continuation, new
  reviewer password sign-in, knowledge-base creation, English source upload
  and completed parsing, KB-scoped retrieval with citations, model/reasoning
  and supported tool paths, plans/Paddle checkout handoff without a Live
  charge, logout, password re-login, and authorized fixture cleanup.
- The disposable production reviewer knowledge base and conversation were
  deleted through the authenticated product API after evidence capture. The
  reviewer account was retained; no Live payment or refund was created.

## Public English smoke

- `https://musuw.com/` and `/contact` returned 200 English storefront HTML;
  the rendered shell had no Chinese or obsolete Musnow text. The app auth,
  platform, plans, and health entry routes returned 200.
- The four active English product captures returned 200 with `image/jpeg`
  responses and the committed 3024x1898 DPR2 intrinsic dimensions.
- Canonical metadata probes found Open Graph, Twitter, favicon/apple-touch,
  and manifest references. The public root contained no Chinese or Musnow
  text.

## Historical video scope boundary

The earlier supported TEST native-video route reached provider-classified HTTP
402 / `DOCREADER_PARSE_FAILED` without exhausted tenant allowance. No new
service, Live charge, fake event, or manual entitlement mutation was used. This
is retained as a historical failure boundary, not a current blocker: the later
Production default-route reparse completed on the original upload after the
OpenRouter parent account satisfied the provider's required funding boundary.
The detailed parse, retrieval, citation, and retention evidence lives in the
OpenRouter and reviewer-readiness changes.

## 2026-08-23 policy hardening (deployed)

- The bilingual legal source now identifies Paddle as Merchant of Record,
  links Paddle Buyer Terms, Refund Policy, and buyer support, and describes
  recurring billing and cancellation using the provider's current routes.
- Musuw publishes a 30-day money-back guarantee aligned with Paddle's Seller
  Handbook recommendation and Paddle's rule preserving additional supplier
  rights, while avoiding an unverified support response deadline. The privacy
  text avoids asserting an unsupported controller role.
- Storefront build and all 53 storefront tests passed locally. The policy
  hardening was then delivered by the current exact-revision CI, Cloudflare
  storefront, and Tokyo server paths; each reached terminal success. Public
  home, contact, auth, platform, plans, and health smoke probes returned HTTP
  200, and runtime revision probes matched the deployed release.
- A verified public support phone is still not evidenced. No number is
  invented or published; support email and the current buyer-support links
  remain the only evidenced channels. This remains an explicit Paddle
  review-risk gap.

## 2026-08-23 current Paddle re-verification and footer correction (local)

- Current Paddle primary sources were rechecked at the official Seller
  Handbook, Domain Review, Buyer Terms, Refund Policy, and paddle.net buyer
  support routes:
  - <https://www.paddle.com/seller-guides/seller-handbook>
  - <https://www.paddle.com/help/start/account-verification/what-is-domain-verification>
  - <https://www.paddle.com/legal/buyer-terms>
  - <https://www.paddle.com/legal/refund-policy>
  - <https://paddle.net/>
- The existing bilingual legal source already retains Paddle's exact required
  English Merchant-of-Record sentence, the voluntary 30-calendar-day refund
  guarantee, automatic-renewal and end-of-period cancellation disclosure,
  Paddle Buyer Terms and Refund Policy links, and paddle.net buyer support.
  The public home/footer already expose clear product, price, Terms, Privacy,
  Refund, and Contact routes. No unsupported support-response deadline was
  found, so no policy text was rewritten.
- The adjacent rendered-footer contract failed first against the historical
  pre-correction `© 2026 Musuw.` value, then passed after both locale sources were changed to
  the exact shared line `© 2026 musuw. All rights reserved.` The production
  storefront build and all 53 storefront tests then passed.
- Final repository checks passed: strict OpenSpec validation reported 14 of 14
  changes valid, and `git diff --check` reported no whitespace errors.
- Paddle's current Seller Handbook asks sellers to publish both a buyer-support
  email and phone number. No verified public business phone is evidenced in the
  repository or authorized source. Task 1.6 therefore remains unchecked; no
  phone, address, or KYC identity is fabricated, and the existing support email
  plus official buyer-support routes remain the only published channels.
- This correction is local and uncommitted. It does not claim a new CI run,
  push, deployment, Live Paddle authorization, payment-logic change, price
  change, or checkout change.

## 2026-08-23 current deployed legal release

- The preceding local-only boundary is retained as historical evidence. The
  correction is now included in the selected revision: all seven CI jobs reached
  terminal success on the first run, followed by terminal-success Cloudflare
  storefront and Tokyo production deliveries.
- Both storefront domains returned HTTP 200 in English and Chinese and rendered
  the exact footer `© 2026 musuw. All rights reserved.` All eight public legal
  routes returned HTTP 200, and the Merchant-of-Record, refund, cancellation,
  and buyer-support links were present and reachable.
- The primary domain had one transiently unsuccessful first probe. Its bounded
  retry returned HTTP 200, and the complete follow-up probe group passed without
  a blocker.
- A verified public support phone is still not evidenced, so task 1.6 remains
  unchecked. Paddle remains the complete Sandbox unit; no Live authorization or
  billing-path change is claimed.

## 2026-08-24 Paddle payment-link and URL-use correction (local)

- Paddle's official default-payment-link, transaction-query, and Paddle.js
  guidance were rechecked at
  <https://developer.paddle.com/build/transactions/default-payment-link/>,
  <https://developer.paddle.com/build/transactions/pass-transaction-checkout/>,
  and <https://developer.paddle.com/paddle-js/about/include-paddlejs/>. The
  public `/pay` page initializes the existing `@paddle/paddle-js` integration
  and leaves `_ptxn` handling to Paddle.js; it does not parse the transaction
  query or call `Checkout.open()`.
- The exact anonymous GET returns only `configured`, normalized `environment`,
  and `client_token`. It reuses the existing complete `Configured()` plus
  `PortalConfigured()` checks, so a missing API key, webhook secret, or catalog
  price fails closed before Paddle.js is initialized; API keys, webhook
  secrets, price IDs, tenant IDs, and checkout bindings are never returned.
- A fresh local Chrome profile with no Musuw token opened
  `/pay?_ptxn=txn_local_contract_probe` against a fail-closed mock config and
  rendered the payment-link error and home/support/legal exits without an auth
  handoff. The automated route contract also proves the anonymous exit occurs
  before session hydration and the generic authentication gate.
- Exhausting the existing five signed-webhook entitlement polls now ends the
  loading state and offers the existing safe-return path plus a status refresh.
  The frontend never grants a plan; the signed webhook and current-entitlement
  response remain authoritative.
- URL import now carries the same short ownership/authorization,
  private-indexing, and no-streaming-download/no-redistribution boundary in all
  four application locales. Only the matching English and Chinese Acceptable
  Use Policy section was supplemented; the rest of the legal suite was not
  expanded.
- Red-first contracts failed for the absent public config route/page, URL-use
  disclosure, sync-timeout exit, and incomplete-server-config boundary, then
  passed after the minimal implementation. Fresh verification passed the full
  Vue test suite, type check, production build, all 53 storefront tests/build,
  affected Go tests, Go vet and server build, the tracked secret scan, the
  WeKnora v0.7.2 source-manifest check, and the production static contract.
- Support phone task 1.6 remains open. This work is local and uncommitted; it
  made no Paddle Dashboard/default-link change, Live authorization, payment,
  refund, provider-state mutation, push, or deployment.

## 2026-08-24 Paddle domain-review handoff and video boundary (local)

- Paddle's current official Account Verification page separates domain review,
  business verification where applicable, and identity verification. The
  Domain Review page requires a clear product, pricing, included features,
  navigable Terms/Refund/Privacy, operator or sole-proprietor brand, and HTTPS;
  it may request a test account for a login-only subdomain.
- The Seller Handbook separately requires buyer-support email and phone. A
  phone is not listed as a standalone Domain Review form field, so it is not
  represented as a technical submission gate; its absence remains a concrete
  policy/approval risk and task 1.6 stays open. No phone, address, business
  identity, or verification fact was inferred or fabricated.
- A red-first bilingual legal contract added the matching video boundary:
  uploads are for private analysis of content the user owns or is authorized to
  use, not a public hosting, streaming, downloading, or redistribution service.
  This complements the existing URL-import boundary without denying that the
  private source must be stored and processed for the requested product flow.
- `docs/PADDLE_LIVE_READINESS.md` now gives a credential-free handoff covering
  the public-product main domain and authenticated app domain, normal
  `/checkout` versus transaction/default-link `/pay`, secure reviewer-account
  delivery, the support-phone risk, and the post-approval order for Dashboard
  commercial settings, payout details, six Live recurring prices, client/API
  credentials, exact notification destination, default payment link, edge
  allowlisting, Retain, atomic release, signed no-charge proof, and only then a
  separately authorized real-payment test.
- Historical handoff and local-admin documents now state that an official Live
  API read proves connectivity only, not account/domain approval or authority
  to deploy Live. The metadata registry precisely distinguishes the app
  `/pay` default-link surface from storefront plan handoff and app checkout.
- The public deployment still returns success for the required product/legal
  routes, but this new legal sentence and code work are local and therefore are
  not claimed as deployed. Storefront passed its production build and all 53
  tests; the broader frontend, Go, preflight, secret, registry, OpenSpec, and
  diff checks are recorded in the entitlement verification.
- No domain/Live application was submitted and no Paddle Dashboard object,
  provider status, real charge, refund, commit, push, or deployment changed.

## 2026-08-27 authorized support-phone publication

- The owner supplied and explicitly authorized the real public buyer-support
  phone. The unique `LEGAL_OPERATOR` source now publishes it only in the
  English and Chinese Contact support block, with the visible international
  format and a normalized `tel:` action; no duplicate footer, secret registry,
  address, KYC identity, or payment field was added.
- Red-first legal-content and rendered-storefront contracts failed before the
  phone existed, then passed after the minimal implementation. The complete
  storefront production build and all 54 storefront tests passed, as did the
  tracked secret scan and diff check.
- Exact-revision CI and Cloudflare storefront delivery for the phone revision
  reached terminal success. A real Chrome session then rendered both localized
  Contact pages and verified the visible number and matching clickable `tel:`
  link. Task 1.6 is complete.
- This publication made no Paddle credential, catalog, destination, checkout,
  entitlement, real payment, refund, payout, bank, or provider-state mutation.
