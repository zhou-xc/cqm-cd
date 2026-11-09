import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import core from '../MetroMinutes/core.js';
import { loadModule } from './modules.mjs';
const data = await loadModule('data.ts');
const timeline = await loadModule('widget_timeline.ts');
const base = Date.parse('2026-11-09T08:00:00+08:00');
const p = core.resolveParameter('兰花路|10号线|down|timer|dark', core.preferences());
const trains = [120000, 600000, 1200000].map(offset => ({ arrival: base + offset,
  departure: base + offset + 60000, departureKnown: true, destination: '王家庄', skipStopFlag: 1 }));
const snapshot = { version: 2, stationID: p.stationID, lineID: p.lineID, fetchedAt: base,
  down: trains, up: [{ ...trains[0], arrival: base + 240000, departure: base + 300000, destination: '兰花路' }] };

// Render the real TSX once with a minimal host adapter. This checks the archived
// view tree, NOT iOS's native mask/filter execution or pixel layout.
async function renderWidget(family, result = { snapshot, error: null }) {
  let capture;
  const presented = new Promise(resolve => { capture = resolve; });
  const scripting = Object.fromEntries(['Button', 'Group', 'HStack', 'Image', 'ProgressView', 'Rectangle',
    'Text', 'TimerIntervalLabel', 'VStack', 'ZStack'].map(name => [name, name]));
  scripting.Script = { name: 'MetroMinutes', createRunURLScheme: () => 'scripting://test' };
  scripting.Widget = { parameter: '', family, displaySize: { width: family === 'systemSmall' ? 170 : 360,
    height: family === 'systemLarge' ? 380 : 170 }, present: (tree, policy) => capture({ tree, policy }) };
  const cache = new Map([
    ['./core', { default: core }], ['./data', data], ['./widget_timeline', timeline], ['scripting', scripting],
    ['./service', { savedPreferences: () => p, query: async () => result }],
    ['./app_intents', { RefreshArrival: parameter => ({ parameter }) }],
  ]);
  const createElement = (type, props, ...children) => typeof type === 'function'
    ? type({ ...props, children: children.flat(Infinity) }) : { type, props: props ?? {}, children: children.flat(Infinity) };
  const context = vm.createContext({ Date: class extends Date { static now() { return base; } }, createElement });
  function requireModule(name) {
    if (cache.has(name)) return cache.get(name);
    assert.ok(['./widget', './time_gate', './countdown'].includes(name), `unexpected module ${name}`);
    const source = readFileSync(new URL(`../MetroMinutes/${name.slice(2)}.tsx`, import.meta.url), 'utf8');
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

test('small widget archives all three arrival/departure timers and the terminal cards in one presentation', async () => {
  const { tree, policy } = await renderWidget('systemSmall');
  const deadlines = new Set(nodes(tree, 'TimerIntervalLabel').map(n => n.props.to));
  for (const t of trains) { assert.ok(deadlines.has(t.arrival)); assert.ok(deadlines.has(t.departure)); }
  assert.ok(!deadlines.has(snapshot.up[0].arrival));
  assert.match(textOf(tree), /班次数据已用完/);
  assert.match(textOf(tree), /旧数据已失效/);
  assert.equal(policy.date.getTime(), base + 300000);
});

test('both directions have independent decks, opaque covers and no masked refresh buttons', async () => {
  for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
    const { tree } = await renderWidget(family);
    const masked = nodes(tree, 'ZStack').filter(n => n.props.mask);
    assert.ok(masked.length > 0 && masked.length <= (family === 'systemSmall' ? 14 : 28));
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
  const { tree } = await renderWidget('systemSmall', { snapshot: { ...snapshot, down: [t] }, error: null });
  assert.ok(!nodes(tree, 'TimerIntervalLabel').some(n => n.props.to === t.departure));
  assert.match(textOf(tree), /停靠待确认/);
  assert.doesNotMatch(textOf(tree), /预计停站中/);
});
