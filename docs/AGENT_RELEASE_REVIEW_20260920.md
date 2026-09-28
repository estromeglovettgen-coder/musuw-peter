# 智能体精确版本发布范围登记 · 2026-09-20

**状态：发布范围登记已准备；staging run 已成功，GitHub 生产审阅待完成。** 本记录只准备
本次固定版本的 `reviewed-model-release` 范围，不声称完整 Paddle Sandbox
生命周期验收通过。应用候选不变，范围登记通过独立 PR 与正常 CI 交付。

## 授权与登记的边界

本轮明确上线指令与用户的自主部署要求，可以支持完成本次固定版本登记，
不应仅因本地文档使用“例外”一词就再申请重复聊天确认。技术上，它仍是现有
工作流的专项验收类别，并非普通版本号标签：该精确三元组采用已记录的定向
验收，不虚构完整 Sandbox 生命周期通过。它不改支付规则、租户权限，不允许
任意后续版本复用，也不放宽任何失败的 CI、staging、容量或健康条件。

GitHub `server-production` 的 required-reviewer 是独立的平台门禁。聊天授权、
guard 匹配和本文档都不能代替平台审批；相关规则、CI、祖先关系、digest、健康
检查和回滚路径必须保留并实际通过。根任务独立复核已确认此次登记在现有部署
授权内，无须重复聊天确认；仍未执行生产发布。

## 唯一新增范围

