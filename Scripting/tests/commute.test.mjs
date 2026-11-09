import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './modules.mjs';
import core from '../MetroMinutes/core.js';
const { draftScene, validateScene, shareScene, importScene, readBook, resolveScene, recommendedScene,
  advice, adviceCards, destinationReach } = await loadModule('commute.ts');
const { display } = await loadModule('data.ts');
const base = Date.parse('2026-11-09T08:00:00+08:00');
const p = core.resolveParameter('头塘|4号线|up|timer|dark', core.preferences());
const scene = validateScene({ ...draftScene(p), destination: '民安大道', walkMinutes: 1, entryMinutes: 0 });
const train = (minutes, extra = {}) => ({ arrival: base + minutes * 60000 - 30000,
  departure: base + minutes * 60000, departureKnown: true, destination: '民安大道', skipStopFlag: 1, ...extra });
const result = (trains = [train(3), train(4), train(6)], pref = p) => ({ error: null,
  snapshot: { version: 2, fetchedAt: base, stationID: pref.stationID, lineID: pref.lineID, [pref.direction]: trains,
    [pref.direction === 'up' ? 'down' : 'up']: [] } });
const reach = (s, t) => destinationReach(s, display(s.preferences, result([t], s.preferences), base).current);

test('scene validation rejects malformed imports and never exports cached or arbitrary fields', () => {
  assert.deepEqual(importScene(shareScene({ ...scene, cache: 'private', arbitrary: 123 })), scene);
  assert.doesNotMatch(decodeURIComponent(shareScene({ ...scene, cache: 'private' })), /private|cache/);
  for (const patch of [{ version: 2 }, { destination: '不存在' }, { destination: '头塘' },
    { walkMinutes: -1 }, { walkMinutes: 61 }, { walkMinutes: 1.5 }, { entryMinutes: '2' },
    { bufferMinutes: 0 }, { bufferMinutes: 16 }, { id: '__proto__' },
    { preferences: { ...p, stationID: '1001' } }, { preferences: { lineID: '04' } }]) {
    assert.throws(() => validateScene({ ...scene, ...patch }));
  }
  for (const raw of ['CQMETRO1:%not-json', '{}', 'CQMETRO2:x', 'CQMETRO1:' + 'x'.repeat(12001)]) assert.throws(() => importScene(raw));
});

test('scene bindings, active choice and legacy widget parameters remain independent', () => {
  const home = { ...scene, id: 'home', walkMinutes: 8 };
  const book = readBook({ version: 1, active: 'home', scenes: { work: scene, home }, onboarded: true });
  assert.equal(resolveScene('', book, p).walkMinutes, 8);
  assert.equal(resolveScene('scene:work', book, p).walkMinutes, 1);
  assert.equal(resolveScene(core.parameter(p), book, p).ready, false);
  assert.deepEqual(resolveScene(shareScene(scene), readBook(null), p), scene);
  assert.throws(() => resolveScene('scene:home', readBook(null), p), /先打开脚本保存回家/);
  assert.throws(() => resolveScene('scene:invalid', book, p));
  const partial = readBook({ ...book, scenes: { work: scene, home: { broken: true } } });
  assert.ok(partial.scenes.work); assert.equal(partial.scenes.home, undefined);
});

test('time-of-day suggestions use Shanghai time and never switch the saved active scene', () => {
  const book = readBook({ version: 1, active: 'work', scenes: { work: scene, home: { ...scene, id: 'home' } } });
  assert.equal(recommendedScene(book, base), null);
  assert.equal(recommendedScene(book, Date.parse('2026-11-09T14:00:00+08:00')), 'home');
  assert.equal(recommendedScene(book, Date.parse('2026-11-10T01:00:00+08:00')), 'home');
  assert.equal(book.active, 'work');
  assert.equal(recommendedScene(readBook(null), base), null);
});

test('ordinary line reachability respects destination, direction, short turns and extensions', () => {
  assert.equal(reach(scene, train(3)).state, 'yes');
  assert.equal(reach({ ...scene, destination: '重庆北站北广场' }, train(3)).state, 'yes');
  assert.equal(reach({ ...scene, destination: '嘉州路' }, train(3)).state, 'no');
  assert.equal(reach({ ...scene, destination: '嘉州路' }, train(3, { destination: '石马河立交' })).state, 'yes');
  assert.equal(reach({ ...scene, destination: '唐家沱' }, train(3, { destination: '唐家沱' })).state, 'unknown');
  assert.equal(reach(scene, train(3, { skipStopFlag: 2 })).state, 'unknown');
});

