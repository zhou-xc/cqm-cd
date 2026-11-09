import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import core from '../MetroMinutes/core.js';
import { loadModule } from './modules.mjs';
const data = await loadModule('data.ts');
const timeline = await loadModule('widget_timeline.ts');
const commute = await loadModule('commute.ts');
const base = Date.parse('2026-11-09T08:00:00+08:00');
const p = core.resolveParameter('兰花路|10号线|down|timer|dark', core.preferences());
const trains = [120000, 600000, 1200000].map(offset => ({ arrival: base + offset,
  departure: base + offset + 60000, departureKnown: true, destination: '王家庄', skipStopFlag: 1 }));
const snapshot = { version: 2, stationID: p.stationID, lineID: p.lineID, fetchedAt: base,
  down: trains, up: [{ ...trains[0], arrival: base + 240000, departure: base + 300000, destination: '兰花路' }] };

// Render the real TSX once with a minimal host adapter. This checks the archived
// view tree, NOT iOS's native mask/filter execution or pixel layout.
async function renderWidget(family, result = { snapshot, error: null }, options = {}) {
  const preferences = options.preferences ?? p;
  const now = options.now ?? base;
  const book = options.book ?? commute.readBook(null);
  const calls = [];
  const storageReads = [];
  let capture;
  const presented = new Promise(resolve => { capture = resolve; });
  const scripting = Object.fromEntries(['Button', 'Group', 'HStack', 'Image', 'ProgressView', 'Rectangle',
    'Text', 'TimerIntervalLabel', 'VStack', 'ZStack'].map(name => [name, name]));
  scripting.Script = { name: 'MetroMinutes', createRunURLScheme: (_, args) => `scripting://test?parameter=${encodeURIComponent(args.parameter)}` };
  scripting.AppIntentProtocol = { AppIntent: 0 };
  scripting.AppIntentManager = { register: config => parameter => ({ name: config.name, parameter,
    perform: () => config.perform(parameter) }) };
  scripting.Widget = { parameter: options.parameter ?? '', family, displaySize: { width: family === 'systemSmall' ? 170 : 360,
    height: family === 'systemLarge' ? 380 : 170 }, present: (tree, policy) => capture({ tree, policy, calls, storageReads }),
    reloadAll: () => calls.push({ type: 'reload' }) };
  const cache = new Map([
    ['./core', { default: core }], ['./data', data], ['./widget_timeline', timeline], ['./commute', commute], ['scripting', scripting],
    ['./service', { savedPreferences: () => preferences, query: async (p, force = false) => {
      calls.push({ type: 'query', parameter: core.parameter(p), force }); return options.results?.[p.stationID] ?? result;
    },
      savedWidgetRendering: () => options.mode ?? 'compatible' }],
  ]);
  const createElement = (type, props, ...children) => typeof type === 'function'
    ? type({ ...props, children: children.flat(Infinity) }) : { type, props: props ?? {}, children: children.flat(Infinity) };
  const context = vm.createContext({ Date: class extends Date { static now() { return now; } }, createElement,
    Storage: { get: key => { storageReads.push(key); return book; } } });
  function requireModule(name) {
    if (cache.has(name)) return cache.get(name);
    assert.ok(['./widget', './time_gate', './countdown', './app_intents', './commute_widget', './scenes'].includes(name), `unexpected module ${name}`);
    const source = readFileSync(new URL(`../MetroMinutes/${name.slice(2)}.${name === './scenes' ? 'ts' : 'tsx'}`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'createElement',
    } });
    const module = { exports: {} }; cache.set(name, module.exports);
    vm.runInContext(`(function(require,module,exports){${outputText}\n})`, context)(requireModule, module, module.exports);
    return module.exports;
  }
  requireModule('./widget');
  return presented;
}

function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.type === type ? [tree] : []), ...tree.children.flatMap(child => nodes(child, type))];
}
const textOf = tree => nodes(tree, 'Text').flatMap(n => n.children).join(' ');

