import { Group, ProgressView, Rectangle, ZStack } from "scripting";

// Same native timer/filter combination as MetroTimeGateDemo, which the user
// confirmed switches cards while its rendered-at timestamp stays unchanged.
// This is a visual reveal, not a callback or a WidgetKit timeline submission.
// Keep the 2-second interval and magnified centre used in that device test.
export function TimeGate({ at, width, height }: { at: number; width: number; height: number }) {
  return <ZStack frame={{ width, height }} luminanceToAlpha>
    <ZStack frame={{ width, height }} contrast={100}>
      <ZStack frame={{ width, height }} clipped environments={{ colorScheme: "dark", layoutDirection: "leftToRight" }}>
        <Rectangle fill="black" frame={{ width, height }} />
        <ZStack scaleEffect={{ x: width / 2, y: height, anchor: "center" }}>
          <ProgressView timerFrom={at - 1000} timerTo={at + 1000} countsDown={false}
            progressViewStyle="linear" tint="white" foregroundStyle="white"
            label={<Group />} currentValueLabel={<Group />}
            frame={{ width: 40, height: 4 }} />
        </ZStack>
      </ZStack>
    </ZStack>
  </ZStack>;
}
