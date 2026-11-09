import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../MetroMinutes/core.js';
import { loadModule } from './modules.mjs';
const { widgetTimeline, nextWidgetReload } = await loadModule('widget_timeline.ts');
const { display, INFERENCE_AGE } = await loadModule('data.ts');
const at = time => Date.parse('2026-11-09T' + time + '+08:00');
const p = core.resolveParameter('兰花路|10号线|down|timer|dark', core.preferences());
const base = at('08:00:00');
const train = (arrival, departure, extra = {}) => ({ arrival: at(arrival), departure: at(departure),
  destination: '王家庄', departureKnown: true, skipStopFlag: 1, ...extra });
const trains = [train('08:02:00', '08:03:00'), train('08:10:00', '08:11:00'), train('08:20:00', '08:21:00')];
const result = (down = trains, extra = {}) => ({ snapshot: { version: 2, stationID: p.stationID,
  lineID: p.lineID, fetchedAt: base, up: [], down, ...extra }, error: null });
// Simulate the latest revealed layer from one frozen render, without invoking
// display() again to decide what the widget would show.
const visible = (frames, time) => frames.filter(f => f.at <= time).at(-1).view;

test('one prebuilt deck covers arrival, dwell, three departures and exhaustion', () => {
  const frames = widgetTimeline(p, result(), base);
  assert.equal(visible(frames, at('08:01:29')).status, '预计到达');
  assert.equal(visible(frames, at('08:01:30')).status, '预计即将到达');
  assert.equal(visible(frames, at('08:02:00')).targetTime, trains[0].departure);
  assert.equal(visible(frames, at('08:02:45')).status, '预计即将发车');
  assert.equal(visible(frames, at('08:03:00')).current.arrival, trains[1].arrival);
  assert.equal(visible(frames, at('08:11:00')).current.arrival, trains[2].arrival);
  assert.equal(visible(frames, at('08:21:00')).targetTime, null);
  assert.match(visible(frames, at('08:21:00')).status, /班次数据已用完/);
  assert.ok(frames.length <= 15, `bounded layer count: ${frames.length}`);
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].at > frames[i - 1].at);
});

test('every second of a frozen deck agrees with current cached-state inference', () => {
  const r = result();
  const frames = widgetTimeline(p, r, base);
  for (let now = base; now <= base + INFERENCE_AGE + 60000; now += 1000) {
    const actual = visible(frames, now), expected = display(p, r, now);
    assert.equal(actual.current?.arrival, expected.current?.arrival);
    assert.equal(actual.targetTime, expected.targetTime);
    assert.equal(actual.source, expected.source);
    if (expected.phase !== 'departed') assert.equal(actual.status, expected.status);
  }
});

test('five-minute stale label and thirty-minute expiry are native reveal boundaries', () => {
  const frames = widgetTimeline(p, result([train('08:40:00', '08:41:00')]), base);
  assert.match(visible(frames, base + 299999).source, /按上次查询/);
  assert.match(visible(frames, base + 300000).source, /旧数据/);
  assert.equal(visible(frames, base + INFERENCE_AGE).phase, 'expired');
  assert.equal(visible(frames, base + INFERENCE_AGE).targetTime, null);
  assert.equal(visible(frames, base + INFERENCE_AGE + 3600000).phase, 'expired');
  assert.ok(frames.every(f => f.at <= base + INFERENCE_AGE));
});

test('unconfirmed stops have no dwell timer and missing departures retire at the next arrival', () => {
  const unknown = train('08:02:00', '08:03:00', { destination: '后堡', skipStopFlag: 2 });
  const frames = widgetTimeline(p, result([unknown, trains[1]]), base);
  assert.match(visible(frames, unknown.arrival).status, /停靠待确认/);
  assert.equal(visible(frames, unknown.arrival).targetTime, null);
  assert.ok(!frames.some(f => f.view.targetTime === unknown.departure));
  const missing = { ...trains[0], departureKnown: false, departure: trains[0].arrival };
  const following = train('08:02:20', '08:02:50');
  const early = widgetTimeline(p, result([missing, following]), base);
  assert.match(visible(early, missing.arrival).status, /发车时间未知/);
  assert.equal(visible(early, following.arrival).current.arrival, following.arrival);
  assert.equal(visible(early, following.arrival).targetTime, following.departure);
  const alone = widgetTimeline(p, result([missing]), base);
  assert.equal(visible(alone, missing.arrival + 60000).current, undefined);
});

test('directions, station isolation, errors and mid-dwell rebuilds retain their own state', () => {
  const up = train('08:04:00', '08:05:00', { destination: '兰花路' });
  const r = result(trains, { up: [up] });
  const upFrames = widgetTimeline(p, r, base, 'up');
  assert.equal(visible(upFrames, base).current.arrival, up.arrival);
  const later = widgetTimeline(p, r, at('08:10:30'));
  assert.equal(later[0].view.phase, 'dwelling');
  assert.equal(later[0].view.targetTime, trains[1].departure);
  assert.ok(later.every(f => f.at >= at('08:10:30')));
  const failed = widgetTimeline(p, { ...r, error: 'offline' }, base);
  assert.match(failed[0].view.source, /刷新失败/);
  assert.equal(widgetTimeline({ ...p, stationID: '1013' }, r, base).length, 1);
  assert.equal(widgetTimeline(p, { snapshot: null, error: 'offline' }, base)[0].view.status, '查询失败 · 请刷新');
  assert.equal(widgetTimeline(p, r, base - 60001).length, 1);
});

test('simultaneous boundaries collapse and a fourth train never leaks into the deck', () => {
  const zero = train('08:01:00', '08:01:00');
  const extra = train('08:22:00', '08:23:00');
  const frames = widgetTimeline(p, result([zero, ...trains]), base);
  assert.equal(visible(frames, zero.departure).current.arrival, trains[0].arrival);
  const capped = widgetTimeline(p, result([...trains, extra]), base);
  assert.ok(!capped.some(f => f.view.trains.some(t => t.arrival === extra.arrival)));
  assert.equal(visible(capped, extra.arrival).current, undefined);
});

test('empty batches still age out and reload timing is independent from visual transitions', () => {
  const empty = widgetTimeline(p, result([]), base);
  assert.equal(empty[0].view.status, '本次查询暂无班次');
  assert.equal(visible(empty, base + INFERENCE_AGE).phase, 'expired');
  const done = widgetTimeline(p, result(), at('08:22:00'));
  assert.match(done[0].view.status, /班次数据已用完/);
  assert.equal(nextWidgetReload(result(), base), base + 300000);
  assert.equal(nextWidgetReload(result(), trains[0].arrival), base + 300000);
  assert.equal(nextWidgetReload({ ...result(), error: 'offline' }, base), base + 60000);
});
