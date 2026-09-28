#!/usr/bin/env bash
# Upload one manifest-backed staging source bundle and invoke the fixed
# staging gate. The SHA is the only release-selection input; no caller command
# or path reaches the server.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
staging_dir="$repo_root/scripts/weknora-staging"
# shellcheck source=scripts/weknora-staging/lib.sh
. "$staging_dir/lib.sh"

usage() {
    cat <<'EOF'
Usage: scripts/weknora-staging-deploy.sh <full-sha>

Required environment:
  WEKNORA_STAGING_REMOTE           musuw-staging-deploy@host target
  WEKNORA_STAGING_SSH_KEY          restricted deploy private key path
  WEKNORA_STAGING_KNOWN_HOSTS_FILE pinned SSH known-hosts file
  WEKNORA_STAGING_RUNTIME_DIR      runner dir with staging.public.env/auth-public.env
  WEKNORA_STAGING_GHCR_USERNAME / WEKNORA_STAGING_GHCR_TOKEN
EOF
}

die() { printf '%s\n' "$1" >&2; exit 1; }
safe_revision() { [[ "$1" =~ ^[0-9a-fA-F]{40}$ ]]; }
[ "$#" -eq 1 ] || { usage >&2; exit 2; }
revision="$1"
safe_revision "$revision" || die 'staging deployment input must be a full 40-character Git SHA'
revision="$(printf '%s' "$revision" | tr '[:upper:]' '[:lower:]')"
for command_name in ssh rsync; do weknora_staging_require_command "$command_name"; done

remote="${WEKNORA_STAGING_DEPLOY_REMOTE:-${WEKNORA_STAGING_REMOTE:-}}"
ssh_key="${WEKNORA_STAGING_DEPLOY_SSH_KEY:-${WEKNORA_STAGING_SSH_KEY:-}}"
known_hosts_file="${WEKNORA_STAGING_DEPLOY_KNOWN_HOSTS_FILE:-${WEKNORA_STAGING_KNOWN_HOSTS_FILE:-}}"
[ -n "$remote" ] || die 'staging deployment requires WEKNORA_STAGING_DEPLOY_REMOTE'
[ -n "$ssh_key" ] || die 'staging deployment requires WEKNORA_STAGING_DEPLOY_SSH_KEY'
[ -n "$known_hosts_file" ] || die 'staging deployment requires WEKNORA_STAGING_DEPLOY_KNOWN_HOSTS_FILE'
case "$remote" in musuw-staging-deploy@*) ;; *) die 'staging SSH target must use musuw-staging-deploy' ;; esac
[ -f "$ssh_key" ] && [ -r "$ssh_key" ] || die 'staging SSH private key is unavailable'
[ -f "$known_hosts_file" ] && [ -r "$known_hosts_file" ] || die 'staging SSH known-hosts file is unavailable'

runtime_dir="${WEKNORA_STAGING_DEPLOY_RUNTIME_DIR:-${WEKNORA_STAGING_RUNTIME_DIR:-$repo_root/.runtime/weknora-staging}}"
for required in "$runtime_dir/staging.public.env" "$runtime_dir/auth-public.env"; do
    [ -f "$required" ] && [ ! -L "$required" ] || die "required staging deployment input is unavailable: $required"
done

release_id="musuw-$revision"
release_source="/var/lib/musuw-staging-deploy/incoming/$release_id/source"
WEKNORA_STAGING_RUNTIME_DIR="$runtime_dir" WEKNORA_STAGING_REVISION="$revision" \
    "$staging_dir/verify-static.sh" >/dev/null
expected_app="$(weknora_staging_require_env_value "$runtime_dir/staging.public.env" WEKNORA_STAGING_APP_IMAGE)"
expected_frontend="$(weknora_staging_require_env_value "$runtime_dir/staging.public.env" WEKNORA_STAGING_FRONTEND_IMAGE)"
weknora_staging_require_immutable_image "$expected_app"
weknora_staging_require_immutable_image "$expected_frontend"

ssh_control_dir="$(mktemp -d "$runtime_dir/ssh-control.XXXXXX")"
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
ssh_port="${WEKNORA_STAGING_DEPLOY_SSH_PORT:-${WEKNORA_STAGING_SSH_PORT:-}}"
if [ -n "$ssh_port" ]; then
    case "$ssh_port" in ''|*[!0-9]*) die 'staging SSH port is invalid' ;; esac
    ssh_args+=( -p "$ssh_port" )
fi
ssh_transport='ssh'
for argument in "${ssh_args[@]}"; do printf -v escaped_argument '%q' "$argument"; ssh_transport+=" $escaped_argument"; done

