#!/usr/bin/env bash
# TDD contract for the isolated staging release seam. This test is intentionally
# written before the implementation: it only inspects checked-in text and
# renders Compose with synthetic values; it never contacts Docker, SSH, Paddle,
# Cloudflare, or a live filesystem.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "$script_dir/../.." && pwd -P)"
staging_root="$repo_root/integration/weknora-staging"
server_root="$script_dir/server"

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

required_files=(
    "$staging_root/compose.yaml"
    "$staging_root/compose.edge.yaml"
    "$staging_root/app-entrypoint.sh"
    "$staging_root/staging.env.example"
    "$staging_root/auth-public.env.example"
    "$repo_root/weknora/docker/searxng/settings.yml"
    "$script_dir/lib.sh"
    "$script_dir/capacity-preflight.sh"
    "$script_dir/capacity-preflight.test.sh"
    "$script_dir/prepare-runtime.sh"
    "$script_dir/compose.sh"
    "$script_dir/verify-static.sh"
    "$script_dir/release-ci.sh"
    "$script_dir/verify-deployed.sh"
    "$repo_root/scripts/weknora-staging-deploy.sh"
    "$server_root/musuw-staging-deploy-gate"
    "$server_root/musuw-staging-deploy-ssh-gate"
    "$server_root/bootstrap-musuw-staging-deploy.sh"
    "$server_root/verify-musuw-staging-deploy-gate.sh"
)
for required in "${required_files[@]}"; do
    [ -f "$required" ] || fail "staging contract file is missing: $required"
    [ ! -L "$required" ] || fail "staging contract file is a symlink: $required"
done

deploy_usage="$("$repo_root/scripts/weknora-staging-deploy.sh" 2>&1 || true)"
grep -Fq 'Usage: scripts/weknora-staging-deploy.sh <full-sha>' <<<"$deploy_usage" ||
    fail 'staging runner cannot resolve repository-local helpers'

grep -Fq 'weknora-v072-staging' "$staging_root/compose.yaml" || fail 'staging project identity is not fixed'
grep -Fq '127.0.0.1:${WEKNORA_STAGING_FRONTEND_PORT:-4192}:8080' "$staging_root/compose.yaml" || fail 'staging frontend port is not loopback 4192'
grep -Fq '127.0.0.1:${WEKNORA_STAGING_APP_PORT:-18092}:8080' "$staging_root/compose.yaml" || fail 'staging app port is not loopback 18092'
grep -Fq 'MUSUW_DEPLOYMENT_ENVIRONMENT: staging' "$staging_root/compose.yaml" || fail 'staging deployment selector is missing'
grep -Fq 'MUSUW_PRODUCT_EDITION: lite' "$staging_root/compose.yaml" || fail 'staging product edition is not explicitly Lite'
grep -Fqx 'MUSUW_PRODUCT_EDITION=lite' "$staging_root/staging.env.example" || fail 'staging product edition fixture is missing'
grep -Fq 'MUSUW_PRODUCT_EDITION' "$script_dir/prepare-runtime.sh" || fail 'staging runtime does not carry the Lite product edition'
grep -Fq 'MUSUW_PADDLE_ENVIRONMENT: sandbox' "$staging_root/compose.yaml" || fail 'staging Paddle selector is not Sandbox'
grep -Fq 'OPENROUTER_WORKSPACE_ID: ${OPENROUTER_WORKSPACE_ID:?set OPENROUTER_WORKSPACE_ID}' "$staging_root/compose.yaml" || fail 'staging OpenRouter workspace is not required'
grep -Fq 'OPENROUTER_WORKSPACE_ID=00000000-0000-4000-8000-000000000001' "$staging_root/staging.env.example" || fail 'staging OpenRouter workspace fixture is missing'
grep -Fq 'openrouter-workspace-id' "$script_dir/prepare-runtime.sh" || fail 'staging OpenRouter workspace is not pinned by the server runtime'
grep -Fq 'WEKNORA_STAGING_SEARXNG_CONFIG_VOLUME=weknora-v072-staging-searxng-config' "$staging_root/staging.env.example" || fail 'staging SearXNG config volume fixture is missing'
grep -Fq 'image: busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662' "$staging_root/compose.yaml" || fail 'staging SearXNG init image is not pinned'
grep -Fq 'image: searxng/searxng@sha256:11a9b34cdc0b1ec2b991470a2762ecb5a1a531898289fb51dcd015260450729e' "$staging_root/compose.yaml" || fail 'staging SearXNG image is not pinned'
grep -Fq 'profiles: !reset []' "$staging_root/compose.yaml" || fail 'staging SearXNG profiles are not cleared'
grep -Fq 'python3' "$staging_root/compose.yaml" || fail 'staging SearXNG health probe is missing'
grep -A1 -F '  - name: bing' "$repo_root/weknora/docker/searxng/settings.yml" | grep -Fq '    disabled: false' ||
    fail 'shared SearXNG settings do not enable the native Bing fallback'
