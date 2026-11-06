/**
 * dsh-envhub — Host half.
 *
 * 真实环境变量（KV）由宿主机持有：进程内 process.env、Windows 用户级
 * (HKCU\Environment) 与系统级 (HKLM\...\Session Manager\Environment)。
 * 本插件的 Host 侧只做三件事：
 *   1) 只读汇总三来源（含注册表值类型，保留 REG_EXPAND_SZ 语义）；
 *   2) 承载插件自身的关系数据（分组 / 标签 / 备注 / 排序）到 profile 下的 JSON；
 *   3) 在用户明确操作下写回注册表（写前备份、写后广播刷新、失败给出明确原因）。
 *
 * 浏览器侧（client.js）负责全部 UI；两者通过一条同源路由 `/envhub/api`
 * 通信（沿用宿主既有约定：connection 信任栅栏、application/json、体积上限）。
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Plugin identity for loader rows. */
export const name = 'dsh-envhub';

/** 路由与信任栅栏只需要 webServer + connection（均为启动期常驻核心服务）；
 *  tools/systemPrompt 不放进 inject，通过 ctx.get 惰性获取，避免其就绪时机拖累插件激活。 */
export const inject = ['webServer', 'connection'];

const ROUTE = '/envhub/api';
const MAX_BODY_BYTES = 512 * 1024;

/* 变量名敏感标记：按分隔符切成词元做「精确词」匹配，另对足够长的关键词做子串匹配，
 * 避免 AUTH 误伤 AUTHOR/AUTHORITY、PWD 误伤任意含 PWD 的串。可用逗号分隔的
 * DSH_ENVHUB_SENSITIVE_WHITELIST 强制把某些变量名排除在敏感之外（仅影响默认显示策略，不影响读写）。 */
const SENSITIVE_WORDS = new Set([
  'KEY',
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'PWD',
  'CREDENTIAL',
  'CREDENTIALS',
  'PRIVATE',
  'AUTH',
  'COOKIE',
  'SESSION',
  'SALT',
  'PASSPHRASE',
  'BEARER',
]);
const SENSITIVE_SUBSTRINGS = [
  'PASSWORD',
  'PASSWD',
  'SECRET',
  'TOKEN',
  'CREDENTIAL',
  'APIKEY',
  'ACCESSKEY',
  'SECRETKEY',
  'PRIVATEKEY',
  'PASSPHRASE',
];
const SENSITIVE_WHITELIST = new Set(
  String(process.env.DSH_ENVHUB_SENSITIVE_WHITELIST || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);
function isSensitiveName(name) {
  const upper = String(name == null ? '' : name).toUpperCase();
  if (!upper) return false;
  if (SENSITIVE_WHITELIST.has(upper)) return false;
  if (SENSITIVE_SUBSTRINGS.some((s) => upper.includes(s))) return true;
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  return tokens.some((t) => SENSITIVE_WORDS.has(t));
}

/* 删除这些变量会破坏系统或开发环境，需要前端高级确认。名称大写比较。 */
const PROTECTED = new Set([
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'TEMP',
  'TMP',
  'OS',
  'NUMBER_OF_PROCESSORS',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMDATA',
  'PROGRAMW6432',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERNAME',
  'USERDOMAIN',
  'COMPUTERNAME',
  'PSMODULEPATH',
  'NVM_HOME',
  'NVM_SYMLINK',
  'DOTNET_ROOT',
  'NODE_PATH',
  'JAVA_HOME',
  'MAVEN_HOME',
  'GRADLE_HOME',
  'GOPATH',
  'CARGO_HOME',
  'RUSTUP_HOME',
]);
const PROTECTED_PATTERNS = [/_HOME$/, /^PROGRAMFILES/, /^SYSTEM(ROOT|DRIVE)$/, /^WINDIR$/];
function isProtectedName(name) {
  const upper = String(name == null ? '' : name).toUpperCase();
  if (PROTECTED.has(upper)) return true;
  return PROTECTED_PATTERNS.some((re) => re.test(upper));
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_BACKUPS = 200;

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

function profileBase() {
  return process.env.DSH_PROFILE_DIR || path.join(os.homedir(), '.dsh');
}

function stateDir() {
  return path.join(profileBase(), 'dsh-envhub');
}

let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  migrated = true;
  try {
    const base = profileBase();
    const target = path.join(base, 'dsh-envhub');
    const legacy = path.join(base, 'env-manager');
    let hasTarget = false;
    let hasLegacy = false;
    try {
      await fs.stat(target);
      hasTarget = true;
    } catch (ignored) {
      /* absent */
    }
    try {
      await fs.stat(legacy);
      hasLegacy = true;
    } catch (ignored) {
      /* absent */
    }
    if (!hasTarget && hasLegacy) {
      await fs.rename(legacy, target);
      try {
        console.log('[dsh-envhub] migrated data directory: env-manager -> dsh-envhub');
      } catch (ignored) {
        /* ignore */
      }
    }
  } catch (ignored) {
    /* best effort */
  }
}

function stateFile() {
  return path.join(stateDir(), 'state.json');
}

function backupsDir() {
  return path.join(stateDir(), 'backups');
}

function emptyState() {
  return { version: 1, groups: [], tags: [], entries: {}, updatedAt: null };
}

function normalizeState(raw) {
  const out = emptyState();
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.groups)) {
    out.groups = raw.groups
      .filter((g) => g && typeof g.id === 'string')
      .map((g) => ({
        id: String(g.id),
        name: typeof g.name === 'string' ? g.name : '',
        order: typeof g.order === 'number' ? g.order : 0,
        color: typeof g.color === 'string' ? g.color : null,
      }));
  }
  if (Array.isArray(raw.tags)) {
    out.tags = raw.tags
      .filter((t) => t && typeof t.id === 'string')
      .map((t) => ({
        id: String(t.id),
        name: typeof t.name === 'string' ? t.name : '',
        color: typeof t.color === 'string' ? t.color : null,
      }));
  }
  if (raw.entries && typeof raw.entries === 'object') {
    for (const [key, val] of Object.entries(raw.entries)) {
      if (!val || typeof val !== 'object') continue;
      out.entries[key] = {
        group: typeof val.group === 'string' ? val.group : null,
        tags: Array.isArray(val.tags) ? val.tags.map(String) : [],
        note: typeof val.note === 'string' ? val.note : '',
        pinned: val.pinned === true,
        order: typeof val.order === 'number' ? val.order : 0,
      };
    }
  }
  out.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  return out;
}

