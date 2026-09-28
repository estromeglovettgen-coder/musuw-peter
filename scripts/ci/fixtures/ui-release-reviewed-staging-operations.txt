# Musuw staging 运维与发布

本文是 `staging.musuw.com` 的运维边界。Staging 是一次性验收和回归环境，
不是生产副本，也不是新的产品运行时。生产仍使用 Paddle Live；staging 只使用
Paddle Sandbox 和测试身份。凭据只记录在
[`external-credentials-registry.yaml`](external-credentials-registry.yaml) 的元数据
清单中，本文件不记录任何 secret、token、webhook secret、客户资料或供应商响应。

## 拓扑与隔离

两套 Compose project 运行在同一台 Tokyo 主机，但除了明确共享的 Cloudflare
Tunnel edge 网络和同一组不可变镜像外，不共享运行状态：

| 边界 | Production | Staging |
| --- | --- | --- |
| Compose project | `weknora-v072-production` | `weknora-v072-staging` |
| HTTPS host | `app.musuw.com` | `staging.musuw.com` |
| Paddle | 一个完整 Live unit | 一个完整 Sandbox unit |
| Supabase | production Auth project | 独立 test Auth project |
| PostgreSQL/Redis/files | production volumes、生产 Redis namespace | 独立 PostgreSQL、Redis namespace、文件 volume、DocReader 临时 volume、SearXNG 配置 volume |
| Object storage | production R2 bucket | 独立 R2 test bucket |
| OpenRouter | production workspace/management key | 独立 test workspace/management key |
| release pointer | production current/release root | staging current/release root |

Staging 只有 frontend 通过现有 edge 网络的 `staging-web` alias 暴露给 Tunnel；
app、SearXNG 和数据服务不开放主机公网端口。SearXNG 使用同一份上游模板和
复用的 entrypoint，但配置 volume、容器和 secret 均为 staging 独立实例。Cloudflare 必须为
`staging.musuw.com` 提供有效 TLS，并把该 exact host 路由到 staging alias，
不能把 production 的 `web` alias 或 origin 混入。所有 workspace、auth、API 和
静态响应都应带 `X-Robots-Tag: noindex, nofollow`。

Compose overlay 在 [`integration/weknora-staging/compose.yaml`](../integration/weknora-staging/compose.yaml)
中固定 project、容器、网络、volume、资源上限和 Sandbox 选择；edge overlay
在 [`compose.edge.yaml`](../integration/weknora-staging/compose.edge.yaml) 中只复用
既有 Tunnel 网络。服务端只拉取 app/frontend 的 `repo@sha256`，始终使用
`--no-build`，不在 Tokyo 编译或重新标记镜像。

## 发布状态机：staging-only → 人工验收 → promote

同一个授权的 40 字符 Git SHA 只构建一次 app/frontend。CI 记录两个精确 digest，
然后执行 staging：

1. `workflow_run` 或手动 `staging-only` 只授权 main 上 CI-green SHA、构建一次、
   通过 GitHub `staging` Environment 部署并验证 staging；不触碰 production。
2. 远端固定 SSH gate 验证当前 SHA、容器 digest/OCI revision、健康、Sandbox
   public config、隔离 volume/network 和 noindex。GitHub runner 不直接执行
   server-local Docker verifier。
3. 运维完成下面的完整 Paddle Sandbox E2E（支付、升级、取消/到期、恢复、
   webhook 可靠性、会员身份、OpenRouter 额度、portal/history）。只有全部证据
   通过后，才允许手动 `workflow_dispatch` 的 `promote`，并提供**同一 SHA**和
   staging release artifact/run ID，同时显式选择 `full-sandbox-e2e-green`。
4. `promote` 下载并校验 prior staging record，复核当前 staging 的 SHA/digest，
   比较 app/frontend 两个 `repo@sha256` 完全一致后，才进入 `server-production`。
   `server-production` 必须始终保留账号所有者 required-reviewer protection；workflow
   在晋级前还会通过 GitHub API 检查该规则，Environment 审批完成后才启动生产 job。
   Promote 不执行 browser build、Docker build 或 mutable tag 解析。任何不一致都
   在 production Compose/current pointer 变更前失败。自动 staging artifact 只声明
   `staging_deployment=success`，绝不把健康/静态验证伪装成完整 E2E acceptance。

