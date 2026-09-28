## Why

The production sign-in surface does not expose the already-public Terms of
Service and Privacy Policy at the decision point where a person creates or
enters an account. The current local release also contains the completed
consumer work that has not yet passed the repository's exact-SHA production
delivery and a real browser lifecycle check.

## What Changes

- Add a conventional Terms and Privacy continuation notice directly below the
  Google and email sign-in actions, with direct links to the canonical public
  documents in both supported auth locales and no separate checkbox gate.
- Reconcile the existing legal suite with the actual production operators,
  providers, data flows, billing behavior, user-rights channels, and current
  official Google, Paddle, Chinese, EU, and California requirements. Do not
  copy another company's policy or promise capabilities that are not live.
- Ship the complete current `main` through the existing GitHub-triggered
  Cloudflare storefront and immutable-GHCR server release paths.
- Verify the deployed SHA and complete a production browser lifecycle covering
  sign-up/sign-in, knowledge creation and deletion, upload/parse, retrieval and
  chat, plan/billing entry without a real charge, logout, and re-login.

## Capabilities

### New Capabilities

- `public-legal-consent`: Public legal documents and an adjacent auth-entry
  continuation notice accurately disclose the real service and remain
  directly accessible before authentication.
- `production-lifecycle-acceptance`: One exact source revision is delivered
  through the existing production paths and verified through the real user
  lifecycle without destructive production billing activity.

### Modified Capabilities

<!-- None. There are no repository-level OpenSpec capability specs to modify. -->

## Impact

- `auth/` localized login copy, form behavior, styling, and tests.
- `storefront/` legal content and legal-content contract tests.
- Existing GitHub Actions workflows, Cloudflare Worker `musuw-site`, GHCR
  images, restricted server release gate, and `app.musuw.com` runtime.
- No new identity provider, payment processor, legal-document service,
  deployment mechanism, database schema, or production secret path.
