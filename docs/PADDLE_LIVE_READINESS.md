# Paddle Live 正式切换清单

最后核验：2026-08-30（America/Phoenix）。本文件只记录公开页面、资源类别、
操作顺序和非敏感验证结论；不得加入审核账号凭据、个人/企业核验资料、
Paddle 资源 ID、credential 值、网络地址或供应商响应原文。

> 生产 Live readiness 与 staging Sandbox commissioning 是两个独立边界。本文件
> 中的 Live 结论只适用于 `app.musuw.com`/production；它不能替代
> [`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md) 的 Sandbox 端到端验收，也不能
> 允许 staging 写入或修改任何 Live catalog、destination、secret、价格、默认链接
> 或资金设置。Staging 必须先走 staging-only、完整人工 Sandbox E2E，再用相同 SHA
> 和 digest 手动 promote。

## Staging Sandbox readiness（独立、不收费）

Staging 的 Sandbox unit 必须一次性核对并保持成组：SDK mode `sandbox`、Sandbox
API URL、`test_` client token、`pdl_sdbx_apikey_` server API key、`pdl_ntfset_`
destination secret、Plus/Pro/Max monthly/yearly 六个 distinct recurring USD
prices、approved `staging.musuw.com` checkout domain、Sandbox `/pay` default
payment link，以及 Paddle-owned location tax、currency 和 payment-method 设置。
其中 API key 与 destination secret 只进入 staging protected runtime；client
token、模式、价格和其他浏览器公开坐标通过 GitHub `staging` Environment 的 public
输入交付。GitHub `staging` 不保存 provider server secret；任何 Sandbox 值都不得
复制到 production Live files，server secret 也不得进入 browser bundle。

The staging destination exposes the exact public
`POST /api/v1/billing/paddle/webhook` path (Cloudflare Access bypass only for this
path) and the reviewed 11-event set: the nine subscription/transaction events plus
`adjustment.created` and `adjustment.updated`. The origin verifies the raw body
signature before queueing existing billing work and acknowledging; unsigned,
unknown-price, wrong-quantity, non-recurring or queue-failed events must not grant
entitlement and must remain retryable.

Use only official Sandbox success/decline cards and Paddle simulations with a fresh
test identity. The manual gate covers first purchase, upgrade, cancel/period-end
degrade, resume, duplicate/retry/out-of-order/signature handling, local plan and
membership, OpenRouter personal-period allowance, customer portal and provider
billing history. Browser callbacks and API responses never grant a plan. Do not
enter a real card, create a Live entity, or perform a real charge, refund,
chargeback, transfer, payout or withdrawal. Keep only status/count/SHA/digest and
non-sensitive timing evidence. Full details and rollback are in
[`STAGING_OPERATIONS.md`](STAGING_OPERATIONS.md).

## 当前结论

| 阶段 | 当前结论 | 仍需完成 |
| --- | --- | --- |
| 网站域名送审 | **`app.musuw.com` 已通过** | 所有公开产品、价格、法律与联系页面已上线；主域若未显示 approved，仍须单独确认。Owner 已提供并授权真实 buyer-support phone，英文和中文 Contact 页面均已公开并验证可点击；Domain Review 页面没有把 phone 列为独立表单硬门槛。 |
| Paddle account verification | **Verification passed** | 2026-08-27 已在 owner 登录的 Live onboarding 页面重新核验；无需重复提交，也不得从代码推断、读取或代填企业/个人资料。 |
| Live 配置与正式收款 | **Live 已部署并通过无扣款验收** | 3 products/6 prices、Live client/API key、唯一 11-event destination、exact signing secret、`/pay`、Retain 和东京运行时已作为一个 Live-only 单元上线；真实 Checkout 已打开到 Paddle 付款表单后停止，官方 simulation 连续成功。Payout/bank 仍是未触碰的 owner-only 范围。 |

本次独立 review 已把 checked source contract 改为完整 **Paddle Live** 单元；
preflight 和 app entrypoint 现在拒绝 Sandbox、缺项和混合环境。完整公开/保护输入、
CI、exact-SHA 东京部署、Live Checkout 边界和官方无扣款 webhook simulation 已完成，
没有通过单改环境变量或跳过发布门完成切换。

## 现有资源优先与禁止乱建

- 每次操作先盘点现有 Live 资源，再复用符合环境、权限和用途的 active 资源。
- 当前复用一个 active Live API key、一个 active client-side token、完整六价格
  catalog，以及唯一一个 active production notification destination；没有再创建一套。
- 只读权限表已确认其中一个较小权限的 active API key 覆盖当前应用所需的
  `price.read`、`product.read`、`subscription.write` 和
  `customer_portal_session.write`；`subscription.write` 按 Paddle 权限规则同时
  包含 read。Paddle.js 使用 client-side token，webhook 使用 destination secret，
  不需要为它们给 server API key 追加权限。该候选当前仍同时拥有多项无关读写
  权限，因此“可复用且功能充分”不等于“已经最小权限”；本轮不编辑它，也不以
  缩权为理由新建重复 key。正式接入前先盘点其既有消费者，再把拟保留权限、
  影响和回滚写入同一份变更表。
- 2026-08-27 使用现有 production Keychain API key 通过 Paddle 官方 Live API
  重新完成 inventory：3 个 active SaaS products、6 个 active recurring prices、
  2 个 active client-side tokens、1 个 approved app checkout domain 和 1 个 active
  production destination。发布选择复用了其中一组既有 active credential；输出只保留
  count/名称/金额/周期/事件集合，未打印 token、API key、destination secret 或资源 ID，
  也没有创建、撤销或重建 credential/catalog/destination。
- revoked credential 只保留为历史记录，不复活、不删除，也不作为运行时候选。
- 只有现有资源经官方能力和实际调用范围核验后确实不适用，才可以提出新增或
  替换；在执行前必须给 owner 展示资源用途、权限、消费者、secret 落点、切换、
  回滚和旧资源处置的完整变更表并取得确认。
- 不因 Paddle onboarding 提示词包含 “create” 就机械创建重复 key、token、
  destination、product 或 price；提示词必须先与现有 Dashboard inventory 对账。

## 两个域名与两个支付路由

### `musuw.com`

- 公开官网、产品说明、功能与限制、Free/Plus/Pro/Max 价格比较、FAQ、Contact
  以及 Terms、Privacy、Refund、Subscription、Acceptable Use 等法律页面。
- 这里解释卖什么、交付什么及购买政策；套餐 CTA 先进入应用的认证/套餐流程。
- 官网本身不持有 Paddle server credential，也不授予付费 entitlement。

### `app.musuw.com`

- 认证后的 SaaS 产品、知识处理、套餐比较和 Paddle.js 结账所在域名。
- `/checkout` 是已认证用户从 `/plans` 选择一个 server-owned 价格后的正常
  新订阅结账页。服务端只返回一个 allow-listed price 和租户/价格签名绑定，
  Paddle.js 使用标准 `items`/`customData` 创建并显示 Checkout；Musuw 不创建、
  镜像或串行化首购 transaction。它不能作为交易 payment-link 的通用入口。
- `/pay` 是公开的 Paddle default-payment-link 页面。它只初始化 Paddle.js，
  不读取交易查询参数，也不自行调用 `Checkout.open()`；Paddle.js 会在交易
  参数存在时自动打开对应交易。这一页应在 Live 域名获批后成为 Live default
  payment link。

Paddle 要求提交每个会启动 Checkout 的域名/子域名。当前只有
`app.musuw.com` 启动 Paddle Checkout，且该域名已经 approved；`musuw.com`
只做公开说明并跳转应用，不应为了“看起来完整”重复送审。若未来主域直接启动
Checkout，再单独提交它。审核说明中不要把 `/pay` 和 `/checkout` 混写。

## 可直接提交的无凭据审核说明

以下文字可粘贴到域名审核的产品/访问说明中；reviewer credential 必须通过
Paddle 授权的私密渠道另行提供，不能粘贴到本文件、issue、日志或截图：

> musuw is a hosted knowledge workspace. The public website explains the
> product, plan pricing, included features, support, and legal policies. The app
> domain hosts authenticated product access and Paddle.js. Normal new-plan
> checkout starts on the authenticated `/checkout` route after a user selects a
> server-owned plan. The public `/pay` route is reserved for Paddle transaction
> payment links and lets Paddle.js process the transaction query parameter.
> URL imports and video uploads are limited to private knowledge analysis of
> content the user owns or is authorized to use; musuw is not a public video
> hosting, streaming, downloading, or redistribution service. Production billing
> uses Paddle Live only after the reviewed configuration and no-charge health
> checks pass. `app.musuw.com` is approved. The reviewer fixture does not require
> a payment method and does not represent a completed sale.

若 Paddle 要求登录测试账号，安全交付应只包含：

1. 公开登录入口；
2. 通过 Paddle review/support 的私密字段或 owner 认可的安全渠道提供的专用
   reviewer credential；
3. 说明该账号是英文、非管理员 reviewer fixture，不要求或暗示 Live 付款；
4. 建议查看已有英文知识、引用、Wiki/graph、模型/推理、视频分析、Plans 和
   Usage & billing；
5. 明确无需上传私人材料、无需输入真实支付资料，也不要尝试 Live 支付。

reviewer password 和 recovery material 只保留在既有 secret storage 与授权审核
渠道；不得出现在源码、构建产物、截图、DOM snapshot、终端或助手输出中。

## URL 与视频合规边界

- URL import 只为用户拥有或获授权内容建立私人知识索引，不是抓取、流媒体
  下载或内容再分发服务。
- Video upload 只为用户拥有或获授权内容进行私人知识分析，不是面向公众的
  视频托管、播放、下载或再分发服务。
- Acceptable Use Policy 同时禁止侵权、未经授权访问、绕过限制和支付滥用。
- 产品截图/审核视频只能展示虚构且无敏感信息的英文 fixture；不能暗示允许
  下载第三方流媒体，也不能把演示视频当作可售内容。

## Dashboard 与发布的准确顺序

以下顺序以 Paddle 当前官方
[Account Verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification)、
[Domain Review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification)、
[Go-live checklist](https://developer.paddle.com/build/go-live-checklist/) 和
[default payment link](https://developer.paddle.com/build/transactions/default-payment-link/)
为准。

1. **保持已通过的 app 域名，不重复提交。** `app.musuw.com` 已 approved；仅在
   主域尚未 approved 时单独提交/跟进。继续保持 HTTPS、公开产品/价格/功能、
   导航可达的 Terms/Refund/Privacy 和 operator/brand 信息。
2. **保持已通过的 account verification，不重复提交。** 2026-08-27 登录后的
   Live onboarding 页面显示 `Verification passed`。没有新的官方补件请求时不
   重复上传；仓库不能读取、判断、代填或保存 business/individual/identity 材料。
3. **保持真实 support phone 公开可达。** 这不是当前 Domain Review 帮助页列出的
   独立表单字段，但 Seller Handbook 明确要求 buyer-support email 与 phone 都在
   网站清楚可见。Owner 已提供并授权当前号码；英文和中文 Contact 页面均显示
   该号码及标准 `tel:` 链接。号码变更仍须由 owner 明确授权，不能推断或编造。
4. **核对 Live 基础商业选项。** 在 Dashboard 确认 balance currency、
   默认 tax-inclusive/exclusive 行为及要启用的 payment methods。balance currency
   应结合真实 payout account 选择；Paddle 仍负责买家本地币种转换、税额和各
   地区实际可用的付款方式，应用不得按 UI 语言自行推断。
5. **payout settings 只由 owner 另行处理。** 银行/Payoneer、阈值和法定资料是
   私密财务信息，本次明确禁止读取、填写、修改或提交。Paddle 官方说明 payout
   account 影响余额提现，不替代 seller approval 与 checkout 的支付接受状态；
   最终报告必须把“可接受付款”和“可收到 payout”分开陈述。
6. **复用并核验现有 Live catalog。** Dashboard 已有 Plus、Pro、Max 三个 active
   products 及 monthly/yearly 共六个 active recurring prices。逐项确认产品说明、
   周期、币种/税类和运行时映射；不重复建立 product/price，不复制 Sandbox ID。
7. **从现有 active Live credentials 中选择最小充分权限组合。** client-side token
   只供 Paddle.js；API key 只需覆盖运行时实际调用的 catalog read、subscription
   read/update、customer portal session 与验证能力。优先复用现有 active 候选；
   credential 值只进入既有 secret store/受保护运行文件，绝不进入仓库、公开
   env、日志或审核材料。
8. **复用现有唯一 active Live notification destination。** 现已精确覆盖
   `subscription.created`、`subscription.activated`、`subscription.trialing`、
   `subscription.updated`、`subscription.past_due`、`subscription.paused`、
   `subscription.resumed`、`subscription.canceled` 和 `transaction.completed`。
   reviewed refund/chargeback policy 上线时已一次性追加 `adjustment.created` 与
   `adjustment.updated`，形成精确 11-event 集合，`traffic_source=all`。
   destination-specific signing secret 只进入 server secret store。Paddle 官方
   adjustment simulation 已连续成功投递并返回 HTTP 200；保留 Sandbox destination，不混用、
   不覆盖，也不为相同用途新建第二个 destination。full approved refund/chargeback
   通过现有 plan service 撤权；partial/pending/rejected/credit/warning 不变更；
   chargeback reversal 受限读取当前 subscription 后恢复。后续真实 recurring
   completion 可恢复被调整订单之后的新付费周期；不新增财务账本。
9. **保持 Live default payment link 为 `/pay`。** 2026-08-27 Dashboard 新鲜复核
   已保存 `https://app.musuw.com/pay` 且显示有效；`/checkout` 需要
   已认证计划上下文，不适合 Paddle 生成的 transaction/update-payment 链接。
   Paddle 要求 default page 包含 Paddle.js；交易参数由 Paddle.js 自动处理。
10. **在真实边缘层处理 webhook 防护。** 当前应用已经对 raw body 验证 Paddle
    signature、幂等处理重复事件并只让签名 subscription 事件授予套餐。Paddle
    还建议 allowlist 其分环境 webhook source addresses；这是安全建议，不是
    account application 的表单硬门槛。Musuw 位于 Cloudflare/Tunnel 后，必须在
    能看到真实 provider source 的边缘层按 Paddle 当时的官方列表配置，不能在
    origin 盲信可伪造的 forwarded header，也不能复制一份会过期的地址到代码。
11. **原子准备整个 Live 单元。** 一次性准备 environment、client-side token、
    API key、destination secret 和六个 Live prices；任何缺失、重复或 Sandbox/
    Live 混合都应继续 fail closed。单独 review 已修改固定生产 wrapper；只有
    public input、protected secrets、exact destination 和 matching SHA 一起部署后
    才能通过，不能只改环境变量。
12. **配置 Retain/dunning。** Retain 只处理 Live 数据。应用现在会把已认证租户
    从签名 provider state 得到的合法 Paddle customer ID 传给
    `Paddle.Initialize()`，并在 SPA 后识别客户时用 `Paddle.Update()` 更新；它不
    接受浏览器提交的 internal tenant/customer claim，也不授予 entitlement。
    2026-08-27 已用公开企业支持邮箱提交发件身份，owner 随后完成 Postmark
    验证。matching SHA 上线后，Dashboard 已验证公开且不要求登录的
    `https://app.musuw.com/retain`，显示该页 Paddle.js Installed，并明确确认
    `Retain is now live`。当前浏览器账号是没有 Paddle customer binding 的手工 Plus，
    因此不能用它证明可选的 authenticated in-app detector；代码仍只对真实签名
    provider customer 注入 `pwCustomer`。若当前账号已开通官方
    Customer Portal Product Collections 且能完整表达现有只升档规则，优先以它
    替换 Musuw 的付费升级入口；否则保留官方 subscription preview/update 加一条
    最小本地升级串行边界，因为该写 API 没有通用幂等键。
13. **完成无真实收费的 Live 健康验证。** API authentication、六个 recurring/active
    价格、默认链接页面、真实 Paddle 付款表单边界、exact destination 签名 simulation、
    重复/乱序/未知价格/错误签名契约均已验证。付款表单未输入任何客户或支付资料；
    唯一 smoke draft 随后取消且 payments=0。
14. **真实付款不属于本次验收。** 只允许 checkout 打开到付款表单前、官方
    notification simulator、签名 fixture、现有 provider-state read，以及为 default
    payment link 边界创建后立即取消的零付款 draft；不得输入客户/支付资料、确认购买、
    退款、转账或形成已付/应付财务记录。

## 阻断级别速查

| 项目 | 阻断级别 | 当前状态 |
| --- | --- | --- |
| 公开产品、价格、功能、Terms/Refund/Privacy、HTTPS | 域名审核硬要求 | 公开首页、Contact、Terms、Refund、Privacy 及应用套餐页均已上线并完成公网复核。 |
| 真实 support phone | Seller Handbook 合规要求/审批风险；不是 Domain Review 页面列出的独立提交字段 | Owner 已提供并授权；英文和中文 Contact 页面已公开并通过真实浏览器验证显示与 `tel:` 链接。 |
| reviewer account | Paddle 对登录产品可能要求 | 现有专用英文 fixture；仅可由主交付线程通过安全渠道传凭据。 |
| business/identity information | account verification 硬阻断 | Dashboard 已显示 verification passed；资料仍属 owner-only，不能读取或从仓库推断。 |
| 六个 Live recurring prices | Live 结账和 webhook 映射硬阻断 | 3 products/6 active recurring prices 已与运行时六映射和浏览器月/年价格逐项核验；未重复创建。 |
| Live client-side token 与 API key | Paddle.js/API 技术硬阻断 | 复用既有 active Live credential，已通过保护文件接入固定生产；未轮换或复制。 |
| Live webhook destination 与 signing secret | 可靠履约/entitlement 硬阻断 | 唯一 active destination 已是精确 11 事件，exact secret 已保护挂载，官方 no-charge simulation 连续 HTTP 200。 |
| Live default payment link | Paddle transaction 技术硬阻断 | Dashboard 已新鲜复核为 `https://app.musuw.com/pay` 且显示有效。 |
| tax mode、balance currency、payment methods | Live 商业配置硬阻断 | Dashboard 已复核：税为 automatic-by-location、余额 USD、CNY 与 JPY 自动转换；Checkout 使用 Paddle 官方方法开关，应用不推断买家税/币种/eligible methods。 |
| payout settings | 获得 payout 的 owner-only 阻断；不是接受付款的代码证明 | Owner 后续已在 Paddle Dashboard 保存；自动化未读取、复制或提交任何银行字段，应用收款链路不依赖这些敏感值。 |
| `pwCustomer` / Retain | 完整 Live Retain 准备阻断；Sandbox 不加载 Retain | Postmark 发件身份已验证；公开 `/retain` 被 Dashboard 标记 Paddle.js Installed，Retain 已确认 Live。可选 web-app detector 需真实 Paddle customer 会话，当前手工 Plus smoke 账号不具备该绑定。 |
| webhook source allowlist | 官方推荐的纵深防御，不是申请表硬门槛 | 已实现部署前从固定 Live/Sandbox `/ips` 动态生成 allowlist；Cloudflare Tunnel 后仅精确 webhook 路径按 `CF-Connecting-IP` 拒绝非 Paddle 来源，signature verification 仍是必须保留的主校验。待同一 digest 先 staging 后 production 激活验证。 |
| 固定生产 Live-only lock | 当前安全硬边界 | 完整 Live input、provider health、exact-SHA 东京部署和 runtime preflight 均已通过。 |

## 当前非敏感证据

- 公网主域首页、Terms、Privacy、Refund、Contact，以及 app 的 `/pay`、`/retain`
  和 Live public config 均返回 HTTP 200。生产响应报告 configured Live，且没有暴露
  server secret、内部租户绑定或完整 catalog。
- 2026-08-27 通过 Paddle.js `PricePreview()` 对六个 Live 映射做了只读核验：
  月付 `$5.00/$10.00/$20.00`、年付 `$49.00/$99.00/$199.00` 全部返回，六项互不
  重复并使用 Paddle 格式化金额；Paddle 仍决定税、币种转换和可用付款方式。
- 当前首购由 Paddle.js 标准 `items`/`customData` 创建 transaction；Musuw 不维护
  checkout operation。raw-body Paddle SDK verifier、server-owned price allowlist、
  tenant binding 和 signed webhook 共同决定 entitlement。
- 2026-08-27 Live API 只读盘点确认：3 products/6 active recurring prices（USD
  与既有中国 CNY override、monthly/yearly、`saas`）、2 个 active client-side
  tokens、approved app domain 和 1 个 active/11-event production destination。
  随后已在登录后的 onboarding 页面逐字读完
  两个详细提示并确认 account verification 为 passed。
- 同日 Paddle 官方 Live MCP 的只读 inventory 与上述 catalog、client-side token、
  notification destination 和 checkout domain 结论一致；调用只返回脱敏后的
  计数、状态和事件集合，没有返回 credential、destination URL 或资源 ID。
- 同日登录 Dashboard 新鲜核验：default payment link 已是公开 `/pay` 页面，税由
  Paddle 按 location 自动决定，余额币种 USD、CNY 与 JPY 自动转换，PayPal/Google Pay/
  Apple Pay/Bancontact/WeChat Pay 已启用，app 域名与 Apple Pay 均 approved；其中
  WeChat Pay 仍受 Paddle 官方 eligibility 限制，只适用于一次性商品，不适用于当前
  六个 recurring subscription price；
  Customer Portal 可用，但没有 Product Collections 配置入口；Retain 发件身份、
  公开 recovery page 检测和 Live activation 均已完成。
- exact destination 现为 `traffic_source=all` 的精确 11-event 集合。官方无扣款
  adjustment simulation 两次 fresh run 均 completed/success/HTTP 200，事件 replay
  请求被 Paddle 接受；同期 production Paddle/webhook 日志为 12 行、0 focused error、
  0 panic/fatal。
- Live `/pay` smoke 使用 Paddle 官方 API 创建一个 automatically-collected draft，
  页面自动打开真实 Paddle frame 并显示 Plus 月付、本地税、客户字段和 Paddle
  merchant-of-record 说明。未填写客户或支付资料，未点击确认；draft 随后 canceled，
  payments=0。
- 本轮没有创建、撤销、删除或重建 credential、catalog 或 destination，没有触碰
  payout，也没有真实收费、退款或资金移动。为 checkout 边界创建的单个 draft 已
  立即取消且没有 payment。
- 续费执行现在把已确认周期和 Paddle 事件游标在同一租户行事务中推进；恢复
  `refunded`/`chargeback` 状态的判断延后到 worker 持有 allowance lock 后完成。
  因而较新 recurring completion 可以恢复后续真实付费周期，而较旧退款/争议
  事件会被 durable occurred-at guard 拒绝；没有新增支付状态机或本地财务账本。

## 官方依据

- [Paddle Account Verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification)
- [Paddle Domain Review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification)
- [Paddle Seller Handbook](https://www.paddle.com/seller-guides/seller-handbook)
- [Paddle setup checklist](https://developer.paddle.com/build/set-up-checklist/)
- [Paddle go-live checklist](https://developer.paddle.com/build/go-live-checklist/)
- [Set your default payment link](https://developer.paddle.com/build/transactions/default-payment-link/)
- [Create a transaction](https://developer.paddle.com/api-reference/transactions/create-transaction/)
- [Build a localized pricing page](https://developer.paddle.com/build/checkout/build-pricing-page/)
- [Open a checkout with Paddle.js](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/)
- [Pass custom data to transactions](https://developer.paddle.com/build/transactions/custom-data/)
- [Paddle.Initialize and Retain](https://developer.paddle.com/paddle-js/methods/paddle-initialize/)
- [Paddle.Update](https://developer.paddle.com/paddle-js/methods/paddle-update/)
- [Handle webhook delivery](https://developer.paddle.com/webhooks/about/respond-to-webhooks/)
- [Create and replay webhook simulations](https://developer.paddle.com/api-reference/simulation-runs/)
