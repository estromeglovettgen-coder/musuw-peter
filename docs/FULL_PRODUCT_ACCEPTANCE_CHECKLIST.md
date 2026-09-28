# Musuw 全产品、全链路验收清单

**用途：** Musuw 每次升级、测试环境发布和生产推广前的长期验收基线。覆盖全部可点击/可输入/可切换功能、管理员和运营入口、后台消费链路、单用户私有工作区边界、异常恢复，以及按产品策略必须隐藏的能力。

**当前基线：** WeKnora `main` 固定提交 `81142dfd17b2778087e95d3a317483a2fd909b91`；已检查实现、CI 和测试环境基线为 `1d215c338c59118b5f032a195edd424365802dfa`。实现、CI、测试环境和生产环境是四种不同状态，当前准确边界见 [`HANDOFF.md`](HANDOFF.md)。

## 0. 执行规则

### 状态定义

- `PASS-CURRENT`：当前测试环境以真实浏览器或真实远端链路通过。
- `PASS-CONTRACT`：单测、集成、构建或静态契约通过，仍缺真实点击。
- `PARTIAL`：只覆盖部分角色、状态或下游。
- `NOT-RUN`：没有可靠的当前版本运行证据。
- `DEFERRED-HIDDEN`：产品明确暂缓；必须证明普通用户的入口、深链和接口都无法绕过。
- `N/A`：当前部署 capability 明确不提供，UI 不应出现。

### 每个控件的统一验收动作

除非条目另有说明，每个按钮、菜单、链接、开关、输入框、下拉框、抽屉和弹窗都必须验证：

1. 正常操作真正落库或产生下游结果，不能只证明控件能切换。
2. 刷新、返回、重登后状态正确；取消/关闭不会误保存。
3. 空值、非法值、边界值、重复提交有明确且就近的反馈。
4. loading、empty、disabled、success、error、timeout、retry 状态完整，不能“点击没反应”。
5. 普通 SaaS 用户必须保持单账号、单用户、私有工作区；多成员角色与分享入口不可见、深链/API 不可绕过。SystemAdmin 内部运维权限单独验收，不等同用户协作分享。
6. 双击、快速重复操作、多标签页、迟到响应不能重复创建或覆盖新输入。
7. 亮色、暗色、桌面、窄屏、键盘和焦点状态符合 §18。
8. 凭据和 token 不出现在 URL、日志、错误、截图或持久化浏览器数据中。
9. 测试数据统一使用 `ACC-<日期时间>-` 前缀，只清理本次创建的数据。

### 环境和角色

- [ ] `ENV-001` staging `/health`、HTTPS、静态资源正常，根页面为 `noindex, nofollow`。
- [ ] `ENV-002` staging Paddle 为 Sandbox；禁止任何 Live 交易/webhook 写入。
- [ ] `ENV-003` production 仅只读核验健康、SHA、迁移号和 Paddle Live 边界；不得发布、写数据或重启。
- [ ] `ENV-004` 准备普通 Lite 单用户身份与独立 SystemAdmin 运维身份；Standard 多成员角色仅用于上游兼容性隔离测试，不是消费者上线门。
- [ ] `ENV-005` 准备 free/paid/pending/past_due/额度耗尽、空租户、升级旧数据和跨租户对照夹具。
- [ ] `ENV-006` 记录部署 SHA、镜像 digest、DB 迁移号、容器健康/重启/OOM 和开始时间。

### main `81142df` 相对 v0.7.2 的差异索引

此表只用于区分“新能力验收”和“既有能力回归”；两者都必须通过。Data Analyst、Quick Answer、Smart Reasoning 和 Wiki 内置 Agent 在 v0.7.2 已存在，不能再当作 main 新增证据。

| main 增量 | 对应验收条目 | 当前 Musuw 决策 |
| --- | --- | --- |
| 自动标签 | `KBSET-005`、`DOC-031` | 暴露在 KB Advanced，默认 V4 Flash/max 3/跳过已有标签 |
| AnyDoc 原生 Office/PDF 与解析增强 | `DOC-001`–`DOC-010`、`PARSER-001`–`PARSER-006` | 暴露，AnyDoc 为新建默认，旧库兼容 |
| 文档下载、文件夹拖放、分页/chunk/revision/摘要增强 | `DOC-011`–`DOC-033` | 暴露并沿用 Musuw UI |
| 跨会话长期 Memory | `MEM-001`–`MEM-018` | 全部字段可见，基础+Advanced |
| 附件、suggestions、时间戳、长会话问题索引 | `ATT-*`、`CHAT-013`、`CHAT-014` | 暴露稳定消费者能力 |
| Web provider 增量与 web retrieval | `CHAT-018`、`CHAT-021`、`SEARCH-*` | Lite 强制检索但隐藏开关；provider 管理仅管理员/按策略 |
| 邀请自动接受与 OIDC start | `AUTH-003`、`AUTH-010`、`TEN-005`、`TEN-008` | Standard/外部 Auth 链路 |
| Sandbox、Skills、Env、Artifacts | `DEFER-*` | consumer 暂缓并三层隐藏 |
| GitLab、Tencent IMA、XMind | `DS-001`、`DS-002`、`HIDE-002`–`HIDE-004` | Lite 不暴露 XMind/GitLab/IMA；Standard 保留上游 GitLab/IMA connector catalog |
| MCP/OAuth/approval 增强 | `MCP-*` | 仅兼容的授权角色；普通 Lite 不管理 |
| turn usage、consumer model/plan policy | `MODEL-005`、`BILL-010`–`BILL-013`、`OPS-005` | 保留 Musuw 套餐、额度和付费语义 |
| Organization、成员角色与 Agent/KB 分享 | `AGENT-016`、`ORG-*`、`HIDE-013` | 普通 SaaS 明确不提供；UI、深链和 API 三层隐藏。SystemAdmin 运维不是协作分享 |

## 1. 官网、公开页和法律页

基线：Storefront 63/63 和 build 为 `PASS-CONTRACT`；完整浏览器矩阵 `NOT-RUN`。

- [ ] `WEB-001` 中文/英文切换、刷新持久化、title/SEO/结构化数据同步。
- [ ] `WEB-002` 亮/暗/跟随系统主题切换与持久化，无首屏闪烁。
- [ ] `WEB-003` 桌面 Logo、导航锚点、功能、价格、FAQ、登录、开始使用、联系销售全部可达。
- [ ] `WEB-004` 移动菜单打开/关闭、点击外部、Escape、滚动锁和焦点回收。
- [ ] `WEB-005` Hero CTA、销售联系、外链、hash 滚动和浏览器返回正确。
- [ ] `WEB-006` 月/年切换后 Free/Plus/Pro/Max 价格、折扣、权益和 CTA 同步。
- [ ] `WEB-007` Free→登录；paid→保存 plan/period intent，登录后恢复 `/plans`/`/checkout`。
- [ ] `WEB-008` 不可售地区/不可用价格显示诚实状态，不生成错误订单。
- [ ] `WEB-009` 套餐对比表、tooltip、移动横向滚动和长文案无裁切。
- [ ] `WEB-010` FAQ 全部 accordion、Enter/Space、ARIA expanded 正确。
- [ ] `WEB-011` Footer 产品/文档/GitHub/登录/法律/联系链接均正确，外链安全新开。
- [ ] `WEB-012` `/terms`、`/privacy`、`/refund-policy`、`/subscription-policy`、`/acceptable-use`、`/cookies`、`/security`、`/contact` 中英文、目录和返回正确。
- [ ] `WEB-013` Contact 表单校验、mailto 草稿、成功/失败/取消状态。
- [ ] `WEB-014` 404 不泄露内部栈，也不误挂载受保护应用。
- [ ] `WEB-015` 320/375/760/1024/1440px、亮暗、reduced-motion 均无溢出和遮挡。

## 2. Auth、注册、恢复、邀请和 onboarding

