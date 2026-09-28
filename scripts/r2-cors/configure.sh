#!/usr/bin/env bash
# Apply or verify the checked-in R2 browser-direct-upload CORS policy.
#
# This is a one-time/operator action, not part of a release workflow. It uses
# the official Wrangler command for mutation and the Cloudflare REST API for a
# machine-readable read-back. The caller supplies a dedicated Cloudflare API
# token with R2 bucket-configuration permission through the environment; no
# token or R2 S3 secret is read from, printed, or committed by this helper.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

usage() {
    cat >&2 <<'EOF'
Usage:
  scripts/r2-cors/configure.sh verify <staging|production>
  scripts/r2-cors/configure.sh apply  <staging|production>

Required environment (never pass the token as a command-line argument):
  CLOUDFLARE_ACCOUNT_ID   32-character Cloudflare account ID
  CLOUDFLARE_API_TOKEN    dedicated token allowed to view/edit R2 bucket CORS

The apply command expects a locked Wrangler binary at
storefront/node_modules/.bin/wrangler. Install it with `npm ci --prefix
storefront --ignore-scripts`, or set WRANGLER_BIN to an equivalent pinned
Wrangler executable. The existing storefront Worker token may not have the
required R2 bucket-configuration permission; a failed read preflight makes no
mutation attempt.
EOF
    exit 2
}

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

command -v curl >/dev/null 2>&1 || die 'curl is required for Cloudflare API verification'
command -v jq >/dev/null 2>&1 || die 'jq is required for Cloudflare API verification'

[ "$#" -eq 2 ] || usage
action="$1"
environment="$2"
case "$action" in
    verify|apply) ;;
    *) usage ;;
esac
case "$environment" in
    staging)
        bucket='musuw-staging'
        origin='https://staging.musuw.com'
        policy="$repo_root/scripts/r2-cors/staging.json"
        ;;
    production)
        bucket='musuw-production'
        origin='https://app.musuw.com'
        policy="$repo_root/scripts/r2-cors/production.json"
        ;;
    *) usage ;;
esac

[ -f "$policy" ] || die 'R2 CORS policy is missing'

account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
api_token="${CLOUDFLARE_API_TOKEN:-}"
[[ "$account_id" =~ ^[0-9a-fA-F]{32}$ ]] || die 'CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal ID'
[ -n "$api_token" ] || die 'CLOUDFLARE_API_TOKEN is required'
case "$api_token" in
    *$'\n'*|*$'\r'*|*'"'*|*'\\'*) die 'CLOUDFLARE_API_TOKEN contains unsupported characters' ;;
esac

cors_endpoint="https://api.cloudflare.com/client/v4/accounts/$account_id/r2/buckets/$bucket/cors"

fetch_cors() {
    # The response is held in a shell variable and is only queried with jq;
    # this keeps provider responses (and especially auth material) out of logs.
    # Feed the Authorization header through curl's stdin config instead of
    # passing the token in argv, where it could appear in a process listing.
    {
        printf 'url = "%s"\n' "$cors_endpoint"
        printf 'header = "Accept: application/json"\n'
        printf 'header = "Authorization: Bearer %s"\n' "$api_token"
    } | curl --fail --silent --show-error --retry 3 --retry-delay 2 --config -
}

verify_response() {
    local response="$1"
    jq -e --arg expected_origin "$origin" --slurpfile expected "$policy" '
      .success == true and
      (.result | type == "object") and
      (.result.rules | type == "array") and
      # Compare the complete allow-list while ignoring only a provider-added
      # rule id, which is metadata and not a permission.
      ((.result.rules | map({
        allowed: {
          origins: ((.allowed.origins // []) | sort),
          methods: ((.allowed.methods // []) | sort),
          headers: ((.allowed.headers // []) | sort)
        },
        exposeHeaders: ((.exposeHeaders // []) | sort),
        maxAgeSeconds: (.maxAgeSeconds // null)
      })) ==
      ($expected[0].rules | map({
        allowed: {
          origins: ((.allowed.origins // []) | sort),
          methods: ((.allowed.methods // []) | sort),
          headers: ((.allowed.headers // []) | sort)
        },
        exposeHeaders: ((.exposeHeaders // []) | sort),
        maxAgeSeconds: (.maxAgeSeconds // null)
      }))) and
      ($expected[0].rules | length == 1) and
      ($expected[0].rules[0].allowed.origins | index($expected_origin)) != null
    ' <<<"$response" >/dev/null
}

response=""
if ! response="$(fetch_cors)"; then
    die "Cloudflare R2 CORS read preflight failed for $bucket; no mutation attempted"
fi
jq -e '.success == true' <<<"$response" >/dev/null ||
    die "Cloudflare R2 CORS read preflight returned an unsuccessful response for $bucket"

if [ "$action" = verify ]; then
    verify_response "$response" || die "R2 CORS policy mismatch for $bucket"
    printf 'R2 CORS verified: environment=%s bucket=%s origin=%s methods=PUT expose=ETag\n' \
        "$environment" "$bucket" "$origin"
    exit 0
fi

wrangler_bin="${WRANGLER_BIN:-$repo_root/storefront/node_modules/.bin/wrangler}"
[ -x "$wrangler_bin" ] || die 'pinned Wrangler binary is unavailable; run npm ci --prefix storefront or set WRANGLER_BIN'

# The token remains in the process environment, never in argv. Wrangler reads
# CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID itself.
"$wrangler_bin" r2 bucket cors set "$bucket" --file "$policy"

response=""
if ! response="$(fetch_cors)"; then
    die "Cloudflare R2 CORS read-back failed for $bucket after apply"
fi
verify_response "$response" || die "R2 CORS policy read-back mismatch for $bucket"
printf 'R2 CORS applied and verified: environment=%s bucket=%s origin=%s methods=PUT expose=ETag\n' \
    "$environment" "$bucket" "$origin"