// Evaluate the intended reveal instants in one archived tree. This verifies
// wiring/occlusion only; it does not emulate native rasterization or memory.
function visibleTree(tree, now) {
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.props.mask) {
    const [timer] = nodes(tree.props.mask, 'ProgressView');
    if (now < (timer.props.timerFrom + timer.props.timerTo) / 2) return null;
  }
  let children = tree.children.map(c => visibleTree(c, now)).filter(c => c != null);
  if (tree.type === 'ZStack') {
    const cover = children.findLastIndex(c => c?.props?.mask && c.children?.[0]?.type === 'Rectangle'
      && c.props.frame.width === tree.props.frame?.width && c.props.frame.height === tree.props.frame?.height);
    if (cover >= 0) children = children.slice(cover);
  }
  return { ...tree, children };
}

test('every automatic gate filters a bounded centre sample before magnification', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const { tree } = await renderWidget(family, undefined, { mode: 'automatic' });
    const masks = nodes(tree, 'ZStack').filter(n => n.props.mask).map(n => n.props.mask);
    assert.ok(masks.length > 0);
    for (const mask of masks) {
      const stacks = nodes(mask, 'ZStack');
      const filters = stacks.filter(n => n.props.luminanceToAlpha || n.props.contrast);
      assert.equal(filters.length, 2);
      for (const f of filters) {
        assert.equal(f.props.frame.width, 2);
        assert.equal(f.props.frame.height, 1);
        assert.ok(!nodes(f, 'ZStack').some(n => n.props.scaleEffect), 'filters must never wrap the magnified view');
      }
      const [scale] = stacks.filter(n => n.props.scaleEffect);
      assert.equal(scale.props.scaleEffect.x * 2, mask.props.frame.width);
      assert.equal(scale.props.scaleEffect.y, mask.props.frame.height);
      assert.equal(mask.props.contentShape, 'rect');
    }
  }
});

test('one small archived widget retains three arrival/dwell pairs, stale label and final refresh prompt', async () => {
  const { tree, calls } = await renderWidget('systemSmall', undefined, { mode: 'automatic' });
  for (let i = 0; i < trains.length; i++) {
    const waitingAt = i ? trains[i - 1].departure + 1 : base;
    const waiting = visibleTree(tree, waitingAt);
    assert.deepEqual(nodes(waiting, 'TimerIntervalLabel').map(n => n.props.to), [trains[i].arrival]);
    const dwelling = visibleTree(tree, trains[i].arrival + 1);
    assert.deepEqual(nodes(dwelling, 'TimerIntervalLabel').map(n => n.props.to), [trains[i].departure]);
    assert.match(textOf(dwelling), /预计停站中/);
  }
  assert.match(textOf(visibleTree(tree, base + 300001)), /旧数据推算/);
  for (const now of [trains[2].departure + 1, base + 1800001]) {
    const done = visibleTree(tree, now);
    assert.equal(nodes(done, 'TimerIntervalLabel').length, 0);
    assert.match(textOf(done), /班次数据已用完/);
  }
  assert.equal(calls.length, 1, 'advancing the cached view never issues another request');
});

test('explicit waiting parameters bypass the stored commute profiles', async () => {
  const { tree, storageReads } = await renderWidget('systemSmall', undefined,
    { mode: 'automatic', parameter: core.parameter(p), book: { version: 99, active: 'broken' } });
  assert.match(textOf(tree), /兰花路/);
  assert.equal(storageReads.length, 0);
});

test('automatic small widget archives each train timer once and one final prompt', async () => {
  const { tree, policy } = await renderWidget('systemSmall', undefined, { mode: 'automatic' });
  const deadlines = new Set(nodes(tree, 'TimerIntervalLabel').map(n => n.props.to));
  for (const t of trains) { assert.ok(deadlines.has(t.arrival)); assert.ok(deadlines.has(t.departure)); }
  assert.equal(nodes(tree, 'TimerIntervalLabel').length, 6);
  assert.ok(!deadlines.has(snapshot.up[0].arrival));
  assert.match(textOf(tree), /班次数据已用完/);
  assert.match(textOf(tree), /旧数据推算/);
  assert.equal(nodes(tree, 'ZStack').filter(n => n.props.mask && n.props.frame.height === 66).length, 3);
  assert.equal(policy.date.getTime(), base + 300000);
});

