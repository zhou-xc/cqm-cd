import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import core from "./core";
import { query, savedPreferences } from "./service";
import { currentScene } from "./scenes";

export const RefreshArrival = AppIntentManager.register({
  name: "CQMetroRefreshArrival",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (parameter: string) => {
    const p = core.resolveParameter(parameter, savedPreferences());
    await query(p, true);
    Widget.reloadAll();
  },
});

export const RefreshCommute = AppIntentManager.register({
  name: "CQMetroRefreshCommute",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (parameter: string) => {
    await query(currentScene(parameter).preferences, true);
    Widget.reloadAll();
  },
});
