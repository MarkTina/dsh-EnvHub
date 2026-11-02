/**
 * Host 侧自测：验证合并规则、状态归一化、名称校验，以及真实注册表
 * 读取 → 写入 → 回读 → 删除 → 备份 的完整链路。
 *
 * 只写入一个明显的临时变量（ZZ_EM_SELFTEST_*），并在 finally 中删除。
 */
import assert from 'node:assert';
import { __test__ as t } from '../index.js';

let failures = 0;
function ok(name) { console.log('  ✓', name); }
function fail(name, err) { failures += 1; console.error('  ✗', name, '->', err && (err.message || err)); }

/* 1) normalizeState */
try {
  assert.deepStrictEqual(t.normalizeState(null), { version: 1, groups: [], tags: [], entries: {}, updatedAt: null });
  const n = t.normalizeState({ groups: [{ id: 'g1', name: 'A' }, { bad: 1 }], tags: [{ id: 't1' }], entries: { K: { tags: ['t1'], group: 'g1' } } });
  assert.strictEqual(n.groups.length, 1);
  assert.strictEqual(n.tags.length, 1);
  assert.deepStrictEqual(n.entries.K.tags, ['t1']);
  ok('normalizeState 过滤非法项并补齐字段');
} catch (e) { fail('normalizeState', e); }

/* 2) buildItems 合并优先级 */
try {
  const reg = {
    machine: { PATH: { value: 'machine-path', kind: 'ExpandString' }, ZZ_X: { value: 'vm', kind: 'String' } },
    user: { ZZ_X: { value: 'vu', kind: 'ExpandString' }, ZZ_Y: { value: 'uy', kind: 'String' } },
  };
  const items = t.buildItems(reg);
  const byName = {};
  items.forEach((i) => { byName[i.name.toUpperCase()] = i; });
  assert.deepStrictEqual(byName.ZZ_X.sources, ['machine', 'user']);
  assert.strictEqual(byName.ZZ_X.value, 'vu');
  assert.strictEqual(byName.ZZ_X.kind, 'ExpandString');
  assert.deepStrictEqual(byName.ZZ_Y.sources, ['user']);
  assert.ok(byName.PATH.sources.includes('process'), 'PATH 应包含 process 来源');
  assert.strictEqual(byName.PATH.value, process.env.PATH, 'PATH 值应取进程值');
  assert.strictEqual(byName.ZZ_X.sensitive, false);
  assert.strictEqual(t.buildItems({ user: { AGENT_X_API_KEY: { value: 'v', kind: 'String' } } }).find((i) => i.name === 'AGENT_X_API_KEY').sensitive, true);
  ok('buildItems 多来源合并 / 值优先级 / 敏感标记');
} catch (e) { fail('buildItems', e); }

/* 3) mergeMeta */
try {
  const base = t.normalizeState({ groups: [{ id: 'g1', name: 'A', order: 0 }], tags: [{ id: 't1', name: 'T1' }], entries: { K: { group: 'g1', tags: ['t1'], note: '' } } });
  const incoming = { groups: [{ id: 'g1', name: 'A2' }, { id: 'g2', name: 'B' }], tags: [{ id: 't2', name: 'T2' }], entries: { K: { tags: ['t2'], note: 'hello' }, L: { group: 'g2' } } };
  const merged = t.mergeMeta(base, incoming, 'merge');
  assert.strictEqual(merged.groups.length, 2);
  assert.strictEqual(merged.groups.find((g) => g.id === 'g1').name, 'A2');
  assert.deepStrictEqual(merged.entries.K.tags.sort(), ['t1', 't2']);
  assert.strictEqual(merged.entries.K.note, 'hello');
  assert.ok(merged.entries.L);
  const replaced = t.mergeMeta(base, incoming, 'replace');
  assert.strictEqual(replaced.entries.K.note, 'hello');
  assert.strictEqual(replaced.groups.length, 2);
  ok('mergeMeta 合并与替换两种模式');
} catch (e) { fail('mergeMeta', e); }

/* 4) validateName */
try {
  assert.strictEqual(t.validateName('A_B1'), true);
  assert.strictEqual(t.validateName('_x9'), true);
  assert.strictEqual(t.validateName('1A'), false);
  assert.strictEqual(t.validateName('A-B'), false);
  assert.strictEqual(t.validateName('A B'), false);
  ok('validateName 规则');
} catch (e) { fail('validateName', e); }

/* 5) 真实注册表读取链路 */
try {
  const reg = await t.readRegistry(true);
  assert.ok(reg.user && reg.machine, '应返回 user/machine');
  const total = Object.keys(reg.user).length + Object.keys(reg.machine).length;
  assert.ok(total > 0, '注册表应至少读到 0 个以上变量');
  console.log('    -> 读到 user=' + Object.keys(reg.user).length + ', machine=' + Object.keys(reg.machine).length);
  ok('readRegistry 真实读取');
} catch (e) { fail('readRegistry', e); }

/* 6) 写入 → 回读 → 删除 → 备份链路 */
const testName = 'ZZ_EM_SELFTEST_' + Date.now().toString(36).toUpperCase();
try {
  const setRes = await t.doSetVar({ name: testName, value: 'selftest-价值-42', scope: 'user' });
  assert.ok(setRes.ok, '写入应成功: ' + JSON.stringify(setRes));
  const after = await t.readRegistry(true);
  const hit = Object.entries(after.user).find(([k]) => k.toUpperCase() === testName);
  assert.ok(hit, '写入后应能读到该变量');
  assert.strictEqual(hit[1].value, 'selftest-价值-42');
  const backups = await t.listBackups();
  assert.ok(backups.ok && backups.items.some((b) => b.name === testName), '应存在该变量的备份');
  const delRes = await t.doUnsetVar({ name: testName, scope: 'user', confirmProtected: true });
  assert.ok(delRes.ok, '删除应成功: ' + JSON.stringify(delRes));
  const after2 = await t.readRegistry(true);
  assert.ok(!Object.entries(after2.user).some(([k]) => k.toUpperCase() === testName), '删除后不应再读到');
  ok('setVar → 回读 → listBackups → unsetVar 全链路');
} catch (e) {
  fail('写链路', e);
  try { await t.doUnsetVar({ name: testName, scope: 'user', confirmProtected: true }); console.log('    -> 已尝试清理残留测试变量'); } catch (ignored) { /* ignore */ }
}

console.log(failures === 0 ? '\nALL PASS' : '\nFAILURES=' + failures);
process.exit(failures === 0 ? 0 : 1);
