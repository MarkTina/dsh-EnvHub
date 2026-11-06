# PITFALLS.md — dsh-EnvHub 错误谨记清单

> **用途**：记录踩过的坑、事故与根因，以及可复用的规避方法。**动手前先扫对应章节**。
> **与 VETO-LIST.md 分工**：本文件记「我 / 环境犯的错」，`VETO-LIST.md` 记「用户否定的方案」。
> **维护**：每次事故或根因定位后追加；按主题分章，只追加不改写。
> 来源：`CHANGELOG.md` 1.0.1 / 1.0.2 / 1.2.4~1.2.6 与 `VETO-LIST.md` D-005 / D-006（均为可确认记录）。

## 一、加载与注册

### 1. 三类注册冲突报错（locale / shortcut / slot duplicate）

- **症状**：浏览器控制台反复出现
  - `locale namespace "dsh-envhub" already has locale "zh"`
  - `Duplicate shortcut command: envhub.open`
  - `keyed slot "main" already has an entry for key "envhub"` / `list slot "sidebar.panellist" already has an entry with id "envhub"`
- **根因**：`cordis-loader` 启动竞态下同一插件条目 `apply` 可能执行两次（实测两个 fiber、甚至两次物化模块），旧代码每次无条件注册 locale / 侧栏座位 / 快捷键，第二次必然与第一次冲突。
- **规避**：客户端入口恢复硬依赖 `inject: ['slots','locale','shortcuts']`；注册幂等（座位先查 `slots.entries()`，locale / 快捷键遇重复静默跳过）；`window` 模块级单例 + 引用计数保证只安装一次（见 D-004）。
- **验证**：完全退出 DSH 重启后，控制台无上述三类报错。

### 2. 路由缺失（404/405）与信任栅栏 403

- **症状**：前端读取 `/envhub/api` 报 `HTTP 404/405`（路由未注册）或 `HTTP 403`（信任栅栏拒绝）。
- **根因**：去掉顶层 `inject` 改 `ctx.inject(...)` 延迟挂载 → 路由在初始化阶段未可靠注册；`connection` 用 `ctx.get` 惰性获取拿到未绑定实例 → `requestRejection` 一律拒绝。
- **规避**：`export const inject = ['webServer','connection']`，在 `apply` 捕获注入实例用于 `requestRejection`（见 D-001 / D-002）。
- **验证**：GET/POST `/envhub/api` 正常返回，无 403/405。

## 二、UI 渲染

### 1. 弹窗打开即白屏

- **症状**：单变量「编辑组织信息」弹窗打开即整页白屏。
- **根因**：弹窗标题误用 `draft.item`（应为 `dialog.item`），导致 `undefined.name` 抛错；修改变量值 / 删除变量弹窗同类误用。
- **规避**：弹窗数据源统一用 `dialog.item`；弹窗渲染增加兜底，异常时显示错误提示而非整页白屏。
- **验证**：打开各类弹窗不白屏，异常有提示。

### 2. 变量列表无法滚动

- **症状**：卡片被 flex 压缩裁切，变量列表无法滚动。
- **根因**：列表容器 flex 收缩 / 滚动设置不当。
- **规避**：修正列表容器的 flex 收缩与滚动设置（详见 1.0.1）。
- **验证**：变量较多时列表可正常滚动，卡片不被裁切。

## 三、环境与平台

### 1. 修改环境变量后当前进程不生效

- **症状**：面板修改后当前 DSH 进程的 `process.env` 不变化。
- **根因**：`process.env` 是进程启动时快照，写注册表不回灌当前进程。
- **规避**：属设计边界而非 bug；提示用户重启 DSH 或新开终端才生效（见 D-005）。
- **验证**：重启 DSH 后新值可见。

### 2. 崩溃后误点 sanitizeProfile 导致配置还原

- **症状**：插件崩溃后，点崩溃对话框第 3 个按钮，所有插件配置被还原。
- **根因**：该按钮触发 `sanitizeProfile`，会重置 profile。
- **规避**：崩溃恢复正解是 home 层写 `disabled: true` 后点「重启」，不要点第 3 个按钮（见 D-006）。
- **验证**：崩溃恢复后原有插件配置保留。

## 四、环境与平台（待补）

- 待用户按实际踩坑补充。

## 五、代码治理（1.3.0）

### 1. 批量替换 `d.i` → `dialog.i` 误伤标识符

- **症状**：`client.js` 中 `ungrouped.items` 变成 `ungroupedialog.items`（`tagBuckets` 内 `untagged` 同理），一旦被调用即 `ReferenceError`。
- **根因**：1.0.2 修复弹窗白屏时把 `d.item`→`dialog.item` 做文本替换，误伤了 `ungrouped.items` / `untagged.items`。
- **规避**：批量替换用带词边界的正则；替换后全局搜索被替换词的常见子串；死代码及时删除（本次已删 `groupBuckets`/`tagBuckets`）。

### 2. 去掉列表 JS 高度计算会回归「列表无法滚动」

- **症状**：移除 `scrollH` 的 `getBoundingClientRect` 计算后，部分宿主布局下列表不再滚动（PITFALLS 二.2 复发）。
- **根因**：`.em-root` 的父容器高度不稳定，纯 flex 不足以约束 `overflow:auto`。
- **规避**：1.3.0 保留高度计算，仅把双 `setTimeout` 改为 `requestAnimationFrame` + resize 合帧；若未来改纯 CSS，需真实运行验证。
