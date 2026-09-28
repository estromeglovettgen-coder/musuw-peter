## Why

Musuw 的公开认证壳仍是居中卡片，与用户已认可并自有的 TikHub 分栏认证界面不一致。现在需要以已下载的 TikHub 生产前端包为视觉与结构依据，在不复制其认证后端的前提下，让 Musuw 的登录、注册、验证码和密码恢复状态共享同一套成熟界面。

## What Changes

- 将公开认证页改为 TikHub 同款的左右 50/50 分栏结构、Geist 字体、表单密度、响应式折叠和黑白主色。
- 左侧使用 Musuw 文案“创建你的AI第二大脑”，固定前导语“把资料转化为”，并依次聚焦“会 / 思考的 / 知识资产”三个词组。
- 左侧保留四个角色的原始彩色外观，并使用黑底、高对比度、跟随指针的单色流体作为背景动效。
- 右侧保留密码登录，并把 Google 与“邮箱验证码登录”放到虚线分隔线后的替代登录区。
- 登录、注册、忘记密码、重置密码、邮件已发送、成功与加载状态复用同一认证壳；不引入 TikHub 客服组件。
- 保留现有 Supabase、Google PKCE、邮箱 OTP、WeKnora OIDC、套餐续接、错误收敛和法务链接契约。

## Capabilities

### New Capabilities

- `split-auth-experience`: TikHub 参考结构下的 Musuw 公共认证视觉、状态和入口排序契约。

### Modified Capabilities

无。

## Impact

主要修改 `auth/src/AuthApp.tsx`、`auth/src/AuthShowcase.tsx`、`auth/src/TrueFocus.tsx`、`auth/src/LiquidEther.tsx`、`auth/src/styles.css` 与对应测试；增加一个来自用户自有 TikHub 包的 Geist 字体资产，并复用 Motion 与 Three 实现左侧动效。不会修改 `auth/src/runtime.ts`、`auth/src/supabase.ts`、WeKnora 后端认证路由或数据库。
