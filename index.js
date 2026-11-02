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

/** Host services this route needs; the client half stays independent. */
export const inject = ['webServer', 'connection'];

const ROUTE = '/envhub/api';
const MAX_BODY_BYTES = 512 * 1024;

/* 变量名命中这些关键词时标记为敏感（仅影响默认显示策略，不影响读写）。 */
const SENSITIVE = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIAL|PRIVATE|AUTH|COOKIE|SESSION|SALT)/i;

/* 删除这些变量会破坏系统或开发环境，需要前端高级确认。名称大写比较。 */
const PROTECTED = new Set([
  'PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR',
  'TEMP', 'TMP', 'OS', 'NUMBER_OF_PROCESSORS', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'PROGRAMDATA', 'PROGRAMW6432', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME',
  'PSMODULEPATH', 'NVM_HOME', 'NVM_SYMLINK',
]);

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
    try { await fs.stat(target); hasTarget = true; } catch (ignored) { /* absent */ }
    try { await fs.stat(legacy); hasLegacy = true; } catch (ignored) { /* absent */ }
    if (!hasTarget && hasLegacy) {
      await fs.rename(legacy, target);
      try { console.log('[dsh-envhub] migrated data directory: env-manager -> dsh-envhub'); } catch (ignored) { /* ignore */ }
    }
  } catch (ignored) { /* best effort */ }
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

async function readState() {
  try {
    const text = await fs.readFile(stateFile(), 'utf8');
    return normalizeState(JSON.parse(text));
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      try {
        await fs.rename(stateFile(), stateFile() + '.corrupt-' + Date.now());
      } catch (ignored) { /* 保坏文件失败不阻塞 */ }
    }
    return emptyState();
  }
}

