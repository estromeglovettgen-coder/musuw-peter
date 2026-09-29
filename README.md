# Musuw Peter

Peter 的独立定制工作区。开放完整智能体编辑、浏览器模型配置、技能和沙箱，保留日常操作界面，隐藏计费、知识市场和系统运维等公共平台入口。

## 本地启动

需要 Node.js 24、Go 1.26 和 C 编译工具链。首次安装前端依赖：

```sh
npm ci --prefix weknora/frontend
npm run dev
```

打开 <http://127.0.0.1:4217/>。本地使用原生注册/登录；以 `peter@localhost.test` 注册后重启可成为本地管理员，也可启动前设置 `PETER_ADMIN_EMAIL`。此管理员引导只适用于本机验收环境。

数据库、上传文件、加密密钥及日志保存在 `.runtime/peter/`，重启不丢失。`Ctrl+C` 停止这套环境。服务只监听本机，前端端口 4217、后端端口 18187；不连接原 Musuw 生产数据库或账户系统。SQLite 用于本地预览。根据最新指定，服务器版部署在腾讯云 `62.234.188.55`，使用独立 PostgreSQL、Redis、解析与检索服务；部署说明见 [服务器交付说明](docs/PETER_SERVER_DELIVERY.md)。

## 本次开放范围

- 客户：在「客户设置」维护客户类型模板，复用完整处理配置；新建时选择模板即可套用。状态与标签支持拖动排序。
- 智能体：普通问答/智能推理、类型预设、系统和高级提示词、模型及生成参数、知识库、检索、历史与记忆、联网、附件、问题推荐、工具、MCP、技能选择及原有分享/发布功能。按模式和已配置资源显示适用项。
- 模型：在「设置 → 模型管理」配置服务商、模型名、服务地址、API Key、请求头等；支持对话、Embedding、ReRank、视觉和语音模型。使用原有服务端加密和权限控制。
- 界面：继续保留知识库、对话和日常设置；隐藏计费、知识市场、组织管理、系统运维和底层引擎管理。智能体编辑范围与全局导航范围分开控制。

沙箱、外部 MCP、语音、视觉、文档解析等需要对应服务或模型。开放配置入口不代表这些外部服务已经配置完成。本地验收详情见 [验收记录](docs/PETER_LOCAL_ACCEPTANCE.md)。

## 客户工作区预览

在「工作区 → 客户」查看独立客户工作区（`http://127.0.0.1:4217/platform/customers`）；公共知识库与客户分别管理。每位客户拥有独立资料、Wiki、关系图和 AI 会话，销售助手仍使用同一套可编辑智能体配置。可运行 `npm run peter:seed-customers` 准备三位虚构客户；本地预览说明见 [第一版预览说明](docs/PETER_CUSTOMER_PREVIEW.md)；服务器真实链路与重启验收见 [服务器验收记录](docs/PETER_SERVER_ACCEPTANCE.md)。

## 验证

```sh
npm --prefix weknora/frontend test
npm run build
cd weknora && go test ./internal/application/service ./internal/handler ./internal/router ./internal/types ./internal/database
```

本地受控模型用于验证已保存的配置是否真正进入模型请求，不代表真实 AI 回答。在另一终端运行 `npm run peter:test-provider`，再运行 `npm run peter:acceptance`。验收脚本读取未跟踪的 `.runtime/peter/preview-account.json`，并要求已建立浏览器验收模型及智能体，具体步骤见验收记录。

## 来源

基于 Musuw `edae9fcbf95c196767688909ad09d7c21ea3ac67` 的完整受版本控制源码建立，原生应用来源与后续适配记录保留在 `third_party/weknora/`。保留原有许可证和第三方声明。原 Musuw 发布工作流在此仓库禁用；Peter 使用独立的部署文件 `deploy/peter/`，不调用原 Musuw 发布脚本。
