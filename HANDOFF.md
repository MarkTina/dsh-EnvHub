# HANDOFF.md — dsh-EnvHub 连续性记录

> 新会话冷启动先读本文件。每次项目内容更新后，同步维护「当前现状与限制 / 待处理事项 / 决策记录」中相关部分。

## 项目心智模型

一个 DSH（DeepSeek Harness）Web 插件：读取本机 **进程 / 用户级（HKCU）/ 系统级（HKLM）** 环境变量并在面板展示，同时维护分组 / 标签 / 备注 / 置顶等「关系」。
核心边界：**真实环境变量始终由宿主机持有**，插件只在本地磁盘（`<DSH_PROFILE_DIR>/dsh-envhub/state.json`）保存关系，不复制、不上传变量值。
Host 半侧（`index.js`）提供 `/envhub/api` 路由与信任栅栏；Client 半侧（`client.js`）提供侧栏入口 + 列表/看板面板。

## 设计原则

- **关系与真实值分离**：关系存本地 JSON，变量本身留在宿主机；默认不上传、不外发。
- **安全默认**：值默认打码；名称含敏感词自动标记；写操作只在用户面板进行。
- **Agent 只读**：仅向 Agent 提供 `envhub_catalog` / `envhub_keys` 两个只读工具，**绝不返回值**。
- **写前备份**：改真实变量前自动备份旧值，写后广播 `WM_SETTINGCHANGE`。

## 当前现状与限制

- 版本 `1.3.0`；纯 JavaScript 本地 bundle，无需构建。
- Windows：三来源读取 + 写入；写入系统级（HKLM）需管理员权限。
- 非 Windows：显示进程内变量，并只读解析 `/etc/environment`、`~/.profile`；写操作仍返回「仅支持 Windows」。
- 修改环境变量后当前 DSH 进程的 `process.env` 不即时变化，需重启 DSH 或新开终端（设计边界，见 D-005）。
- `client.js` 已加 IIFE 隔离（1.3.0），顶层不再暴露 `build()`；仍建议后续把巨型单组件拆分为多个受闭包保护的子组件。
- 客户端渲染已做索引/`useMemo`/debounce 优化，但尚未拆分 `EnvManagerPanel` 大组件与 `React.memo` 子组件（待后续）。
- 变量值经本地同源路由传输，由 `connection.requestRejection` 信任栅栏保护，勿在不可信环境暴露该 Web 服务。

## 演进方向

- 待用户补充（当前无成文里程碑）。

## 待处理事项

1. ~~为 `client.js` 增加 IIFE 隔离~~（1.3.0 已完成）。
2. 补全 `DESIGN.md` 的视觉规范与风格定位（本次仅落可确认的交互 / 安全红线）。
3. 变量行已抽出 `VarRowView` + `React.memo`；看板卡片 `renderKCard` 仍内联，可按需再抽。
4. 「体检视图」已实现（空值/超长/重复/疑似明文，只读，不纳入无引用检测）；「非 Windows 只读读取」已加 `/etc/environment` 与 `~/.profile` 解析（未在非 Windows 实机验证）。
5. 待用户补充：后续功能优先级与演进方向。

## 决策记录

### DR-20261102-01：Host 保留双强依赖 inject

- **背景**：1.2.3 去掉顶层 inject 导致路由未注册（404/405）；1.2.5 单依赖 `webServer` 导致信任栅栏用未绑定 connection 实例（403）。
- **决策**：`export const inject = ['webServer','connection']`，`apply` 时捕获注入实例用于 `requestRejection`；`tools`/`systemPrompt` 仍走 `ctx.get` 惰性获取。
- **原因**：路由 + 信任栅栏必须用注入实例才能可靠工作；去掉依赖的「稳加载」尝试连续两次回归。
- **影响**：Host 加载方式锁定为 1.2.2 已知可用形态（见 D-001 / D-002）。
- **日期**：11-02（记录自 VETO-LIST.md）

### DR-20261102-02：Client 幂等注册

- **背景**：cordis-loader 启动竞态下同一插件 `apply` 可能执行两次（两个 fiber / 两次物化），旧代码每次无条件注册 locale / 侧栏座位 / 快捷键，第二次必然冲突。
- **决策**：座位先查 `slots.entries()` 是否已有 `envhub`；locale / 快捷键遇重复静默跳过；用挂 `window` 的模块级单例 + 引用计数保证只安装一次。
- **原因**：根因是框架竞态，无法靠「找原因」消除，只能用幂等兜住（见 D-004）。
- **影响**：三类 duplicate 报错消除，卸载统一 dispose。
- **日期**：11-02（记录自 VETO-LIST.md）

### DR-20261102-03：只用官方 plugin_manager 装卸

- **背景**：尝试改 home 层 patch / 手改 profile 绕过安装问题被用户否定。
- **决策**：插件安装/启用只用官方 `plugin_manager`；`dsh.profile.bundles` 是「启用」的唯一权威。
- **原因**：link 投影在 pnpm 重排瞬时窗口可能读不到，手改易引入不一致（见 D-003）。
- **影响**：安装流程稳定可复现。
- **日期**：11-02（记录自 VETO-LIST.md）

### DR-20261102-04：来源筛选改多选 chip（OR 语义）

- **背景**：来源筛选原为单选下拉，语义不贴合整体清查场景。
- **决策**：多选 chip（全部 / 进程 / 用户级 / 系统级，带数量与色点），语义为「命中任一（OR）」，全局作用于列表 / 看板 / 全选 / 批量复制 / 导出。
- **原因**：便于按多来源整体清查（见 D-007）。
- **影响**：筛选组件、列表、看板联动口径统一。
- **日期**：11-02（记录自 VETO-LIST.md）

### DR-20261105-01：批量导入改为单脚本批量写

- **背景**：旧实现对每个变量逐个 `doSetVar`，每条都 force 读注册表 + 起一个 PowerShell 进程 + 单独广播，导入 N 条约 2N 次 spawn。
- **决策**：一次读取快照备份 → 单个 `BATCH_WRITE_SCRIPT` 批量 `SetValue` → 只广播一次 `WM_SETTINGCHANGE`；备份 prune 合并为一次。
- **原因**：与真实性能问题相关；语义不变（仍写前备份、失败逐条报告）。
- **影响**：导入写值显著加速；失败仍按变量逐条返回 code/message。

### DR-20261105-02：敏感名按词元匹配

- **背景**：旧正则 `(KEY|TOKEN|...|AUTH|PWD|...)` 会误伤 `AUTHOR/AUTHORITY`、任意含 PWD 的串。
- **决策**：按分隔符切词元做精确词匹配 + 对足够长的关键词（PASSWORD/SECRET/TOKEN/APIKEY 等）做子串匹配；支持 `DSH_ENVHUB_SENSITIVE_WHITELIST`。
- **影响**：`AGENT_X_API_KEY` 仍敏感；`AUTHOR/MONKEY` 不再误判。

### DR-20261102-05：界面显示名改回中文

- **背景**：曾以 `dsh-EnvHub` 作为界面标题。
- **决策**：界面显示名改回中文「环境变量管理器」；`dsh-EnvHub` 仅作仓库 / 包名。
- **原因**：中文标题更贴合目标用户。
- **影响**：仅界面文案，包名不变。
- **日期**：1.2.0 版本（记录自 CHANGELOG）

<!-- fresh-meta
last-updated: 2026-11-05
trigger-reason: 1.3.0 结构治理 / 性能优化 / 功能增强落地
updated-by: lead
next-review: 当核心架构或目标变化时
-->
