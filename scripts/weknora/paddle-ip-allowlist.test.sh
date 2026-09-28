#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
helper="$repo_root/scripts/weknora/paddle-ip-allowlist.sh"
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

fail() { printf '%s\n' "$1" >&2; exit 1; }

nginx_template="$repo_root/integration/weknora-production/nginx.conf.template"
grep -Fq 'geo $http_cf_connecting_ip $paddle_webhook_source_allowed' "$nginx_template" || fail 'Nginx does not gate Paddle IPs from CF-Connecting-IP'
grep -Fq 'include /etc/nginx/paddle-ips/allowlist.conf;' "$nginx_template" || fail 'Nginx allowlist include is missing'
grep -Fq 'location = /api/v1/billing/paddle/webhook' "$nginx_template" || fail 'Nginx webhook exact location is missing'
grep -Fq 'paddle-ips:/etc/nginx/paddle-ips:ro' "$repo_root/integration/weknora-production/compose.yaml" || fail 'production frontend mount is not read-only and separate'
grep -Fq 'paddle-ips:/etc/nginx/paddle-ips:ro' "$repo_root/integration/weknora-staging/compose.yaml" || fail 'staging frontend mount is not read-only and separate'
if grep -Eq '[0-9]{1,3}(\.[0-9]{1,3}){3}/32' "$nginx_template"; then fail 'Nginx template hardcodes a Paddle IP'; fi
fake_bin="$tmp_root/bin"
mkdir -p "$fake_bin"
cat > "$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${!#}" > "${PADDLE_TEST_URL_LOG:?}"
if [ "${PADDLE_TEST_CURL_FAIL:-0}" = 1 ]; then exit 22; fi
cat "${PADDLE_TEST_BODY:?}"
EOF
chmod +x "$fake_bin/curl"

run_helper() {
    PATH="$fake_bin:$PATH" PADDLE_TEST_BODY="$1" PADDLE_TEST_URL_LOG="$tmp_root/url" \
        "$helper" "$2" "$tmp_root/out"
}
expect_fail() {
    if run_helper "$1" "$2" >/dev/null 2>&1; then fail "expected helper failure for $3"; fi
}

cat > "$tmp_root/good.json" <<'EOF'
{"data":{"ipv4_cidrs":["203.0.113.1/32","198.51.100.2/32"]}}
EOF
run_helper "$tmp_root/good.json" live
grep -Fqx '# Generated from https://api.paddle.com/ips; do not edit.' "$tmp_root/out/allowlist.conf" || fail 'live URL was not fixed'
grep -Fqx '203.0.113.1 1;' "$tmp_root/out/allowlist.conf" || fail 'valid range missing'
grep -Fqx 'https://api.paddle.com/ips' "$tmp_root/url" || fail 'live endpoint mismatch'

cat > "$tmp_root/sandbox.json" <<'EOF'
{"data":{"ipv4_cidrs":["203.0.113.9/32"]}}
EOF
run_helper "$tmp_root/sandbox.json" sandbox
grep -Fqx 'https://sandbox-api.paddle.com/ips' "$tmp_root/url" || fail 'sandbox endpoint mismatch'

for fixture in empty bad_json non32 out_of_bounds leading_zero duplicate; do
    case "$fixture" in
        empty) printf '%s\n' '{"data":{"ipv4_cidrs":[]}}' > "$tmp_root/$fixture.json" ;;
        bad_json) printf '%s\n' '{' > "$tmp_root/$fixture.json" ;;
        non32) printf '%s\n' '{"data":{"ipv4_cidrs":["203.0.113.1/24"]}}' > "$tmp_root/$fixture.json" ;;
        out_of_bounds) printf '%s\n' '{"data":{"ipv4_cidrs":["256.0.0.1/32"]}}' > "$tmp_root/$fixture.json" ;;
        leading_zero) printf '%s\n' '{"data":{"ipv4_cidrs":["203.0.113.01/32"]}}' > "$tmp_root/$fixture.json" ;;
        duplicate) printf '%s\n' '{"data":{"ipv4_cidrs":["203.0.113.1/32","203.0.113.1/32"]}}' > "$tmp_root/$fixture.json" ;;
    esac
    old="$(cat "$tmp_root/out/allowlist.conf")"
    expect_fail "$tmp_root/$fixture.json" live "$fixture"
    [ "$old" = "$(cat "$tmp_root/out/allowlist.conf")" ] || fail "$fixture changed existing allowlist"
done

old="$(cat "$tmp_root/out/allowlist.conf")"
if PATH="$fake_bin:$PATH" PADDLE_TEST_BODY="$tmp_root/good.json" PADDLE_TEST_URL_LOG="$tmp_root/url" \
    PADDLE_TEST_CURL_FAIL=1 "$helper" live "$tmp_root/out" >/dev/null 2>&1; then
    fail 'curl failure unexpectedly succeeded'
fi
[ "$old" = "$(cat "$tmp_root/out/allowlist.conf")" ] || fail 'curl failure changed existing allowlist'

if "$helper" https://attacker.invalid "$tmp_root/out" >/dev/null 2>&1; then fail 'arbitrary URL accepted'; fi
printf '%s\n' 'Paddle IP allowlist helper tests passed'