grep -Fq 'MUSUW_STAGING_R2_BUCKET=musuw-staging' "$staging_root/staging.env.example" || fail 'staging R2 bucket is not the commissioned bucket'
grep -Fq 'MUSUW_SUPABASE_URL=https://achfnnicetupvtoqiwqd.supabase.co' "$staging_root/auth-public.env.example" || fail 'staging Supabase project is not the commissioned test project'
if grep -Fq '/opt/weknora-production/app-entrypoint.sh' "$staging_root/compose.yaml"; then
    fail 'staging Compose mounts an unused production app entrypoint'
fi
if grep -Fq 'integration/weknora-production/app-entrypoint.sh' "$script_dir/source-manifest.sh"; then
    fail 'staging source manifest carries an unused production app entrypoint'
fi
grep -Fq 'weknora/docker/searxng/settings.yml' "$script_dir/source-manifest.sh" || fail 'staging source manifest omits the SearXNG settings template'
grep -Fq 'integration/weknora-production/searxng-entrypoint.sh' "$script_dir/source-manifest.sh" || fail 'staging source manifest omits the reused SearXNG entrypoint'
grep -Fq 'S3_BUCKET_NAME: ${MUSUW_STAGING_R2_BUCKET:?set MUSUW_STAGING_R2_BUCKET}' "$staging_root/compose.yaml" || fail 'staging R2 bucket is not runtime-selected'
grep -Fq 'WEKNORA_REDIS_NAMESPACE: weknora-v072-staging' "$staging_root/compose.yaml" || fail 'staging Redis namespace is not isolated'
grep -Fq 'NEO4J_ENABLE: "true"' "$staging_root/compose.yaml" || fail 'staging must enable its isolated Neo4j'
grep -Fq 'integration/weknora-production/neo4j-entrypoint.sh' "$script_dir/source-manifest.sh" || fail 'staging source manifest omits the reused Neo4j entrypoint'
grep -Fq 'neo4j_auth' "$staging_root/app-entrypoint.sh" || fail 'staging app does not read file-backed Neo4j auth'
grep -Fq 'MUSUW_STAGING_SECRET_DIR' "$staging_root/compose.yaml" || fail 'staging secret root is not explicit'
grep -Fq '/opt/weknora/staging-runtime/secrets' "$staging_root/compose.yaml" || fail 'staging secret root is not the fixed server path'
grep -Fq 'file: ${MUSUW_STAGING_SECRET_DIR:?set MUSUW_STAGING_SECRET_DIR}/searxng_secret' "$staging_root/compose.yaml" || fail 'staging SearXNG secret is not file-backed'
grep -Fq 'image: ${WEKNORA_STAGING_APP_IMAGE:?set WEKNORA_STAGING_APP_IMAGE}' "$staging_root/compose.yaml" || fail 'staging app image is not immutable input'
grep -Fq 'image: ${WEKNORA_STAGING_FRONTEND_IMAGE:?set WEKNORA_STAGING_FRONTEND_IMAGE}' "$staging_root/compose.yaml" || fail 'staging frontend image is not immutable input'
grep -Fq 'musuw_paddle_validate_configuration' "$staging_root/app-entrypoint.sh" || fail 'staging entrypoint does not call generic Paddle validator'
grep -Fq 'sandbox' "$staging_root/app-entrypoint.sh" || fail 'staging entrypoint does not select Paddle Sandbox'
if grep -Fq 'musuw_paddle_validate_production_launch' "$staging_root/app-entrypoint.sh"; then
    fail 'staging entrypoint calls production Live-only wrapper'
