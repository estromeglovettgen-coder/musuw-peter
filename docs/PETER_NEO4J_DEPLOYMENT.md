# Peter 独立实体关系图谱部署记录

2026-09-30 在 Peter 专属主机 `musuw-build-x64` 启用 Neo4j。它与页面上的 Wiki 链接图分开存储：Wiki 的 `/wiki/graph` 展示页面及链接，Neo4j 保存文档提取的实体及关系。此部署不涉及原 Musuw 环境。

## 部署状态与边界

- `deploy/peter/compose.yaml` 使用固定 Neo4j 镜像摘要、内置 APOC、768 MiB 内存上限、0.75 核和 256 进程上限；堆初始/最大 256 MiB，页缓存 128 MiB。服务仅在 Compose 网络提供 Bolt/HTTP，宿主机没有映射端口。数据持久化于 `/var/lib/musuw-peter/neo4j`。
- 密码在服务器本地随机生成，存于 `/etc/musuw-peter/neo4j-auth`（`0600 root:root`）；应用和 Neo4j 通过 Docker secret 读取。仓库、日志和本记录都不包含密钥。应用 `NEO4J_ENABLE=true`，在 Neo4j 健康后启动。
- 上线前保留 `/opt/musuw-peter/deploy/compose.yaml.pre-neo4j-20260930` 和 `/opt/musuw-peter/deploy/app-entrypoint.sh.pre-neo4j-20260930`。Peter 默认 KnowledgeQA 的原始非密钥模型配置保存在本机忽略目录 `.runtime/peter/deployment/neo4j-default-model-backup.json`，其中 `thinking_control` 原为 `none`；线上已改为 `thinking_type`，让图谱提取明确关闭 DeepSeek 默认思考模式。

## 现场验收

- Compose 配置校验通过；Neo4j 与 app 健康检查为 healthy。APOC 版本查询成功，认证 API `/api/v1/system/info` 返回 `graph_database_engine: "Neo4j"`。
- 虚构客户验收库 `9f11d99a-f730-4631-aca4-940138e21165` 使用 `vector=false, keyword=false, wiki=true, graph=true`，文档 `a59513f2-3341-4332-8afb-d46e31fad8f7` 解析完成。直接查询 Neo4j 得到 5 个实体节点、3 条关系，含“Peter 负责跟进米娅”和“米娅关注表达课程”；同一客户 Wiki 图 API 独立返回 6 个页面节点、13 条链接边。
- 同凭据的隔离测试模型在 `thinking_type` 下完成原生 debug 和真实实体提取；随后 Peter 默认 KnowledgeQA 改为相同控制策略，原生 debug 和既有销售助手常规聊天均通过。两个临时测试库及隔离模型已经删除，Neo4j 中只保留上述标注“虚构”的客户示例。
- 现场观察到图谱提取耗尽重试时文档仍可能误报 completed。图谱子任务终态修复及其失败、重试、重解析、取消测试已随 `musuw-peter:20260930-02` 部署；现场图谱查询工具的正向链路已重新验收。异常路径目前有服务层自动化测试证据，未在线上故意中断 Neo4j 复演。
- 新镜像的 `query_knowledge_graph` 已由临时智能体在绑定客户的会话中真实调用：SSE 返回 3 个实体、3 条 Neo4j 关系，另一个测试租户不能读取该客户库。Neo4j 容器重启并恢复 healthy 后，同一脚本再次查到 3 个实体、3 条关系，证明图谱持久化与应用连接恢复；临时智能体与会话已删除。证据保存在本机忽略目录 `.runtime/peter/deployment/graph-tool-acceptance.json`。
- 验收后 Neo4j 容器约 632 MiB / 768 MiB，主机可用内存约 1.96 GiB、系统盘剩余约 5.3 GiB。资源余量适合少量顺序文档；扩大导入量前需再次观测。

## 检查与回退

运行状态在服务器 `/opt/musuw-peter/deploy` 下用 `sudo docker compose ps`、`sudo docker compose logs --tail=100 neo4j`、`sudo docker stats --no-stream musuw-peter-neo4j-1` 检查；应用还需真实登录及上传文档验证。不要把 `/api/v1/system/info` 当作持续的数据库探活：它只说明应用启动时 Neo4j 已通过认证。

若需关闭此能力，先回退任何默认启用实体提取的 Peter 前端发布，再在服务器执行：

```sh
cd /opt/musuw-peter/deploy
sudo docker compose stop neo4j
sudo install -m 0644 compose.yaml.pre-neo4j-20260930 compose.yaml
sudo install -m 0755 app-entrypoint.sh.pre-neo4j-20260930 app-entrypoint.sh
sudo docker compose config --quiet
sudo docker compose up -d --no-deps --force-recreate app
```

回退后用登录、已有客户/Wiki/对话链路验收。保留 Neo4j 数据目录和服务器密钥以便恢复；不要执行 `down -v`。如还需回退模型行为，可根据本机备份通过原生模型 API 将 Peter 默认 KnowledgeQA 的 `thinking_control` 恢复为 `none`，但这会重新启用 DeepSeek 默认思考模式。
