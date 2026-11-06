import { __test__ as t } from '../index.js';

const cat = await t.toolCatalog();
console.log('catalog.totalKeys=', cat.totalKeys);
console.log('catalog.groups=', JSON.stringify(cat.groups));
console.log('catalog.tags=', JSON.stringify(cat.tags));

const all = await t.toolKeys({ limit: 5 });
console.log('keys.sample=', JSON.stringify(all.keys));
const hasValue = all.keys.some((k) => Object.prototype.hasOwnProperty.call(k, 'value'));
console.log('keys.containsValue=', hasValue);

if (cat.groups.length) {
  const g = await t.toolKeys({ group: cat.groups[0].name });
  console.log('filter.group', cat.groups[0].name, 'total=', g.total);
}
if (cat.tags.length) {
  const g = await t.toolKeys({ tags: [cat.tags[0].name] });
  console.log('filter.tag', cat.tags[0].name, 'total=', g.total);
}
const s = await t.toolKeys({ search: 'AGENT' });
console.log('filter.search=AGENT total=', s.total);
const unk = await t.toolKeys({ group: '__nope__' });
console.log('unknown.group=', JSON.stringify(unk));

if (all.keys.length) {
  const meta = await t.toolGetMeta({ key: all.keys[0].key });
  console.log('get_meta=', JSON.stringify(meta), 'hasValue=', Object.prototype.hasOwnProperty.call(meta, 'value'));
  if (Object.prototype.hasOwnProperty.call(meta, 'value')) process.exit(1);
}

process.exit(hasValue ? 1 : 0);
