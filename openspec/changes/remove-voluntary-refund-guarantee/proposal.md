## Why

The public Terms, Refund Policy, and Subscription Policy currently promise a
30-day voluntary refund guarantee. Musuw no longer offers that voluntary
guarantee, while Paddle and non-waivable consumer law may still require or
approve a refund in specific cases.

## What Changes

- State in English and Chinese that Musuw does not offer voluntary or routine
  refunds and that completed transactions are generally final.
- Preserve refunds required by law, Paddle's current Refund Policy, mandatory
  withdrawal rights, and remedies for faulty, misdescribed, or unfit products.
- Keep Paddle as Merchant of Record and the existing buyer-support/refund
  routes; do not change checkout, billing state, or entitlement logic.
- Publish the new effective date and matching sitemap metadata for the three
  changed purchase documents.

## Capabilities

### Modified Capabilities

- `public-legal-consent`: Purchase documents replace the voluntary 30-day
  guarantee with a generally non-refundable policy that preserves mandatory
  rights and Paddle-approved exceptions.

## Impact

- `storefront/src/legalContent.js`
- `storefront/public/sitemap.xml`
- Storefront legal-content and SEO contract tests
- No API, database, Paddle catalog, checkout, or entitlement change
