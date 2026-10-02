# Peter 独立服务器交付说明

入口：<https://62.234.188.55/>。本机验收凭据保存在忽略版本控制的
`.runtime/peter/deployment/account.json`，不得提交或粘贴到公开记录。
主链路与修复版整机重启验收已通过，范围与限制见 [服务器验收记录](PETER_SERVER_ACCEPTANCE.md)。
当前前端发布目录为 `20261002-04`，应用镜像为 `musuw-peter:20261002-04`。系统提示词的最新说明见 [系统提示词说明](PETER_SYSTEM_PROMPTS.md)。

2026-10-02 更新：新账号的快速问答、智能推理默认保留 20 轮、开启保留检索结果；新建自定义智能体使用相同默认值。后续可以修改，切换智能体类型不重置这两个选项，已保存的自定义配置仍优先使用。原生内置智能体从配置文件读取默认值，因此尚未自定义过的旧账号也会使用新的默认。新增账号在独立空间实际验证了两种内置模式的 20/开启，并成功保存为 12/关闭；没有切换 Peter 的浏览器账号。

内置默认通过 `deploy/peter/compose.yaml` 的只读挂载持久部署，服务器实际文件为 `/opt/musuw-peter/deploy/builtin_agents.yaml`，内容来自 `weknora/config/builtin_agents.yaml`。仓库 `deploy/peter/builtin_agents.yaml` 是指向该文件的符号链接，单独复制部署目录时需解引用或直接安装源文件。此次只重建应用容器以加载配置，没有编译或替换后端镜像。原配置和 Compose 保留为 `*.before-defaults-20261002.yaml`，回退默认时恢复这两份文件并重新创建应用容器即可；用户保存的配置不受文件默认影响。

原 FAQ 库 `12`（`67e754bc-e616-457e-bb1e-a03db987ed17`）已通过原生追加导入 50 条课程销售问答、100 个口语相似问法、9 个分类标签；导入进度 100%，50/50 完成。逐条复读确认问题、回答、相似问题、标签及启用状态与素材一致，续费、轮班和课程入口故障三个语义查询均将预期答案排在第一位。Peter 销售助手已将该 FAQ 加入原有销售案例库和销售方法库的参考范围，其他配置保持一致。素材和集中来源说明位于 `artifacts/peter-sales-faq-20261002/`；这些是按业务设定编写的销售模板，不能声称是 Peter 的历史原话或交易证明。

Peter 的文档页不再常驻显示七种扩展格式的解析引擎提示。当前后端未编入 Anydoc，不能仅靠配置启用这些格式；此次按用户授权隐藏提示，不扩大上传支持列表，上传校验和其他存储告警保留。

根目录 `npm run app:build`（含类型检查）及现有内置配置读取检查通过。前端入口 SHA-256 为 `d85bfde07dd48eaf3dc16b0ee83f323a98b212316424343aca68005263f69d00`，服务器与构建产物一致。发布保留前版静态资源、原登录目录和运行时配置；`/health` 返回正常，应用容器 healthy。原生验证记录位于 `.runtime/peter/deployment/{conversation-defaults-verification,sales-faq-progress,sales-faq-verified-entries,sales-faq-search-verification}-20261002.json`，构建记录为 `build-defaults-20261002.log`。前端可切回 `20261002-01` 或 `20261001-01`。

上一版前端为 `20261001-01`（FAQ 源码提交 `3ce30a9`）：知识库返回入口使用与文档库一致的左箭头及库名切换，删除无实际文件夹层级的“根目录”，新增问答与导入分别直达；标签、检索、导出和批量权限继续使用原生功能。库名切换只显示公共知识库，不混入客户。页面只显示用户填写的库说明，不再重复显示操作教学文案。

根目录 `npm run app:build` 通过，构建记录为 `.runtime/peter/deployment/build-faq-product-20261001.log`。FAQ 相关现有测试 5/5 通过，Vue 脚本/模板及 Less 编译通过。发布前保留上一版全部 387 个静态资源条目，原登录目录及运行时配置保留。本次前端发布没有重新构建或重启后端。发布后 `/health` 返回 `{"status":"ok"}`，应用容器为 `healthy`；公网知识库入口与 FAQ 所在的知识库 JS/CSS、主入口 JS 的 SHA-256 与本机构建一致。实际浏览器已打开用户的 FAQ 库，确认返回箭头、问答新增/导入入口、不含根目录，并点击返回公共知识库列表；画面保存于本机业务演示证据目录。

