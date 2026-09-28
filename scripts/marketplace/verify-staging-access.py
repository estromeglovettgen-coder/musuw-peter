#!/usr/bin/env python3
"""Staging fixture acceptance. Default: authorization probes, no positive model call.

--auth-only prepares buyer-session.json before marketplace deployment.
--ask-product KEY makes exactly one approved Flash question after UI payment.
Only server-issued tokens from the normal Supabase password + OIDC/PKCE flow
are accepted. No admin identity API, database mutation, or JWT construction.
OAuth wire contract: auth/src/runtime.ts and Supabase auth-js GoTrueClient
_getAuthorizationDetails/_approveAuthorization (GET authorization, POST consent).
"""
import argparse
import base64
import http.cookiejar
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / ".runtime/creator-marketplace"
ARTIFACTS = ROOT / "artifacts/creator-marketplace-20260922"
ORIGIN = "https://staging.musuw.com"
IDENTITY = "https://achfnnicetupvtoqiwqd.supabase.co"
CALLBACK = ORIGIN + "/api/v1/auth/oidc/callback"
FLASH = "builtin-deepseek-v4-flash"
BUYER_EMAIL = "creator-marketplace-buyer-20260922@example.com"
ADMIN_EMAIL = "creator-marketplace-admin-20260922@example.com"
MEMBERSHIP_FIELDS = ("plan", "plan_status", "monthly_openrouter_microusd",
                     "max_knowledge_bases", "max_documents_per_kb", "storage_bytes")
METER_FIELDS = ("openrouter_consumer_used_microusd", "openrouter_consumer_remaining_microusd",
                "openrouter_provider_used_microusd", "openrouter_provider_remaining_microusd",
                "openrouter_credits_status")
PRIVATE_FIELDS = {"agent_snapshot", "system_prompt", "config", "tenant_id", "creator_tenant_id",
                  "creator_user_id", "creator_name", "contact", "authorization", "review_note",
                  "reviewed_by", "platform_agent_id", "platform_knowledge_base_ids",
                  "api_key", "password", "token", "paddle_customer_id", "paddle_subscription_id"}


class CheckFailed(Exception):
    pass


def require(ok, label):
    if not ok:
        raise CheckFailed(label)


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700 if private else 0o755)
    if private:
        path.parent.chmod(0o700)
    # Credentials never briefly acquire a world-readable default mode.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    if private:
        path.chmod(0o600)


def trusted_url(url, origin, path=None):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == urllib.parse.urlsplit(origin).netloc
            and not parsed.username and not parsed.password, "untrusted_redirect_origin")
    if path is not None:
        require(parsed.path == path, "untrusted_redirect_path")
    return parsed


def endpoint_label(path):
    if "/oauth/authorizations/" in path:
        return "/auth/v1/oauth/authorizations/:id"
    return path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HTTP:
    def __init__(self, proxy):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"https": proxy} if proxy else {}),
            urllib.request.HTTPCookieProcessor(self.cookies), NoRedirect())

    def request(self, url, body=None, method="GET", headers=None, expected=(200,), read=True, timeout=45):
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.netloc in
                (urllib.parse.urlsplit(ORIGIN).netloc, urllib.parse.urlsplit(IDENTITY).netloc)
                and not parsed.username and not parsed.password, "request_origin_rejected")
        req = urllib.request.Request(url, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json",
                     "Content-Type": "application/json", **(headers or {})})
        try:
            response = self.opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        except (urllib.error.URLError, TimeoutError, OSError):
            raise CheckFailed("network_unavailable:" + endpoint_label(parsed.path)) from None
        with response:
            status = response.code
            location = response.headers.get("Location", "")
            content_type = response.headers.get("Content-Type", "")
            require(status in expected, "unexpected_http:" + str(status) + ":" + endpoint_label(parsed.path))
            raw = response.read(8 * 1024 * 1024) if read else b""
        return status, location, raw, content_type

    def json(self, url, **kwargs):
        return json.loads(self.request(url, **kwargs)[2])