/* 串行化写操作，避免并发覆盖。 */
let writeChain = Promise.resolve();
function serialized(fn) {
  const next = writeChain.then(fn, fn);
  // 吞掉尾部异常，避免链条中毒；调用方仍拿到自己的 Promise。
  writeChain = next.then(() => undefined, () => undefined);
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

function pickShell() {
  return process.platform === 'win32' ? ['pwsh.exe', 'powershell.exe'] : [];
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
          if (error && error.code === 'ENOENT') { attempt(); return; }
          const text = String(stdout || '').trim();
          const start = text.indexOf('{');
          const end = text.lastIndexOf('}');
          if (start >= 0 && end > start) {
            try {
              resolve(JSON.parse(text.slice(start, end + 1)));
              return;
            } catch (ignored) { /* 落到下面 */ }
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
async function readRegistry(force) {
  if (!force && readCache.value && Date.now() - readCache.at < 3000) {
    return readCache.value;
  }
  const res = await runPs(READ_SCRIPT, {});
  if (res && res.user && res.machine) {
    readCache = { at: Date.now(), value: res };
    return res;
  }
  if (res && res.code === 'unsupported-platform') {
    return { user: {}, machine: {}, unsupported: true };
  }
  throw new Error((res && res.message) || 'failed to read registry environment');
}

/* ------------------------------------------------------------------ */
/* 备份                                                                */
/* ------------------------------------------------------------------ */

function sanitize(name) {
  return String(name).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
}

async function backupEntry(name, scope, existed, value, kind) {
  await fs.mkdir(backupsDir(), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = ts + '-' + scope + '-' + sanitize(name);
  const file = path.join(backupsDir(), backupId + '.json');
  await fs.writeFile(file, JSON.stringify({ backupId, name, scope, existed, value: value ?? null, kind: kind || null, ts: new Date().toISOString() }, null, 2), 'utf8');
  await pruneBackups();
  return backupId;
}

async function pruneBackups() {
  try {
    const files = (await fs.readdir(backupsDir())).filter((f) => f.endsWith('.json'));
    if (files.length <= MAX_BACKUPS) return;
    files.sort();
    const remove = files.slice(0, files.length - MAX_BACKUPS);
    for (const f of remove) {
      try { await fs.unlink(path.join(backupsDir(), f)); } catch (ignored) { /* ignore */ }
    }
  } catch (ignored) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 环境变量清单                                                         */
/* ------------------------------------------------------------------ */

function buildItems(registry) {
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
    sensitive: SENSITIVE.test(it.name),
    protected: PROTECTED.has(it.name.toUpperCase()),
  }));
  items.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
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

async function doSetVar({ name, value, scope, kind }) {
  if (!validateName(name)) return { ok: false, code: 'invalid-name', message: '变量名只能包含字母、数字与下划线，且不能以数字开头' };
  const sc = scope === 'machine' ? 'machine' : 'user';
  if (typeof value !== 'string') return { ok: false, code: 'invalid-value', message: 'value 必须是字符串' };
  const current = await lookupCurrent(name, sc);
  const backupId = await backupEntry(current.actualName || name, sc, current.existed, current.value, current.kind);
  const writeKind = kind === 'ExpandString' || current.kind === 'ExpandString' ? 'ExpandString' : 'String';
  const res = await runPs(WRITE_SCRIPT, { op: 'set', name, value, scope: sc, kind: writeKind });
  readCache = { at: 0, value: null };
  if (!res || !res.ok) {
    return { ok: false, code: (res && res.code) || 'write-failed', message: (res && res.message) || '写入失败', backupId };
  }
  return { ok: true, backupId, warning: res.warning || null };
}

async function doUnsetVar({ name, scope, confirmProtected }) {
  if (!validateName(name)) return { ok: false, code: 'invalid-name', message: '变量名非法' };
  if (PROTECTED.has(name.toUpperCase()) && confirmProtected !== true) {
    return { ok: false, code: 'protected', message: '该变量受保护，需要高级确认后才能删除' };
  }
  const sc = scope === 'machine' ? 'machine' : 'user';
  const current = await lookupCurrent(name, sc);
  if (!current.existed) return { ok: false, code: 'not-found', message: '该变量在所选来源中不存在' };
  const backupId = await backupEntry(current.actualName || name, sc, true, current.value, current.kind);
  const res = await runPs(WRITE_SCRIPT, { op: 'remove', name: current.actualName || name, scope: sc });
  readCache = { at: 0, value: null };
  if (!res || !res.ok) {
    return { ok: false, code: (res && res.code) || 'write-failed', message: (res && res.message) || '删除失败', backupId };
  }
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
      const created = { id: String(g.id), name: typeof g.name === 'string' ? g.name : '', order: typeof g.order === 'number' ? g.order : out.groups.length, color: typeof g.color === 'string' ? g.color : null };
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
      const created = { id: String(t.id), name: typeof t.name === 'string' ? t.name : '', color: typeof t.color === 'string' ? t.color : null };
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

async function doImportApply({ payload, mergeMode, writeValues }) {
  if (!payload || payload.format !== 'dsh-envhub' || !payload.meta) {
    return { ok: false, code: 'invalid-payload', message: '导入文件不是本插件的导出格式' };
  }
  const mode = mergeMode === 'replace' ? 'replace' : 'merge';
  const base = await readState();
  const merged = mergeMeta(base, payload.meta, mode);
  await saveState(merged);

  const current = buildItems(await readRegistry(true));
  const present = new Set(current.map((i) => i.name.toUpperCase()));
  const variables = Array.isArray(payload.variables) ? payload.variables : [];
  const missing = [];
  const written = [];
  const failed = [];
  for (const v of variables) {
    if (!v || typeof v.name !== 'string') continue;
    if (!present.has(v.name.toUpperCase())) missing.push(v.name);
  }
  if (writeValues === true) {
    for (const v of variables) {
      if (!v || typeof v.name !== 'string' || typeof v.value !== 'string') continue;
      const r = await doSetVar({ name: v.name, value: v.value, scope: v.scope === 'machine' ? 'machine' : 'user', kind: v.kind });
      if (r.ok) written.push(v.name); else failed.push({ name: v.name, code: r.code, message: r.message });
    }
  }
  return {
    ok: true,
    summary: {
      groups: merged.groups.length,
      tags: merged.tags.length,
      entries: Object.keys(merged.entries).length,
      variables: variables.length,
      missing,
      written,
      failed,
      mergeMode: mode,
      writeValues: writeValues === true,
    },
  };
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
          ts: raw.ts || null,
        });
      } catch (ignored) { /* skip broken */ }
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
    return doSetVar({ name: raw.name, value: raw.value == null ? '' : String(raw.value), scope: raw.scope, kind: raw.kind });
  }
  return doUnsetVar({ name: raw.name, scope: raw.scope, confirmProtected: true });
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

/** Host loader entry: one authenticated route for the plugin UI. */
export function apply(ctx) {
  try {
    const webServer = ctx.webServer || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined);
    const connection = ctx.connection || (typeof ctx.get === 'function' ? ctx.get('connection') : undefined);
    if (!webServer || typeof webServer.register !== 'function') {
      try { console.warn('[envhub] webServer service unavailable; API route not registered'); } catch (ignored) { /* ignore */ }
      return;
    }

    const handler = async (req, res) => {
      let rejection;
      try {
        rejection = connection && typeof connection.requestRejection === 'function'
          ? connection.requestRejection(req)
          : undefined;
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
      const mediaType = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
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
    try { console.warn('[envhub] route registration failed:', error && error.message); } catch (ignored) { /* ignore */ }
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
  listBackups,
  readState,
  saveState,
  PROTECTED,
  SENSITIVE,
};
