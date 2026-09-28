#!/usr/bin/env python3
"""Create only the named staging acceptance identities; never print credentials."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / ".runtime/creator-marketplace/fixtures.json"
ORIGIN = "https://achfnnicetupvtoqiwqd.supabase.co"
FIXTURES = {
    "admin": ("creator-marketplace-admin-20260922@example.com", "Marketplace Sandbox Admin"),
    "buyer": ("creator-marketplace-buyer-20260922@example.com", "Marketplace Sandbox Buyer"),
}


def main():
    key = subprocess.check_output([
        "/usr/bin/security", "find-generic-password", "-s",
        "com.musuw.local-admin.supabase-secret-key", "-a", "musuw-admin-test", "-w",
    ], stderr=subprocess.DEVNULL, text=True).strip()

    def api(path, data=None, method=None):
        request = urllib.request.Request(ORIGIN + "/auth/v1" + path,
            data=None if data is None else json.dumps(data).encode(), method=method,
            headers={"apikey": key, "Authorization": "Bearer " + key,
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise RuntimeError("Staging Supabase HTTP " + str(exc.code)) from None

    users, page = [], 1
    while True:
        batch = api(f"/admin/users?page={page}&per_page=100").get("users", [])
        users.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    state = json.loads(PRIVATE.read_text()) if PRIVATE.exists() else {
        "environment": "staging", "supabase_origin": ORIGIN,
        "app_origin": "https://staging.musuw.com", "accounts": {},
    }
    assert state["environment"] == "staging" and state["supabase_origin"] == ORIGIN
    PRIVATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    PRIVATE.parent.chmod(0o700)
    for role, (email, label) in FIXTURES.items():
        account = state["accounts"].setdefault(role, {"email": email, "password": "Mkt!" + secrets.token_urlsafe(24)})
        assert account["email"] == email
        # Persist before the provider mutation so a lost response can be retried
        # without losing the generated fixture password.
        fd = os.open(PRIVATE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(state, stream, indent=2)
        PRIVATE.chmod(0o600)
        existing = [u for u in users if u.get("email", "").lower() == email]
        if len(existing) > 1:
            raise RuntimeError("Duplicate fixture identity")
        payload = {"email": email, "password": account["password"], "email_confirm": True,
                   "user_metadata": {"name": label},
                   "app_metadata": {"musuw_fixture": "creator-marketplace-20260922"}}
        if existing:
            if existing[0].get("app_metadata", {}).get("musuw_fixture") != "creator-marketplace-20260922":
                raise RuntimeError("Refusing to modify an existing non-fixture user")
            user = api("/admin/users/" + existing[0]["id"], payload, "PUT")
        else:
            user = api("/admin/users", payload)
        account["supabase_user_id"] = user["id"]
        fresh = api("/admin/users/" + user["id"])
        assert fresh["email"] == email and fresh.get("email_confirmed_at")
        PRIVATE.write_text(json.dumps(state, indent=2) + "\n")
        PRIVATE.chmod(0o600)
        print(json.dumps({"role": role, "created_or_reused": True, "confirmed": True}))
    print(json.dumps({"credentials_file": str(PRIVATE), "mode": "0600", "production_changed": False}))


if __name__ == "__main__":
    main()
