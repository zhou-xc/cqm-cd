import { Button, Link, List, Navigation, NavigationStack, Picker, Script, Text, VStack, Widget, useState } from "scripting";
import core, { STATIONS, type Preferences } from "./core";
import { display, type Result } from "./data";
import { query, savedPreferences, savePreferences, savedWidgetRendering, saveWidgetRendering } from "./service";
import { Countdown } from "./countdown";
import { endActivity, startOrUpdate } from "./activity";

let pageTimer: ReturnType<typeof setTimeout> | undefined;
function stopPageClock() { if (pageTimer !== undefined) clearTimeout(pageTimer); pageTimer = undefined; }

function Page({ initial, initialResult }: { initial: Preferences; initialResult: Result }) {
  const dismiss = Navigation.useDismiss();
  const [p, setP] = useState(initial);
  const [result, setResult] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [rendering, setRendering] = useState(savedWidgetRendering());
  const d = display(p, result, now);
  function startPageClock() {
    stopPageClock();
    const tick = () => { setNow(Date.now()); pageTimer = setTimeout(tick, 1000); };
    tick();
  }
  const lines = Array.from(new Map(STATIONS.map(s => [s.lineID, s.lineName])).entries());

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (e) { await Dialog.alert({ title: "重庆轨道到站", message: String(e instanceof Error ? e.message : e) }); }
    finally { setBusy(false); }
  }
  function change(next: Preferences) {
    if (busy) return;
    const valid = core.preferences(next);
    setP(valid);
    setResult({ snapshot: null, error: null });
    savePreferences(valid);
    void run(async () => { setResult(await query(valid)); Widget.reloadAll(); });
  }

  return <NavigationStack>
    <List navigationTitle="重庆轨道到站" onAppear={startPageClock} onDisappear={stopPageClock}
      toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
      <Picker title="线路" value={p.lineID} pickerStyle="menu" disabled={busy} onChanged={(lineID: string) => {
        const station = STATIONS.find(s => s.lineID === lineID)!;
        change({ ...p, lineID, stationID: station.stationID });
      }}>{lines.map(([id, name]) => <Text key={id} tag={id}>{name}</Text>)}</Picker>
      <Picker title="站点" value={p.stationID} pickerStyle="navigationLink" disabled={busy}
        onChanged={(stationID: string) => change({ ...p, stationID })}>
        {STATIONS.filter(s => s.lineID === p.lineID).map(s => <Text key={s.stationID} tag={s.stationID}>{s.stationName}</Text>)}
      </Picker>
      <Picker title="方向" value={p.direction} pickerStyle="menu" disabled={busy}
        onChanged={(direction: string) => {
          if (direction === "up" || direction === "down") change({ ...p, direction });
        }}>
        <Text tag="up">{display(p, result, now, "up").direction}</Text>
        <Text tag="down">{display(p, result, now, "down").direction}</Text>
      </Picker>
      <Picker title="小组件外观" value={p.dark ? "dark" : "light"} pickerStyle="segmented" disabled={busy}
        onChanged={(theme: string) => change({ ...p, dark: theme === "dark" })}>
        <Text tag="dark">深色</Text><Text tag="light">浅色</Text>
      </Picker>
      <Picker title="桌面显示模式" value={rendering} pickerStyle="menu" disabled={busy}
        onChanged={(value: string) => {
          if (value !== "compatible" && value !== "automatic") return;
          saveWidgetRendering(value); setRendering(value); Widget.reloadAll();
        }}>
        <Text tag="compatible">兼容模式（默认）</Text>
        <Text tag="automatic">自动切班（精简版）</Text>
      </Picker>
      <Text font="caption">{rendering === "compatible"
        ? "兼容模式保留本班倒计时，到零后请刷新；停站和下一班在组件重新加载时更新。"
        : "自动切班预先准备近三班，并在到站后切换可用的发车倒计时。若桌面变白，可在此切回兼容模式。"}</Text>
      <Text font="caption">显示模式应用于本机所有 MetroMinutes 组件，不影响各组件的站点参数。更改模式会申请重新加载，系统可能延迟。</Text>
      <VStack alignment="leading" spacing={6}>
        <Text font="headline">{d.station.stationName + " · " + d.direction}</Text>
        {d.service ? <Text>{d.service}</Text> : null}
        {d.targetTime !== null && result.snapshot ? <Countdown key={d.targetTime} arrival={d.targetTime} from={result.snapshot.fetchedAt} /> : !d.current ? <Text font="title">--:--</Text> : null}
        {d.timerLabel ? <Text font="caption">{d.timerLabel}</Text> : null}
        <Text>{d.status}</Text>
        <Text font="caption">{d.bounds}</Text>
        <Text font="caption">{`查询 ${d.queried} · ${d.source}`}</Text>
        {d.previous ? <Text font="caption">{d.previous}</Text> : null}
        {d.evidence ? <Text font="caption">{d.evidence}</Text> : null}
        {d.current && d.current.destination !== d.current.assessment.destination ? <Text font="caption">{`接口终点：${d.current.destination}；显示方向按图片交路推断。`}</Text> : null}
        {result.error ? <Text font="caption">{result.error}</Text> : null}
        {d.trains.slice(1, 4).map(t => <Text key={t.arrival + t.destination}>{`后续 ${core.clock(t.arrival)} · ${t.assessment.destination} ${t.assessment.label}`}</Text>)}
      </VStack>
      <Button title={busy ? "处理中…" : "刷新到站信息"} systemImage="arrow.clockwise" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => { setResult(await query(p, true)); Widget.reloadAll(); })} />
      <Button title="开始 / 更新锁屏倒计时" systemImage="livephoto" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => {
          const latest = await query(p, true); setResult(latest); Widget.reloadAll();
          const view = display(p, latest);
          if (latest.error) throw new Error(latest.error);
          if (!latest.snapshot || !view.current || view.targetTime === null) throw new Error("当前没有可用的倒计时，请稍后刷新");
          await startOrUpdate({ station: view.station.stationName, line: view.station.lineName, direction: view.direction,
            arrival: view.current.arrival, fetchedAt: latest.snapshot.fetchedAt,
            departure: view.current.departureKnown && view.current.assessment.stop === "confirmed" ? view.current.departure : undefined,
            service: view.service, stop: view.current.assessment.stop });
          await Dialog.alert({ title: "已更新实时活动", message: "锁屏显示本班预计到达及可用的发车倒计时；切换下一班请重新更新。" });
        })} />
      <Button title="结束锁屏倒计时" systemImage="stop.circle" disabled={busy} buttonStyle="borderless" action={() => run(endActivity)} />
      <Button title="预览小号组件" systemImage="square" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => { await Widget.preview({ family: "systemSmall", parameters: { options: { current: JSON.stringify(p) }, default: "current" } }); })} />
      <Link url={core.officialURL(p)}>打开官方到站查询</Link>
      <Text font="caption">添加桌面 Scripting 小组件后选择 MetroMinutes。参数留空使用这里的选择；多个组件可分别填写下方参数。点击组件主体打开设置，点击刷新图标重新查询。</Text>
      <Text font="caption">{core.parameter(p)}</Text>
      <Button title="复制小组件参数" systemImage="doc.on.doc" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => {
          await Pasteboard.setString(core.parameter(p));
          await Dialog.alert({ title: "参数已复制", message: "长按桌面小组件 → 编辑小组件，将参数粘贴到参数栏。" });
        })} />
      <Text font="caption">页面按上次查询的时间推算状态，不代表列车实况。5 分钟后标记旧数据，最长推算 30 分钟；已知班次用完后请刷新。图片时刻按周一至周五/周末匹配，未包含节假日及临时调图。</Text>
      <Text font="caption">MetroMinutes 1.2.1 · 自动模式的近三班用完后请刷新。锁屏仍展示选中单班。</Text>
    </List>
  </NavigationStack>;
}

async function main() {
  try {
    const p = core.resolveParameter(Script.queryParameters?.parameter, savedPreferences());
    await Navigation.present({ element: <Page initial={p} initialResult={await query(p)} /> });
  } catch (e) {
    await Dialog.alert({ title: "重庆轨道到站", message: String(e instanceof Error ? e.message : e) });
  } finally { stopPageClock(); Script.exit(); }
}
void main();
