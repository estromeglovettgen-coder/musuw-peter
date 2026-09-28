#!/usr/bin/env bash
# Contract test for the metadata-only external credential registry.
# It never reads a secret, contacts a provider, or scans history/session data.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
registry="$repo_root/docs/external-credentials-registry.yaml"
validator="$repo_root/scripts/ci/verify-external-credentials-registry.sh"

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

[ -f "$registry" ] || fail 'external credential registry is missing'
[ -x "$validator" ] || fail 'external credential registry validator is not executable'

"$validator"

grep -Fq 'provider: paddle' "$registry" || fail 'registry has no Paddle entries'
grep -Fq 'environment: sandbox' "$registry" || fail 'registry has no Paddle Sandbox boundary'
grep -Fq 'environment: live' "$registry" || fail 'registry has no explicit Paddle Live status'
grep -Fq 'status: active' "$registry" || fail 'registry does not record active credential metadata'
grep -Fq 'MUSUW_PADDLE_CLIENT_TOKEN' "$registry" || fail 'registry omits Paddle client token consumer'
grep -Fq 'MUSUW_PADDLE_PLUS_MONTHLY_PRICE_ID' "$registry" || fail 'registry omits Paddle price catalog'
grep -Fq 'paddle_webhook_secret' "$registry" || fail 'registry omits Paddle webhook secret consumer'
grep -Fq 'OPENROUTER_MANAGEMENT_API_KEY' "$registry" || fail 'registry omits OpenRouter management key'
grep -Fq 'SUPABASE_SERVICE_ROLE_KEY' "$registry" || fail 'registry omits Supabase server key class'
grep -Fq 'CLOUDFLARE_API_TOKEN' "$registry" || fail 'registry omits Cloudflare deployment key'
grep -Fq 'MUSUW_PRODUCTION_SSH_PRIVATE_KEY' "$registry" || fail 'registry omits GitHub deployment SSH key'
grep -Fq 'GOOGLE_CLIENT_SECRET' "$registry" || fail 'registry omits Google OAuth consumer class'
grep -Fq 'SMTP' "$registry" || fail 'registry omits SMTP verification status'
grep -Fq 'MUSNOW_PADDLE_API_KEY' "$registry" || fail 'registry omits legacy Paddle fallback alias'
grep -Fq 'id: musuw.legacy-template-and-fallbacks' "$registry" || fail 'registry omits deprecated template boundary'

# Values, rather than metadata, are forbidden. These patterns intentionally
# cover common key/token forms while allowing variable names and safe prefixes.
if grep -qE '(^|[=:])[[:space:]]*(sk|pk|live_|test_|pdl_|pri_|gh[pousr]_|github_pat_|AIza|eyJ)[A-Za-z0-9_.:/+_-]{8,}' "$registry"; then
    fail 'registry appears to contain a credential value'
fi
if grep -qE '(^|[[:space:]])[[:alnum:]_.-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}([[:space:]]|$)' "$registry"; then
    fail 'registry appears to contain an email address'
fi

printf '%s\n' 'external credential registry contract green'