fi
grep -Fq 'export TIKHUB_API_KEY="$(read_required_secret /run/secrets/tikhub_api_key tikhub-api-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not read the TikHub API key from a secret'
grep -Fq 'source: tikhub_api_key' "$staging_root/compose.yaml" || fail 'staging app does not mount the TikHub secret'
grep -Fq 'file: ${MUSUW_STAGING_SECRET_DIR:?set MUSUW_STAGING_SECRET_DIR}/tikhub_api_key' "$staging_root/compose.yaml" ||
    fail 'staging TikHub secret is not file-backed'
grep -Fq 'tikhub_api_key' "$script_dir/prepare-runtime.sh" || fail 'staging runtime does not require the TikHub secret'
grep -Fq 'export LANGFUSE_PUBLIC_KEY="$(read_required_secret /run/secrets/langfuse_public_key langfuse-public-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not export the Langfuse public key'
grep -Fq 'export LANGFUSE_SECRET_KEY="$(read_required_secret /run/secrets/langfuse_secret_key langfuse-secret-key)"' "$staging_root/app-entrypoint.sh" ||
    fail 'staging entrypoint does not export the Langfuse secret key'
for langfuse_secret in langfuse_public_key langfuse_secret_key; do
    grep -Fq "source: $langfuse_secret" "$staging_root/compose.yaml" ||
        fail "staging app does not mount the Langfuse $langfuse_secret secret"
    grep -Fq "file: \${MUSUW_STAGING_SECRET_DIR:?set MUSUW_STAGING_SECRET_DIR}/$langfuse_secret" "$staging_root/compose.yaml" ||
        fail "staging Langfuse $langfuse_secret is not file-backed"
done
grep -Fq 'LANGFUSE_ENABLED: "true"' "$staging_root/compose.yaml" ||
    fail 'staging Langfuse tracing is not enabled by default'
grep -Fq 'LANGFUSE_ENABLED=true' "$staging_root/staging.env.example" ||
    fail 'staging Langfuse tracing example is not enabled'
grep -Fq "LANGFUSE_ENABLED=true" "$script_dir/verify-deployed.sh" ||
    fail 'staging deployed verification does not assert Langfuse tracing is enabled'
for langfuse_secret in langfuse_public_key langfuse_secret_key; do
    grep -Fq "$langfuse_secret" "$script_dir/prepare-runtime.sh" ||
        fail "staging runtime does not require the Langfuse $langfuse_secret"
done
if grep -Eq '^\s+build:' "$staging_root/compose.yaml" &&
   ! grep -Eq '^\s+build: !reset null$' "$staging_root/compose.yaml"; then
    fail 'staging overlay still permits a server-side build'
fi

for service in frontend app postgres redis docreader searxng-init searxng neo4j; do
    grep -A160 -E "^  ${service}:" "$staging_root/compose.yaml" | grep -Eq 'cpus:|mem_limit:|pids_limit:' ||
        fail "staging ${service} does not declare CPU/memory/pids limits"
done
grep -Fq 'WEKNORA_STAGING_APP_CPUS:-0.625' "$staging_root/compose.yaml" || fail 'staging app CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_APP_MEMORY:-704m' "$staging_root/compose.yaml" || fail 'staging app memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_FRONTEND_CPUS:-0.125' "$staging_root/compose.yaml" || fail 'staging frontend CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_FRONTEND_MEMORY:-128m' "$staging_root/compose.yaml" || fail 'staging frontend memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_DOCREADER_CPUS:-0.25' "$staging_root/compose.yaml" || fail 'staging docreader CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_DOCREADER_MEMORY:-320m' "$staging_root/compose.yaml" || fail 'staging docreader memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_POSTGRES_CPUS:-0.25' "$staging_root/compose.yaml" || fail 'staging postgres CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_POSTGRES_MEMORY:-384m' "$staging_root/compose.yaml" || fail 'staging postgres memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_REDIS_CPUS:-0.125' "$staging_root/compose.yaml" || fail 'staging Redis CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_REDIS_MEMORY:-128m' "$staging_root/compose.yaml" || fail 'staging Redis memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_INIT_CPUS:-0.025' "$staging_root/compose.yaml" || fail 'staging SearXNG init CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_INIT_MEMORY:-32m' "$staging_root/compose.yaml" || fail 'staging SearXNG init memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_INIT_PIDS:-32' "$staging_root/compose.yaml" || fail 'staging SearXNG init PID default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_CPUS:-0.1' "$staging_root/compose.yaml" || fail 'staging SearXNG CPU default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_MEMORY:-128m' "$staging_root/compose.yaml" || fail 'staging SearXNG memory default is too high or missing'
grep -Fq 'WEKNORA_STAGING_SEARXNG_PIDS:-64' "$staging_root/compose.yaml" || fail 'staging SearXNG PID default is too high or missing'