test('both directions have independent decks, opaque covers and no masked refresh buttons', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const { tree } = await renderWidget(family, undefined, { mode: 'automatic' });
    const masked = nodes(tree, 'ZStack').filter(n => n.props.mask);
    assert.ok(masked.length > 0 && masked.length <= (family === 'systemSmall' ? 7 : 14));
    for (const layer of masked) {
      assert.equal(nodes(layer, 'Button').length, 0);
      assert.equal(layer.children[0].type, 'Rectangle');
      assert.equal(layer.children[0].props.fill, '#171717');
      assert.equal(layer.children[0].props.frame.width, layer.props.frame.width);
      assert.equal(layer.children[0].props.frame.height, layer.props.frame.height);
      const [progress] = nodes(layer.props.mask, 'ProgressView');
      assert.equal(progress.props.countsDown, false);
      assert.equal(progress.props.timerTo - progress.props.timerFrom, 2000);
    }
    assert.equal(nodes(tree, 'Button').length, 1);
    const deadlines = new Set(nodes(tree, 'TimerIntervalLabel').map(n => n.props.to));
    assert.equal(deadlines.has(snapshot.up[0].arrival), family !== 'systemSmall');
  }
});

test('pending stops never archive a hidden departure countdown', async () => {
  const t = { ...trains[0], skipStopFlag: 2, destination: '后堡' };
  const { tree } = await renderWidget('systemSmall', { snapshot: { ...snapshot, down: [t] }, error: null }, { mode: 'automatic' });
  assert.ok(!nodes(tree, 'TimerIntervalLabel').some(n => n.props.to === t.departure));
  assert.match(textOf(tree), /停靠待确认/);
  assert.doesNotMatch(textOf(tree), /预计停站中/);
});

test('default compatible path renders only current timers, with no masks or filters in any size', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const { tree } = await renderWidget(family);
    const all = JSON.stringify(tree);
    assert.doesNotMatch(all, /ProgressView|luminanceToAlpha|scaleEffect|contrast|"mask"/);
    assert.equal(nodes(tree, 'TimerIntervalLabel').length, family === 'systemSmall' ? 1 : 2);
    assert.match(textOf(tree), /1\.4\.0 兼容/);
    assert.match(textOf(tree), /到零请刷新/);
    assert.equal(nodes(tree, 'Button').length, 1);
  }
});

test('commute widgets differ by size, retain safe hit targets and avoid extra mask layers', async () => {
  const work = commute.validateScene({ ...commute.draftScene(p), destination: '王家庄', walkMinutes: 1, entryMinutes: 0 });
  const home = commute.validateScene({ ...work, id: 'home' });
  const book = { version: 1, active: 'work', onboarded: true, scenes: { work, home } };
  for (const mode of ['automatic', 'compatible']) {
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
      const { tree, calls } = await renderWidget(family, undefined, { mode, book, parameter: 'commute:work' });
      assert.match(textOf(tree), /建议.*发车班次/);
      assert.match(textOf(tree), /建议有效至/);
      assert.equal(textOf(tree).includes('查询时的近三班'), family !== 'systemSmall');
      assert.equal(textOf(tree).includes('回家 ·'), family === 'systemLarge');
      assert.doesNotMatch(textOf(tree), /1\.4\.0|兼容模式/);
      const masked = nodes(tree, 'ZStack').filter(n => n.props.mask);
      assert.ok(masked.length <= (family === 'systemLarge' ? 6 : 3));
      if (mode === 'compatible') assert.equal(masked.length, 0);
      const buttons = nodes(tree, 'Button');
      assert.equal(buttons.length, family === 'systemLarge' ? 2 : 1);
      for (const button of buttons) {
        const parent = nodes(tree, 'ZStack').find(n => n.children.includes(button));
        assert.equal(parent.children.filter(Boolean).at(-1), button);
        assert.equal(button.children[0].props.contentShape, 'rect');
        assert.equal(button.props.intent.name, 'CQMetroRefreshCommute');
      }
      assert.equal(calls.length, 1, 'same-station scenes share the request');
      await buttons[0].props.intent.perform();
      assert.deepEqual(calls.map(c => [c.type, c.force]), [['query', false], ['query', true], ['reload', undefined]]);
    }
  }
});

