import { HStack, Image, LiveActivity, LiveActivityUI, LiveActivityUIExpandedCenter, Text, VStack } from "scripting";
import { Countdown } from "./countdown";
import core from "./core";

export const ACTIVITY_NAME = "CQMetroArrival";
export type ActivityData = { station: string; line: string; direction: string; arrival: number; fetchedAt: number;
  departure?: number; service?: string; stop?: "confirmed" | "unknown" | "passing" };
function Content(s: ActivityData) {
  return <HStack spacing={16} padding={14}>
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font="headline">{s.station + " · " + s.line}</Text>
      <Text font="subheadline" lineLimit={2}>{s.direction}</Text>
      {s.service ? <Text font="caption">{s.service}</Text> : null}
      <Text font="caption2">{`查 ${core.clock(s.fetchedAt, true)} · 单班推算`}</Text>
      <Text font="caption2">{`到 ${core.clock(s.arrival, true)}${s.departure ? " · 发 " + core.clock(s.departure, true) : ""}`}</Text>
      <Text font="caption2">到零后请更新班次</Text>
    </VStack>
    <VStack alignment="trailing" spacing={2}>
      <Text font="caption2">距预计到达</Text>
      <Countdown arrival={s.arrival} from={s.fetchedAt} size={26} />
      {s.departure ? <VStack alignment="trailing" spacing={2}>
        <Text font="caption2">距预计发车</Text>
        <Countdown arrival={s.departure} from={s.fetchedAt} size={20} />
      </VStack> : null}
    </VStack>
  </HStack>;
}
export const MetroActivity = LiveActivity.register(ACTIVITY_NAME, (s: ActivityData) =>
  <LiveActivityUI content={<Content {...s} />}
    compactLeading={<Text font={11}>{s.stop === "unknown" ? "待确认" : s.stop === "passing" ? "不停靠" : s.departure ? "发车" : "到达"}</Text>}
    compactTrailing={<Countdown arrival={s.departure ?? s.arrival} from={s.fetchedAt} size={16} />}
    minimal={<Image systemName="tram.fill" />}>
    <LiveActivityUIExpandedCenter><Content {...s} /></LiveActivityUIExpandedCenter>
  </LiveActivityUI>,
);
