# 火种工作台

本机运行的参考图合成与自由创作工具。公开前端最初来自 https://alphai.pages.dev/，原版资源保存在 `original/`，来源与 SHA-256 见 `download-manifest.json`。本地工作流、组件与持久任务均为独立实现，不包含原站私有后端。

## 启动与执行控制

双击 `start.command`，或运行 `python3 server.py --allow-generation`，打开 [火种工作台](http://127.0.0.1:5173/)。仅监听本机。启动脚本开启持续任务处理，用户点击生成后按任务执行，每个任务只向供应商提交一次。若只整理素材而不调用模型，可用 `python3 server.py` 启动暂停模式。

程序已取消全局单次测试锁。旧的 `generation-attempt*.json`、`generation-result.json` 和 `site/generated/` 均保留，但不会阻止新任务。每个任务有独立编号、输入快照、最终提示词、提交标识、状态与结果。

以下命令会真实调用供应商，应在明确准备执行后使用：

```sh
# 持续处理队列，会执行其中所有尚未取消的排队任务。
python3 server.py --allow-generation

# 仅执行选定的排队任务后退出；其他任务不启动。
python3 server.py --execute-task TASK_ID
```

两种执行参数互斥。默认启动脚本使用 `--allow-generation`；直接运行 `server.py` 仍保持暂停。不要删除任务数据库或修改任务状态来重试不确定的上游提交。

## 原图上传与任务

参考图选择后先独立上传到本机资产库，生成请求只发送资产 ID、顺序、角色和生成设置。本机素材上传使用同源 `/api/assets` JSON，图片字节不改变；这是素材保存阶段，与随后服务器使用 multipart 向 QuickRouter 上传原图的生成阶段不同。上传失败可以单独手动重传，素材上传本身不调用模型。程序不人为限制输入图片数量、单图文件大小或总文件大小；后端继续按真实字节和 PNG/JPEG/WebP 容器验证，并用 SHA-256 去重。服务商实际限制以响应为准，浏览器内存、磁盘和网络资源仍会影响可处理规模。

前端读取文件后保留完整字节、文件名和格式，不缩放、不重新编码、不自动压缩，超过 2048 像素或数 MiB 也一样。旧浏览器记录里若同时存在原图 `dataUrl` 和压缩 `uploadDataUrl`，新任务只上传 `dataUrl`；旧缩略副本不参与新生成。更早版本若连 `dataUrl` 本身都只保留了压缩图，则无法恢复丢失的原始细节，需重新选择原文件。历史任务的既有资产与结果不会被改写。

`private-data/` 存放 SQLite、不可变资产和成功响应日志，不属于静态站点目录。目录权限为 0700，数据库和文件为 0600。图片内容经受限的同源 API 提供；密钥仍在静态目录外的 `.env` 或环境变量中，不发送给浏览器或原站。

| 状态 | 含义与操作 |
| --- | --- |
| `queued` | 已保存，等待执行；可以取消 |
| `preparing` | 校验资产和准备请求；尚未提交上游 |
| `submitting` | 已持久记录即将/正在提交；禁止重复提交 |
| `succeeded` | 结果已本地保存，可预览与下载；可以主动再生成 |
| `failed` | 明确失败；仅后端允许时可显式重试 |
| `unknown` | 可能已提交或计费，结果待确认；只查询，禁止自动或普通重试 |
| `cancelled` | 在提交前取消，未调用模型 |

任务创建使用 UUID 幂等标识：相同标识与输入返回同一任务，修改输入复用同一标识返回 409。并发相同活跃输入即使使用不同标识也会归并，并保存全部别名；原任务完成后重放这些旧标识不会新建收费调用。完成后用户明确再次生成会使用新标识。客户端丢失回执时保留原标识，刷新后通过服务端任务列表恢复。

后台 worker 通过跨进程锁与数据库事务领取任务，先持久化 `submitting` 再出站。中断的准备可安全恢复；中断的提交转为 `unknown`。成功响应先写私有日志再发布图片；日志已保存但图片发布失败时，重试只恢复本地保存，不调用模型。每个任务在创建时冻结最终提示词，重启或重试不会悄悄换系统规则。

## 中转接口与错误

默认线路是 QuickRouter，模型选择为 `quickrouter-image25-sunburst`，实际调用 `gpt-image-2.5-sunburst`。参考合成和带参考图的自由创作固定使用 `https://api.quickrouter.ai/v1/images/edits` 的 multipart 二进制上传；纯文字自由创作使用 JSON `/v1/images/generations`。curl 自动生成 multipart boundary，不手写 Content-Type，不把图片再编码成 data URL 放进上游 JSON。保持 HTTP/1.1，生成请求只发送一次，失败后不自动重试、切模型、切线路或切协议。

在静态目录之外的 `.env` 或进程环境中配置 `QUICKROUTER_API_KEY`。这是 QuickRouter 专用凭据；旧 `MODELFLARE_API_KEY` 只用于旧的 Modelflare 选择，不能混用，也不会发送到浏览器。QuickRouter 的目标地址固定，不支持任意环境变量替换主机。模型列表、默认选择和状态会通过公开配置提供，公开配置不包含密钥或虚构的账户余额；界面也不把测试令牌额度当作可用余额。实际费用以 QuickRouter 用量日志/账单为准。

首次加载新默认线路时，界面将既有默认偏好迁移到 QuickRouter；随后用户显式选择旧线路仍可保留。迁移只改新创作界面的选择，不改旧排队任务、未知任务、历史结果或未确认回执，也不会自动提交浏览器草稿。

旧 `modelflare-image25-sunburst` 和 `modelflare-image25` 选择仍保留，使用各自既有模型及 Modelflare 凭据。`MODELFLARE_IMAGE_TRANSPORT=json|multipart` 仅控制旧线路，新 QuickRouter 合成始终 multipart。历史五原图 JSON 请求曾返回 `413 read_request_body_failed`；2026-10-19 相同五原图在 Modelflare 主站 multipart 返回 `400 invalid_request`，而 QuickRouter 的一次五原图 multipart 请求生成成功。单次成功不能保证任意图片数量或体积都受上游支持；本机限制也不是服务商公布的上限。

传输失败现在会持久保存 curl 退出码、固定安全错误说明、HTTP 版本、已发送/接收字节与耗时，并在任务卡中展示。原始 stderr、请求图片、密钥不写入诊断。修复前两笔五图任务的原始网络错误已被旧代码丢弃，不能事后把它们的错误码改写为 92。调查和账单证据见 `runs/2026-10-19-five-reference-and-text/diagnosis.md`。

官方模型文档提到 `file_id`，但未查到如何上传取得它的公开契约；也没有确认图片任务查询或图片幂等保证。因此没有臆造 `/v1/files` 或把视频任务查询套到图片上。具体来源与调查边界见 [接口核对记录](verification/PROVIDER_CONTRACT_2026-10-19.md)。

| 错误 | 当前处理 |
| --- | --- |
| 本地校验、上传失败 | 显示实际原因，修正或重传，不调用模型 |
| 明确的 `400/401/403/404/413/415/422` 拒绝 | 保存状态、代码、参数、已消毒解释与请求编号；可按后端授权显式重试，不承诺退款 |
| 超时、`408/429/499/5xx`、无法解析或无图片的成功响应 | 保守标记结果未知，不自动重发；先核对供应商记录 |
| 有本地成功响应但保存图片失败 | 只恢复保存，不重复生成 |

供应商文档说明 `400` 可由非法 JSON、不支持的字段或错误模型入口引起；`401` 为密钥问题、`403` 为权限/分组问题、`429` 为限速、`499` 为客户端取消、`5xx` 为服务端或网关失败。历史 `413 read_request_body_failed` 由真实响应确认，但约 60 KB 从不是官方公布的总请求上限。格式合法、调用成功与最终人像相似度是三件事，本地去重不等于上游的 exactly-once 计费承诺。

## 界面与参考工作流

单左侧导航包含自由创作、参考合成、素材库和历史作品，左上角为用户提供的 Logo 与「火种工作台」。主区为参考素材、作品预览和生成设置，没有重复顶栏、姿势设置或预览下方的最近生成。比例与模型使用共享可视选择组件。

参考合成至少两张图，每张选择脸部、发型、动作、背景、配饰、身材、上下半身穿搭或鞋履。脸部支持同一人的多角度联合参考，其余要素各一个来源。图片排序与删除保留职责一致性；未选要素不添加来源指令；程序不限制输入图片数量，服务商是否接受具体请求需以实际响应为准。自由创作支持零图和可选图片，不要求合成角色分配，描述不设置字符上限；切回合成不会发送隐藏的自由描述。输出仍按当前设置生成一张 1K 图片，输入放开不扩大输出数量或质量。

`reference_workflow.py` 是角色、校验与提示词的唯一来源。后台编译加入“更自然的五官比例、更接近参考照中的真实五官”，保留真实骨相、同人身份与整体协调，不机械复制表情或镜片截图反光。免费 `/api/prompt` 不调用模型。

[组件库](http://127.0.0.1:5173/component-library.html) 与工作台共用样式、选择器及交互工具，说明见 [COMPONENTS.md](COMPONENTS.md)。新界面不加载旧版浅色 `styles.css`。生产运行仅需 Python 标准库、原生浏览器能力与系统 curl，无新增 npm 运行依赖。

## 本机接口

- `POST /api/assets`：`{dataUrl,name}`，独立保存原图字节。
- `GET/HEAD /api/assets/<assetId>/content`：读取验证过的资产。
- `POST /api/generation-tasks`：`{idempotencyKey,payload}`，payload 的图片为 `{id,assetId,roles}`。
- `GET /api/generation-tasks` 与 `GET /api/generation-tasks/<id>`：查询持久任务。
- `POST /api/generation-tasks/<id>/retry`：`{idempotencyKey}`；由后端判定是否可恢复。
- `POST /api/generation-tasks/<id>/cancel`：取消尚未开始的任务。
- `POST /api/generate`：已退役，返回 410，防止绕过任务幂等。

## 验证

验证覆盖后端任务与传输、前端规则、共享组件、上传/任务交互以及完整界面初始化。原图回归覆盖有效的 4096×1800、超过 20 MiB 的 PNG，从 FileReader 边界经过真实文件处理及本机上传流程比较字节和 SHA-256，验证不会使用旧压缩副本；另验证 17 张联合脸参考与 40000 字符描述均可创建输入快照，上传/准备不自动发起生成。默认线路迁移与刷新也验证不发起生成。断连回归通过真实本机 HTTP、curl、worker、任务查询验证具体错误与指标不会丢失，未知任务保持不重发。服务重启后的任务及图片读取另行验证。

后端与传输：

```sh
MODELFLARE_API_KEY=sk-test-only-not-a-real-key python3 -m unittest test_reference_workflow test_modelflare_adapter test_generation_tasks test_server test_task_pipeline test_quickrouter_adapter
python3 -m py_compile server.py generation_tasks.py modelflare_adapter.py reference_workflow.py
node --check site/script.js
node --check site/workbench.js
node --check site/generation-tasks.js
node test_reference_ui.js
```

离线 DOM/CSS 测试仅用开发依赖，不是运行依赖：

```sh
npm install --prefix /tmp/alphai-reference-ui-tests linkedom@0.18.13 cssom@0.5.0
export ALPHAI_TEST_DOM_MODULE=/tmp/alphai-reference-ui-tests/node_modules/linkedom
export ALPHAI_TEST_CSS_MODULE=/tmp/alphai-reference-ui-tests/node_modules/cssom
node test_fire_components.js
node test_reference_ui_dom.js
node test_workbench_ui.js
node test_workbench_init.js
node test_generation_tasks_ui.js
node test_durable_workbench_init.js
```

`test_task_pipeline.py` 使用真实本机 HTTP、worker、适配器与 curl，将最终请求仅重定向到 loopback 模拟供应商，验证上传、幂等、传输、拒绝/未知结果、本地保存恢复和下载的整条链路。`test_durable_workbench_init.js` 按真实脚本顺序启动完整界面，仅替换本机 HTTP 边界，验证实际资产、任务、预览、历史及刷新消费。

此前 localhost 浏览器工具访问曾被政策拒绝；2026-10-19 用户明确要求真实上传路径后，正常浏览器工具已允许访问现有本地页面。本次使用页面“本地上传”按钮、文件选择器、七张原图、角色选择和生成按钮，另核验本机资产 SHA-256。没有用页面脚本注入或直接 POST 代替此次用户操作。离线模拟与这次授权的真实接口结果分别记录。

## 历史记录与范围

- 2026-10-19 首次真实 multipart 测试被拒绝：`verification/real-task-2026-10-19.json`。明确改为 origin JSON 后，手动重试成功：`verification/real-task-retry-2026-10-19.json`，23.25 秒、Sunburst、768×1024。失败和重试任务均保留，回执重放返回同一成功任务，没有再创建生成请求。
- 完整交付验证：`verification/durable-generation-2026-10-19.json`；结果另存 `/Users/yangdi/Downloads/fire-workbench-live-2026-10-19.png`。其余队列仍暂停。
- 新任务规范：`openspec/changes/durable-generation-tasks/`。
- 2026-10-14 既有成功验证与当时账单：`verification/IMAGE25_VERIFICATION.md`、`verification/success.json`；旧费用不是本次报价。
- 2026-10-15 三图成功、内置生图、身份修正与多脸验证分别保留在 `runs/` 对应目录。
- 黑红界面、组件库及此前工作流验证保留在 `verification/fire-workbench*.json` 与对应 OpenSpec 变更中。

账号、钱包、充值、管理员后台及独立识图不在本次范围。没有自动删除旧素材、输出、提交记录或凭据。

## QuickRouter 图片限制与本次验证

QuickRouter Sunburst 编辑页明确要求 multipart 自动 boundary，但未公布单图字节、输入图片数、输入像素或总请求体上限。其引用的 OpenAI 文件版编辑协议为 PNG/WebP/JPG、单张小于 50MB、最多16张、提示词最多32000字符；这些是协议参考，不代表中转站保证。另有独立图床接口建议单文件不超过10MB，与本程序直接调用的图片编辑接口不同。先前程序曾设置每张20MiB、最多16张和32000字符的本机上限；现按用户要求全部移除，程序不再人为拦截输入图片数量、文件大小或描述长度，不代表上游支持无限输入。不压缩、不自动重试，也不使用图床或猜测的 /v1/files。官方核对记录和7图14009879字节真实UI测试证据见 `runs/2026-10-19-quickrouter-large/`。

五图单次请求日志记录费用 **$0.053404**，Request ID `202610192251155301542819YOSckWE`，详情见 `runs/2026-10-19-quickrouter-five-once/billing.json`。此前创建的测试令牌现已按用户明确确认改为无限令牌额度、永不过期；这不代表账户余额或上游服务能力无限。凭据不可用时不会自动改用其他服务商。

2026-10-19 七图真实 UI 测试：原图总量14,009,879字节。首次因令牌额度返回401；用户充值并明确要求重提后，通过原任务“重试”按钮产生一个独立尝试，原资产ID和冻结提示词不变。该尝试完整发出14,014,471字节multipart，但68.13秒后curl52断连、0响应字节，保留unknown，不自动或普通重试。结果与账单快照见 `runs/2026-10-19-quickrouter-large/authorized-retry-1/`。核对时余额0.976596美元、历史消耗仍0.053404美元，尚无该笔新增消费记录，不承诺最终不计费。

真实刷新还暴露任务列表外层游标与读取别名的新连接形成SQLite读写互等；现复用同一连接，保留原事务、同步和幂等规则。79项Python与7套JS测试通过，额外32个并发实际任务/素材读取全部200，重启不改变或重发历史未知任务。

2026-10-19 取消应用输入上限后的首次用户路径已真实成功：新origin `http://localhost:5173/` 从空白草稿开始，经本地上传按钮/文件选择器选择7张原图，实际产生7次资产POST，逐字节与SHA256一致，再从UI选择8项参考并点击生成。QuickRouter Sunburst约49.79秒返回1024×1024 PNG（2012340字节）；输入原图总14009879字节，无压缩、无自动重试，旧unknown任务保持原记录。任务ID `c10e7ce1-18fc-4d4b-826a-086583cc10c9`，结果/证据在 `runs/2026-10-19-quickrouter-new-user-unlimited/`，下载副本 `/Users/yangdi/Downloads/fire-quickrouter-new-user-2026-10-19.png`。令牌已按用户明确确认设为无限额度、永不过期；账户实际余额仍按服务商消耗。

最新账单核对：本次首次用户路径成功请求费用$0.112900，Request ID `202610192330298355067453063QjXx`。此前七图断连的unknown请求后来记账$0.110674、服务商处理345秒，Request ID `20261019231627210711884wucWCIDz`，本地未收到图片；保留原unknown任务且不自动重发。之前“尚未新增扣费”是当时观察，现已由延迟账单补充。证据见 `runs/2026-10-19-quickrouter-new-user-unlimited/billing.json`。
