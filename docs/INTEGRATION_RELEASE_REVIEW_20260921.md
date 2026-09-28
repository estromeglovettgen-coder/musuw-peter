# IM / 网页嵌入精确版本发布记录 · 2026-09-21

**状态：定向集成验收已通过；完整 Paddle Sandbox E2E 未执行，也未宣称通过。**
本记录只授权下列固定三元组使用 `reviewed-integration-release`。它不是可复用的
版本标签，也不放宽 CI、staging 不可变镜像、正式环境基线、健康检查、回滚或
`server-production` required-reviewer 门禁。

| 证据 | 固定值 |
| --- | --- |
| 应用候选 | `3eb20a3b104dc6d162c637cbdcb66e3adde9ca96` |
| 正式环境基线 | `9e479beb198d8af71c321d527a8bfee9c0ae7c4d` |
| 候选 CI | `35640073973`，成功 |
| Staging run | `35641418640`，成功 |
| App digest | `sha256:2985b63394415ad3aba590c5cfb26510031c33160875b053b0ad0e71804cb799` |
| Frontend digest | `sha256:384f5e767cdeddf550693e6a41e2cf74252ac95fb2d1a3ecdaa2e2e87938a3b9` |

Staging 的定向验收覆盖：普通成员的 IM / 网页嵌入渠道 CRUD、允许来源校验、
发布令牌交换为短期 `ems_` 令牌、公开配置与会话接口，以及无需调用模型即可
验证的 agent-chat 路由。检查确认浏览器响应不泄漏长期发布令牌；验收夹具清理后
残留为零。没有发起真实模型调用。

用户明确要求只验证网页能否与客服交互，并拒绝支付测试。因此本轮没有执行
购买、升级、失败支付、取消/到期、恢复、Webhook 顺序与幂等、客户门户和账单
历史等完整 Paddle Sandbox 生命周期。发布记录必须保持
`full_sandbox_e2e=false`，不得改记为 `full-sandbox-e2e-green`、
`ui-regression-green` 或 `reviewed-model-release`。

`scripts/ci/verify-reviewed-integration-release.py` 只接受表中的候选、基线和
staging run 精确组合；任一字段变化或交叉组合都失败。匹配 guard 只说明定向
验收范围一致，不能替代 promotion 对当前正式部署证据、staging artifact/digest、
canonical main 祖先关系、成功 CI 和 GitHub 正式环境 owner 审阅的核验。
