MetroTimeGateDemo 0.0.1 — 实验验证，尚未通过 iPhone 真机测试

目的：检验系统计时 ProgressView 在遮罩、缩放、对比度与亮度转透明度组合后，是否仍能在桌面组件里更新，从而切换预先生成的卡片。
不是正式地铁程序；没有网络请求，不读取或修改 MetroMinutes 的偏好、到站缓存。重开按钮会调用 Widget.reloadAll，因此其他 Scripting 小组件也可能响应刷新请求。

导入：在 iPhone 的 Scripting 中导入此 ZIP。若不能直接导入 ZIP，解压后把 script.json、index.tsx、widget.tsx、app_intents.tsx、session.ts 放入同名脚本目录。
添加桌面小组件，脚本选择 MetroTimeGateDemo。建议先用中号、普通深浅色桌面模式。
在桌面组件点击“重开 60 秒演示”。随后停留观察，不要手动刷新。

预期：第 1 班（0–20 秒）→ 第 2 班（20–40 秒）→ 第 3 班（40–60 秒）→ 演示结束。
按钮与系统渲染存在调度延迟，以卡片标出的绝对切换时刻为准。
只有“渲染 HH:MM:SS”保持不变而卡片到点切换，才支持“无需重新运行脚本”的假设。
若“渲染”时间改变，说明系统重新运行过脚本，不能据此认定实验成功。
若一开始显示结束、多卡重影、卡住、过早出现、遮罩错误或 API 报错，则实验失败，不能接入正式版。

持续观察后，再验证退出桌面、锁屏/解锁、重新回到桌面时是否仍显示正确阶段；还需检查小号、着色模式以及不同 iOS/Scripting 版本。
使用了当前 Scripting 文档中的 contrast 与 luminanceToAlpha 等接口，旧版本可能不支持。
目前只检查 TS/TSX 语法、文件依赖、打包内容和预定时刻计算；这些检查不证明系统渲染行为有效。

设计：三班及结束提示全部预先叠放。第二、第三班和结束提示分别用原生计时进度条构成的遮罩显隐。显示文字不依赖 JavaScript 定时器，也不使用循环动画。取进度条中心放大并裁剪，使填充跨过中点时接近整卡切换；实际渐变、轨道透明度及刷新粒度仍待实机确认。

文档：
https://scriptingapp.github.io/guide/Views/Controls/ProgressView/
https://scriptingapp.github.io/guide/View%20Modifiers/mask
https://scriptingapp.github.io/guide/View%20Modifiers/scaleEffect
https://scriptingapp.github.io/guide/View%20Modifiers/Color%20%26%20Filter%20Effects
https://developer.apple.com/documentation/widgetkit/displaying-dynamic-dates