| 字段 | 固定值 |
| --- | --- |
| 应用候选（canonical main） | `1a2cba494b7f9b21ad4fa41185d4b20340d2bb9a` |
| 正式环境基线 | `13ed3446bb992792b33684fb65da78d57309c6e7` |
| Staging run | [35519086160](https://github.com/estromeglovettgen-coder/musuw/actions/runs/35519086160)，attempt 2 已完成成功 |
| 应用 PR | [#83](https://github.com/estromeglovettgen-coder/musuw/pull/83) |
| 候选 CI | [35518477127](https://github.com/estromeglovettgen-coder/musuw/actions/runs/35518477127)，已核对 `completed/success` 及精确 SHA |
| 主干合并提交 | `1a2cba494b7f9b21ad4fa41185d4b20340d2bb9a` |
| 在线 app digest | `sha256:22cc21fbe647195487a15c0c3c61ce2722a949f4f9285ba75000b4838d3e5882` |
| 在线 frontend digest | `sha256:d0bb499291a9195abb579482e8e9af16779ffdb319bb5e000348b58ee36e33a7` |

本次改用 canonical main 的候选及自动 staging run。CI 已成功。该 staging run
第一次因发布后可用内存约 979–991 MiB、低于 1 GiB 门槛而失败；容量问题处理后，
同一 run 的 attempt 2 已完成成功，未降低容量门。该成功结论属于 attempt 2，
不会将第一次失败改写为成功。应用候选不因登记代码修改而更换。

2026-09-20 15:40:03 UTC 的只读证据文件
`/tmp/musuw-staging-agent-evidence-20260920.json` 已核实上述在线 app/frontend
SHA、不可变镜像及两个容器健康；镜像内 6 个内置智能体和 4 个预设的轮数全部为
50。源站 `/health`、前端 `/` 和公开支付配置均成功，支付配置仍为 `sandbox`。
外部访问返回 403，源站健康不等于浏览器验收；没有将其记成通过。成功 staging
发布产物仍须由 promotion 工作流重新校验，GitHub 生产平台审阅尚未完成。

此前分支候选 `1b2137125a06aeb9eb9a07c6dacd5488d308a33b` /
staging run `35518490241` 已废弃。该 run 虽构建了镜像，但 GitHub staging
环境的 main-only 保护拒绝了分支部署，未启动部署 runner、未触及服务器；
不能作为有效 staging 部署或验收证据。guard 不再接受该旧候选/run 或与新值混搭。
main-only 保护保持不变。两次候选的 Git 文件树相同，但 SHA/run 证据不可互换。

旧模型发布三元组 `d0074e336d743cbc626d9a02050d58f0e2a19ea7` /
`ced1b95fb70f545a41f02ac2af6b01834afdcae9` / `35432690027` 保持原样。
除此以外的 candidate、baseline 或 run（包括新旧组合交叉）均拒绝。

## 候选做了什么

- 智能体默认最大轮数从 10 改为 50；明确保存的用户配置保持原值。
- 最终整理沿用上游不传 `Thinking` / `ReasoningEffort` 的策略；研究轮次仍使用
  用户参数。输出预算按 v0.8.0 的函数裁剪，保留 4096 token 安全余量。
- 带有此前首页移动端 Hero CSS 修复、相关测试、文档及来源记录。
- 候选最后一轮增量仅固定 CI 的历史来源记录测试夹具及修正测试格式。

从固定正式基线到候选的完整差异未修改支付/账单/额度扣费、鉴权/租户权限、
数据库迁移、依赖/锁文件、Docker 构建输入、Compose/环境变量或发布工作流。
Agent YAML 的默认轮数属于明确的运行配置变化。更高上限可能增加模型调用、
耗时和额度消耗，计费代码未变不代表费用影响为零。

泰勒个人智能体已有明确保存的 10 轮，默认值更新不会覆盖它。按用户此前
10→50 的指示，需要另做**仅该个人智能体**的限定配置更新，并分别记录更新前后
的配置与回读结果；不批量改其他用户。本发布草案未执行该配置更新。已在 staging
PostgreSQL 的 `pg_temp` 同名临时表对原 SQL 做 4 项隔离验证：10→50 成功；
非 10、缺字段、多匹配均拒绝。成功项断言其余 JSON 配置、模型 ID、创建时间/
创建者及 4 条非目标合成记录全部保留。所有会话均使用
`psql -X -v ON_ERROR_STOP=1`，未读写 `public` 表或正式环境。

## 明确保留的问题

- 仍有单次模型调用 **120 秒总时长限制**；持续输出也不会续时。
- 原版最终整理仍可把只有思考、没有正文的结束当作完成；本次并未修复空完成。
- 不传思考参数并非强制关闭思考，适配器仍可采用模型默认低强度。
- 强制最终整理的思考文本仍不显示到前端，也不写入历史步骤。
- 输出预算裁剪不压缩过长输入；完整上下文恢复、空闲超时和提示词缓存不在本次范围。

因此，本提案只记录上述残留边界内的本次限定发布，不是“空答案缺陷已彻底修复”
或“整体升级至 0.8.0”的声明。详细源代码范围见
[`third_party/weknora/final-synthesis-v080.md`](../third_party/weknora/final-synthesis-v080.md)。

## 必须保留的门禁

本提案只让现有精确匹配 guard 多识别一个三元组。guard 返回匹配并不代表 owner
同意，也不代表验收已完成。以下现有检查全部保留：

1. 手动从 main 发起生产 promotion，核对 candidate 的 main 祖先关系与成功 CI。
2. 从正式部署证据核对当前 baseline，验证记录及在线 staging SHA/digest 一致。
3. 只消费已验收的原 staging 不可变 app/frontend 镜像，不在生产重建。
4. `server-production` required-reviewer 规则与 owner 审阅。
5. 受限服务器部署入口、健康和公网检查、失败时既有自动回滚。

不更改生产/UI allowlist；新 guard 及其测试内容仍不能通过纯 UI 发布例外。
历史正例使用与既有 allowlist blob 完全一致的测试夹具，不提高生产允许范围。
发布记录必须使用 `reviewed-model-release`，并明确 `full_sandbox_e2e=false`，
不能记录成 `full-sandbox-e2e-green` 或 `ui-regression-green`。

## 发布前证据状态

- [x] 候选 CI `35518477127` 成功，精确 SHA 为上述 canonical main 候选。
- [x] 在线 app/frontend SHA 与不可变 digest 已记录，两个容器均健康。
- [x] 镜像内 6 个内置智能体及 4 个预设的默认轮数均为 50。
- [x] 源站健康、前端入口与 Sandbox 支付环境只读检查通过。
- [x] Staging run `35519086160` attempt 2 成功；promotion 仍需验证其成功产物。
- [ ] 泰勒个人智能体单独从明确保存的 10 改为 50，回读核实，其他用户不变。
- [x] 10/50 轮耗尽后单独整理、参数省略、答案/完成事件、usage 和预算裁剪的
  确定性测试通过，证据见候选的 `third_party/weknora/final-synthesis-v080.md`。
- [x] 移动首页 responsiveLayout 源码契约 4 项通过；不是浏览器视觉 E2E。
- [x] 用户本轮明确要求上线；该指令不等于验收完成或平台审批通过。
- [ ] GitHub `server-production` required-reviewer 平台审批实际通过。

本轮没有新增 staging 真实模型问答、刷新恢复或停止行为测试，不把这些未执行
项目宣称为通过，也不额外将其设为此次发布前置条件。用户仅要求上线后进行一次
正式模型提问，沿用此前定向测试界定本次范围。

候选已记录的本地检查包括 agent/types/model/session Go 测试、service 默认与
安装器回退测试、server 构建、前端设置/编辑器 39 项测试与类型构建，以及来源
manifest、1601 路径 resolution ledger（零 blocker）与 6 项升级契约检查。
这些属于本地确定性验证，不能替代真实模型或完整 Sandbox 生命周期测试。

发布范围登记本身已通过 guard 5 项、UI 范围 16 项、完整部署 seam/workflow
模拟和 YAML workflow contract。额外尝试 Hero product demo 测试时，独立工作树
未安装 React 依赖，测试未启动；不把它报告成通过，不涉及本次登记的运行代码。

完整 Paddle Sandbox 的支付、升级、取消/到期、恢复、webhook 可靠性、租户权限、
个人账期及 portal/history 验收仍未由本次工作证明，保持未完成状态。
有限 agent 回归不能替代它；本提案不授权以后其他版本复用这一例外。