test('verified through/rapid routes reject skipped stops and stations behind the train', () => {
  const lp = core.resolveParameter('上桥|环线|up|timer|dark', p);
  const loop = validateScene({ ...draftScene(lp), destination: '民安大道' });
  assert.equal(reach(loop, train(3, { destination: '唐家沱', skipStopFlag: 2 })).state, 'yes');
  assert.equal(reach({ ...loop, destination: '重庆西站' }, train(3, { destination: '唐家沱', skipStopFlag: 2 })).state, 'no');
  assert.equal(reach({ ...loop, destination: '天星桥' }, train(3, { destination: '唐家沱', skipStopFlag: 2 })).state, 'no');
  assert.equal(reach(loop, train(3, { destination: '重庆北站南广场', skipStopFlag: 1 })).state, 'unknown');
  const rp = core.resolveParameter('兰花路|10号线|down|timer|dark', p);
  const rapid = validateScene({ ...draftScene(rp), destination: '后堡' });
  assert.equal(reach(rapid, train(8, { destination: '王家庄', skipStopFlag: 2 })).state, 'no');
  assert.equal(reach({ ...rapid, destination: '红土地' }, train(8, { destination: '王家庄', skipStopFlag: 2 })).state, 'yes');
});

test('leave recommendation subtracts walking, entry and buffer and advances without inventing trains', () => {
  const r = result();
  assert.equal(advice(scene, r, base).leaveAt, base + 60000);
  assert.equal(advice(scene, r, base + 60000).selected.train.departure, base + 180000);
  assert.equal(advice(scene, r, base + 60001).selected.train.departure, base + 240000);
  assert.equal(advice(scene, r, base + 240001).selected, undefined);
  const long = { ...scene, walkMinutes: 5, entryMinutes: 2 };
  assert.equal(advice(long, result([train(9)]), base).leaveAt, base + 60000);
});

test('old/error/mismatched/unknown/missing-departure observations never become recommendations', () => {
  const r = result();
  const cases = [[r, base + 300000], [{ ...r, error: 'offline' }, base],
    [{ ...r, snapshot: { ...r.snapshot, stationID: '0401' } }, base], [r, base - 60001],
    [result([train(3, { skipStopFlag: 2 })]), base], [result([train(3, { departureKnown: false })]), base]];
  for (const [value, now] of cases) assert.equal(advice(scene, value, now).selected, undefined);
  assert.equal(advice({ ...scene, ready: false }, r, base).selected, undefined);
  assert.equal(advice(scene, result([train(3, { skipStopFlag: 2 })]), base).rows.length, 1);
});

test('one lightweight recommendation deck agrees each second until freshness expiry and never reveals a fourth', () => {
  const r = result();
  const cards = adviceCards(scene, r, base);
  assert.ok(cards.length <= 4);
  for (let now = base; now <= base + 360000; now += 1000) {
    const actual = cards.filter(c => c.at <= now).at(-1).view;
    const expected = advice(scene, r, now);
    assert.equal(actual.selected?.train.departure, expected.selected?.train.departure);
  }
  const extended = adviceCards(scene, result([train(3), train(4), train(6), train(10)]), base);
  assert.ok(!extended.some(c => c.view.selected?.train.departure === base + 600000));
  const expiry = adviceCards(scene, result([train(12)]), base);
  assert.equal(expiry.at(-1).at, base + 300000);
  assert.equal(expiry.at(-1).view.leaveAt, null);
});

test('saving/importing one scene preserves the other scene, old cache and rendering preference', async () => {
  const storage = globalThis.Storage;
  const saved = new Map([['cqmetro.widgetRendering.v121', 'automatic'], ['cqmetro.v2.04.0403', { original: true }]]);
  globalThis.Storage = { get: key => saved.get(key), set: (key, value) => saved.set(key, value) };
  try {
    const api = await loadModule('scenes.ts');
    api.saveScene(scene);
    api.saveScene({ ...scene, id: 'home', walkMinutes: 8 });
    api.activateScene('work'); api.finishOnboarding();
    const book = api.savedScenes();
    assert.equal(book.scenes.home.walkMinutes, 8);
    assert.equal(book.active, 'work'); assert.equal(book.onboarded, true);
    assert.equal(api.currentScene('scene:work').walkMinutes, 1);
    assert.equal(saved.get('cqmetro.widgetRendering.v121'), 'automatic');
    assert.deepEqual(saved.get('cqmetro.v2.04.0403'), { original: true });
  } finally { globalThis.Storage = storage; }
});
