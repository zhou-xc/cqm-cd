import { Button, HStack, Image, Script, Text, VStack, Widget } from "scripting";
import core, { type Preferences, type Direction } from "./core";
import { display, type Result } from "./data";
import { query, savedPreferences } from "./service";
import { Countdown } from "./countdown";
import { RefreshArrival } from "./app_intents";

function Arrival({ p, result, dir, small, compact = false }: { p: Preferences; result: Result; dir: Direction; small: boolean; compact?: boolean }) {
  const d = display(p, result, Date.now(), dir);
  return <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text font={small ? 12 : 14} lineLimit={1} minScaleFactor={0.7}>{d.direction}</Text>
    {d.trains[0] && result.snapshot
      ? <Countdown arrival={d.trains[0].arrival} from={result.snapshot.fetchedAt} size={compact ? 32 : small ? 38 : 42} />
      : <Text font={32}>--:--</Text>}
    {!compact ? <Text font={10} lineLimit={1} minScaleFactor={0.8}>{d.status}</Text> : null}
    {!small && !compact && d.trains.slice(1, 2).map(t => <Text font={12} lineLimit={1} minScaleFactor={0.7} key={t.arrival + t.destination}>
      {`后续 ${core.clock(t.arrival)} · ${t.destination}`}
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
    const selected = <Arrival p={p} result={result} dir={p.direction} small={small} compact={medium} />;
    const other = <Arrival p={p} result={result} dir={p.direction === "up" ? "down" : "up"} small={false} compact={medium} />;
    const refresh = <Button intent={RefreshArrival(core.parameter(p))} buttonStyle="plain"
      accessibilityLabel="刷新到站信息" accessibilityHint="重新查询当前站点和方向的班次">
      <HStack spacing={4} frame={{ minWidth: 44, minHeight: 44 }}>
        <Image systemName="arrow.clockwise" font={20} />
        {!small ? <Text font={12}>刷新</Text> : null}
      </HStack>
    </Button>;
    const next = d.trains[0]?.departure ?? Date.now() + 60000;
    Widget.present(
      <VStack alignment="leading" spacing={2} widgetBackground={p.dark ? "#171717" : "#FAFAFA"}
        foregroundStyle={p.dark ? "white" : "black"} widgetURL={open}>
        <HStack spacing={5}>
          <Text font={small ? 16 : 20} fontWeight="semibold" lineLimit={1} minScaleFactor={0.65}
            frame={{ maxWidth: "infinity", alignment: "leading" }}>{d.station.stationName}</Text>
          <Text font={10} lineLimit={1}>{d.station.lineName}</Text>
          {medium ? refresh : null}
        </HStack>
        {small ? <VStack alignment="leading" spacing={2}>
          <Text font={12} lineLimit={1} minScaleFactor={0.65}>{d.direction}</Text>
          <HStack spacing={0}>
            <VStack alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
              {d.trains[0] && result.snapshot
                ? <Countdown arrival={d.trains[0].arrival} from={result.snapshot.fetchedAt} size={34} />
                : <Text font={30}>--:--</Text>}
            </VStack>
            {refresh}
          </HStack>
          <Text font={10} lineLimit={1} minScaleFactor={0.8}>{d.status}</Text>
        </VStack> : medium ? <HStack alignment="top" spacing={18}>{selected}{other}</HStack>
          : <VStack alignment="leading" spacing={16}>{selected}{other}</VStack>}
        <HStack spacing={0}>
          <Text font={9} lineLimit={1} minScaleFactor={0.7} frame={{ maxWidth: "infinity", alignment: "leading" }}>{`查 ${d.queried}${medium ? " · " + d.status : ""}`}</Text>
          {!small && !medium ? refresh : null}
        </HStack>
      </VStack>,
      { policy: "after", date: new Date(Math.max(Date.now() + 20000, Math.min(next, Date.now() + 60000))) },
    );
  } catch (error) {
    Widget.present(<VStack alignment="leading" spacing={8}>
      <Text font="headline">重庆轨道到站</Text>
      <Text font="caption">{String(error instanceof Error ? error.message : error)}</Text>
      <Text font="caption">打开脚本重新选择站点</Text>
    </VStack>, { policy: "after", date: new Date(Date.now() + 60000) });
  }
}
void main();
