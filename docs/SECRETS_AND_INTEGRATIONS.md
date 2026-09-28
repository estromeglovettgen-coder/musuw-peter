# Musuw 密钥与官方集成清单

最后核对：2026-08-30（America/Phoenix）。本文件只记录变量名、服务/账号标签、
文件名、权限、消费者和健康证明，**绝不记录密钥值、邮件地址、完整主机/IP、
hash 或供应商响应内容**。

完整的、可机器校验的去重注册表见
[`docs/external-credentials-registry.yaml`](external-credentials-registry.yaml)。
所有项目的密钥都只在这个注册表登记一次；其他仓库只保留指向当前权威来源的
索引，不复制值。

域名审核、support phone、`/pay` 与 `/checkout` 的区别、Live Dashboard
操作顺序和阻断级别见
[`docs/PADDLE_LIVE_READINESS.md`](PADDLE_LIVE_READINESS.md)。
Staging 的独立 Compose、Sandbox 和发布门见
[`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md)。

## 1. 当前硬边界

- 正式生产使用一个完整的 **Paddle Live** 单元；`staging.musuw.com` 使用
  独立的 Paddle Sandbox 测试单元。Sandbox 证据不能证明 Live 已获批或改变
  production 配置。
- Live 的环境选择、client token、六个价格 ID、API key、webhook secret、
  notification destination 和默认付款链接必须属于同一个 Live 账户。
  Live 与 Sandbox 不可混用。
- 生产公开环境中的 `MUSUW_PADDLE_ENVIRONMENT` 必须是 `live`；
  `scripts/ci/verify-external-credentials-registry.sh` 和生产静态校验会挡住
  Sandbox-shaped 的 client token/API key、缺失价格目录或混合环境。Live 仍须
  通过 Dashboard/API 的 catalog、domain、destination 与无扣款健康证明；不能只
  凭前缀或 Keychain 项存在性宣称可收款。
- 浏览器只能接收 publishable/client/catalog 值；server secret、management/admin、
  webhook signing、SSH/deploy 和 OAuth secret 只能从 Keychain、GitHub Environment
  或服务器 `0600` 文件进入受控进程。
- 官网智能客服只允许 `musuw-site` Worker 持有单一网页嵌入渠道的 publish token。
  浏览器只收到渠道 ID 与同源短令牌端点；Worker 调用现有 `/exchange` 换取 30 分钟
  session token。该 publish token 不得进入仓库、静态 bundle、HTML 或日志，也不能
  复用于账号、租户、账单或模型供应商权限。
- TikHub 社交链接入库只读取后端进程的 `TIKHUB_API_KEY`。Musuw production 与
  staging overlay 都要求 root-owned `0600` 文件 `tikhub_api_key`：预检只验证文件
  元数据，Compose 只读挂载并保留本地源文件的 root-owned `0600` mode；声明的
  `0400` 不作为 bind mount 的运行时证明。app entrypoint 才在进程内读取并导出。
  供应商地址由代码固定，密钥不得进入前端 runtime config、用户请求、任务 payload、
  日志、数据库字段或生成的 env；本地/社区部署未配置时应明确拒绝受支持的社交平台
  解析，同时继续保留普通网页 URL 入库。

## 2. 本机 macOS Keychain（只检查存在性）

运营台通过 `/usr/bin/security` 读取下列项；浏览器得到的始终是字段白名单投影。
`present` 只表示 service/account 项存在，不代表读出或授权了它的值。

| Service | TEST 账号 | PRODUCTION 账号 | 边界与用途 |
| --- | --- | --- | --- |
| `com.musuw.local-admin.platform-key` | `musuw-admin-test` | `musuw-admin-production` | capability-scoped WeKnora 管理 API；不开放 settings/API-key management。 |
| `com.musuw.local-admin.paddle-api-key` | `musuw-admin-test` present | `musuw-admin-production` present | TEST 对应 Sandbox；PRODUCTION 对应 Live，只供官方 API/运营只读能力与现有订阅操作。 |
| `com.musuw.local-admin.paddle-webhook-secret` | `musuw-admin-test` present | —（不要求本机副本） | TEST Sandbox destination；Live exact-destination secret 直接进入服务器保护文件，不复制进文档或浏览器。 |
| `com.musuw.local-admin.supabase-secret-key` | `musuw-admin-test` | `musuw-admin-production` | Supabase secret-key 类型，只供 Auth Admin/运营台。 |
| `com.musuw.local-admin.r2-access-key-id` | — | `musuw-admin-production` | R2 S3 访问标识；TEST 使用本地存储。 |
| `com.musuw.local-admin.r2-secret-access-key` | — | `musuw-admin-production` | R2 S3 server secret；只供服务端。 |
| `com.musuw.local-admin.langfuse-public-key` | `musuw-admin-test` | `musuw-admin-production` | Langfuse 项目 public key；按 environment 隔离。 |
| `com.musuw.local-admin.langfuse-secret-key` | `musuw-admin-test` | `musuw-admin-production` | Langfuse 项目 secret key；只供服务端。 |

安全地检查某一项是否存在（不要加 `-w`）：

```sh
security find-generic-password \
  -s com.musuw.local-admin.platform-key \
  -a musuw-admin-test >/dev/null
```

退出码 `0` 仅表示存在。禁止使用会把值输出到终端的命令，也禁止在开发者工具、
DOM snapshot、截图、日志或交接消息中查看供应商 secret。

## 3. 本机 ignored runtime

这些路径受 `.gitignore` 保护；密钥文件当前约定为 `0600`，但文档仍只记录路径和
用途，不记录内容：

| 路径 | 内容边界 |
| --- | --- |
| `.runtime/musuw-admin/production.env` | 旧本机运营进程的连接信息；保留用于回滚，供应商 secret 来自 Keychain。 |
| `/opt/musuw-operations/runtime/production.env` | 服务器常驻运营服务的连接信息；仅服务账号可读，数据库使用现有只读角色。 |
| `/opt/musuw-operations/runtime/secrets/` | 既有运营凭据的服务器副本；目录 0700、文件 0600，仅服务账号可读；不进入发布 artifact。 |
| `.runtime/weknora/candidate.env` | TEST WeKnora 与依赖服务运行配置；不得作为生产权威。 |
| `.runtime/weknora/auth-public.env` | Supabase publishable/OIDC 公共值；不提交。 |
| `.runtime/weknora/paddle-sandbox.env` | Paddle Sandbox environment、client token、六个价格 ID；API key/webhook secret 由 Keychain 注入。 |
| `.runtime/weknora/secrets/*` | OIDC、数据库、Redis、AES、JWT 等服务运行 secret；仅本机受控进程读取。 |
| `/opt/weknora/staging-runtime/staging.public.env` | Tokyo staging 的非密钥 Compose/Paddle/Supabase/OpenRouter/R2 选择；由 `staging` Environment 受控输入生成。 |
| `/opt/weknora/staging-runtime/auth-public.env` | staging browser public origin、Supabase public coordinates 和 OAuth client ID；不含 service/API key。 |
| `/opt/weknora/staging-runtime/secrets/*` | staging 独立数据库、Redis、OIDC、Supabase service、OpenRouter、TikHub、Paddle Sandbox、R2、Langfuse test pair 等 server-only secret，regular non-symlink、非空、`0600`。 |

旧的 `candidate`/迁移目录不是生产权威。部署前必须从对应 provider 环境
重新生成公开环境并运行静态校验；staging Sandbox 输入不能覆盖 production Live，
也不能把 staging 文件复制到 production 目录。

仓库顶层 `.env.example` 中的 `DEEPSEEK_*`、`MUSNOW_*` 和旧 Paddle fallback
变量只是空模板/兼容名，不是当前生产 authority；任何仍引用它们的测试或旧快照
都必须迁移到本注册表登记的 `MUSUW_*`/provider-specific source，不能在生产环境
填值。

## 4. 生产服务器保护文件

服务器通过受限 SSH alias 访问；保护目录为 `/opt/weknora/runtime/secrets`，目录
模式 `0700`，宿主机文件模式 `0600`，Compose 以只读 secret mount 进入容器。只
记录文件名和消费者：

| 文件 | 用途 | 当前边界 |
| --- | --- | --- |
| `db_password` / `redis_password` | PostgreSQL、Redis | 内部运行 secret。 |
| `system_aes_key` / `jwt_secret` | 敏感字段加密、会话签名 | 内部运行 secret。 |
| `neo4j_auth` / `searxng_secret` | Neo4j、SearXNG | 内部运行 secret。 |
| `oidc_client_id` / `oidc_client_secret` | Supabase OIDC | server-only OAuth client。 |
| `openrouter_management_api_key` | child-key provisioning、usage/limit 权威 | server-only management key。 |
| `tikhub_api_key` | TikHub 社交分享链接入库 | server-only；只由 app entrypoint 读取，不进 public/generated env、任务 payload 或日志。 |
| `paddle_api_key` | Paddle 官方 API | **必须是 Live API key**，并匹配生产运行时实际权限。 |
| `paddle_webhook_secret` | 签名 webhook | **必须对应唯一 active Live production destination**。 |
| `r2_access_key_id` / `r2_secret_access_key` | Cloudflare R2 S3 存储 | server-only；不进浏览器/Worker。 |
| `langfuse_public_key` / `langfuse_secret_key` | Langfuse trace 写入 | server-only；observability 投影排除内容。 |

`integration/weknora-production/app-entrypoint.sh` 只在容器启动时读取这些挂载；
`scripts/weknora-production/prepare-runtime.sh` 生成不含 server secret 值的
`production.env`。任何生产公开 env 都必须从受控的 Live public contract
生成，不能手工把 candidate 或历史迁移文件复制过去。

### 4.1 Staging server files

Staging uses `/opt/weknora/staging-runtime/secrets` and its own
`staging.public.env`/`auth-public.env`. It has separate PostgreSQL, Redis and Neo4j
volumes/namespace, file and DocReader temporary volumes, R2 test bucket,
Supabase test project, Paddle Sandbox account/destination and OpenRouter test
workspace. The file names mirror the production contract where needed, but the
environment-specific values and provider resources are never shared. TikHub has
no Musuw Sandbox/Live split, but each overlay still receives its own protected
file mount. Staging `neo4j_auth` is generated independently, stored only in this
protected secret directory, and read by the native app/Neo4j entrypoints; it is
never copied from production or stored in the public environment. The staging Compose project is `weknora-v072-staging`; production
remains `weknora-v072-production`.

Staging 的 Langfuse 坐标固定为 `LANGFUSE_ENABLED=true`、JP Cloud host、release
`musuw-staging` 和 environment `staging`。`langfuse_public_key` 与
`langfuse_secret_key` 必须分别来自 staging 的 Langfuse test project；Compose
只读挂载，entrypoint 仅在 app 进程内导出，值绝不进入 public env、release
artifact、浏览器或日志。

Both overlays require a file named `tikhub_api_key` in their own protected
secret directory. Preflight verifies only regular-file shape, non-emptiness,
root ownership and mode `0600`; Compose mounts it read-only and the app
entrypoint exports `TIKHUB_API_KEY` only inside the backend process. Never copy
or transport the value through a public env, release artifact or log.

The GitHub `staging` Environment contains only the staging SSH key/known-hosts,
restricted remote/port, and public runtime files. The release workflow accepts
only `staging-only` or an explicit `promote`; a promote run downloads the prior
staging record, verifies the current staging digest through the remote gate, and
then uses the unchanged production Live inputs. No secret value is emitted into
the release record, CI log, browser bundle or artifact.

安全地只检查文件与权限：

```sh
ssh musuw-tokyo \
  'test -f /opt/weknora/runtime/secrets/paddle_api_key &&
   test "$(stat -c %a /opt/weknora/runtime/secrets/paddle_api_key)" = 600'
```

不要运行 `cat`、`sed`、`xxd`、`base64`、`env` 或任何会显示内容的检查。

## 5. 提供商矩阵与真实消费者

| 提供商/类别 | TEST/Sandbox | PROD/Live | 权威、消费者和健康证明 |
| --- | --- | --- | --- |
| Paddle | Staging 专用 Sandbox public client/catalog、server API key、webhook destination | 一套 Live public client/catalog、server API key 与 exact destination | Paddle 控制台是唯一权威；production 与 staging 的 frontend、checkout、portal/upgrade API 和 webhook 必须各自使用同一环境；健康证明只保留状态/count/price metadata 与无扣款结果。 |
| Supabase Auth | staging test public auth + Auth Admin | Production public auth + Auth Admin | Supabase dashboard/project 是权威；auth shell、OIDC discovery/callback、运营台 Auth Admin；两项目不共享用户/会话，不记录 session/token。 |
| OpenRouter | staging 独立 test workspace/child-key 管理 | production management key + encrypted tenant child key | 官方 usage/limit 是额度权威；entrypoint、entitlement service 和 model transport；tenant key 不进浏览器，两个 workspace 不混用。 |
| Cloudflare Worker | 不适用 | GitHub `storefront-production` 只含 Worker-scoped account/token | GitHub Environment + Cloudflare dashboard；仅 Wrangler 部署，Worker 不拿 server/model/billing secret。 |
| Cloudflare R2 | staging 专用 test bucket 与 protected files | production protected files/bucket | R2 S3 API；应用只返回对象/计量 metadata，staging 对象绝不迁移到 Live。 |
| Langfuse | test Keychain pair | production protected pair | Langfuse 项目；trace health 只返回 count/status，排除 input/output/prompt/content/attachments。 |
| TikHub | staging 独立保护文件 `tikhub_api_key` | production 独立保护文件 `tikhub_api_key` | TikHub dashboard credential 不区分 Musuw Sandbox/Live；两个 overlay 都 fail closed 地要求各自的文件型 mount，只供 WeKnora 社交分享入库 importer，浏览器和任务队列均不得得到密钥；健康证明只保留文件元数据、脱敏状态、完成/分块计数与 request ID。 |
| GitHub/GHCR/SSH | `staging` Environment、restricted staging SSH + pinned known hosts；GHCR token 为 job-only | `server-production` restricted SSH + pinned known hosts；GHCR token 为 job-only | GitHub Environment 和 workflow 是权威；staging-only→人工 Sandbox E2E→exact-digest promote，固定 release gate、health check。 |
| Tencent VectorDB / Alibaba Cloud | optional/independent inventory | Tokyo 当前无此 active consumer | 各自 provider dashboard；仅在明确启用的独立项目中使用，不能从示例变量推断已配置。 |
| Google OAuth / SMTP | Supabase/OAuth 与邮件设置待按项目确认 | 当前 Musuw 没有 direct Google secret consumer；SMTP 由 Supabase Auth 配置边界管理 | Supabase/Google/provider dashboard；只验证 discovery、callback、OTP delivery，不记录 token 或邮件内容。 |

Paddle 的 destination、domain 和默认链接含义也固定在中央注册表：Live
production destination → production app webhook；Sandbox destination → staging
app webhook；storefront plan CTA → app 的认证 `/plans` → `/checkout`；Paddle
transaction/default-payment link → 对应环境的公开 `/pay`。`/pay` 页面已经存在不
等于 Paddle Dashboard 已完成对应环境的绑定；provider 状态必须另行核验。未批准
或未保存的 destination/domain/default link 不得被部署记录当作已完成。Staging 的
exact `POST /api/v1/billing/paddle/webhook` 可绕过 Cloudflare Access，但始终由
origin 验证 raw-body 签名；不得把 webhook secret 放入 browser/public env。

## 6. 其他本地项目：只登记，不复制

受控盘点覆盖 `Documents/Codex` 下 62 个 git 根目录。重复的 WeKnora/Musuw 快照
只归并到当前 Musuw 权威；AiToEarn、Dify、Ditto、Khoj、Pascal、mus-system-health、
marketingskills、openai-codex-fixed 等独立项目在注册表的 `repository_index`
中按 provider/class/owner 去重列出。它们的 `.env.example`、CI、Compose 和源码
消费者只作为索引证据，**不会把值或副本搬到 Musuw**。

特别需要后续治理、但不属于 Musuw Tokyo 当前运行时的类别：

- AiToEarn 的 OSS/SMS/实名、Tencent TMS、Qwen、Google OAuth、Twitter、WeChat；
- Dify 的 DashScope、DeepSeek、Supabase Admin/Google OAuth；
- Ditto 的 Resend、S3-compatible storage、CLI API key；
- Khoj 的模型、搜索、Stripe、AWS、Twilio、Notion、邮件和 CI provider keys；
- Pascal 与 mus-system-health 的 Supabase/Google integrations。

独立项目应链接自己的 provider dashboard/secret store；不要把这些变量填入
Musuw 的 production env。AiToEarn 发现有 tracked env 文件，需由其 owner 单独
处理权限和轮换，不能在本仓库复制或“帮忙猜值”。

## 7. 轮换、撤销、交接与验证

1. 先在对应 provider 选择或创建确有需要的替代 credential，确认最小真实能力；
   Sandbox/Live 分开验证，现有 Live 可用项优先复用。
2. 只通过 Keychain、GitHub Environment 或远端 `0600` 文件原子替换，不经过聊天、
   剪贴板、普通 env、日志或截图。
3. 重启对应服务，验证真实消费者和错误态：Paddle checkout/portal/webhook、
   Auth callback、model request、R2 metadata、Langfuse redacted trace 或 release
   health。
4. 撤销旧 credential；登记状态、能力、权限和验证时间，仍不登记值。
5. 若值曾出现在终端输出、DOM snapshot、截图、日志或 git diff，立即按已泄露处理
   并轮换，不能只删除视觉证据。

Staging 轮换遵循同样的边界：Sandbox/test provider 的 server secret 只原子替换到
staging protected runtime；GitHub `staging` Environment 只承载 SSH 和非密钥 public
输入。先验证完整 Sandbox unit（SDK mode/API URL、client token、API key、
destination secret、六个 recurring prices、approved domain/default link、
tax/currency/payment methods），再用全新测试身份完成完整 Paddle E2E。只有支付、
升级、取消/到期、恢复、签名 webhook 的重试/幂等/乱序、会员身份、OpenRouter 个人
额度及 portal/history 全部通过，才可用同 SHA/同 digest promote；staging 任何
失败都不能触碰 production Live。Paddle webhook 的 exact public path 可 bypass
Access，其他交互路径按现有 Access 策略保护。

验收证据只记录环境、状态、计数、SHA、digest、项目/volume 名称和时间戳；不得
输出 secret、完整 webhook body、客户 PII、支付资料、session 或 provider token。

本地校验入口：

```sh
bash scripts/ci/external-credentials-registry.test.sh
bash scripts/ci/verify-external-credentials-registry.sh
```

这两个脚本只检查注册表元数据、Live-only 生产边界、文档链接和禁止值模式；
不会读取 Keychain secret、连接 provider、扫描 shell history/session 或解析 git
objects/blobs。
