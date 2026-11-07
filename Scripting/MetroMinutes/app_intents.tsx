import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import core from "./core";
import { query, savedPreferences } from "./service";

export const RefreshArrival = AppIntentManager.register({
  name: "CQMetroRefreshArrival",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (parameter: string) => {
    const p = core.resolveParameter(parameter, savedPreferences());
    await query(p, true);
    Widget.reloadAll();
  },
});
