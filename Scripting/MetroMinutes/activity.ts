import { LiveActivity } from "scripting";
import { ACTIVITY_NAME, MetroActivity, type ActivityData } from "./live_activity";

type SavedActivity = { id: string; data: ActivityData };
const KEY = "cqmetro.activity";

export async function startOrUpdate(data: ActivityData) {
  if (!await LiveActivity.areActivitiesEnabled()) throw new Error("请先在系统设置中允许 Scripting 使用实时活动");
  const saved = Storage.get<SavedActivity>(KEY);
  const options = { staleDate: Math.min(data.arrival, data.fetchedAt + 300000) };
  if (saved) {
    const state = await LiveActivity.getActivityState(saved.id);
    if (state === "active" || state === "stale") {
      await LiveActivity.from<ActivityData>(saved.id, ACTIVITY_NAME).update(data, options);
      Storage.set(KEY, { id: saved.id, data });
      return;
    }
  }
  // The public reference exposes enumeration/from(), but no instance ID getter.
  // Capture the newly created ID; refuse an ambiguous match instead of adopting another activity.
  const before = new Set(await LiveActivity.getAllActivitiesIds());
  const activity = MetroActivity();
  if (!await activity.start(data, options)) throw new Error("实时活动未能启动，请检查系统权限或活动数量");
  const added = (await LiveActivity.getAllActivitiesIds()).filter(id => !before.has(id));
  if (added.length !== 1) {
    await activity.end(data, { dismissTimeInterval: 0 });
    throw new Error("无法保存实时活动标识，请重试");
  }
  Storage.set(KEY, { id: added[0], data });
}

export async function endActivity() {
  const saved = Storage.get<SavedActivity>(KEY);
  if (!saved) return;
  const state = await LiveActivity.getActivityState(saved.id);
  if (state === "active" || state === "stale" || state === "ended") {
    await LiveActivity.from<ActivityData>(saved.id, ACTIVITY_NAME).end(saved.data, { dismissTimeInterval: 0 });
  }
  Storage.remove(KEY);
}
