import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import core, { STATIONS } from '../MetroMinutes/core.js';
import { loadModule } from './modules.mjs';
const commute = await loadModule('commute.ts');
const data = await loadModule('data.ts');
const base = Date.parse('2026-11-09T08:00:00+08:00');
const p = core.resolveParameter('头塘|4号线|up|timer|dark', core.preferences());
const treeNodes = (tree, type) => {
  if (!tree || typeof tree !== 'object') return [];
  if (tree.props.sheet?.isPresented) return treeNodes(tree.props.sheet.content, type);
  return [...(tree.type === type ? [tree] : []), ...tree.children.flatMap(c => treeNodes(c, type)),
    ...Object.values(tree.props.toolbar ?? {}).flatMap(c => treeNodes(c, type))];
};

// Stateful JS-only host for the actual onboarding/share handlers. It checks
// navigation and persistence, not SwiftUI pixels or native event delivery.
function host() {
  const storage = new Map(), hooks = new Map(), alerts = [], previews = [], calls = [];
  let active, visited, clipboard = '';
  const scripting = Object.fromEntries(['Button', 'HStack', 'Image', 'Spacer', 'Link', 'List', 'NavigationStack', 'Picker',
    'Text', 'TextField', 'VStack', 'TimerIntervalLabel'].map(n => [n, n]));
  scripting.Navigation = { useDismiss: () => () => {} };
  scripting.Widget = { reloadAll: () => calls.push('reload'), preview: async o => previews.push(o) };
  scripting.useState = initial => {
    const values = hooks.get(active.name), index = active.index++;
    if (!(index in values)) values[index] = initial;
    return [values[index], value => { values[index] = value; }];
  };
  const createElement = (type, props, ...children) => {
    if (typeof type !== 'function') return { type, props: props ?? {}, children: children.flat(Infinity) };
    const parent = active; active = { name: type.name, index: 0 }; visited.add(type.name);
    if (!hooks.has(type.name)) hooks.set(type.name, []);
    try { return type({ ...props, children: children.flat(Infinity) }); } finally { active = parent; }
  };
  const cache = new Map([
    ['scripting', scripting], ['./core', { default: core, STATIONS }], ['./commute', commute], ['./data', data],
    ['./service', { savedPreferences: () => p, savePreferences: value => storage.set('cqmetro.preferences', value),
      savedWidgetRendering: () => 'compatible', saveWidgetRendering: value => storage.set('mode', value),
      query: async (pref, force) => { calls.push({ pref, force }); return { snapshot: null, error: 'offline' }; } }],
    ['./activity', { endActivity: async () => {}, startOrUpdate: async () => {} }],
  ]);
  const context = vm.createContext({ createElement, Date: class extends Date { static now() { return base; } },
    Storage: { get: key => storage.get(key), set: (key, value) => storage.set(key, value) },
    Dialog: { alert: async o => alerts.push(o) }, Pasteboard: { setString: async s => { clipboard = s; }, getString: async () => clipboard },
    setTimeout: () => 1, clearTimeout: () => {} });
  function requireModule(name) {
    if (cache.has(name)) return cache.get(name);
    assert.ok(['./commute_page', './setup', './countdown', './scenes'].includes(name), name);
    const root = new URL('../MetroMinutes/', import.meta.url);
    const url = ['.tsx', '.ts'].map(ext => new URL(name.slice(2) + ext, root)).find(existsSync);
    const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: 'createElement',
    } });
    const module = { exports: {} }; cache.set(name, module.exports);
    vm.runInContext(`(function(require,module,exports){${outputText}\n})`, context)(requireModule, module, module.exports);
    return module.exports;
  }
  const { CommutePage } = requireModule('./commute_page');
  const initialBook = commute.readBook(null), initial = commute.draftScene(p);
  let tree;
  function render() {
    visited = new Set(); tree = createElement(CommutePage, { initial, initialBook });
    for (const key of hooks.keys()) if (!visited.has(key)) hooks.delete(key);
    return tree;
  }
  render();
  const find = (type, title) => {
    const node = treeNodes(tree, type).find(n => n.props.title === title || n.props.accessibilityLabel === title);
    assert.ok(node, `missing ${type}: ${title}`); return node;
  };
  return { storage, alerts, previews, calls, render,
    text: () => treeNodes(tree, 'Text').flatMap(n => n.children).join(' '),
    click: async title => { const n = find('Button', title); assert.ok(!n.props.disabled, title); await n.props.action(); await new Promise(resolve => setImmediate(resolve)); render(); },
    change: (type, title, value) => { find(type, title).props.onChanged(value); render(); },
    search: value => {
      const lists = treeNodes(tree, 'List').filter(n => n.props.searchable);
      assert.equal(lists.length, 1, 'search belongs inside the open destination list');
      assert.equal(lists[0].props.navigationTitle, '下车站');
      lists[0].props.searchable.onChanged(value); render();
    },
    has: (type, title) => treeNodes(tree, type).some(n => n.props.title === title || n.props.accessibilityLabel === title),
    button: title => find('Button', title),
    clipboard: () => clipboard,
  };
}
test('first-use setup, preview, sharing and reviewed import form a complete workflow', async () => {
  const ui = host();
  assert.match(ui.text(), /第 1 \/ 4 步/);
  assert.equal(ui.storage.size, 0);
  await ui.click('下一步');
  assert.equal(ui.button('下一步').props.disabled, true);
  await ui.click('选择下车站');
  ui.search('民安');
  await ui.click('民安大道');
  await ui.click('下一步');
  ui.change('Picker', '步行到站口', 7);
  await ui.click('下一步');
  assert.match(ui.text(), /步行 7/);
  await ui.click('保存上班场景');
  assert.equal(ui.storage.get('cqmetro.scenes.v1').scenes.work.walkMinutes, 7);
  assert.match(ui.text(), /场景已保存/);
  await ui.click('小号');
  assert.equal(ui.previews[0].parameters.options.current, 'scene:work');
  await ui.click('复制候车倒计时参数');
  assert.equal(ui.clipboard(), 'scene:work');
  assert.match(ui.text(), /小号看所选方向倒计时/);
  const savedBefore = JSON.stringify([...ui.storage]);
  const callsBefore = ui.calls.length;
  ui.change('Picker', '组件内容', 'commute');
  assert.match(ui.text(), /小号看出门建议/);
  await ui.click('中号');
  assert.equal(ui.previews.at(-1).parameters.options.current, 'commute:work');
  await ui.click('复制通勤建议参数');
  assert.equal(ui.clipboard(), 'commute:work');
  ui.change('Picker', '组件内容', 'waiting');
  await ui.click('大号');
  assert.equal(ui.previews.at(-1).parameters.options.current, 'scene:work');
  assert.equal(JSON.stringify([...ui.storage]), savedBefore, 'content choice does not overwrite scene or render settings');
  assert.equal(ui.calls.length, callsBefore, 'preview/copy choice does not query or reload other widgets');
  await ui.click('我已了解，返回看板');
  assert.equal(ui.storage.get('cqmetro.scenes.v1').onboarded, true);
  await ui.click('分享 / 导入通勤配置');
  await ui.click('复制上班分享码');
  assert.equal(commute.importScene(ui.clipboard()).walkMinutes, 7);
  await ui.click('从剪贴板粘贴');
  await ui.click('校验并预览导入内容');
  assert.equal(ui.storage.get('cqmetro.scenes.v1').scenes.home, undefined, 'preview cannot overwrite saved scenes');
  await ui.click('保存为回家场景');
  const book = ui.storage.get('cqmetro.scenes.v1');
  assert.equal(book.scenes.work.walkMinutes, 7);
  assert.equal(book.scenes.home.walkMinutes, 7);
  assert.equal(book.active, 'home');
});

