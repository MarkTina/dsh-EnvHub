# AGENTS.md — dsh-EnvHub

DSH 插件：环境变量管理器。合并 `process` / `user`（HKCU）/ `machine`（HKLM）三来源，支持分组、标签、备注、备份与批量操作。Host 侧提供路由与信任栅栏，Client 侧为列表与看板。

> 本文件是冷启动索引，只保留开始工作前必须知道、且难以从任务本身推断的信息。详细规则见下方「文档索引」。
> **改加载链 / inject / 注册逻辑前必读 [VETO-LIST.md](VETO-LIST.md)**：D-001~D-004 是连续三次回归换来的结论，命中即为红线。

## 冷启动读取顺序

1. 本文件（≤2 分钟）
2. `HANDOFF.md`：当前现状与限制 + 待处理事项 + 最近决策
3. `VETO-LIST.md`：按「场景」过滤本次相关条目
4. 环境自检：`npm run check`；失败先修环境，不改业务

## plan 强制阅读范围（每次执行 plan 前必做）

> 每次进入 plan / 制定执行计划前，先让用户选择本次的文档强制阅读范围，再开始写计划。这是硬机制，不是建议。

1. **按相关度排序**：结合本次任务，对 `DESIGN.md` / `VETO-LIST.md` / `PITFALLS.md` / `HANDOFF.md` 排序（`AGENTS.md` 恒读，不参与选择）。
2. **给出选项**：把最相关的 1–2 份作为选项第 1、第 2 项并标注「（推荐）」；其余文件随后列出；最后提供「不强制 AI 阅读」。
3. **用户选择**：用户可勾选 1 个或多个文件作为**强制阅读**范围，或选择「不强制 AI 阅读」。
4. **plan 开头声明**：`本次强制阅读范围：<文件列表>`，或 `本次不强制阅读`。
5. **执行约束**：强制阅读范围内的文件必须全文读完再动手；「推荐」只决定默认排序，仍须用户确认。

## 先草图后落码

- **触发**：新增视图或面板、筛选/分组交互变化、批量操作入口变化、列表信息层级变化。
- **不触发**：文案、颜色、间距、单点图标。
- **输出**：≤30 行 ASCII 草图，1 个主推 + 最多 1 个备选，列「待确认 N 点」。
- **「确认」仅指**：可以 / 按这个做 / 序号 / 修改后同意。**未回复不算确认，停住不落码。**

## 关键事实（改代码前必须知道）

1. **Host 依赖二分**：`inject = ['webServer','connection']`（路由 + 信任栅栏必须用注入实例）；`tools` / `systemPrompt` 走 `ctx.get` 惰性获取。
2. **Client 用幂等注册**：window 单例 + 引用计数 + `slots.entries()` 查重 + duplicate 错误静默。启动期同一插件可能被 apply 两次（框架竞态），不要试图靠"找原因"消除。
3. **`dsh.profile.bundles` 是「启用」的唯一权威**：link 投影在 pnpm 重排的瞬时窗口可能读不到，导致「重启后不自动加载」。只用官方 `plugin_manager` 装卸。
4. **`client.js` 已加 IIFE 隔离**（1.3.0）：整个文件包在 IIFE 内，顶层不再暴露 `build()`；变量行已抽出 `VarRowView` + `React.memo`，`EnvManagerPanel` 其余部分仍较大（看板卡片等仍内联）。
5. **改完必须完全退出 DSH 再启动**：`link:` 安装下刷新页面、开关插件都不会重读模块。

## 常用命令

```bash
npm run check   # node --check index.js / client.js（静态检查）
npm test        # host-logic(真实注册表读写) + agent-tools + persist-check 三个自测
pnpm run lint          # eslint（需先 pnpm install）
pnpm run format:check  # prettier 格式检查
```

## 验证规则（验收分级，本项目具体化）

| 档位 | 本项目怎么做 | 命令 / 入口 |
|---|---|---|
| A 真实运行 | 启动 DSH，打开左侧栏 dsh-EnvHub 面板，实际点列表/看板/筛选/复制/导出/写入并看到正确结果 | DSH 面板 |
| B 截图产物 | 面板截图 / 导出的 JSON 文件 | 面板截图、导出文件 |
| C 仅静态检查 | `node --check`、`npm run check`、`npm test`（构建/单测通过仍属本档） | `npm run check` / `npm test` |
| D 未验证 | 明确写「未验证：<项>」 | — |

## 修改禁区

- 不手改 profile / home patch；不手动 pnpm add。
- 不提交 `.env`、`~/.dsh/dsh-envhub` 下的备份与 trace 日志。
- 不为了「让加载变稳」去掉 `inject` 依赖（见 D-001）。

## 文档索引

| 需要做什么 | 读这里 |
|---|---|
| 功能与配置说明 | `README.md` |
| 版本变更 | `CHANGELOG.md` |
| 设计 / UI / 交互红线 | `DESIGN.md` |
| 历史否决与红线 | `VETO-LIST.md` |
| 错误谨记（踩坑与规避） | `PITFALLS.md` |
| 连续性记忆（现状/待办/决策） | `HANDOFF.md` |
| 插件机制通用知识 | `D:\dsh-project\notes-docs\dsh插件开发指南.md` |
