# 火种工作台 UI 组件

工作台保留原生 HTML / JavaScript 业务流程。`site/components.css` 定义设计变量与基础组件，`site/workbench.css` 负责工作台布局、动态参考卡片、结果、灯箱与遮罩等实际界面。`site/component-library.html` 是可交互的本地组件展示页，可通过工作台设置打开。

## 加载顺序

```html
<link rel="stylesheet" href="./components.css">
<link rel="stylesheet" href="./workbench.css">
<script src="./fire-components.js" defer></script>
```

工作台使用 `body.fire-workbench`；展示页使用 `body.fire-library`。工作台不加载旧版 `styles.css`，避免全局浅色背景和边框规则污染新界面。组件样式不会主动切换其他页面主题；`--ink` / `--muted` / `--surface` 等兼容变量在工作台范围内映射到火种变量。

## 基础组件

| 类名 / 属性 | 用途 |
| --- | --- |
| `.fire-button` | 普通按钮或链接，默认次要操作 |
| `data-variant="primary/ghost/danger"` | 主操作、轻操作、危险操作 |
| `data-size="sm"` | 32px 小按钮 |
| `.fire-icon-button` | 纯图标按钮，必须加 `aria-label` |
| `.fire-panel` / `-header` / `-title` / `-body` | 面板容器、标题和内容 |
| `.fire-field` / `.fire-help` / `.fire-error` | 表单控件与帮助、错误信息 |
| `.fire-chip` + `aria-pressed` | 可切换的参考要素 |
| `.fire-choice-group` / `.fire-choice` | 比例平铺选项与模型卡片；单选语义和键盘切换 |
| `data-choice-variant="ratio/model"` | 比例图形或模型说明的布局 |
| `.fire-badge` + `data-tone` | 中性、accent、success、warning、error 状态 |
| `.fire-nav` | 页面内切换导航，语义由使用场景决定 |
| `.fire-empty-state` | 空内容与下一步操作 |
| `dialog.fire-dialog` | 原生模态弹窗 |
| `.fire-divider` / `.fire-sr-only` | 分隔和仅辅助技术可读文本 |

动态参考图仍由既有工作流输出 `.reference-role-chip`；工作台把它们映射到相同的选中/占用/冲突视觉，角色分配规则不放入通用组件层。

所有交互元素都有 `:focus-visible`；禁用用真实 `disabled`，不以颜色模拟禁用。图片预览使用 `object-fit: contain`，缩略图允许 `cover`。工作台通过独立侧栏导航切换页面，内容区按可用宽度重新排列。

## 共享 JavaScript

```js
FireUI.icon("download-simple", { size: 20 }); // 返回可信 SVG 字符串
FireUI.hydrate(container); // 渲染图标，并初始化/刷新平铺选择器
FireUI.enhanceChoices(container); // 只初始化/刷新平铺选择器
FireUI.setBusy(button, true, "处理中");
FireUI.setBusy(button, false); // 恢复之前的 disabled 与文案
FireUI.toast("已保存", { tone: "success" });
FireUI.openDialog(dialogElement);
FireUI.closeDialog(dialogElement);
```

动态忙碌按钮可将标签包在 `[data-busy-label]` 内，图标和事件不会被替换。`setBusy()` 重复开始不会覆盖原始状态，结束后保留原先就禁用的按钮。`[data-dialog-close]` 自动关闭其所在 dialog；原生 Esc、焦点约束和关闭后恢复焦点由浏览器提供。

## 无下拉选择器

比例和模型使用相同的共享实现，原有 select 仍是业务值的唯一来源，不另存一份选择状态：

```html
<h3 id="ratio-label">画面比例</h3>
<select id="ratio" hidden tabindex="-1" aria-hidden="true">
  <option value="竖版 3:4">竖版 3:4</option>
  <option value="方图 1:1">方图 1:1</option>
</select>
<div data-fire-choices-for="ratio" data-choice-variant="ratio"
     aria-labelledby="ratio-label"></div>
```

`FireUI.enhanceChoices(document)` 会创建 `radiogroup` / `radio` 按钮、隐藏底层 select 并移出焦点顺序。鼠标、触屏、空格或 Enter 可选择，方向键以及 Home / End 可切换并聚焦可用项；仅当前选项参加 Tab 顺序。点击后直接更改原 select 的 `value`，仅在值改变时发送一次冒泡 `change`，因此直接复用原有业务监听器。

`data-choice-variant="model"` 使用卡片布局，option 上可添加 `data-description`。比例图形读取 value 内的数字比例（如 `竖版 3:4`）；所有标签和说明通过 `textContent` 写入。原 select 的 `change`、options 增删/替换、标签以及 disabled/hidden 变化会自动刷新；同值选项复用按钮，保持既有焦点。纯代码修改 `select.value` 后，调用 `enhanceChoices()` / `hydrate()` 或发送 `change`。重复调用安全，不会重复绑定事件。

仅适用于单选 select。禁用选项和禁用 optgroup 不可点击，整个 select 禁用时全部按钮退出焦点顺序。空选项列表显示为空，不自行选择或发起请求。

静态图标写法：

```html
<button class="fire-icon-button" aria-label="设置">
  <span data-fire-icon="gear" aria-hidden="true"></span>
</button>
```

图标来自 [Phosphor Icons 官方仓库](https://github.com/phosphor-icons/core)，27 个常用 regular 字形编入 `fire-components.js`，文件头保留完整 MIT 授权。没有运行时 CDN、远程字体或在线图标请求。

## 演示页行为

- 按钮：可触发通知、体验 busy、禁用状态不可点击。
- 选择：比例图形按钮、模型卡片、不可用选项与键盘切换，直接驱动底层 select。
- 表单：保留文本输入、输入后清除必填错误。
- 要素：切换 `aria-pressed` 并同步已选文字。
- 导航：点击、左右方向键、Home / End 与 roving tabindex。
- 上传：选择本地图片后仅用 object URL 预览，不发送请求。
- 弹窗：打开、关闭、Esc 和完成反馈。
- 变量：导出当前实际计算值为 JSON。

展示页不包含生图 API 调用，不读取密钥，也不修改用户工作台的参考图或生成记录。
