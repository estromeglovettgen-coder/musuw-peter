# 火种展示面运行与运维

展示面复用 `tools/fire-showcase` 的上传、参考要素、提示词、供应商适配和持久任务。原生 Go 负责登录、账号状态、图片授权及图片额度；Python 侧车只在 Docker 网络内提供既有工作台和生成队列。普通账号固定使用既有默认线路；供应商凭据只在服务端读取。

## 当前线上版本

| 项目 | 实际配置 |
| --- | --- |
| 北京侧车镜像 | `musuw-peter-showcase:20261019-04`（Runtime04，保留 Runtime02 国内节点配置） |
| 原生后端镜像 | `musuw-peter:showcase-20261019-01` |
| 前端发布目录 | `/opt/musuw-peter/releases/20261019-fire-19`，由 `/opt/musuw-peter/current` 指向 |
| 侧车 Compose 覆盖文件 | `/opt/musuw-peter/deploy/showcase.compose.yaml`，与同目录 `compose.yaml` 一起使用 |
| 侧车私有环境文件 | `/etc/musuw-peter/showcase.env`，权限 `0600` |
| 持久数据 | `/var/lib/musuw-peter/showcase` → `/data/showcase` |
| 运行与网络 | 服务 `fire-showcase`，UID/GID `10001:10001`，仅私网 `5179`，无宿主端口发布 |
| 资源与文件系统 | 内存 `512m`、CPU `1`、PID `64`；根文件系统只读，`/tmp` 为 `256m` tmpfs |

## 容器与持久目录

构建上下文必须是 `tools/fire-showcase`，这样该目录的 `.dockerignore` 才会排除密钥、测试、历史和私有数据。Dockerfile 基于北京机器已有的 `musuw-peter:thin-common-20261019-capacity`，直接复用 Python 和 curl，不安装额外依赖。它显式覆盖基础镜像的应用入口，以 UID/GID `10001:10001` 运行，只启动 `fire_server.py`。

在正式发布步骤中构建指定版本，例如：

```sh
sudo docker build --pull=false --network=none \
  -t musuw-peter-showcase:RELEASE tools/fire-showcase
```

把 `RELEASE` 换成实际发布编号。构建时不传入任何供应商密钥或桥接密钥。`site/` 约 27MB，镜像复用已有基础层；不要为节省空间删除业务卷、用户图片、旧任务或已安装技能镜像。

线上持久目录为 `/var/lib/musuw-peter/showcase`，挂载到 `/data/showcase`。以下创建命令仅用于新环境初始化；现有目录已经承载任务和图片：

```sh
sudo install -d -o 10001 -g 10001 -m 0700 /var/lib/musuw-peter/showcase
```

已有目录需核对属主后迁移权限，不能用空目录覆盖。每个账号保存于 `owners/{tenant_id}-{user_uuid}/`，其中 SQLite、素材原字节和供应商响应日志共同构成恢复依据。源项目的 `.env`、`private-data/` 和 `runs/` 不导入此目录。

## 私有环境变量

供应商密钥必须私下复用来源项目已经验证的凭据，通过主机受限 env 文件注入。不要把 `.env` 加进仓库、镜像、构建参数、发布日志或命令行；不要运行会完整输出容器环境或展开后的 Compose 配置的诊断命令。

线上侧车统一读取 `/etc/musuw-peter/showcase.env`，权限 `0600`，其中私下保存来源供应商凭据、桥接 token 和国内节点配置，不拆分额外的桥接／供应商 env 文件。原生 app 仍读取既有 `/etc/musuw-peter/app.env`，其中保存启用标记、侧车 URL 与相同的桥接 token；供应商凭据只注入侧车。Go 与侧车使用的桥接值必须一致，至少 32 字符。

| 变量 | 所在进程 | 配置 |
| --- | --- | --- |
| `PETER_TOKEN_BILLING_ENABLED` | 原生 app | 保持现有 `true`，启用原生套餐账本 |
| `FIRE_SHOWCASE_ENABLED` | 原生 app | `true` |
| `FIRE_SHOWCASE_URL` | 原生 app | `http://fire-showcase:5179` |
| `FIRE_SHOWCASE_BRIDGE_TOKEN` | app、侧车 | 私有 env 文件中的相同随机值，至少 32 字符 |
| `FIRE_SHOWCASE_DATA_DIR` | 侧车 | `/data/showcase` |
| `FIRE_SHOWCASE_BILLING_URL` | 侧车 | `http://app:8080/internal/fire-showcase/images` |
| `FIRE_SHOWCASE_QUICKROUTER_BASE_URL` | 侧车，可选 | 默认 `https://api.quickrouter.ai`；北京显式使用官方国内节点 `https://api.quickrouter.us` |
| `QUICKROUTER_API_KEY` | 侧车 | 私下复用来源默认线路的原凭据 |
| `MODELFLARE_API_KEY` | 侧车，可选 | 仅保留原备用适配器凭据；普通生成始终固定现有默认线路 |

