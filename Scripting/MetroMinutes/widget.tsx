import { Button, HStack, Image, Rectangle, Script, Text, VStack, Widget, ZStack } from "scripting";
import core, { type Preferences, type Direction } from "./core";
import { display, type Result } from "./data";
import { widgetTimeline, nextWidgetReload, type WidgetDisplay } from "./widget_timeline";
import { TimeGate } from "./time_gate";
import { query, savedPreferences } from "./service";
import { Countdown } from "./countdown";
import { RefreshArrival } from "./app_intents";

function Arrival({ d, fetchedAt, large }: { d: WidgetDisplay; fetchedAt: number; large: boolean }) {
  return <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={large ? 13 : 11} lineLimit={1} minScaleFactor={0.6}>{large ? d.direction : [d.direction, d.current?.assessment.kind].filter(Boolean).join(" · ")}</Text>
    {large && d.service ? <Text font={9} lineLimit={1} minScaleFactor={0.6}>{d.service}</Text> : null}
    {d.targetTime !== null
      ? <Countdown key={d.targetTime} arrival={d.targetTime} from={fetchedAt} size={large ? 34 : 24} />
      : !d.current ? <Text font={24}>--:--</Text> : null}
    {large && d.timerLabel ? <Text font={8}>{d.timerLabel}</Text> : null}
    <Text font={large ? 9 : 8} lineLimit={1} minScaleFactor={0.5}>{large ? d.status : [d.timerLabel, d.status].filter(Boolean).join(" · ")}</Text>
    {d.bounds ? <Text font={8} lineLimit={1} minScaleFactor={0.6}>{d.bounds}</Text> : null}
    {large && d.trains.slice(1, 3).map(t => <Text font={10} lineLimit={1} minScaleFactor={0.6} key={t.arrival + t.destination}>
      {`${core.clock(t.arrival)} · ${t.assessment.destination} ${t.assessment.label}`}
    </Text>)}
    <Text font={7} lineLimit={1} minScaleFactor={0.55}>{d.source || (d.phase === "expired" ? "已停止推算" : "请刷新获取班次")}</Text>
  </VStack>;
}

function ArrivalDeck({ p, result, dir, now, width, height, large }: {
  p: Preferences; result: Result; dir: Direction; now: number; width: number; height: number; large: boolean;
}) {
  const frames = widgetTimeline(p, result, now, dir);
  // Every frame is built once. Newer opaque cards cover all older content,
  // including its native timer, when the system-driven mask opens.
  // Keep interactive controls outside the stack so hidden cards cannot capture taps.
  return <ZStack frame={{ width, height }} clipped>
    {frames.map((frame, i) => <ZStack key={`${dir}:${frame.at}`} frame={{ width, height }}
      mask={i ? <TimeGate at={frame.at} width={width} height={height} /> : undefined}>
      <Rectangle fill={p.dark ? "#171717" : "#FAFAFA"} frame={{ width, height }} />
      <VStack frame={{ width, height, alignment: "topLeading" }}>
        <Arrival d={frame.view} fetchedAt={result.snapshot?.fetchedAt ?? now} large={large} />
      </VStack>
    </ZStack>)}
  </ZStack>;
}

async function main() {
  try {
    const p = core.resolveParameter(Widget.parameter, savedPreferences());
    const result = await query(p);
    const now = Date.now();
    const d = display(p, result, now);
    const small = Widget.family === "systemSmall";
    const large = Widget.family === "systemLarge";
    const contentWidth = Math.max(110, Widget.displaySize.width - 24);
    const cardWidth = small ? contentWidth : (contentWidth - 12) / 2;
    const cardHeight = Math.max(70, Math.min(220, Widget.displaySize.height - 80));
    const open = Script.createRunURLScheme(Script.name, { parameter: core.parameter(p) });
    const refresh = <Button intent={RefreshArrival(core.parameter(p))} buttonStyle="plain"
      accessibilityLabel="刷新到站信息" accessibilityHint="重新查询班次并更新自动切换画面">
      <HStack spacing={4} frame={{ minWidth: 44, minHeight: 44 }}>
        <Image systemName="arrow.clockwise" font={20} />
        {!small ? <Text font={12}>刷新</Text> : null}
      </HStack>
    </Button>;
    Widget.present(
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
        widgetBackground={p.dark ? "#171717" : "#FAFAFA"}
        foregroundStyle={p.dark ? "white" : "black"} widgetURL={open}>
        <VStack alignment="leading" spacing={2} padding={12}>
          <HStack spacing={5}>
            <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font={small ? 16 : 20} fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>{d.station.stationName}</Text>
              <Text font={10} lineLimit={1}>{d.station.lineName}</Text>
            </VStack>
            {refresh}
          </HStack>
          <HStack alignment="top" spacing={12}>
            <ArrivalDeck p={p} result={result} dir={p.direction} now={now} width={cardWidth} height={cardHeight} large={large} />
            {!small ? <ArrivalDeck p={p} result={result} dir={p.direction === "up" ? "down" : "up"}
              now={now} width={cardWidth} height={cardHeight} large={large} /> : null}
          </HStack>
          <Text font={8} lineLimit={1} minScaleFactor={0.6}>{`查询 ${d.queried}`}</Text>
        </VStack>
      </VStack>,
      { policy: "after", date: new Date(nextWidgetReload(result, now)) },
    );
  } catch (error) {
    const p = savedPreferences();
    Widget.present(<VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
      widgetBackground={p.dark ? "#171717" : "#FAFAFA"} foregroundStyle={p.dark ? "white" : "black"}>
      <VStack alignment="leading" spacing={8} padding={14}>
        <Text font="headline">重庆轨道到站</Text>
        <Text font="caption">{String(error instanceof Error ? error.message : error)}</Text>
        <Text font="caption">打开脚本重新选择站点</Text>
      </VStack>
    </VStack>, { policy: "after", date: new Date(Date.now() + 60000) });
  }
}
void main();