let stateCache = { mtimeMs: null, value: null };
async function readState() {
  try {
    const st = await fs.stat(stateFile());
    if (stateCache.value && stateCache.mtimeMs === st.mtimeMs) return stateCache.value;
    const text = await fs.readFile(stateFile(), 'utf8');
    const value = normalizeState(JSON.parse(text));
    stateCache = { mtimeMs: st.mtimeMs, value };
    return value;
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      try {
        await fs.rename(stateFile(), stateFile() + '.corrupt-' + Date.now());
      } catch (ignored) {
        /* 保坏文件失败不阻塞 */
      }
    }
    stateCache = { mtimeMs: null, value: null };
    return emptyState();
  }
}

/* 串行化写操作，避免并发覆盖。 */
let writeChain = Promise.resolve();
function serialized(fn) {
  const next = writeChain.then(fn, fn);
  // 吞掉尾部异常，避免链条中毒；调用方仍拿到自己的 Promise。
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function writeJsonAtomic(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function saveState(state) {
  return serialized(async () => {
    const next = { ...state, version: 1, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(stateFile(), next);
    try {
      const st = await fs.stat(stateFile());
      stateCache = { mtimeMs: st.mtimeMs, value: next };
    } catch (ignored) {
      stateCache = { mtimeMs: null, value: null };
    }
    return next;
  });
}

/* ------------------------------------------------------------------ */
/* PowerShell 桥：读取 / 写入 Windows 注册表                             */
/* ------------------------------------------------------------------ */

const READ_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
function Read-EnvKey([string]$sub) {
  $res = @{}
  try {
    $rk = if ($sub -eq 'Machine') {
      [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
    } else {
      [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    }
    if ($rk) {
      foreach ($n in $rk.GetValueNames()) {
        if ([string]::IsNullOrEmpty($n)) { continue }
        try {
          $kind = [string]$rk.GetValueKind($n)
          $value = $rk.GetValue($n, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
          $res[$n] = @{ value = [string]$value; kind = $kind }
        } catch { }
      }
      $rk.Close()
    }
  } catch { }
  return $res
}
$out = @{ user = (Read-EnvKey 'User'); machine = (Read-EnvKey 'Machine') }
[Console]::Out.Write(($out | ConvertTo-Json -Compress -Depth 6))
`;

const WRITE_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
function Broadcast-Change() {
  try {
    $sig = '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
    $t = Add-Type -MemberDefinition $sig -Name 'EnvMgrSMT' -Namespace 'EnvMgr' -PassThru
    $r = [UIntPtr]::Zero
    [void]$t::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
    return $null
  } catch { return 'broadcast-failed' }
}
try {
  $p = $env:EM_PAYLOAD | ConvertFrom-Json
  $machine = ($p.scope -eq 'machine')
  $root = if ($machine) { [Microsoft.Win32.Registry]::LocalMachine } else { [Microsoft.Win32.Registry]::CurrentUser }
  $sub = if ($machine) { 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' } else { 'Environment' }
  $rk = $root.OpenSubKey($sub, $true)
  if (-not $rk) { throw 'registry key unavailable' }
  if ($p.op -eq 'remove') {
    $rk.DeleteValue([string]$p.name, $false)
  } else {
    $kind = if ($p.kind -eq 'ExpandString') { [Microsoft.Win32.RegistryValueKind]::ExpandString } else { [Microsoft.Win32.RegistryValueKind]::String }
    $rk.SetValue([string]$p.name, [string]$p.value, $kind)
  }
  $rk.Close()
  $warn = Broadcast-Change
  [Console]::Out.Write((@{ ok = $true; warning = $warn } | ConvertTo-Json -Compress))
} catch {
  $msg = $_.Exception.Message
  $code = if ($msg -match 'UnauthorizedAccess|Access to the path|denied|拒绝|提升') { 'access-denied' } else { 'write-failed' }
  [Console]::Out.Write((@{ ok = $false; code = $code; message = $msg } | ConvertTo-Json -Compress))
}
`;

/* 批量写入：一次 PowerShell 进程处理多条 SetValue，最后只广播一次 WM_SETTINGCHANGE。 */
const BATCH_WRITE_SCRIPT = `
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
function Broadcast-Change() {
  try {
    $sig = '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
    $t = Add-Type -MemberDefinition $sig -Name 'EnvMgrSMTOps' -Namespace 'EnvMgr' -PassThru
    $r = [UIntPtr]::Zero
    [void]$t::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
    return $null
  } catch { return 'broadcast-failed' }
}
try {
  $p = $env:EM_PAYLOAD | ConvertFrom-Json
  $results = @()
  $anyOk = $false
  foreach ($w in @($p.writes)) {
    try {
      $machine = ($w.scope -eq 'machine')
      $root = if ($machine) { [Microsoft.Win32.Registry]::LocalMachine } else { [Microsoft.Win32.Registry]::CurrentUser }
      $sub = if ($machine) { 'SYSTEM\\\\CurrentControlSet\\\\Control\\\\Session Manager\\\\Environment' } else { 'Environment' }
      $rk = $root.OpenSubKey($sub, $true)
      if (-not $rk) { throw 'registry key unavailable' }
      $kind = if ($w.kind -eq 'ExpandString') { [Microsoft.Win32.RegistryValueKind]::ExpandString } else { [Microsoft.Win32.RegistryValueKind]::String }
      $rk.SetValue([string]$w.name, [string]$w.value, $kind)
      $rk.Close()
      $anyOk = $true
      $results += @{ name = [string]$w.name; ok = $true }
    } catch {
      $msg = $_.Exception.Message
      $code = if ($msg -match 'UnauthorizedAccess|Access to the path|denied|拒绝|提升') { 'access-denied' } else { 'write-failed' }
      $results += @{ name = [string]$w.name; ok = $false; code = $code; message = $msg }
    }
  }
  $warn = $null
  if ($anyOk) { $warn = Broadcast-Change }
  [Console]::Out.Write((@{ ok = $true; results = @($results); warning = $warn } | ConvertTo-Json -Compress -Depth 6))
} catch {
  [Console]::Out.Write((@{ ok = $false; code = 'batch-failed'; message = $_.Exception.Message } | ConvertTo-Json -Compress))
}
`;

/* 记住上一次成功使用的 shell，避免在无 pwsh 的机器上每次都先 ENOENT 重试一次。 */
let preferredShell = null;
function pickShell() {
  const base = process.platform === 'win32' ? ['pwsh.exe', 'powershell.exe'] : [];
  if (preferredShell && base.indexOf(preferredShell) !== -1) {
    return [preferredShell, ...base.filter((s) => s !== preferredShell)];
  }
  return base;
}

function runPs(script, payload) {
  return new Promise((resolve) => {
    const candidates = pickShell();
    if (candidates.length === 0) {
      resolve({ ok: false, code: 'unsupported-platform', message: 'environment variable registry access requires Windows' });
      return;
    }
    const env = { ...process.env, EM_PAYLOAD: JSON.stringify(payload || {}) };
    let index = 0;
    const attempt = () => {
      if (index >= candidates.length) {
        resolve({ ok: false, code: 'shell-unavailable', message: 'neither pwsh nor powershell is available' });
        return;
      }
      const shell = candidates[index++];
      let done = false;
      const child = execFile(
        shell,
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { env, timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (done) return;
          done = true;
          if (error && error.code === 'ENOENT') {
            attempt();
            return;
          }
          preferredShell = shell;
          const text = String(stdout || '').trim();
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start >= 0 && end > start) {
            try {
              resolve(JSON.parse(text.slice(start, end + 1)));
              return;
            } catch (ignored) {
              /* 落到下面 */
            }
          }
          resolve({
            ok: false,
            code: 'parse-failed',
            message: (error && error.message) || String(stderr || '').slice(0, 400) || 'empty shell output',
          });
        },
      );
      child.on('error', () => {
        if (done) return;
        done = true;
        attempt();
      });
    };
    attempt();
  });
}

let readCache = { at: 0, value: null };
let buildCache = { registry: null, items: null };
const REGISTRY_TTL = 10000;

/* 非 Windows 只读读取：/etc/environment 作为系统级，~/.profile 作为用户级
 * （写操作仍仅支持 Windows，unsupported 标记保留）。 */
async function readUnixEnv() {
  const user = {};
  const machine = {};
  async function parseFile(file, bucket) {
    try {
      const text = await fs.readFile(file, 'utf8');
      for (const line of text.split('\n')) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        bucket[m[1]] = { value: v, kind: 'String' };
      }
    } catch (ignored) {
      /* 文件不存在或无权限，忽略 */
    }
  }
  await parseFile('/etc/environment', machine);
  const home = process.env.HOME || os.homedir();
  if (home) await parseFile(path.join(home, '.profile'), user);
  return { user, machine, unsupported: true };
}

async function readRegistry(force) {
  if (!force && readCache.value && Date.now() - readCache.at < REGISTRY_TTL) {
    return readCache.value;
  }
  if (process.platform !== 'win32') {
    const unix = await readUnixEnv();
    readCache = { at: Date.now(), value: unix };
    buildCache = { registry: null, items: null };
    return unix;
  }
  const res = await runPs(READ_SCRIPT, {});
  if (res && res.user && res.machine) {
    readCache = { at: Date.now(), value: res };
    buildCache = { registry: null, items: null };
    return res;
  }
  if (res && res.code === 'unsupported-platform') {
    return { user: {}, machine: {}, unsupported: true };
  }
  throw new Error((res && res.message) || 'failed to read registry environment');
}

function invalidateRegistryCache() {
  readCache = { at: 0, value: null };
  buildCache = { registry: null, items: null };
}

/* 写成功后增量更新缓存，避免下一次 list 再整轮 spawn PowerShell。 */
function applyRegistryCacheSet(scope, name, value, kind) {
  if (!readCache.value) return;
  const bucket = scope === 'machine' ? readCache.value.machine : readCache.value.user;
  if (!bucket) return;
  for (const k of Object.keys(bucket)) {
    if (k.toUpperCase() === String(name).toUpperCase()) delete bucket[k];
  }
  bucket[name] = { value, kind };
  readCache.at = Date.now();
  buildCache = { registry: null, items: null };
}

function applyRegistryCacheRemove(scope, name) {
  if (!readCache.value) return;
  const bucket = scope === 'machine' ? readCache.value.machine : readCache.value.user;
  if (!bucket) return;
  for (const k of Object.keys(bucket)) {
    if (k.toUpperCase() === String(name).toUpperCase()) delete bucket[k];
  }
  readCache.at = Date.now();
  buildCache = { registry: null, items: null };
}

/* ------------------------------------------------------------------ */
/* 备份                                                                */
/* ------------------------------------------------------------------ */

function sanitize(name) {
  return String(name)
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .slice(0, 80);
}

async function backupEntry(name, scope, existed, value, kind, op, origin, skipPrune) {
  await fs.mkdir(backupsDir(), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = ts + '-' + scope + '-' + sanitize(name);
  const file = path.join(backupsDir(), backupId + '.json');
  const payload = {
    backupId,
    name,
    scope,
    existed,
    value: value ?? null,
    kind: kind || null,
    op: op || null,
    origin: origin || null,
    ts: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  if (!skipPrune) await pruneBackups();
  return backupId;
}

async function pruneBackups() {
  try {
    const files = (await fs.readdir(backupsDir())).filter((f) => f.endsWith('.json'));
    if (files.length <= MAX_BACKUPS) return;
    files.sort();
    const remove = files.slice(0, files.length - MAX_BACKUPS);
    for (const f of remove) {
      try {
        await fs.unlink(path.join(backupsDir(), f));
      } catch (ignored) {
        /* ignore */
      }
    }
  } catch (ignored) {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* 环境变量清单                                                         */
/* ------------------------------------------------------------------ */

function buildItems(registry) {
  if (registry && registry === buildCache.registry && buildCache.items) return buildCache.items;
  const byKey = new Map();

  const add = (name, source, value, kind) => {
    if (!name) return;
    const key = name.toUpperCase();
    let item = byKey.get(key);
    if (!item) {
      item = { name, value: value == null ? '' : String(value), kind: kind || null, sources: [] };
      byKey.set(key, item);
    }
    if (!item.sources.includes(source)) item.sources.push(source);
    // 值优先级：process(实际生效) > user > machine
    if (source === 'process') {
      item.value = value == null ? '' : String(value);
      item.kind = 'Process';
    } else if (source === 'user' && !item.sources.includes('process')) {
      item.value = value == null ? '' : String(value);
      item.kind = kind || item.kind;
    } else if (source === 'machine' && item.sources.length === 1) {
      item.value = value == null ? '' : String(value);
      item.kind = kind || item.kind;
    }
  };

  // machine 先、user 次、process 最后，保证更高优先级覆盖值
  for (const [n, v] of Object.entries(registry.machine || {})) add(n, 'machine', v && v.value, v && v.kind);
  for (const [n, v] of Object.entries(registry.user || {})) add(n, 'user', v && v.value, v && v.kind);
  for (const [n, v] of Object.entries(process.env)) add(n, 'process', v, null);

  const items = Array.from(byKey.values()).map((it) => ({
    name: it.name,
    value: it.value,
    kind: it.kind,
    sources: it.sources,
    sensitive: isSensitiveName(it.name),
    protected: isProtectedName(it.name),
  }));
  items.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  buildCache = { registry, items };
  return items;
}

/* ------------------------------------------------------------------ */
/* 写操作                                                              */
/* ------------------------------------------------------------------ */

function validateName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

async function lookupCurrent(name, scope) {
  const registry = await readRegistry(true);
  const bucket = scope === 'machine' ? registry.machine : registry.user;
  for (const [n, v] of Object.entries(bucket || {})) {
    if (n.toUpperCase() === name.toUpperCase()) {
      return { existed: true, value: v && v.value != null ? String(v.value) : '', kind: (v && v.kind) || 'String', actualName: n };
    }
  }
  return { existed: false, value: null, kind: null, actualName: name };
}

async function doSetVar({ name, value, scope, kind, origin }) {
  if (!validateName(name)) return { ok: false, code: 'invalid-name', message: '变量名只能包含字母、数字与下划线，且不能以数字开头' };
  const sc = scope === 'machine' ? 'machine' : 'user';
  if (typeof value !== 'string') return { ok: false, code: 'invalid-value', message: 'value 必须是字符串' };
  const current = await lookupCurrent(name, sc);
  const backupId = await backupEntry(
    current.actualName || name,
    sc,
    current.existed,
    current.value,
    current.kind,
    'set',
    origin || 'panel',
  );
  const writeKind = kind === 'ExpandString' || current.kind === 'ExpandString' ? 'ExpandString' : 'String';
  const res = await runPs(WRITE_SCRIPT, { op: 'set', name, value, scope: sc, kind: writeKind });
  if (!res || !res.ok) {
    invalidateRegistryCache();
    return { ok: false, code: (res && res.code) || 'write-failed', message: (res && res.message) || '写入失败', backupId };
  }
  applyRegistryCacheSet(sc, current.actualName || name, value, writeKind);
  return { ok: true, backupId, warning: res.warning || null };
}

async function doUnsetVar({ name, scope, confirmProtected, origin }) {
  if (!validateName(name)) return { ok: false, code: 'invalid-name', message: '变量名非法' };
  if (isProtectedName(name) && confirmProtected !== true) {
    return { ok: false, code: 'protected', message: '该变量受保护，需要高级确认后才能删除' };
  }
  const sc = scope === 'machine' ? 'machine' : 'user';
  const current = await lookupCurrent(name, sc);
  if (!current.existed) return { ok: false, code: 'not-found', message: '该变量在所选来源中不存在' };
  const backupId = await backupEntry(current.actualName || name, sc, true, current.value, current.kind, 'remove', origin || 'panel');
  const res = await runPs(WRITE_SCRIPT, { op: 'remove', name: current.actualName || name, scope: sc });
  if (!res || !res.ok) {
    invalidateRegistryCache();
    return { ok: false, code: (res && res.code) || 'write-failed', message: (res && res.message) || '删除失败', backupId };
  }
  applyRegistryCacheRemove(sc, current.actualName || name);
  return { ok: true, backupId, warning: res.warning || null };
}

/* ------------------------------------------------------------------ */
/* 导入 / 导出                                                         */
/* ------------------------------------------------------------------ */

function mergeMeta(base, incoming, mode) {
  if (mode === 'replace') {
    return normalizeState({
      version: 1,
      groups: incoming.groups || [],
      tags: incoming.tags || [],
      entries: incoming.entries || {},
    });
  }
  const out = normalizeState({
    version: 1,
    groups: base.groups || [],
    tags: base.tags || [],
    entries: { ...(base.entries || {}) },
  });
  const groupById = new Map(out.groups.map((g) => [g.id, g]));
  for (const g of incoming.groups || []) {
    if (!g || typeof g.id !== 'string') continue;
    if (groupById.has(g.id)) {
      const target = groupById.get(g.id);
      if (typeof g.name === 'string' && g.name) target.name = g.name;
      if (typeof g.order === 'number') target.order = g.order;
      if (typeof g.color === 'string') target.color = g.color;
    } else {
      const created = {
        id: String(g.id),
        name: typeof g.name === 'string' ? g.name : '',
        order: typeof g.order === 'number' ? g.order : out.groups.length,
        color: typeof g.color === 'string' ? g.color : null,
      };
      out.groups.push(created);
      groupById.set(created.id, created);
    }
  }
  const tagById = new Map(out.tags.map((t) => [t.id, t]));
  for (const t of incoming.tags || []) {
    if (!t || typeof t.id !== 'string') continue;
    if (tagById.has(t.id)) {
      const target = tagById.get(t.id);
      if (typeof t.name === 'string' && t.name) target.name = t.name;
      if (typeof t.color === 'string') target.color = t.color;
    } else {
      const created = {
        id: String(t.id),
        name: typeof t.name === 'string' ? t.name : '',
        color: typeof t.color === 'string' ? t.color : null,
      };
      out.tags.push(created);
      tagById.set(created.id, created);
    }
  }
  for (const [key, val] of Object.entries(incoming.entries || {})) {
    if (!val || typeof val !== 'object') continue;
    const existing = out.entries[key] || { group: null, tags: [], note: '', pinned: false, order: 0 };
    const tags = new Set(existing.tags || []);
    for (const t of val.tags || []) tags.add(String(t));
    out.entries[key] = {
      group: typeof val.group === 'string' && val.group ? val.group : existing.group,
      tags: Array.from(tags),
      note: typeof val.note === 'string' && val.note ? val.note : existing.note,
      pinned: val.pinned === true ? true : existing.pinned,
      order: typeof val.order === 'number' ? val.order : existing.order,
    };
  }
  return out;
}

function countDiff(beforeArr, afterArr) {
  const before = new Map(beforeArr.map((x) => [x.id, x]));
  let added = 0;
  let updated = 0;
  for (const a of afterArr) {
    const b = before.get(a.id);
    if (!b) added += 1;
    else if (JSON.stringify(b) !== JSON.stringify(a)) updated += 1;
  }
  const afterIds = new Set(afterArr.map((x) => x.id));
  const removed = beforeArr.filter((x) => !afterIds.has(x.id)).length;
  return { added, updated, removed };
}

function entryAsRows(entries) {
  return Object.entries(entries || {}).map(([id, e]) => ({ id, ...e }));
}

function diffMeta(base, merged) {
  return {
    groups: countDiff(base.groups || [], merged.groups || []),
    tags: countDiff(base.tags || [], merged.tags || []),
    entries: countDiff(entryAsRows(base.entries), entryAsRows(merged.entries)),
  };
}

async function doImportApply({ payload, mergeMode, writeValues, dryRun }) {
  if (!payload || payload.format !== 'dsh-envhub' || !payload.meta) {
    return { ok: false, code: 'invalid-payload', message: '导入文件不是本插件的导出格式' };
  }
  if (payload.version != null && payload.version !== 1) {
    return { ok: false, code: 'unsupported-version', message: '不支持的导入文件版本：' + String(payload.version) };
  }
  const mode = mergeMode === 'replace' ? 'replace' : 'merge';
  const base = await readState();
  const merged = mergeMeta(base, payload.meta, mode);
  const variables = Array.isArray(payload.variables) ? payload.variables : [];

  const registry = await readRegistry(false);
  const present = new Set(buildItems(registry).map((i) => i.name.toUpperCase()));
  const missing = [];
  for (const v of variables) {
    if (!v || typeof v.name !== 'string') continue;
    if (!present.has(v.name.toUpperCase())) missing.push(v.name);
  }

  const baseSummary = {
    groups: merged.groups.length,
    tags: merged.tags.length,
    entries: Object.keys(merged.entries).length,
    variables: variables.length,
    missing,
    mergeMode: mode,
    writeValues: writeValues === true,
  };

  /* 预演：只返回差异与将要执行的写入，不落盘、不改注册表。 */
  if (dryRun === true) {
    return {
      ok: true,
      dryRun: true,
      summary: {
        ...baseSummary,
        changes: diffMeta(base, merged),
        willWrite:
          writeValues === true
            ? variables.filter((v) => v && typeof v.name === 'string' && typeof v.value === 'string').map((v) => v.name)
            : [],
      },
    };
  }

  await saveState(merged);

  const written = [];
  const failed = [];
  if (writeValues === true) {
    const writes = [];
    for (const v of variables) {
      if (!v || typeof v.name !== 'string' || typeof v.value !== 'string') continue;
      const sc = v.scope === 'machine' ? 'machine' : 'user';
      const bucket = sc === 'machine' ? registry.machine : registry.user;
      let actual = v.name;
      let existed = false;
      let oldVal = null;
      let oldKind = null;
      for (const [n, val] of Object.entries(bucket || {})) {
        if (n.toUpperCase() === v.name.toUpperCase()) {
          actual = n;
          existed = true;
          oldVal = val && val.value;
          oldKind = val && val.kind;
          break;
        }
      }
      await backupEntry(actual, sc, existed, oldVal, oldKind, 'set', 'import', true);
      const writeKind = v.kind === 'ExpandString' || oldKind === 'ExpandString' ? 'ExpandString' : 'String';
      writes.push({ op: 'set', name: v.name, value: v.value, scope: sc, kind: writeKind });
    }
    if (writes.length) {
      const res = await runPs(BATCH_WRITE_SCRIPT, { writes });
      if (res && res.ok && Array.isArray(res.results)) {
        res.results.forEach((r, i) => {
          const nm = (writes[i] && writes[i].name) || r.name;
          if (r.ok) written.push(nm);
          else failed.push({ name: nm, code: r.code, message: r.message });
        });
      } else {
        for (const w of writes)
          failed.push({ name: w.name, code: (res && res.code) || 'write-failed', message: (res && res.message) || '批量写入失败' });
      }
      invalidateRegistryCache();
      await pruneBackups();
    }
  }

  return { ok: true, summary: { ...baseSummary, written, failed } };
}

async function listBackups() {
  try {
    const files = (await fs.readdir(backupsDir())).filter((f) => f.endsWith('.json'));
    const items = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(backupsDir(), f), 'utf8'));
        items.push({
          backupId: raw.backupId || f.replace(/\.json$/, ''),
          name: raw.name,
          scope: raw.scope,
          existed: raw.existed === true,
          kind: raw.kind || null,
          op: raw.op || null,
          origin: raw.origin || null,
          ts: raw.ts || null,
        });
      } catch (ignored) {
        /* skip broken */
      }
    }
    items.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return { ok: true, items: items.slice(0, 100) };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: true, items: [] };
    return { ok: false, code: 'read-failed', message: error && error.message };
  }
}

async function restoreBackup({ backupId }) {
  if (typeof backupId !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(backupId)) {
    return { ok: false, code: 'invalid-backup', message: '备份 id 非法' };
  }
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(path.join(backupsDir(), backupId + '.json'), 'utf8'));
  } catch (ignored) {
    return { ok: false, code: 'not-found', message: '找不到该备份' };
  }
  if (raw.existed === true) {
    return doSetVar({
      name: raw.name,
      value: raw.value == null ? '' : String(raw.value),
      scope: raw.scope,
      kind: raw.kind,
      origin: 'restore',
    });
  }
  return doUnsetVar({ name: raw.name, scope: raw.scope, confirmProtected: true, origin: 'restore' });
}

/* ------------------------------------------------------------------ */
/* 路由分发                                                            */
/* ------------------------------------------------------------------ */

async function dispatch(action, body) {
  await ensureMigrated();
  switch (action) {
    case 'list': {
      let registry;
      try {
        registry = await readRegistry(false);
      } catch (error) {
        return { ok: false, code: 'read-failed', message: error && error.message };
      }
      const meta = await readState();
      return { ok: true, items: buildItems(registry), meta, platform: process.platform, unsupported: registry.unsupported === true };
    }
    case 'saveMeta': {
      if (!body.meta || typeof body.meta !== 'object') return { ok: false, code: 'invalid-meta', message: 'meta 非法' };
      const saved = await saveState(normalizeState(body.meta));
      return { ok: true, meta: saved };
    }
    case 'setVar':
      return doSetVar(body);
    case 'unsetVar':
      return doUnsetVar(body);
    case 'importApply':
      return doImportApply(body);
    case 'listBackups':
      return listBackups();
    case 'restoreBackup':
      return restoreBackup(body);
    default:
      return { ok: false, code: 'unknown-action', message: 'unknown action: ' + String(action) };
  }
}

/* ------------------------------------------------------------------ */
/* Agent supply: read-only tools + prompt section                      */
/* ------------------------------------------------------------------ */

const PROMPT_SECTION_TEXT = [
  '## 环境变量（dsh-EnvHub）',
  '本机已安装 dsh-EnvHub，环境变量按「分组 / 标签」组织。变量值是机密，任何工具都不会返回值本身。',
  '- 查看有哪些分组/标签：调用 `envhub_catalog`（仅名称与数量）。',
  '- 按分组 / 标签 / 关键字查变量键名：调用 `envhub_keys`（返回 KEY、所属组、标签、来源、是否敏感，不含 value）。',
  '- 查单个 KEY 的组织信息（分组 / 标签 / 备注）：调用 `envhub_get_meta`（不含 value）。',
  '- 使用变量：拿到 KEY 后，在命令中通过环境变量引用（PowerShell `$env:KEY`、bash `$KEY`）。不要 echo / 打印 / 导出变量值，也不要用其它 shell 命令读取值。',
  '- 若确实需要值本身或需要修改环境变量，请让用户在 dsh-EnvHub 面板中操作。',
].join('\n');

const AGENT_TOOL_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
};