不需要修改来源项目的 `.env`。`MODELFLARE_IMAGE_TRANSPORT` 保留原实现的默认值；QuickRouter 原图 multipart 传输由原适配器固定，不依赖此旧线路设置。

QuickRouter 基址只接受上述两个完整 HTTPS origin，不接受账号信息、端口、路径、查询或其他域名，启动时固定；浏览器和任务不能覆盖。北京使用 `.us` 的依据见[官方国内节点说明](https://doc.quickrouter.ai/docs/proxy-endpoint.html)。此配置保留原凭据、模型和 multipart／接口路径；原始本地入口与适配器默认 `.ai` 不变。切换节点不能重发已有 `unknown` 任务。

## 线上 Compose

主配置 `/opt/musuw-peter/deploy/compose.yaml` 保留既有 app 和依赖服务；侧车定义独立保存在同目录 `showcase.compose.yaml`。运行、检查和更新侧车均须带上两个文件。原生 app 的展示面变量已经写入其既有私有 `app.env`，不替换该文件或原有环境配置。

侧车配置如下；`FIRE_SHOWCASE_QUICKROUTER_BASE_URL=https://api.quickrouter.us` 保存于私有 `showcase.env`，不是浏览器配置：

```yaml
services:
  fire-showcase:
    image: musuw-peter-showcase:20261019-04
    restart: unless-stopped
    init: true
    user: '10001:10001'
    env_file:
      - /etc/musuw-peter/showcase.env
    environment:
      FIRE_SHOWCASE_DATA_DIR: /data/showcase
      FIRE_SHOWCASE_BILLING_URL: http://app:8080/internal/fire-showcase/images
    expose: ['5179']
    # 不配置 ports；5179 不映射宿主或公网。
    volumes:
      - /var/lib/musuw-peter/showcase:/data/showcase
    read_only: true
    tmpfs:
      - /tmp:rw,nosuid,nodev,size=256m,mode=1777
    cap_drop: [ALL]
    security_opt: ['no-new-privileges:true']
    mem_limit: 512m
    cpus: 1
    pids_limit: 64
    depends_on:
      app: {condition: service_healthy}
    logging:
      driver: json-file
      options: {max-size: 10m, max-file: '3'}
```

服务使用现有 `musuw-peter-services` 默认网络；该网络允许供应商出站。无需安装新数据库、公开新端口或挂载 Docker socket。每个账号复用原 Worker，但只有一个轮转调度线程；512MB 内存与 256MB 临时空间限制适用于整个侧车，大原图仍需按实际链路核对资源占用。

## nginx 路径

所有公网请求都经过原生 Go。线上已为静态 `/tools/fire-showcase/` 配置代理，`/api/` 规则覆盖原生接口和受保护图片。不能将私有目录设为 nginx `alias`，也不能把 `/api/assets` 直接指向 Python。

维护 HTTPS server 时需保留以下路径关系，以及原有登录、课程、API 和安全头：

```nginx
location = /tools/fire-showcase {
    return 308 /tools/fire-showcase/;
}

location ^~ /tools/fire-showcase/ {
    proxy_pass http://127.0.0.1:18187;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}

location ^~ /api/v1/fire-showcase/ {
    proxy_pass http://127.0.0.1:18187;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_request_buffering off;
    proxy_buffering off;
    # 保留来源接口无应用上传上限的行为，仅作用于展示面。
    client_max_body_size 0;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}

# Go 的记账/账号核验入口只由侧车通过 Docker 网络请求。
location ^~ /internal/fire-showcase/ {
    return 404;
}
```

路径契约：

| 浏览器路径 | 用途 |
| --- | --- |
| `/tools/fire-showcase/` | 既有工作台静态页面，经 Go 转发 |
| `/api/v1/fire-showcase/bootstrap` | 原生登录后的启动信息与图片会话 cookie |
| `/api/v1/fire-showcase/api/...` | 原生认证后转发既有 `/api/config`、素材、提示词和持久任务接口 |
| `/api/fire-showcase-assets/{user_uuid}/{asset_id}/content` | 原生身份校验后的私有图片读取和下载 |

浏览器不能提供可信 owner 身份；Go 验证登录与账号状态后覆盖 `X-Fire-User-ID`、`X-Fire-Tenant-ID` 和桥接 token。图片认证 cookie 只用于限定的图片 GET/HEAD 路径，图片响应不缓存；它不能用于发起生成或修改任务。

## 健康、记账与恢复

Dockerfile 自带健康检查，向侧车回环 `/__local/health` 发送私有桥接头。检查命令在 Python 内从环境读取密钥，不把密钥展开到进程参数。成功健康响应只证明进程可用，不能替代原生登录、私有图片授权、额度或真实生成验收。

只读检查可使用：

```sh
cd /opt/musuw-peter/deploy
sudo docker compose -f compose.yaml -f showcase.compose.yaml ps app fire-showcase
sudo docker compose -f compose.yaml -f showcase.compose.yaml logs --tail=100 fire-showcase
sudo docker inspect --format '{{.State.Health.Status}}' musuw-peter-fire-showcase-1
df -h / /var/lib/musuw-peter/showcase
```

真实供应商提交前，侧车向私有 `FIRE_SHOWCASE_BILLING_URL` 的 `/reserve` 预占一张，任务 UUID 幂等；保存可读取的图片后 `/settle` 为 `succeeded`。明确未提交或拒绝释放；未知响应及本地结果待恢复保留预占。HTTP 402 形成有明确提示的失败任务，追加额度后由用户显式重试并获得新任务 UUID。

重启扫描原 SQLite 队列和响应日志。已经进入供应商提交但结果未知的任务隔离，不能自动重发；已有成功响应日志只恢复本地保存并补记账。回调失败由持久 outbox 重试，同一任务不会因此再次生成。完全未到达原生服务的预占请求可能留下保守的本地结算重试，不应通过重新生成“修复”。未知账目由原生管理员显式核对处理。

调度线程在启动后及每五分钟核验原生账号。只有 `/owner` 返回 410 才删除该账号严格匹配的私有目录，并等待已有 HTTP 读写完成；账号暂停、套餐到期、403、服务错误和网络故障均不能触发图片删除。

备份与恢复必须同时保留原生数据库和侧车私有目录，包括响应日志；不能只备份导出的图片。正式备份应短暂停止生成写入或使用一致性快照。

## 国内节点与回滚

北京对 `.ai` 的本地 DNS 解析与公共 HTTPS DNS 不一致，原任务记录上传 0 字节、无首响应；不能将其当作已收到供应商生成结果。Runtime02 按官方说明显式使用国内 `.us` 节点，保留原 key、`gpt-image-2.5-sunburst` 模型和原图 multipart。侧车健康、授权只读 models 查询和随后普通账号的真实图片生成已通过。

Runtime02 发布前的侧车配置快照位于 `/opt/musuw-peter/deliveries/showcase-20261019-02/`，包含受限权限的 `showcase.env` 和 `showcase.compose.yaml`。仅回退侧车时恢复经核对的镜像与这两个配置，使用双 Compose 文件仅重建 `fire-showcase`，保留原生后端、前端及所有业务数据。

上一侧车镜像 `musuw-peter-showcase:20261019-01` 尚不支持此节点变量，会继续使用 `.ai`。回退到该镜像不能作为北京连通性修复；应暂停生成入口，直到可达配置恢复。需要整体回退时，可暂时关闭 app 私有环境中的 `FIRE_SHOWCASE_ENABLED`，并按发布前记录恢复应用镜像与前端链接；不得 Down 数据卷、回退增量迁移、覆盖用户后续数据库或把旧 `unknown` 改回排队。

节点配置由进程启动时固定，改 env 文件后需要重建侧车才生效。切换、重启或回滚都不能自动重试旧 `unknown`；额度释放或结算只能按原生账本的显式核实流程处理。

## 本地回归入口与验收状态

原生浏览器适配测试现为 `tools/fire-showcase/test_fire_host.mjs`，不再使用旧 `.js` 文件名。使用既有 DOM 测试依赖时，通过 `ALPHAI_TEST_DOM_MODULE` 指向 `linkedom`，再执行：

```sh
node --test tools/fire-showcase/test_fire_host.mjs
```

Python 回归入口为在 `tools/fire-showcase` 目录运行 `python3 -m unittest discover -v`。测试供应商均为 loopback fixture，不应注入真实供应商凭据。

Runtime04 已上线健康；临时普通账号通过原网页上传四张原图，已实际成功生成两张。第二张明确穿搭描述后符合参考组合，可通过原生私有链接预览和下载。两张共消耗 2 张图片额度，聊天用量未变；跨账号和匿名读取均拒绝，额度耗尽拦截与管理员追加恢复通过。完整证据及已知限制见 [QA 验收](FIRE_SHOWCASE_QA.md)。