| 发布文件 | SHA-256 |
| --- | --- |
| `frontend/index.html` | `0b4008d48c81dbfc825f222ea47af2f118672b6dc5431a9277f30b605f51c6ea` |
| `frontend/assets/KnowledgeBase-Cn0-81oO.js` | `97f410b5f8f67997bf502b3aebe4d109f2a3af1d5ac7799ee292c661056d93f3` |
| `frontend/assets/KnowledgeBase-1XW92M_N.css` | `c3c5d950d0ff9a23df82cdac5b58767b40f470f154136dcfca224d8f4f60379e` |
| `frontend/assets/main-BTEJFTLu.js` | `78cecafb8cf75eae044e370d1b7033ac983b5db9af19337c63f633cb36572f1a` |

前一版 `20260930-12` 已接通直连 DeepSeek Flash 思考模式：开启发送 `thinking=enabled` 与 `reasoning_effort`，关闭发送 `thinking=disabled` 与 `reasoning_effort=none`；界面显示低、高、最高、关闭，首次开启默认高。首页欢迎语为 “I'm Peter”，隐藏首页 Musuw 标识与提示问题卡片。此前知识库与智能体入口的简化、截图指定的新建默认配置、弹窗层级修复和已恢复的配置入口均保留。历史业务链路证据见 [全链路验收清单](PETER_FULL_PATH_ACCEPTANCE.md)。

登录入口本次构建校验值保持为 `dcf912704bfa18dfe5fc50f6c07e275b418f0743aa6c6cacf7d63a11c231b0b4`。


## 2026-10-02 系统提示词更新

工作区新增「设置 → 系统提示词」，提供 32 项真实生成流程的中文默认规则，可单条保存、恢复默认。目录覆盖问答、摘要、图谱、Wiki、图片/扫描件、视频、表格和长期记忆；内置规则和工具说明的自然语言中文化，变量与输出协议不变。智能体自己填写的正文仍优先；知识库内容要求现在同时约束文件摘要和 Wiki 的输出范围。已有生成内容需要重新处理，不会因保存规则被自动覆盖。

PostgreSQL 已升级至迁移 111（非脏状态），SQLite 提供迁移 30。旧智能体正文按完整旧默认精确匹配迁移，更新 10 处默认字段；用户自己填写的正文没有按关键词替换。迁移前备份仅 `custom_agents` 数据到 `/var/lib/musuw-peter/custom-agents.before-chinese-prompts-20261002.sql`，权限 600。

| 发布内容 | 校验值 |
| --- | --- |
| 运行镜像 `musuw-peter:20261002-04` | `sha256:0adcbdcebb11b5f8f99d2ec204ccc52216f6b8da0b64903eac46cb4cb226e1c8` |
| 前端入口 | `3575ddf73fa834a1351d25230067f2533e21ad06a4424a10dfb3195fb16de2ea` |
| 原 Musuw 登录入口（保持原校验值） | `dcf912704bfa18dfe5fc50f6c07e275b418f0743aa6c6cacf7d63a11c231b0b4` |
| 源码归档 `source.tar.gz` | `9b3fdb2e21e5e284be901b8acff1bdb04bd4e4151bd32243424f68e0eaabda41` |
| 前端归档 `frontend.tar.gz` | `ef88837e80e540eb2bd8a4bd471b1ef2386ffa8d44cc21d845135e99d232a241` |

归档位于 `/opt/musuw-peter/releases/20261002-04/`。04 版补齐了检索图片显示和工具失败/长度截断重试提示的中文，前端与 03 版相同；03 版保留可回退。保留前版哈希资源和登录目录；可用旧镜像 `musuw-peter:20260930-03` 和前端 `20261002-02` 回退代码，此次可空列无需删除。若需恢复旧英文默认正文，可恢复上述定向备份；不要据此回退客户或知识库业务数据。

