import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { constants, generateKeyPairSync, privateDecrypt, randomBytes } from 'node:crypto';
import { loadModule } from './modules.mjs';
import core, { STATIONS } from '../MetroMinutes/core.js';

const { load, display } = await loadModule('data.ts');
const fixture = name => JSON.parse(readFileSync(new URL('../../Tests/Fixtures/' + name + '.json', import.meta.url)));
const erlang = fixture('erlang');
const now = Date.parse(erlang.receivedAt);
const p = core.preferences({ mode: 'timer' });
const snapshot = core.snapshot(erlang.result, p, now);

test('protocol digest and AES decode match independent fixtures', () => {
  const f = fixture('crypto');
  assert.equal(core.digest(f.body, f.nonce, f.sequence, f.timestamp), f.digest);
  assert.deepEqual(core.decode(f.encrypted, { 'Decrypt-Body': 'TRUE' }), { ok: 1 });
  assert.deepEqual(core.decode(f.plaintext), { ok: 1 });
  assert.throws(() => core.decode('{"success":false,"errmsg":"接口错误"}'), /接口错误/);
});
test('RSA PKCS1 padding encrypts the expected digest', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const modulus = Buffer.from(publicKey.export({ format: 'jwk' }).n, 'base64url').toString('hex');
  const digest = fixture('crypto').digest;
  const encrypted = core.encryptDigest(digest, () => randomBytes(32), modulus);
  // Raw private operation permits inspecting v1.5 padding without legacy implicit-rejection support.
  const raw = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(encrypted, 'base64'));
  assert.equal(raw[0], 0); assert.equal(raw[1], 2);
  const zero = raw.indexOf(0, 2); assert.ok(zero >= 10);
  assert.equal(raw.subarray(zero + 1).toString(), digest);
});
test('station catalog, interchange parameters and Shanghai time are validated', () => {
  assert.ok(STATIONS.length > 300);
  assert.equal(new Set(STATIONS.map(s => s.stationID + ':' + s.lineID)).size, STATIONS.length);
  assert.equal(core.stationFor(core.resolveParameter('二郎|环线|down|timer|light', p)).stationName, '二郎');
  assert.throws(() => core.resolveParameter('头塘', p), /换乘站/);
  assert.equal(core.parseDate('20260230080000'), null);
  assert.equal(core.parseDate('20261107080000'), Date.parse('2026-11-07T00:00:00Z'));
});
test('normalization rejects departed, malformed and duplicate trains', () => {
  const t = { arrival_time: '20261106144146', departure_time: '20261106144216', destination: '上桥' };
  const trains = core.normalize([t, t, { ...t, skip_stop_flag: 2 }, { ...t, arrival_time: 'bad' }], now);
  assert.equal(trains.length, 1);
  assert.equal(core.normalize([t], Date.parse('2026-11-06T06:42:16Z')).length, 0);
});

const toutangFlagged = JSON.parse(readFileSync(new URL('./fixtures/toutang-20261109.json', import.meta.url)));
const toutangTime = Date.parse(toutangFlagged.receivedAt);
const toutangPreferences = core.resolveParameter('头塘|4号线|up|timer|dark', p);

test('official Toutang response retains all three Minan Avenue arrivals, including flag 2', () => {
  const s = core.snapshot(toutangFlagged.result, toutangPreferences, toutangTime);
  assert.deepEqual(s.up.map(t => core.clock(t.arrival, true)), ['09:54:38', '10:00:25', '10:04:17']);
  assert.ok(s.up.every(t => t.destination === '民安大道'));
  assert.equal(s.down.length, 3);
  assert.ok(s.down.every(t => ['黄岭', '唐家沱'].includes(t.destination)));
  // After the first train leaves, the previously dropped record must become next.
  const d = display(toutangPreferences, { snapshot: s, error: null }, s.up[0].departure + 1);
  assert.equal(d.direction, '往民安大道');
  assert.equal(core.clock(d.trains[0].arrival, true), '10:00:25');
  assert.equal(d.status, '预计到达 · 停靠待确认');
});

test('a direction containing only flag 2 records remains visible without leaking another line', () => {
  const result = structuredClone(toutangFlagged.result);
  result.lines[0].up = result.lines[0].up.filter(t => t.skip_stop_flag === 2);
  result.lines[0].down = [];
  const s = core.snapshot(result, toutangPreferences, toutangTime);
  assert.equal(s.up.length, 1);
  assert.equal(s.down.length, 0);
  const d = display(toutangPreferences, { snapshot: s, error: null }, toutangTime);
  assert.equal(d.direction, '往民安大道');
  assert.equal(d.status, '预计到达 · 停靠待确认');
  assert.equal(display(toutangPreferences, { snapshot: s, error: null }, toutangTime + 1800000).trains.length, 0);
});

test('overlapping flag variants deduplicate while different destinations remain separate', () => {
  const t = toutangFlagged.result.lines[0].up[1];
  const trains = core.normalize([t, { ...t, skip_stop_flag: '2' }, { ...t, skip_stop_flag: 1 },
    { ...t, destination: '另一终点' }, { ...t, arrival_time: 'bad' }], toutangTime);
  assert.deepEqual(trains.map(t => t.destination), ['民安大道', '另一终点']);
  assert.equal(core.normalize([t], core.parseDate(t.departure_time)).length, 0);
});
test('real fixtures select the correct line, including an empty direction', () => {
  assert.equal(snapshot.up.length, 3); assert.equal(snapshot.down.length, 0);
  const f = fixture('toutang');
  const station = STATIONS.find(s => s.stationName === '头塘' && s.lineID === '04');
  assert.ok(station);
  const s = core.snapshot(f.result, core.preferences(station), Date.parse(f.receivedAt));
  assert.equal(s.lineID, '04');
  assert.equal(s.up.length, 3); assert.equal(s.down.length, 3);
  assert.equal(core.clock(s.up[0].arrival), '14:44');
});
test('failed refresh retains timestamp, inference expires, station mismatches cannot leak', () => {
  const good = display(p, { snapshot, error: null }, now);
  assert.ok(good.trains.length);
  assert.match(display(p, { snapshot, error: 'offline' }, now).source, /刷新失败/);
  assert.match(display(p, { snapshot, error: null }, now + 300000).source, /旧数据/);
  assert.equal(display(p, { snapshot, error: null }, now + 1800000).trains.length, 0);
  assert.equal(display({ ...p, stationID: '5033' }, { snapshot, error: null }, now).trains.length, 0);
});
function memory(request) {
  const store = new Map(); let time = now;
  return { get: k => store.get(k) ?? null, set: (k, v) => store.set(k, v), now: () => time,
    advance: n => { time += n; }, request };
}
test('intent force bypasses cache; widget reload reuses result and displays failures', async () => {
  let count = 0;
  const io = memory(async () => { count++; if (count === 3) throw new Error('offline'); return snapshot; });
  await load(p, false, io); await load(p, false, io); assert.equal(count, 1);
  await load(p, true, io); assert.equal(count, 2);
  const failed = await load(p, true, io); assert.equal(failed.error, 'offline'); assert.equal(failed.snapshot.fetchedAt, now);
  assert.equal((await load(p, false, io)).error, 'offline'); assert.equal(count, 3);
});
test('late network response cannot overwrite newer result', async () => {
  const pending = [];
  const io = memory(() => new Promise(resolve => pending.push(resolve)));
  const first = load(p, true, io); io.advance(1000); const second = load(p, true, io);
  pending[1]({ ...snapshot, fetchedAt: now + 1000 }); await second;
  pending[0](snapshot); assert.equal((await first).snapshot.fetchedAt, now + 1000);
});