不存在 `full` 或“健康检查后自动生产”的路径。人工 Paddle 验收是发布门，不是
可选说明；storage accounting 修复也必须等这条门全部通过后才开始。

## CI Environment 与 secret 边界

GitHub `staging` Environment 只提供 staging 部署所需的受限输入。仓库中只引用
变量名，不复制值：

- `MUSUW_STAGING_SSH_PRIVATE_KEY`、`MUSUW_STAGING_SSH_KNOWN_HOSTS`、
  `MUSUW_STAGING_SSH_REMOTE`、`MUSUW_STAGING_SSH_PORT`；
- `MUSUW_STAGING_PUBLIC_ENV` 与 `MUSUW_STAGING_AUTH_PUBLIC_ENV`，分别是非密钥
  public runtime 和 browser public auth coordinates；
- workflow job 临时使用的 GHCR token 仅为 job-scoped、read-only deploy 输入，
  不写入 artifact 或 server permanent config。

Tokyo 的 staging runtime 目录是 `/opt/weknora/staging-runtime`，secret 子目录
是 `/opt/weknora/staging-runtime/secrets`。数据库、Redis、AES/JWT、OIDC、Supabase
service key、OpenRouter management key、TikHub、Paddle Sandbox API key/webhook
secret、R2 access key 与 SearXNG secret 都必须是 regular、non-symlink、非空、
root-owned `0600` 文件，再由 Compose 只读挂载。TikHub 必须使用该目录中的
`tikhub_api_key`：
`prepare-runtime.sh` 和部署验证只检查存在性、类型、非空、owner 与 mode。Compose
把它只读挂载；本地文件型 secret 会保留宿主机 root-owned `0600` 源 mode（Compose
声明的 `0400` 不作为 bind mount 的安全证明）。app entrypoint 才在后端进程内读取为 `TIKHUB_API_KEY`。缺失或空值
会在启动前 fail closed；密钥不得进入镜像、public/generated env、前端、日志、任务
payload 或 artifact。

Staging provider identity 也必须 fail closed：Supabase public URL 固定为已配置的
test project，R2 bucket 固定为 `musuw-staging`；OpenRouter workspace UUID 同时存在
GitHub staging public input 和服务器 root-owned `0600`
`/opt/weknora/staging-runtime/openrouter-workspace-id` pin 中，两处不一致就拒绝启动。
该 UUID 是非密钥身份元数据；management key 仍只在 secret 文件中。不要把 production
Supabase URL、R2 bucket 或默认/production OpenRouter workspace 写进这三个位置。

不要在终端、浏览器 DOM、截图、CI 日志或 release artifact 中输出任何凭据、客户
PII、完整 webhook body 或个人支付资料。若必须由账号所有者完成登录、验证码、
Paddle domain/notification 确认或 Cloudflare Access 变更，停在准确页面并只报告
需要 owner 做的动作。

## 运维预检

从仓库根目录执行只读检查；这些命令不连接 Paddle、Cloudflare 或真实支付系统：

```sh
bash scripts/weknora-staging/contract.test.sh
bash scripts/weknora-staging/verify-static.sh
bash scripts/weknora-staging/gate-simulation.test.sh
ruby scripts/ci/validate-workflows.rb
```

部署由 workflow 的 `scripts/weknora-staging-deploy.sh <full-sha>` 完成。该 runner
只接受 full SHA，通过固定 `prepare`/`deploy`/`verify` SSH verbs、受限用户和 pinned
known hosts 上传 manifest-backed source，并让远端 root gate 调用冻结 release
中的 verifier。不要手工绕过 gate、传入 caller-selected command/path，或在服务器
直接运行 Compose build。