function catalogOf(meta, items) {
  var groups = (meta.groups || []).slice().sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  });
  var tags = (meta.tags || []).slice().sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  });
  var gc = {};
  var tc = {};
  items.forEach(function (it) {
    var e = (meta.entries || {})[it.name] || {};
    if (e.group) gc[e.group] = (gc[e.group] || 0) + 1;
    (e.tags || []).forEach(function (t) {
      tc[t] = (tc[t] || 0) + 1;
    });
  });
  return {
    totalKeys: items.length,
    groups: groups.map(function (g) {
      return { name: g.name || g.id, count: gc[g.id] || 0 };
    }),
    tags: tags.map(function (t) {
      return { name: t.name || t.id, count: tc[t.id] || 0 };
    }),
  };
}

function resolveGroup(meta, ref) {
  var groups = meta.groups || [];
  var key = String(ref).trim().toLowerCase();
  var byId = groups.filter(function (g) {
    return String(g.id).toLowerCase() === key;
  });
  if (byId.length === 1) return { id: byId[0].id, name: byId[0].name || byId[0].id };
  var byName = groups.filter(function (g) {
    return (
      String(g.name || g.id)
        .trim()
        .toLowerCase() === key
    );
  });
  if (byName.length === 1) return { id: byName[0].id, name: byName[0].name || byName[0].id };
  return {
    error: 'unknown-group',
    message: '未找到该分组',
    valid: groups.map(function (g) {
      return g.name || g.id;
    }),
  };
}

