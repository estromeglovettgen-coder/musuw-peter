#!/usr/bin/env python3
"""Publish the three prepared free examples after the free-product backend deploy."""
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("free_assets", HERE / "seed-free-staging-assets.py")
free = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(free)
assets = free.assets


def main():
    if sys.argv[1:] != ["--publish"]:
        raise RuntimeError("Use --publish only after the free-product staging backend is deployed")
    api = assets.API()
    manifest = json.loads(free.OUTPUT.read_text())
    assert manifest["environment"] == "staging" and manifest["platform_tenant_id"] == api.tenant_id
    assert len(manifest["products"]) == 3 and {row["key"] for row in manifest["products"]} == free.KEYS
    existing = assets.items(api.call("/api/v1/system/creator-marketplace/products?limit=100"))
    published = []
    for fixture in manifest["products"]:
        assert fixture["monthly_amount"] == fixture["yearly_amount"] == 0
        docs = assets.items(api.call(f"/api/v1/knowledge-bases/{fixture['knowledge_base_id']}/knowledge"))
        document = assets.only_match(docs, "id", fixture["knowledge_id"])
        if document is None or document["parse_status"] != "completed":
            raise RuntimeError(f"Free example document not ready: {fixture['key']}")
        product = assets.only_match(existing, "title", fixture["title"])
        if product is None:
            product = api.call("/api/v1/creator-marketplace/creator/products", {
                "title": fixture["title"], "description": fixture["description"], "category": fixture["category"],
                "agent_id": fixture["agent_id"], "knowledge_base_ids": [fixture["knowledge_base_id"]],
                "monthly_amount": 0, "currency": "USD", "sample_questions": fixture["sample_questions"],
                "contact": "Musuw staging 平台运营免费示例。",
                "authorization": "本商品资料为本轮用户授权创建的原创教学短文，平台持有独立知识库与智能体，用于免费问答示例；不包含第三方付费资料。",
                "authorization_confirmed": True,
            }, "POST")["data"]
        assert product["agent_id"] == fixture["agent_id"]
        assert product["monthly_amount"] == product["yearly_amount"] == 0
        assert not any(product.get(key) for key in ("paddle_product_id", "monthly_price_id", "yearly_price_id"))
        if product["status"] == "draft":
            product = api.call(f"/api/v1/creator-marketplace/creator/products/{product['id']}/submit", {}, "POST")["data"]
        if product["status"] == "pending":
            product = api.call(f"/api/v1/system/creator-marketplace/products/{product['id']}/review", {
                "action": "approve", "platform_agent_id": fixture["agent_id"],
                "platform_knowledge_base_ids": [fixture["knowledge_base_id"]],
                "paddle_product_id": "", "monthly_price_id": "", "yearly_price_id": "",
                "featured": False, "fixture": False,
                "review_note": "原创免费示例；平台独立持有资料与 Flash 智能体，使用买家自己的模型额度，不创建付款或订阅。",
            }, "POST")["data"]
        if product["status"] != "published":
            raise RuntimeError(f"Unexpected free product status: {fixture['key']}")
        assert product["platform_agent_id"] == fixture["agent_id"]
        assert product["platform_knowledge_base_ids"] == [fixture["knowledge_base_id"]]
        assert product["default_model_id"] == assets.FLASH
        assert product["monthly_amount"] == product["yearly_amount"] == 0
        assert not any(product.get(key) for key in ("paddle_product_id", "monthly_price_id", "yearly_price_id"))
        public = api.call(f"/api/v1/creator-marketplace/products/{product['id']}")["data"]
        assert public["access"]["can_chat"] is True and public["access"]["status"] == "free"
        assert not public["checkout_available"] and not public["access"].get("portal_available")
        assert not public["access"].get("subscription_id") and not public["access"].get("paid_through")
        row = {"key": fixture["key"], "id": product["id"], "title": product["title"], "status": product["status"],
               "monthly_amount": 0, "yearly_amount": 0, "model_id": assets.FLASH,
               "can_chat": public["access"]["can_chat"], "checkout_available": False,
               "featured": product["featured"], "fixture": product["fixture"]}
        published.append(row)
        output = assets.ROOT / "artifacts/creator-marketplace-20260922/free-staging-products.json"
        output.write_text(json.dumps({"environment": "staging", "products": published}, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error_class": type(error).__name__, "message": str(error) if isinstance(error, RuntimeError) else "Free publication stopped without exposing payload"}))
        sys.exit(1)
