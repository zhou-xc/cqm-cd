import ts from 'typescript';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../MetroMinutes/', import.meta.url);
const files = readdirSync(root);
const metadata = JSON.parse(readFileSync(new URL('script.json', root)));
for (const key of ['name', 'icon', 'color', 'version']) assert.ok(metadata[key], key);
assert.equal(metadata.name, 'MetroMinutes');
const errors = [];
for (const file of files.filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))) {
  const result = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, isolatedModules: true },
  });
  errors.push(...(result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error));
}
assert.deepEqual(errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')), []);
// Strict semantic checking of portable data logic against its real domain types.
const program = ts.createProgram([new URL('data.ts', root).pathname.replace(/^\/(\w:)/, '$1')], {
  strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.deepEqual(diagnostics.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')), []);
const visited = new Set();
function checkImports(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const imports = ts.preProcessFile(readFileSync(new URL(file, root), 'utf8')).importedFiles;
  for (const item of imports) {
    if (item.fileName === 'scripting') continue;
    assert.ok(item.fileName.startsWith('./'), `Unexpected runtime dependency: ${item.fileName}`);
    const stem = item.fileName.slice(2);
    const target = ['.ts', '.tsx', '.js'].map(ext => stem + ext).find(f => existsSync(new URL(f, root)));
    assert.ok(target, `Missing import ${item.fileName} in ${file}`);
    checkImports(target);
  }
}
for (const entry of ['index.tsx', 'widget.tsx', 'app_intents.tsx', 'live_activity.tsx']) checkImports(entry);
console.log('Metadata, TypeScript syntax, strict domain types and four entry-point dependency graphs: PASS');
console.log('Scripting native API types and iOS host behavior require app-synced declarations / a real device.');
