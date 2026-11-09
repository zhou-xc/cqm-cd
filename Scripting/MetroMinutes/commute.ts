import core, { STATIONS, type Preferences } from "./core";
import { display, type Result, type DisplayTrain } from "./data";
import { THROUGH_STOPS, RAPID_STOPS } from "./timetable";

export const VERSION = "1.4.0";
export type SceneID = "work" | "home";
export type WidgetContent = "waiting" | "commute";
export const sceneName = (id: SceneID) => id === "work" ? "上班" : "回家";
export type Scene = { version: 1; id: SceneID; preferences: Preferences; destination: string;
  walkMinutes: number; entryMinutes: number; bufferMinutes: number; ready: boolean };
export type SceneBook = { version: 1; active: SceneID; scenes: Partial<Record<SceneID, Scene>>; onboarded: boolean };
export function draftScene(p: Preferences, id: SceneID = "work"): Scene {
  return { version: 1, id, preferences: core.preferences(p), destination: "", walkMinutes: 5, entryMinutes: 2, bufferMinutes: 1, ready: false };
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("配置格式无效");
  return v as Record<string, unknown>;
};
export function validateScene(value: unknown): Scene {
  const v = object(value);
  if (v.version !== 1 || (v.id !== "work" && v.id !== "home")) throw Error("不支持的场景版本或名称");
  const raw = object(v.preferences);
  if (typeof raw.stationID !== "string" || typeof raw.lineID !== "string" || !["up", "down"].includes(String(raw.direction)) ||
    typeof raw.dark !== "boolean" || !["timer", "minutes"].includes(String(raw.mode))) throw Error("场景缺少有效的线路、站点或方向");
  const preferences = core.preferences(raw as unknown as Preferences);
  if (typeof v.destination !== "string" || !STATIONS.some(s => s.stationName === v.destination)) throw Error("请选择有效的下车站");
  if (v.destination === core.stationFor(preferences).stationName) throw Error("上车站和下车站不能相同");
  const minutes = (name: string, min: number, max: number) => {
    const n = v[name];
    if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw Error("到站时间必须是范围内的整数分钟");
    return n;
  };
  return { version: 1, id: v.id, preferences, destination: v.destination,
    walkMinutes: minutes("walkMinutes", 0, 60), entryMinutes: minutes("entryMinutes", 0, 30),
    bufferMinutes: minutes("bufferMinutes", 1, 15), ready: true };
}
export function readBook(value: unknown): SceneBook {
  const book: SceneBook = { version: 1, active: "work", scenes: {}, onboarded: false };
  try {
    const v = object(value);
    if (v.version !== 1) return book;
    book.active = v.active === "home" ? "home" : "work";
    book.onboarded = v.onboarded === true;
    const scenes = object(v.scenes);
    for (const id of ["work", "home"] as const) {
      try { book.scenes[id] = validateScene({ ...object(scenes[id]), id }); } catch { /* preserve other valid scene */ }
    }
    if (!book.scenes[book.active]) book.active = book.scenes.work ? "work" : book.scenes.home ? "home" : "work";
  } catch { /* first use / corrupt storage */ }
  return book;
}
export function recommendedScene(book: SceneBook, now: number): SceneID | null {
  const hour = new Date(now + 8 * 3600000).getUTCHours();
  const id = hour >= 14 || hour < 4 ? "home" : "work";
  return book.scenes[id] && id !== book.active ? id : null;
}
export const bindScene = (id: SceneID, content: WidgetContent = "waiting") => `${content === "commute" ? "commute" : "scene"}:${id}`;
// Content is explicit per widget. Saving a commute profile must never turn a
// default waiting widget into departure advice, or change another widget.
export function widgetSelection(input: unknown): { content: WidgetContent; parameter: string } {
  const raw = input == null ? "" : String(input).trim();
  if (!raw.startsWith("commute:")) return { content: "waiting", parameter: raw };
  const key = raw.slice(8);
  if (key === "work" || key === "home") return { content: "commute", parameter: `scene:${key}` };
  if (key.startsWith("CQMETRO1:")) return { content: "commute", parameter: key };
  throw Error("通勤建议参数无效，请在 App 的添加桌面组件中重新复制");
}
export const shareScene = (scene: Scene) => "CQMETRO1:" + encodeURIComponent(JSON.stringify(validateScene(scene)));
export function importScene(text: string): Scene {
  const raw = text.trim();
  if (raw.length > 12000 || !raw.startsWith("CQMETRO1:")) throw Error("请粘贴以 CQMETRO1: 开头的完整场景配置码");
  try { return validateScene(JSON.parse(decodeURIComponent(raw.slice(9)))); }
  catch (e) { throw Error(`配置码无法导入：${e instanceof Error ? e.message : String(e)}`); }
}
export function resolveScene(input: unknown, book: SceneBook, fallback: Preferences): Scene {
  const { parameter: raw } = widgetSelection(input);
  if (!raw) return book.scenes[book.active] ?? draftScene(fallback, book.active);
  if (raw.startsWith("CQMETRO1:")) return importScene(raw);
  if (raw.startsWith("scene:")) {
    const id = raw.slice(6);
    if (id !== "work" && id !== "home") throw Error("未知的通勤场景");
    const scene = book.scenes[id];
    if (!scene) throw Error(`请先打开脚本保存${sceneName(id)}场景`);
    return scene;
  }
  // Legacy parameters deliberately remain a waiting-at-station widget.
  return draftScene(core.resolveParameter(raw, fallback));
}
export type Reachability = { state: "yes" | "no" | "unknown"; label: string };
const reach = (state: Reachability["state"], label: string): Reachability => ({ state, label });
const canonical = (s: string) => s.replace(/跳蹬/g, "跳磴");
export function destinationReach(scene: Scene, t: DisplayTrain): Reachability {
  const origin = core.stationFor(scene.preferences).stationName;
  const target = scene.destination, end = canonical(t.assessment.destination);
  if (!target) return reach("unknown", "未选择下车站");
  if (target === origin) return reach("no", "已在所选下车站");
  if (t.assessment.stop === "passing") return reach("no", "本班不停上车站");
  if (t.assessment.stop !== "confirmed") return reach("unknown", "停靠待确认");
  const kind = t.assessment.kind;
  if (kind === "直快" || kind === "快速") {
    if (kind === "快速" && !(scene.preferences.lineID === "10" && scene.preferences.direction === "down" && end === "王家庄"))
      return reach("unknown", "该方向快车停靠待确认");
    const stops = kind === "直快" ? THROUGH_STOPS : RAPID_STOPS;
    const a = stops.indexOf(origin), b = stops.indexOf(target), z = stops.indexOf(end);
    if (a < 0 || z < 0 || a === z) return reach("unknown", "交路方向待确认");
    if (b < 0) return reach("no", `${kind}不直达所选下车站`);
    return (b - a) * (z - a) > 0 && Math.abs(b - a) <= Math.abs(z - a)
      ? reach("yes", `${kind}可乘（按图）`) : reach("no", "下车站不在本班前方区段");
  }
  if (kind) return reach("unknown", "快车交路待确认");
  // Only these non-branching line sequences have been reviewed against the
  // bundled official catalog. Never infer loop direction from up/down or IDs.
  if (!["04", "10"].includes(scene.preferences.lineID)) return target === canonical(t.destination)
    ? reach("yes", "普通车可达终点") : reach("unknown", "经过下车站的顺序待确认");
  const order = STATIONS.filter(s => s.lineID === scene.preferences.lineID).map(s => s.stationName);
  const a = order.indexOf(origin), b = order.indexOf(target), z = order.indexOf(canonical(t.destination));
  if (a < 0 || z < 0) return reach("unknown", "本班终点区段待确认");
  const sign = scene.preferences.direction === "up" ? 1 : -1;
  if ((z - a) * sign <= 0) return reach("unknown", "接口终点与方向需核对");
  return b >= 0 && (b - a) * sign > 0 && (z - b) * sign >= 0
    ? reach("yes", "普通车可乘（按线路）") : reach("no", "本班不直达所选下车站");
}
export function advice(scene: Scene, result: Result, now: number) {
  const d = display(scene.preferences, result, now);
  const travelMinutes = scene.walkMinutes + scene.entryMinutes + scene.bufferMinutes;
  const rows = d.trains.slice(0, 3).map((train, index) => ({ train, number: index + 1,
    reach: destinationReach(scene, train), leaveAt: train.departure - travelMinutes * 60000 }));
  const candidates = scene.ready && d.fresh && !result.error
    ? rows.filter(r => r.reach.state === "yes" && r.train.departureKnown && r.leaveAt >= now) : [];
  const selected = candidates[0];
  const title = !scene.ready ? "设置通勤场景，规划出门时间"
    : !d.fresh || result.error ? "请刷新后再规划"
    : !rows.length ? "暂无可用班次 · 请刷新"
    : selected ? `建议${selected.number === 1 ? "本班" : selected.number === 2 ? "下一班" : "第3班"}`
    : rows.some(r => r.reach.state === "unknown") ? "停靠待确认，暂不推荐"
    : rows.some(r => r.reach.state === "yes" && !r.train.departureKnown) ? "发车时间未知，暂不推荐"
    : rows.some(r => r.reach.state === "yes") ? "时间不足，查询后续班次" : "近三班无已确认的直达车";
  const detail = selected ? `${core.clock(selected.leaveAt, true)} 前出门 · 预留 ${scene.bufferMinutes} 分钟`
    : !scene.ready ? "选择上下车站及步行时间" : "仅按已确认停靠和有效发车时间规划";
  return { d, rows, selected, title, detail, travelMinutes, leaveAt: selected?.leaveAt ?? null };
}
export type Advice = ReturnType<typeof advice>;
// At most three recommendations and one final prompt. Absolute deadlines and
// native timers avoid frozen relative text such as “还有 3 分钟出门”.
export function adviceCards(scene: Scene, result: Result, now: number) {
  const first = advice(scene, result, now);
  if (result.snapshot) result = { ...result, snapshot: { ...result.snapshot,
    [scene.preferences.direction]: first.d.trains.slice(0, 3) } };
  const end = result.snapshot ? result.snapshot.fetchedAt + core.MAX_AGE : now;
  const times = [now, end, ...first.rows.map(r => r.leaveAt + 1)]
    .filter(t => Number.isFinite(t) && t >= now && t <= Math.max(now, end)).sort((a, b) => a - b);
  const cards: { at: number; view: Advice }[] = [];
  let last = "";
  for (const at of times) {
    const view = advice(scene, result, at);
    const key = view.selected ? `${view.selected.train.arrival}:${view.selected.train.destination}` : "end";
    if (key !== last) { cards.push({ at, view }); last = key; }
    if (!view.selected) break;
  }
  return cards;
}
