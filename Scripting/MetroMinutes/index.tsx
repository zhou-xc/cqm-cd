import { Button, Link, List, Navigation, NavigationStack, Picker, Script, Text, VStack, Widget, useState } from "scripting";
import core, { STATIONS, type Preferences } from "./core";
import { display, type Result } from "./data";
import { query, savedPreferences, savePreferences } from "./service";
import { Countdown } from "./countdown";
import { endActivity, startOrUpdate } from "./activity";

function Page({ initial, initialResult }: { initial: Preferences; initialResult: Result }) {
  const dismiss = Navigation.useDismiss();
  const [p, setP] = useState(initial);
  const [result, setResult] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  const d = display(p, result);
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
    <List navigationTitle="重庆轨道到站" toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
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
        <Text tag="up">{display(p, result, Date.now(), "up").direction}</Text>
        <Text tag="down">{display(p, result, Date.now(), "down").direction}</Text>
      </Picker>
      <Picker title="小组件外观" value={p.dark ? "dark" : "light"} pickerStyle="segmented" disabled={busy}
        onChanged={(theme: string) => change({ ...p, dark: theme === "dark" })}>
        <Text tag="dark">深色</Text><Text tag="light">浅色</Text>
      </Picker>
      <VStack alignment="leading" spacing={6}>
        <Text font="headline">{d.station.stationName + " · " + d.direction}</Text>
        {d.trains[0] && result.snapshot ? <Countdown arrival={d.trains[0].arrival} from={result.snapshot.fetchedAt} /> : <Text font="title">--:--</Text>}
        <Text>{d.status}</Text>
        <Text font="caption">{`查询 ${d.queried}。倒计时按本次查询估算，到零后请刷新。`}</Text>
        {result.error ? <Text font="caption">{result.error}</Text> : null}
        {d.trains.slice(1, 4).map(t => <Text key={t.arrival + t.destination}>{`后续 ${core.clock(t.arrival)} · ${t.destination}`}</Text>)}
      </VStack>
      <Button title={busy ? "处理中…" : "刷新到站信息"} systemImage="arrow.clockwise" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => { setResult(await query(p, true)); Widget.reloadAll(); })} />
      <Button title="开始 / 更新锁屏倒计时" systemImage="livephoto" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => {
          const latest = await query(p, true); setResult(latest); Widget.reloadAll();
          const view = display(p, latest);
          if (latest.error) throw new Error(latest.error);
          if (!latest.snapshot || !view.trains[0] || view.trains[0].arrival <= Date.now()) throw new Error("没有尚未到站的班次，请稍后刷新");
          await startOrUpdate({ station: view.station.stationName, line: view.station.lineName, direction: view.direction,
            arrival: view.trains[0].arrival, fetchedAt: latest.snapshot.fetchedAt });
          await Dialog.alert({ title: "已更新实时活动", message: "可锁屏查看本次班次的倒计时；班次变化后在这里重新更新。" });
        })} />
      <Button title="结束锁屏倒计时" systemImage="stop.circle" disabled={busy} buttonStyle="borderless" action={() => run(endActivity)} />
      <Button title="预览小号组件" systemImage="square" disabled={busy} buttonStyle="borderless"
        action={() => run(async () => { await Widget.preview({ family: "systemSmall", parameters: { options: { current: JSON.stringify(p) }, default: "current" } }); })} />
      <Link url={core.officialURL(p)}>打开官方到站查询</Link>
      <Text font="caption">添加桌面 Scripting 小组件后选择 MetroMinutes。参数留空使用这里的选择；多个组件可分别填写下方参数。点击组件主体打开设置，点击刷新图标重新查询。</Text>
      <Text font="caption">{core.parameter(p)}</Text>
      <Text font="caption">系统决定自动刷新时机；计时走动不代表重新获取了班次。不使用 Pro 后台任务或远程推送。</Text>
    </List>
  </NavigationStack>;
}

async function main() {
  try {
    const p = core.resolveParameter(Script.queryParameters?.parameter, savedPreferences());
    await Navigation.present({ element: <Page initial={p} initialResult={await query(p)} /> });
  } catch (e) {
    await Dialog.alert({ title: "重庆轨道到站", message: String(e instanceof Error ? e.message : e) });
  } finally { Script.exit(); }
}
void main();
