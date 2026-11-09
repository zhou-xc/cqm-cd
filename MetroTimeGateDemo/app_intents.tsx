import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import { restart } from "./session";

export const RestartDemo = AppIntentManager.register({
  name: "CQMetroRestartTimeGateDemo",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    restart();
    Widget.reloadAll();
  },
});
