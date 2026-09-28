#!/usr/bin/env bash
# Static contract for the browser-direct R2 upload CORS policy.
# This test is intentionally offline and never reads credentials or contacts a
# provider. Runtime mutation is a separate, explicitly invoked operator step.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
configure="$repo_root/scripts/r2-cors/configure.sh"

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

command -v jq >/dev/null 2>&1 || fail 'jq is required for the R2 CORS contract'
[ -x "$configure" ] || fail 'R2 CORS configure helper is not executable'

# Keep each bucket exact and deliberately narrow. The browser only sends
# signed PUTs and reads ETag; no wildcard origins/headers or destructive
# methods belong in a private presigned-upload bucket policy. Staging and
# production intentionally use separate files so an origin cannot be granted
# access to the other environment's bucket.
for environment in staging production; do
    policy="$repo_root/scripts/r2-cors/$environment.json"
    [ -f "$policy" ] || fail "R2 CORS policy is missing: $environment"
    case "$environment" in
        staging) expected_origin='https://staging.musuw.com' ;;
        production) expected_origin='https://app.musuw.com' ;;
    esac
    jq -e --arg expected_origin "$expected_origin" '
      type == "object" and
      (.rules | type == "array" and length == 1) and
      (.rules[0].allowed | type == "object") and
      (.rules[0].allowed.origins == [$expected_origin]) and
      (.rules[0].allowed.methods == ["PUT"]) and
      (.rules[0].allowed.headers == ["Content-Type"]) and
      (.rules[0].exposeHeaders == ["ETag"]) and
      (.rules[0].maxAgeSeconds == 3600) and
      ([.rules[0].allowed.origins[] | select(test("^https://(staging\\.musuw\\.com|app\\.musuw\\.com)$"))] | length == 1) and
      ([.rules[0].allowed.methods[] | select(. == "PUT")] | length == 1) and
      ([.rules[0].allowed.headers[] | select(. == "Content-Type")] | length == 1)
    ' "$policy" >/dev/null || fail "R2 CORS policy is broader than the direct-upload contract: $environment"
done

# The helper must use the official Wrangler bucket CORS command and must not be
# wired into either release workflow (the existing deploy tokens are not known
# to have R2 bucket-configuration permission).
grep -Fq 'r2 bucket cors set' "$configure" || fail 'R2 CORS helper does not use Wrangler bucket CORS'
grep -Fq 'r2/buckets/' "$configure" || fail 'R2 CORS helper does not verify through the Cloudflare API'
grep -Fq 'staging.json' "$configure" || fail 'R2 CORS helper does not select the staging policy'
grep -Fq 'production.json' "$configure" || fail 'R2 CORS helper does not select the production policy'
if grep -qE 'deploy-production|deploy-storefront' "$configure"; then
    fail 'R2 CORS helper must remain outside production release workflows'
fi
for workflow in "$repo_root/.github/workflows/deploy-production.yml" "$repo_root/.github/workflows/deploy-storefront.yml"; do
    [ -f "$workflow" ] || fail "release workflow is missing: $workflow"
    if grep -Fq 'scripts/r2-cors/configure.sh' "$workflow"; then
        fail "release workflow must not mutate R2 CORS: $workflow"
    fi
done

printf '%s\n' 'R2 browser-direct-upload CORS contract green'