test('large commute widget queries different stations independently and refreshes the chosen scene only', async () => {
  const work = commute.validateScene({ ...commute.draftScene(p), destination: '王家庄' });
  const hp = core.resolveParameter('头塘|4号线|up|timer|dark', p);
  const home = commute.validateScene({ ...commute.draftScene(hp, 'home'), destination: '民安大道' });
  const book = { version: 1, active: 'work', onboarded: true, scenes: { work, home } };
  const { tree, calls } = await renderWidget('systemLarge', undefined, { book, parameter: 'commute:work', results: { [hp.stationID]: { snapshot: null, error: 'offline' } } });
  assert.equal(calls.filter(c => c.type === 'query').length, 2);
  assert.match(textOf(tree), /头塘/);
  assert.match(textOf(tree), /刷新失败/);
  assert.match(textOf(tree), /兰花路/);
  const buttons = nodes(tree, 'Button');
  await buttons[1].props.intent.perform();
  assert.equal(calls.at(-2).parameter, core.parameter(hp));
  const legacy = await renderWidget('systemSmall', undefined, { book, parameter: core.parameter(p) });
  assert.doesNotMatch(textOf(legacy.tree), /建议.*发车班次/);
  assert.match(textOf(legacy.tree), /距预计到达/);
});

test('blank, scene and shared parameters use waiting widgets even with saved commute profiles', async () => {
  const hp = core.resolveParameter('头塘|4号线|up|timer|dark', p);
  const work = commute.validateScene({ ...commute.draftScene(hp), destination: '民安大道' });
  const home = commute.validateScene({ ...commute.draftScene(p, 'home'), destination: '王家庄' });
  const book = { version: 1, active: 'home', onboarded: true, scenes: { work, home } };
  const results = { [hp.stationID]: { error: null, snapshot: { ...snapshot, stationID: hp.stationID, lineID: hp.lineID,
    up: trains.map(t => ({ ...t, destination: '民安大道' })), down: [] } } };
  for (const mode of ['automatic', 'compatible']) {
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
      for (const parameter of ['', 'scene:work', 'scene:home', commute.shareScene(work), core.parameter(hp)]) {
        const expected = !parameter || parameter === 'scene:home' ? p : hp;
        const { tree, calls } = await renderWidget(family, undefined, { parameter, book, results, mode });
        assert.doesNotMatch(textOf(tree), /距建议出门时间|建议有效至|步行/);
        assert.match(textOf(tree), /距预计到达/);
        assert.equal(calls.length, 1, 'waiting widgets query only the selected station in every size');
        assert.equal(calls[0].parameter, core.parameter(expected));
        const [button] = nodes(tree, 'Button');
        assert.equal(button.props.intent.name, 'CQMetroRefreshArrival');
        assert.equal(button.props.intent.parameter, core.parameter(expected));
        const deepLink = new URL(tree.props.widgetURL).searchParams.get('parameter');
        assert.deepEqual(commute.resolveScene(deepLink, book, p).preferences, expected);
        if (parameter.startsWith('scene:')) assert.equal(deepLink, parameter, 'opening the app retains the full scene');
        if (mode === 'automatic') {
          assert.ok(nodes(visibleTree(tree, trains[0].arrival + 1), 'TimerIntervalLabel').some(n => n.props.to === trains[0].departure));
          assert.ok(nodes(visibleTree(tree, trains[0].departure + 1), 'TimerIntervalLabel').some(n => n.props.to === trains[1].arrival));
        }
      }
    }
  }
});

test('portable opt-in commute advice retains its own scene on large widgets', async () => {
  const portable = commute.validateScene({ ...commute.draftScene(p), destination: '王家庄', walkMinutes: 1, entryMinutes: 0 });
  const hp = core.resolveParameter('头塘|4号线|up|timer|dark', p);
  const local = commute.validateScene({ ...commute.draftScene(hp), destination: '民安大道' });
  const book = { version: 1, active: 'work', onboarded: true, scenes: { work: local } };
  const parameter = 'commute:' + commute.shareScene(portable);
  const { tree, calls } = await renderWidget('systemLarge', undefined, { book, parameter });
  assert.match(textOf(tree), /建议.*发车班次/);
  assert.doesNotMatch(textOf(tree), /头塘/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parameter, core.parameter(p));
  assert.equal(new URL(tree.props.widgetURL).searchParams.get('parameter'), parameter);
});

