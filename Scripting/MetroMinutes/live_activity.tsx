import { HStack, Image, LiveActivity, LiveActivityUI, LiveActivityUIExpandedCenter, Text, VStack } from "scripting";
import { Countdown } from "./countdown";
import core from "./core";

export const ACTIVITY_NAME = "CQMetroArrival";
export type ActivityData = { station: string; line: string; direction: string; arrival: number; fetchedAt: number };
function Content(s: ActivityData) {
  return <HStack spacing={16} padding={14}>
    <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font="headline">{s.station + " · " + s.line}</Text>
      <Text font="subheadline" lineLimit={2}>{s.direction}</Text>
      <Text font="caption2">{`查询 ${core.clock(s.fetchedAt, true)} · 预计到站`}</Text>
    </VStack>
    <Countdown arrival={s.arrival} from={s.fetchedAt} size={32} />
  </HStack>;
}
export const MetroActivity = LiveActivity.register(ACTIVITY_NAME, (s: ActivityData) =>
  <LiveActivityUI content={<Content {...s} />}
    compactLeading={<Image systemName="tram.fill" />}
    compactTrailing={<Countdown arrival={s.arrival} from={s.fetchedAt} size={16} />}
    minimal={<Image systemName="tram.fill" />}>
    <LiveActivityUIExpandedCenter><Content {...s} /></LiveActivityUIExpandedCenter>
  </LiveActivityUI>,
);