基线：Auth 100/100 与 build 为 `PASS-CONTRACT`；真实身份浏览器矩阵 `NOT-RUN`。

- [ ] `AUTH-001` 邮箱密码登录；错误密码、未注册、未确认、限流、服务不可用。
- [ ] `AUTH-002` 密码显隐、回车提交、Tab 顺序、自动填充和密码管理器。
- [ ] `AUTH-003` Google OAuth 发起、成功、取消、错误、重复 callback 和原目标恢复。
- [ ] `AUTH-004` 邮箱 OTP 发送、粘贴/输入、验证、重发、倒计时、改邮箱、过期。
- [ ] `AUTH-005` 注册邮箱/密码/确认/条款/OTP；已存在、弱密码、不一致。
- [ ] `AUTH-006` forgot/recovery/new password；过期 token、弱密码、成功回登录。
- [ ] `AUTH-007` identity pending、网络重试、错误 hash、无参数/重复 callback 安全。
- [ ] `AUTH-008` logout 同时清理服务端和本地状态；后退不能回受保护页。
- [ ] `AUTH-009` access token 过期刷新；refresh 失败只退出一次并保留安全返回目标。
- [ ] `AUTH-010` `/register?token=` 邀请注册；失效/已用 token；注册后自动入租户。
- [ ] `AUTH-011` `/join?code=` 登录前后恢复；错误、已加入、人数上限、无权限。
- [ ] `AUTH-012` 无租户进入 onboarding，创建、重复名、失败重试、完成回跳。
- [ ] `AUTH-013` 有租户访问 onboarding 自动回 KB，不能重复建默认租户。
- [ ] `AUTH-014` 未登录访问全部受保护深链进入 Auth；登录后仅恢复安全 allow-list。
- [ ] `AUTH-015` OIDC-only 用户按策略隐藏改密；直接 `change-password` 接口仍严格鉴权。
- [ ] `AUTH-016` 320–1440px、亮暗、中英、键盘和屏幕阅读器可用。

## 3. 平台壳、侧栏、命令面板和历史会话

基线：Lite 主导航与基本会话 `PASS-CURRENT`；全部控件 `PARTIAL`。

- [ ] `SHELL-001` Logo、新对话、KB、Agent 正确显示并导航；普通 SaaS 不显示 Organization/分享导航。
- [ ] `SHELL-002` 侧栏折叠/展开、Logo 返回、拖拽宽度和刷新持久化。
- [ ] `SHELL-003` 窄屏侧栏 overlay、关闭、焦点、滚动和主内容可达。
- [ ] `SHELL-004` Standard 搜索/Cmd-K 打开命令面板；Lite 不显示。
- [ ] `SHELL-005` 命令面板搜 KB/chunk/message/agent/session/command，键盘/空/错状态。
- [ ] `SHELL-006` Ask AI 和检索设置 drawer；Lite 深链不可绕过。
- [ ] `SHELL-007` 会话分组、骨架、空态、加载更多、来源过滤和租户切换。
- [ ] `SHELL-008` 会话打开、重命名、pin/unpin、复制 ID/link/Markdown、清空、删除。
- [ ] `SHELL-009` 批量模式、全选/反选/部分选择、批量删除、取消和失败恢复。
- [ ] `SHELL-010` 自动标题拒绝长答案/Markdown/URL，刷新后安全持久化。
- [ ] `SHELL-011` 并发手动重命名不被迟到自动标题覆盖。`PASS-CONTRACT`：2026-09-01 deferred-model 红灯稳定复现迟到自动标题覆盖；repository 原子 `UpdateTitleIfEmpty` CAS 修复后 service/repository 定向套件通过。尚无当前部署版本的真实浏览器竞态证据，因此保持 `PASS-CONTRACT`。
- [ ] `SHELL-012` 文件拖到 chat→附件，拖到 KB→文档，其他页不误接收；遮罩不残留。
- [ ] `SHELL-013` New User Guide/Spotlight 开始、下一步、跳过、完成、重开。
- [ ] `SHELL-014` Standard 邀请 bell badge、打开、刷新、空、错、关闭。
- [ ] `SHELL-015` Lite 不显示邀请 bell、不轮询 invitations；crafted API/deep-link 被 edition gate 拒绝。

### User menu

- [ ] `MENU-001` 账户→profile；折叠侧栏点击先展开，不出现错位浮层。
- [ ] `MENU-002` Usage、Plans、General/个人设置进入正确 section。
- [ ] `MENU-003` 普通 SaaS 隐藏 workspace/member/organization 协作设置；内部 Standard/SystemAdmin 管理面按独立 capability 显示。
- [ ] `MENU-004` SystemAdmin 入口只对 SystemAdmin；深链对其他角色回退。
- [ ] `MENU-005` Standard help/GitHub/重开引导外链正确；Lite 策略一致。
- [ ] `MENU-006` 普通 SaaS 无多租户切换入口；内部 Standard/SystemAdmin 切换不串缓存。`DEFERRED-HIDDEN`（consumer）
- [ ] `MENU-007` Create tenant capability、成功/取消/错误/禁止提示。
- [ ] `MENU-008` Logout API、本地清理和外部 Auth handoff 完整。

## 4. 知识库列表、创建和配置

基线：Document KB、AnyDoc、auto-tag、Basic/Advanced Musuw UI `PASS-CURRENT`；其余 `PARTIAL`。

- [ ] `KB-001` 列表 loading/skeleton/empty/error/retry/分页。
- [ ] `KB-002` All/Mine/Favorites/Recents 过滤、数量和刷新保持；普通 SaaS 无 Shared 过滤。
- [ ] `KB-003` 内部 Standard 可保留 tenant/shared/read-only/by-me 上游分组；普通 SaaS 仅私有列表且不可通过状态注入恢复 Shared。
- [ ] `KB-004` 搜索、清空、无结果、中英文/大小写。
- [ ] `KB-005` 单用户 owner 可创建；未登录/错误账号拒绝，不暴露协作角色差异。
- [ ] `KB-006` 新建默认 Document；Lite 不显示 FAQ/Wiki 类型。
- [ ] `KB-007` 名称/描述/封面、空/重复/长度、取消和错误。
- [ ] `KB-008` 新建默认模型、AnyDoc、chunk/retrieval/auto-tag/attachment 与预设一致。
- [ ] `KB-009` Create 双击只建一个，成功打开详情，失败无幽灵卡片。
- [ ] `KB-010` 卡片 open/favorite/pin/edit/copy/delete 正确；普通 SaaS 无 share 动作。
- [ ] `KB-011` copy/duplicate 进度、数据完整、失败重试和幂等。
- [ ] `KB-012` delete 确认、后台任务、列表消失、失败恢复。
- [ ] `KB-013` shared viewer/editor 卡、来源、跳转、取消共享。`DEFERRED-HIDDEN`：普通 SaaS 不提供，验证三层不可达。
- [ ] `KB-014` 旧 v0.7.2 KB 的模型、检索、R2、图谱和权限不被新默认覆盖。

### Basic / Advanced

- [ ] `KBSET-001` Basic name/description/ID copy/save/cancel/dirty-close。
- [ ] `KBSET-002` Lite 仅 Basic+Advanced，布局与 Memory 设置一致。
- [ ] `KBSET-003` vector+keyword/hybrid、已有文件锁定和诚实说明。
- [ ] `KBSET-004` Wiki enable、granularity、content/extraction instructions（适用时）。
- [ ] `KBSET-005` Auto-tag switch，模型 V4 Flash、max=3、skipTagged=true；普通用户不看模型噪音。
- [ ] `KBSET-006` AnyDoc 默认；旧 DocReader 库不被强改；文件族 parser 规则一致。
- [ ] `KBSET-007` chunk size/overlap/separators/parent-child/debug/恢复默认与非法值。
- [ ] `KBSET-008` retrieval keyword/vector/rerank/topK/threshold/rewrite/expansion/fallback。
- [ ] `KBSET-009` 模型只显示套餐允许/就绪项；embedding 等放 Advanced 或按策略隐藏。
- [ ] `KBSET-010` VLM/ASR/image/audio/parser wait 设置（Standard/Admin）保存并实测。
- [ ] `KBSET-011` storage/vector/parser 受管理员策略，普通用户不可改基础设施。
- [ ] `KBSET-012` share role/expiry/revoke/copy。`DEFERRED-HIDDEN`：普通 SaaS 不提供；activity 若保留必须与分享 UI 解耦。
- [ ] `KBSET-013` DataSource 仅 Admin/Standard；Lite 无入口。
- [ ] `KBSET-014` 全页复用 VisualSettingsShell、左 nav、unboxed rows、统一 footer。