grep -Fq 'staging-web' "$staging_root/compose.edge.yaml" || fail 'staging edge alias is missing'
grep -Fq 'musnow-production_edge' "$staging_root/compose.edge.yaml" || fail 'staging edge network is not the existing tunnel network'
grep -Fq 'noindex' "$script_dir/verify-deployed.sh" || fail 'staging deployed verification does not enforce noindex'
grep -Fq 'staging-searxng' "$script_dir/verify-deployed.sh" || fail 'staging deployed verification does not assert SearXNG topology'
grep -Fq '/search?q=musuw-staging-health' "$script_dir/verify-deployed.sh" || fail 'staging deployed verification does not probe SearXNG search'
grep -Fq 'searxng-init searxng neo4j app frontend' "$script_dir/release-ci.sh" || fail 'staging release helper does not start SearXNG'
grep -Fq 'latest_migration_version' "$script_dir/release-ci.sh" || fail 'staging release helper does not resolve the latest schema migration'
grep -Fq 'docker exec weknora-v072-staging-app bash -o pipefail -ec' "$script_dir/release-ci.sh" || fail 'staging release helper does not fail closed when the app migration inventory command fails'
grep -Fq '[ -n "$latest_migration_version" ]' "$script_dir/release-ci.sh" "$script_dir/verify-deployed.sh" || fail 'staging migration gate does not fail closed on an empty app migration inventory'
grep -Fq '/app/migrations/versioned' "$script_dir/release-ci.sh" || fail 'staging release helper does not inspect migrations shipped in the app image'
if grep -Fq '$repo_root/weknora/migrations' "$script_dir/release-ci.sh" "$script_dir/verify-deployed.sh"; then
    fail 'staging migration gate depends on files absent from the materialized server tree'
fi
grep -Fq 'SELECT version, dirty FROM schema_migrations' "$script_dir/release-ci.sh" || fail 'staging release helper does not reject an incomplete database migration'
grep -Fq 'SELECT version, dirty FROM schema_migrations' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not recheck database migration state'

for fixed in \
    '/var/lib/musuw-staging-deploy' \
    '/opt/weknora-staging/releases' \
    '/opt/weknora-staging/current' \
    '/opt/weknora/staging-runtime'; do
    grep -Fq "$fixed" "$server_root/musuw-staging-deploy-gate" "$server_root/musuw-staging-deploy-ssh-gate" "$server_root/bootstrap-musuw-staging-deploy.sh" ||
        fail "staging gate does not pin fixed root: $fixed"
done

if grep -Eq '(^|[[:space:]])(eval|bash[[:space:]]+-c|sh[[:space:]]+-c)([[:space:]]|$)' \
    "$server_root/musuw-staging-deploy-gate" "$server_root/musuw-staging-deploy-ssh-gate"; then
    fail 'staging gate contains arbitrary shell execution'
