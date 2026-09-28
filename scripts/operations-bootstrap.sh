#!/usr/bin/env bash
# One-time root installation from the reviewed GitHub revision. No secrets in this file.
set -euo pipefail
[ "$#" -eq 1 ] && [ "$EUID" -eq 0 ] || { echo 'usage (root): operations-bootstrap.sh PUBLIC_KEY_FILE' >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd -P)"
key_file="$1"
[ -f "$key_file" ] && [ ! -L "$key_file" ]
[ "$(wc -l < "$key_file" | tr -d ' ')" = 1 ]
ssh-keygen -lf "$key_file" >/dev/null
public_key="$(cat "$key_file")"
[[ "$public_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]]
# The shared SSH dispatcher must already have its reviewed operations-only branch.
grep -Fq 'operations-only' /usr/local/libexec/musuw-deploy-ssh-gate
for account in musuw-operations musuw-operations-deploy; do
    id "$account" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/var/lib/$account" --shell /usr/sbin/nologin "$account"
done
usermod --shell /bin/sh musuw-operations-deploy
# OpenSSH/PAM rejects a locked account even with a forced-command key.
password_field="$(getent shadow musuw-operations-deploy | cut -d: -f2)"
if [[ ! "$password_field" =~ ^\$ ]]; then
    password_hash="$(openssl rand -hex 48 | openssl passwd -6 -stdin)"
    usermod --password "$password_hash" musuw-operations-deploy
    unset password_hash
fi
install -d -o root -g root -m 755 /opt/musuw-operations /opt/musuw-operations/releases /var/lib/musuw-operations-deploy/.ssh
install -d -o root -g musuw-operations -m 750 /opt/musuw-operations/runtime
install -d -o musuw-operations -g musuw-operations -m 700 /opt/musuw-operations/runtime/secrets
install -o root -g root -m 755 "$root/scripts/operations-deploy-gate" /usr/local/sbin/musuw-operations-deploy-gate
install -o root -g root -m 755 "$root/scripts/operations-artifact.py" /usr/local/libexec/musuw-operations-artifact.py
install -o root -g root -m 755 "$root/scripts/operations-database-host" /usr/local/libexec/musuw-operations-database-host
install -o root -g root -m 644 "$root/integration/operations/musuw-operations.service" /etc/systemd/system/musuw-operations.service
keys=/var/lib/musuw-operations-deploy/.ssh/authorized_keys
printf 'restrict,command="/usr/local/libexec/musuw-deploy-ssh-gate operations-only" %s\n' "$public_key" > "$keys"
chown root:root "$keys"
# sshd reads this public file as the deploy user; root ownership prevents edits.
chmod 644 "$keys"
sudoers=/etc/sudoers.d/musuw-operations-deploy
printf 'Defaults:musuw-operations-deploy secure_path="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nmusuw-operations-deploy ALL=(root) NOPASSWD: /usr/local/sbin/musuw-operations-deploy-gate\n' > "$sudoers.tmp"
chmod 440 "$sudoers.tmp"
visudo -cf "$sudoers.tmp" >/dev/null
mv -f "$sudoers.tmp" "$sudoers"
systemctl daemon-reload
systemctl enable musuw-operations.service
printf '%s\n' 'operations deployment seam installed; protected runtime and first GitHub artifact are still required'
