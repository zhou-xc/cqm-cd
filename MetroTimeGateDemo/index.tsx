import { Script, Widget } from "scripting";
import { restart } from "./session";

async function main() {
  await Dialog.alert({
    title: "时间遮罩实验 · 尚未验证",
    message: "添加桌面小组件，选择 MetroTimeGateDemo。回到桌面后点“重开 60 秒演示”。\n\n预期：第 1 班 → 20 秒时第 2 班 → 40 秒时第 3 班 → 60 秒时演示结束。\n\n观察底部“渲染”时间：它不变而卡片切换，才说明没有依赖脚本重新运行。切换时刻以卡片上标出的时间为准。\n\n若卡住、重影、提前显示或报错，则实验未通过。代码使用当前文档中的 ProgressView、mask、contrast、luminanceToAlpha；较旧的 Scripting 可能不支持。\n\n这不是正式地铁数据，不修改 MetroMinutes。",
  });
  restart();
  Widget.reloadAll();
  Script.exit();
}
void main();
