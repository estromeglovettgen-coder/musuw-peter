# Peter 销售业务演示素材

这批素材用于演示“销售聊天截图 → 成交方法 → 购买画像 → 成交推进与报名交接”的完整业务链路。50 张图来自 10 位客户各 5 页连续对话，共 500 条消息；`conversations.json` 保存原文和来源，`sales-methods.md` 提供独立的简版方法说明。其中8位明确付款成交，2位分别因预算和参加条件待跟进。素材由人工编写，不是从 Peter 的历史微信账户导出的成交证据；正式提炼其个人工作流时应换成其授权原始记录。

截图采用同一微信风格模板：客户在左、Peter 在右，完整显示日期、先后顺序、原文和页码。没有验证码、订单号或用于检索验收的暗号。`followup/` 另外提供孙凯的排班确认与购买价值跟进，用于浏览器上传与自动归档，未加入原来的 50 张案例图。

## 重新生成与导入

在仓库根目录运行。使用仓库已有 Playwright 和本机 Chromium，不增加依赖。

```sh
node scripts/peter-render-sales-chats.mjs
node scripts/peter-render-sales-chats.mjs artifacts/peter-sales-demo-20261001/followup
node scripts/peter-import-sales-demo.mjs upload
node scripts/peter-import-sales-demo.mjs configure-agent
node scripts/peter-import-sales-demo.mjs status
node scripts/peter-import-sales-demo.mjs chat
node scripts/peter-sales-demo-audit.mjs --neo4j
```

已有资料更新时先核对资源 ID 和来源；`upload` 按文件名去重，不会替换同名旧图。`refresh-config` 仅用于明确的场景重置，会刷新这批客户的备注和标签，不应在新增客户记录后随意运行。原图替换需使用原生接口定向清理已核对的旧来源和派生页，保留其他用户资料。

凭据使用本机忽略版本控制的 `.runtime/peter/deployment/account.json`。原图、导入进度、环境资源 ID、SSE 记录与审计输出也不提交到 Git。修改环境前先核对 `PETER_ORIGIN` 和本机进度文件，所有写入模式顺序执行，不能并行覆盖同一进度文件。

上传使用原生文件接口，案例库与每个客户库都保留原图，并各自执行图像理解、摘要、分块、向量检索、Wiki 和实体关系提取。手工准备笔记不注入 Wiki，不把预写的画像或回答当成模型生成结果。可复用方法与客户个人事实分属不同库，销售助手引用当前客户资料和两个公共销售库。

`clean-old` 仅用于已经核对的旧种子清单，并在新库全部完成、Wiki 生成、助手引用切换后才允许执行。它不是清空账户的通用工具；用户创建的资料和已有模型、沙箱、技能配置保留。

截图识别存在个别小词误识别，重要判断仍需能回到原图。当前报名状态、取消联系、历史约定等要按原文日期核对，不能按上传时间或早期摘要判断。Wiki 的原生校对和修订用于处理旧结论残留，原始资料始终保留。
