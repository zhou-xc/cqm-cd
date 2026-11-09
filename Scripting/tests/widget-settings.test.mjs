import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './modules.mjs';
const { savedWidgetRendering, saveWidgetRendering } = await loadModule('service.ts');

test('rendering defaults safely, persists opt-in, and can recover independently of widget parameters', () => {
  const prior = globalThis.Storage;
  const saved = new Map([['cqmetro.preferences', { stationID: '0403' }]]);
  globalThis.Storage = { get: key => saved.get(key), set: (key, value) => saved.set(key, value) };
  try {
    assert.equal(savedWidgetRendering(), 'compatible');
    saveWidgetRendering('automatic');
    assert.equal(savedWidgetRendering(), 'automatic');
    saveWidgetRendering('compatible');
    assert.equal(savedWidgetRendering(), 'compatible');
    assert.deepEqual(saved.get('cqmetro.preferences'), { stationID: '0403' });
    globalThis.Storage.get = () => 'unknown';
    assert.equal(savedWidgetRendering(), 'compatible');
    globalThis.Storage.get = () => { throw Error('unavailable'); };
    assert.equal(savedWidgetRendering(), 'compatible');
  } finally { globalThis.Storage = prior; }
});