## 5. 文档、文件夹、标签和解析生命周期

基线：DOCX/Markdown AnyDoc 上传→解析→问答引用 `PASS-CURRENT`；完整动作 `NOT-RUN/PARTIAL`。

### 上传和来源

- [ ] `DOC-001` 本地单/多文件、文件夹上传，目录保留、进度、取消。
- [ ] `DOC-002` drag/drop、选择器取消、同名/重复/空文件。
- [ ] `DOC-003` PDF/DOC(X)/PPT(X)/XLS(X)/CSV/TXT/MD/HTML/RTF/ODT/ODS/ODP 支持和提示。
- [ ] `DOC-004` 图片 OCR、音频 ASR、扫描 PDF、表格/公式/图片抽取可预览和检索。
- [ ] `DOC-005` URL 导入、redirect/401/403/404/timeout/oversize/SSRF private 地址。
- [ ] `DOC-006` Instagram/X/小红书/抖音/TikTok/YouTube 只按 capability 显示，无死入口。
- [ ] `DOC-007` online/manual editor draft/save/publish/preview/source/cancel/version。
- [ ] `DOC-008` upload confirm 显示 files/folder/parser/duplicate policy/quota。
- [ ] `DOC-009` oversized/corrupt/archive bomb/MIME spoof/unsupported/max-count 错误。
- [ ] `DOC-010` parser/storage/vector 不可用时失败可见、可重试、不永久 processing。

### 浏览、筛选、文件夹和标签

- [ ] `DOC-011` Grid/List、card/row、pagination/load-more/empty/刷新保持。
- [ ] `DOC-012` search/type/status/source/date filters 与 clear-all。
- [ ] `DOC-013` tag search/chips/load-more/multi-tag filters。
- [ ] `DOC-014` folder expand/select/breadcrumb/create/rename/move/delete-empty。
- [ ] `DOC-015` upload 到当前 folder，拖动后 path/count 一致。
- [ ] `DOC-016` 删除非空 folder 明确范围，失败不丢文档。
- [ ] `DOC-017` tag drawer create/rename/color/merge/delete/duplicate/in-use。

### 单项、批量、chunk 和引用

- [ ] `DOC-018` preview text/image/Office/PDF page/metadata/source。
- [ ] `DOC-019` download filename/MIME/disposition/nosniff/中文/权限/已删。
- [ ] `DOC-020` edit manual/title/summary/metadata/image info/tags 后检索更新。
- [ ] `DOC-021` stages/spans/trace，错误不泄露 secret。
- [ ] `DOC-022` reparse/rebuild confirm/disable/progress/success/failure 保留旧内容。
- [ ] `DOC-023` cancel parse 真终止，刷新一致，再次 reparse 可恢复。
- [ ] `DOC-024` move folder/other KB、reuse vector/reparse、跨租户目标隐藏。
- [ ] `DOC-025` regenerate/edit summary；generated questions add/edit/delete/regenerate。
- [ ] `DOC-026` chunk pagination/view/edit/delete/delete-all/revision/revert。
- [ ] `DOC-027` 单删清 index/R2/usage；失败恢复。
- [ ] `DOC-028` batch select/all/clear/tag/move/reparse/delete。
- [ ] `DOC-029` batch partial failure 逐项结果，失败可重试且成功项不重复。
- [ ] `DOC-030` clear KB contents 不删配置，清 index/object/usage。
- [ ] `DOC-031` auto-tag 真正产生标签且遵守 skip/manual 规则。
- [ ] `DOC-032` 问答返回正确 chunk/page/openable citation/download；版本变更无 stale 引用。
- [ ] `DOC-033` 复核前端 `/knowledge-bases/:id/rebuild-index` 陈旧调用；可达 404 必须修复/删除。

## 6. Wiki、Obsidian 图谱和 FAQ

### Wiki / Graph

- [ ] `WIKI-001` Overview/search/clear/Index/Summary/Entity/Concept/Synthesis/Comparison tabs+counts。
- [ ] `WIKI-002` tree/list、folder expand/collapse/load-more/drag-move。
- [ ] `WIKI-003` new root/subfolder、rename/delete，inline confirm/cancel/duplicate。
- [ ] `WIKI-004` new page title/slug/type/content；view/edit/save/cancel/delete。
- [ ] `WIKI-005` revision list/diff/revert；concurrent conflict reload latest/overwrite。
- [ ] `WIKI-006` internal links/backlinks/source-doc/image preview/history back。
- [ ] `WIKI-007` page issues fix/ignore，global issues drawer，auto-fix assistant chat。
- [ ] `WIKI-008` index/rebuild links/stats/search 后台任务终态。
- [ ] `WIKI-009` Graph node search/help/type chips/fit/arrows/frontier/overview。
- [ ] `WIKI-010` Obsidian settings reset/animate/physics/theme；node detail/neighbors/bloom。
- [ ] `WIKI-011` 大图性能、empty/error、亮暗、窄屏、键盘和 tooltip。
- [ ] `WIKI-012` 单用户 owner 的 page/folder/revision/fix/delete 服务端权限正确；错误账号不可读写。2026-09-01 隔离 Standard Viewer/share 证据仅属上游兼容实验，不再是消费者上线门。
- [ ] `WIKI-013` Standard KB Graph 设置的 enable/instructions/tags/random-tag/random-text/entities/relations/extract；graph DB disabled、模型未就绪、成功/失败、保存/取消和 Admin 权限。

### FAQ product gate

- [ ] `FAQ-001` Lite 不显示 FAQ KB/type/tab/import/batch。`DEFERRED-HIDDEN`
- [ ] `FAQ-002` Lite FAQ list/create/update/delete/search/import-progress API 全被拒。`DEFERRED-HIDDEN`
- [ ] `FAQ-003` Standard 若启用：search/add/edit/delete/enable/recommended/similar/negative/answers limits。
- [ ] `FAQ-004` tags/batch/tag/delete/export/search-test drawer。
- [ ] `FAQ-005` JSON/CSV/XLSX append/replace/sample/progress/failure-download/idempotency。

## 7. Chat、session、检索、引用和附件

基线：DeepSeek、KB 引用、web retrieval、图片 OCR、音频 ASR `PASS-CURRENT`；全部控制面 `PARTIAL`。

