import { __test__ as t } from '../index.js';

const base = await t.readState();
const marker = 'g_' + Date.now().toString(36);
await t.saveState({ version: 1, groups: [{ id: marker, name: '验证组', order: 0 }], tags: [], entries: {} });
const back = await t.readState();
const found = back.groups.some((g) => g.id === marker);
console.log('persist-roundtrip=', found ? 'PASS' : 'FAIL', 'groups=', back.groups.length);
await t.saveState(base);
const after = await t.readState();
console.log('restored-groups=', after.groups.length);
process.exit(found ? 0 : 1);
