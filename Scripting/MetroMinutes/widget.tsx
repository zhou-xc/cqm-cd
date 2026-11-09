import { Button, HStack, Image, Rectangle, Script, Text, VStack, Widget, ZStack } from "scripting";
import core, { type Preferences, type Direction } from "./core";
import { display, type Result } from "./data";
import { widgetCards, nextWidgetReload, type WidgetDisplay, type WidgetFrame } from "./widget_timeline";
import { TimeGate } from "./time_gate";
import { query, savedPreferences, savedWidgetRendering } from "./service";
import { Countdown } from "./countdown";
import { RefreshArrival } from "./app_intents";
import { currentScene, savedScenes } from "./scenes";
import { CommuteWidget } from "./commute_widget";
import { VERSION, bindScene, widgetSelection } from "./commute";

function Timing({ d, fetchedAt, large }: { d: WidgetDisplay; fetchedAt: number; large: boolean }) {
  return <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    {d.targetTime !== null
      ? <Countdown key={d.targetTime} arrival={d.targetTime} from={fetchedAt} size={large ? 34 : 24} />
      : !d.current ? <Text font={24}>--:--</Text> : null}
    {large && d.timerLabel ? <Text font={8}>{d.timerLabel}</Text> : null}
    <Text font={large ? 9 : 8} lineLimit={1} minScaleFactor={0.5}>{large ? d.status : [d.timerLabel, d.status].filter(Boolean).join(" · ")}</Text>
  </VStack>;
}

function Arrival({ d, arrived, fetchedAt, large, width, dark }: {
  d: WidgetDisplay; arrived?: WidgetFrame; fetchedAt: number; large: boolean; width: number; dark: boolean;
}) {
  const height = large ? 64 : 40;
  return <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={large ? 13 : 11} lineLimit={1} minScaleFactor={0.6}>{large ? d.direction : [d.direction, d.current?.assessment.kind].filter(Boolean).join(" · ")}</Text>
    {large && d.service ? <Text font={9} lineLimit={1} minScaleFactor={0.6}>{d.service}</Text> : null}
    {arrived ? <ZStack frame={{ width, height }} clipped contentShape="rect">
      <VStack frame={{ width, height, alignment: "topLeading" }}><Timing d={d} fetchedAt={fetchedAt} large={large} /></VStack>
      <ZStack frame={{ width, height }} contentShape="rect" mask={<TimeGate at={arrived.at} width={width} height={height} />}>
        <Rectangle fill={dark ? "#171717" : "#FAFAFA"} frame={{ width, height }} />
        <VStack frame={{ width, height, alignment: "topLeading" }}><Timing d={arrived.view} fetchedAt={fetchedAt} large={large} /></VStack>
      </ZStack>
    </ZStack> : <Timing d={d} fetchedAt={fetchedAt} large={large} />}
    {d.bounds ? <Text font={8} lineLimit={1} minScaleFactor={0.6}>{d.bounds}</Text> : null}
    {large && d.trains.slice(1, 3).map(t => <Text font={10} lineLimit={1} minScaleFactor={0.6} key={t.arrival + t.destination}>
      {`${core.clock(t.arrival)} · ${t.assessment.destination} ${t.assessment.label}`}
    </Text>)}
  </VStack>;
}

function ArrivalDeck({ p, result, dir, now, width, height, large, automatic }: {
  p: Preferences; result: Result; dir: Direction; now: number; width: number; height: number; large: boolean; automatic: boolean;
}) {
  const d = display(p, result, now, dir);
  const fetchedAt = result.snapshot?.fetchedAt ?? now;
  const source = (value: string) => <Text font={7} lineLimit={1} minScaleFactor={0.55}>{value}</Text>;
  // The default path never builds a mask, filter, progress view or future card.
  // It can be selected from the app even if a previous automatic render is blank.
  if (!automatic) return <VStack alignment="leading" spacing={1} frame={{ width }}>
    <VStack frame={{ width, height, alignment: "topLeading" }}>
      <Arrival d={d} fetchedAt={fetchedAt} large={large} width={width} dark={p.dark} />
    </VStack>
    {source(d.source ? `${d.source} · 到零请刷新` : d.status)}
  </VStack>;

  const cards = widgetCards(p, result, now, dir);
  const staleAt = fetchedAt + core.MAX_AGE;
  const label = d.source || (d.phase === "expired" ? "已停止推算" : "请刷新获取班次");
  // Three train cards + one terminal card, as in the demo. Within each train,
  // only the small timer/status region changes at arrival. Controls stay outside.
  return <VStack alignment="leading" spacing={1} frame={{ width }} contentShape="rect">
    <ZStack frame={{ width, height }} clipped contentShape="rect">
    {cards.map((frame, i) => <ZStack key={`${dir}:${frame.at}`} frame={{ width, height }} contentShape="rect"
      mask={i ? <TimeGate at={frame.at} width={width} height={height} /> : undefined}>
      <Rectangle fill={p.dark ? "#171717" : "#FAFAFA"} frame={{ width, height }} />
      <VStack frame={{ width, height, alignment: "topLeading" }}>
        <Arrival d={frame.view} arrived={frame.arrived} fetchedAt={fetchedAt} large={large} width={width} dark={p.dark} />
      </VStack>
    </ZStack>)}
    </ZStack>
    {d.usable && now < staleAt ? <ZStack frame={{ width, height: 10 }} clipped contentShape="rect">
      <VStack frame={{ width, height: 10, alignment: "leading" }}>{source(label)}</VStack>
      <ZStack frame={{ width, height: 10 }} contentShape="rect" mask={<TimeGate at={staleAt} width={width} height={10} />}>
        <Rectangle fill={p.dark ? "#171717" : "#FAFAFA"} frame={{ width, height: 10 }} />
        <VStack frame={{ width, height: 10, alignment: "leading" }}>{source(`${result.error ? "刷新失败 · " : ""}旧数据推算`)}</VStack>
      </ZStack>
    </ZStack> : source(label)}
  </VStack>;
}

