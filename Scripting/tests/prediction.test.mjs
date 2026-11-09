import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../MetroMinutes/core.js';
import { loadModule } from './modules.mjs';
const { assess, PROFILES } = await loadModule('timetable.ts');
const { display, load, nextTransition, INFERENCE_AGE } = await loadModule('data.ts');
const at = time => Date.parse('2026-11-09T' + time + '+08:00');
const preferences = text => core.resolveParameter(text, core.preferences());
function train(arrival, departure, extra = {}) {
  return { arrival: at(arrival), departure: at(departure), departureKnown: true,
    destination: '王家庄', skipStopFlag: 1, ...extra };
}
const p = preferences('兰花路|10号线|down|timer|dark');
const station = core.stationFor(p);
const base = at('08:00:00');
const known = [train('08:02:00', '08:03:00'), train('08:10:00', '08:11:00'), train('08:20:00', '08:21:00')];
const snapshot = { version: 2, stationID: p.stationID, lineID: p.lineID, fetchedAt: base, up: [], down: known };
const result = { snapshot, error: null };

test('line 10 rapid is identified within ±10 minutes with stop-flag and direction evidence', () => {
  const t = train('07:16:00', '07:18:59', { skipStopFlag: 2 });
  const a = assess(station, 'down', t);
  assert.equal(a.kind, '快速'); assert.equal(a.stop, 'confirmed');
  assert.match(a.evidence, /07:08/); assert.match(a.evidence, /\+10分/);
  assert.equal(assess(station, 'down', { ...t, departure: at('06:58:00') }).stop, 'confirmed');
  assert.equal(assess(station, 'down', { ...t, departure: at('07:19:00') }).stop, 'unknown');
  assert.equal(assess(station, 'up', t).stop, 'unknown');
  assert.equal(assess(station, 'down', { ...t, destination: '后堡' }).stop, 'unknown');
  // Nearby ordinary records must not all become rapid trains in the wide window.
  assert.equal(assess(station, 'down', { ...t, skipStopFlag: 1 }).kind, '');
});

test('weekend/weekday Shanghai date and hour-boundary matching are distinct', () => {
  // A weekday 15:49 record matches 15:39; a weekend one is 11 minutes after 15:38.
  const t = train('15:47:00', '15:49:00', { skipStopFlag: 2 });
  assert.equal(assess(station, 'down', t).kind, '快速');
  const weekend = { ...t, departure: Date.parse('2026-11-14T15:49:00+08:00') };
  assert.equal(assess(station, 'down', weekend).stop, 'unknown');
  const before = { ...t, departure: at('06:59:00') };
  assert.equal(assess(station, 'down', before).kind, '快速');
});

test('loop through-service uses route-specific stops and retains unmatched records', () => {
  const upper = core.stationFor(preferences('上桥|环线|up|timer|dark'));
  const t = train('10:03:00', '10:05:00', { destination: '跳磴', skipStopFlag: 2 });
  assert.equal(assess(upper, 'up', t).kind, '直快');
  assert.equal(assess(upper, 'up', t).stop, 'confirmed');
  assert.match(assess(upper, 'up', t).evidence, /图1/);
  const erlang = core.stationFor(preferences('二郎|环线|up|timer|dark'));
  assert.equal(assess(erlang, 'up', t).stop, 'passing');
  assert.equal(assess(upper, 'up', { ...t, destination: '上桥' }).stop, 'unknown');
  const head = core.stationFor(preferences('头塘|4号线|up|timer|dark'));
  assert.equal(assess(head, 'up', { ...t, destination: '民安大道' }).stop, 'unknown');
  assert.equal(assess(head, 'up', t).stop, 'confirmed');
});

test('fuzzy matching can identify the sampled Minan departure but cannot invent a Toutang timetable', () => {
  const t = train('10:06:52', '10:07:52', { destination: '民安大道', skipStopFlag: 2 });
  const minan = core.stationFor(preferences('民安大道|4号线|up|timer|dark'));
  const a = assess(minan, 'up', t);
  assert.equal(a.kind, '直快'); assert.equal(a.destination, '跳磴');
  assert.match(a.evidence, /10:06/); assert.match(a.evidence, /\+1分/);
  const head = core.stationFor(preferences('头塘|4号线|up|timer|dark'));
  assert.equal(assess(head, 'up', t).stop, 'unknown');
});

test('ambiguity in a reference table never silently selects the nearest candidate', () => {
  const profile = PROFILES.find(p => p.id === 'lanhualu-wangjiazhuang');
  const original = profile.weekday[7];
  try {
    profile.weekday[7] = [8, 18];
    const a = assess(station, 'down', train('07:12:00', '07:13:00', { skipStopFlag: 2 }));
    assert.equal(a.stop, 'unknown'); assert.match(a.label, /歧义/);
  } finally { profile.weekday[7] = original; }
});