fi
grep -Fq 'prepare|deploy)' "$server_root/musuw-staging-deploy-ssh-gate" || fail 'staging SSH prepare/deploy protocol is not fixed'
grep -Fq 'verify)' "$server_root/musuw-staging-deploy-ssh-gate" || fail 'staging SSH verify protocol is not fixed'
grep -Fq 'WEKNORA_STAGING_EXPECTED_APP_IMAGE' "$script_dir/verify-deployed.sh" || fail 'staging remote verification does not compare the runner app digest'
grep -Fq 'WEKNORA_STAGING_EXPECTED_FRONTEND_IMAGE' "$script_dir/verify-deployed.sh" || fail 'staging remote verification does not compare the runner frontend digest'
grep -Fq 'S3_BUCKET_NAME=musuw-staging' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not pin the R2 test bucket'
grep -Fq 'MUSUW_SUPABASE_URL=https://achfnnicetupvtoqiwqd.supabase.co' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not pin the Supabase test project'
grep -Fq 'MUSUW_AUTH_PUBLIC_ORIGIN=https://staging.musuw.com' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not pin the browser auth origin'
grep -Fq 'FRONTEND_BASE_URL=https://staging.musuw.com' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not pin the backend frontend origin'
for endpoint_key in OIDC_AUTH_AUTHORIZATION_ENDPOINT OIDC_AUTH_TOKEN_ENDPOINT OIDC_AUTH_USER_INFO_ENDPOINT; do
    grep -Fq "$endpoint_key=https://achfnnicetupvtoqiwqd.supabase.co/auth/v1/oauth/" "$script_dir/verify-deployed.sh" ||
        fail "staging promotion verifier does not pin $endpoint_key"
done
grep -Fq 'openrouter-workspace-id' "$script_dir/verify-deployed.sh" || fail 'staging promotion verifier does not recheck the OpenRouter server pin'
grep -Fq 'source-manifest.sh' "$script_dir/release-ci.sh" || fail 'staging release helper does not verify source manifest'
grep -Fq 'capacity-preflight.sh' "$script_dir/release-ci.sh" || fail 'staging release helper has no production capacity preflight'
grep -Fq -- '--no-build' "$script_dir/release-ci.sh" || fail 'staging release helper permits build'
grep -Fq 'staging_mutated=1' "$script_dir/release-ci.sh" || fail 'staging release helper does not track a partial Compose mutation'
grep -Fq -- 'down --remove-orphans' "$script_dir/release-ci.sh" || fail 'staging release failure does not stop the partial stack'
grep -Fq 'same digest' "$script_dir/verify-deployed.sh" || fail 'staging verification does not document immutable digest parity'
grep -Fq 'remote_gate verify' "$repo_root/scripts/weknora-staging-deploy.sh" || fail 'staging runner does not invoke remote fixed verify'
grep -Fq 'musuw-staging-gate $verb $revision $expected_app $expected_frontend' "$repo_root/scripts/weknora-staging-deploy.sh" || fail 'staging runner does not send exact digest refs to remote verify'
grep -Fq 'musuw-staging-deploy@' "$repo_root/scripts/weknora-staging-deploy.sh" || fail 'staging runner target is not the dedicated account'

# Behavior seam for an immutable release retry. A first deployment can leave
# the requested SHA current while its verify step fails; a retry must classify
# the exact server response and verify in place instead of uploading/deploying
# the same release again. Extract only the two runner helpers so this remains
# local and never contacts SSH or mutates a checkout.
deploy_script="$repo_root/scripts/weknora-staging-deploy.sh"
runner_probe_root="$(mktemp -d "${TMPDIR:-/tmp}/musuw-staging-runner.XXXXXX")"
trap 'find "$runner_probe_root" -depth -delete 2>/dev/null || true' EXIT

