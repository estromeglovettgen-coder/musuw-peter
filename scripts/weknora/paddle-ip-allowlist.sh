#!/usr/bin/env bash
# Fetch Paddle's current IPv4 webhook ranges for one fixed environment and
# atomically render an Nginx geo include. The URL is deliberately selected
# here so callers cannot redirect this helper to an arbitrary endpoint.
set -euo pipefail

die() { printf '%s\n' "$1" >&2; exit 1; }

[ "$#" -eq 2 ] || die 'usage: paddle-ip-allowlist.sh <live|sandbox> <output-directory>'
environment="$1"
output_dir="$2"
case "$environment" in
    live) api_url='https://api.paddle.com/ips' ;;
    sandbox) api_url='https://sandbox-api.paddle.com/ips' ;;
    *) die 'Paddle environment must be live or sandbox' ;;
esac

command -v curl >/dev/null 2>&1 || die 'curl is required'
command -v jq >/dev/null 2>&1 || die 'jq is required'
[ -n "$output_dir" ] || die 'output directory is empty'
[ ! -L "$output_dir" ] || die 'output directory must not be a symlink'
install -d -m 755 "$output_dir"

response="$(curl -fsS --proto '=https' --tlsv1.2 --connect-timeout 10 --retry 2 --max-time 20 "$api_url")" || die 'Paddle IP range request failed'
cidr_text="$(printf '%s' "$response" | jq -er '
    if (.data | type) != "object" or (.data.ipv4_cidrs | type) != "array" or
       (.data.ipv4_cidrs | length) == 0 then error("ipv4_cidrs must be non-empty")
    else .data.ipv4_cidrs[]
    end
')" || die 'Paddle IP range response is invalid JSON'
cidrs=()
while IFS= read -r cidr; do
    [ -n "$cidr" ] && cidrs+=("$cidr")
done <<< "$cidr_text"

((${#cidrs[@]} > 0)) || die 'Paddle IPv4 range list is empty'
for cidr in "${cidrs[@]}"; do
    [[ "$cidr" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/32$ ]] ||
        die 'Paddle IPv4 range is not an IPv4 /32'
    address="${cidr%/32}"
    IFS=. read -r -a octets <<< "$address"
    ((${#octets[@]} == 4)) || die 'Paddle IPv4 range has an invalid octet count'
    for octet in "${octets[@]}"; do
        [[ "$octet" =~ ^[0-9]{1,3}$ ]] || die 'Paddle IPv4 range has a non-numeric octet'
        case "$octet" in
            0|[1-9]|[1-9][0-9]|[1-9][0-9][0-9]) ;;
            *) die 'Paddle IPv4 range has a non-canonical octet' ;;
        esac
        ((10#$octet <= 255)) || die 'Paddle IPv4 range octet is out of bounds'
    done
done

unique_count="$(printf '%s\n' "${cidrs[@]}" | sort -u | wc -l | tr -d ' ')"
[ "$unique_count" -eq "${#cidrs[@]}" ] || die 'Paddle IPv4 range list contains duplicates'

tmp_file="$(mktemp "$output_dir/.allowlist.XXXXXX")"
cleanup() { rm -f "$tmp_file"; }
trap cleanup EXIT
{
    printf '# Generated from %s; do not edit.\n' "$api_url"
    for cidr in "${cidrs[@]}"; do
        printf '%s 1;\n' "${cidr%/32}"
    done
} > "$tmp_file"
chmod 644 "$tmp_file"
mv -f "$tmp_file" "$output_dir/allowlist.conf"
trap - EXIT
printf '%s\n' "Paddle $environment IPv4 allowlist updated"
