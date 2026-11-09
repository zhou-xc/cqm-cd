import { Group, ProgressView, Rectangle, ZStack } from "scripting";

// Same native timer/filter combination as MetroTimeGateDemo, which the user
// confirmed switches cards while its rendered-at timestamp stays unchanged.
// This is a visual reveal, not a callback or a WidgetKit timeline submission.
// Keep the 2-second interval and the same 2 x 1 centre sample as that demo.
export function TimeGate({ at, width, height }: { at: number; width: number; height: number }) {
  // Crop/filter BEFORE magnifying. Previously every gate filtered a card-sized
  // surface around a 20-width, 4-height progress bar; nested dwell gates added
  // more compositing work. Only the tiny centre sample needs those filters.
  // Separate wrappers make crop -> filters -> scale explicit, independent of
  // the host's modifier ordering on a single view. Native memory still needs
  // iOS verification; this bounds the declared filter surfaces, not OS memory.
  return <ZStack frame={{ width, height }} clipped contentShape="rect">
    <ZStack scaleEffect={{ x: width / 2, y: height, anchor: "center" }}>
      <ZStack frame={{ width: 2, height: 1 }} luminanceToAlpha>
        <ZStack frame={{ width: 2, height: 1 }} contrast={100}>
          <ZStack frame={{ width: 2, height: 1 }} clipped environments={{ colorScheme: "dark", layoutDirection: "leftToRight" }}>
            <Rectangle fill="black" frame={{ width: 2, height: 1 }} />
            <ProgressView timerFrom={at - 1000} timerTo={at + 1000} countsDown={false}
              progressViewStyle="linear" tint="white" foregroundStyle="white"
              label={<Group />} currentValueLabel={<Group />}
              frame={{ width: 40, height: 4 }} />
          </ZStack>
        </ZStack>
      </ZStack>
    </ZStack>
  </ZStack>;
}
