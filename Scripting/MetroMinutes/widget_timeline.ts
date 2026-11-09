import core, { type Preferences, type Direction } from "./core";
import { display, trainEnd, INFERENCE_AGE, type Result } from "./data";

export type WidgetDisplay = ReturnType<typeof display>;
export type WidgetFrame = { at: number; view: WidgetDisplay };

function frameAt(p: Preferences, result: Result, at: number, dir: Direction): WidgetFrame {
  const view = display(p, result, at, dir);
  if (view.phase === "departed") view.status = "班次数据已用完 · 请刷新";
  return { at, view };
}

// Only changes visible in a widget require another native layer. In particular,
// do not add a layer when a non-current train's approach time passes.
function signature({ view: d }: WidgetFrame) {
  return JSON.stringify([d.direction, d.service, d.status, d.bounds, d.targetTime,
    d.timerLabel, d.source, d.trains.map(t => [t.arrival, t.destination, t.assessment.label])]);
}

export function widgetTimeline(p: Preferences, result: Result, now: number, dir: Direction = p.direction): WidgetFrame[] {
  const initial = frameAt(p, result, now, dir);
  const s = result.snapshot;
  if (!s || !initial.view.usable) return [initial];

  // At most three upcoming records per direction. Once these are exhausted,
  // reveal a refresh prompt, never invent a fourth train or cycle back to one.
  const trains = initial.view.trains.slice(0, 3);
  const limited: Result = { ...result, snapshot: { ...s, [dir]: trains } };
  const expiry = s.fetchedAt + INFERENCE_AGE;
  const times = new Set([now, s.fetchedAt + core.MAX_AGE, expiry]);
  for (const t of trains) {
    times.add(t.arrival - 30000);
    times.add(t.arrival);
    if (t.departureKnown) times.add(t.departure - 15000);
    times.add(trainEnd(t));
  }
  const frames: WidgetFrame[] = [];
  let previous = "";
  for (const at of [...times].filter(t => Number.isFinite(t) && t >= now && t <= expiry).sort((a, b) => a - b)) {
    // Preserve the already-empty batch's departed/unknown-departure wording.
    const frame = frameAt(p, trains.length ? limited : result, at, dir);
    const key = signature(frame);
    if (key !== previous) { frames.push(frame); previous = key; }
  }
  return frames;
}

// Visual phase transitions are handled by prebuilt masks. This request is only
// for replacing observations; WidgetKit may delay it without freezing the deck.
export function nextWidgetReload(result: Result, now: number): number {
  const fetchedAt = result.snapshot?.fetchedAt;
  if (result.error || typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt) || fetchedAt > now + 60000) return now + 60000;
  return Math.max(now + 60000, fetchedAt + core.MAX_AGE);
}