本次原地编译曾耗尽系统盘空间。已清理本次编译缓存和不再使用的历史构建，保留旧运行镜像与技能快照；磁盘释放后通过 Redis 官方工具修复未完整写入的 AOF 尾部 787,345 字节，原 Redis 目录在 `/var/lib/musuw-peter/redis.before-prompt-recovery-20261002` 保留。PostgreSQL、Neo4j 和客户上传目录没有清空。Docker 重启后网络隔离服务仍为 active；恢复原有 4GB+2GB 交换空间，已在最终发布后清理本次临时编译目录和 Go 缓存，磁盘剩余约 8.5GB。未来部署应传入外部已编译产物，避免在此容量主机重复缓存完整构建。

最终二进制在运行镜像的 Debian 环境内重新编译，已核对动态库兼容性。Compose 使用已有 `JIEBA_DICT_DIR` 指向运行镜像中随附的分词词典，避免 Go 编译来源路径影响启动。应用 healthy，八项服务运行、`/health` 正常，nginx、Docker、沙箱网络隔离及证书续期定时任务均恢复。

验证包含根目录 Peter 前端构建、15 项前端设置配置检查、全 Go 包编译、受影响后端包测试、权限与空间隔离，以及真实浏览器保存/刷新/恢复。全量 repository 测试的旧 SQLite 客户测试夹具仍缺 `customer_profile` 列；本次新增配置持久化与原子更新测试单独通过，不能称整个仓库测试全绿。构建和真实流程证据位于 `.runtime/peter/system-prompts/`，最终服务状态、主账号资源数及 04 版生成结果分别见 `server-final-status.log`、`release-verification.json` 和 `native-verification.json`。验收清理客户端已兼容 Wiki 删除接口正常返回的无正文 HTTP 204，临时资源随后逐项核对归零。

真实 DeepSeek 验证使用已有隔离账号，先验证目录保存、模板接口同步和跨空间隔离，再恢复摘要默认。资料同时含姓名、学校、工作、家庭和薪酬，只用知识库业务范围「只写姓名」控制输出，最终文件摘要为「周言」，Wiki 为姓名条目及姓名摘要；没有生成范围外事实。浏览器实际保存、全刷新、取消恢复、确认恢复和再次刷新通过，无页面 JS 异常。测试未切换 Peter 当前浏览器账号。临时知识库、原文件、Wiki 页面、模型和临时成员关系均清理，原配置恢复。

图文使用手册已放到桌面 `Peter产品使用手册_图文版_20261002.docx`：16 个模块、128 张编号界面图，目录支持跳转，覆盖当前 Peter 可操作的字段和开关。118 页以配图查阅为主，每项说明用途、填写方法和出现条件。全页按三段目视审查，修正页复核完成；凭据字段为空或占位，图片未外露密钥。终版 SHA-256 为 `a36672ea94aaf2aa0123ec28b7361c9a466c29a4f15123b8c99f2356705045a4`；版面及全页检查证据在 `.runtime/peter/manual/illustrated/final-qa.json`。

本轮检查另外记录两个既有边界作为后续事项：原生 API 允许提交当前空间不可访问的模型 ID，此时资料处理未及时标记失败；普通知识库删除任务不回收已生成的 Wiki 页面。当前浏览器下拉只显示可访问模型，正常 Peter 路径已验证；本次隔离验收的资源已额外用原生页面删除和删除任务清理，不应把这些历史问题算作已修复。


## 部署边界

- 指定主机：腾讯云北京，4 核、4GB 内存、40GB 系统盘；SSH 别名 `musuw-build-x64`。
- 旧网站、运行器和业务数据已经按用户明确要求删除，未备份；操作系统、SSH 和云管理组件保留。
- 此环境与原 Musuw 生产环境分离，使用独立数据库、账号、模型配置及文件目录。
- 登录页面复用 `auth/` 中 Musuw 原有黑白界面和动画；Peter 使用独立账号密码接口，不连接 Musuw 托管账号。未配置的 Google、验证码、自助注册和找回密码入口不显示。
- 使用原生智能体、Skills、沙箱和模型接口；隐藏消费计费/市场/无关管理导航，权限仍由服务端控制。

## 目录与服务

