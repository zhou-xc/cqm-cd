import { Button, Group, HStack, ProgressView, Rectangle, Text, TimerIntervalLabel, VStack, Widget, ZStack } from "scripting";
import { clock, session } from "./session";
import { RestartDemo } from "./app_intents";

const renderedAt = Date.now();
const start = session();
const width = Math.max(100, Widget.displaySize.width - 24);
const height = 62;

// EXPERIMENT, NOT A VERIFIED WIDGET FEATURE:
// A native timer progress bar samples the wall clock after JS has ended.
// Magnify its centre so the fill crossing 50% reveals the whole card.
// Convert brightness to alpha; contrast is intended to suppress the track.
// Whether the host preserves these dynamic filters/masks requires an iPhone test.
function TimeMask({ at }: { at: number }) {
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

function Card({ number, color, until }: { number: number; color: string; until: number }) {
  return <ZStack frame={{ width, height }}>
    <Rectangle fill={color} />
    <HStack spacing={12} padding={8} foregroundStyle="white">
      <VStack alignment="leading" spacing={2}>
        <Text font={18} fontWeight="semibold">{`第 ${number} 班（模拟）`}</Text>
        <Text font={9}>{`${clock(until)} 切换`}</Text>
      </VStack>
      <TimerIntervalLabel from={start} to={until} countsDown showsHours={false}
        font={25} monospacedDigit lineLimit={1} minScaleFactor={0.5} />
    </HStack>
  </ZStack>;
}

// All four layers are present from the first render. No Date.now() conditions
// select a card later; no JS timer, delayed network call or animated loop.
Widget.present(
  <VStack spacing={2} padding={10} widgetBackground="#171717" foregroundStyle="white">
    <Text font={11}>时间遮罩 · 实验版</Text>
    <ZStack frame={{ width, height }} clipped>
      <Card number={1} color="#174ABA" until={start + 20000} />
      <ZStack frame={{ width, height }} mask={<TimeMask at={start + 20000} />}>
        <Card number={2} color="#7030A0" until={start + 40000} />
      </ZStack>
      <ZStack frame={{ width, height }} mask={<TimeMask at={start + 40000} />}>
        <Card number={3} color="#08734F" until={start + 60000} />
      </ZStack>
      <ZStack frame={{ width, height }} mask={<TimeMask at={start + 60000} />}>
        <Rectangle fill="#303030" />
        <VStack spacing={3}>
          <Text font={17}>演示结束</Text>
          <Text font={9}>{`预定 ${clock(start + 60000)}`}</Text>
        </VStack>
      </ZStack>
    </ZStack>
    <Button intent={RestartDemo()} buttonStyle="plain">
      <Text font={12} frame={{ minHeight: 44 }}>重开 60 秒演示</Text>
    </Button>
    <Text font={8} lineLimit={1} minScaleFactor={0.6}>{`渲染 ${clock(renderedAt)} · 应保持不变`}</Text>
  </VStack>,
  // Ask for no near-term rerun. The OS can still rerun independently;
  // the immutable renderedAt label makes such a rerun observable.
  { policy: "after", date: new Date(renderedAt + 24 * 60 * 60 * 1000) },
);
