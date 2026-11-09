import { Button, HStack, Image, Script, Text, VStack, Widget } from "scripting";
import core, { type Preferences, type Direction } from "./core";
import { display, nextTransition, type Result } from "./data";
import { query, savedPreferences } from "./service";
import { Countdown } from "./countdown";
import { RefreshArrival } from "./app_intents";

function Arrival({ p, result, dir, compact = false }: { p: Preferences; result: Result; dir: Direction; compact?: boolean }) {
  const d = display(p, result, Date.now(), dir);
  return <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={compact ? 11 : 12} lineLimit={1} minScaleFactor={0.6}>{compact ? [d.direction, d.current?.assessment.kind].filter(Boolean).join(" · ") : d.direction}</Text>
    {!compact && d.service ? <Text font={9} lineLimit={1} minScaleFactor={0.65}>{d.service}</Text> : null}
    {d.targetTime !== null && result.snapshot
      ? <Countdown key={d.targetTime} arrival={d.targetTime} from={result.snapshot.fetchedAt} size={compact ? 24 : 34} />
      : !d.current ? <Text font={24}>--:--</Text> : null}
    {!compact && d.timerLabel ? <Text font={9}>{d.timerLabel}</Text> : null}
    <Text font={compact ? 8 : 9} lineLimit={1} minScaleFactor={0.55}>{compact ? [d.timerLabel, d.status].filter(Boolean).join(" · ") : d.status}</Text>
    <Text font={compact ? 7 : 8} lineLimit={1} minScaleFactor={0.65}>{d.bounds}</Text>
    {!compact && d.trains.slice(1, 3).map(t => <Text font={10} lineLimit={1} minScaleFactor={0.65} key={t.arrival + t.destination}>
      {`${core.clock(t.arrival)} · ${t.assessment.destination} ${t.assessment.label}`}
    </Text>)}
  </VStack>;
}

async function main() {
  try {
    const p = core.resolveParameter(Widget.parameter, savedPreferences());
    const result = await query(p);
    const d = display(p, result);
    const small = Widget.family === "systemSmall";
    const medium = Widget.family === "systemMedium";
    const open = Script.createRunURLScheme(Script.name, { parameter: core.parameter(p) });
    const refresh = <Button intent={RefreshArrival(core.parameter(p))} buttonStyle="plain"
      accessibilityLabel="刷新到站信息" accessibilityHint="重新查询当前站点和方向的班次">
      <HStack spacing={4} frame={{ minWidth: 44, minHeight: 44 }}>
        <Image systemName="arrow.clockwise" font={20} />
        {!small ? <Text font={12}>刷新</Text> : null}
      </HStack>
    </Button>;
    const both = <HStack alignment="top" spacing={12}>
      <Arrival p={p} result={result} dir={p.direction} compact={medium} />
      <Arrival p={p} result={result} dir={p.direction === "up" ? "down" : "up"} compact={medium} />
    </HStack>;
    Widget.present(
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
        widgetBackground={p.dark ? "#171717" : "#FAFAFA"}
        foregroundStyle={p.dark ? "white" : "black"} widgetURL={open}>
        <VStack alignment="leading" spacing={2} padding={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <HStack spacing={5}>
            <Text font={small ? 16 : 20} fontWeight="semibold" lineLimit={1} minScaleFactor={0.65}
              frame={{ maxWidth: "infinity", alignment: "leading" }}>{d.station.stationName}</Text>
            <Text font={10} lineLimit={1}>{d.station.lineName}</Text>
            {!small ? refresh : null}
          </HStack>
          {small ? <VStack alignment="leading" spacing={1}>
            <Text font={11} lineLimit={1} minScaleFactor={0.6}>{[d.direction, d.current?.assessment.kind].filter(Boolean).join(" · ")}</Text>
            <HStack spacing={0}>
              <VStack alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                {d.targetTime !== null && result.snapshot
                  ? <Countdown key={d.targetTime} arrival={d.targetTime} from={result.snapshot.fetchedAt} size={30} />
                  : !d.current ? <Text font={26}>--:--</Text> : null}
              </VStack>
              {refresh}
            </HStack>
            <Text font={9} lineLimit={1} minScaleFactor={0.6}>{d.status}</Text>
            {d.timerLabel ? <Text font={8}>{d.timerLabel}</Text> : null}
            <Text font={8} lineLimit={1} minScaleFactor={0.65}>{d.bounds}</Text>
          </VStack> : both}
          <Text font={8} lineLimit={1} minScaleFactor={0.55}>{`查 ${d.queried} · ${d.source || "请刷新"}`}</Text>
        </VStack>
      </VStack>,
      { policy: "after", date: new Date(nextTransition(p, result, Date.now())) },
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