function resolveTags(meta, refs) {
  var tags = meta.tags || [];
  var ids = [];
  var unknown = [];
  refs.forEach(function (ref) {
    var key = String(ref).trim().toLowerCase();
    var hit = tags.filter(function (t) {
      return (
        String(t.id).toLowerCase() === key ||
        String(t.name || t.id)
          .trim()
          .toLowerCase() === key
      );
    });
    if (hit.length === 1) ids.push(hit[0].id);
    else unknown.push(String(ref));
  });
  if (unknown.length)
    return {
      error: 'unknown-tag',
      message: '未找到标签：' + unknown.join(', '),
      valid: tags.map(function (t) {
        return t.name || t.id;
      }),
    };
  return { ids: ids };
}

function projectKey(meta, it) {
  var e = (meta.entries || {})[it.name] || {};
  var gname = null;
  if (e.group) {
    var g = (meta.groups || []).filter(function (x) {
      return x.id === e.group;
    })[0];
    if (g) gname = g.name || g.id;
  }
  var tnames = (e.tags || [])
    .map(function (tid) {
      var t = (meta.tags || []).filter(function (x) {
        return x.id === tid;
      })[0];
      return t ? t.name || t.id : null;
    })
    .filter(Boolean);
  return { key: it.name, group: gname, tags: tnames, sources: (it.sources || []).slice(), sensitive: it.sensitive === true };
}

