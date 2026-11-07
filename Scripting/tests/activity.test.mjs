// This checks our orchestration against a mock, not native ActivityKit behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const store = new Map();
const active = new Map();
const calls = [];
let enabled = true, ambiguous = false, serial = 0;
globalThis.Storage = {
  get: key => store.get(key) ?? null,
  set: (key, value) => { store.set(key, value); return true; },
  remove: key => store.delete(key),
};
function handle(id) {
  return {
    start: async data => { active.set(id, 'active'); if (ambiguous) active.set('other-new', 'active'); calls.push(['start', id, data]); return true; },
    update: async data => { calls.push(['update', id, data]); },
    end: async () => { active.delete(id); calls.push(['end', id]); },
  };
}
globalThis.__activityTest = {
  ACTIVITY_NAME: 'CQMetroArrival',
  MetroActivity: () => handle('metro-' + ++serial),
  LiveActivity: {
    areActivitiesEnabled: async () => enabled,
    getActivityState: async id => active.get(id) ?? null,
    getAllActivitiesIds: async () => [...active.keys()],
    from: (id, name) => { assert.equal(name, 'CQMetroArrival'); return handle(id); },
  },
};
const source = ts.transpileModule(readFileSync(new URL('../MetroMinutes/activity.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^import .*;$/gm, '') + '\n';
const { startOrUpdate, endActivity } = await import('data:text/javascript;base64,' + Buffer.from(
  'const { LiveActivity, ACTIVITY_NAME, MetroActivity } = globalThis.__activityTest;\n' + source,
).toString('base64'));
const data = { station: '二郎', line: '环线', direction: '方向一 · 上桥', arrival: Date.now() + 120000, fetchedAt: Date.now() };
function reset() { store.clear(); active.clear(); calls.length = 0; enabled = true; ambiguous = false; active.set('unrelated', 'active'); }

test('saved activity survives a caller restart and update reuses its ID', async () => {
  reset(); await startOrUpdate(data);
  const id = store.get('cqmetro.activity').id;
  await startOrUpdate({ ...data, arrival: data.arrival + 60000 });
  assert.equal(calls.filter(c => c[0] === 'start').length, 1);
  assert.deepEqual(calls[1].slice(0, 2), ['update', id]);
  await endActivity(); assert.equal(active.has(id), false); assert.equal(active.has('unrelated'), true);
  assert.equal(store.has('cqmetro.activity'), false);
});
test('dismissed activity is replaced; stale activity is updated', async () => {
  reset(); await startOrUpdate(data);
  const id = store.get('cqmetro.activity').id;
  active.set(id, 'stale'); await startOrUpdate(data);
  assert.equal(calls.at(-1)[0], 'update');
  active.set(id, 'dismissed'); await startOrUpdate(data);
  assert.notEqual(store.get('cqmetro.activity').id, id);
});
test('permission denial starts no activity', async () => {
  reset(); enabled = false;
  await assert.rejects(startOrUpdate(data), /允许/); assert.equal(calls.length, 0);
});
test('ambiguous new IDs roll back only our instance', async () => {
  reset(); ambiguous = true;
  await assert.rejects(startOrUpdate(data), /标识/);
  assert.equal(active.has('other-new'), true); assert.equal(active.has('unrelated'), true);
  assert.equal(store.has('cqmetro.activity'), false);
  assert.equal(calls.at(-1)[0], 'end');
});