remote_gate() {
    local verb="$1"
    case "$verb" in prepare|deploy|verify) ;; *) die 'staging gate verb is invalid' ;; esac
    if [ "$verb" = deploy ]; then
        ghcr_username="${WEKNORA_STAGING_DEPLOY_GHCR_USERNAME:-${WEKNORA_STAGING_GHCR_USERNAME:-}}"
        ghcr_token="${WEKNORA_STAGING_DEPLOY_GHCR_TOKEN:-${WEKNORA_STAGING_GHCR_TOKEN:-}}"
        [ -n "$ghcr_username" ] || die 'staging GHCR username is unavailable'
        [ -n "$ghcr_token" ] || die 'staging GHCR token is unavailable'
        printf '%s\n%s\n' "$ghcr_username" "$ghcr_token" |
            ssh "${ssh_args[@]}" "$remote" "musuw-staging-gate $verb $revision"
    elif [ "$verb" = verify ]; then
        ssh "${ssh_args[@]}" "$remote" "musuw-staging-gate $verb $revision $expected_app $expected_frontend"
    else
        ssh "${ssh_args[@]}" "$remote" "musuw-staging-gate $verb $revision"
    fi
}

reset_ssh_transport() {
    if [ -S "$ssh_control_path" ]; then ssh "${ssh_args[@]}" -O exit "$remote" >/dev/null 2>&1 || true; fi
    rm -f -- "$ssh_control_path"
}
manifest_dir=''
deploy_tree_root=''
cleanup_release_inputs() {
    [ -n "${ssh_control_path:-}" ] && reset_ssh_transport || true
    [ -n "$manifest_dir" ] && [ -d "$manifest_dir" ] && find "$manifest_dir" -depth -delete 2>/dev/null || true
    [ -n "$deploy_tree_root" ] && [ -d "$deploy_tree_root" ] && find "$deploy_tree_root" -depth -delete 2>/dev/null || true
    [ -n "${ssh_control_dir:-}" ] && [ -d "$ssh_control_dir" ] && find "$ssh_control_dir" -depth -delete 2>/dev/null || true
}
trap cleanup_release_inputs EXIT

staging_prepare_already_current_status=75
staging_release_reused_current=0
remote_prepare_with_retry() {
    local attempt prepare_error prepare_status
    for attempt in 1 2 3; do
        prepare_status=0
        prepare_error="$(remote_gate prepare 2>&1 >/dev/null)" || prepare_status=$?
        if [ "$prepare_status" -eq 0 ]; then
            [ -z "$prepare_error" ] || printf '%s\n' "$prepare_error" >&2
            return 0
        fi
        if [ "$prepare_error" = 'requested staging release is already current' ]; then
            printf '%s\n' "$prepare_error" >&2
            return "$staging_prepare_already_current_status"
        fi
        [ -z "$prepare_error" ] || printf '%s\n' "$prepare_error" >&2
        [ "$attempt" -lt 3 ] && sleep "$((attempt * 10))"
    done
    die 'staging release preparation failed after three bounded SSH attempts'
}

remote_prepare_or_reuse_current() {
    local prepare_status verify_status
    staging_release_reused_current=0
    if remote_prepare_with_retry; then
        return 0
    else
        prepare_status=$?
    fi
    if [ "$prepare_status" -eq "$staging_prepare_already_current_status" ]; then
        if remote_gate verify; then
            staging_release_reused_current=1
            return 0
        else
            verify_status=$?
            return "$verify_status"
        fi
    fi
    return "$prepare_status"
}

manifest_dir="$(mktemp -d "$runtime_dir/source-manifest.XXXXXX")"
chmod 700 "$manifest_dir"
deploy_tree_root="$(mktemp -d "${TMPDIR:-/tmp}/weknora-staging-deploy-tree.XXXXXX")"
chmod 700 "$deploy_tree_root"
deploy_tree="$deploy_tree_root/$release_id/source"
source_bundle_sha256="$($staging_dir/source-manifest.sh materialize \
    "$repo_root" "$runtime_dir" "$release_id" "$revision" update \
    "$manifest_dir" "$deploy_tree")"

if remote_prepare_or_reuse_current; then
    if [ "$staging_release_reused_current" -eq 1 ]; then
        printf '%s\n' "staging release requested: $release_id source_bundle_sha256=$source_bundle_sha256"
        exit 0
    fi
else
    prepare_status=$?
    exit "$prepare_status"
fi
common_rsync=( -a --timeout=120 --no-owner --no-group -e "$ssh_transport" )
rsync_with_retry() {
    local attempt
    for attempt in 1 2 3; do
        if rsync "$@"; then return 0; fi
        if [ "$attempt" -lt 3 ]; then
            reset_ssh_transport
            sleep "$((attempt * 5))"
            remote_prepare_with_retry
        fi
    done
    die 'staging release upload failed after three bounded attempts'
}
rsync_with_retry "${common_rsync[@]}" "$deploy_tree/" "$remote:$release_source/"
remote_gate deploy
remote_gate verify
printf '%s\n' "staging release requested: $release_id source_bundle_sha256=$source_bundle_sha256"