async function buildAgentSnapshot() {
  var registry;
  try {
    registry = await readRegistry(false);
  } catch (error) {
    return { error: 'read-failed', message: String((error && error.message) || error) };
  }
  var meta = await readState();
  return { meta: meta, items: buildItems(registry) };
}

async function toolCatalog() {
  var snap = await buildAgentSnapshot();
  if (snap.error) return snap;
  return catalogOf(snap.meta, snap.items);
}

async function toolKeys(args) {
  var snap = await buildAgentSnapshot();
  if (snap.error) return snap;
  var meta = snap.meta;
  var pool = snap.items;
  if (args.group) {
    var g = resolveGroup(meta, args.group);
    if (g.error) return g;
    pool = pool.filter(function (it) {
      var e = (meta.entries || {})[it.name] || {};
      return e.group === g.id;
    });
  }
  if (Array.isArray(args.tags) && args.tags.length) {
    var tr = resolveTags(meta, args.tags);
    if (tr.error) return tr;
    pool = pool.filter(function (it) {
      var e = (meta.entries || {})[it.name] || {};
      var ts = e.tags || [];
      return tr.ids.some(function (id) {
        return ts.indexOf(id) !== -1;
      });
    });
  }
  if (typeof args.search === 'string' && args.search.trim()) {
    var q = args.search.trim().toLowerCase();
    pool = pool.filter(function (it) {
      return it.name.toLowerCase().indexOf(q) !== -1;
    });
  }
  pool = pool.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  var total = pool.length;
  var limit = Number(args.limit);
  limit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100;
  var offset = Number(args.offset);
  offset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  var page = pool.slice(offset, offset + limit).map(function (it) {
    return projectKey(meta, it);
  });
  return { total: total, offset: offset, limit: limit, keys: page };
}

