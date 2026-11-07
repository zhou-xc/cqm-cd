import { Text, TimerIntervalLabel } from "scripting";

export function Countdown({ arrival, from, size = 44 }: { arrival: number; from: number; size?: number }) {
  if (arrival <= Date.now()) return <Text font={size} fontWeight="semibold" monospacedDigit>0:00</Text>;
  // The bounded native interval reaches zero and stops. No JS polling or timer style DateLabel.
  return <TimerIntervalLabel from={Math.min(from, arrival)} to={arrival} countsDown showsHours={false}
    font={size} fontWeight="semibold" monospacedDigit lineLimit={1} minScaleFactor={0.7} />;
}
