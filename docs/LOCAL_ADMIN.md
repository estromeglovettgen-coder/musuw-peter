# Musuw 本地运营中台

Musuw 运营中台是仓库内的 TDesign Vue Next 多入口应用，复用腾讯
TDesign 的组件与交互规范，不再运行 Appsmith，也不维护第二套业务
CRUD、权限系统或数据同步层。服务只监听 `127.0.0.1` 的两个固定本地端口
（TEST `4186`、PRODUCTION `4187`），不会部署到公网。

```sh
scripts/musuw-admin start
scripts/musuw-admin status
scripts/musuw-admin logs
scripts/musuw-admin stop all
```

入口：<http://127.0.0.1:4186>（TEST）和
<http://127.0.0.1:4187>（PRODUCTION）

启动器先执行一次前端类型检查和生产构建，再分别启动两个本机 Node 服务。旧
`musuw-appsmith` 容器会被删除；Docker volume `musuw_appsmith_stacks`
和镜像暂时保留，便于确认无遗漏后恢复或单独清理，但它们已不再参与运行。

## 页面和数据权威

固定左栏包含七个页面：

- **概览**：用户、空间、知识库、文档、配额、最近文档和官方服务状态。
- **用户**：搜索与套餐/状态筛选、完整详情抽屉、provider-backed
  entitlement 和严格脱敏的支持调查。
- **知识库与文档**：知识库、文档、解析状态、错误、原文件大小、索引
  计量、存储后端和物理引用。
- **账单**：由 Paddle 签名事件形成的 Musuw 镜像，以及启动时明确选定的
  Paddle 环境通过官方 API 返回的订阅和交易。订阅与交易按能力独立读取；某一项缺少
  权限时只把该项标为 unavailable，已授权数据继续展示，也不会把 403
  伪装成 0 条记录或整页失败。
- **身份**：Musuw 账号镜像和正确的 Supabase 项目标识。只有服务端查询
  适配器实际调用 Supabase Admin API 成功后才宣称官方数据 available；仅检测
  到一个凭据不会冒充连接成功。
- **存储**：分开显示 `file_size`、`storage_size`、
  `tenant.storage_used`、套餐配额、Musuw 后端和物理对象引用。
  其中 `tenant.storage_used` 是产品与配额的唯一权威值，等于未删除知识行的
  非负 `file_size + storage_size`；前两项仅用于原文件/索引诊断，不形成第二套配额。
  “数据库有引用”不会被描述成“R2 HEAD 已成功”。
- **日志与追踪**：直接复用 Musuw 的运行队列与系统审计组件。
  Langfuse 查询未配置时显示 unavailable；不会绘制虚假空图表。

数据权威保持单一：

- PostgreSQL 连接强制 `default_transaction_read_only=on`，只负责运营查询。
- 用户/空间状态、配额和 OpenRouter 额度写入仅调用 Musuw
  capability-scoped 管理 API，继续经过服务端校验与系统审计。
- 队列操作直接复用 Musuw 原生运行队列 API 和确认框。
- Paddle 订阅/交易来自官方 API；套餐状态仍只由签名 webhook 和现有
  billing 服务维护。
- Supabase、Cloudflare R2 和 Paddle 的复杂高风险操作优先打开各自官方
  Console，不在 Musuw 里复制一套供应商控制台。

## 当前能力状态

- Musuw scoped management API：TEST 与 PRODUCTION 均 available。平台密钥
  只从 macOS Keychain 对应环境账号读取，不进入页面 JavaScript、日志或仓库。
- Paddle：TEST 固定读取 Sandbox；PRODUCTION 使用 production Keychain 项读取
  Live API。API 可达只证明对应能力调用成功，不能替代 account/domain、default
  payment link、destination 或 checkout 健康。浏览器只接收字段白名单投影；
  套餐仍只由签名 webhook 更新，退款、支付和供应商级配置继续交给 Paddle 官方后台。
- Supabase Auth Admin：Musuw Staging `achfnnicetupvtoqiwqd` 与 Musuw
  Production `phtveqtlswzokwsztsvu` 已分别在 TEST/PRODUCTION 进程通过官方
  Admin API。单个进程只读取所选环境凭据；另一项目仅显示 ref 与未选择状态。
  服务端不返回 `user_metadata`、令牌或密钥。
- Cloudflare R2：PRODUCTION 通过官方 S3 API 读取 `musuw-production/weknora/`
  清单；TEST 的产品运行时使用本地存储，所以明确显示“不适用”，不要求或
  伪造一组 TEST R2 凭据。
- Langfuse：TEST 与 PRODUCTION 均连接 JP Cloud 的 `Musuw` 项目。生产应用
  已产生真实 trace；运营台只展示 observation ID、trace ID、类型、模型、
  用量、环境、release 和时间，不返回 input、output、prompt、content 或附件。

密钥位置、账号、远端文件、权限边界和安全的“只检查存在性”命令统一记录在
[`docs/SECRETS_AND_INTEGRATIONS.md`](SECRETS_AND_INTEGRATIONS.md)。该文档不含
任何密钥值。

## 2026-08-22 真实浏览器验收（历史证据）

- PRODUCTION 七页当时以真实数据渲染；所选 Paddle provider 配置的订阅与交易
  读取返回可用但为空，不把真实空页伪装成失败。该历史读取不能再标注为
  “Paddle Live 已连接/授权”。当前 PRODUCTION 运营进程已改为 Live API 只读，
  必须以本次切换后的新验收替代这条历史空结果；其他 Supabase、R2 与 Langfuse
  验收结论不受影响。
