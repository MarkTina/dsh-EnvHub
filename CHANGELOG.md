# Changelog

## 1.3.0

### Changed

- **client.js 结构治理**：文件整体包进 IIFE，顶层不再暴露 `build()` 等全局函数，消除与其他插件同名函数互相覆盖的隐患；变量行抽出为独立组件 `VarRowView` 并用 `React.memo` 包裹，缩小巨型组件体积。
- 删除死代码与替换事故残留：`groupBuckets`/`tagBuckets`（其中 `ungroupedialog`/`untaggedialog` 为 `d.i`→`dialog.i` 批量替换误伤）、`renderCard`、`renderRenameDialog`/`renameGroup`、无用的 `includeValues` 状态与 `importPayloadRef`；合并 `applyValueSave` 重复分支。
- **i18n 补全**：英文（EN）词典由仅约 20 个 key 补全为全量，消除英文界面中英混杂。
- **敏感名判定**改为「分隔符词元精确匹配 + 长关键词子串匹配」，避免 `AUTH` 误伤 `AUTHOR/AUTHORITY`、`PWD` 误伤任意含 PWD 的串；支持 `DSH_ENVHUB_SENSITIVE_WHITELIST` 白名单。
- **受保护变量**列表扩展（`JAVA_HOME`/`MAVEN_HOME`/`DOTNET_ROOT`/`NODE_PATH` 等）并支持 `*_HOME`、`PROGRAMFILES*` 等模式。

### Added

- **导出多格式**：除 JSON 外，可导出 `.env`、Shell（`export`）、PowerShell（`$env:`）、`KEY=VALUE`、`KEY: VALUE`、仅名称；按格式自动命名扩展名。
- **导入 dry-run 预览**：导入前可「预览差异」，显示分组/标签/关系的新增-更新-移除数量与将写入的变量条数，不落盘、不改注册表。
- **排序与置顶**：列表支持按名称/来源/分组排序，置顶变量始终排前；`pinned` 字段在 UI 生效。
- **高级搜索语法**：支持 `group:`、`tag:`、`source:` 前缀与 `-` 排除词。
- **备份审计**：备份记录新增 `op`（set/remove）与 `origin`（panel/import/restore），备份面板显示。
- **变更高亮**：刷新后对比上次快照，新增/更新变量打标并显示汇总横幅。
- **体检视图**：新增「体检」视图，按空值 / 超长（>1024 字符）/ 重复值 / 疑似明文密钥分类汇总并可筛选查看；点击行复用「编辑组织信息」弹窗。
- **Agent 工具**：新增只读 `envhub_get_meta`（查询单键的组织信息，返回值外的元数据，仍不含 value）。
- **可访问性**：对话框加 `role="dialog"`/`aria-modal`，Esc 可关闭。

### Performance

- **客户端渲染**：一次遍历预建 `tagNameById`/`groupNameById`/`pinned` 及分组/标签/来源计数索引，替代每帧多次 O(n×m) 全量扫描；`filtered`/`displayed` 用 `useMemo` 缓存；搜索输入 180ms debounce。
- **Host**：`readState` 增加 mtime 级进程内缓存；`readRegistry` 写成功后**增量更新缓存**（不再整轮失效），TTL 3s→10s；`buildItems` 按 registry 引用缓存；记住上一次可用的 PowerShell shell 避免重复探测。
- **批量导入写入**：改为一次读取快照 + 单个 PowerShell 脚本批量 `SetValue` + 最后一次 `WM_SETTINGCHANGE` 广播，并把备份 prune 合并为一次；大幅减少进程 spawn。

### Tests / CI

- `npm test` 串起 host-logic / agent-tools / persist-check 三个自测；新增敏感名、受保护名、`envhub_get_meta` 覆盖。
- 新增 `.editorconfig`、`.prettierrc.json`、`eslint.config.mjs`，`pnpm run lint` / `pnpm run format[:check]` 通过；源码已按 prettier 统一格式化。
- 新增 `.github/workflows/ci.yml`（windows-latest：`pnpm install` → check → lint → format:check → test）。

## 1.2.6

### Fixed

- 修复浏览器控制台反复出现的三类重复注册报错：
  - `locale namespace "dsh-envhub" already has locale "zh"`
  - `Duplicate shortcut command: envhub.open`
  - `keyed slot "main" already has an entry for key "envhub"` / `list slot "sidebar.panellist" already has an entry with id "envhub"`
  - 根因：client 端 `apply` 在 `cordis-loader` 的启动竞态下可能对同一插件条目执行两次（实测创建两个 fiber、甚至两次物化模块），而旧代码每次执行都无条件注册 locale / 侧栏座位 / 快捷键，第二次必然与第一次冲突；嵌套 `ctx.inject(...)` 的注册还挂在错误的 ctx 生命周期上，卸载不彻底。
  - 修复：
    1. 客户端入口恢复为硬依赖 `inject: ['slots','locale','shortcuts']`（与官方 `dsh-client-ui-layout` 一致），`apply` 在服务就绪后执行；
    2. 注册逻辑改为**幂等**：座位先查 `slots.entries()` 是否已有 `envhub`，locale / 快捷键遇重复注册则静默跳过；
    3. 用挂在 `window` 上的模块级单例 + 引用计数，保证即便同一条目被物化成多个实例也只安装一次，所有实例卸载后统一 dispose。