test('transcribed profiles contain valid distinct minutes and keep both train systems separate', () => {
  assert.equal(PROFILES.length, 7);
  for (const p of PROFILES) for (const calendar of ['weekday', 'weekend']) {
    const minutes = Object.entries(p[calendar]).flatMap(([h, mm]) => {
      assert.ok(+h >= 0 && +h <= 23); assert.ok(mm.every(m => Number.isInteger(m) && m >= 0 && m < 60));
      return mm.map(m => +h * 60 + m);
    });
    assert.equal(minutes.length, new Set(minutes).size);
  }
  assert.equal(PROFILES.filter(p => p.kind === '快速').length, 1);
});

test('cached data progresses through arrival, dwell departure timer, and next trains without requests', () => {
  let d = display(p, result, base);
  assert.equal(d.phase, 'waiting'); assert.equal(d.targetTime, known[0].arrival);
  assert.equal(display(p, result, at('08:01:30')).phase, 'approaching');
  d = display(p, result, known[0].arrival);
  assert.equal(d.phase, 'dwelling'); assert.equal(d.status, '预计停站中');
  assert.equal(d.targetTime, known[0].departure); assert.equal(d.timerLabel, '距预计发车');
  assert.equal(display(p, result, at('08:02:45')).status, '预计即将发车');
  d = display(p, result, known[0].departure);
  assert.equal(d.current.arrival, known[1].arrival); assert.match(d.previous, /08:03 已驶离/);
  d = display(p, result, known[1].departure);
  assert.equal(d.current.arrival, known[2].arrival); assert.match(d.source, /旧数据推算/);
  d = display(p, result, known[2].departure);
  assert.equal(d.targetTime, null); assert.equal(d.phase, 'departed'); assert.match(d.status, /本批班次/);
});

test('unknown stopping or missing departure never produces a departure countdown', () => {
  const flagged = { ...result, snapshot: { ...snapshot, down: [train('08:02:00', '08:03:00', { skipStopFlag: 2, destination: '后堡' })] } };
  let d = display(p, flagged, at('08:02:10'));
  assert.equal(d.targetTime, null); assert.match(d.status, /停靠待确认/);
  const missing = { ...result, snapshot: { ...snapshot, down: [{ ...known[0], departureKnown: false, departure: known[0].arrival }, known[1]] } };
  d = display(p, missing, known[0].arrival);
  assert.equal(d.targetTime, null); assert.match(d.status, /发车时间未知/);
  d = display(p, missing, known[0].arrival + 61000);
  assert.equal(d.current.arrival, known[1].arrival); assert.doesNotMatch(d.previous, /已驶离/);
});

test('normalization preserves stop flags and distinguishes missing or invalid departure', () => {
  const raw = { arrival_time: '20261109080200', destination: '王家庄', skip_stop_flag: '2' };
  for (const departure_time of [undefined, 'bad', '20261109080100']) {
    const t = core.normalize([{ ...raw, departure_time }], base)[0];
    assert.equal(t.skipStopFlag, 2); assert.equal(t.departureKnown, false);
  }
  const duplicate = core.normalize([{ ...raw, skip_stop_flag: 1 }, { ...raw, departure_time: '20261109080300' }], base);
  assert.equal(duplicate.length, 1); assert.equal(duplicate[0].skipStopFlag, 2); assert.equal(duplicate[0].departureKnown, true);
});

test('30-minute expiry, clock rollback and station mismatches suppress stale timers', () => {
  const future = { ...result, snapshot: { ...snapshot, down: [train('08:40:00', '08:41:00')] } };
  assert.equal(display(p, future, base + INFERENCE_AGE).targetTime, null);
  assert.equal(display(p, future, base - 60001).targetTime, null);
  assert.equal(display({ ...p, stationID: '1013' }, result, base).trains.length, 0);
});

test('five-minute cache avoids HTTP during state changes, failures keep original observation time', async () => {
  const store = new Map(); let now = base, calls = 0;
  const io = { get: k => store.get(k), set: (k, v) => store.set(k, v), now: () => now,
    request: async () => { calls++; if (calls > 1) throw Error('offline'); return snapshot; } };
  await load(p, false, io);
  now = known[0].arrival; const cached = await load(p, false, io);
  assert.equal(calls, 1); assert.equal(display(p, cached, now).phase, 'dwelling');
  now = base + 300000; const failed = await load(p, false, io);
  assert.equal(calls, 2); assert.equal(failed.snapshot.fetchedAt, base);
  assert.match(display(p, failed, now).source, /刷新失败 · 旧数据推算/);
  await load(p, true, io); assert.equal(calls, 3);
});

test('host refresh requests include exact arrival and departure state boundaries', () => {
  assert.equal(nextTransition(p, result, at('08:01:31')), known[0].arrival);
  assert.equal(nextTransition(p, result, at('08:02:50')), known[0].departure);
});