class API:
    def __init__(self, http, token):
        self.http, self.token = http, token

    def call(self, path, **kwargs):
        require(path.startswith("/api/v1/") and not path.startswith("//"), "native_path_rejected")
        return self.http.json(ORIGIN + path, headers={"Authorization": "Bearer " + self.token}, **kwargs)

    def denied(self, path, body=None, method="GET", expected=(403, 404)):
        status, _, _, _ = self.http.request(ORIGIN + path, body, method,
            {"Authorization": "Bearer " + self.token}, expected=expected, read=False)
        return status


def runtime_auth(http):
    raw = http.request(ORIGIN + "/config.js")[2].decode()
    result = {}
    # Startup config uses JS object keys, but each value is a JSON string.
    # Parse only the four known strings; never evaluate downloaded JavaScript.
    for key in ("publicOrigin", "supabaseUrl", "publishableKey", "weknoraOAuthClientId"):
        found = re.findall(r'\b' + key + r'\s*:\s*("(?:[^"\\]|\\.)*")', raw)
        require(len(found) == 1, "runtime_auth_shape")
        result[key] = json.loads(found[0])
    require(result["publicOrigin"] == ORIGIN and result["supabaseUrl"] == IDENTITY,
            "runtime_environment_mismatch")
    return result


def login(http, fixture):
    config = runtime_auth(http)
    public_headers = {"apikey": config["publishableKey"]}
    identity = http.json(IDENTITY + "/auth/v1/token?grant_type=password", method="POST",
                         body={"email": fixture["email"], "password": fixture["password"]},
                         headers=public_headers)
    require(identity.get("user", {}).get("id") == fixture["supabase_user_id"], "identity_mismatch")
    identity_headers = {**public_headers, "Authorization": "Bearer " + identity["access_token"]}
    start = http.json(ORIGIN + "/api/v1/auth/oidc/url?" + urllib.parse.urlencode({"redirect_uri": CALLBACK}))
    require(start.get("success") is True, "oidc_start_failed")
    authorization_url = start["authorization_url"]
    parsed = trusted_url(authorization_url, IDENTITY, "/auth/v1/oauth/authorize")
    query = urllib.parse.parse_qs(parsed.query)
    require(query.get("client_id") == [config["weknoraOAuthClientId"]]
            and query.get("redirect_uri") == [CALLBACK] and query.get("response_type") == ["code"]
            and query.get("code_challenge_method") == ["S256"] and query.get("code_challenge"),
            "oidc_request_binding_mismatch")
    expected_state = query["state"]
    _, consent_url, _, _ = http.request(authorization_url, expected=(302, 303), read=False)
    consent = trusted_url(consent_url, ORIGIN, "/oauth/consent")
    consent_id = urllib.parse.parse_qs(consent.query).get("authorization_id", [])
    require(len(consent_id) == 1 and re.fullmatch(r"[A-Za-z0-9._~-]+", consent_id[0]), "consent_id_invalid")
    endpoint = IDENTITY + "/auth/v1/oauth/authorizations/" + consent_id[0]
    details = http.json(endpoint, headers=identity_headers)
    if "redirect_url" in details:
        redirect = details["redirect_url"]
    else:
        require(details.get("authorization_id") == consent_id[0]
                and details.get("client", {}).get("id") == config["weknoraOAuthClientId"]
                and details.get("redirect_uri") == CALLBACK, "consent_client_mismatch")
        redirect = http.json(endpoint + "/consent", body={"action": "approve"},
                             method="POST", headers=identity_headers)["redirect_url"]
    cb = trusted_url(redirect, ORIGIN, "/api/v1/auth/oidc/callback")
    callback_query = urllib.parse.parse_qs(cb.query)
    require(callback_query.get("state") == expected_state and len(callback_query.get("code", [])) == 1,
            "callback_binding_mismatch")
    _, final_url, _, _ = http.request(redirect, expected=(302, 303), read=False)
    final = trusted_url(urllib.parse.urljoin(ORIGIN, final_url), ORIGIN, "/")
    encoded = urllib.parse.parse_qs(final.fragment).get("oidc_result", [])
    require(len(encoded) == 1, "native_callback_failed")
    result = json.loads(base64.urlsafe_b64decode(encoded[0] + "=" * (-len(encoded[0]) % 4)))
    require(result.get("success") is True and result.get("token"), "native_callback_failed")
    return {"origin": ORIGIN, "token": result["token"], "refresh_token": result.get("refresh_token", ""),
            "authentication": "supabase_password_native_oidc_pkce", "created_at_unix": int(time.time())}