## 1.2.5

### Fixed

- 修复 1.2.4 之后的新问题：`/envhub/api` 路由已注册（GET 405 而非 404），但信任栅栏用错了 `connection` 实例，前端读取报 `HTTP 403`。
  - 根因：1.2.3 起把 `connection` 从顶层 `inject` 移除、改为在 handler 里 `ctx.get('connection')` 惰性获取，拿到的是未正确绑定的实例，`requestRejection` 一律拒绝（GET/POST 均 403）。
  - 修复：恢复为 `export const inject = ['webServer', 'connection']`，在 `apply` 时捕获注入的 `connection` 并用于 `requestRejection`；`tools`/`systemPrompt` 仍通过 `ctx.get` 惰性获取、不进入 inject，以免其就绪时机拖累插件激活。Host 加载方式回到 1.2.2 的已知可用形态。

## 1.2.4

### Fixed

- 修复 1.2.3 引入的回归：`/envhub/api` 路由在启动时未注册，前端读取环境变量报 `HTTP 405`。
  - 根因：1.2.3 去掉了顶层 `inject`，改成在 `apply` 内用 `ctx.inject(['webServer'])` 延迟挂载路由；该延迟路径在插件初始化阶段不可靠，导致路由缺失（GET 404 / POST 405）。
  - 修复：把 `webServer` 恢复为顶层强依赖 `export const inject = ['webServer']`，确保 `apply` 在 webServer 就绪时执行并注册路由；`connection`/`tools`/`systemPrompt` 仍惰性获取，不影响自动加载。

## 1.2.3

### Fixed

- 修复「DSH 重启后插件不自动加载、需要手动禁用/启用才激活」的问题。
  - 根因：`index.js` 顶层 `export const inject = [...]`、`client.js` 顶层 `inject: ['slots']` 是**硬依赖**——任一被列出的服务（`webServer`/`connection`/`tools`/`systemPrompt`/`slots`）在插件初始化时尚未就绪，整个插件就会停在 pending、`apply` 不执行。
  - 修复：入口改为零强依赖，`apply` 立即执行；API 路由、Agent 工具、系统提示、客户端侧栏/主面板座位分别在对应服务就绪时通过 `ctx.inject(...)` 响应式挂载，不再因单个服务迟到而拖垮整个插件的加载。

## 1.2.2

### Added

- 来源筛选支持多选：可按「进程 / 用户级 / 系统级」任意勾选 1~3 个来源过滤展示；筛选区新增「来源」行，与分组、标签并列，并显示各来源数量。

### Changed

- 工具栏原有的「来源」单选下拉移至筛选区，改为可多选的来源 chip（保留全部/进程/用户级/系统级）。

## 1.2.1

### Added

- 看板每列增加整体操作：复制本列 Key、复制本列 Key 和 Value、选择/取消本列（选入批量操作）。

## 1.2.0

### Added

- 新增「看板」视图（与「详细」列表切换）：按分组或按标签把变量以看板列+卡片展示，方便整体清查；点击卡片可编辑组织信息。

### Changed

- 界面显示名改回中文「环境变量管理器」（dsh-EnvHub 仅为仓库/包名，不再作为界面标题）。

## 1.1.0

### Added

- 面向 Agent 的只读环境变量供给：
  - 工具 `envhub_catalog`：列出全部分组/标签及数量（不含值）。
  - 工具 `envhub_keys`：按 group / tags（多选 OR）/ search 查询变量键名与元数据（绝不返回值）。
  - 系统提示段（`envhub`）：告知 Agent 可用工具、值不可见、以及用 `$env:KEY` 安全引用。

## 1.0.2

### Fixed

- 修复单变量「编辑组织信息」打开即白屏：弹窗标题误用了 `draft.item`（应为 `dialog.item`），导致 `undefined.name` 抛错。
- 同类误用一并修正（修改变量值/删除变量弹窗）。
- 弹窗渲染增加兜底：异常时显示错误提示而不是整页白屏。

## 1.0.1

### Fixed

- 批量设置标签改为「覆盖为所选标签」语义（此前为只增不减的追加）；新增「追加到现有标签」选项。
- 批量对话框打开时预填所选变量的公共标签，便于直接调整后覆盖。
- 修复面板变量列表无法滚动（卡片被 flex 压缩裁切）的问题。

## 1.0.0

### Added

- 左侧栏入口与中央面板；三来源环境变量合并（进程 / 用户级 / 系统级）。
- 分组、标签两个独立维度；分组/标签筛选区块，标签支持多选。
- 批量复制（选中 / 整组 / 整标签），两种档位与多格式输出。
- 选择性导出 JSON、导入合并/替换、可选写回本机。
- 新增 / 修改 / 删除真实环境变量：写前备份、写后广播、保留 REG_EXPAND_SZ、受保护变量确认。
- 值默认打码；敏感变量标记。
- 快捷键 `Ctrl+Alt+E`（可在设置中修改）。
- 关系数据独立存储，旧 `env-manager` 数据目录自动迁移到 `dsh-envhub`。
