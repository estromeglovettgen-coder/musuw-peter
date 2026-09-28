#!/usr/bin/env bash
# Prepare root-only candidate configuration without printing any credentials.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime_dir="$repo_root/.runtime/weknora"
legacy_env="${WEKNORA_LEGACY_ENV:-$runtime_dir/local.source.env}"
secret_dir="$runtime_dir/secrets"
candidate_env="$runtime_dir/candidate.env"
auth_public_env="$runtime_dir/auth-public.env"

resolve_public_ipv4() {
    local host="$1"
    local response resolved

    # Do not use the host resolver here: the local Clash/fake-ip resolver
    # answers external model hosts with 198.18.0.0/15. Resolve through HTTPS
    # DNS instead and accept only a globally routable IPv4 address. This is a
    # local candidate input; the application's SSRF guard remains intact.
    response="$(curl --fail --silent --show-error --max-time 8 \
        -H 'accept: application/dns-json' \
        --get \
        --data-urlencode "name=$host" \
        --data-urlencode 'type=A' \
        'https://cloudflare-dns.com/dns-query')" || {
        printf '%s\n' "unable to resolve $host through HTTPS DNS" >&2
        exit 1
    }

    resolved="$(printf '%s' "$response" | python3 -c '
import ipaddress
import json
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)

for answer in payload.get("Answer", []):
    if answer.get("type") != 1:
        continue
    try:
        address = ipaddress.ip_address(str(answer.get("data", "")))
    except ValueError:
        continue
    if address.version == 4 and address.is_global:
        print(address)
        raise SystemExit(0)
raise SystemExit(1)
')" || {
        printf '%s\n' "HTTPS DNS returned no globally routable IPv4 for $host" >&2
        exit 1
    }

    printf '%s' "$resolved"
}

for required in "$legacy_env" "$secret_dir/oidc_client_id" "$secret_dir/oidc_client_secret" "$auth_public_env"; do
    if [ ! -r "$required" ]; then
        printf '%s\n' "candidate runtime prerequisite is unavailable" >&2
        exit 1
    fi
done

install -d -m 700 "$runtime_dir"
umask 077

# Reuse only existing WeKnora deployment settings. Candidate endpoint, port,
# volume, and OIDC settings are appended below as one authoritative override.
candidate_tmp="$(mktemp "$runtime_dir/candidate.env.XXXXXX")"
trap 'rm -f "$candidate_tmp"' EXIT

# These are the only external hosts referenced by the built-in model catalog:
# DeepSeek chat and OpenRouter's rerank/embedding/VLM/ASR models. Keep the
# list explicit and local-only instead of weakening SSRF or trusting arbitrary
# model configuration.
openrouter_public_ipv4="$(resolve_public_ipv4 openrouter.ai)"

