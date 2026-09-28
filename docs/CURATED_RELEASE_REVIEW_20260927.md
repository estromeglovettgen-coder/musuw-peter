# 创作者市场与人工整理导入：固定版本发布记录 · 2026-09-27

**验收类别：`reviewed-curated-release`；有限证据；`full_sandbox_e2e=false`。**
此类别只适用以下固定三元组，不是后续版本可复用的发布许可。

| 记录 | 固定值 |
| --- | --- |
| 应用候选 | `19faaa073c1018ab8ebf699b841585feed38f728` |
| 当前正式环境基线 | `16d503fb9fc1c6ca4653e90406117eab457650b4` |
| 候选 CI | [36318029082](https://github.com/estromeglovettgen-coder/musuw/actions/runs/36318029082)，成功 |
| Staging run | [36318675629](https://github.com/estromeglovettgen-coder/musuw/actions/runs/36318675629)，成功 |

本次已核对的范围：Paddle Sandbox 中真实购买 Plus、Plus 升级 Pro、
Customer Portal 预约取消；付费后的首次 DeepSeek Flash 提问使用 Paddle 已确认的
账期终点；staging 人工整理文档的发布、索引与检索 canary；知识市场页面可达。
这些证据支持当前创作者市场和人工整理导入版本的定向发布，不代表全部付费生命周期
已完成在线验收。两位创作者的全部生产文档仍须在部署后执行正式环境发布和网页验收；
此记录不把待发布内容算作已上线。
整版晋级也会把候选版本中此前待上线的知识市场页面带给普通用户；人工整理导入工具
只有内部脚本和后端入口，没有面向普通用户的导入界面。

本轮**尚未在线验收**：月度订阅自然到期、异常 Webhook 的实际重试与乱序、
租户角色的在线负向路径。不得把本类别改记为 `full-sandbox-e2e-green`。
用户要求聚焦本次改动，因此未对其他未改业务重复做全量验收。

`scripts/ci/verify-reviewed-curated-release.py` 只检查以上候选、实际正式环境基线和
staging run 的精确组合。Promotion 仍按现有流程独立核对 canonical main 祖先、
成功 CI、当前正式部署的成功 manifest、先前 staging artifact 与在线 app/frontend
digest 一致性，并经过 `server-production` 的 required reviewer；保留原有健康检查与
失败回滚。此固定 guard 不改变产品、支付或普通用户页面逻辑。
