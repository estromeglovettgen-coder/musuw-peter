# Storefront source

`storefront/` is Musuw's owned React/Vite homepage for `musuw.com` and
`www.musuw.com`. It is a static public surface only: it has no account,
provider-key, checkout, or entitlement authority.

Product actions use the bounded entry URL implemented in
[`src/productHandoff.js`](src/productHandoff.js):
`https://app.musuw.com/auth/start`.

The authenticated application, Google/email-OTP flow, and WeKnora OIDC session
are owned by the application source and `auth/`, not by this package.
