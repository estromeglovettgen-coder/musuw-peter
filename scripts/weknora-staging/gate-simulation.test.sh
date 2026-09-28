#!/usr/bin/env bash
# Local negative/positive simulation for the isolated staging SSH gate. It
# never contacts SSH or Docker and uses a temporary fake root plus executables.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ssh_gate="$script_dir/server/musuw-staging-deploy-ssh-gate"
root_gate="$script_dir/server/musuw-staging-deploy-gate"
revision='0123456789abcdef0123456789abcdef01234567'
release_id="musuw-$revision"
app_ref='ghcr.io/estromeglovettgen-coder/musuw-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
frontend_ref='ghcr.io/estromeglovettgen-coder/musuw-frontend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
root_dir="$(mktemp -d "${TMPDIR:-/tmp}/musuw-staging-gate.XXXXXX")"
trap 'find "$root_dir" -depth -delete 2>/dev/null || true' EXIT
fail() { printf '%s\n' "$1" >&2; exit 1; }

wrapper_log="$root_dir/wrapper.log"
cat > "$root_dir/wrapper" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "${MUSUW_STAGING_DEPLOY_GATE_TEST_WRAPPER_LOG:?}"
EOF
chmod +x "$root_dir/wrapper"
SSH_ORIGINAL_COMMAND="musuw-staging-gate prepare $revision" \
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_STAGING_DEPLOY_GATE_WRAPPER="$root_dir/wrapper" MUSUW_STAGING_DEPLOY_GATE_TEST_WRAPPER_LOG="$wrapper_log" \
    "$ssh_gate"
grep -Fx "prepare $revision" "$wrapper_log" >/dev/null || fail 'staging SSH gate did not forward prepare'
SSH_ORIGINAL_COMMAND="musuw-staging-gate verify $revision $app_ref $frontend_ref" \
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_STAGING_DEPLOY_GATE_WRAPPER="$root_dir/wrapper" MUSUW_STAGING_DEPLOY_GATE_TEST_WRAPPER_LOG="$wrapper_log" \
    "$ssh_gate"
grep -Fx "verify $revision $app_ref $frontend_ref" "$wrapper_log" >/dev/null || fail 'staging SSH gate did not forward exact verify refs'

expect_reject() {
    local command="$1"
    if SSH_ORIGINAL_COMMAND="$command" MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 \
        MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" MUSUW_STAGING_DEPLOY_GATE_WRAPPER="$root_dir/wrapper" \
        "$ssh_gate" >/dev/null 2>&1; then
        fail "staging SSH gate unexpectedly accepted: $command"
    fi
}
expect_reject "musuw-staging-gate invalid $revision"
expect_reject "musuw-staging-gate verify $revision"
expect_reject "musuw-staging-gate verify $revision $frontend_ref $app_ref"
expect_reject "musuw-staging-gate deploy $revision;id"
expect_reject $'musuw-staging-gate prepare 0123456789abcdef0123456789abcdef01234567\nid'
expect_reject "rsync --server --sender -logDtpre.iLsfxC . /var/lib/musuw-staging-deploy/incoming/$release_id/source/"
expect_reject "rsync --server -logDtpre.iLsfxC --delete . /var/lib/musuw-staging-deploy/incoming/$release_id/source/"
expect_reject 'sh -c id'

cat > "$root_dir/rsync" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "${MUSUW_STAGING_DEPLOY_GATE_TEST_RSYNC_LOG:?}"
EOF
chmod +x "$root_dir/rsync"
rsync_log="$root_dir/rsync.log"
SSH_ORIGINAL_COMMAND="rsync --server -logDtpre.iLsfxC --partial . /var/lib/musuw-staging-deploy/incoming/$release_id/source/" \
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_STAGING_DEPLOY_GATE_RSYNC_BIN="$root_dir/rsync" MUSUW_STAGING_DEPLOY_GATE_TEST_RSYNC_LOG="$rsync_log" \
    "$ssh_gate"
grep -Fq -- '--server -logDtpre.iLsfxC --partial .' "$rsync_log" || fail 'staging SSH gate rejected Linux rsync receiver shape'

MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
    "$root_gate" prepare "$revision" >/dev/null
incoming="$root_dir/var/lib/musuw-staging-deploy/incoming/$release_id/source"
[ -d "$incoming" ] || fail 'staging prepare did not create exact incoming source'
[ "$(cat "$root_dir/var/lib/musuw-staging-deploy/incoming/$release_id/.prepared")" = "$revision" ] || fail 'staging prepare marker mismatch'
printf '%s\n' 'partial receiver bytes' > "$incoming/scripts/weknora-staging/.partial"
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
    "$root_gate" prepare "$revision" >/dev/null
[ ! -e "$incoming/scripts/weknora-staging/.partial" ] || fail 'staging repeated prepare did not clear partial receiver'

mkdir -p "$incoming/scripts/weknora-staging" "$incoming/deploy"
cat > "$incoming/scripts/weknora-staging/source-manifest.sh" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = verify ] || exit 1
exit 0
EOF
cat > "$incoming/scripts/weknora-staging/release-ci.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$incoming/scripts/weknora-staging/verify-deployed.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
printf '%s\n' 'fixture  source' > "$incoming/deploy/source-manifest.sha256"
chmod +x "$incoming/scripts/weknora-staging/source-manifest.sh" "$incoming/scripts/weknora-staging/release-ci.sh" "$incoming/scripts/weknora-staging/verify-deployed.sh"
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_STAGING_DEPLOY_GATE_SKIP_RELEASE_CI=1 \
    bash -c 'printf "%s\\n%s\\n" fixture-user fixture-token | "$1" deploy "$2" >/dev/null' \
    bash "$root_gate" "$revision"
[ -d "$root_dir/opt/weknora-staging/releases/$release_id/source" ] || fail 'staging deploy did not install exact release tree'
[ ! -e "$root_dir/var/lib/musuw-staging-deploy/incoming/$release_id" ] || fail 'staging deploy left incoming tree'
ln -s "$root_dir/opt/weknora-staging/releases/$release_id/source" "$root_dir/opt/weknora-staging/current"
SSH_ORIGINAL_COMMAND="musuw-staging-gate verify $revision $app_ref $frontend_ref" \
MUSUW_STAGING_DEPLOY_GATE_TEST_MODE=1 MUSUW_STAGING_DEPLOY_GATE_ROOT="$root_dir" \
MUSUW_STAGING_DEPLOY_GATE_WRAPPER="$root_gate" \
    "$ssh_gate" >/dev/null

printf '%s\n' 'staging deploy gate simulation green: fixed verbs, rsync receiver, exact SHA spool, manifest verification, isolated release root'