- [ ] `CHAT-001` global/KB new-chat，首次 suggestions、空输入、创建失败。
- [ ] `CHAT-002` Quick Answer/Smart Reasoning/custom Agent 切换后 model/KB/tools 同步。
- [ ] `CHAT-003` 私有 KB selector 单/多/全选/取消/search/mention scope；普通 SaaS 不出现 shared read-only 资源。
- [ ] `CHAT-004` model 只显示 plan+scene 可用项；V4 Flash 默认、切换与刷新。
- [ ] `CHAT-005` reasoning levels、unsupported 隐藏/禁用、payload 与 UI 一致。
- [ ] `CHAT-006` send、Enter/Shift-Enter、pending disable、双击不重复 message。
- [ ] `CHAT-007` SSE first-byte/thinking/RAG pipeline/stream/body/usage/end/persist。
- [ ] `CHAT-008` Stop 真停止；disconnect 后 Continue 不丢/不重复；刷新一致。
- [ ] `CHAT-009` timeout/offline/missing credential/model reject/quota/fallback 显示持久错误，不无响应。
- [ ] `CHAT-010` regenerate/copy/copy-Markdown/add-to-KB/manual-edit/external links。
- [ ] `CHAT-011` citation float/references drawer/chunk/original/page/download/close-back。
- [ ] `CHAT-012` graph/database/web/tool results 折叠、加载、错误、链接安全。
- [ ] `CHAT-013` follow-up generate/refresh/click/close/impression/dismiss/late response。
- [ ] `CHAT-014` timestamps/question minimap/click-scroll/auto-follow/narrow。
- [ ] `CHAT-015` Header title/pin/copy ID/link/Markdown/new-window/clear/delete。
- [ ] `CHAT-016` session search/history stats/history order/legacy migration。
- [ ] `CHAT-017` delete message/clear/delete session/batch delete 与 UI/API/usage 一致。
- [ ] `CHAT-018` Lite 隐藏 Web Search toggle，服务端对 false/缺省仍按 Musuw 策略强制检索；真实结果、引用和失败状态正确。
- [ ] `CHAT-019` Web Fetch redirect/invalid/malicious/timeout/oversize/SSRF。
- [ ] `CHAT-020` 基础 Tool Configuration 默认开；危险写工具不能无意启用。
- [ ] `CHAT-021` Standard 显示 Web Search toggle；开启时调用，关闭时确实不调用并持久化。

### Attachments

- [ ] `ATT-001` image/audio/PDF/Word/text/sheet 选择、拖放、预览、移除、发送。
- [ ] `ATT-002` image VLM/OCR、audio ASR、document AnyDoc 参与回答且来源可见。
- [ ] `ATT-003` 最多数量、unsupported/corrupt/oversize、parse timeout/retry/cancel。
- [ ] `ATT-004` 上传中关闭/刷新/重复/跨 session 不串文件。
- [ ] `ATT-005` temp attachment list/get/preview/delete/expiry/cross-tenant deny。
- [ ] `ATT-006` Lite ordinary attachments 保留；Sandbox artifact 隐藏。

## 8. Agent 列表、编辑和真实运行

基线：Lite allow-list、默认项和基本问答为 `PASS-CURRENT/PASS-CONTRACT`；完整 CRUD/tools `PARTIAL`。

- [ ] `AGENT-001` builtin/mine groups、折叠、search、empty/loading/error；普通 SaaS 不出现 workspace/shared groups。
- [ ] `AGENT-002` Quick/Smart/Data Analyst/Wiki agents 用途正确；Data Analyst 只算 v0.7.2 回归。
- [ ] `AGENT-003` Create name/description/avatar/type preset/mode；save/cancel/double/error。
- [ ] `AGENT-004` edit/copy/favorite/delete/persist；非 owner 权限。
- [ ] `AGENT-005` Lite 仅 Basic/Knowledge/Prompts；deep-link/watcher/validation 不暴露 hidden tab。
- [ ] `AGENT-006` 内部 Standard Basic/Knowledge/Prompts/Conversation/Retrieval/Web/Multimodal/Suggestions/Tools/MCP/Skills 按 capability；Share 不属于普通 SaaS 产品面。
- [ ] `AGENT-007` mode/model/memory/system prompt/template/placeholders 保存回显。
- [ ] `AGENT-008` 私有 KB scope all/selected/mentioned、search/delete/no-KB error；普通 SaaS 不出现 shared KB。
- [ ] `AGENT-009` multi-turn/history/query rewrite 开关影响真实请求。
- [ ] `AGENT-010` retrieval keyword/vector/rerank/topK/threshold/FAQ/direct/boost/data-analysis。
- [ ] `AGENT-011` Web enable/provider/max/fetch/topN；new Agent default on，off 不调用。
- [ ] `AGENT-012` image/VLM/OCR/pages/storage、audio/ASR/wait/parser rules 实测。
- [ ] `AGENT-013` starters/followups add/delete/source/count/model/Advanced/result。
- [ ] `AGENT-014` Tools groups/select-all/read-write/danger/default/real tool calls。
- [ ] `AGENT-015` 新 Agent 图片/音频/Web Search+Fetch/基础 Tools 默认开；旧 Agent 不被覆盖。
- [ ] `AGENT-016` Agent tenant/org/role 分享。`DEFERRED-HIDDEN`：普通 SaaS 明确不提供；必须验证入口、深链和非必要分享 API 均不可用。2026-09-01 隔离 Standard 的跨租户分享实验仅保留为上游兼容证据，不再是消费者上线矩阵。
- [ ] `AGENT-017` suggestions get/ensure/event；failure/late/multi-user。
- [ ] `AGENT-018` timeout/max iterations/tool/model/quota failure 有明确 UI。
- [x] `AGENT-019` Lite 新建 Agent 不因无权读取 storage config 而丢默认 system prompt。`PASS-CURRENT`：2026-09-01 staging 新建 `ACC-20260901T1710Z-Agent-Prefetch`，刷新后 11,649 字符 prompt 保持，真实 chat 以 3 次 tool call 返回知识库 marker `ORBITAL SAGE 4826` 与引用，再刷新后 Agent/回答/引用仍保持。
- [ ] `AGENT-020` Agent card/editor/guide/chat capsule 亮暗/窄屏符合 Musuw。

## 9. Memory：个人与工作区全部能力

基线：全部设置可见、单击创建 race、跨 session recall `PASS-CURRENT`；生命周期 `PARTIAL`。

### Workspace Memory

- [ ] `MEM-001` 单用户 owner 可见并可保存完整 Basic+Advanced；普通产品不暴露协作角色差异。
- [ ] `MEM-002` enabled、explicit/auto writes、retrieval conditioning、max items。
- [ ] `MEM-003` Advanced 显示 vector recall、embedding/extraction model、delay、min interval、interest threshold、instructions。
- [ ] `MEM-004` embedding 可放 Advanced；默认/不可用/已有数据切换限制和说明。
- [ ] `MEM-005` workspace off 时个人页、extract/recall、提示一致。
- [ ] `MEM-006` 重复保存、迟到响应和会话/身份变化不覆盖新值；多 admin 竞态不属于普通产品门。

### Personal Memory

- [ ] `MEM-007` personal enable/disable、usage dialog、workspace-disabled 提示。
- [ ] `MEM-008` 新增 profile/preference/fact/task/interest；首次点击立即且只提交一次。
- [ ] `MEM-009` 前一条迟到成功不清空正在输入的后一条，也不误报保存。
- [ ] `MEM-010` active/pending/tracking/documents/superseded/archived、count/page/empty/reload。
- [ ] `MEM-011` edit/save/confirm/reject/delete/cancel/failure restore。
- [ ] `MEM-012` tracking promote/dismiss、topic delete/promote、consolidation result。
- [ ] `MEM-013` document provenance/open/stop tracking/delete/source session/message。
- [ ] `MEM-014` export content/encoding/filename/privacy/no-data。
- [ ] `MEM-015` consolidate confirm/progress/double/retry。
- [ ] `MEM-016` clear 真清 vector+lexical，chat 不再 recall，审计可追踪。
- [ ] `MEM-017` auto extract/delay/threshold/explicit/cross-session recall 真实问答。
- [ ] `MEM-018` 跨账号、登出重登、旧浏览器状态与 Agent 会话隔离，个人记忆不可越权；shared Agent 角色矩阵移出普通产品门。

## 10. Settings、profile、models、usage

