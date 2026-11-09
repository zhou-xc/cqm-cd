import core from "./core";
import { savedPreferences, savePreferences } from "./service";
import { draftScene, readBook, validateScene, resolveScene, widgetSelection, type Scene, type SceneID, type SceneBook } from "./commute";
const KEY = "cqmetro.scenes.v1";
export function savedScenes(): SceneBook {
  try { return readBook(Storage.get(KEY)); } catch { return readBook(null); }
}
export function saveScene(scene: Scene): SceneBook {
  const valid = validateScene(scene), book = savedScenes();
  book.scenes[valid.id] = valid; book.active = valid.id;
  Storage.set(KEY, book); savePreferences(valid.preferences);
  return book;
}
export function activateScene(id: SceneID): SceneBook {
  const book = savedScenes();
  if (!book.scenes[id]) throw Error("请先配置此场景");
  book.active = id; Storage.set(KEY, book); savePreferences(book.scenes[id]!.preferences);
  return book;
}
export function finishOnboarding() {
  const book = savedScenes(); book.onboarded = true; Storage.set(KEY, book);
}
export function currentScene(parameter: unknown): Scene {
  const { parameter: raw } = widgetSelection(parameter);
  const fallback = savedPreferences();
  // Explicit waiting-widget parameters do not need to read/validate profiles.
  if (raw && !raw.startsWith("CQMETRO1:") && !raw.startsWith("scene:")) {
    return draftScene(core.resolveParameter(raw, fallback));
  }
  return resolveScene(raw, savedScenes(), fallback);
}
