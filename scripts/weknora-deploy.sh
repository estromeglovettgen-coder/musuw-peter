#!/usr/bin/env bash
# Upload one manifest-backed source bundle to the restricted incoming spool,
# then ask the fixed root gate to publish that SHA. GitHub release jobs build
# the browser bundles and production images before this upload.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
production_dir="$repo_root/scripts/weknora-production"
runner_runtime="${WEKNORA_DEPLOY_RUNTIME_DIR:-${WEKNORA_PRODUCTION_RUNTIME_DIR:-$repo_root/.runtime/weknora-production}}"
# shellcheck source=scripts/weknora-production/lib.sh
. "$production_dir/lib.sh"

usage() {
    cat <<'EOF'
Usage: scripts/weknora-deploy.sh <full-sha>

The SHA is the only release-selection input. The restricted SSH target, key,
known-hosts file and runner runtime are supplied through environment variables.

Environment overrides:
  WEKNORA_DEPLOY_REMOTE       Restricted musuw-deploy SSH target (required)
  WEKNORA_DEPLOY_SSH_KEY      Restricted deploy private key path (required)
  WEKNORA_DEPLOY_SSH_PORT     Optional SSH port
  WEKNORA_DEPLOY_KNOWN_HOSTS_FILE  Pinned SSH known-hosts file
  WEKNORA_DEPLOY_RUNTIME_DIR  Runner directory containing public env files
  WEKNORA_DEPLOY_GHCR_USERNAME  Short-lived GHCR login username (deploy only)
  WEKNORA_DEPLOY_GHCR_TOKEN  Short-lived GHCR token (deploy only; stdin only)
EOF
}

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "required deployment command is unavailable: $1"
}

safe_revision() {
    [[ "$1" =~ ^[0-9a-fA-F]{40}$ ]]
}

[ "$#" -eq 1 ] || { usage >&2; exit 2; }
revision="$1"
safe_revision "$revision" || die 'deployment input must be a full 40-character Git SHA'
revision="$(printf '%s' "$revision" | tr '[:upper:]' '[:lower:]')"

for command_name in ssh rsync; do
    require_command "$command_name"
done

remote="${WEKNORA_DEPLOY_REMOTE:-}"
ssh_key="${WEKNORA_DEPLOY_SSH_KEY:-}"
[ -n "$remote" ] || die 'deployment requires WEKNORA_DEPLOY_REMOTE'
[ -n "$ssh_key" ] || die 'deployment requires WEKNORA_DEPLOY_SSH_KEY'
case "$remote" in
    musuw-deploy@*) ;;
    *) die 'deployment SSH target must use the restricted musuw-deploy account' ;;
esac
[ -f "$ssh_key" ] && [ -r "$ssh_key" ] || die 'SSH private key is unavailable'

release_id="musuw-$revision"
release_source="/var/lib/musuw-deploy/incoming/$release_id/source"
known_hosts_file="${WEKNORA_DEPLOY_KNOWN_HOSTS_FILE:-${HOME:-}/.ssh/known_hosts}"
[ -f "$known_hosts_file" ] && [ -r "$known_hosts_file" ] || die 'SSH known-hosts file is unavailable'

for required in \
    "$runner_runtime/production.public.env" \
    "$runner_runtime/auth-public.env"; do
    [ -f "$required" ] && [ -r "$required" ] || die "required deployment input is unavailable: $required"
done

# The runner builds only from the immutable clean checkout. Browser bundles
# live in the GHCR images; the server source upload contains tracked source and
# public runtime inputs only.
WEKNORA_PRODUCTION_RUNTIME_DIR="$runner_runtime" \
WEKNORA_PRODUCTION_REVISION="$revision" \
    "$production_dir/verify-static.sh"
ssh_control_dir="$(mktemp -d "$runner_runtime/ssh-control.XXXXXX")"
chmod 700 "$ssh_control_dir"
ssh_control_path="$ssh_control_dir/control"
ssh_args=(
    -F /dev/null
    -o BatchMode=yes
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_hosts_file"
    -o IdentitiesOnly=yes
    -o ConnectTimeout=15
    -o ConnectionAttempts=1
    -o ControlMaster=auto
    -o ControlPath="$ssh_control_path"
    -o ControlPersist=180
    -o ServerAliveInterval=15
    -o ServerAliveCountMax=4
    -i "$ssh_key"
)
if [ -n "${WEKNORA_DEPLOY_SSH_PORT:-}" ]; then
    case "$WEKNORA_DEPLOY_SSH_PORT" in ''|*[!0-9]*) die 'SSH port is invalid' ;; esac
    ssh_args+=( -p "$WEKNORA_DEPLOY_SSH_PORT" )