test('invalid or missing explicit commute scenes show an error without querying another station', async () => {
  for (const parameter of ['commute:home', 'commute:invalid', 'commute:CQMETRO1:broken']) {
    const { tree, calls } = await renderWidget('systemSmall', undefined, { parameter });
    assert.match(textOf(tree), /请先打开脚本保存回家|通勤建议参数无效|配置码无法导入/);
    assert.equal(calls.length, 0);
  }
});

test('refresh is above all time layers, has full hit bounds, and invokes the same forced query in both modes', async () => {
  for (const mode of ['automatic', 'compatible']) {
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
      const { tree, calls } = await renderWidget(family, undefined, { mode });
      const buttons = nodes(tree, 'Button');
      assert.equal(buttons.length, 1);
      const [button] = buttons;
      const host = nodes(tree, 'ZStack').find(n => n.children.includes(button));
      assert.ok(host, 'button must be a sibling above the display tree');
      assert.equal(host.children.filter(Boolean).at(-1), button);
      assert.equal(host.props.alignment, 'topTrailing');
      assert.equal(nodes(host.children[0], 'Button').length, 0);
      for (const target of [button, button.children[0]]) {
        assert.equal(target.props.contentShape, 'rect');
        assert.ok(target.props.frame.width >= 44);
        assert.equal(target.props.frame.height, 44);
      }
      const masked = nodes(host.children[0], 'ZStack').filter(n => n.props.mask);
      assert.equal(masked.length > 0, mode === 'automatic');
      for (const layer of masked) {
        assert.equal(layer.props.contentShape, 'rect');
        assert.equal(layer.props.mask.props.contentShape, 'rect');
      }
      assert.equal(button.props.intent.name, 'CQMetroRefreshArrival');
      assert.equal(button.props.intent.parameter, core.parameter(p));
      assert.equal(button.props.action, undefined);
      assert.equal(button.props.widgetURL, undefined);
      await button.props.intent.perform();
      assert.deepEqual(calls.map(c => [c.type, c.force]), [['query', false], ['query', true], ['reload', undefined]]);
      assert.ok(calls.filter(c => c.type === 'query').every(c => c.parameter === core.parameter(p)));
    }
  }
});

test('compatible reload during dwell uses departure; later reload selects next train', async () => {
  const { tree: dwell } = await renderWidget('systemSmall', undefined, { now: trains[0].arrival + 1 });
  assert.deepEqual(nodes(dwell, 'TimerIntervalLabel').map(n => n.props.to), [trains[0].departure]);
  assert.match(textOf(dwell), /距预计发车/);
  const { tree: next } = await renderWidget('systemSmall', undefined, { now: trains[0].departure });
  assert.deepEqual(nodes(next, 'TimerIntervalLabel').map(n => n.props.to), [trains[1].arrival]);
  const { tree: expired } = await renderWidget('systemSmall', undefined, { now: base + 1800000 });
  assert.equal(nodes(expired, 'TimerIntervalLabel').length, 0);
  assert.match(textOf(expired), /旧数据已失效/);
});

test('Toutang small widgets retain all Minan arrivals in auto and the current train in compatible', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/toutang-20261109.json', import.meta.url)));
  const now = Date.parse(fixture.receivedAt);
  const preferences = core.resolveParameter('头塘|4号线|up|timer|dark', p);
  const snapshot = core.snapshot(fixture.result, preferences, now);
  for (const mode of ['automatic', 'compatible']) {
    const { tree } = await renderWidget('systemSmall', { snapshot, error: null }, { now, preferences, mode });
    assert.match(textOf(tree), /头塘/);
    assert.match(textOf(tree), /往民安大道/);
    const timers = nodes(tree, 'TimerIntervalLabel').map(n => n.props.to);
    assert.ok(timers.includes(snapshot.up[0].arrival));
    if (mode === 'automatic') {
      assert.ok(timers.includes(snapshot.up[1].arrival));
      assert.ok(timers.includes(snapshot.up[2].arrival));
      assert.ok(!timers.includes(snapshot.up[1].departure));
      assert.match(textOf(tree), /停靠待确认/);
    }
    assert.ok(snapshot.down.every(t => !timers.includes(t.arrival)));
  }
});