test('cancelled onboarding and invalid share codes cannot change existing configuration', async () => {
  const ui = host();
  await ui.click('稍后设置，先查看到站');
  assert.equal(ui.storage.size, 0);
  await ui.click('分享 / 导入通勤配置');
  ui.change('TextField', '粘贴场景配置码', 'CQMETRO1:broken');
  await ui.click('校验并预览导入内容');
  assert.match(ui.alerts.at(-1).message, /无法导入/);
  assert.equal(ui.storage.size, 0);
  await ui.click('返回通勤看板');
  await ui.click('显示设置与锁屏计时');
  await ui.click('复制候车组件参数');
  assert.equal(ui.clipboard(), core.parameter(p));
});

test('waiting widgets can be added without a commute profile, and advice requires saving a scene', async () => {
  const ui = host();
  await ui.click('稍后设置，先查看到站');
  await ui.click('添加桌面组件');
  assert.match(ui.text(), /把候车倒计时放到桌面/);
  await ui.click('小号');
  assert.equal(ui.previews.at(-1).parameters.options.current, core.parameter(p));
  await ui.click('复制候车倒计时参数');
  assert.equal(ui.clipboard(), core.parameter(p));
  ui.change('Picker', '组件内容', 'commute');
  assert.ok(ui.button('小号').props.disabled);
  assert.ok(ui.button('复制通勤建议参数').props.disabled);
  assert.equal(ui.storage.size, 0);
  await ui.click('先保存通勤场景');
  assert.match(ui.text(), /第 1 \/ 4 步/);
});

test('destination search and selection share one list and cancellation preserves the selected station', async () => {
  const ui = host();
  await ui.click('下一步');
  assert.ok(!ui.has('TextField', '查找下车站'), 'no separate search field outside the selector');
  await ui.click('选择下车站');
  assert.ok(!ui.has('Button', '头塘'), 'origin cannot be a destination');
  ui.search('不存在的车站');
  assert.match(ui.text(), /没有找到匹配站点/);
  assert.ok(!ui.has('Button', '民安大道'));
  await ui.click('取消选择');
  assert.ok(ui.button('下一步').props.disabled, 'cancelling does not invent a selection');
  await ui.click('选择下车站');
  assert.ok(ui.has('Button', '民安大道'), 'reopening starts with an unfiltered list');
  ui.search(' 民安 ');
  assert.ok(ui.has('Button', '民安大道'));
  assert.ok(!ui.has('Button', '兰花路'));
  await ui.click('民安大道');
  assert.match(ui.text(), /民安大道/);
  assert.ok(!ui.button('下一步').props.disabled, 'one tap selects and closes the list');
  await ui.click('选择下车站');
  assert.equal(ui.button('民安大道').props.systemImage, 'checkmark');
  ui.search('兰花');
  await ui.click('取消选择');
  assert.match(ui.text(), /民安大道/);
  assert.equal(ui.storage.size, 0, 'selection edits only the unsaved draft');
});