fi

ssh_transport='ssh'
for argument in "${ssh_args[@]}"; do
    printf -v escaped_argument '%q' "$argument"
    ssh_transport+=" $escaped_argument"
done

remote_gate() {
    local verb="$1"
    case "$verb" in
        prepare|deploy) ;;
        *) die 'deployment gate verb is invalid' ;;
    esac
    if [ "$verb" = deploy ]; then
        [ -n "${WEKNORA_DEPLOY_GHCR_USERNAME:-}" ] || die 'GHCR username is unavailable'
        [ -n "${WEKNORA_DEPLOY_GHCR_TOKEN:-}" ] || die 'GHCR token is unavailable'
        printf '%s\n%s\n' "$WEKNORA_DEPLOY_GHCR_USERNAME" "$WEKNORA_DEPLOY_GHCR_TOKEN" |
            ssh "${ssh_args[@]}" "$remote" "musuw-gate $verb $revision"
    else
        ssh "${ssh_args[@]}" "$remote" "musuw-gate $verb $revision"
    fi
}

reset_ssh_transport() {
    # A failed rsync can leave both a stale multiplexed connection locally and
    # a dot-prefixed receiver file in this SHA's remote spool. Retire the
    # transport before prepare clears that isolated spool for a fresh attempt.
    if [ -S "$ssh_control_path" ]; then
        ssh "${ssh_args[@]}" -O exit "$remote" >/dev/null 2>&1 || true
    fi
    rm -f -- "$ssh_control_path"
}

manifest_dir=''
deploy_tree_root=''
deploy_tree=''
cleanup_release_inputs() {
    if [ -n "${ssh_control_path:-}" ] && [ -n "${remote:-}" ]; then
        reset_ssh_transport
    fi
    if [ -n "$manifest_dir" ] && [ -d "$manifest_dir" ]; then
        find "$manifest_dir" -depth -delete 2>/dev/null || true
    fi
    if [ -n "$deploy_tree_root" ] && [ -d "$deploy_tree_root" ]; then
        find "$deploy_tree_root" -depth -delete 2>/dev/null || true
    fi
    if [ -n "${ssh_control_dir:-}" ] && [ -d "$ssh_control_dir" ]; then
        find "$ssh_control_dir" -depth -delete 2>/dev/null || true
    fi
}
trap cleanup_release_inputs EXIT

remote_prepare_with_retry() {
    local attempt
    for attempt in 1 2 3; do
        if remote_gate prepare; then
            return 0
        fi
        if [ "$attempt" -lt 3 ]; then
            sleep "$((attempt * 10))"
        fi
    done
    die 'release preparation failed after three bounded SSH attempts'
}

manifest_dir="$(mktemp -d "$runner_runtime/source-manifest.XXXXXX")"
chmod 700 "$manifest_dir"
deploy_tree_root="$(mktemp -d "${TMPDIR:-/tmp}/weknora-deploy-tree.XXXXXX")"
chmod 700 "$deploy_tree_root"
deploy_tree="$deploy_tree_root/$release_id/source"
source_bundle_sha256="$("$production_dir/source-manifest.sh" materialize \
    "$repo_root" "$runner_runtime" "$release_id" "$revision" update \
    "$manifest_dir" "$deploy_tree")"

# Prepare creates/clears exactly this SHA's incoming source before rsync. It
# rejects a release that is already current or has an active release helper.
remote_prepare_with_retry

common_rsync=( -a --timeout=120 --no-owner --no-group -e "$ssh_transport" )
rsync_with_retry() {
    local attempt
    for attempt in 1 2 3; do
        if rsync "$@"; then
            return 0
        fi
        if [ "$attempt" -lt 3 ]; then
            reset_ssh_transport
            sleep "$((attempt * 5))"
            # prepare is idempotent and clears only this immutable SHA's
            # incoming tree, including any receiver temp file left behind by
            # the failed attempt. The current production release is untouched.
            remote_prepare_with_retry
        fi
    done
    die 'release upload failed after three clean attempts'
}
rsync_with_retry "${common_rsync[@]}" "$deploy_tree/" "$remote:$release_source/"

# Deploy verifies the complete manifest, atomically installs the exact source
# directory, and invokes only the fixed release-ci.sh SHA entry point.
remote_gate deploy

printf '%s\n' "production release requested: $release_id source_bundle_sha256=$source_bundle_sha256"