async function toolGetMeta(args) {
  var snap = await buildAgentSnapshot();
  if (snap.error) return snap;
  var meta = snap.meta;
  var name = typeof args.key === 'string' ? args.key.trim() : '';
  if (!name) return { error: 'missing-key', message: '请提供变量键名 key' };
  var it = snap.items.filter(function (x) {
    return x.name.toUpperCase() === name.toUpperCase();
  })[0];
  if (!it) return { error: 'not-found', message: '未找到该环境变量键名', key: name };
  var e = (meta.entries || {})[it.name] || {};
  var gname = null;
  if (e.group) {
    var g = (meta.groups || []).filter(function (x) {
      return x.id === e.group;
    })[0];
    if (g) gname = g.name || g.id;
  }
  var tnames = (e.tags || [])
    .map(function (tid) {
      var t = (meta.tags || []).filter(function (x) {
        return x.id === tid;
      })[0];
      return t ? t.name || t.id : null;
    })
    .filter(Boolean);
  return {
    key: it.name,
    group: gname,
    tags: tnames,
    note: e.note || '',
    pinned: e.pinned === true,
    sources: (it.sources || []).slice(),
    sensitive: it.sensitive === true,
  };
}

const AGENT_TOOLS = [
  {
    name: 'envhub_catalog',
    description:
      '列出本机 dsh-EnvHub 管理的环境变量分组与标签及各自数量。只返回名称与数量，绝不返回变量值。用于在查询具体变量键名前了解目录结构。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: AGENT_TOOL_OUTPUT,
    execute: function () {
      return toolCatalog();
    },
  },
  {
    name: 'envhub_keys',
    description:
      '按分组/标签/关键字查询本机环境变量的键名（KEY）。只返回键名、所属组、标签、来源、是否敏感，绝不返回变量值。拿到 KEY 后请在命令中通过环境变量引用（PowerShell $env:KEY、bash $KEY），不要打印或回显变量的值。',
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', description: '分组名称或 id（大小写不敏感）。' },
        tags: { type: 'array', items: { type: 'string' }, description: '一个或多个标签名称/id，命中任一即可（OR）。' },
        search: { type: 'string', description: '对变量键名做不区分大小写的子串匹配；不会匹配值。' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: '返回条数，默认 100，最大 500。' },
        offset: { type: 'integer', minimum: 0, description: '分页偏移，默认 0。' },
      },
      additionalProperties: false,
    },
    output: AGENT_TOOL_OUTPUT,
    execute: function (args) {
      return toolKeys(args || {});
    },
  },
  {
    name: 'envhub_get_meta',
    description: '查询单个环境变量键名的组织信息：所属分组、标签、备注、来源、是否敏感。绝不返回变量值。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '环境变量键名（大小写不敏感）。' },
      },
      required: ['key'],
      additionalProperties: false,
    },
    output: AGENT_TOOL_OUTPUT,
    execute: function (args) {
      return toolGetMeta(args || {});
    },
  },
];

