# Musuw Peter

Peter 的独立定制工作区。第一阶段在本地开放完整智能体编辑和浏览器模型配置，保留日常操作界面，隐藏计费、知识市场和系统运维等公共平台入口。

## 本地启动

需要 Node.js 24、Go 1.26 和 C 编译工具链。首次安装前端依赖：

```sh
npm ci --prefix weknora/frontend
npm run dev
```

打开 <http://127.0.0.1:4217/>。本地使用原生注册/登录；以 `peter@localhost.test` 注册后重启可成为本地管理员，也可启动前设置 `PETER_ADMIN_EMAIL`。此管理员引导只适用于本机验收环境。

数据库、上传文件、加密密钥及日志保存在 `.runtime/peter/`，重启不丢失。`Ctrl+C` 停止这套环境。服务只监听本机，前端端口 4217、后端端口 18187；不连接原 Musuw 生产数据库或账户系统。SQLite 用于本地验收，阿里云服务器和数据库部署留到后续阶段。

## 本次开放范围

- 智能体：普通问答/智能推理、类型预设、系统和高级提示词、模型及生成参数、知识库、检索、历史与记忆、联网、附件、问题推荐、工具、MCP、技能选择及原有分享/发布功能。按模式和已配置资源显示适用项。
- 模型：在「设置 → 模型管理」配置服务商、模型名、服务地址、API Key、请求头等；支持对话、Embedding、ReRank、视觉和语音模型。使用原有服务端加密和权限控制。
- 界面：继续保留知识库、对话和日常设置；隐藏计费、知识市场、组织管理、系统运维和底层引擎管理。智能体编辑范围与全局导航范围分开控制。

沙箱、外部 MCP、语音、视觉、文档解析等需要对应服务或模型。开放配置入口不代表这些外部服务已经配置完成。本地验收详情见 [验收记录](docs/PETER_LOCAL_ACCEPTANCE.md)。

## 验证

```sh
npm --prefix weknora/frontend test
npm run build
cd weknora && go test ./internal/application/service ./internal/handler ./internal/router ./internal/types ./internal/database
```

本地受控模型用于验证已保存的配置是否真正进入模型请求，不代表真实 AI 回答。在另一终端运行 `npm run peter:test-provider`，再运行 `npm run peter:acceptance`。验收脚本读取未跟踪的 `.runtime/peter/preview-account.json`，并要求已建立浏览器验收模型及智能体，具体步骤见验收记录。

## 来源

基于 Musuw `edae9fcbf95c196767688909ad09d7c21ea3ac67` 的完整受版本控制源码建立，原生应用来源与后续适配记录保留在 `third_party/weknora/`。保留原有许可证和第三方声明。原 Musuw 发布工作流在此仓库禁用；本阶段不部署服务器。
