# dsh-EnvHub

**环境变量管理器 / Environment Variable Manager — 一个 DeepSeek Harness（DSH）Web 插件。**

左侧栏入口 + 中央面板，读取本机 **进程 / 用户级（HKCU）/ 系统级（HKLM）** 环境变量，在真实 KV 之上维护**分组 / 标签 / 备注 / 置顶**关系，支持多格式复制、选择性导出与跨设备导入，并可安全地新增/修改/删除真实环境变量。

> 设计前提：真实环境变量由宿主机持有，插件只在磁盘上保存"关系"，不复制变量本身。

## 功能

- **三来源合并**：进程 `process.env` + Windows 用户级 `HKCU\Environment` + 系统级 `HKLM\...\Session Manager\Environment`，去重并标注来源。
- **分组 / 标签**：两个独立维度（变量至多归 1 个组、可有多个标签）。顶部「分组」「标签」两个筛选区块列出全部项及数量，**点击即筛选**（标签支持多选，命中任一）。
- **复制**：按选中 / 整组 / 整标签批量复制；两种档位【复制 Key】【复制 Key 和 Value】；格式支持 `KEY=VALUE`、`KEY: VALUE`、`export KEY="VALUE"`、仅名称、`.env`、JSON。
- **导出 / 导入**：选择性导出为 JSON（默认不含真实值，含值时告警）；导入时可合并或替换，并可选把值写回本机。
- **可写系统变量**：新增 / 修改 / 删除，写前自动备份、写后广播 `WM_SETTINGCHANGE`、保留 `REG_EXPAND_SZ`、受保护变量二次确认、无管理员权限时明确报错。
- **安全默认**：变量值默认打码；名称含 KEY/TOKEN/SECRET/PASSWORD 等自动标为敏感。
- **快捷键**：默认 `Ctrl+Alt+E`（mac 为 `Cmd+Alt+E`）打开/收起面板，可在 DSH「设置 → 通用 → 快捷键」中修改。

## 安装

将本目录作为一个本地 bundle 安装到当前 DSH profile（插件管理器 `install_bundle`，target 指向本目录绝对路径）：

```text
D:\codex-project\dsh-EnvHub
```

安装后左侧栏出现 `dsh-EnvHub` 图标，点击进入面板。

## 项目结构（DSH 插件规范）

```text
dsh-EnvHub/
├─ package.json        # name=dsh-envhub；dsh.bundle.patch + dsh.client 声明
├─ cordis.patch.yml    # 插入 bundle 行（id=envhub）
├─ index.js            # Host 半侧：/envhub/api 路由、注册表读写、状态与备份
├─ client.js           # Client 半侧：侧栏图标 + 面板 UI
├─ locale/             # zh.json / en.json（meta.title / description）
├─ icon.svg            # 插件图标（原创，<256KiB）
├─ test/               # host-logic.mjs：真实注册表读写自测
├─ README.md
├─ CHANGELOG.md
└─ LICENSE
```

## 数据与备份

- 关系数据：`<DSH_PROFILE_DIR>/dsh-envhub/state.json`（旧版 `env-manager` 目录会在首次启动时自动迁移）。
- 备份：`<DSH_PROFILE_DIR>/dsh-envhub/backups/`，可在面板「备份」中恢复。

## 平台与限制

- Windows 支持三来源与写入；非 Windows 仅显示进程内变量，写操作返回"仅支持 Windows"。
- 写入系统级（HKLM）需要管理员权限。
- 修改后当前 DSH 进程的 `process.env` 不会即时变化，需重启 DSH 或新开终端才生效。
- 变量值通过本地同源路由 `connection.requestRejection` 信任栅栏保护；请勿在不可信环境暴露该 Web 服务。

## 开发

```bash
npm run check     # node --check index.js / client.js
npm test          # 真实注册表读取 + 写入→回读→备份→删除 自测
```

## License

[MIT](./LICENSE) © MarkTina
