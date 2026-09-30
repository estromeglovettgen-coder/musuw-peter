# Peter 独立服务器交付说明

入口：<https://62.234.188.55/>。本机验收凭据保存在忽略版本控制的
`.runtime/peter/deployment/account.json`，不得提交或粘贴到公开记录。
主链路与修复版整机重启验收已通过，范围与限制见 [服务器验收记录](PETER_SERVER_ACCEPTANCE.md)。
当前前端发布目录为 `20260930-01`，应用镜像为 `musuw-peter:20260929-05`（healthy）。工作区入口 `frontend/index.html` 的 SHA-256 为 `d18ba64496f8e66b9131bda639b5cbe84f268346e0787e777ff2bc23c3bcece8`，原 Musuw 登录入口 `frontend/auth/index.html` 为 `dcf912704bfa18dfe5fc50f6c07e275b418f0743aa6c6cacf7d63a11c231b0b4`；服务器当前文件已核对。回退对象为前端目录 `20260929-14` 和应用镜像 `musuw-peter:20260929-04`，两者均保留在服务器。最终日常链路验收见 [全链路验收清单](PETER_FULL_PATH_ACCEPTANCE.md)。

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

Compose 包含 app、PostgreSQL、Redis、Embedding、ReRank、docreader 和 SearXNG；只有 app 的
`127.0.0.1:18187` 交给 nginx。数据库与搜索服务没有公开端口。进程使用 `unless-stopped`，
数据和密钥独立于容器持久化。SearXNG 限制为 350MB / 0.5 核；启动时由一次性初始化容器将
`deploy/peter/searxng-settings.yml` 复制到 `/var/lib/musuw-peter/searxng/`。搜索密钥仅保存在
`/etc/musuw-peter/searxng-secret`，由 Docker secret 注入，仓库配置不含固定密钥。

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
4. 复核浏览器冷启动、已打开页面导航、流式回答、客户和知识库、下载及新旧会话恢复。
5. 若仅为兼容的代码/界面更新，可回退应用镜像及 `current` 链接；涉及破坏性数据库迁移时，
   必须使用对应的数据恢复方案，不能假设旧二进制能读取新结构。当前可回退的组合为
   `musuw-peter:20260929-04` 与 `/opt/musuw-peter/releases/20260929-14`；回退后仍须核对登录、客户资料、技能会话和产物下载。

旧业务“不要备份”的授权只用于本次明确的旧数据清理。未来真实客户数据应另行配置备份；
目前没有离机备份目的地，容器持久化和发布回退不能替代灾难恢复。

## 模型与容量边界

- DeepSeek 提供当前对话、智能推理、Wiki 和已验证的图像理解；密钥通过服务端原生加密存储。
- 本机运行 512 维中文 Embedding 和多语言 ReRank，为资料检索提供实际服务。
- MD/TXT/PDF/图片已经走过实际解析链路；语音识别需要单独的 ASR 服务，当前没有配置。
- MCP、IM、网页嵌入等保留原生可配置入口；外部系统必须具备自己的凭据和连通条件。
- 4GB 主机配置了资源限额与交换空间，已通过少量客户/文档和顺序模型操作验收，
  不能据此承诺大量同时解析或不限量沙箱。原地构建会暂时争用主机资源，
  后续正常运营应在维护时段构建或将已构建镜像传入。

服务器测试只使用标明“验收/演示”的虚构客户和素材；交付前保留一套便于复验的示例，
临时隔离账号、智能体副本、删除验收库及构建缓存已经清理。失败/恢复验收对话保留便于追溯，可在界面删除。