def verify_identity(api, fixture, admin=False):
    me = api.call("/api/v1/auth/me")["data"]["user"]
    require(me["id"] == fixture["musuw_user_id"] and me["tenant_id"] == fixture["tenant_id"]
            and bool(me.get("is_system_admin")) == admin, "native_fixture_identity_mismatch")
    return {"user_id": me["id"], "tenant_id": me["tenant_id"], "is_system_admin": admin}


def membership(api):
    response = api.call("/api/v1/entitlements/current")
    require(response.get("billing", {}).get("environment", "sandbox") == "sandbox", "billing_environment_mismatch")
    return {key: response["data"].get(key) for key in MEMBERSHIP_FIELDS}


def meters(admin, fixtures):
    result = {}
    for role in ("buyer", "admin"):
        tenant = fixtures["accounts"][role]["tenant_id"]
        response = admin.call(f"/api/v1/system/admin/tenants/{tenant}/entitlement")["data"]
        require(response["tenant_id"] == tenant, "meter_tenant_mismatch")
        result["buyer" if role == "buyer" else "platform"] = {
            key: response.get(key) for key in METER_FIELDS}
    return result


def private_projection(value):
    if isinstance(value, dict):
        require(not (set(value) & PRIVATE_FIELDS), "private_field_in_consumer_projection")
        for child in value.values():
            private_projection(child)
    elif isinstance(value, list):
        for child in value:
            private_projection(child)


def qa_body(product, fixture):
    return {"query": fixture["sample_questions"][0], "marketplace_product_id": product["id"],
            "agent_id": fixture["agent_id"], "knowledge_base_ids": [fixture["knowledge_base_id"]],
            "summary_model_id": FLASH, "disable_title": True, "agent_enabled": False,
            "web_search_enabled": False, "thinking": False, "channel": "api"}


