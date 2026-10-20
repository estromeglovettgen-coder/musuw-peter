# Alphai 模型分析

核查日期：2026-10-14。对象：[alphai.pages.dev](https://alphai.pages.dev/)。证据来自网站公开前端、匿名只读配置与公开文档；未登录、未提交生成任务、未使用私密信息。

## 结论

**能够确认网站提供 4 个生图模式；无法仅凭公开前端确定真正调用的生图模型。** 模型映射与供应商选择在本站后端，公开配置只暴露产品别名。以下候选模型仅是名称联想，不应作为“已经查明”的结论。

| 公开 ID | 页面名称 | 默认积分/张 | 已确认内容 | 模型身份推测 |
| --- | --- | ---: | --- | --- |
| `quality-g2` | 高质量模式_G2 | 2 | 细节、人物一致性优先 | 名称可能指 GPT Image 2，但 G 也可能指 Gemini 或内部渠道；低可信 |
| `quality-g2-5` | 高质量模式_G2.5 | 2 | 参考图一致性、细节控制优先 | 名称可能指 GPT Image 2.5 或 Gemini 2.5；无法确定，更无法区分 Sunburst/Flare；低可信 |
| `quality-np` | 高质量模式_NP | 4 | 多参考图、指令遵循优先 | NP 可能指 Nano Banana Pro；低可信 |
| `fast` | 快速模式 | 1 | 快速预览 | 没有可用的具体模型证据 |

积分是网站业务单位，不是模型 API 计费 token。代码还会针对高质量 2K/4K 覆盖为 4/6 积分，见 `original/script.js:699`。

## 证据与接口链路

1. [公开配置](https://alphai.pages.dev/api/config)匿名 GET 返回上述 `modelOptions`，同时返回 `requireLogin: true`、`asyncGenerationEnabled: true`。现场快照保存在 [public-config.json](./public-config.json)，第 1 行。没有 `model`、供应商名称或 `apiBase`。
2. `original/script.js:424` 的 `apiUrl` 原样返回相对路径；`585` 读取 `/api/config`；`661` 使用配置的 `id/label` 填充选项。
3. `original/script.js:3875` 的生成参数只有 `modelChoice`。异步链路 `4067` 上传到 `/api/generation-inputs`，`4083` 创建 `/api/generation-jobs`，`4005` 轮询本站任务。旧同步链路在 `4286` 调用 `/api/generate`。浏览器没有直接调用 OpenAI、Google 或其他模型供应商。
4. `original/script.js:3964`–`3965`、`4057`–`4058` 显示任务返回对象可能包含 `modelId` 与 `model`。这些字段可能帮助进一步核对，但这次没有登录或调用生成接口，因此没有取得真实返回值；即使取得，也首先代表本站后端的声明。
5. `original/script.js:3136` 的识图接口为 `/api/analyze-scene`，请求只带图片与 `slotId`，前端也没有指明视觉分析模型。
6. `original/script.js:1474`、`1495`、`1504`、`1577` 显示后台可按模式与网页/小程序通道选择 API 供应商。该界面从需管理员身份的接口读取数据，不能据前端 UI 确认现行供应商；本次未尝试该接口。
7. [公开隐私政策](https://alphai.pages.dev/privacy.html)的第三方服务表，AI 服务供应商栏写“实际启用供应商待逐一列明”。文档为预览版，也没有披露具体模型。前端错误过滤规则 `original/script.js:444` 出现 `yunwu`，只是关键词过滤，**不足以证明当前使用云雾或其任何模型**。

## 能直接确认的本地模型

网站另有“一键去AI”功能：强力模式在浏览器本地检测人脸，再执行像素处理，与云端生图/识图接口分开。

- `original/shadowoff-browser.js:50` 导入 MediaPipe；`54`–`55` 声明 `assets/models/blaze_face_short_range.tflite` 和 `assets/models/face_detection_full_range_sparse.tflite`，`58` 使用 `FaceDetector.createFromModelPath` 加载。**代码使用这两个本地人脸检测模型：高可信。**
- `original/shadowoff-browser.js:88` 优先尝试浏览器原生 `FaceDetector`，因此并非每次操作都会加载上述两个文件。
- `original/metadata-cleaner.js:317` 调用本地处理；`original/shadowoff-browser.js:127` 检测人脸，`154` 把图片和检测结果交给 Worker；`original/shadowoff-worker.js:17` 做像素处理。它不是另一个云端生成模型。
- 轻度模式是 PNG/JPEG/WebP 元数据清理；不能据此宣称消除所有 AI 特征、检测器结果或不可见水印。

## 官方名称参照与推测边界

以下官方资料仅确认候选产品确实存在，**不能证明 Alphai 使用它们**：

- [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)：官方模型 ID 为 `gpt-image-2`。
- [OpenAI 图像提示指南](https://developers.openai.com/api/docs/guides/image-prompting)：GPT Image 2.5 包括 `gpt-image-2.5-sunburst` 与 `gpt-image-2.5-flare`。G2.5 标签不足以区分二者。
- [Google Nano Banana Pro 发布说明](https://blog.google/innovation-and-ai/products/nano-banana-pro/)：Nano Banana Pro 对应 Gemini 3 Pro Image；原版 Nano Banana 对应 Gemini 2.5 Flash Image。

要确定实际模型，需要服务端的模式→供应商→模型映射、供应商请求记录，或授权账号已有任务的 `model` 返回值，并与供应商侧记录交叉验证。当前证据支持“有多个生图模式且通过本站后端调用”，不支持给任何具体生成模型下确定结论。
