#!/usr/bin/env python3
"""Publish only the four prepared Sandbox acceptance fixtures through reviewed APIs."""
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("staging_assets", HERE / "seed-staging-assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


def main():
    if sys.argv[1:] != ["--publish"]:
        raise RuntimeError("Use --publish after the marketplace staging release is deployed")
    api = assets.API()
    manifest = json.loads(assets.OUTPUT.read_text())
    catalog = json.loads((assets.ROOT / "artifacts/creator-marketplace-20260922/paddle-sandbox-catalog.json").read_text())
    assert catalog["environment"] == "sandbox" and catalog["api_origin"] == "https://sandbox-api.paddle.com"
    assert manifest["environment"] == "staging" and manifest["platform_tenant_id"] == api.tenant_id
    assert {p["key"] for p in manifest["products"]} == {"taylor", "clear-writing", "learning-planner", "product-notes"}
    existing = assets.items(api.call("/api/v1/system/creator-marketplace/products?limit=100"))
    published = []
    for fixture in manifest["products"]:
        provider = assets.only_match(catalog["products"], "slug", fixture["key"])
        assert provider is not None
        assert int(provider["prices"]["monthly"]["amount"]) == fixture["monthly_amount"]
        assert int(provider["prices"]["yearly"]["amount"]) == fixture["monthly_amount"] * 10
        documents = assets.items(api.call(f"/api/v1/knowledge-bases/{fixture['knowledge_base_id']}/knowledge"))
        document = assets.only_match(documents, "id", fixture["knowledge_id"])
        if document is None or document["parse_status"] != "completed":
            raise RuntimeError(f"Fixture document not ready: {fixture['key']}")
        product = assets.only_match(existing, "title", fixture["title"])
        if product is None:
            product = api.call("/api/v1/creator-marketplace/creator/products", {
                "title": fixture["title"], "description": fixture["description"], "category": fixture["category"],
                "agent_id": fixture["agent_id"], "knowledge_base_ids": [fixture["knowledge_base_id"]],
                "monthly_amount": fixture["monthly_amount"], "currency": "USD",
                "sample_questions": fixture["sample_questions"],
                "contact": "Musuw Sandbox 平台运营验收账号；非对外销售联系方式。",
                "authorization": "用户已授权在独立 staging 使用这些素材做市场与 Paddle Sandbox 验收。泰勒仅一篇已解析内容样例，其余为自写测试短文；不代表全量迁移或生产销售授权。",
                "authorization_confirmed": True,
            }, "POST")["data"]
        assert product["agent_id"] == fixture["agent_id"]
        assert product["monthly_amount"] == fixture["monthly_amount"]
        if product["status"] == "draft":
            product = api.call(f"/api/v1/creator-marketplace/creator/products/{product['id']}/submit", {}, "POST")["data"]
        if product["status"] == "pending":
            product = api.call(f"/api/v1/system/creator-marketplace/products/{product['id']}/review", {
                "action": "approve", "platform_agent_id": fixture["agent_id"],
                "platform_knowledge_base_ids": [fixture["knowledge_base_id"]],
                "paddle_product_id": provider["product_id"],
                "monthly_price_id": provider["prices"]["monthly"]["price_id"],
                "yearly_price_id": provider["prices"]["yearly"]["price_id"],
                "featured": fixture["featured"], "fixture": fixture["fixture"],
                "review_note": "Sandbox 验收资产；平台独立持有，买家共用。泰勒只含页面明确说明的一篇文本样例。",
            }, "POST")["data"]
        if product["status"] != "published":
            raise RuntimeError(f"Unexpected product status: {fixture['key']}")
        assert product["monthly_price_id"] == provider["prices"]["monthly"]["price_id"]
        assert product["yearly_price_id"] == provider["prices"]["yearly"]["price_id"]
        assert product["platform_agent_id"] == fixture["agent_id"]
        row = {"key": fixture["key"], "id": product["id"], "title": product["title"], "status": product["status"],
               "monthly_amount": product["monthly_amount"], "yearly_amount": product["yearly_amount"],
               "featured": product["featured"], "fixture": product["fixture"],
               "url": assets.ORIGIN + "/platform/marketplace/" + product["id"]}
        published.append(row)
        output = assets.ROOT / "artifacts/creator-marketplace-20260922/staging-published-products.json"
        output.write_text(json.dumps({"environment": "staging", "products": published}, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error_class": type(error).__name__, "message": str(error) if isinstance(error, RuntimeError) else "Publish stopped without exposing payload"}))
        sys.exit(1)
