#!/usr/bin/env bash
# One-time, operator-run bootstrap for the restricted production deploy key.
# It must be copied to the host through the existing root channel and run by
# root. It never removes an old root key; revocation is a separate reviewed
# operation after the new protocol has passed its negative tests.
set -euo pipefail

die() {
    printf '%s\n' "$1" >&2
    exit 1
}

usage() {
    printf '%s\n' 'usage: bootstrap-musuw-deploy.sh <public-key-file>' >&2
    exit 2
}

[ "$#" -eq 1 ] || usage
[ "${EUID:-1}" -eq 0 ] || die 'bootstrap must run as root'
public_key_file="$1"
[ -f "$public_key_file" ] && [ ! -L "$public_key_file" ] || die 'public key file is unavailable'

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ssh_gate_source="$script_dir/musuw-deploy-ssh-gate"
root_gate_source="$script_dir/musuw-deploy-gate"
verify_source="$script_dir/verify-musuw-deploy-gate.sh"
for required in "$ssh_gate_source" "$root_gate_source" "$verify_source"; do
    [ -f "$required" ] && [ -r "$required" ] || die "bootstrap source is unavailable: $required"
done

# Both installed wrappers expose only the reviewed prepare/deploy verbs. Check
# the protocol before changing the host so an old three-step gate cannot be
# installed accidentally.
grep -Fq 'prepare' "$ssh_gate_source" || die 'SSH gate source does not expose prepare'
grep -Fq 'deploy' "$ssh_gate_source" || die 'SSH gate source does not expose deploy'
grep -Fq 'prepare' "$root_gate_source" || die 'root gate source does not expose prepare'
grep -Fq 'deploy' "$root_gate_source" || die 'root gate source does not expose deploy'

command -v ssh-keygen >/dev/null 2>&1 || die 'ssh-keygen is unavailable'
command -v install >/dev/null 2>&1 || die 'install is unavailable'
command -v visudo >/dev/null 2>&1 || die 'visudo is unavailable'
command -v usermod >/dev/null 2>&1 || die 'usermod is unavailable'
command -v openssl >/dev/null 2>&1 || die 'openssl is unavailable'
command -v getent >/dev/null 2>&1 || die 'getent is unavailable'

# A public key is one physical line and must be parseable by ssh-keygen. Do not
# interpolate arbitrary text into authorized_keys or sudoers.
line_count="$(wc -l < "$public_key_file" | tr -d ' ')"
[ "$line_count" -eq 1 ] || die 'public key file must contain exactly one line'
public_key="$(tr -d '\r\n' < "$public_key_file")"
case "$public_key" in
    *','*|*'"'*|*"'"*|*';'*|*'\'*|*'`'*) die 'public key contains shell or option syntax' ;;
esac
ssh-keygen -lf <(printf '%s\n' "$public_key") >/dev/null 2>&1 || die 'public key is not a valid SSH key'

deploy_user='musuw-deploy'
deploy_home='/var/lib/musuw-deploy'
deploy_shell='/bin/sh'
ssh_dir="$deploy_home/.ssh"
authorized_keys="$ssh_dir/authorized_keys"
ssh_gate_install='/usr/local/libexec/musuw-deploy-ssh-gate'
root_gate_install='/usr/local/sbin/musuw-deploy-gate'
sudoers_install='/etc/sudoers.d/musuw-deploy'
spool_root='/var/lib/musuw-deploy/incoming'
secure_path='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

if ! id "$deploy_user" >/dev/null 2>&1; then
    command -v useradd >/dev/null 2>&1 || die 'useradd is unavailable'
    useradd --system --create-home --home-dir "$deploy_home" --shell "$deploy_shell" "$deploy_user"
fi
usermod --shell "$deploy_shell" "$deploy_user"
# A system account is initially password-locked on Ubuntu.  SSH public-key
# authentication still consults PAM, so retain an unknown high-entropy hash
# rather than leaving the account locked (or passwordless).  Password and
# keyboard-interactive authentication are disabled in sshd_config; this hash
# is never printed or exposed to the operator.
password_field="$(getent shadow "$deploy_user" | awk -F: -v user="$deploy_user" '$1 == user { print $2; exit }')"
case "$password_field" in
    \$*) ;;
    *)
        random_password="$(openssl rand -hex 48)"
        random_salt="$(openssl rand -hex 8)"
        password_hash="$(openssl passwd -6 -salt "$random_salt" "$random_password")"
        case "$password_hash" in
            \$6\$*) ;;
            *) die 'openssl did not produce a password hash' ;;
        esac
        usermod --password "$password_hash" "$deploy_user"
        unset random_password random_salt password_hash
        ;;
esac
# Keep the account's home and authorized_keys root-owned; only the explicitly
# created incoming source directories are writable by musuw-deploy.
install -d -o root -g root -m 755 "$deploy_home" "$ssh_dir"
install -d -o root -g root -m 755 /usr/local/libexec /usr/local/sbin "$spool_root"

backup_dir="/root/musuw-deploy-bootstrap-backup-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -o root -g root -m 700 "$backup_dir"
for existing in "$authorized_keys" "$sudoers_install"; do
    if [ -e "$existing" ] && [ ! -L "$existing" ]; then
        install -o root -g root -m 600 "$existing" "$backup_dir/$(basename "$existing")"
    fi
done

authorized_tmp="$authorized_keys.tmp.$$"
printf 'restrict,command="%s" %s\n' "$ssh_gate_install" "$public_key" > "$authorized_tmp"
chown root:root "$authorized_tmp"
chmod 644 "$authorized_tmp"
mv -f "$authorized_tmp" "$authorized_keys"

install -o root -g root -m 755 "$ssh_gate_source" "$ssh_gate_install"
install -o root -g root -m 755 "$root_gate_source" "$root_gate_install"

sudoers_tmp="$sudoers_install.tmp.$$"
printf 'Defaults!%s secure_path="%s"\n%s\n' \
    "$root_gate_install" "$secure_path" \
    "${deploy_user} ALL=(root) NOPASSWD: ${root_gate_install}" > "$sudoers_tmp"
chown root:root "$sudoers_tmp"
chmod 440 "$sudoers_tmp"
visudo -cf "$sudoers_tmp" >/dev/null
mv -f "$sudoers_tmp" "$sudoers_install"
visudo -cf /etc/sudoers >/dev/null

printf '%s\n' 'restricted musuw-deploy bootstrap installed; retain the old root key until verify and rehearsal pass'
printf '%s\n' "bootstrap backup: $backup_dir"
