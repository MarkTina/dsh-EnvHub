# dsh-EnvHub

**环境变量管理器 / Environment Variable Manager — 一个 DeepSeek Harness（DSH）Web 插件。**

左侧栏入口 + 中央面板，读取本机 **进程 / 用户级 / 系统级** 环境变量，在真实 KV 之上维护**分组 / 标签 / 备注 / 置顶**关系，支持多格式复制、选择性导出与跨设备导入，并可安全地新增/修改/删除真实环境变量。

> 设计前提：真实环境变量始终由宿主机持有，插件只在本地磁盘保存"关系"，不复制、不上传变量本身。

## 功能

- **三来源合并**：进程 `process.env` + Windows 用户级 `HKCU\Environment` + 系统级 `HKLM\...\Session Manager\Environment`，去重并标注来源。
- **三种视图**：详细（列表，可看值/复制/批量操作）、**看板**（按分组或按标签分列成卡片，便于整体清查；点击卡片可编辑）与 **体检**（按空值/超长/重复值/疑似明文密钥分类汇总，只读）。
- **分组 / 标签**：两个独立维度（变量至多归 1 个组、可有多个标签）。顶部「分组」「标签」两个筛选区块列出全部项及数量，**点击即筛选**（标签支持多选，命中任一）。
- **复制**：按选中 / 整组 / 整标签批量复制；两档【复制 Key】【复制 Key 和 Value】；格式支持 `KEY=VALUE`、`KEY: VALUE`、`export KEY="VALUE"`、仅名称、`.env`、JSON。
- **导出 / 导入**：选择性导出（默认不含真实值，含值时告警）；导出格式支持 JSON / `.env` / Shell（`export`）/ PowerShell（`$env:`）/ `KEY=VALUE` / `KEY: VALUE` / 仅名称。导入时可合并或替换、可先「预览差异」（dry-run，不落盘）、可选把值写回本机。
- **排序 / 置顶 / 变更高亮**：列表可按名称 / 来源 / 分组排序，置顶变量排前；刷新后对比上次快照，新增/更新变量打标并汇总。
- **高级搜索**：支持 `group:` / `tag:` / `source:` 前缀筛选与 `-` 排除词。
- **可写环境变量**：新增 / 修改 / 删除，写前自动备份、写后广播 `WM_SETTINGCHANGE`、保留 `REG_EXPAND_SZ` 值类型、受保护变量二次确认、无权限时给出明确错误。
- **安全默认**：变量值默认打码；名称含 `KEY/TOKEN/SECRET/PASSWORD` 等自动标记为敏感。
- **快捷键**：默认 `Ctrl+Alt+E`（macOS 为 `Cmd+Alt+E`）打开/收起面板，可在 DSH「设置 → 通用 → 快捷键」中修改。

## 给 Agent 的能力（只读供给）

插件会向 Agent 注册两个**只读**工具（通过 DSH 的 `tools` 服务），并在系统提示中说明用法；**任何工具都不会返回值**：

- `envhub_catalog`：列出所有分组/标签及数量（仅名称与数量）。
- `envhub_keys`：按 `group` / `tags`（多选，命中任一）/ `search` 查询变量**键名**，返回 `key / group / tags / sources / sensitive`，不含 `value`；支持 `limit/offset` 分页。
- `envhub_get_meta`：查询单个键名的组织信息（分组 / 标签 / 备注 / 来源 / 敏感标记），不含 `value`。

Agent 被要求在命令中使用 `$env:KEY` / `$KEY` 引用变量，而不是打印或读取其值。写操作（新增/修改/删除、导入写回）仍然只在用户面板中进行，不暴露给 Agent。

## 环境要求

- DeepSeek Harness `>= 0.2.0-rc.2`
- Node.js `>= 18`
- 系统级环境变量的读取与写入依赖 Windows 注册表；其他平台仅提供进程内变量

## 安装

本插件是纯 JavaScript 的本地 bundle，无需构建。

1. 克隆本仓库到任意目录：

   ```bash
   git clone https://github.com/MarkTina/dsh-EnvHub.git
   ```

2. 用 DSH 的插件管理器把它安装到当前 profile：执行 `install_bundle`，并把 **target 指向第 1 步克隆出来的目录的绝对路径**（下面只是路径写法示例，请替换成你自己的实际路径）：

   ```text
   Windows:      C:\path\to\dsh-EnvHub
   macOS/Linux:  /path/to/dsh-EnvHub
   ```

   本地目录安装会把该目录链接进 profile，因此后续 `git pull` 更新后重启 DSH 即生效。

3. 安装完成后，左侧栏出现 **dsh-EnvHub** 图标，点击进入面板。

> 若你通过 npm 发布了同名包，也可以在插件管理器里按包名 `dsh-envhub` 安装。

## 项目结构（DSH 插件规范）

```text
dsh-EnvHub/
├─ package.json        # name=dsh-envhub；dsh.bundle.patch + dsh.client 声明
├─ cordis.patch.yml    # 插入 bundle 行（id=envhub）
├─ index.js            # Host 半侧：/envhub/api 路由、注册表读写、状态与备份
├─ client.js           # Client 半侧：侧栏图标 + 面板 UI
├─ locale/             # zh.json / en.json（meta.title / description）
├─ icon.svg            # 插件图标（原创，<256KiB）
├─ test/               # 自测脚本（真实注册表读写）
├─ README.md
├─ CHANGELOG.md
└─ LICENSE
```

## 数据与备份

- 关系数据（分组 / 标签 / 备注 / 置顶）：`<DSH_PROFILE_DIR>/dsh-envhub/state.json`
  - 升级自旧版时，`.../env-manager` 目录会在首次启动时自动迁移到 `.../dsh-envhub`。
- 写入真实变量前的旧值备份：`<DSH_PROFILE_DIR>/dsh-envhub/backups/`，可在面板「备份」中恢复。
- 所有数据仅保存在本机，插件不会访问任何远程服务。

## 平台与限制

- Windows 支持三来源与写入；非 Windows 显示进程内变量，并**只读**解析 `/etc/environment`（系统级）与 `~/.profile`（用户级），写操作返回「仅支持 Windows」。
- 写入系统级（HKLM）需要管理员权限。
- 修改后当前 DSH 进程的 `process.env` 不会即时变化，需重启 DSH 或新开终端才生效。
- 变量值通过本地同源路由传输，并由 DSH 的 `connection.requestRejection` 信任栅栏保护；请勿在不可信环境暴露该 Web 服务。

## 开发

```bash
npm run check     # node --check index.js / client.js
npm test          # 真实注册表读取 + 写入→回读→备份→删除 自测
```

## License

[MIT](./LICENSE) © MarkTina
