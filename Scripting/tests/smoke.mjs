import { randomUUID } from 'node:crypto';
import core from '../MetroMinutes/core.js';
const p = core.preferences({ mode: 'timer' });
const spec = core.requestSpec(p, Date.now(), randomUUID);
const response = await fetch(spec.url, { method: 'POST', headers: spec.headers, body: spec.body, signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const s = core.snapshot(core.decode(await response.text(), { 'decrypt-body': response.headers.get('decrypt-body') ?? '' }), p, Date.now());
console.log(JSON.stringify({ station: core.stationFor(p).stationName, queried: core.clock(s.fetchedAt, true), up: s.up.length, down: s.down.length }));