- [ ] `SET-001` language、light/dark/system、small/normal/large font、Standard font family，保存刷新。
- [ ] `SET-002` Profile load/retry/fields/OIDC marker/read-only。
- [ ] `SET-003` 普通用户隐藏 change-password；直接接口仍安全。`DEFERRED-HIDDEN`
- [ ] `SET-004` Lite consumer scene model rag/rerank/wiki/vision/asr，plan/readiness 提示。
- [ ] `SET-005` Usage plan、OpenRouter monthly/remaining、storage、KB/doc/video limits/reset time。
- [ ] `SET-006` pending/unprovisioned/unavailable/exhausted 状态与 fallback。
- [ ] `SET-007` Upgrade/View plans/Customer Portal 按 free/paid，失败可重试。
- [ ] `SET-008` Settings close 回原页；cold deep link 回 KB；focus 回 launcher。
- [ ] `SET-009` unauthorized section 不显示；crafted query/tab 回 General/authorized fallback。
- [ ] `SET-010` settings search 只过滤已授权项，empty 提示，不合成 hidden section。
- [ ] `SET-011` 所有 save/cancel footer、按钮顺序、loading、dirty state 一致。
- [ ] `SET-012` Standard Chat History enable、embedding model、已有索引时锁定、stats、save/reload/error。
- [ ] `SET-013` Version/System Info 版本、固定 upstream revision、deployment capability 显示准确且只读。

## 11. Paddle、套餐、额度和配额

基线：public config/catalog/signed simulations/portal API `PARTIAL`；完整 hosted Sandbox 是发布门禁。

- [ ] `BILL-001` Plans monthly/yearly、Free/Plus/Pro/Max、currency/benefits/current plan。
- [ ] `BILL-002` 登录前 checkout intent，登录后恢复；invalid plan/period 拒绝。
- [ ] `BILL-003` Paddle Sandbox hosted checkout success；return/transaction/subscription/entitlement/allowance 一致。
- [ ] `BILL-004` decline/3DS/unavailable payment method/close/retry 不重复订单。
- [ ] `BILL-005` Plus→Pro→Max upgrade、proration/concurrent/unknown operation/retry。
- [ ] `BILL-006` cancel/period-end/downgrade Free/resume/recovery/past_due/dunning。
- [ ] `BILL-007` Customer Portal payment method/history/back/non-paid error。
- [ ] `BILL-008` `/pay`、`/retain` token valid/expired/used/error/mobile。
- [ ] `BILL-009` webhook bad signature/duplicate/out-of-order/delay/tamper/unknown price/refund/adjustment/dead-letter。
- [ ] `BILL-010` Free/Plus/Pro/Max storage/KB/doc/video/OpenRouter limit boundaries。
- [ ] `BILL-011` usage deduction/turn usage/remaining/period reset/failed request semantics。
- [ ] `BILL-012` complimentary overlay/expiry/revoke/original paid restore。
- [ ] `BILL-013` non-Admin/wrong tenant/cross-tenant checkout/portal/history deny。
- [ ] `BILL-014` 清理 tenant `10002` stale in-flight checkout，确认新订单不受阻。
- [ ] `BILL-015` 全流程只用 Sandbox；production Live 仅只读。

## 12. 内部 Tenant/SystemAdmin 与消费者协作负向边界

基线：普通 SaaS 是单账号、单用户、私有工作区；成员、邀请、Organization 和分享不是消费者能力。内部 Standard/SystemAdmin 契约可做隔离兼容测试，但不能提升为消费者上线要求或可见入口。

### Tenant and members

- [ ] `TEN-001` 私有工作区名称/描述若对 consumer 暴露则单用户保存；成员角色编辑 `N/A`。
- [ ] `TEN-002` storage quota/over-limit/error；普通用户不可扩大平台配额。
- [ ] `TEN-003` member search/page/role/audit drawer。`N/A`：普通 SaaS 不提供。
- [ ] `TEN-004` invite/revoke/duplicate/existing/expired/member limit。`N/A`：普通 SaaS 不提供。
- [ ] `TEN-005` invite link create/copy/rotate/revoke/expiry/login/register auto-accept。`N/A`：普通 SaaS 不提供。
- [ ] `TEN-006` Viewer/Contributor/Admin 角色切换。`N/A`：普通 SaaS 不提供。
- [ ] `TEN-007` remove/leave/last-owner/self-removal safeguards。`N/A`：普通 SaaS 不提供成员操作；账号删除走 erasure。
- [ ] `TEN-008` invitation inbox list/pending/accept/decline/by-token。`N/A`：普通 SaaS 不提供。
- [ ] `TEN-009` tenant switch/home/preference/toast。`DEFERRED-HIDDEN`：普通 SaaS 无切换入口；仍验证缓存不能跨账号。
- [ ] `TEN-010` 私有工作区/账号删除走 account erasure 的确认、后台清理、恢复和审计。
- [ ] `TEN-011` 普通 SaaS 无 invitation inbox/bell/polling；`/me/invitations*` 被 edition gate 拒绝。`DEFERRED-HIDDEN`

### Organizations and shares（普通 SaaS 均为 `DEFERRED-HIDDEN`）

