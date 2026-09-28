#!/usr/bin/env bash
# Read-only contract for the one-time bootstrap entry point. A non-root local
# runner must fail before inspecting or mutating any host path.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
bootstrap="$script_dir/bootstrap-musuw-deploy.sh"
verify="$script_dir/verify-musuw-deploy-gate.sh"
root_gate="$script_dir/musuw-deploy-gate"
ssh_gate="$script_dir/musuw-deploy-ssh-gate"

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

[ -x "$bootstrap" ] || fail 'bootstrap script is not executable'
[ -x "$verify" ] || fail 'gate verifier is not executable'
[ -x "$root_gate" ] || fail 'root gate is not executable'
[ -x "$ssh_gate" ] || fail 'SSH gate is not executable'

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/musuw-bootstrap.XXXXXX")"
public_key="$tmp_dir/test.pub"
printf '%s\n' 'not-a-key' > "$public_key"
if "$bootstrap" "$public_key" >/dev/null 2>&1; then
    fail 'bootstrap unexpectedly ran without root'
fi

grep -Fq 'bootstrap must run as root' "$bootstrap" || fail 'bootstrap does not fail closed for non-root callers'
grep -Fq 'restrict,command=' "$bootstrap" || fail 'bootstrap does not force the deploy key through the SSH gate'
grep -Fq '/usr/local/sbin/musuw-deploy-gate' "$bootstrap" || fail 'bootstrap does not install the fixed root wrapper'
grep -Fq 'NOPASSWD:' "$bootstrap" || fail 'bootstrap does not install a non-interactive fixed sudo rule'
grep -Fq 'secure_path=' "$bootstrap" || fail 'bootstrap does not pin sudo secure_path for the gate'
grep -Fq 'visudo -cf' "$bootstrap" || fail 'bootstrap does not validate sudoers before activation'
grep -Fq "deploy_shell='/bin/sh'" "$bootstrap" || fail 'bootstrap does not pin the deploy shell to /bin/sh'
grep -Fq 'openssl passwd -6' "$bootstrap" || fail 'bootstrap does not provision an unknown password hash'
grep -Fq 'chmod 644' "$bootstrap" || fail 'bootstrap does not make authorized_keys readable to sshd'
grep -Fq 'authorized_keys mode is not 0644' "$verify" || fail 'verifier does not require the sshd-readable authorized_keys mode'
grep -Fq 'dedicated deployment account shell is not /bin/sh' "$verify" || fail 'verifier does not reject an interactive deploy shell'
grep -Fq 'password is empty or locked' "$verify" || fail 'verifier does not reject empty or locked deploy passwords'
grep -Fq 'retain the old root key' "$bootstrap" || fail 'bootstrap does not preserve the rollback key during migration'
grep -Fq 'prepare' "$bootstrap" || fail 'bootstrap does not install the prepare protocol'
grep -Fq 'deploy' "$bootstrap" || fail 'bootstrap does not install the deploy protocol'
grep -Fq 'prepare)' "$root_gate" || fail 'root gate does not expose prepare'
grep -Fq 'deploy)' "$root_gate" || fail 'root gate does not expose deploy'
grep -Fq 'prepare|deploy' "$ssh_gate" || fail 'SSH gate does not expose prepare/deploy'
if grep -Eq 'minimum_capacity_floor_kib|minimum_free_kib|musuw-gate (preflight|promote|run)' "$bootstrap" "$root_gate" "$ssh_gate"; then
    fail 'bootstrap sources retain the removed capacity or three-verb protocol'
fi
if grep -Eq 'authorized_keys.*(rm|truncate)|ssh-keygen.*-R|sed[[:space:]]+-i' "$bootstrap"; then
    fail 'bootstrap contains an unreviewed destructive key-removal operation'
fi

printf '%s\n' 'restricted musuw-deploy bootstrap contract green'
