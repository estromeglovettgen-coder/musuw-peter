# R2 browser-direct-upload CORS

[`staging.json`](staging.json) and [`production.json`](production.json) are the
checked-in policies for the private presigned-upload buckets:

- `musuw-staging` accepts `PUT` only from `https://staging.musuw.com`.
- `musuw-production` accepts `PUT` only from `https://app.musuw.com`.
- Both allow the signed `Content-Type` request header and expose `ETag`.

The files stay separate so the staging origin is never granted CORS access to
the production bucket (or vice versa).

The policy is deliberately not part of either application release workflow.
`storefront-production` currently carries a Worker deployment token whose R2
bucket-configuration permission is not established, and the server-side R2 S3
keys are consumed by the app for object I/O; their bucket-configuration
permission is not established either. A failed CORS mutation must therefore
not turn a healthy staging/production release into a meaningless failure.

An operator with a dedicated Cloudflare API token that can view/edit R2 bucket
CORS may apply and read back each bucket once:

```sh
npm ci --prefix storefront --ignore-scripts
export CLOUDFLARE_ACCOUNT_ID='…'       # do not commit or print secrets
export CLOUDFLARE_API_TOKEN='…'         # keep in the shell's protected secret store
scripts/r2-cors/configure.sh apply staging
scripts/r2-cors/configure.sh apply production
```

Use `verify` later for a read-only configuration check. The helper uses
Wrangler for the mutation and the Cloudflare REST API for an exact policy
read-back; it never reads the server R2 secret files or prints a token. After
the change propagates (Cloudflare notes propagation can take up to about 30
seconds), exercise one disposable presigned upload from each origin and confirm
that the browser can read the `ETag` response header. Do not paste presigned
URLs into logs or commit them.
