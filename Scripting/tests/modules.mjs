import { readFileSync } from 'node:fs';
import ts from 'typescript';

const cache = new Map();
export function moduleURL(name) {
  const file = new URL('../MetroMinutes/' + name, import.meta.url);
  if (name.endsWith('.js')) return file.href;
  if (cache.has(name)) return cache.get(name);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/from "\.\/([^"]+)"/g, (_, dep) =>
    'from ' + JSON.stringify(moduleURL(dep === 'core' ? 'core.js' : dep + '.ts')));
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(name, url);
  return url;
}
export const loadModule = name => import(moduleURL(name));