function registerAgentFeatures(ctx) {
  try {
    var tools = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : undefined);
    if (tools && typeof tools.register === 'function') {
      var disposers = [];
      var install = function () {
        AGENT_TOOLS.forEach(function (def) {
          disposers.push(tools.register(def));
        });
        return function () {
          disposers.forEach(function (d) {
            try {
              d();
            } catch (ignored) {
              /* ignore */
            }
          });
          disposers = [];
        };
      };
      if (typeof ctx.effect === 'function') ctx.effect(install, 'envhub: agent tools');
      else install();
      try {
        console.log('[envhub] agent tools registered: envhub_catalog, envhub_keys, envhub_get_meta');
      } catch (ignored) {
        /* ignore */
      }
    } else {
      try {
        console.warn('[envhub] tools service unavailable; agent tools not registered');
      } catch (ignored) {
        /* ignore */
      }
    }
  } catch (error) {
    try {
      console.warn('[envhub] agent tools registration failed:', error && error.message);
    } catch (ignored) {
      /* ignore */
    }
  }
  try {
    var prompt = ctx.systemPrompt || (typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined);
    if (prompt && typeof prompt.section === 'function') {
      var reg = function () {
        return prompt.section({ name: 'envhub', order: 1000, text: PROMPT_SECTION_TEXT });
      };
      if (typeof ctx.effect === 'function') ctx.effect(reg, 'envhub: prompt section');
      else reg();
      try {
        console.log('[envhub] prompt section registered');
      } catch (ignored) {
        /* ignore */
      }
    }
  } catch (error) {
    try {
      console.warn('[envhub] prompt section registration failed:', error && error.message);
    } catch (ignored) {
      /* ignore */
    }
  }
}

