#!/usr/bin/env bash
# Small, deterministic high-confidence scan over the checked-in tree.  Runtime
# .env files, node_modules and generated output are not source authority and are
# therefore never copied into a release or scanned as repository content.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$repo_root"

if git ls-files -z -- '.env' '.env.*' '*.pem' '*.key' '*.p12' '*.pfx' '*.crt' |
  tr '\0' '\n' | grep -Ev '(^|/)(\.env\.example|\.env\.local\.example)$' | grep -q .; then
  printf '%s\n' 'secret scan: tracked secret-bearing file path found' >&2
  exit 1
fi

patterns=(
  '-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) PRIVATE KEY-----'
  '(^|[^A-Za-z0-9])(AKIA[0-9A-Z]{16})([^A-Za-z0-9]|$)'
  '(^|[^A-Za-z0-9])(gh[pousr]_[A-Za-z0-9]{20,})([^A-Za-z0-9]|$)'
  '(^|[^A-Za-z0-9])(github_pat_[A-Za-z0-9_]{20,})([^A-Za-z0-9]|$)'
  '(^|[^A-Za-z0-9])(xox[baprs]-[A-Za-z0-9-]{10,})([^A-Za-z0-9]|$)'
  '(^|[^A-Za-z0-9])(AIza[0-9A-Za-z_-]{30,})([^A-Za-z0-9]|$)'
)

for pattern in "${patterns[@]}"; do
  if git grep -nI -E -e "$pattern" -- . \
    ':(exclude)**/node_modules/**' \
    ':(exclude)**/dist/**' \
    ':(exclude)**/.runtime/**' \
    ':(exclude)**/.env.example' \
    ':(exclude)**/.env.*.example'; then
    printf '%s\n' 'secret scan: high-confidence credential indicator found' >&2
    exit 1
  fi
done

printf '%s\n' 'secret scan green: no high-confidence credential indicators in tracked source'