awk '
  /^[[:space:]]*($|#)/ { next }
  /^[A-Za-z_][A-Za-z0-9_]*=/ {
    key = $0
    sub(/=.*/, "", key)
    if (key ~ /^OIDC_AUTH_/ ||
        key == "FRONTEND_PORT" || key == "APP_PORT" ||
        key == "APP_HOST" || key == "APP_BACKEND_PORT" || key == "APP_SCHEME" ||
        key == "FRONTEND_BASE_URL" || key == "APP_EXTERNAL_URL" ||
        key == "SEARXNG_PORT" || key == "SEARXNG_BIND" ||
        key == "WEKNORA_REDIS_NAMESPACE" || key == "COMPOSE_PROJECT_NAME" ||
        key == "AUTO_MIGRATE" || key == "DISABLE_REGISTRATION" ||
        key == "WEKNORA_AUTH_DEFAULT_TENANT_MODE" ||
        key == "MUSUW_DEPLOYMENT_ENVIRONMENT" ||
        key == "MUSUW_AUTH_PUBLIC_ORIGIN" ||
        key == "MUSUW_SUPABASE_URL" ||
        key == "MUSUW_SUPABASE_PUBLISHABLE_KEY" ||
        key == "MUSUW_WEKNORA_OAUTH_CLIENT_ID" ||
        key == "NEO4J_ENABLE" || key == "NEO4J_URI") next
    print
  }
' "$legacy_env" > "$candidate_tmp"

# This public build file is staged by the operator and remains the only source
# of auth-shell build values.  It is deliberately read but never regenerated,
# printed, copied into an image layer, or recovered from a live container.
public_origin="$(awk '/^VITE_AUTH_PUBLIC_ORIGIN=/{sub(/^VITE_AUTH_PUBLIC_ORIGIN=/, ""); print; exit}' "$auth_public_env")"
supabase_url="$(awk '/^VITE_SUPABASE_URL=/{sub(/^VITE_SUPABASE_URL=/, ""); print; exit}' "$auth_public_env")"
supabase_publishable_key="$(awk '/^VITE_SUPABASE_PUBLISHABLE_KEY=/{sub(/^VITE_SUPABASE_PUBLISHABLE_KEY=/, ""); print; exit}' "$auth_public_env")"
public_oidc_client_id="$(awk '/^VITE_WEKNORA_OAUTH_CLIENT_ID=/{sub(/^VITE_WEKNORA_OAUTH_CLIENT_ID=/, ""); print; exit}' "$auth_public_env")"
if [ -z "$public_origin" ] || [ -z "$supabase_url" ] || [ -z "$supabase_publishable_key" ] || [ -z "$public_oidc_client_id" ]; then
    printf '%s\n' "candidate runtime auth public configuration is incomplete" >&2
    exit 1
fi
supabase_authority="$(printf '%s' "$supabase_url" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://##; s#/.*$##')"
supabase_host="${supabase_authority%%:*}"
if [ -z "$supabase_host" ]; then
    printf '%s\n' "candidate runtime Supabase host is invalid" >&2
    exit 1
fi

# Preserve any deployment whitelist entries copied from the old WeKnora env,
# then add only the configured OIDC issuer host. The native upstream service
# uses SSRF_WHITELIST_EXTRA precisely for deployment-controlled sidecars and
# trusted endpoints; no private CIDR or wildcard is introduced here.
existing_ssrf_extra="$(awk -F= '/^SSRF_WHITELIST_EXTRA=/{print $2; exit}' "$candidate_tmp")"
if [ -n "$existing_ssrf_extra" ]; then
    candidate_ssrf_extra="${existing_ssrf_extra},${supabase_host}"
else
    candidate_ssrf_extra="searxng,qdrant,milvus,weaviate,doris-fe,doris-be,${supabase_host}"
fi

oidc_client_id="$(tr -d '\r\n' < "$secret_dir/oidc_client_id")"
if [ -z "$oidc_client_id" ]; then
    printf '%s\n' "candidate runtime OIDC client id is empty" >&2
    exit 1
fi
if [ "$public_oidc_client_id" != "$oidc_client_id" ]; then
    printf '%s\n' "candidate runtime OIDC client id does not match the staged auth configuration" >&2
    exit 1
fi

printf '%s\n' \
    'WEKNORA_CANDIDATE_FRONTEND_PORT=4190' \
    'WEKNORA_CANDIDATE_APP_PORT=18090' \
    'WEKNORA_CANDIDATE_SEARXNG_PORT=8890' \
    'WEKNORA_CANDIDATE_POSTGRES_VOLUME=weknora-v072-candidate-postgres-data' \
    'WEKNORA_CANDIDATE_FILES_VOLUME=weknora-v072-candidate-data-files' \
    'WEKNORA_CANDIDATE_DOCREADER_TMP_VOLUME=weknora-v072-candidate-docreader-tmp' \
    'WEKNORA_CANDIDATE_NEO4J_VOLUME=weknora-v072-candidate-neo4j-data' \
    'WEKNORA_CANDIDATE_SEARXNG_CONFIG_VOLUME=weknora-v072-candidate-searxng-config' \
    "WEKNORA_CANDIDATE_OPENROUTER_IP=$openrouter_public_ipv4" \
    'APK_MIRROR_ARG=mirrors.aliyun.com' \
    'APP_HOST=app' \
    'APP_BACKEND_PORT=8080' \
    'APP_SCHEME=http' \
    'FRONTEND_BASE_URL=http://localhost:4190' \
    'APP_EXTERNAL_URL=http://localhost:4190' \
    'MUSUW_DEPLOYMENT_ENVIRONMENT=staging' \
    "MUSUW_AUTH_PUBLIC_ORIGIN=${public_origin}" \
    "MUSUW_SUPABASE_URL=${supabase_url}" \
    "MUSUW_SUPABASE_PUBLISHABLE_KEY=${supabase_publishable_key}" \
    "MUSUW_WEKNORA_OAUTH_CLIENT_ID=${public_oidc_client_id}" \
    'SEARXNG_BIND=127.0.0.1' \
    'WEKNORA_REDIS_NAMESPACE=weknora-v072-candidate' \
    'AUTO_MIGRATE=true' \
    'DISABLE_REGISTRATION=false' \
    'WEKNORA_AUTH_DEFAULT_TENANT_MODE=create_personal' \
    'NEO4J_ENABLE=true' \
    'NEO4J_URI=bolt://neo4j:7687' \
    "SSRF_WHITELIST_EXTRA=${candidate_ssrf_extra}" \
    'OIDC_AUTH_ENABLE=true' \
    "OIDC_AUTH_ISSUER_URL=${supabase_url}/auth/v1" \
    "OIDC_AUTH_DISCOVERY_URL=${supabase_url}/auth/v1/.well-known/openid-configuration" \
    'OIDC_AUTH_PROVIDER_DISPLAY_NAME=Musuw' \
    'OIDC_AUTH_SCOPES=openid profile email' \
    'OIDC_USER_INFO_MAPPING_USER_NAME=name' \
    'OIDC_USER_INFO_MAPPING_EMAIL=email' >> "$candidate_tmp"

chmod 600 "$candidate_tmp"
mv "$candidate_tmp" "$candidate_env"
trap - EXIT

printf '%s\n' "candidate runtime configuration prepared at $runtime_dir"