def verify_market(api, admin, assets, report):
    listing = api.call("/api/v1/creator-marketplace/products?limit=100")
    require(isinstance(listing.get("data"), list), "marketplace_catalog_unavailable")
    private_projection(listing)
    products = {}
    for fixture in assets["products"]:
        found = [p for p in listing["data"] if p.get("title") == fixture["title"]]
        require(len(found) == 1, "fixture_product_missing_or_ambiguous:" + fixture["key"])
        product = api.call("/api/v1/creator-marketplace/products/" + found[0]["id"])["data"]
        private_projection(product)
        require(product["agent_id"] == fixture["agent_id"]
                and product["knowledge_base_ids"] == [fixture["knowledge_base_id"]]
                and product["monthly_amount"] == fixture["monthly_amount"]
                and product["yearly_amount"] == fixture["monthly_amount"] * 10, "published_fixture_mismatch")
        products[fixture["key"]] = product
    orders = api.call("/api/v1/creator-marketplace/orders")
    private_projection(orders)
    report["orders"] = {"subscriptions": [{key: s.get(key) for key in
        ("id", "product_id", "status", "billing_period", "paid_through", "can_chat", "cancel_at_period_end")}
        for s in orders["subscriptions"]], "transaction_count": len(orders["transactions"])}
    report["catalog"] = [{"key": key, "id": p["id"], "can_chat": bool(p.get("access", {}).get("can_chat"))}
                         for key, p in products.items()]
    # Deliberately invalid bodies and a nonexistent target prevent a role-gate
    # regression from creating/updating business data during negative probes.
    absent = "00000000-0000-4000-8000-000000000000"
    require(all(p["id"] != absent for p in products.values()), "probe_id_collision")
    report["role_checks"] = []
    for label, path, body, method in (
        ("free_creator_create", "/api/v1/creator-marketplace/creator/products", {}, "POST"),
        ("free_creator_submit", "/api/v1/creator-marketplace/creator/products/" + absent + "/submit", {}, "POST"),
        ("buyer_admin_read", "/api/v1/system/creator-marketplace/products", None, "GET"),
        ("buyer_admin_update", "/api/v1/system/creator-marketplace/products/" + absent, {}, "PUT"),
        ("buyer_admin_review", "/api/v1/system/creator-marketplace/products/" + absent + "/review",
         {"action": "invalid_permission_probe"}, "POST"),
    ):
        report["role_checks"].append({"check": label, "http": api.denied(path, body, method, (403,))})
    session = api.call("/api/v1/sessions", body={"title": "Sandbox marketplace permission probes"},
                       method="POST", expected=(201,))["data"]["id"]
    report["permission_session_id"] = session
    checks = []
    try:
        for i, fixture in enumerate(assets["products"]):
            product = products[fixture["key"]]
            for kind, path in (("private_agent", "/api/v1/agents/" + fixture["agent_id"]),
                               ("private_kb", "/api/v1/knowledge-bases/" + fixture["knowledge_base_id"]),
                               ("private_doc", "/api/v1/knowledge/" + fixture["knowledge_id"]),
                               ("download", "/api/v1/knowledge/" + fixture["knowledge_id"] + "/download")):
                if kind != "download":
                    # A buyer 404 counts only after the fixture owner proves
                    # this exact native route/resource exists. Never save its body.
                    owned = admin.call(path)["data"]
                    require(owned.get("tenant_id") == assets["platform_tenant_id"], "source_asset_owner_mismatch")
                checks.append({"key": fixture["key"], "check": kind,
                               "owner_resource_confirmed": kind != "download", "http": api.denied(path)})
            body = qa_body(product, fixture)
            body["query"] = "Sandbox authorization denial probe"
            if not product.get("access", {}).get("can_chat"):
                checks.append({"key": fixture["key"], "check": "unpaid_qa", "http": api.denied(
                    "/api/v1/knowledge-chat/" + session, body, "POST", (403,))})
            other = assets["products"][(i + 1) % len(assets["products"])]
            for key, injected in (("agent_id", other["agent_id"]),
                                  ("knowledge_base_ids", [other["knowledge_base_id"]]),
                                  ("knowledge_ids", [other["knowledge_id"]])):
                checks.append({"key": fixture["key"], "check": "injected_" + key,
                    "paid_scope_exercised": bool(product.get("access", {}).get("can_chat")),
                    "http": api.denied("/api/v1/knowledge-chat/" + session,
                                       {**body, key: injected}, "POST", (403,))})
    except CheckFailed:
        # If an unexpected 200 ever starts generation, stop this fixture's turn.
        try:
            api.call("/api/v1/sessions/" + session + "/stop", body={}, method="POST")
        except Exception:
            pass
        raise
    report["permission_checks"] = checks
    return products


