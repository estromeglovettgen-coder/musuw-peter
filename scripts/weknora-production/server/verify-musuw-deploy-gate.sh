#!/usr/bin/env bash
# Read-only verification for the installed restricted deploy seam.
set -euo pipefail

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

test_mode=false
if [ "${MUSUW_DEPLOY_GATE_VERIFY_TEST_MODE:-0}" = 1 ] && [ "${EUID:-1}" -ne 0 ]; then
    test_mode=true
fi
root_prefix=''
if [ "$test_mode" = true ]; then
    root_prefix="${MUSUW_DEPLOY_GATE_VERIFY_ROOT:-}"
    [ -n "$root_prefix" ] || die 'verification test root is unavailable'
    root_prefix="$(cd "$root_prefix" && pwd -P)"
fi

path() {
    printf '%s%s' "$root_prefix" "$1"
}

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

require_file() {
    [ -f "$1" ] && [ ! -L "$1" ] || die "installed gate file is unavailable: $1"
}

ssh_gate="$(path /usr/local/libexec/musuw-deploy-ssh-gate)"
root_gate="$(path /usr/local/sbin/musuw-deploy-gate)"
authorized_keys="$(path /var/lib/musuw-deploy/.ssh/authorized_keys)"
sudoers_file="$(path /etc/sudoers.d/musuw-deploy)"
spool_root="$(path /var/lib/musuw-deploy/incoming)"
for required in "$ssh_gate" "$root_gate" "$authorized_keys" "$sudoers_file"; do
    require_file "$required"
done
[ -d "$spool_root" ] && [ ! -L "$spool_root" ] || die 'deployment spool root is unsafe'
[ "$(file_mode "$ssh_gate")" = 755 ] || die 'SSH gate mode is not 0755'
[ "$(file_mode "$root_gate")" = 755 ] || die 'root gate mode is not 0755'
# sshd's privilege-separated key reader opens this public file as the sshd
# account; root ownership prevents writes while 0644 keeps it readable.
[ "$(file_mode "$authorized_keys")" = 644 ] || die 'authorized_keys mode is not 0644'
[ "$(file_mode "$sudoers_file")" = 440 ] || die 'sudoers mode is not 0440'

line_count="$(wc -l < "$authorized_keys" | tr -d ' ')"
[ "$line_count" -eq 1 ] || die 'authorized_keys must contain exactly one deploy key'
authorized_line="$(tr -d '\r\n' < "$authorized_keys")"
case "$authorized_line" in
    'restrict,command="/usr/local/libexec/musuw-deploy-ssh-gate" ssh-'*) ;;
    *) die 'authorized deploy key is not forced to the SSH gate with restrict' ;;
esac

if [ "$test_mode" = false ]; then
    deploy_user='musuw-deploy'
    deploy_record="$(getent passwd "$deploy_user")" || die 'dedicated deployment account is unavailable'
    deploy_shell="$(printf '%s\n' "$deploy_record" | awk -F: '{print $7}')"
    [ "$deploy_shell" = /bin/sh ] || die 'dedicated deployment account shell is not /bin/sh'
    shadow_record="$(getent shadow "$deploy_user")" || die 'dedicated deployment shadow record is unavailable'
    password_field="$(printf '%s\n' "$shadow_record" | awk -F: '{print $2}')"
    case "$password_field" in
        ''|'!'|'!!'|'*'|'!'* ) die 'dedicated deployment account password is empty or locked' ;;
        \$*) ;;
        *) die 'dedicated deployment account password hash is not crypt-formatted' ;;
    esac
fi

expected_sudoers=$'Defaults!/usr/local/sbin/musuw-deploy-gate secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nmusuw-deploy ALL=(root) NOPASSWD: /usr/local/sbin/musuw-deploy-gate'
[ "$(cat "$sudoers_file")" = "$expected_sudoers" ] || die 'sudoers allows a command other than the fixed root gate'

# These are source-level invariants for the parser. The installed gate must not
# grow an eval or a caller-provided shell path between bootstrap runs.
if grep -Eq '(^|[[:space:]])(eval|bash[[:space:]]+-c|sh[[:space:]]+-c)([[:space:]]|$)' "$ssh_gate"; then
    die 'SSH gate contains an arbitrary shell execution primitive'
fi
grep -Fq 'SSH_ORIGINAL_COMMAND' "$ssh_gate" || die 'SSH gate does not parse SSH_ORIGINAL_COMMAND'
grep -Fq -- '--sender' "$ssh_gate" || die 'SSH gate does not reject rsync sender mode'
grep -Fq -- '--rsync-path=' "$ssh_gate" || die 'SSH gate does not reject rsync command hooks'
grep -Fq 'source/deploy' "$ssh_gate" || die 'SSH gate has no destination allowlist'
grep -Fq 'prepare|deploy' "$ssh_gate" || die 'SSH gate does not expose prepare/deploy'
grep -Fq 'musuw-gate' "$ssh_gate" || die 'SSH gate does not parse the fixed gate command'
grep -Fq "PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'" "$root_gate" || die 'root gate does not pin a safe command path'
grep -Fq 'WEKNORA_PRODUCTION_RUNTIME_DIR' "$root_gate" || die 'root gate does not pin the server runtime directory'
grep -Fq 'release source contains a symbolic link' "$root_gate" || die 'root gate does not reject release symlinks'
grep -Fq 'prepare)' "$root_gate" || die 'root gate does not expose prepare'
grep -Fq 'deploy)' "$root_gate" || die 'root gate does not expose deploy'
grep -Fq 'source-manifest.sh' "$root_gate" || die 'root gate does not verify the transferred manifest'
grep -Fq 'release-ci.sh' "$root_gate" || die 'root gate does not invoke the fixed release helper'

if grep -Eq 'musuw-gate (preflight|promote|run)|minimum_capacity_floor_kib|minimum_free_kib' "$ssh_gate" "$root_gate"; then
    die 'installed gate retains the removed capacity or three-verb protocol'
fi

if [ "$test_mode" = false ]; then
    [ "$(stat -c '%U' "$ssh_gate")" = root ] || die 'SSH gate is not root-owned'
    [ "$(stat -c '%U' "$root_gate")" = root ] || die 'root gate is not root-owned'
    [ "$(stat -c '%U' "$authorized_keys")" = root ] || die 'authorized_keys is not root-owned'
    [ "$(stat -c '%U' "$sudoers_file")" = root ] || die 'sudoers file is not root-owned'
    command -v visudo >/dev/null 2>&1 || die 'visudo is unavailable'
    visudo -cf /etc/sudoers >/dev/null || die 'sudoers syntax is invalid'
fi

printf '%s\n' 'restricted musuw-deploy installation verified'
