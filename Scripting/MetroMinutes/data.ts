import core, { type Preferences, type Snapshot, type Direction } from "./core";

export type Result = { snapshot: Snapshot | null; error: string | null };
export interface Ports {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): unknown;
  now(): number;
  request(p: Preferences): Promise<Snapshot>;
}
export const cacheKey = (p: Preferences) => `cqmetro.v1.${p.lineID}.${p.stationID}`;
// A failed explicit refresh stays visible during the following widget reload.
// A short cache window prevents a second HTTP request immediately after the intent.
export async function load(p: Preferences, force: boolean, io: Ports): Promise<Result> {
  const key = cacheKey(p);
  const previous = io.get<Result & { attemptedAt: number }>(key);
  if (!force && previous && io.now() - previous.attemptedAt >= 0 && io.now() - previous.attemptedAt < 20000) return previous;
  const attemptedAt = io.now();
  let result: Result;
  try { result = { snapshot: await io.request(p), error: null }; }
  catch (error) { result = { snapshot: previous?.snapshot ?? null, error: String(error instanceof Error ? error.message : error) }; }
  // An older request must not overwrite a response from a newer request.
  const newer = io.get<Result & { attemptedAt: number }>(key);
  if (newer && newer.attemptedAt > attemptedAt) return newer;
  io.set(key, { ...result, attemptedAt });
  return result;
}

export function display(p: Preferences, result: Result, now = Date.now(), dir: Direction = p.direction) {
  const station = core.stationFor(p);
  const snapshot = result.snapshot;
  const matches = snapshot?.stationID === p.stationID && snapshot?.lineID === p.lineID;
  const fresh = matches && core.fresh(snapshot, now);
  const trains = fresh ? core.trains(snapshot, dir, now) : [];
  const lastKnown = matches ? snapshot?.[dir] ?? [] : [];
  const direction = trains.length ? core.label(station, dir, trains)
    : lastKnown.length ? core.label(station, dir, lastKnown)
    : dir === "up" ? station.upLabel : station.downLabel;
  return {
    station, direction, trains,
    queried: matches && snapshot ? core.clock(snapshot.fetchedAt, true) : "尚未查询",
    status: result.error ? (fresh ? "刷新失败 · 缓存" : "查询失败 · 请刷新")
      : !fresh ? "数据过期 · 请刷新" : !trains.length ? "暂无班次" : "预计到站",
    fresh: !!fresh,
  };
}