| 位置 | 用途 |
| --- | --- |
| `/opt/musuw-peter/current` | 当前前端及可追溯源码发布目录的符号链接 |
| `/opt/musuw-peter/releases/` | 版本化发布；不要覆盖已发布的源文件 |
| `/opt/musuw-peter/deploy/` | Compose、入口脚本和部署变量 |
| `/etc/musuw-peter/` | 应用、数据库、Redis 与搜索服务密钥，只允许管理账户访问 |
| `/var/lib/musuw-peter/` | 数据库、Redis、上传文件、预装技能、解析临时文件、检索模型及搜索配置 |
| `/etc/letsencrypt/live/peter-ip/` | 公网 IP 的 TLS 证书；由定时任务续期 |

Compose 包含 app、PostgreSQL、Redis、Embedding、ReRank、docreader、SearXNG 和 Neo4j；只有 app 的
`127.0.0.1:18187` 交给 nginx。数据库与搜索服务没有公开端口。进程使用 `unless-stopped`，
数据和密钥独立于容器持久化。SearXNG 限制为 350MB / 0.5 核；启动时由一次性初始化容器将
`deploy/peter/searxng-settings.yml` 复制到 `/var/lib/musuw-peter/searxng/`。搜索密钥仅保存在
`/etc/musuw-peter/searxng-secret`，由 Docker secret 注入，仓库配置不含固定密钥。Neo4j 仅在内部网络开放，其数据与密钥分别持久化在 `/var/lib/musuw-peter/neo4j` 与 `/etc/musuw-peter/neo4j-auth`；容量及实测见 [图谱部署记录](PETER_NEO4J_DEPLOYMENT.md)。

命名沙箱按需建立，限制 512MB / 1 核 / 128 进程，闲置 15 分钟回收。
临时工作目录不是长期文件存储；聊天中收集的输出文件通过原生附件接口持久保存。
不要删除 `weknora-skill/*` 镜像，它们是已安装 Skills 的持久快照。
宿主 Docker socket 仅提供给受信任的应用，执行用户脚本的容器没有宿主目录和 socket。

`peter-sandbox-network.service` 在 Docker 启动后恢复网络隔离规则：沙箱可以请求公网，
不能连接宿主、内网和云元数据。应用依赖使用独立网络。

## 运行与检查

```sh
ssh musuw-build-x64
cd /opt/musuw-peter/deploy
sudo docker compose ps
sudo docker compose logs --tail=100 app
sudo docker compose ps searxng
sudo systemctl status nginx docker peter-sandbox-network.service
sudo systemctl list-timers peter-cert-renew.timer
curl -fsS https://62.234.188.55/health
```

应用恢复使用 `sudo docker compose up -d app`；依赖恢复使用 `sudo docker compose up -d`。
搜索服务单独恢复使用 `sudo docker compose up -d searxng`，不会重启 app。app 的
`/etc/musuw-peter/app.env` 需保留 `SSRF_WHITELIST_EXTRA=embeddings,reranker,searxng`；
变更后运行 `sudo docker compose up -d --no-deps --force-recreate app` 才会进入运行环境。
搜索配置只启用 Bing，并直连 `https://cn.bing.com`：本机出口访问 `www.bing.com` 会重定向，
而搜索引擎请求不跟随重定向。检查搜索时先用保存的 Web Search Provider 测试，再用临时智能体
实际调用 `web_search` 核对结果标题与网址；只看到容器健康或 HTTP 200 不代表搜索可用。
若提供商无结果或目标网站阻断网页抓取，应明确显示失败，修复连通性前不要把网页检索说成已验收。
不要使用 `down -v`，也不要删除持久目录。服务状态正常后，还需真实登录、打开客户、
查询资料并继续一次旧技能会话；HTTP 200 不能证明业务链路恢复。

公网 IP 使用短期证书，`peter-cert-renew.timer` 每日两次检查并在续期后重载 nginx；
80 端口上的 ACME 路径需要保持可达。续期演练已通过，最终验收仍复核定时任务状态。

## 发布与回退

1. 先通过相关测试和前端类型检查/构建。必须在本仓库**根目录**执行 `npm run app:build`：该命令同时设置 `VITE_WORKSPACE_PROFILE=peter` 与 `VITE_AUTH_MODE=native`。直接在 `weknora/frontend` 执行 `npm run build` 会产出通用界面，不得发布。使用本仓库 `deploy/peter/` 的构建文件，
   不调用历史 Musuw 发布脚本。保留当前发布目录和应用镜像。
