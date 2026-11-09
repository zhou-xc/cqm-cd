import type { Direction, Station, Train } from "./core";

// Transcribed from the four user-provided timetable images on 2026-11-09.
// Effective dates/holiday exceptions are not printed. These are reference rules,
// not a live operating guarantee. Only colored (express/rapid) times are listed.
type Hours = Record<number, number[]>;
const repeat = (from: number, to: number, minutes: number[]): Hours =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, minutes]));
export const THROUGH_STOPS = ["唐家沱", "头塘", "重庆北站北广场", "民安大道", "冉家坝", "沙坪坝", "重庆图书馆", "上桥", "重庆西站", "金建路", "华岩中心", "跳磴"];
export const RAPID_STOPS = ["兰花路", "万寿路", "七星岗", "大礼堂", "曾家岩", "鲤鱼池", "红土地", "重庆北站南广场", "重庆北站北广场", "上湾路", "江北机场T3航站楼", "江北机场T2航站楼", "中央公园西", "王家庄"];
type Profile = {
  id: string; image: number; station: string; line: string; direction?: Direction;
  destination: string; segmentDestinations: string[]; kind: "直快" | "快速";
  weekday: Hours; weekend: Hours;
};
export const PROFILES: Profile[] = [
  { id: "shangqiao-tiaodeng", image: 1, station: "上桥", line: "50", destination: "跳磴", segmentDestinations: ["二郎"], kind: "直快",
    weekday: { 7: [24], ...repeat(8, 15, [0, 30]), 16: [0, 31], 17: [2, 29], 18: [1, 32], 19: [0, 31], 20: [29] },
    weekend: { 7: [24], ...repeat(8, 19, [0, 30]), 20: [29] } },
  { id: "shangqiao-tangjiatuo", image: 1, station: "上桥", line: "50", destination: "唐家沱", segmentDestinations: ["重庆北站南广场"], kind: "直快",
    weekday: repeat(7, 19, [3, 33]), weekend: repeat(7, 19, [3, 33]) },
  { id: "tiaodeng-tangjiatuo", image: 2, station: "跳磴", line: "05001", direction: "up", destination: "唐家沱", segmentDestinations: ["悦港北路"], kind: "直快",
    weekday: { 6: [45], ...repeat(7, 18, [15, 45]), 19: [15] }, weekend: { 6: [45], ...repeat(7, 18, [15, 45]), 19: [15] } },
  { id: "tiaodeng-terminal", image: 2, station: "跳磴", line: "05001", direction: "down", destination: "跳磴", segmentDestinations: [], kind: "直快",
    weekday: { 7: [42], ...repeat(8, 15, [17, 47]), 16: [17, 48], 17: [20, 47], 18: [19, 50], 19: [17, 49], 20: [47] },
    weekend: { 7: [42], ...repeat(8, 19, [18, 48]), 20: [47] } },
  { id: "minan-tiaodeng", image: 3, station: "民安大道", line: "04", direction: "up", destination: "跳磴", segmentDestinations: ["民安大道", "顺水寺公园", "石马河立交"], kind: "直快",
    weekday: { 7: [1, 36], ...repeat(8, 15, [6, 36]), 16: [7, 39], 17: [6, 37], 18: [9, 36], 19: [7], 20: [6] },
    weekend: { 7: [1, 36], ...repeat(8, 18, [6, 36]), 19: [6, 38], 20: [6] } },
  { id: "minan-tangjiatuo", image: 3, station: "民安大道", line: "04", direction: "down", destination: "唐家沱", segmentDestinations: ["黄岭"], kind: "直快",
    weekday: repeat(7, 19, [25, 55]), weekend: repeat(7, 19, [25, 55]) },
  { id: "lanhualu-wangjiazhuang", image: 4, station: "兰花路", line: "10", direction: "down", destination: "王家庄", segmentDestinations: [], kind: "快速",
    weekday: { ...repeat(7, 14, [8, 38]), 15: [8, 39], 16: [9, 38], 17: [9, 39], 18: [8, 39], 19: [9, 38] },
    weekend: repeat(7, 19, [8, 38]) },
];

