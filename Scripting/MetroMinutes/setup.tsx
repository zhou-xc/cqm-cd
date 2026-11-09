import { Button, Picker, Text, TextField, VStack, useState } from "scripting";
import core, { STATIONS, type Preferences } from "./core";
import { sceneName, validateScene, type Scene } from "./commute";

// Locale sorting belongs to the app's station picker, never widget startup.
const destinationNames = [...new Set(STATIONS.map(s => s.stationName))].sort((a, b) => a.localeCompare(b, "zh"));

export function SceneSetup({ initial, onSave, onCancel }: {
  initial: Scene; onSave: (scene: Scene) => Promise<void>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const p = draft.preferences, station = core.stationFor(p);
  const lines = [...new Map(STATIONS.map(s => [s.lineID, s.lineName])).entries()];
  const change = (next: Preferences) => setDraft({ ...draft, preferences: next,
    destination: core.stationFor(next).stationName === draft.destination ? "" : draft.destination });
  const minutes = (key: "walkMinutes" | "entryMinutes" | "bufferMinutes", title: string, min: number, max: number) =>
    <Picker title={title} value={draft[key]} pickerStyle="menu" onChanged={(value: number) => setDraft({ ...draft, [key]: value })}>
      {Array.from({ length: max - min + 1 }, (_, i) => <Text key={i + min} tag={i + min}>{`${i + min} 分钟`}</Text>)}
    </Picker>;
  return <VStack alignment="leading" spacing={12}>
    <Text font="title2">{`${sceneName(draft.id)} · ${["从哪里上车", "去哪里下车", "到站需要多久", "确认通勤场景"][step]}`}</Text>
    <Text font="caption">{`第 ${step + 1} / 4 步 · 保存前不会覆盖现有场景`}</Text>
    {step === 0 ? <VStack alignment="leading" spacing={10}>
      <Picker title="线路" value={p.lineID} pickerStyle="menu" onChanged={(lineID: string) => {
        const s = STATIONS.find(s => s.lineID === lineID)!; change({ ...p, lineID, stationID: s.stationID });
      }}>{lines.map(([id, name]) => <Text key={id} tag={id}>{name}</Text>)}</Picker>
      <Picker title="上车站" value={p.stationID} pickerStyle="navigationLink" onChanged={(stationID: string) => change({ ...p, stationID })}>
        {STATIONS.filter(s => s.lineID === p.lineID).map(s => <Text key={s.stationID} tag={s.stationID}>{s.stationName}</Text>)}
      </Picker>
    </VStack> : null}
    {step === 1 ? <VStack alignment="leading" spacing={10}>
      <Text>{`${station.lineName} · ${station.stationName} 上车`}</Text>
      <Picker title="乘车方向" value={p.direction} pickerStyle="menu" onChanged={(direction: string) => {
        if (direction === "up" || direction === "down") change({ ...p, direction });
      }}><Text tag="up">{station.upLabel}</Text><Text tag="down">{station.downLabel}</Text></Picker>
      <TextField title="查找下车站" value={search} onChanged={setSearch} prompt="输入站名关键字" />
      <Picker title="下车站" value={draft.destination} pickerStyle="navigationLink" onChanged={(destination: string) => setDraft({ ...draft, destination })}>
        <Text tag="">请选择</Text>
        {destinationNames.filter(n => n !== station.stationName && (n.includes(search.trim()) || n === draft.destination)).map(n => <Text key={n} tag={n}>{n}</Text>)}
      </Picker>
      <Text font="caption">先判断本班是否直达，不规划换乘。尚未核实的交路会标注待确认，不作为赶车推荐。环线方向请结合官方页面核对。</Text>
    </VStack> : null}
    {step === 2 ? <VStack alignment="leading" spacing={10}>
      {minutes("walkMinutes", "步行到站口", 0, 60)}
      {minutes("entryMinutes", "进站、安检到站台", 0, 30)}
      {minutes("bufferMinutes", "额外预留", 1, 15)}
      <Text font="caption">使用你平常的耗时，未接入定位；额外预留至少 1 分钟。建议基于预计发车时间，不保证实际能赶上。</Text>
    </VStack> : null}
    {step === 3 ? <VStack alignment="leading" spacing={6}>
      <Text font="headline">{`${station.stationName} → ${draft.destination}`}</Text>
      <Text>{`${station.lineName} · ${p.direction === "up" ? station.upLabel : station.downLabel}`}</Text>
      <Text>{`步行 ${draft.walkMinutes} 分钟 + 进站 ${draft.entryMinutes} 分钟 + 预留 ${draft.bufferMinutes} 分钟`}</Text>
      <Text font="caption">保存后查看实时建议，再预览并添加桌面组件。</Text>
    </VStack> : null}
    {step < 3 ? <Button title="下一步" disabled={step === 1 && !draft.destination} action={() => setStep(step + 1)} />
      : <Button title={busy ? "保存中…" : `保存${sceneName(draft.id)}场景`} disabled={busy} action={async () => {
        setBusy(true);
        try { await onSave(validateScene(draft)); }
        catch (e) { await Dialog.alert({ title: "无法保存", message: String(e instanceof Error ? e.message : e) }); }
        finally { setBusy(false); }
      }} />}
    {step > 0 ? <Button title="上一步" disabled={busy} action={() => setStep(step - 1)} /> : null}
    <Button title="稍后设置，先查看到站" disabled={busy} action={onCancel} />
  </VStack>;
}
