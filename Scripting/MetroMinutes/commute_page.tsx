import { Button, HStack, Link, List, Navigation, NavigationStack, Picker, Text, TextField, VStack, Widget, useState } from "scripting";
import core from "./core";
import { display, type Result } from "./data";
import { query, savedWidgetRendering, saveWidgetRendering } from "./service";
import { activateScene, finishOnboarding, saveScene, savedScenes } from "./scenes";
import { VERSION, advice, bindScene, draftScene, importScene, recommendedScene, sceneName, shareScene,
  type Scene, type SceneBook, type SceneID, type WidgetContent } from "./commute";
import { SceneSetup } from "./setup";
import { Countdown } from "./countdown";
import { endActivity, startOrUpdate } from "./activity";

let timer: ReturnType<typeof setTimeout> | undefined;
export function stopPageClock() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
export function CommutePage({ initial, initialBook }: { initial: Scene; initialBook: SceneBook }) {
  const dismiss = Navigation.useDismiss();
  const [scene, setScene] = useState(initial);
  const [book, setBook] = useState(initialBook);
  const [result, setResult] = useState<Result>({ snapshot: null, error: null });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [screen, setScreen] = useState<"home" | "setup" | "settings" | "share" | "guide">(!initial.ready && !initialBook.onboarded ? "setup" : "home");
  const [draft, setDraft] = useState(initial);
  const [rendering, setRendering] = useState(savedWidgetRendering());
  const [widgetContent, setWidgetContent] = useState<WidgetContent>("waiting");
  const [input, setInput] = useState("");
  const [incoming, setIncoming] = useState<Scene | null>(null);
  const [slot, setSlot] = useState<SceneID>(book.scenes.home ? "work" : "home");
  const a = advice(scene, result, now), d = a.d;
  const stored = book.scenes[scene.id];
  const isSaved = scene.ready && !!stored && shareScene(stored) === shareScene(scene);
  const widgetNeedsScene = widgetContent === "commute" && !isSaved;
  const widgetParameter = isSaved ? bindScene(scene.id, widgetContent) : core.parameter(scene.preferences);
  const suggested = recommendedScene({ ...book, active: scene.id }, now);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (e) { await Dialog.alert({ title: "重庆通勤助手", message: String(e instanceof Error ? e.message : e) }); }
    finally { setBusy(false); }
  }
  function appear() {
    stopPageClock();
    const tick = () => { setNow(Date.now()); timer = setTimeout(tick, 1000); }; tick();
    if (screen !== "setup") void run(async () => setResult(await query(scene.preferences)));
  }
  async function select(id: SceneID) {
    if (busy) return;
    const target = book.scenes[id];
    if (!target) { setDraft(draftScene(scene.preferences, id)); setScreen("setup"); return; }
    await run(async () => {
      setBook(activateScene(id)); setScene(target); setResult({ snapshot: null, error: null });
      setResult(await query(target.preferences)); Widget.reloadAll();
    });
  }
  async function saved(next: Scene) {
    const updated = saveScene(next);
    setBook(updated); setScene(updated.scenes[next.id]!); setResult({ snapshot: null, error: null });
    setResult(await query(next.preferences)); setScreen("guide"); Widget.reloadAll();
  }
  const copy = (value: string, message: string) => run(async () => {
    await Pasteboard.setString(value); await Dialog.alert({ title: "已复制", message });
  });
  const preview = (family: "systemSmall" | "systemMedium" | "systemLarge") => run(async () => {
    if (widgetNeedsScene) throw Error("请先保存通勤场景，再添加通勤建议组件");
    await Widget.preview({ family, parameters: { options: { current: widgetParameter }, default: "current" } });
  });
  const summary = (s: Scene) => `${core.stationFor(s.preferences).stationName} → ${s.destination} · 步行 ${s.walkMinutes} + 进站 ${s.entryMinutes} + 预留 ${s.bufferMinutes} 分钟`;
  return <NavigationStack>
    <List navigationTitle="重庆通勤助手" buttonStyle="borderless" onAppear={appear} onDisappear={stopPageClock}
      toolbar={{ cancellationAction: <Button title="完成" action={dismiss} /> }}>
      {screen !== "home" && screen !== "setup" ? <Button title="返回通勤看板" action={() => setScreen("home")} /> : null}
      {screen === "setup" ? <SceneSetup initial={draft} onSave={saved} onCancel={() => {
        setScreen("home"); void run(async () => setResult(await query(scene.preferences)));
      }} /> : null}
      {screen === "home" ? <VStack alignment="leading" spacing={12}>
        <Picker title="通勤场景" value={scene.id} pickerStyle="segmented" disabled={busy} onChanged={(id: string) => {
          if (id === "work" || id === "home") void select(id);
        }}><Text tag="work">上班</Text><Text tag="home">回家</Text></Picker>
        {suggested ? <Button title={`现在更适合查看${sceneName(suggested)}，点击切换`} disabled={busy} action={() => select(suggested)} /> : null}
        <Text font="title2">{scene.ready ? `${d.station.stationName} → ${scene.destination}` : `${d.station.stationName} · ${d.direction}`}</Text>
        <Text font="caption">{d.station.lineName + " · " + d.direction}</Text>
        <Text font="headline">{a.title}</Text>
        {a.leaveAt !== null ? <VStack alignment="leading" spacing={2}>
          <Text font="caption">距建议出门时间</Text><Countdown arrival={a.leaveAt} from={now} size={36} />
        </VStack> : null}
        <Text>{a.detail}</Text>
        {scene.ready ? <Text font="caption">{`步行 ${scene.walkMinutes} + 进站 ${scene.entryMinutes} + 预留 ${scene.bufferMinutes} = ${a.travelMinutes} 分钟`}</Text> : null}
        <Button title={busy ? "正在查询…" : "刷新班次与建议"} systemImage="arrow.clockwise" disabled={busy}
          action={() => run(async () => { setResult(await query(scene.preferences, true)); Widget.reloadAll(); })} />
        <Text font="caption">{`查询 ${d.queried} · ${d.source}`}</Text>
        {result.error ? <Text font="caption">{result.error}</Text> : null}
        {a.rows.map(r => <VStack key={r.train.arrival + r.train.destination} alignment="leading" spacing={3}>
          <Text font="headline">{`${r.number === 1 ? "本班" : r.number === 2 ? "下一班" : "第3班"} · ${r.train.assessment.destination}`}</Text>
          <Text>{`到 ${core.clock(r.train.arrival, true)} · ${r.train.departureKnown ? "发 " + core.clock(r.train.departure, true) : "发车时间未知"}`}</Text>
          <Text font="caption">{scene.ready ? r.reach.label + (r.reach.state === "yes" && r.train.departureKnown && r.leaveAt < now ? " · 按到站耗时，时间不足" : "") : r.train.assessment.label}</Text>
        </VStack>)}
        <Text font="headline">当前班次候车计时</Text>
        {d.targetTime !== null ? <Countdown key={d.targetTime} arrival={d.targetTime} from={result.snapshot?.fetchedAt ?? now} size={28} /> : null}
        <Text font="caption">{[d.timerLabel, d.status].filter(Boolean).join(" · ")}</Text>
        <Button title={`编辑${sceneName(scene.id)}场景`} disabled={busy} action={() => { setDraft(scene); setScreen("setup"); }} />
        <Button title="添加桌面组件" disabled={busy} action={() => setScreen("guide")} />
        <Button title="分享 / 导入通勤配置" disabled={busy} action={() => setScreen("share")} />
        <Button title="显示设置与锁屏计时" disabled={busy} action={() => setScreen("settings")} />
        <Text font="caption">建议按上次查询及你填写的耗时推算，不代表车辆实况。超过 5 分钟或刷新失败时暂停赶车推荐；候车状态最长推算 30 分钟。停靠待确认的班次保留展示，不用于推荐。</Text>
      </VStack> : null}
      {screen === "guide" ? <VStack alignment="leading" spacing={10}>
        <Text font="title2">{isSaved ? "场景已保存，放到桌面试试" : "把候车倒计时放到桌面"}</Text>
        <Text>{scene.ready ? summary(scene) : `${d.station.stationName} · ${d.station.lineName} · ${d.direction}`}</Text>
        <Picker title="组件内容" value={widgetContent} pickerStyle="segmented" disabled={busy} onChanged={(value: string) => {
          if (value === "waiting" || value === "commute") setWidgetContent(value);
        }}><Text tag="waiting">候车倒计时（默认）</Text><Text tag="commute">通勤建议</Text></Picker>
        <Text font="caption">候车倒计时关注车多久到；通勤建议关注什么时候出门。每个组件可单独选择，App 内通勤功能始终保留。</Text>
        {widgetNeedsScene ? <Button title="先保存通勤场景" disabled={busy} action={() => { setDraft(scene); setScreen("setup"); }} /> : null}
        <Text>1. 先预览，选择合适的组件尺寸。</Text>
        <HStack><Button title="小号" disabled={busy || widgetNeedsScene} action={() => preview("systemSmall")} /><Button title="中号" disabled={busy || widgetNeedsScene} action={() => preview("systemMedium")} /><Button title="大号" disabled={busy || widgetNeedsScene} action={() => preview("systemLarge")} /></HStack>
        <Text font="caption">{widgetContent === "waiting"
          ? "小号看所选方向倒计时；中号看双向；大号增加后续班次。自动切班模式保留到站、停站发车和下一班计时。"
          : "小号看出门建议；中号看建议与近三班；大号看上班和回家。"}预览效果以桌面实机为准。</Text>
        <Text>2. 长按桌面 → 添加小组件 → Scripting → 选择 MetroMinutes。</Text>
        <Text>3. 点下面复制，长按组件 → 编辑小组件 → 粘贴到“参数”。</Text>
        <Button title={widgetContent === "waiting" ? "复制候车倒计时参数" : "复制通勤建议参数"} disabled={busy || widgetNeedsScene}
          action={() => copy(widgetParameter, `粘贴到小组件“参数”中，即可显示${widgetContent === "waiting" ? "候车倒计时" : "通勤建议"}。${isSaved ? "以后编辑此场景，组件会使用新配置。" : "此参数固定当前站点和方向。"}`)} />
        <Text font="caption">不填参数默认显示候车倒计时，并跟随 App 当前站点或场景。保存通勤场景不会自动切换组件内容；通勤建议需复制对应参数。</Text>
        <Button title="我已了解，返回看板" action={() => { finishOnboarding(); setBook(savedScenes()); setScreen("home"); }} />
      </VStack> : null}
      {screen === "share" ? <VStack alignment="leading" spacing={10}>
        <Text font="title2">分享一份通勤配置</Text>
        <Text font="caption">只包含线路、上下车站、方向和耗时，不包含班次缓存。对方导入后可以调整步行时间。</Text>
        <Button title={`复制${sceneName(scene.id)}分享码`} disabled={busy || !scene.ready} action={() => copy(shareScene(scene), "发给对方后，让其在 MetroMinutes → 分享 / 导入通勤配置中粘贴。")} />
        <TextField title="粘贴场景配置码" value={input} axis="vertical" onChanged={(value: string) => { setInput(value); setIncoming(null); }} />
        <Button title="从剪贴板粘贴" disabled={busy} action={() => run(async () => { setInput(await Pasteboard.getString() ?? ""); setIncoming(null); })} />
        <Button title="校验并预览导入内容" disabled={busy || !input.trim()} action={() => run(async () => setIncoming(importScene(input)))} />
        {incoming ? <VStack alignment="leading" spacing={8}>
          <Text>{summary(incoming)}</Text>
          <Text font="caption">{`${core.stationFor(incoming.preferences).lineName} · ${incoming.preferences.direction === "up" ? core.stationFor(incoming.preferences).upLabel : core.stationFor(incoming.preferences).downLabel}`}</Text>
          <Picker title="保存到本机哪个场景" value={slot} pickerStyle="segmented" onChanged={(id: string) => {
            if (id === "work" || id === "home") setSlot(id);
          }}><Text tag="work">上班</Text><Text tag="home">回家</Text></Picker>
          <Button title={`${book.scenes[slot] ? "覆盖保存为" : "保存为"}${sceneName(slot)}场景`} disabled={busy} action={() => run(async () => {
            await saved({ ...incoming, id: slot }); setIncoming(null); setInput("");
          })} />
        </VStack> : null}
      </VStack> : null}
      {screen === "settings" ? <VStack alignment="leading" spacing={10}>
        <Picker title="桌面显示模式" value={rendering} pickerStyle="menu" onChanged={(value: string) => {
          if (value === "compatible" || value === "automatic") { saveWidgetRendering(value); setRendering(value); Widget.reloadAll(); }
        }}><Text tag="compatible">兼容模式</Text><Text tag="automatic">自动切班（精简版）</Text></Picker>
        <Text font="caption">兼容模式到零后请刷新；自动模式预先准备近三班，按预计时间切班。候车状态最多推算 30 分钟，有可靠发车时间且确认停靠时显示停站倒计时；通勤建议在查询满 5 分钟后失效。若白屏，可在此切回兼容模式。本机所有组件共用此刷新方式。</Text>
        <Picker title="场景主题" value={scene.preferences.dark ? "dark" : "light"} pickerStyle="segmented" disabled={!scene.ready || busy} onChanged={(theme: string) => {
          if (!scene.ready) return;
          const next = { ...scene, preferences: { ...scene.preferences, dark: theme === "dark" } };
          setBook(saveScene(next)); setScene(next); Widget.reloadAll();
        }}><Text tag="dark">深色</Text><Text tag="light">浅色</Text></Picker>
        <Text font="headline">桌面默认：候车倒计时</Text>
        <Text font="caption">默认展示当前班到达、停站发车及下一班计时。可在添加组件时选择通勤建议，两者可以同时放在桌面。</Text>
        <Button title="选择组件内容与预览" disabled={busy} action={() => setScreen("guide")} />
        <Button title="复制候车组件参数" disabled={busy} action={() => copy(core.parameter(scene.preferences), "粘贴到另一个小组件的参数中，保留原来的候车倒计时。")} />
        <Button title="跟踪当前班次（锁屏）" disabled={busy} action={() => run(async () => {
          const latest = await query(scene.preferences, true); setResult(latest); Widget.reloadAll();
          const v = display(scene.preferences, latest);
          if (latest.error) throw Error(latest.error);
          if (!latest.snapshot || !v.current || v.targetTime === null) throw Error("当前没有可用倒计时");
          await startOrUpdate({ station: v.station.stationName, line: v.station.lineName, direction: v.direction,
            arrival: v.current.arrival, fetchedAt: latest.snapshot.fetchedAt,
            departure: v.current.departureKnown && v.current.assessment.stop === "confirmed" ? v.current.departure : undefined,
            service: v.service, stop: v.current.assessment.stop });
          await Dialog.alert({ title: "已更新锁屏", message: "锁屏跟踪当前单班，换班后请重新更新。" });
        })} />
        <Button title="结束锁屏倒计时" disabled={busy} action={() => run(endActivity)} />
        <Link url={core.officialURL(scene.preferences)}>打开官方到站查询</Link>
        <Text font="caption">{`MetroMinutes ${VERSION} · ${rendering === "automatic" ? "自动" : "兼容"} · ${core.parameter(scene.preferences)}`}</Text>
        {d.evidence ? <Text font="caption">{d.evidence}</Text> : null}
      </VStack> : null}
    </List>
  </NavigationStack>;
}
