import core, { type Preferences } from "./core";
import { load, type Ports } from "./data";

export const ports: Ports = {
  get: key => Storage.get(key),
  set: (key, value) => Storage.set(key, value),
  now: () => Date.now(),
  request: async p => {
    const spec = core.requestSpec(p, Date.now(), () => UUID.string());
    const response = await fetch(spec.url, { method: "POST", headers: spec.headers, body: spec.body, timeout: 12 });
    if (!response.ok) throw new Error(`查询失败（HTTP ${response.status}）`);
    const result = core.decode(await response.text(), { "decrypt-body": response.headers.get("decrypt-body") ?? "" });
    return core.snapshot(result, p, Date.now());
  },
};
export function savedPreferences(): Preferences {
  try { return core.preferences(Storage.get<Preferences>("cqmetro.preferences") ?? { mode: "timer" }); }
  catch { return core.preferences({ mode: "timer" }); }
}
export function savePreferences(p: Preferences) { Storage.set("cqmetro.preferences", core.preferences(p)); }
export const query = (p: Preferences, force = false) => load(p, force, ports);