- TEST 七页全部通过：7 位用户；Paddle Sandbox 返回 2 个订阅、27 个交易；
  Supabase 与 Langfuse 可用；R2 以“TEST 本地存储”显示为不适用。
- Chrome 实际打开用户完整详情、严格脱敏调查、文档详情和 `UPDATE:<tenant>`
  二次确认表单。确认按钮在输入精确短语前禁用；验收没有提交生产业务写入。
- 一次低成本 PRODUCTION 对话经过消费者、WeKnora、模型和 Langfuse，随后
  运营台通过官方 API 读取到 5 条安全 observation 元数据，且页面搜索不到
  原始 prompt。
- Playwright 3/3 通过，覆盖真实运营流程、404/403/CSRF/脱敏边界和全部七页
  WCAG A/AA serious/critical 扫描。浏览器与自动化均无控制台错误。

## TEST / PRODUCTION 切换

启动器同时维护两个完全隔离的进程：TEST 固定在 4186，PRODUCTION 固定在
4187。运营台顶部环境菜单只导航到另一个已运行的本地 origin，不发起重启、
轮询或跨环境代理请求，因此切换是即时的。每个进程独立持有只读数据库池、
运行时配置、日志、pid 文件和会话 cookie 名；浏览器按端口切换时不会复用另一
环境的会话。

推荐用一次命令启动两个环境：

```sh
scripts/musuw-admin start
```

执行 `start` 或 `production` 即表示本机操作者明确选择启动只读生产运营台；
它只读取生产业务数据；只有本次 Live cutover 的 Dashboard、部署、checkout 和
signed-notification 证据可以证明实际可售状态。

PRODUCTION 还要求本机 ignored 文件
`.runtime/musuw-admin/production.env` 提供独立数据库、后端和供应商配置。
在 PRODUCTION 启动前，服务还会先调用现有启动器的受控
`prepare-production-tunnel` seam，验证生产端口确实由本启动器拥有：使用
`musuw-tokyo`（可用 `MUSUW_ADMIN_PRODUCTION_SSH_TARGET` 覆盖）固定受限 SSH
alias，强制 BatchMode 与严格校验 known_hosts，不要求 root 登录；通过该受限用户
执行 `sudo -n docker inspect` 获取固定 `weknora-v072-production-postgres` 容器
IPv4，再由同一用户通过 ControlMaster 建立 loopback forward。即使端口已有 TCP
监听，也不会把陌生进程当作生产隧道；归属校验或隧道准备失败会立即返回明确错误，
不会启动 PRODUCTION 进程。
PRODUCTION 进程启动时会建立独立 PostgreSQL 连接池，并通过
`SHOW transaction_read_only` 确认数据库会话为只读；初始化或健康检查失败只会
停止 PRODUCTION。缺文件、隧道归属失败、跨环境请求或数据库不是只读时都
fail closed；TEST 凭据、数据库地址和供应商 secret 不会自动复制到
PRODUCTION。单独启动或停止一个 target 不会终止另一个 target。

隧道的本地端口默认取 `MUSUW_ADMIN_DATABASE_URL` 中的端口（未指定时回退到
历史端口 `15433`），远端 PostgreSQL 端口默认 `5432`。如现有 SSH/Compose
配置使用其他端口，只能通过非密钥的
`MUSUW_ADMIN_PRODUCTION_TUNNEL_PORT` 或 `MUSUW_ADMIN_PRODUCTION_DB_PORT`
覆盖。执行 `scripts/musuw-admin stop production` 会停止 PRODUCTION 并关闭同一
ControlMaster；`scripts/musuw-admin stop test` 只停止 TEST，`stop all` 停止
两个 target。若一个 target 启动失败，启动器会保留该 target 的失败日志并保持
另一个已运行 target 不变。

## 写操作与安全边界

- 用户管理只接受 `active`/`inactive`、正数存储配额，以及当前套餐范围内
  的 OpenRouter 额度重置/调整；套餐和 Paddle 字段不能由表单修改。
- 用户管理必须逐字输入 `UPDATE:<tenant_id>`；运行队列动作使用 TDesign
  原生确认框。
- 所有浏览器写请求同时要求本机会话、`SameSite=Strict` cookie、精确
  Origin 和 CSRF token。仅打开 API URL 不会创建会话。
- Node 代理精确允许 entitlement、用户调查、租户白名单更新、OpenRouter
  额度、运行队列和审计路由。系统设置和平台密钥管理仍返回 404；越权
  mutation 返回 403。
- 支持调查永远不返回 prompt、message content、attachments、provider
  keys、span payload 或 dead-letter payload。
- CSP、`frame-ancestors 'none'`、`X-Frame-Options: DENY`、host allowlist、
  12 秒上游超时和有限分页均由服务端强制执行。

## 验证

```sh
npm run admin:build
npm run admin:test
npm run admin:e2e
```

浏览器验收覆盖七页导航、真实非空数据、搜索/筛选、详情抽屉、按能力拆分
的 provider available/unavailable/not-applicable 状态、危险动作确认、CSRF、
审计、404/403 边界、敏感字段脱敏，以及全部七页的 WCAG A/AA 严重问题扫描。
