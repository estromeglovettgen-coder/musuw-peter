# Research and product audit

> This is historical launch research. The unreleased `adjust-consumer-plan-limits` change supersedes the numeric storage matrix and Free allowance below; the original observations remain unchanged.

## First-principles decision

The reviewer job is not "discover every authentication method." It is to enter
the same stable product repeatedly, without mailbox access, and verify that the
public claims match the authenticated experience. The public visitor job is not
"read every capability." It is to understand the value, inspect real product
evidence, compare plans, and find trust, contact, and legal information quickly.

The smallest complete solution is therefore:

1. Keep Google and email OTP as proven alternatives.
2. Add Supabase-native password sign-in, registration, and recovery to the same
   identity and WeKnora continuation boundary.
3. Give the reviewer one dedicated English credential and deterministic English
   product workspace.
4. Remove visible template filler and repeated conversion actions.
5. Replace generic claims with real product captures and enforced plan facts.
6. Keep current services, routes, UI stack, billing provider, and release path.

## Authentication references

| Product | First-party source | Observed reusable contract |
| --- | --- | --- |
| Google | https://accounts.google.com/ | Identifier-first flow, Create account and recovery adjacent to the primary action, verification follows password when required. |
| Microsoft | https://support.microsoft.com/en-US/accounts-billing/manage/how-to-sign-in-to-a-microsoft-account | Account identifier then password, Create account and Forgot password remain explicit, recovery uses verified channels. |
| Apple | https://account.apple.com/sign-in | Sign in and Create Apple Account share one identity surface, trusted-device verification and separate account recovery are first-class. |
| GitHub | https://github.com/login and https://github.com/signup | Password, Forgot password, passkey/social alternatives, and Create account stay inside one focused card family. |
| Notion | https://www.notion.com/login and https://www.notion.com/help/log-in-and-out | Email-first routing can select password, verification code, social, SAML, or passkey without placing every form on one screen. |
| Slack | https://api.slack.com/signin and https://slack.com/intl/en-gb/help/articles/212681477-Sign-in-to-Slack | Email code is a primary alternative, social providers are prominent, workspace/SSO options remain secondary. |
| Figma | https://help.figma.com/hc/en-us/articles/360040047614-Authenticate-with-Google | Email/password, Google, and enterprise SSO can coexist under organization policy. |
| Dropbox | https://www.dropbox.com/login and https://help.dropbox.com/security/password-reset | Google and Apple precede email/password; registration and recovery are explicit; social-only identities can add a password later. |
| Atlassian | https://id.atlassian.com/login and https://support.atlassian.com/atlassian-account/docs/log-in-to-your-atlassian-account/ | Email-first routing selects password, passkey, one-time code, or SSO; account creation and Can't log in stay adjacent. |
| ChatGPT | https://chatgpt.com/auth/login and https://help.openai.com/en/articles/4936828-how-do-i-change-my-account-password-.gz | Email/phone routes to password or social providers; wrong-method and social-only identities receive bounded recovery guidance. |
| Linear | https://linear.app/login and https://linear.app/docs/login-methods | Google, magic link/code, passkey, and SAML demonstrate that OTP remains a useful quiet alternative even without local passwords. |
| Zoom | https://zoom.us/signin and https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062436 | Email/password is primary, social methods follow, registration and password reset are distinct and verified. |

Cross-product result: one card, one current mode, social first, divider,
email/password, Forgot password beside the password field, a quiet OTP or SSO
alternative, and a Sign up / Sign in switch at the card edge. Provider failures
are bounded and legal notice is informational rather than a submission gate.

## Supabase authority

- Password guide: https://supabase.com/docs/guides/auth/passwords
- Password sign-in: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- Sign-up: https://supabase.com/docs/reference/javascript/auth-signup
- Reset request: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- Redirect allowlist: https://supabase.com/docs/guides/auth/redirect-urls
- Email templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Changelog index: https://supabase.com/changelog.md

Verified implementation facts:

- `signInWithPassword({ email, password })` is the current JavaScript call.
- `signUp({ email, password, options: { emailRedirectTo } })` may return a user
  with no session when confirmation is enabled.
- `resetPasswordForEmail` intentionally does not reveal account existence.
- A valid recovery session calls `updateUser({ password })`.
- Hosted projects commonly require email confirmation, and production sign-up,
  OTP, and recovery require mature custom SMTP.
- Redirects must match the project allowlist. The current PKCE client has
  `detectSessionInUrl: false`, so the Musuw runtime must exchange the returned
  code explicitly and guard it against replay.
- The installed `@supabase/supabase-js` version is 2.112.2. No new public or
  secret environment variable is needed for password auth.

The final implementation uses the existing trusted `/auth/callback` and extends
its one-time opaque flow payload with `oauth`, `signup`, or `recovery`. Supabase's
PKCE `sb_flow_id` query value remains available to the SDK. OAuth and sign-up
resume WeKnora after exchange; recovery exchange enters the password-update
state and resumes only after a successful update.