TikHub 首次安装或轮换后，还要用一个受支持的公开社交作品 URL 做真实 staging
验收。任务必须从 `processing`/`finalizing` 到 `completed`，持久化为现有 Markdown
或视频文件并产生可检索分块；页面和数据库均不能继续显示
`Social link import is not configured`。对于 TikHub 或其媒体/存储链路的瞬时失败，现有文档任务
最多自动重投一次；确定性的配置、路由、格式、大小和安全校验失败不重投。源文件
一旦持久化，后续任务重试只复用已保存的文件，不再次计费调用 TikHub。证据只记录平台类别、终态、文件类型、分块计数、耗时和
脱敏 request ID，不记录原始分享文本、完整 URL、响应体、签名媒体地址或密钥。

上线前逐项确认：

- `staging.musuw.com` 的 DNS、Cloudflare TLS、Tunnel exact host/alias 和
  Nginx route 均指向 staging；Paddle webhook exact POST path 保持公开 bypass，
  其余交互路由可复用现有 Access；
- Compose 渲染包含 app/frontend、数据服务和 SearXNG init/sidecar，全部有 CPU/memory/pids limit，app/frontend
  images 是本次记录的 digest，所有数据 mount/network/namespace 以 staging 命名；
- staging public config 是 Sandbox、noindex 响应有效，production public config
  仍是 Live；两套 `staging.env`/`production.env` 和 secret directory 不互相复制；
- 主机内存、swap、OOM、restart 和 production health 在验收期间持续正常；若
  staging 威胁 production 可用性，立即停止 staging，不扩大资源或增加网络层。
  新 digest 已触发 Compose mutation 后，只要 health、release record 或 current pointer
  任一步失败，release helper 会自动 `down --remove-orphans` 停止 staging 并保留命名卷。

## Paddle Sandbox readiness 与验收序列

Sandbox unit 必须原子配置：SDK mode `sandbox`、Sandbox API URL、一个
`test_` client token、一个 `pdl_sdbx_apikey_` server API key、一个
`pdl_ntfset_` destination signing secret，以及 Plus/Pro/Max 的 monthly/yearly
六个不同 recurring USD `pri_` price IDs。Paddle Dashboard 还必须分别证明
approved staging checkout domain、Sandbox `/pay` default payment link、location
tax、余额/币种和 payment-method eligibility；这些 provider-owned 行为不在 Musuw
重写。Production Live unit 的 catalog、destination、default link、secret、money
settings 不得因 staging 配置而改变。

唯一 webhook destination 使用公开的
`POST /api/v1/billing/paddle/webhook`，并精确订阅：

`subscription.created`、`subscription.activated`、`subscription.trialing`、
`subscription.updated`、`subscription.past_due`、`subscription.paused`、
`subscription.resumed`、`subscription.canceled`、`transaction.completed`、
`adjustment.created`、`adjustment.updated`。

Cloudflare Access 不得拦住该 exact webhook path；origin 仍必须验证 Paddle raw-body
signature、event ID、时间容差、tenant/customer/subscription binding 和已知 recurring
price，再入现有队列后返回 2xx。错误签名、未知价格/数量、非 recurring item、缺少
binding 或队列失败不能授予 entitlement，且应返回非成功状态以触发 provider retry。

用全新 Sandbox 身份和官方测试工具留下不含 secret/PII 的状态、计数和时间证据：

| 场景 | 必须观察的结果 |
| --- | --- |
| Free → Plus 初购 | 官方成功测试卡完成 Checkout；callback/API response 不改变 plan；签名 subscription lifecycle 入队并应用本地 Plus、确认 paid period 和 OpenRouter allowance。 |
| 失败支付 | 官方 decline card 保持 Free、无 paid period、无 allowance，且不产生真实收费。 |
| 升级 | Plus→Pro（必要时 Pro→Max）先 preview，再 server-owned subscription update，单 recurring item、`prorated_immediately`、`prevent_change`；只有签名 `subscription.updated` 改本地 plan/额度。重复、并发和 uncertain retry 不得重复 provider mutation。 |
| 取消/到期 | 从 Paddle portal 取消；确认 period boundary 前仍可用，随后一次性回 Free。不要用本地表单提前撤权。 |
| 恢复 | portal resume 或新订阅只接受较新的已签名 provider state；旧、乱序 lifecycle 不得恢复或回滚。 |
| webhook 可靠性 | duplicate、retry、out-of-order、tamper、unknown price/quantity、unsigned、adjustment revoke/reversal 都按现有 idempotency/watermark/tenant transaction 规则处理；队列必须先于 2xx。 |
| 会员/租户 | Owner/Admin 可 checkout、upgrade、portal；Viewer/Contributor、tenant mismatch 在 provider 调用前拒绝。Current 只返回字段白名单，不泄露内部 customer/subscription IDs。 |
| OpenRouter 个人账期 | Current 的 usage/remaining/reset/status 与本地 entitlement 一致；renewal 每周期只刷新一次，past_due/未确认 period 为 pending/0，provider 402 fail closed，跨 tenant 使用稳定 opaque user ID。 |
| Portal/history | `portal-session` 只能用服务端 tenant-owned customer identity，返回短期 HTTPS URL；在 Paddle-hosted Sandbox portal 检查 subscription、payment method、invoice/history。Musuw 当前没有独立 billing-history API/UI。 |

