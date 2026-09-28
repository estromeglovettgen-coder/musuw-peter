#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
compose_file="$repo_root/integration/weknora-production/compose.yaml"

[ -f "$compose_file" ] || {
    printf '%s\n' 'production Compose definition is missing' >&2
    exit 1
}

postgres_block="$(sed -n '/^  postgres:/,/^  [[:alnum:]_.-]*:/p' "$compose_file")"
printf '%s\n' "$postgres_block" | grep -Fq 'healthcheck:' || {
    printf '%s\n' 'production PostgreSQL healthcheck must be explicit' >&2
    exit 1
}
printf '%s\n' "$postgres_block" | grep -Eq 'pg_isready[[:space:]]+-U[[:space:]]+\$\{DB_USER[^}]*\}[[:space:]]+-d[[:space:]]+\$\{DB_NAME[^}]*\}' || {
    printf '%s\n' 'production PostgreSQL healthcheck must target the configured database' >&2
    exit 1
}

printf '%s\n' 'production PostgreSQL healthcheck contract passed'