- [ ] `ORG-001` created/joined groups/search/collapse/load/empty/error。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-002` create name/emoji/description、duplicate/cancel/error。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-003` search/code join preview/stats/request role+message/already/member limit。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-004` join requests approve role/reject/concurrent/expired。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-005` basic settings/searchable/approval/limit/invite code/link/expiry。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-006` members search/add tenant/role/remove/upgrade requests/page。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-007` shared KB/Agent add/viewer/editor/jump/source/unshare。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-008` leave/delete/last-owner/resources boundary。`N/A`：普通 SaaS 不提供。
- [ ] `ORG-009` 普通 SaaS 隐藏 Organizations，服务端 gate 拒绝深链/API。`DEFERRED-HIDDEN`

## 13. Standard/Admin 模型、parser、vector、storage、web-search

### Models and runtime

- [ ] `MODEL-001` catalog all/chat/embedding/rerank/vllm/asr filter/load/empty/provider。
- [ ] `MODEL-002` SystemAdmin add/edit/copy/delete；builtin/locked 不误删。
- [ ] `MODEL-003` provider/name/baseURL/key/secret/headers/vision/dimension validate+redact。
- [ ] `MODEL-004` connection test/debug success/error/timeout/cancel/log redaction。
- [ ] `MODEL-005` scene policy/consumer plan 更新后 Lite options 即时一致。
- [ ] `MODEL-006` Ollama URL/status/test/list/download progress/refresh/fail/cancel。
- [ ] `MODEL-007` Musuw Cloud app credentials/status/reconfigure/delete/expired。

### Parser

- [ ] `PARSER-001` builtin/DocReader/simple/AnyDoc/markitdown/MinerU/PaddleOCR 仅按 capability。
- [ ] `PARSER-002` AnyDoc 为新 KB/上传默认，Office/PDF 原生解析。
- [ ] `PARSER-003` DocReader HTTP/gRPC status/reconnect/unreachable/timeout。
- [ ] `PARSER-004` MinerU endpoint/backend/VLM/formula/table/lang save/test。
- [ ] `PARSER-005` MinerU Cloud、PaddleOCR endpoint/token/model/toggles save/test。
- [ ] `PARSER-006` parser 切换只影响明确的新解析/reparse，旧文档不静默改变。

### Vector and storage

- [ ] `INFRA-001` Vector type/name/connection/index fields/Advanced/test/default/edit/delete。
- [ ] `INFRA-002` local/S3/R2-compatible/OSS/COS/TOS/MinIO allow-list。
- [ ] `INFRA-003` endpoint/region/key/secret/bucket/prefix/SSL/path-style/temp bucket validate/redact/test。
- [ ] `INFRA-004` default/edit/delete 对已有资源给出影响，失败不改当前默认。
- [ ] `INFRA-005` R2/S3 signed URL TTL/download/expiry/path traversal/cross-tenant/deleted。
- [ ] `INFRA-006` storage outage retry/usage/object idempotency。

### Web search providers

- [ ] `SEARCH-001` consumer 只见基础 Web Search 开关，不见 provider credential 噪音。
- [ ] `SEARCH-002` Admin provider list/add/edit/copy/delete/default/test。
- [ ] `SEARCH-003` name/description/baseURL/key/engine/extra/proxy validate+redact。
- [ ] `SEARCH-004` stable provider 真实搜索、timeout/no result/rate limit/fallback。
- [ ] `SEARCH-005` Metaso/Exa 等增量 provider 若暂缓，对普通用户隐藏。`DEFERRED-HIDDEN`

## 14. MCP、Sandbox、Skills、Env、Artifacts 和 DataSource

普通 Musuw 当前不接入 Sandbox/Skills 资源体系；必须优先证明负向 gate。Standard/Admin 只在 capability 真正存在时执行。

- [ ] `DEFER-001` Lite Settings 无 Sandbox/Skills/Env/artifact/shell/skill installer。
- [ ] `DEFER-002` Lite settings query/deep-link/API 均 fallback/404/403。
- [ ] `DEFER-003` Lite AgentEditor 不显示 Skills/Sandbox/artifact/shell，validation 不打开 hidden tab。
- [ ] `DEFER-004` Chat 无 sandbox files/commands/generated artifact drawer；普通附件保留。
- [ ] `DEFER-005` artifact bounded read 强制 provider-side `cap+1`，stale size 不 OOM。
- [ ] `DEFER-006` Standard/Admin capability：Sandbox CRUD/test/non-root/lease/timeout/cleanup/network。
- [ ] `DEFER-007` Standard/Admin capability：Skills catalog/install/files/env/transcript/rollback/redaction。
- [ ] `DEFER-008` env vars view/add/edit/delete/viewer-readonly/runtime injection；Lite 隐藏。
- [ ] `MCP-001` Viewer 可只读 service/get/tools/resources/approval 状态并完成会话内 OAuth/approval resolution；不能修改策略或凭据。
- [ ] `MCP-002` Admin+ 可 create/edit/delete/test、写 credentials 和 tool-approval policy；所有 secret 脱敏。
- [ ] `MCP-003` OAuth start/callback/status/revoke/expiry/cancel/cross-tenant；approval allow/deny/timeout/retry 不能绕权。
- [ ] `MCP-004` Lite Viewer/Contributor 无管理入口；Lite Admin/SystemAdmin 仅保留 HANDOFF 明确的兼容例外，服务端仍按角色分读写。
- [x] `DS-001` Lite consumer 不显示 XMind、GitLab、Tencent IMA。`PASS-CURRENT`：2026-09-01 staging Lite 的 KB 设置无 Data Source 入口，GitLab/IMA 可见计数均为 0；XMind 不在 consumer 上传/设置表面。深链/API 三层总门禁另见 `HIDE-002`–`HIDE-004`。
- [x] `DS-002` Standard 保留上游 GitLab/Tencent IMA connector catalog，同时不得回流 Lite。`PASS-CURRENT`：2026-09-01 隔离 Standard 真实 KB 设置展示 Data Source、GitLab 与腾讯 IMA；Lite 对照为 0，consumer-surface 回归测试 2/2 通过。
- [ ] `DS-003` 其他 datasource connector/credential/resource tree/create/edit/delete。
- [ ] `DS-004` schedule/incremental/full/overwrite/skip/deletions/sync/pause/resume/logs/retry。

## 15. Embed、IM、API 和外部集成

基线：源码和 contract tests 存在；完整 staging 浏览器为 `NOT-RUN`。仅在 Standard capability 开启时执行。

- [ ] `EMBED-001` channel add/edit/delete/enable、origins、rate limits、welcome、suggestions。
- [ ] `EMBED-002` web/file/title/position/locale/color/webhook 保存与 preview。
- [ ] `EMBED-003` snippet/server examples copy、key reveal/rotate、old key revoke。
- [ ] `EMBED-004` embed.html anonymous/auth chat、stream、attachment、error、rate-limit、isolation。
- [ ] `IM-001` channel add/edit/delete/toggle、agent filter、3-step wizard。
- [ ] `IM-002` WeCom/Feishu/Lark/Slack/Telegram/DingTalk/Mattermost/Yunzhijia credentials/callback。
- [ ] `IM-003` WeChat/QQBot QR bind/refresh/expiry/rebind/cancel。
- [ ] `IM-004` WebSocket/Webhook/session thread/output/file KB/callback recovery。
- [ ] `API-001` tenant API key add/edit/delete/scope/one-time copy/revoke/expiry。
- [ ] `API-002` principal/direct header/HMAC/JWT examples 与真实请求一致，bad signature/tenant deny。
- [ ] `API-003` playground agent/user/query/preview/execute/stop/SSE final/error/double submit。
- [ ] `API-004` Chrome extension links/config；Claw/Skills 按 deferred 策略隐藏或管理员化。
- [ ] `API-005` CLI、Go SDK、MCP server 的 auth、retrieve/chat/history、错误码和版本兼容 contract。
- [ ] `API-006` public resource grant、presigned GET/HEAD、短链接 `/r/:token` 的有效期、权限和 cache headers。

## 16. SystemAdmin、运营和后台任务 UI

基线：operations console 有 Playwright；主应用这些点击面 `NOT-RUN/PASS-CONTRACT`。

- [ ] `OPS-001` system global access/tenant/runtime/security/models/other tabs。
- [ ] `OPS-002` bool/int/string/enum/string-list 动态 key auto-save、invalid、reset、audit。
- [ ] `OPS-003` registration-mode high-risk confirm、SSRF allowlist tags、default quota batch apply。
- [ ] `OPS-004` promote/revoke/list admin、create/reset user、last-admin safeguard。
- [ ] `OPS-005` consumer free/paid model policies 保存后 runtime 生效。
- [ ] `OPS-006` Platform API key capability groups/token copy/list/delete/hidden chips。
- [ ] `OPS-007` Audit refresh/infinite scroll/detail/empty/error/redaction。
- [ ] `OPS-008` Queues auto-refresh/pool/model stats、active/pending/scheduled/retry/archived/completed。`PARTIAL`：isolated Standard 的 12 个真实队列、worker pools、model empty state、auto-refresh toggle 和 retry 计数已通过；其余状态待补。
- [ ] `OPS-009` task detail/load-more/purge/cancel/run-now/delete、confirm/concurrency/unavailable queue。`PARTIAL`：真实 retry task 的 detail/run-now confirm 与 CSRF 请求已通过；其余动作待补。
- [ ] `OPS-010` Lite inline executor 无 dead queue UI；document/Memory/billing 下游仍完成。
- [ ] `OPS-011` managed entitlement/complimentary/default quota/OpenRouter provision+refresh/wrong tenant。
- [ ] `OPS-012` user investigation/account erasure/status/retry/paid/shared/audit。
- [ ] `OPS-013` System info/version/capabilities/parser/storage/sandbox checks 与部署一致。
- [x] `OPS-014` operations console overview/users/KB/billing/identity/storage/logs/queue/audit、CSP/X-frame/Axe。`PASS-CURRENT`：isolated Standard real-data Playwright 3/3；七页 Axe serious/critical=0；CSP、X-Frame、redaction 和跨边界拒绝均通过。
- [ ] `EVAL-001` Evaluation API：API-key `run_evaluations` capability、Admin POST 异步任务、Viewer GET 结果、tenant isolation/not-found/cost/quota/failure，Lite 负向拒绝；无独立页面时不得伪造 UI PASS。

## 17. Migration、queue、R2、恢复和数据完整性

- [ ] `DATA-001` 真实 v0.7.2 PostgreSQL v93 backup→v104，tenant/session/message/KB/agent/billing/file sentinel 保留。
- [ ] `DATA-002` empty PostgreSQL→v104、重复 migrate、失败中断后 retry。
- [ ] `DATA-003` SQLite v12→v23+fresh；MySQL/ParadeDB 按真实支持矩阵。
- [ ] `DATA-004` PG 000094–104/SQLite 000013–023 的 table/column/default/index/FK/runtime override。
- [ ] `DATA-005` document process/postprocess/auto-tag/summary/question/move/clone/delete/reparse 真消费。
- [ ] `DATA-006` Wiki ingest/finalize、Memory extract/consolidate、Paddle webhook、erasure 终态。
- [ ] `DATA-007` queue retry/dead-letter/cancel/run-now、Redis outage recovery、duplicate idempotency。
- [ ] `DATA-008` R2 upload/download/delete/usage reconciliation/orphan cleanup/retry。
- [ ] `DATA-009` backup restore 后 KB retrieval/files/Wiki/Memory/quota/billing 可用。
- [ ] `DATA-010` rollback 只用 immutable image/restore；production 不运行 down migration。
- [ ] `DATA-011` resource grant/presigned URL/temporary file 在 expiry、撤销、跨租户和恢复后保持正确。

## 18. Musuw 全局 UI、交互和可访问性

每个可见页面都必须执行本节；颜色相似不代表 UI 已对齐。

- [ ] `UI-001` Settings 型页面统一 `VisualSettingsShell`：192px left-nav、header/divider/content/footer/scroll。
- [ ] `UI-002` 字段统一 unboxed `setting-row` 左标题说明/右控件；禁止上游大卡片、大蓝 tabs、平行 shell。
- [ ] `UI-003` neutral Musuw switches；danger/warning/read-only 语义一致。
- [ ] `UI-004` button height/radius/border/hover/active/disabled/loading/primary-secondary 一致。
- [ ] `UI-005` label/description/error/required/unit/placeholder/password/secret 组件一致。
- [ ] `UI-006` modal/drawer/popover/dropdown/toast/confirm 的 size/overlay/z-index/focus/Escape/return-focus。
- [ ] `UI-007` list/card/table/folder/tag/badge/page/empty/skeleton/error 密度一致。
- [ ] `UI-008` Chat/KB/Wiki/Memory/Agent/Billing/Org/Integration/System 无 WeKnora 视觉岛。
- [ ] `UI-009` 亮暗主题下文本、边界、overlay、graph、code、citation、tooltip 对比度。
- [ ] `UI-010` 320/375/760/1024/1440px 无横向溢出、遮挡、不可达 footer/浮层。
- [ ] `UI-011` 中英长文、数字、邮箱、文件名、模型名、错误不破坏布局。
- [ ] `UI-012` Tab/Shift-Tab/Enter/Space/Escape、focus ring、顺序、焦点恢复。
- [ ] `UI-013` icon-only aria-label/title，form/dialog/nav/tabs/progress/alert 语义。
- [ ] `UI-014` reduced-motion、loading layout shift、scroll position、refresh 稳定。
- [ ] `UI-015` slow network/500/timeout/offline/recovery 无永久 spinner 或无反馈点击。
- [ ] `UI-016` consumer Axe；Auth/KB list+detail+settings/Chat/Agent/Memory/Plans/Org/System 截图对比。

## 19. 权限、安全、异常和负向矩阵

- [ ] `SEC-001` 普通单用户与 SystemAdmin 运维 route 做 UI/API 正反向；Viewer/Contributor/Admin/Owner 只作为内部 Standard 兼容矩阵，不是消费者上线门。
- [ ] `SEC-002` JWT/API-key capability mismatch、revoked member old JWT、wrong tenant/path tenant deny。
- [ ] `SEC-003` 普通 SaaS 的 KB/Agent/Org share 入口、深链和 API 均不可用。`DEFERRED-HIDDEN`
- [ ] `SEC-004` 跨租户 UUID/ID/file URL/artifact/message/session 不可枚举。
- [ ] `SEC-005` upload/URL/import 防 SSRF/path traversal/MIME spoof/archive bomb/unbounded read。
- [ ] `SEC-006` provider/API/MCP/storage secrets 写后掩码，log/audit/toast/request 不回显。
- [ ] `SEC-007` Paddle webhook/OAuth/invite/resource token 防 replay/tamper/expiry/audience。
- [ ] `SEC-008` destructive action 有范围清晰的 confirm、恢复或不可恢复说明。
- [ ] `SEC-009` 5xx/timeout/rate-limit/queue/provider unavailable 有稳定错误和 retry。
- [ ] `SEC-010` 外链 target/rel 安全，Markdown/HTML 无 script，标题无 URL/Markdown 注入。

## 20. 明确暂缓/隐藏能力的最终负向清单

这些属于 Musuw 产品决策，不是漏合并：

- [ ] `HIDE-001` FAQ 类型及全部消费者入口。
- [ ] `HIDE-002` XMind outline parsing。`PARTIAL`：Lite 可见表面已复核为隐藏；深链/API 负向待跑。
- [ ] `HIDE-003` Lite GitLab project sync。`PARTIAL`：Lite KB 设置无 Data Source 入口且 catalog 可见计数为 0；深链/API 负向待跑。Standard catalog 按 OpenSpec 契约保留。
- [ ] `HIDE-004` Lite Tencent IMA KB/note/file sync。`PARTIAL`：Lite KB 设置无 Data Source 入口且 catalog 可见计数为 0；深链/API 负向待跑。Standard catalog 按 OpenSpec 契约保留。
- [ ] `HIDE-005` consumer web-search provider/credential 管理；基础 Web Search 仍可用。
- [ ] `HIDE-006` consumer model provider/embedding/vector/parser/storage 基础设施管理。
- [ ] `HIDE-007` consumer Sandbox/Skills/Env/shell/files/generated artifacts。
- [ ] `HIDE-008` consumer MCP management；Lite Admin 是否可见按 HANDOFF 契约。
- [ ] `HIDE-009` change-password UI；身份由 Auth 管理，接口仍安全。
- [ ] `HIDE-010` consumer datasource/IM/Embed/API-key/organization/system-admin surfaces。
- [ ] `HIDE-011` direct URL/old bookmark/query/state injection/API 均不能绕过。
- [ ] `HIDE-012` Lite KB detail 的 `?section=models/vector/parser/storage/graph/...`、`?tab=...` 和 nested deep link 也必须由 KB editor 与服务端共同拒绝；不能只依赖 `/platform/settings` guard。
- [ ] `HIDE-013` consumer Agent/KB Organization 分享、成员角色、join/invite/shared groups；普通 UI 无入口，深链不可达，非必要分享 API 不向普通用户开放。SystemAdmin 运维权限不视为分享例外。

## 21. 陈旧接口和前后端一致性

- [ ] `STALE-001` `frontend/src/api/auth/index.ts#getCurrentTenant()` 请求 `/api/v1/auth/tenant`，backend 无 route；确认无调用后删除或补权威契约。
- [ ] `STALE-002` `frontend/src/api/knowledge-base/index.ts#rebuildKBIndex()` 请求 `/knowledge-bases/:id/rebuild-index`，backend 无 route；确认可达性后删除死调用或接现有 rebuild seam。
- [ ] `STALE-003` 扫描全部 frontend API function vs router method/path，列 orphan client/orphan route/method mismatch。
- [ ] `STALE-004` 每个 UI setting 追踪到 request、persist、downstream consumer，不能只测开关。

