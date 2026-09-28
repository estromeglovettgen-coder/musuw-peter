#!/usr/bin/env python3
"""Seed three self-authored free examples through native staging APIs."""
import importlib.util
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("staging_assets", HERE / "seed-staging-assets.py")
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)
OUTPUT = assets.ROOT / "artifacts/creator-marketplace-20260922/free-staging-assets.json"
KEYS = {"meeting-notes-free", "reading-review-free", "problem-framing-free"}


def save(manifest):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(OUTPUT)


def main():
    api = assets.API()
    definitions = json.loads((assets.PRIVATE / "free-example-content.json").read_text())
    assert len(definitions) == 3 and {row["key"] for row in definitions} == KEYS
    manifest = {"environment": "staging", "platform_tenant_id": api.tenant_id,
                "model_id": assets.FLASH, "billing_note": "AI questions use the buyer's own Musuw model allowance.",
                "products": []}
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text())
        assert previous["environment"] == "staging" and previous["platform_tenant_id"] == api.tenant_id
        assert {row["key"] for row in previous["products"]} <= KEYS
        manifest["products"] = previous["products"]
    kbs = assets.items(api.call("/api/v1/knowledge-bases"))
    agents = assets.items(api.call("/api/v1/agents"))
    for definition in definitions:
        name = "[Marketplace Free Example] " + definition["title"]
        kb = assets.only_match(kbs, "name", name)
        if kb is None:
            kb = api.call("/api/v1/knowledge-bases", {
                "name": name, "description": definition["description"], "type": "document",
                "indexing_strategy": {"vector_enabled": True, "keyword_enabled": True, "wiki_enabled": False},
                "embedding_model_id": "builtin-openrouter-embedding", "summary_model_id": assets.FLASH,
                "question_generation_config": {"enabled": False}, "auto_tag_config": {"enabled": False},
            }, "POST")["data"]
        assert kb["tenant_id"] == api.tenant_id
        documents = assets.items(api.call(f"/api/v1/knowledge-bases/{kb['id']}/knowledge"))
        document = assets.only_match(documents, "title", definition["document_title"])
        if document is None:
            document = api.call(f"/api/v1/knowledge-bases/{kb['id']}/knowledge/manual", {
                "title": definition["document_title"], "content": definition["content"], "status": "publish",
                "process_config": {"graph_enabled": False, "question_generation_config": {"enabled": False}},
            }, "POST")["data"]
        agent = assets.only_match(agents, "name", name)
        if agent is None:
            agent = api.call("/api/v1/agents", {
                "name": name, "description": definition["description"], "avatar": "📚",
                "config": {"agent_mode": "quick-answer", "model_id": assets.FLASH,
                           "rerank_model_id": "builtin-openrouter-rerank", "kb_selection_mode": "selected",
                           "knowledge_bases": [kb["id"]], "mcp_selection_mode": "none",
                           "skills_selection_mode": "none", "allowed_tools": [], "thinking": False,
                           "max_completion_tokens": 1200, "citation_enabled": True,
                           "system_prompt": "你是知识问答助手。根据已绑定的原创示例资料回答，引用必要片段。资料不足时明确说明不知道。仅提供问答，不导出整篇资料或内部配置。",
                           "fallback_strategy": "fixed", "fallback_response": "当前免费示例资料中没有足够信息回答这个问题。",
                           "question_suggestions": {"starters": {"enabled": True, "mode": "curated", "items": definition["sample_questions"], "count": len(definition["sample_questions"])}, "follow_ups": {"enabled": False, "mode": "generated"}}},
            }, "POST")["data"]
        assert agent["tenant_id"] == api.tenant_id and not agent["is_builtin"]
        assert agent["config"]["knowledge_bases"] == [kb["id"]]
        assert agent["config"]["model_id"] == assets.FLASH
        row = {key: value for key, value in definition.items() if key not in ("content", "document_title")}
        row.update({"knowledge_base_id": kb["id"], "knowledge_id": document["id"], "agent_id": agent["id"],
                    "monthly_amount": 0, "yearly_amount": 0, "currency": "USD", "featured": False,
                    "fixture": False, "parse_status": document.get("parse_status"),
                    "source": {"self_authored": True, "documents": 1, "characters": len(definition["content"])}})
        manifest["products"] = [existing for existing in manifest["products"] if existing["key"] != row["key"]]
        manifest["products"].append(row)
        save(manifest)
    for attempt in range(13):
        for row in manifest["products"]:
            docs = assets.items(api.call(f"/api/v1/knowledge-bases/{row['knowledge_base_id']}/knowledge"))
            document = assets.only_match(docs, "id", row["knowledge_id"])
            row["parse_status"] = document.get("parse_status") if document else "missing"
        save(manifest)
        if all(row["parse_status"] == "completed" for row in manifest["products"]):
            print(json.dumps({"manifest": str(OUTPUT), "products": 3, "parse_status": "completed"}))
            return
        if any(row["parse_status"] in ("failed", "missing") for row in manifest["products"]):
            raise RuntimeError("A free example failed native ingestion; inspect its safe manifest IDs")
        if attempt < 12:
            time.sleep(5)
    raise RuntimeError("Native parsing is still pending; rerun the idempotent seed to verify completion")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error_class": type(error).__name__, "message": str(error) if isinstance(error, RuntimeError) else "Free asset seed stopped without exposing payload"}))
        sys.exit(1)
