#!/usr/bin/env bash
# Local simulation for the restricted prepare -> rsync -> deploy seam.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ssh_gate="$script_dir/server/musuw-deploy-ssh-gate"
root_gate="$script_dir/server/musuw-deploy-gate"
revision='0123456789abcdef0123456789abcdef01234567'
release_id="musuw-$revision"
root_dir="$(mktemp -d "${TMPDIR:-/tmp}/musuw-gate.XXXXXX")"
trap 'find "$root_dir" -depth -delete 2>/dev/null || true' EXIT

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

expect_reject() {
    local command="$1"
    local mode="${2:-application}"
    if SSH_ORIGINAL_COMMAND="$command" \
        MUSUW_DEPLOY_GATE_TEST_MODE=1 \
        MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
        MUSUW_DEPLOY_GATE_WRAPPER="$root_dir/wrapper" \
        "$ssh_gate" "$mode" >/dev/null 2>&1; then
        fail "SSH gate unexpectedly accepted: $command"
    fi
}

wrapper_log="$root_dir/wrapper.log"
cat > "$root_dir/wrapper" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "${MUSUW_DEPLOY_GATE_TEST_WRAPPER_LOG:?}"
EOF
chmod +x "$root_dir/wrapper"
SSH_ORIGINAL_COMMAND="musuw-gate prepare $revision" \
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_DEPLOY_GATE_WRAPPER="$root_dir/wrapper" \
MUSUW_DEPLOY_GATE_TEST_WRAPPER_LOG="$wrapper_log" \
    "$ssh_gate"
grep -Fx "prepare $revision" "$wrapper_log" >/dev/null || fail 'SSH gate did not forward prepare'
checksum="$(printf '%064d' 1)"
SSH_ORIGINAL_COMMAND="musuw-operations deploy $revision $checksum" \
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_OPERATIONS_GATE_WRAPPER="$root_dir/wrapper" \
MUSUW_DEPLOY_GATE_TEST_WRAPPER_LOG="$wrapper_log" \
    "$ssh_gate" operations-only
grep -Fx "deploy $revision $checksum" "$wrapper_log" >/dev/null || fail 'operations gate lost exact revision or digest'
expect_reject "musuw-operations deploy $revision $checksum"
expect_reject "musuw-gate deploy $revision" operations-only
expect_reject "rsync --server -logDtpre.iLsfxC . /var/lib/musuw-deploy/incoming/$release_id/source/" operations-only
expect_reject "musuw-operations deploy $revision $checksum extra" operations-only
expect_reject "musuw-operations deploy short $checksum" operations-only
expect_reject "musuw-operations deploy $revision short" operations-only
expect_reject "musuw-operations deploy $revision $checksum;id" operations-only
expect_reject "musuw-operations deploy $revision $checksum" unknown-mode
expect_reject "musuw-gate invalid $revision"
expect_reject "musuw-gate deploy $revision;id"
expect_reject $'musuw-gate prepare 0123456789abcdef0123456789abcdef01234567\nid'
expect_reject $'musuw-gate prepare 0123456789abcdef0123456789abcdef01234567\rid'
expect_reject "rsync --server --sender -logDtpre.iLsfxC . /var/lib/musuw-deploy/incoming/$release_id/source/"
expect_reject "rsync --server -logDtpre.iLsfxC --delete . /var/lib/musuw-deploy/incoming/$release_id/source/"
expect_reject 'sh -c id'
cat > "$root_dir/rsync" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "${MUSUW_DEPLOY_GATE_TEST_RSYNC_LOG:?}"
EOF
chmod +x "$root_dir/rsync"
rsync_log="$root_dir/rsync.log"
SSH_ORIGINAL_COMMAND="rsync --server -logDtpre.iLsfxC --partial . /var/lib/musuw-deploy/incoming/$release_id/source/" \
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_DEPLOY_GATE_RSYNC_BIN="$root_dir/rsync" \
MUSUW_DEPLOY_GATE_TEST_RSYNC_LOG="$rsync_log" \
    "$ssh_gate"
grep -Fq -- '--server -logDtpre.iLsfxC --partial .' "$rsync_log" || fail 'SSH gate rejected the Linux rsync server shape'

mkdir -p \
    "$root_dir/opt/weknora" \
    "$root_dir/var/lib/musuw-deploy/incoming"
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
    "$root_gate" prepare "$revision" >/dev/null
incoming="$root_dir/var/lib/musuw-deploy/incoming/$release_id/source"
test -d "$incoming" || fail 'prepare did not create the exact incoming source'
test "$(cat "$root_dir/var/lib/musuw-deploy/incoming/$release_id/.prepared")" = "$revision" || \
    fail 'prepare marker does not bind the requested SHA'

# A retry prepares the same immutable SHA again. It must remove a partial
# rsync receiver file so strict manifest verification never sees stale bytes.
printf '%s\n' 'interrupted receiver bytes' > "$incoming/scripts/weknora-production/.source-manifest.sh.partial"
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
    "$root_gate" prepare "$revision" >/dev/null
test ! -e "$incoming/scripts/weknora-production/.source-manifest.sh.partial" || \
    fail 'repeated prepare did not clear the exact SHA partial upload'

mkdir -p "$incoming/scripts/weknora-production" "$incoming/deploy"
cat > "$incoming/scripts/weknora-production/source-manifest.sh" <<'EOF'
#!/usr/bin/env bash
set -eu
[ "${1:-}" = verify ] || exit 1
exit 0
EOF
cat > "$incoming/scripts/weknora-production/release-ci.sh" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "${1:?}" > "${MUSUW_DEPLOY_GATE_TEST_RELEASE_LOG:?}"
EOF
printf '%s\n' 'fixture  source' > "$incoming/deploy/source-manifest.sha256"
chmod +x "$incoming/scripts/weknora-production/source-manifest.sh" "$incoming/scripts/weknora-production/release-ci.sh"
release_log="$root_dir/release.log"
MUSUW_DEPLOY_GATE_TEST_MODE=1 \
MUSUW_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_DEPLOY_GATE_TEST_RELEASE_LOG="$release_log" \
    bash -c 'printf "%s\\n%s\\n" fixture-user fixture-token | "$1" deploy "$2" >/dev/null' \
    bash "$root_gate" "$revision"
test -d "$root_dir/opt/weknora/releases/$release_id/source" || fail 'deploy did not install the exact release tree'
test ! -e "$root_dir/var/lib/musuw-deploy/incoming/$release_id" || fail 'deploy left the incoming release tree'
grep -Fx "$revision" "$release_log" >/dev/null || fail 'deploy did not invoke release-ci with the SHA'

printf '%s\n' 'musuw deploy gate simulation green: restricted prepare/deploy, manifest verification, exact promotion'