## 22. 当前证据与剩余优先级

### 当前已有证据，可抽查回归

- `PASS-CURRENT`（历史部署证据，具体 SHA/时间见执行日志）：测试身份、Document KB、AnyDoc DOCX/Markdown、citation、auto-tag、DeepSeek V4 Flash、强制 web retrieval、image OCR、audio ASR、Memory Basic/Advanced/单击保存/recall、Lite Agent tabs、Sandbox/Skills/Env deep-link gate、KB/Memory/Agent/General 亮暗 UI。
- `PASS-CONTRACT`：generated-title 原子 CAS；当前套餐文案与官网中文/英文契约；Memory 注销清理；以及各次日志明确记录的 Go/frontend/i18n/typecheck/build/升级账本与发布隔离检查。历史总量不得替代当前候选的 fresh CI。

### 新无上下文任务必须优先补齐

1. `BILL-003`–`BILL-015` Paddle Sandbox 完整 hosted lifecycle；2026-09-04 已完成即时取消切片，但仍是 `PARTIAL`。
2. `1d215c3` 测试环境定向浏览器回归，尤其套餐文案、Memory 注销和额度静默刷新；部署成功不替代这些用户动作。
3. folder/tag/batch/move/reparse/cancel/delete/download/chunk/revision/summary 全文档动作。
4. Wiki page/folder/revision/conflict/lint/auto-fix/Obsidian graph。
5. Chat stop/continue/history/attachment errors/suggestions/citation drawer/title manual-race。
6. Agent CRUD/copy/favorite/full config/basic Tools real call；分享不在普通产品门。
7. 普通单用户→SystemAdmin 的运维边界与跨账号隔离；Organization/sharing 只做三层隐藏负向验证。
8. Auth OTP/OAuth/recovery/invite/onboarding/logout/expiry。
9. 普通 SaaS 的 tenant/member/invitation/organization/share 隐藏门禁；内部运维能力另列。
10. Standard/Admin model/parser/storage/vector/search/system/queue/audit/API key。
11. Embed/IM/API integrations（capability 开启时）。
12. 全页面 bright/dark/narrow/keyboard/Axe 与 Musuw 组件结构。
13. `STALE-001/002` 契约复核和必要最小修复。

