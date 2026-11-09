// Independent from MetroMinutes: no network, preferences or train cache access.
const KEY = "cqmetro.time-gate-demo.start.v1";

export function restart() {
  const start = Date.now();
  Storage.set(KEY, start);
  return start;
}

export function session() {
  const saved = Storage.get<number>(KEY);
  return typeof saved === "number" && Number.isFinite(saved) ? saved : restart();
}

export function clock(time: number) {
  const d = new Date(time);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
}