export type Assessment = {
  kind: "直快" | "快速" | "疑似直快" | "疑似快速" | "";
  stop: "confirmed" | "unknown" | "passing";
  label: string; destination: string; evidence: string;
};
const canonical = (s: string) => s.trim().replace(/跳蹬/g, "跳磴");
export const TIMETABLE_TOLERANCE_MINUTES = 10;
export function assess(station: Station, dir: Direction, train: Train): Assessment {
  const destination = canonical(train.destination);
  const flagged = train.skipStopFlag === 2;
  const date = new Date(train.departure + 8 * 3600000);
  const day = date.getUTCDay();
  const calendar = day === 0 || day === 6 ? "weekend" : "weekday";
  const departureMinute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const eligible = train.departureKnown ? PROFILES.filter(profile =>
    profile.station === station.stationName && profile.line === station.lineID &&
    (!profile.direction || profile.direction === dir) &&
    (destination === profile.destination || (flagged && profile.segmentDestinations.includes(destination)))) : [];
  const matches = eligible.flatMap(profile => Object.entries(profile[calendar]).flatMap(([hour, minutes]) =>
    minutes.map(minute => ({ profile, planned: Number(hour) * 60 + minute,
      delta: departureMinute - (Number(hour) * 60 + minute) }))))
    .filter(match => Math.abs(match.delta) <= TIMETABLE_TOLERANCE_MINUTES && (flagged || match.delta === 0));
  if (matches.length === 1) {
    const { profile, planned, delta } = matches[0];
    const stops = profile.kind === "快速" ? RAPID_STOPS : THROUGH_STOPS;
    const stopping = stops.includes(station.stationName);
    return { kind: profile.kind, stop: stopping ? "confirmed" : "passing", destination: profile.destination,
      label: `${profile.kind} · ${stopping ? "按图停靠" : "按图不停靠"}`,
      evidence: `图${profile.image} · ${calendar === "weekday" ? "平日" : "双休日"} ${String(Math.floor(planned / 60)).padStart(2, "0")}:${String(planned % 60).padStart(2, "0")}，偏差${delta >= 0 ? "+" : ""}${delta}分（允许±10分）${flagged ? "；接口停站标记冲突" : ""}` };
  }
  if (matches.length > 1) return { kind: station.lineID === "10" ? "疑似快速" : "疑似直快", stop: "unknown", destination,
    label: "班次匹配有歧义 · 停靠待确认", evidence: "±10分钟范围内匹配到多个时刻，不能唯一确认班次" };
  // These destinations leave the selected line and identify the through route.
  // Tangjiatuo on line 4 and Tiaodeng on line 5 also serve local trains: not proof.
  const through = (station.lineID === "50" && ["跳磴", "唐家沱"].includes(destination)) ||
    (station.lineID === "04" && dir === "up" && destination === "跳磴") ||
    (station.lineID === "05001" && dir === "up" && destination === "唐家沱");
  if (through) {
    const stopping = THROUGH_STOPS.includes(station.stationName);
    return { kind: "直快", stop: stopping ? "confirmed" : "passing", destination,
      label: `直快 · ${stopping ? "按图停靠" : "按图不停靠"}`, evidence: "跨线终点匹配图1–3交路及停靠表；未匹配本站时刻" };
  }
  if (flagged || train.skipStopFlag !== 1) {
    const kind = flagged && station.lineID === "10" ? "疑似快速"
      : flagged && ["04", "50", "05001"].includes(station.lineID) ? "疑似直快" : "";
    return { kind, stop: "unknown", destination,
      label: [kind, "停靠待确认"].filter(Boolean).join(" · "),
      evidence: flagged ? "接口停站标记为2，尚无足够的本站班次匹配证据" : "缺少可核对的停站标记" };
  }
  return { kind: "", stop: "confirmed", label: "", destination, evidence: "接口常规停站记录" };
}
