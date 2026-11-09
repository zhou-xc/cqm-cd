import core, { type Preferences, type Snapshot, type Direction, type Train } from "./core";
import { assess, type Assessment } from "./timetable";

export type Result = { snapshot: Snapshot | null; error: string | null };
export interface Ports {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): unknown;
  now(): number;
  request(p: Preferences): Promise<Snapshot>;
}
// v1 caches lack stop flags/departure validity and cannot prove stopping.
export const cacheKey = (p: Preferences) => `cqmetro.v2.${p.lineID}.${p.stationID}`;
export const INFERENCE_AGE = 30 * 60000;
export const UNKNOWN_DEPARTURE_GRACE = 60000;
export async function load(p: Preferences, force: boolean, io: Ports): Promise<Result> {
  const key = cacheKey(p);
  const previous = io.get<Result & { attemptedAt: number }>(key);
  const age = previous ? io.now() - previous.attemptedAt : Infinity;
  // Repainting a status change does not need another HTTP request. Explicit
  // refresh bypasses this; retry failures after 20s without aging original data.
  if (!force && previous && age >= 0 &&
      (age < 20000 || (!previous.error && core.fresh(previous.snapshot, io.now())))) return previous;
  const attemptedAt = io.now();
  let result: Result;
  try { result = { snapshot: await io.request(p), error: null }; }
  catch (error) { result = { snapshot: previous?.snapshot ?? null, error: String(error instanceof Error ? error.message : error) }; }
  const newer = io.get<Result & { attemptedAt: number }>(key);
  if (newer && newer.attemptedAt > attemptedAt) return newer;
  io.set(key, { ...result, attemptedAt });
  return result;
}

export type DisplayTrain = Train & { assessment: Assessment };
export function trainEnd(train: Train) {
  return train.departureKnown ? train.departure : train.arrival + UNKNOWN_DEPARTURE_GRACE;
}
export function display(p: Preferences, result: Result, now = Date.now(), dir: Direction = p.direction) {
  const station = core.stationFor(p);
  const snapshot = result.snapshot;
  const matches = snapshot?.stationID === p.stationID && snapshot?.lineID === p.lineID;
  const age = matches && snapshot ? now - snapshot.fetchedAt : Infinity;
  const usable = Number.isFinite(age) && age >= -60000 && age < INFERENCE_AGE;
  const fresh = usable && age < core.MAX_AGE;
  const all = matches && snapshot && Array.isArray(snapshot[dir]) ? snapshot[dir] : [];
  const valid = all.filter(t => Number.isFinite(t.arrival) && Number.isFinite(t.departure));
  const trains: DisplayTrain[] = usable ? valid.filter((t, i) =>
    trainEnd(t) > now && (t.departureKnown || !valid[i + 1] || valid[i + 1].arrival > now))
    .map(t => ({ ...t, assessment: assess(station, dir, t) })) : [];
  const current = trains[0];
  const passed = usable ? valid.filter(t => trainEnd(t) <= now) : [];
  const last = passed[passed.length - 1];
  const direction = current ? core.label(station, dir, [{ ...current, destination: current.assessment.destination }])
    : all.length ? core.label(station, dir, all) : dir === "up" ? station.upLabel : station.downLabel;
  let status = "尚未查询", timerLabel = "", targetTime: number | null = null;
  let phase: "waiting" | "approaching" | "dwelling" | "uncertain" | "departed" | "empty" | "expired" = "empty";
  if (!matches || !snapshot) status = result.error ? "查询失败 · 请刷新" : "尚未查询";
  else if (!usable) { status = "旧数据已失效 · 请刷新"; phase = "expired"; }
  else if (!current) {
    phase = last ? "departed" : "empty";
    status = last ? (last.departureKnown ? "本批班次预计已驶离 · 请刷新" : "已过预计时刻 · 请刷新") : "本次查询暂无班次";
  } else if (now < current.arrival) {
    phase = current.arrival - now <= 30000 ? "approaching" : "waiting";
    targetTime = current.arrival;
    timerLabel = current.assessment.stop === "passing" ? "距接口预计时刻" : "距预计到达";
    status = current.assessment.stop === "passing" ? "本交路不在本站停靠（按图）"
      : current.assessment.stop === "unknown" ? "预计到达 · 停靠待确认"
      : phase === "approaching" ? "预计即将到达" : "预计到达";
  } else if (current.assessment.stop !== "confirmed") {
    phase = "uncertain";
    status = current.assessment.stop === "passing" ? "本交路不在本站停靠（按图）" : "已到预计时刻 · 停靠待确认";
  } else if (!current.departureKnown) {
    phase = "uncertain"; status = "预计已到站 · 发车时间未知";
  } else {
    phase = "dwelling"; targetTime = current.departure; timerLabel = "距预计发车";
    status = current.departure - now <= 15000 ? "预计即将发车" : "预计停站中";
  }
  const source = !usable ? "" : `${result.error ? "刷新失败 · " : ""}${fresh ? "按上次查询推算" : "旧数据推算"}`;
  const previous = current && last ? (last.departureKnown ? `上一班预计 ${core.clock(last.departure)} 已驶离` : "上一班已过预计时刻，离站时间未知") : "";
  const bounds = current ? `到 ${core.clock(current.arrival, true)} · ${current.departureKnown ? "发 " + core.clock(current.departure, true) : "发车时间未知"}` : "";
  return { station, direction, trains, current, queried: matches && snapshot ? core.clock(snapshot.fetchedAt, true) : "尚未查询",
    status, source, previous, bounds, phase, targetTime, timerLabel, fresh: !!fresh, usable,
    service: current?.assessment.label ?? "", evidence: current?.assessment.evidence ?? "" };
}