/** Host loader entry: one authenticated route for the plugin UI. */
export function apply(ctx) {
  try {
    registerAgentFeatures(ctx);
    const webServer = ctx.webServer || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined);
    const connection = ctx.connection || (typeof ctx.get === 'function' ? ctx.get('connection') : undefined);
    if (!webServer || typeof webServer.register !== 'function') {
      try {
        console.warn('[envhub] webServer service unavailable; API route not registered');
      } catch (ignored) {
        /* ignore */
      }
      return;
    }

    const handler = async (req, res) => {
      let rejection;
      try {
        rejection = connection && typeof connection.requestRejection === 'function' ? connection.requestRejection(req) : undefined;
      } catch (ignored) {
        rejection = 403;
      }
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('allow', 'POST');
        res.end();
        return;
      }
      const mediaType = String(req.headers['content-type'] || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (mediaType !== 'application/json') {
        sendJson(res, 415, { ok: false, code: 'unsupported-media-type', message: 'content-type must be application/json' });
        return;
      }
      let text;
      try {
        text = await readBody(req);
      } catch (ignored) {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'request body unreadable' });
        return;
      }
      if (text === null) {
        sendJson(res, 413, { ok: false, code: 'payload-too-large', message: 'request body is too large' });
        return;
      }
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch (ignored) {
        sendJson(res, 400, { ok: false, code: 'bad-request', message: 'body must be JSON' });
        return;
      }
      let result;
      try {
        result = await dispatch(body && body.action, body || {});
      } catch (error) {
        result = { ok: false, code: 'internal-error', message: error && error.message };
      }
      sendJson(res, 200, result);
    };

    const register = () => webServer.register({ kind: 'exact', path: ROUTE, handler });
    if (typeof ctx.effect === 'function') ctx.effect(register, 'envhub: api route');
    else register();
  } catch (error) {
    try {
      console.warn('[envhub] route registration failed:', error && error.message);
    } catch (ignored) {
      /* ignore */
    }
  }
}

/** 仅供本地自测：不参与运行时契约，不被路由或 UI 使用。 */
export const __test__ = {
  normalizeState,
  buildItems,
  mergeMeta,
  validateName,
  readRegistry,
  doSetVar,
  doUnsetVar,
  doImportApply,
  diffMeta,
  listBackups,
  readState,
  saveState,
  toolCatalog,
  toolKeys,
  toolGetMeta,
  isProtectedName,
  isSensitiveName,
};