## 23. 发布退出条件

- [ ] 所有 consumer 条目为 `PASS-CURRENT`，无可复现 P0/P1。
- [ ] Admin/运营条目为 `PASS-CURRENT` 或基于 capability 的 `N/A`，无可见死入口。
- [ ] `DEFERRED-HIDDEN` 通过 UI、deep-link、API 三层负向验证。
- [ ] Paddle Sandbox 完整 lifecycle 通过，Live 无测试写入。
- [ ] Migration/backup restore/R2/queue/quota/cross-tenant isolation 通过。
- [ ] 所有新可见 UI 通过亮暗、宽窄、键盘和 consumer Axe，无视觉岛。
- [ ] corrective delta 有一次边界明确的 adversarial review；修 blocker 后只复核修正范围。
- [ ] CI/build/staging immutable deploy/public smoke 全绿；production promotion 单独授权。

## 24. 执行日志

| 时间 | 执行者/任务 | 环境/SHA | 角色 | 条目 | 状态 | 证据 | 缺陷/处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-01 17:10–17:15 UTC | full-product acceptance | staging / `8e1c69c1` | Lite ordinary user | `AGENT-019` | PASS-CURRENT | create→reload→chat→reload；11,649 字符 prompt、3 tool calls、`ORBITAL SAGE 4826` 与引用保持 | 无 blocker；ACC Agent 待全局清理阶段统一处理 |
| 2026-09-01 17:15–17:35 UTC | full-product acceptance | isolated Standard / `81142df` candidate | Owner + cross-tenant Viewer | `AGENT-016`、`WIKI-012` | PARTIAL | org Viewer share、Viewer page read 200/write 403/absent 404、shared Agent 真实只读 tool call、全资源 cleanup 200 | 缺失 OpenRouter Secret 权限导致首次失败；按 Docker Secret 0444 契约临时注入后通过，随后删除并恢复健康；剩余角色/动作待跑 |
| 2026-09-01 17:35–17:45 UTC | full-product acceptance | staging Lite `8e1c69c1` + isolated Standard `81142df` candidate | Lite ordinary user + Standard Owner | `DS-001`、`DS-002`、`HIDE-002`–`HIDE-004` | PASS-CURRENT / PARTIAL | Standard Data Source/GitLab/IMA 可见；Lite 三项计数 0；consumer-surface test 2/2；截图 evidence | 修正文档中的陈旧 Standard-hide 契约；临时 KB/tenant 删除 200，账号匿名化，token=0 |
| 2026-09-01 17:45–17:50 UTC | full-product acceptance | local candidate / branch worktree | service/repository | `SHELL-011` | PASS-CONTRACT | deferred model race 红灯；atomic empty-title CAS；targeted Go service/repository green | 根因是旧空标题快照的无条件 update；候选 staging 浏览器竞态待跑 |
| 2026-09-01 18:20–18:26 UTC | full-product acceptance | isolated Standard / current branch | operations console | `OPS-008`、`OPS-009`、`OPS-014` | PARTIAL / PASS-CURRENT | real-data workflow、guarded run-now/CSRF、security/redaction、七页 Axe；Playwright 3/3；frontend 1017/1017 | 修复 Storage 横向滚动键盘可达性及 Runtime Queues 低对比文字/状态；测试改为从真实 runtime 选择可 run-now task，移除 archived fixture 假设 |
| 2026-09-02 02:00 UTC | product boundary correction | durable acceptance contract | ordinary SaaS + SystemAdmin | `AGENT-016`、`ORG-*`、`SEC-003`、`HIDE-013` | DEFERRED-HIDDEN / N/A | 普通产品确定为单账号、单用户、私有工作区；分享角色矩阵移出上线门 | 后续只验普通 UI 无入口、深链不可达、非必要分享 API 不开放；历史 Standard share 实验保留为上游兼容证据 |
| 2026-09-04 07:33–07:56 UTC | quota/UI release verification | CI + staging + storefront / `e960b6a` | release operator | `BILL-010`–`BILL-013`、`UI-015`、`ENV-001` | BILL/UI PASS-CONTRACT；ENV PASS-CURRENT | CI `33849276311`、staging-only release `33849915028`、storefront `33849914809`；远端 app/frontend running、restart 0；公开 health 200、staging noindex | 未把环境健康写成额度浏览器行为通过；production job 按契约跳过，生产仍为 `886bd74a` |
| 2026-09-04 | quota refresh correction | source + targeted tests / ancestor of `e960b6a` | Lite ordinary user | `BILL-010`–`BILL-013`、`UI-015` | PASS-CONTRACT | tenant-scoped entitlement store；stale-while-revalidate；模型完成、成功上传/导入、支付返回和菜单/设置路径后台刷新；菜单与设置消费同一快照 | 当前候选部署后的浏览器时序仍需按条目抽查 |
| 2026-09-04 | Paddle cancellation slice | Paddle Sandbox | traceable test account | `BILL-003`–`BILL-015` | PARTIAL | Sandbox Max 即时取消；签名通知一次 200；本地降级 Free/canceled、1 GiB、周期清空；迟到更新被忽略；OpenRouter 目标重算 | 平台管理 API key 过期，取消后的浏览器 entitlement JSON 未复读；Live 未动，不能宣称完整 lifecycle |
| 2026-09-04 09:50–10:15 UTC | account erasure + pricing copy | local + CI + staging / `0a5f3fe` + `1d215c3` | repository + application UI + release operator | `DATA-006`、`WEB-006`、`BILL-001`、`BILL-002`、`ENV-001` | 功能 PASS-CONTRACT；ENV PASS-CURRENT | Memory erasure repository test PASS；Plans/Checkout 直接对照官网活跃中英文文案 2/2；i18n 11/11；typecheck/build PASS；升级账本 1,601 路径、0 blocker，contract 6/6；CI `33860306655`、storefront `33860991086`、staging-only `33860991149` 成功 | 未扩充韩/俄翻译；生产仍为 `886bd74a`，没有推广；部署成功不冒充套餐/注销浏览器动作已验收 |
| 2026-09-04 | failed-document resource diagnosis | staging trace + source comparison | Lite ordinary user | `DOC-005`、`UI-015` | OBSERVATION / DEFERRED | 初始导入失败无自动应用重试；显式 reparse 产生 attempt 2 并完成；之后只观察到浏览器轮询旧 attempt spans，无 parser/TikHub/VLM/model 重复调用；timeline 与 fixed upstream 字节一致 | 卡片失败而旧 timeline 显示进行中属于陈旧/orphan trace 表现；用户明确暂不修改 |