2. `npm run app:build` 同时构建原 Musuw 登录页和工作区，登录静态文件位于 `frontend/auth/`；nginx 配置须同步使用本仓库 Peter 版本。将前端上传到新的发布目录；把上一版 `assets/` 中的哈希文件按“不覆盖同名文件”
   合并到新版，保证更新前已经打开的页面仍能按需加载旧脚本。新版入口仍引用新版哈希。
3. 生成新的应用镜像，修改 Peter 的 `PETER_APP_IMAGE`，执行 Compose 的 `up -d app`。
   原生迁移成功、健康检查和最小业务链路通过后，再切换 `current` 到匹配的前端发布目录。
   本次在系统包索引不可用时，使用 `deploy/peter/Dockerfile.incremental` 以已验证的 `musuw-peter-build:20260929-05` 为编译基底，仍重新编译完整应用和沙箱集成测试二进制，再由 `Dockerfile.release` 叠加到原生运行镜像；未改动系统包。
   若只有兼容的前端更新，保留应用镜像与服务，不执行此后端步骤；检查新目录后仅切换 `current` 并重载 nginx。
4. 复核浏览器冷启动、已打开页面导航、流式回答、客户和知识库、下载及新旧会话恢复。
5. 若仅为兼容的代码/界面更新，可回退应用镜像及 `current` 链接；涉及破坏性数据库迁移时，
   必须使用对应的数据恢复方案，不能假设旧二进制能读取新结构。当前可回退的组合为
   `musuw-peter:20260930-03` 与 `/opt/musuw-peter/releases/20260930-12`；本次 FAQ 发布回退只需恢复此前端链接，不回退后端或业务数据。回退后仍须核对登录、客户资料、技能会话和产物下载。

旧业务“不要备份”的授权只用于本次明确的旧数据清理。未来真实客户数据应另行配置备份；
目前没有离机备份目的地，容器持久化和发布回退不能替代灾难恢复。

## 模型与容量边界

- DeepSeek 提供当前对话、智能推理、Wiki、实体关系提取和已验证的图像理解；密钥通过服务端原生加密存储。
- 本机运行 512 维中文 Embedding 和多语言 ReRank，为资料检索提供实际服务。
- ASR 已配置独立的 `openai/whisper-large-v3` 模型；新建 Peter 知识库和客户默认启用图像理解、音频转写及 Neo4j 实体图谱，日常创建界面隐藏服务内部配置。模型状态和实际解析验收须以 [全链路验收清单](PETER_FULL_PATH_ACCEPTANCE.md) 的最新结果为准。
- MCP、IM、网页嵌入等保留原生可配置入口；外部系统必须具备自己的凭据和连通条件。
- 4GB 主机配置了资源限额与交换空间，已通过少量客户/文档和顺序模型操作验收，
  不能据此承诺大量同时解析或不限量沙箱。原地构建会暂时争用主机资源，
  后续正常运营应在维护时段构建或将已构建镜像传入。

业务演示已按课程销售重做：10 位客户各 5 页，共 50 张销售聊天图，
其中 8 位在聊天中确认付款、2 位尚待购买决定；重点是产品价值、真实异议、
主动成交、付款与开课交接。销售案例库和客户库分别经过原生图像理解及完整后处理，
另有简版销售方法文件与孙凯浏览器追加的购买跟进图；本轮 12 个库共 102 条资料全部完成，
实体图谱覆盖全部资料。编写来源集中保存于素材清单，不使用验证码、测试暗号，
不把准备笔记、预写画像或预写回答冒充原生模型结果。当前素材与处理证据见
[销售业务演示素材](../artifacts/peter-sales-demo-20261001/README.md) 和
[本轮销售链路验收记录](PETER_SALES_DEMO_ACCEPTANCE.md)。

本次只更换业务资料、原生生成指令和 Peter 销售助手配置，前端版本和应用镜像未变，
不重启服务。旧辅导方向素材、对应 Wiki、空文件夹和生成会话已定向清理；
用户自建的 andy、FAQ、智能体、主账号、模型、沙箱和技能配置保留。
旧种子清单的 11 个库、31 条会话和 4 个临时智能体已在上轮清理；既往功能验收作为历史保留，
不能替代本轮新资料的实际下游处理与销售问答证据。
