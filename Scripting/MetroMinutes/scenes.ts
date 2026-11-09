import { savedPreferences, savePreferences } from "./service";
import { readBook, validateScene, resolveScene, type Scene, type SceneID, type SceneBook } from "./commute";
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
export const currentScene = (parameter: unknown) => resolveScene(parameter, savedScenes(), savedPreferences());
