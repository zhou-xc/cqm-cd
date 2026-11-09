import { Navigation, Script } from "scripting";
import { currentScene, savedScenes } from "./scenes";
import { CommutePage, stopPageClock } from "./commute_page";

async function main() {
  try {
    const scene = currentScene(Script.queryParameters?.parameter);
    await Navigation.present({ element: <CommutePage initial={scene} initialBook={savedScenes()} /> });
  } catch (e) {
    await Dialog.alert({ title: "重庆通勤助手", message: String(e instanceof Error ? e.message : e) });
  } finally { stopPageClock(); Script.exit(); }
}
void main();
