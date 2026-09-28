#!/usr/bin/env python3
"""Seed named acceptance assets through native staging APIs; never output secrets/content."""
import json
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
PRIVATE = ROOT / ".runtime/creator-marketplace"
OUTPUT = ROOT / "artifacts/creator-marketplace-20260922/staging-assets.json"
ORIGIN = "https://staging.musuw.com"
FLASH = "builtin-deepseek-v4-flash"


def items(payload):
    data = payload.get("data", [])
    if isinstance(data, list):
        return data
    for key in ("items", "knowledge_bases", "knowledges", "agents"):
        if isinstance(data.get(key), list):
            return data[key]
    raise RuntimeError("Unexpected collection response shape")


class API:
    def __init__(self):
        session = json.loads((PRIVATE / "admin-session.json").read_text())
        self.fixtures = json.loads((PRIVATE / "fixtures.json").read_text())
        assert session["origin"] == ORIGIN
        assert self.fixtures["environment"] == "staging"
        self.token = session["token"]
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"https": "http://127.0.0.1:7897"})
        )
        me = self.call("/api/v1/auth/me")["data"]["user"]
        assert me["id"] == self.fixtures["accounts"]["admin"]["musuw_user_id"]
        assert me["is_system_admin"] is True
        self.tenant_id = me["tenant_id"]

    def call(self, path, body=None, method="GET"):
        assert path.startswith("/api/v1/")
        request = urllib.request.Request(
            ORIGIN + path,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
            method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        try:
            with self.opener.open(request, timeout=45) as response:
                data = json.load(response)
        except urllib.error.HTTPError as error:
            # Provider/server payloads may contain content or credentials.
            raise RuntimeError(f"Native staging API HTTP {error.code} at {path}") from None
        if data.get("success") is False:
            raise RuntimeError(f"Native staging API rejected {path}")
        return data


def definitions():
    sample = json.loads((PRIVATE / "taylor-sample.json").read_text())
    assert sample["sample_only"] is True
    assert sample["source_kb_id"] == "9c00b9c6-4b2d-4bba-9895-9286105b7fa6"
    content = "\n\n".join(c["content"] for c in sample["chunks"])
    assert 100 < len(content) < 12000
    return [
        {"key": "taylor", "title": "泰勒·测试环境样例", "monthly_amount": 500,
         "fixture": False, "featured": True, "category": "关系成长",
         "description": "仅供 Sandbox 验收。已导入《泰勒-436：关系成长的完整行动框架》一篇已解析文本样例，涵盖扩大社交、约会复盘与个人名片；不代表完整泰勒资料库。",
         "document_title": "验收样例｜" + sample["title"], "content": content,
         "sample_questions": ["样例中如何建议扩大社交圈？", "约会后可以从哪些方面复盘？", "如何整理自己的个人名片？"],
         "source": {"production_read_only": True, "sample_only": True,
                    "source_kb_id": sample["source_kb_id"], "source_knowledge_id": sample["source_knowledge_id"],
                    "documents": 1, "parsed_text_chunks": len(sample["chunks"]), "characters": len(content)}},
        {"key": "clear-writing", "title": "清晰写作助手·Sandbox 测试", "monthly_amount": 100,
         "fixture": True, "featured": False, "category": "写作",
         "description": "自写的简短写作练习资料，用于 Sandbox 购买、授权与问答验收。",
         "document_title": "清晰写作的三步练习", "sample_questions": ["如何把一段说明写得更清楚？"],
         "content": "# 清晰写作的三步练习\n\n本资料是 Musuw Sandbox 自写验收素材。\n\n第一步：写出读者要采取的一个行动。把这个行动放在开头，使用具体动词。\n\n第二步：补充读者完成行动需要的背景。每段只解释一个意思，区分事实、判断和未知项。示例和数据应当支持前面的结论。\n\n第三步：删除重复、空泛形容词和未解释的缩写。朗读一遍，检查读者是否知道下一步怎么做。\n\n验收标记：WRITE-SAMPLE-20260922。资料不包含真实客户内容。"},
        {"key": "learning-planner", "title": "学习规划助手·Sandbox 测试", "monthly_amount": 200,
         "fixture": True, "featured": False, "category": "学习",
         "description": "自写的七天学习规划资料，用于 Sandbox 月付、年付与多商品隔离验收。",
         "document_title": "七天学习计划示例", "sample_questions": ["如何安排七天的学习和复习？"],
         "content": "# 七天学习计划示例\n\n本资料是 Musuw Sandbox 自写验收素材。\n\n第一天：确定一个可以演示的学习目标，记录已有知识和三个疑问。第二天：阅读入门资料，用自己的话写五条笔记。第三天：完成一个小练习并记录错误。第四天：不看笔记回忆关键概念，针对遗忘内容复习。第五天：把知识用于一个不同场景。第六天：向朋友解释所学，发现无法解释的地方。第七天：完成小作品，比较最初目标，决定下一周安排。\n\n每天留出二十五分钟专注学习和五分钟回顾，不把学习时间当作唯一成效指标。\n\n验收标记：LEARN-SAMPLE-20260922。资料不包含真实学生信息。"},
        {"key": "product-notes", "title": "产品笔记助手·Sandbox 测试", "monthly_amount": 300,
         "fixture": True, "featured": False, "category": "产品",
         "description": "自写的需求记录模板，用于 Sandbox 授权期限与订阅状态验收。",
         "document_title": "小功能需求记录模板", "sample_questions": ["一份小功能需求记录应该包含什么？"],
         "content": "# 小功能需求记录模板\n\n本资料是 Musuw Sandbox 自写验收素材。\n\n记录需求时先写具体用户、触发场景、遇到的问题和期望结果，再写验收例子。例子应包含正常输入、错误输入和权限不足三种情况。\n\n优先检查现有功能能否完成目标。确实需要新增时，选择概念最少、容易验证的方案。把当前必须解决的问题与以后再做的想法分开。\n\n交付时记录实际验证结果、已知限制和恢复办法。不要把完成单个模块等同于完整用户流程通过。\n\n验收标记：PRODUCT-SAMPLE-20260922。资料不包含真实商业计划。"},
    ]


def only_match(collection, field, value):
    matches = [item for item in collection if item.get(field) == value]
    if len(matches) > 1:
        raise RuntimeError("Ambiguous existing fixture; refusing to duplicate")
    return matches[0] if matches else None


def main():
    api = API()
    manifest = {"environment": "staging", "origin": ORIGIN, "platform_tenant_id": api.tenant_id,
                "model_id": FLASH, "products": []}
    kbs = items(api.call("/api/v1/knowledge-bases"))
    agents = items(api.call("/api/v1/agents"))
    for definition in definitions():
        name = "[Marketplace Sandbox] " + definition["title"]
        kb = only_match(kbs, "name", name)
        if kb is None:
            kb = api.call("/api/v1/knowledge-bases", {
                "name": name, "description": definition["description"], "type": "document",
                "indexing_strategy": {"vector_enabled": True, "keyword_enabled": True, "wiki_enabled": False},
                "embedding_model_id": "builtin-openrouter-embedding", "summary_model_id": FLASH,
                "question_generation_config": {"enabled": False}, "auto_tag_config": {"enabled": False},
            }, "POST")["data"]
        assert kb["tenant_id"] == api.tenant_id
        documents = items(api.call(f"/api/v1/knowledge-bases/{kb['id']}/knowledge"))
        document = only_match(documents, "title", definition["document_title"])
        if document is None:
            document = api.call(f"/api/v1/knowledge-bases/{kb['id']}/knowledge/manual", {
                "title": definition["document_title"], "content": definition["content"], "status": "publish",
                "process_config": {"graph_enabled": False, "question_generation_config": {"enabled": False}},
            }, "POST")["data"]
        agent = only_match(agents, "name", name)
        if agent is None:
            agent = api.call("/api/v1/agents", {
                "name": name, "description": definition["description"], "avatar": "📚",
                "config": {"agent_mode": "quick-answer", "model_id": FLASH,
                           "rerank_model_id": "builtin-openrouter-rerank", "kb_selection_mode": "selected",
                           "knowledge_bases": [kb["id"]], "mcp_selection_mode": "none",
                           "skills_selection_mode": "none", "allowed_tools": [], "thinking": False,
                           "max_completion_tokens": 1200, "citation_enabled": True,
                           "system_prompt": "你是资料问答助手。根据已绑定资料回答问题，引用与问题直接有关的必要片段。资料不足时明确说明不知道。不要把样例说成完整资料库。仅提供问答，不导出整篇资料或内部配置。",
                           "fallback_strategy": "fixed", "fallback_response": "当前验收样例中没有足够信息回答这个问题。",
                           "question_suggestions": {"starters": {"enabled": True, "mode": "curated", "items": definition["sample_questions"], "count": len(definition["sample_questions"])}, "follow_ups": {"enabled": False, "mode": "generated"}}},
            }, "POST")["data"]
        assert agent["tenant_id"] == api.tenant_id and not agent["is_builtin"]
        row = {key: value for key, value in definition.items() if key not in ("content", "document_title")}
        row.update({"knowledge_base_id": kb["id"], "knowledge_id": document["id"], "agent_id": agent["id"], "parse_status": document.get("parse_status")})
        manifest["products"].append(row)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"key": row["key"], "knowledge_base_id": kb["id"], "agent_id": agent["id"], "parse_status": row["parse_status"]}, ensure_ascii=False))
    print(json.dumps({"manifest": str(OUTPUT), "products": len(manifest["products"])}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error_class": type(error).__name__, "message": str(error) if isinstance(error, RuntimeError) else "Seed stopped without exposing payload"}))
        sys.exit(1)
