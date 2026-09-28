#!/usr/bin/env bash
# Read-only verification for the installed staging forced-command seam.
set -euo pipefail

die() { printf '%s\n' "$1" >&2; exit 1; }
test_mode=false
if [ "${MUSUW_STAGING_DEPLOY_GATE_VERIFY_TEST_MODE:-0}" = 1 ] && [ "${EUID:-1}" -ne 0 ]; then test_mode=true; fi
root_prefix=''
if [ "$test_mode" = true ]; then
    root_prefix="${MUSUW_STAGING_DEPLOY_GATE_VERIFY_ROOT:-}"
    [ -n "$root_prefix" ] || die 'staging gate verification test root is unavailable'
    root_prefix="$(cd "$root_prefix" && pwd -P)"
fi
path() { printf '%s%s' "$root_prefix" "$1"; }
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
require_file() { [ -f "$1" ] && [ ! -L "$1" ] || die "installed staging gate file is unavailable: $1"; }

ssh_gate="$(path /usr/local/libexec/musuw-staging-deploy-ssh-gate)"
root_gate="$(path /usr/local/sbin/musuw-staging-deploy-gate)"
authorized_keys="$(path /var/lib/musuw-staging-deploy/.ssh/authorized_keys)"
sudoers_file="$(path /etc/sudoers.d/musuw-staging-deploy)"
spool_root="$(path /var/lib/musuw-staging-deploy/incoming)"
release_root="$(path /opt/weknora-staging/releases)"
runtime_root="$(path /opt/weknora/staging-runtime)"
for required in "$ssh_gate" "$root_gate" "$authorized_keys" "$sudoers_file"; do require_file "$required"; done
[ -d "$spool_root" ] && [ ! -L "$spool_root" ] || die 'staging deployment spool root is unsafe'
[ -d "$release_root" ] && [ ! -L "$release_root" ] || die 'staging release root is unsafe'
[ -d "$runtime_root" ] && [ ! -L "$runtime_root" ] || die 'staging runtime root is unsafe'
[ "$(file_mode "$ssh_gate")" = 755 ] || die 'staging SSH gate mode is not 0755'
[ "$(file_mode "$root_gate")" = 755 ] || die 'staging root gate mode is not 0755'
[ "$(file_mode "$authorized_keys")" = 644 ] || die 'staging authorized_keys mode is not 0644'
[ "$(file_mode "$sudoers_file")" = 440 ] || die 'staging sudoers mode is not 0440'

[ "$(wc -l < "$authorized_keys" | tr -d ' ')" -eq 1 ] || die 'staging authorized_keys must contain one key'
authorized_line="$(tr -d '\r\n' < "$authorized_keys")"
case "$authorized_line" in
    'restrict,command="/usr/local/libexec/musuw-staging-deploy-ssh-gate" ssh-'*) ;;
    *) die 'staging deploy key is not forced through the fixed SSH gate' ;;
esac
expected_sudoers=$'Defaults!/usr/local/sbin/musuw-staging-deploy-gate secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nmusuw-staging-deploy ALL=(root) NOPASSWD: /usr/local/sbin/musuw-staging-deploy-gate'
[ "$(cat "$sudoers_file")" = "$expected_sudoers" ] || die 'staging sudoers allows a command other than fixed root gate'

if grep -Eq '(^|[[:space:]])(eval|bash[[:space:]]+-c|sh[[:space:]]+-c)([[:space:]]|$)' "$ssh_gate" "$root_gate"; then
    die 'staging gate contains arbitrary shell execution'
fi
grep -Fq 'SSH_ORIGINAL_COMMAND' "$ssh_gate" || die 'staging SSH gate does not parse the original command'
grep -Fq -- '--sender' "$ssh_gate" || die 'staging SSH gate does not reject rsync sender mode'
grep -Fq -- '--rsync-path=' "$ssh_gate" || die 'staging SSH gate does not reject rsync command hooks'
grep -Fq 'prepare|deploy)' "$ssh_gate" || die 'staging SSH gate has no fixed prepare/deploy protocol'
grep -Fq 'verify)' "$ssh_gate" || die 'staging SSH gate has no fixed digest-bound verify protocol'
grep -Fq 'safe_app_ref' "$ssh_gate" || die 'staging SSH gate does not validate the expected app digest'
grep -Fq 'safe_frontend_ref' "$ssh_gate" || die 'staging SSH gate does not validate the expected frontend digest'
grep -Fq 'musuw-staging-gate' "$ssh_gate" || die 'staging SSH gate command prefix is missing'
grep -Fq '/opt/weknora/staging-runtime' "$root_gate" || die 'staging root gate does not pin its runtime root'
grep -Fq '/opt/weknora-staging/releases' "$root_gate" || die 'staging root gate does not pin its release root'
grep -Fq 'source-manifest.sh' "$root_gate" || die 'staging root gate does not verify the transferred manifest'
grep -Fq 'release-ci.sh' "$root_gate" || die 'staging root gate does not invoke the fixed release helper'
if grep -Eq 'musuw-staging-gate (preflight|promote|run)|/opt/weknora/runtime|/var/lib/musuw-deploy' "$ssh_gate" "$root_gate"; then
    die 'staging gate retains production roots or an unreviewed third verb'
fi

if [ "$test_mode" = false ]; then
    [ "$(stat -c '%U' "$ssh_gate")" = root ] || die 'staging SSH gate is not root-owned'
    [ "$(stat -c '%U' "$root_gate")" = root ] || die 'staging root gate is not root-owned'
    command -v visudo >/dev/null 2>&1 || die 'visudo is unavailable'
    visudo -cf /etc/sudoers >/dev/null || die 'sudoers syntax is invalid'
fi
printf '%s\n' 'restricted musuw-staging-deploy installation verified'
