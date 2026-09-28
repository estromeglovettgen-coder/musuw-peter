#!/usr/bin/env python3
"""Idempotently prepare the four creator-marketplace Sandbox catalog fixtures.

Reads only the TEST Keychain credential in memory. This script cannot select
Paddle Live and prints/saves only public product and price metadata.
"""
import argparse
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://sandbox-api.paddle.com"
FIXTURES = [
    ("taylor", "泰勒知识助手", 500),
    ("clear-writing", "清晰写作助手", 100),
    ("learning-planner", "学习规划助手", 200),
    ("product-notes", "产品笔记助手", 300),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    key = subprocess.check_output(
        ["/usr/bin/security", "find-generic-password", "-s",
         "com.musuw.local-admin.paddle-api-key", "-a", "musuw-admin-test", "-w"],
        stderr=subprocess.DEVNULL, text=True,
    ).strip()
    if not key.startswith("pdl_sdbx_apikey_"):
        raise SystemExit("TEST credential is not a Paddle Sandbox API key")

    def api(path, data=None):
        request = urllib.request.Request(
            BASE + path, data=None if data is None else json.dumps(data).encode(),
            headers={"Authorization": "Bearer " + key, "Paddle-Version": "1",
                     "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            error = json.load(exc).get("error", {})
            raise RuntimeError(f"Paddle Sandbox HTTP {exc.code}: {error.get('code', 'unknown')}") from None

    def listed(path):
        values = []
        query = "?per_page=200"
        while True:
            result = api(path + query)
            values.extend(result["data"])
            pagination = result.get("meta", {}).get("pagination", {})
            if not pagination.get("has_more"):
                return values
            query = "?per_page=200&after=" + urllib.parse.quote(values[-1]["id"])

    products, prices = listed("/products"), listed("/prices")
    record = {"environment": "sandbox", "api_origin": BASE,
              "verified_at": datetime.now(timezone.utc).isoformat(), "products": []}
    for slug, label, cents in FIXTURES:
        name = "[SANDBOX] Musuw " + label
        matches = [p for p in products if p["name"] == name]
        if len(matches) > 1:
            raise RuntimeError("Ambiguous existing Sandbox fixture: " + slug)
        product = matches[0] if matches else api("/products", {
            "name": name, "tax_category": "saas",
            "description": "Sandbox-only creator marketplace acceptance fixture. No production sale.",
            "custom_data": {"musuw_fixture": "creator-marketplace", "slug": slug},
        })["data"]
        if product["tax_category"] != "saas":
            raise RuntimeError("Unexpected tax category for " + slug)
        entry = {"slug": slug, "name": name, "product_id": product["id"],
                 "tax_category": "saas", "prices": {}}
        for period, interval, amount in [("monthly", "month", cents), ("yearly", "year", cents * 10)]:
            matching = [p for p in prices if p["product_id"] == product["id"]
                        and p.get("billing_cycle") == {"interval": interval, "frequency": 1}
                        and p.get("unit_price") == {"amount": str(amount), "currency_code": "USD"}
                        and p.get("trial_period") is None]
            if len(matching) > 1:
                raise RuntimeError("Ambiguous existing Sandbox price: " + slug + " " + period)
            price = matching[0] if matching else api("/prices", {
                "product_id": product["id"], "description": name + " " + period + " USD",
                "name": "Sandbox " + period,
                "unit_price": {"amount": str(amount), "currency_code": "USD"},
                "billing_cycle": {"interval": interval, "frequency": 1},
                "quantity": {"minimum": 1, "maximum": 1}, "tax_mode": "location",
                "custom_data": {"musuw_fixture": "creator-marketplace", "slug": slug, "period": period},
            })["data"]
            fresh = api("/prices/" + price["id"])["data"]
            assert fresh["product_id"] == product["id"]
            assert fresh["unit_price"] == {"amount": str(amount), "currency_code": "USD"}
            assert fresh["billing_cycle"] == {"interval": interval, "frequency": 1}
            assert fresh["status"] == "active"
            entry["prices"][period] = {"price_id": fresh["id"], "amount": str(amount), "currency": "USD"}
        record["products"].append(entry)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