不输入真实银行卡，不创建 Live entity，不确认真实购买，不做退款、chargeback、
transfer、payout 或 withdrawal。所有 Sandbox card/simulation 都只用于测试。把
上述每项和静态/单测证据收齐后，才可使用 `full-sandbox-e2e-green` 发起 `promote`。

纯 UI 修复可使用 `ui-regression-green`：必须先完成该版本的 UI 回归，并提供由
production reviewer 核对的当前正式环境 `ui_base_sha`。工作流会从该基线检查完整
diff，只允许受限 UI、测试、provenance 和独立 storefront 路径；后端、鉴权、
支付、API、依赖及构建配置变化会拒绝此类别。仍须复用同 SHA 的已验证 staging
镜像、通过 CI、核对在线 staging digest、获得 `server-production` 审批并保留
原有回滚流程。UI 验收不会被记录为完整支付验收。

登录展示模块及随附的测试、文档和已审核发布文件，使用 scope checker 中的精确
Git blob 内容许可；许可路径上的未审核改动或删除仍会拒绝。该许可只覆盖已审核的
背景展示修复，不包含登录流程、令牌、会话、权限、支付接口、依赖或服务端运行配置。
后续修改这些例外文件必须重新审阅内容并更新许可，不能仅凭相同文件名晋级。

## 回滚与证据

- Staging 部署或验收失败：停止 `weknora-v072-staging` project，保留 staging
  volumes、R2 test bucket、runtime 和 release record，按 owner 审核后再清理；
  删除/暂停 staging DNS route 前先确认 webhook 目的地不会误指 production。
- Promote 在 preflight 失败时不触碰 production。若失败发生在 app/frontend
  replacement 之后，release helper 会从 root-only 快照恢复旧 runtime env，并用旧
  release source 自动重建旧 digest pair；current pointer 始终留在旧 release。容器
  instance 可能被重建，但 Live Paddle unit、production volumes/R2/secrets 不变。
  自动回滚若明确报错，停止发布并进入人工停机保盘处置；不做 SQL 修账或删除卷。
- Production 回滚遵循 [`DEPLOYMENT.md`](DEPLOYMENT.md) 的停机保盘策略；不要只切
  Tunnel 当作数据安全回滚，也不要同时启动两个 production connector。

最终证据只保留 SHA、digest、project/container/network/volume 名称、HTTP 状态、
事件计数、队列结果和时间戳。不得保留 secret、完整 provider payload、支付资料、
customer PII 或浏览器 session。

相关规范与脚本：

- [`DEPLOYMENT.md`](DEPLOYMENT.md)
- [`SECRETS_AND_INTEGRATIONS.md`](SECRETS_AND_INTEGRATIONS.md)
- [`PADDLE_LIVE_READINESS.md`](PADDLE_LIVE_READINESS.md)
- [`integration/weknora-staging/compose.yaml`](../integration/weknora-staging/compose.yaml)
- [`scripts/weknora-staging-deploy.sh`](../scripts/weknora-staging-deploy.sh)
- [`sandbox-billing-release-gate` OpenSpec](../openspec/changes/deploy-isolated-staging/specs/sandbox-billing-release-gate/spec.md)