## Storefront and pricing references

| Product | First-party sources | Relevant pattern |
| --- | --- | --- |
| ClientHub | https://clienthub.framer.website/ | Reference hierarchy, whitespace, product-media cards, comparison, FAQ, and direct contact treatment only. No source, brand, testimonial, image, or metric is copied. |
| OpenAI | https://openai.com/ and https://openai.com/pricing/ | Product-first hero, separate security/contact paths, grouped comparison. |
| Anthropic | https://www.anthropic.com/ and https://claude.com/pricing | Short plan cards followed by model, usage, payment, security, and support groups. |
| Notion | https://www.notion.com/product and https://www.notion.com/pricing | Named capability stories tied to product media, then grouped plan features. |
| Linear | https://linear.app/ and https://linear.app/pricing | Concise product narrative, specific quantities in a long but grouped comparison, routed contact categories. |
| Perplexity | https://docs.perplexity.ai/ | Official docs were available while consumer marketing routes were blocked; no inaccessible marketing claim is inferred. |
| Glean | https://www.glean.com/ and https://www.glean.com/platform/security | Trust-first AI product story with explicit data and model boundaries. |
| Dropbox | https://www.dropbox.com/ and https://www.dropbox.com/contact-sales | Product tasks are paired with real media; contact explains the route before collecting information. |
| Slack | https://slack.com/ and https://slack.com/pricing | Pricing cards followed by productivity, AI, automation, security, and compliance groups. |
| Figma | https://www.figma.com/ and https://www.figma.com/pricing/ | Plan dimensions are explained before comparison; security and contact remain first-class routes. |
| Atlassian | https://www.atlassian.com/ and https://www.atlassian.com/company/contact | Contact is routed by intent and Trust is a stable information-architecture destination. |
| GitHub | https://github.com/pricing | Plan cards use concrete limits and grouped code, automation, security, and support capabilities. |

Pricing cross-check also used official ChatGPT, Canva, Grammarly, and ClickUp
pricing pages. The common useful pattern is short cards plus a grouped matrix
whose cells contain concrete quantities or clear availability. Empty promises
such as "advanced tools," unsupported team administration, and unimplemented
priority support are removed.

## Repository audit

### Auth

- `auth/src/AuthApp.tsx` currently supports Google and email OTP only.
- `auth/src/runtime.ts` already owns normalization, deadlines, opaque flow,
  one-time callback exchange, native-session checks, and WeKnora continuation.
- `auth/src/supabase.ts` is the correct thin SDK adapter seam.
- `auth/src/config.ts` correctly limits the browser to four public values.
- The generic `/auth/` production shell fallback already serves recovery and
  confirmation states, but the existing exact `/auth/callback` is sufficient
  when the opaque flow includes a kind.

### Storefront

- `HomePage.jsx` currently renders capability ticker, four oversized Feature
  stories, Testimonials commitments, Blog previews, FAQ, CTA, and footer.
- `HomeSections.jsx` repeats `View Plans` in every feature story and uses fixed
  card heights that create large empty media areas.
- `SiteChrome.jsx` renders X and email social icons in every footer.
- `homeContent.js` contains 12 commitment cards that must remain out of the DOM,
  plus comparison rows for unsupported shared administration and priority
  support.
- `i18n.js` contains the repeated feature CTA, inaccurate annual savings label,
  and the old long copyright string.
- `legalContent.js` already contains truthful Support, billing/refund,
  privacy/security, and merchant-review contact information, so no new lead form
  or SLA is needed.

### Product facts

The server entitlement source is `weknora/internal/types/entitlement.go`:

- Free: 5 GiB, USD 1.00 monthly provider allowance, one knowledge base, ten
  documents, no video, and one least-cost built-in model per capability.
- Plus: 20 GiB and USD 1.25.
- Pro: 40 GiB and USD 2.50.
- Max: 80 GiB and USD 5.00.
- Paid plans have no plan-specific knowledge-base/document cap, video access,
  and an expanded platform-approved built-in catalog. This is not arbitrary
  model access, BYOK, or a promise that every configured model is available.
- Grounded dialogue, citations, Wiki, graph, export, and deletion are shared
  product capabilities, not paid-only marketing claims.

### Media and search brand

The four active home images are 1305 by 726 Chinese Musnow captures and must be
replaced. Additional stale public ClientHub/Acme images are copied by Vite even
though the current React source does not reference them. They cannot be reused.

`storefront/index.html` has no root favicon, manifest, apple-touch icon,
Open Graph image, Twitter card, or JSON-LD organization logo. The current square
`storefront/public/images/musuw-logo.png` matches the auth and application mark,
while `weknora/frontend/public/favicon.ico` is the matching small icon. Missing
canonical root assets are the most likely reason a search engine can retain an
old or fallback circular favicon. Search recrawl remains externally delayed.
