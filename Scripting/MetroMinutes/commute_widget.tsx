import { Button, HStack, Image, Rectangle, Script, Text, VStack, ZStack } from "scripting";
import core from "./core";
import { advice, adviceCards, sceneName, shareScene, type Scene, type Advice } from "./commute";
import type { Result } from "./data";
import { Countdown } from "./countdown";
import { TimeGate } from "./time_gate";
import { RefreshCommute } from "./app_intents";

export type CommuteItem = { scene: Scene; result: Result };
function Recommendation({ view, scene, now, medium }: { view: Advice; scene: Scene; now: number; medium: boolean }) {
  const selected = view.selected;
  return <VStack alignment="leading" spacing={2}>
    <Text font={11} lineLimit={1} minScaleFactor={0.6}>{selected ? `建议 ${core.clock(selected.train.departure)} 发车班次` : view.title}</Text>
    {selected ? <VStack alignment="leading" spacing={1}>
      <Text font={9}>距建议出门时间</Text>
      <Countdown arrival={selected.leaveAt} from={now} size={medium ? 27 : 24} />
      <Text font={9} lineLimit={1} minScaleFactor={0.6}>{`${core.clock(selected.leaveAt, true)} 前出门 · ${selected.reach.label}`}</Text>
    </VStack> : <Text font={10} lineLimit={2}>{view.detail}</Text>}
    <Text font={8} lineLimit={1}>{`步行 ${scene.walkMinutes} + 进站 ${scene.entryMinutes} + 预留 ${scene.bufferMinutes} 分钟`}</Text>
  </VStack>;
}
function AdviceDeck({ item, now, automatic, width, height, medium }: {
  item: CommuteItem; now: number; automatic: boolean; width: number; height: number; medium: boolean;
}) {
  const frames = automatic ? adviceCards(item.scene, item.result, now) : [{ at: now, view: advice(item.scene, item.result, now) }];
  if (!automatic) return <VStack frame={{ width, height, alignment: "topLeading" }}>
    <Recommendation view={frames[0].view} scene={item.scene} now={now} medium={medium} />
  </VStack>;
  return <ZStack frame={{ width, height }} clipped contentShape="rect">
    {frames.map((f, i) => <ZStack key={f.at} frame={{ width, height }} contentShape="rect"
      mask={i ? <TimeGate at={f.at} width={width} height={height} /> : undefined}>
      <Rectangle fill={item.scene.preferences.dark ? "#171717" : "#FAFAFA"} frame={{ width, height }} />
      <VStack frame={{ width, height, alignment: "topLeading" }}>
        <Recommendation view={f.view} scene={item.scene} now={now} medium={medium} />
      </VStack>
    </ZStack>)}
  </ZStack>;
}
function ScenePanel({ item, now, automatic, width, medium, large, parameter }: {
  item: CommuteItem; now: number; automatic: boolean; width: number; medium: boolean; large: boolean; parameter: string;
}) {
  const { scene, result } = item, station = core.stationFor(scene.preferences);
  const view = advice(scene, result, now);
  const left = medium ? width * 0.55 : width;
  const refresh = <Button intent={RefreshCommute(parameter)} buttonStyle="plain"
    frame={{ width: 44, height: 44 }} contentShape="rect" accessibilityLabel={`刷新${sceneName(scene.id)}班次`}>
    <HStack frame={{ width: 44, height: 44 }} contentShape="rect"><Image systemName="arrow.clockwise" font={19} /></HStack>
  </Button>;
  return <ZStack alignment="topTrailing" frame={{ width }}>
    <VStack alignment="leading" spacing={2}>
      <HStack spacing={2}>
        <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font={14} fontWeight="semibold" lineLimit={1} minScaleFactor={0.6}>{`${sceneName(scene.id)} · ${station.stationName}`}</Text>
          <Text font={9} lineLimit={1} minScaleFactor={0.6}>{`${station.lineName} → ${scene.destination}`}</Text>
        </VStack><HStack frame={{ width: 44, height: 44 }} />
      </HStack>
      <HStack spacing={8} alignment="top" frame={{ width }} contentShape="rect">
        <AdviceDeck item={item} now={now} automatic={automatic} width={left} height={large ? 89 : 83} medium={medium} />
        {medium ? <VStack alignment="leading" spacing={4} frame={{ width: width - left - 8 }}>
          <Text font={10}>查询时的近三班</Text>
          {view.rows.map(r => <VStack key={r.train.arrival + r.train.destination} alignment="leading" spacing={0}>
            <Text font={10} lineLimit={1}>{`到 ${core.clock(r.train.arrival)} · ${r.train.departureKnown ? "发 " + core.clock(r.train.departure) : "发车未知"}`}</Text>
            <Text font={8} lineLimit={1} minScaleFactor={0.6}>{r.reach.label}</Text>
          </VStack>)}
        </VStack> : null}
      </HStack>
      <Text font={7} lineLimit={1} minScaleFactor={0.6}>{`查询 ${view.d.queried} · ${result.error ? "刷新失败，请重试" : result.snapshot ? "建议有效至 " + core.clock(result.snapshot.fetchedAt + core.MAX_AGE, true) : "请刷新"}`}</Text>
    </VStack>
    {refresh}
  </ZStack>;
}
export function CommuteWidget({ items, current, now, family, width, automatic, parameter }: {
  items: CommuteItem[]; current: Scene; now: number; family: string; width: number; automatic: boolean; parameter: string;
}) {
  const large = family === "systemLarge", medium = family !== "systemSmall";
  const dark = current.preferences.dark;
  return <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
    widgetBackground={dark ? "#171717" : "#FAFAFA"} foregroundStyle={dark ? "white" : "black"}
    widgetURL={Script.createRunURLScheme(Script.name, { parameter: parameter || shareScene(current) })}>
    <VStack alignment="leading" spacing={large ? 12 : 0} padding={12}>
      {items.map(item => <ScenePanel key={item.scene.id} item={{ ...item, scene: { ...item.scene, preferences: { ...item.scene.preferences, dark } } }}
        now={now} automatic={automatic} width={width} medium={medium} large={large}
        parameter={shareScene(item.scene)} />)}
      {large && items.length < 2 ? <VStack alignment="leading" spacing={4}>
        <Text font={13}>还可以配置另一个通勤场景</Text><Text font={10}>打开脚本，保存上班和回家，即可同屏查看。</Text>
      </VStack> : null}
    </VStack>
  </VStack>;
}