def ask_once(api, admin, fixtures, fixture, product, report, wait_seconds):
    require(product.get("access", {}).get("can_chat") is True, "ask_requires_paid_access")
    before = meters(admin, fixtures)
    session = api.call("/api/v1/sessions", body={"title": "Sandbox marketplace paid Flash verification"},
                       method="POST", expected=(201,))["data"]["id"]
    report["paid_qa"] = {"session_id": session, "product_id": product["id"], "model_id": FLASH,
                         "meter_before": before}
    _, _, stream, content_type = api.http.request(ORIGIN + "/api/v1/knowledge-chat/" + session,
        qa_body(product, fixture), "POST", {"Authorization": "Bearer " + api.token}, timeout=180)
    require("text/event-stream" in content_type, "paid_qa_not_streaming")
    # Persist counts, never the SSE body, model text, prompt, or source passages.
    report["paid_qa"]["stream_bytes"] = len(stream)
    for _ in range(10):
        messages = api.call("/api/v1/messages/" + session + "/load")["data"]
        complete = [m for m in messages if m.get("role") == "assistant" and m.get("is_completed")]
        if complete:
            break
        time.sleep(1)
    require(len(complete) == 1 and complete[0].get("content"), "paid_answer_incomplete")
    answer = complete[0]
    require(answer.get("model_id") == FLASH, "answer_model_binding_mismatch")
    require(answer.get("marketplace_product_id") == product["id"], "history_product_binding_missing")
    refs = answer.get("knowledge_references") or []
    require(refs and all(r.get("knowledge_id") == fixture["knowledge_id"] for r in refs), "citation_scope_mismatch")
    report["paid_qa"].update({"message_id": answer["id"], "answer_characters": len(answer["content"]),
                             "citation_count": len(refs), "history_product_binding": True,
                             "token_usage": {key: value for key, value in (answer.get("usage") or {}).items()
                                             if key.endswith("_tokens") and isinstance(value, int)}})
    deadline = time.monotonic() + wait_seconds
    while True:
        after = meters(admin, fixtures)
        buyer_delta = after["buyer"]["openrouter_provider_used_microusd"] - before["buyer"]["openrouter_provider_used_microusd"]
        platform_delta = after["platform"]["openrouter_provider_used_microusd"] - before["platform"]["openrouter_provider_used_microusd"]
        if buyer_delta > 0 or platform_delta != 0 or time.monotonic() >= deadline:
            break
        time.sleep(3)
    report["paid_qa"]["meter_before"] = before
    report["paid_qa"]["meter_after"] = after
    report["paid_qa"]["provider_delta_microusd"] = {"buyer": buyer_delta, "platform": platform_delta}
    require(buyer_delta > 0 and platform_delta == 0, "buyer_billing_not_proven_or_platform_consumed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth-only", action="store_true")
    parser.add_argument("--refresh-login", action="store_true")
    parser.add_argument("--refresh-admin-login", action="store_true")
    parser.add_argument("--ask-product", choices=("taylor", "clear-writing", "learning-planner", "product-notes"))
    parser.add_argument("--usage-wait-seconds", type=int, default=30)
    parser.add_argument("--proxy", default=os.environ.get("MUSUW_STAGING_PROXY", "http://127.0.0.1:7897"))
    args = parser.parse_args()
    require(not (args.auth_only and args.ask_product), "incompatible_modes")
    require(0 <= args.usage_wait_seconds <= 120, "usage_wait_out_of_bounds")
    fixtures = read_json(PRIVATE / "fixtures.json")
    require(fixtures["environment"] == "staging" and fixtures["app_origin"] == ORIGIN
            and fixtures["supabase_origin"] == IDENTITY, "fixtures_environment_mismatch")
    buyer = fixtures["accounts"]["buyer"]
    require(buyer["email"] == BUYER_EMAIL, "non_fixture_login_refused")
    http = HTTP(args.proxy)
    report = {"origin": ORIGIN, "started_at_unix": int(time.time()), "model_call_requested": bool(args.ask_product)}
    try:
        session_file = PRIVATE / "buyer-session.json"
        session = read_json(session_file) if session_file.exists() and not args.refresh_login else None
        if session:
            require(session["origin"] == ORIGIN, "saved_session_origin_mismatch")
            api = API(http, session["token"])
            try:
                verify_identity(api, buyer)
            except CheckFailed as error:
                if not str(error).startswith("unexpected_http:401:"):
                    raise
                session = None
        if session is None:
            session = login(http, buyer)
            api = API(http, session["token"])
            verify_identity(api, buyer)
            write_json(session_file, session, private=True)
        report["buyer"] = verify_identity(api, buyer)
        current = membership(api)
        baseline_file = ARTIFACTS / "staging-buyer-membership-baseline.json"
        if not baseline_file.exists():
            require(current["plan"] == "free", "baseline_requires_initial_free_buyer")
            write_json(baseline_file, {"origin": ORIGIN, "buyer_tenant_id": buyer["tenant_id"], "membership": current})
        baseline = read_json(baseline_file)
        require(baseline["origin"] == ORIGIN and baseline["buyer_tenant_id"] == buyer["tenant_id"], "baseline_identity_mismatch")
        report["membership_initial"] = baseline["membership"]
        report["membership_current"] = current
        require(current == baseline["membership"], "marketplace_purchase_changed_membership")
        admin_fixture = fixtures["accounts"]["admin"]
        require(admin_fixture["email"] == ADMIN_EMAIL, "non_fixture_admin_login_refused")
        admin_file = PRIVATE / "admin-session.json"
        admin_session = read_json(admin_file) if admin_file.exists() and not args.refresh_admin_login else None
        if admin_session:
            require(admin_session["origin"] == ORIGIN, "platform_session_origin_mismatch")
            admin = API(http, admin_session["token"])
            try:
                verify_identity(admin, admin_fixture, admin=True)
            except CheckFailed as error:
                if not str(error).startswith("unexpected_http:401:"):
                    raise
                admin_session = None
        if admin_session is None:
            admin_session = login(http, admin_fixture)
            admin = API(http, admin_session["token"])
            verify_identity(admin, admin_fixture, admin=True)
            write_json(admin_file, admin_session, private=True)
        report["meters_initial"] = meters(admin, fixtures)
        report["meter_source"] = "Existing provider-backed tenant entitlement counters; no local usage ledger"
        if not args.auth_only:
            assets = read_json(ARTIFACTS / "staging-assets.json")
            require(assets["environment"] == "staging" and assets["origin"] == ORIGIN, "assets_environment_mismatch")
            products = verify_market(api, admin, assets, report)
            if args.ask_product:
                fixture = next(f for f in assets["products"] if f["key"] == args.ask_product)
                try:
                    ask_once(api, admin, fixtures, fixture, products[args.ask_product], report, args.usage_wait_seconds)
                finally:
                    # Keep minimal usage evidence even when answer/citation validation fails.
                    report["meters_final"] = meters(admin, fixtures)
            report["membership_after"] = membership(api)
            require(report["membership_after"] == baseline["membership"], "membership_changed_after_verification")
            report["meters_final"] = meters(admin, fixtures)
            if not args.ask_product:
                for role in ("buyer", "platform"):
                    require(report["meters_final"][role]["openrouter_provider_used_microusd"] ==
                            report["meters_initial"][role]["openrouter_provider_used_microusd"],
                            "unexpected_model_usage_during_denial_checks")
        report["success"] = True
    except Exception as error:
        report["success"] = False
        report["error"] = str(error) if isinstance(error, CheckFailed) else type(error).__name__
    output = ARTIFACTS / ("staging-auth-readiness.json" if args.auth_only else "staging-access-latest.json")
    write_json(output, report)
    print(json.dumps({"success": report["success"], "error": report.get("error"),
                      "report": str(output), "buyer_session_file": str(PRIVATE / "buyer-session.json"),
                      "model_call_requested": bool(args.ask_product)}, ensure_ascii=False))
    return 0 if report["success"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"success": False, "error": str(error) if isinstance(error, CheckFailed) else type(error).__name__}))
        sys.exit(1)