async function main() {
  try {
    const selection = widgetSelection(Widget.parameter);
    const scene = currentScene(Widget.parameter);
    const p = scene.preferences;
    if (selection.content === "commute" && scene.ready) {
      const book = savedScenes();
      const list = Widget.family === "systemLarge" && !selection.parameter.startsWith("CQMETRO1:")
        ? [book.scenes.work, book.scenes.home].filter((s): s is typeof scene => !!s) : [scene];
      if (!list.length) list.push(scene);
      const requests = new Map<string, ReturnType<typeof query>>();
      const items = await Promise.all(list.map(async s => {
        const key = `${s.preferences.lineID}:${s.preferences.stationID}`;
        if (!requests.has(key)) requests.set(key, query(s.preferences));
        return { scene: s, result: await requests.get(key)! };
      }));
      const now = Date.now();
      Widget.present(<CommuteWidget items={items} current={scene} now={now} family={Widget.family}
        width={Math.max(110, Widget.displaySize.width - 24)} automatic={savedWidgetRendering() === "automatic"}
        parameter={String(Widget.parameter ?? "")} />,
        { policy: "after", date: new Date(Math.min(...items.map(i => nextWidgetReload(i.result, now)))) });
      return;
    }
    const result = await query(p);
    const now = Date.now();
    const automatic = savedWidgetRendering() === "automatic";
    const d = display(p, result, now);
    const small = Widget.family === "systemSmall";
    const large = Widget.family === "systemLarge";
    const contentWidth = Math.max(110, Widget.displaySize.width - 24);
    const cardWidth = small ? contentWidth : (contentWidth - 12) / 2;
    const cardHeight = large ? Math.max(130, Math.min(170, Widget.displaySize.height - 110)) : 66;
    const refreshWidth = small ? 44 : 76;
    const open = Script.createRunURLScheme(Script.name, {
      parameter: selection.parameter || (scene.ready ? bindScene(scene.id) : core.parameter(p)),
    });
    const refresh = <Button intent={RefreshArrival(core.parameter(p))} buttonStyle="plain"
      frame={{ width: refreshWidth, height: 44 }} contentShape="rect"
      accessibilityLabel="刷新到站信息" accessibilityHint="重新查询班次并更新组件">
      <HStack spacing={4} frame={{ width: refreshWidth, height: 44 }} contentShape="rect">
        <Image systemName="arrow.clockwise" font={20} />
        {!small ? <Text font={12}>刷新</Text> : null}
      </HStack>
    </Button>;
    Widget.present(
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
        widgetBackground={p.dark ? "#171717" : "#FAFAFA"}
        foregroundStyle={p.dark ? "white" : "black"} widgetURL={open}>
        <ZStack alignment="topTrailing" padding={12}>
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={5}>
            <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Text font={small ? 16 : 20} fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>{d.station.stationName}</Text>
              <Text font={10} lineLimit={1}>{d.station.lineName}</Text>
            </VStack>
            <HStack frame={{ width: refreshWidth, height: 44 }} />
          </HStack>
          <HStack alignment="top" spacing={12} frame={{ width: contentWidth }} contentShape="rect">
            <ArrivalDeck p={p} result={result} dir={p.direction} now={now} width={cardWidth} height={cardHeight} large={large} automatic={automatic} />
            {!small ? <ArrivalDeck p={p} result={result} dir={p.direction === "up" ? "down" : "up"}
              now={now} width={cardWidth} height={cardHeight} large={large} automatic={automatic} /> : null}
          </HStack>
          <Text font={8} lineLimit={1} minScaleFactor={0.6}>{`查询 ${d.queried} · ${VERSION} ${automatic ? "自动" : "兼容"}`}</Text>
        </VStack>
        {/* Clip/mask only governs drawing. Keep the hit target above every
            magnified time layer, with an explicit rectangular button label. */}
        {refresh}
        </ZStack>
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
