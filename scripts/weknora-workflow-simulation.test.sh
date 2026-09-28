#!/usr/bin/env bash
# Compatibility entry point for repository CI. The active production seam is
# the direct SHA-only runner and its two restricted server gate verbs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

workflow_path="$script_dir/../.github/workflows/deploy-production.yml"
fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

test -f "$workflow_path" || fail 'production release workflow is missing'
grep -Fq 'default: staging-only' "$workflow_path" || fail 'manual release default is not staging-only'
grep -Fq '          - staging-only' "$workflow_path" || fail 'staging-only release mode is missing'
grep -Fq '          - promote' "$workflow_path" || fail 'promote release mode is missing'
grep -Fq 'default: not-confirmed' "$workflow_path" || fail 'manual promotion does not default Paddle E2E to unconfirmed'
grep -Fq '          - full-sandbox-e2e-green' "$workflow_path" || fail 'full Sandbox E2E attestation is missing'
grep -Fq '          - ui-regression-green' "$workflow_path" || fail 'scoped UI acceptance is missing'
grep -Fq 'python3 "$RUNNER_TEMP/verify-ui-release-scope.py" "$UI_BASE_SHA" "$actual"' "$workflow_path" || fail 'UI acceptance lacks a source scope guard'
python3 "$script_dir/ci/verify-ui-release-scope.test.py"
grep -Fq 'python3 "$RUNNER_TEMP/verify-reviewed-model-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"' "$workflow_path" || fail 'reviewed model acceptance lacks its exact release guard'
python3 "$script_dir/ci/verify-reviewed-model-release.test.py"
grep -Fq '          - reviewed-integration-release' "$workflow_path" || fail 'reviewed integration acceptance is missing'
grep -Fq 'python3 "$RUNNER_TEMP/verify-reviewed-integration-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"' "$workflow_path" || fail 'reviewed integration acceptance lacks its exact release guard'
grep -Fq 'targeted IM/embed acceptance passed; full Sandbox E2E NOT claimed' "$workflow_path" || fail 'reviewed integration acceptance overclaims its evidence'
python3 "$script_dir/ci/verify-reviewed-integration-release.test.py"
grep -Fq '          - reviewed-curated-release' "$workflow_path" || fail 'reviewed curated acceptance is missing'
grep -Fq 'python3 "$RUNNER_TEMP/verify-reviewed-curated-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"' "$workflow_path" || fail 'reviewed curated acceptance lacks its exact release guard'
grep -Fq 'limited acceptance only; full Sandbox E2E NOT claimed' "$workflow_path" || fail 'reviewed curated acceptance overclaims its evidence'
python3 "$script_dir/ci/verify-reviewed-curated-release.test.py"
if grep -Eq '^[[:space:]]*- full$' "$workflow_path"; then
    fail 'unsupported full release mode remains in the workflow'
fi
grep -Fq "github.event_name == 'workflow_dispatch'" "$workflow_path" || fail 'production promotion is not manual-only'
grep -Fq "inputs.release_mode == 'promote'" "$workflow_path" || fail 'production promotion lacks an explicit promote gate'
grep -Fq "inputs.staging_e2e_result == 'full-sandbox-e2e-green'" "$workflow_path" || fail 'production promotion is not gated by full Sandbox E2E attestation'
grep -Fq "inputs.staging_e2e_result == 'reviewed-integration-release'" "$workflow_path" || fail 'production promotion omits the reviewed integration gate'
grep -Fq "inputs.staging_e2e_result == 'reviewed-curated-release'" "$workflow_path" || fail 'production promotion omits the reviewed curated gate'
grep -Fq 'required_reviewers' "$workflow_path" || fail 'production promotion does not verify a protected reviewer gate'
grep -Fq 'EVENT_SHA: ${{ github.sha }}' "$workflow_path" || fail 'manual staging does not bind the requested SHA to the dispatched branch head'
grep -Fq 'test "$requested" = "$EVENT_SHA"' "$workflow_path" || fail 'manual staging accepts a SHA other than the dispatched branch head'
grep -Fq 'if [ "$REQUESTED_RELEASE_MODE" = promote ]; then' "$workflow_path" || fail 'main-only authorization is not scoped to production promotion'
grep -Fq 'test "$EVENT_REF" = refs/heads/main' "$workflow_path" || fail 'production promotion is not pinned to main'
grep -Fq 'git merge-base --is-ancestor "$actual" refs/remotes/origin/main' "$workflow_path" || fail 'production promotion lacks main ancestry proof'
if grep -Fq 'staging_acceptance' "$workflow_path"; then
    fail 'automatic staging smoke verification still claims full acceptance'
fi
grep -Fq 'staging_deployment' "$workflow_path" || fail 'staging deployment evidence is missing'
deploy_staging_block="$(sed -n '/^  deploy-staging:/,/^  deploy:/p' "$workflow_path")"
deploy_block="$(sed -n '/^  deploy:/,$p' "$workflow_path")"
if grep -Fq 'app_ref: ${{ steps.staging_record.outputs.app_ref }}' <<< "$deploy_staging_block" ||
   grep -Fq 'frontend_ref: ${{ steps.staging_record.outputs.frontend_ref }}' <<< "$deploy_staging_block"; then
    fail 'promotion still transports verified image refs through secret-mask-prone staging job outputs'
fi
if grep -Fq 'STAGING_APP_IMAGE: ${{ needs.deploy-staging.outputs.app_ref }}' <<< "$deploy_block" ||
   grep -Fq 'STAGING_FRONTEND_IMAGE: ${{ needs.deploy-staging.outputs.frontend_ref }}' <<< "$deploy_block"; then
    fail 'production still depends on secret-mask-prone staging image outputs'
fi
grep -Fq 'APP_IMAGE: ${{ needs.build.outputs.app_ref }}' <<< "$deploy_block" || fail 'production does not consume the artifact-validated app ref'
grep -Fq 'FRONTEND_IMAGE: ${{ needs.build.outputs.frontend_ref }}' <<< "$deploy_block" || fail 'production does not consume the artifact-validated frontend ref'
if grep -A12 '^  deploy:$' "$workflow_path" | grep -Fq 'github.event_name == '\''workflow_run'\'''; then
    fail 'workflow_run is still allowed to promote production'
fi
grep -Fq 'if [ -z "$mode" ]; then mode=staging-only; fi' "$workflow_path" || fail 'workflow_run does not default to staging-only'
grep -Fq 'musuw-staging-gate verify' "$workflow_path" || fail 'staging acceptance does not use the fixed remote verify gate'
grep -Fq 'APP_EXTERNAL_URL=https://staging.musuw.com' "$workflow_path" || fail 'staging workflow does not pin the dotted hostname'
grep -Fq 'MUSUW_AUTH_PUBLIC_ORIGIN=https://staging.musuw.com' "$workflow_path" || fail 'staging workflow does not pin the browser origin'
if grep -Fq 'bash scripts/weknora-staging/verify-deployed.sh' "$workflow_path"; then
    fail 'server-local staging verifier is being executed on the GitHub runner'
fi

bash "$script_dir/weknora-production/deploy-ci-seams-contract.test.sh"
bash "$script_dir/weknora-production/musuw-deploy-gate-simulation.test.sh"
bash "$script_dir/weknora-production/tunnel-compose-contract.test.sh"
bash "$script_dir/weknora-production/tunnel-token-contract.test.sh"
bash "$script_dir/weknora-production/postgres-healthcheck-contract.test.sh"
printf '%s\n' 'WeKnora workflow simulation green: direct SHA-only deployment seam'