prepare_retry_body="$(sed -n '/^remote_prepare_with_retry()/,/^}/p' "$deploy_script")"
[ -n "$prepare_retry_body" ] || fail 'staging runner prepare retry helper is missing'
prepare_probe="$runner_probe_root/prepare-retry.sh"
prepare_calls="$runner_probe_root/prepare.calls"
{
    printf '%s\n' '#!/usr/bin/env bash'
    printf '%s\n' 'set -u'
    printf '%s\n' 'staging_prepare_already_current_status=75'
    printf '%s\n' 'die() { printf "die:%s\\n" "$1" >&2; exit 99; }'
    printf '%s\n' 'sleep() { :; }'
    printf '%s\n' 'remote_gate() { printf "%s\\n" prepare >> "${CALLS_FILE:?}"; printf "%s\\n" "${PREPARE_ERROR:-requested staging release is already current}" >&2; return 1; }'
    printf '%s\n' "$prepare_retry_body"
    printf '%s\n' 'if remote_prepare_with_retry; then printf "%s\\n" status=0; else status=$?; printf "status=%s\\n" "$status"; fi'
    printf '%s\n' 'printf "calls=%s\\n" "$(wc -l < "${CALLS_FILE:?}" | tr -d " ")"'
} > "$prepare_probe"
chmod 700 "$prepare_probe"
prepare_probe_output="$(CALLS_FILE="$prepare_calls" "$prepare_probe" 2>&1 || true)"
grep -Fxq 'status=75' <<<"$prepare_probe_output" ||
    fail 'staging runner does not classify the exact already-current prepare response'
grep -Fxq 'calls=1' <<<"$prepare_probe_output" ||
    fail 'staging runner retries an already-current prepare response'
transient_calls="$runner_probe_root/transient.calls"
transient_probe_output="$(CALLS_FILE="$transient_calls" PREPARE_ERROR='temporary prepare failure' "$prepare_probe" 2>&1 || true)"
grep -Fxq 'die:staging release preparation failed after three bounded SSH attempts' <<<"$transient_probe_output" ||
    fail 'staging runner changed the failure contract for other prepare errors'
if [ "$(wc -l < "$transient_calls" | tr -d ' ')" != 3 ]; then
    fail 'staging runner stopped retrying a non-current prepare error'
fi

reuse_body="$(sed -n '/^remote_prepare_or_reuse_current()/,/^}/p' "$deploy_script")"
[ -n "$reuse_body" ] || fail 'staging runner does not expose the prepare/verify reuse seam'
reuse_probe="$runner_probe_root/prepare-reuse.sh"
reuse_trace="$runner_probe_root/reuse.trace"
{
    printf '%s\n' '#!/usr/bin/env bash'
    printf '%s\n' 'set -u'
    printf '%s\n' 'staging_prepare_already_current_status=75'
    printf '%s\n' 'staging_release_reused_current=0'
    printf '%s\n' 'remote_prepare_with_retry() { return 75; }'
    printf '%s\n' 'remote_gate() { [ "$1" = verify ] || return 98; printf "%s\\n" "$*" >> "${TRACE_FILE:?}"; return "${VERIFY_STATUS:-0}"; }'
    printf '%s\n' "$reuse_body"
    printf '%s\n' 'if remote_prepare_or_reuse_current; then printf "%s\\n" status=0; else status=$?; printf "status=%s\\n" "$status"; fi'
    printf '%s\n' 'printf "reused=%s\\n" "$staging_release_reused_current"'
} > "$reuse_probe"
chmod 700 "$reuse_probe"
reuse_probe_output="$(TRACE_FILE="$reuse_trace" "$reuse_probe" 2>&1 || true)"
grep -Fxq 'status=0' <<<"$reuse_probe_output" ||
    fail 'staging runner prepare/verify reuse seam returned an unexpected status'
grep -Fxq 'reused=1' <<<"$reuse_probe_output" ||
    fail 'staging runner did not mark an already-current release as reused'
grep -Fxq 'verify' "$reuse_trace" ||
    fail 'staging runner did not verify an already-current release in place'
if grep -Evx 'verify' "$reuse_trace" | grep -q .; then
    fail 'staging runner invoked a non-verify gate for an already-current release'
fi
reuse_failure_trace="$runner_probe_root/reuse-failure.trace"
reuse_failure_output="$(TRACE_FILE="$reuse_failure_trace" VERIFY_STATUS=17 "$reuse_probe" 2>&1 || true)"
grep -Fxq 'status=17' <<<"$reuse_failure_output" ||
    fail 'staging runner did not propagate a verify failure for an already-current release'
grep -Fxq 'reused=0' <<<"$reuse_failure_output" ||
    fail 'staging runner marked a failed verify as a reused release'
if grep -Eq '^status=(0|75)$' <<<"$reuse_failure_output"; then
    fail 'staging runner converted a verify failure into success'
fi

printf '%s\n' 'staging isolation contract green'
