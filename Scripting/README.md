# 重庆轨道到站 · Scripting

将 [`MetroMinutes`](./MetroMinutes) 导入 iPhone 的 Scripting App。原生 Swift 项目仍保留在仓库中，本页说明脚本版。

## 1.2.0

- 桌面组件接入用户已实测的时间遮罩：一次生成近三班的到达、停站、发车与结束画面，由系统计时进度条控制显隐。**不再依赖每个到发时刻重新运行 JavaScript 才能换班。**
- 小号显示选定方向；中号和大号各自准备双向班次。有有效发车时间且停靠确认的班次，会从到达倒计时切为发车倒计时；停靠待确认或发车时间缺失时不显示发车倒计时。
- 同时预先生成查询 5 分钟后的旧数据提示、30 分钟后的失效画面，以及本批班次用完后的刷新提示。不会循环回第一班，也不外推第四班。
- 刷新按钮始终在遮罩层外。手动刷新会查询新数据并重建画面；系统刷新申请用于补充数据，不承担逐班切换。

以下 1.1.0 的功能继续保留：

- 保留接口的停站标记，结合用户提供的四张时刻表、方向及停靠站，显示 **快速 / 直快 / 疑似快速 / 疑似直快**。没有充分证据时显示 **停靠待确认**，不因 `skip_stop_flag=2` 删除记录。
- 时刻匹配允许 **前后 10 分钟**。宽范围匹配必须同时有标记 `2`、正确的本站/线路/方向/终点信息，且只有一个候选；不会把窗口内普通班次全部改成快车。规则与来源见 [TIMETABLES.md](./TIMETABLES.md)。
- 页面无需再次联网，即可根据上次响应推算到达、停站、发车和下一班。每秒更新本地时间，不每秒请求接口。
- 有可靠的停靠判断和有效预计发出时间时，停站阶段显示 **距预计发车** 倒计时；没有发出时间就不显示发车倒计时。停靠未知的记录也不显示“停站中”。
- 桌面展示相同状态、快车标记、到发时间和数据来源；锁屏为选定单班展示预计到达，以及有条件显示的预计发车倒计时。
- 复制小组件参数功能保留。

**验证范围：** 40 项 Node 自动测试、TS/TSX 语法、纯数据模块严格类型及入口依赖检查通过。包括一次生成后逐秒核对预定画面，以及真实 widget.tsx 在模拟宿主中生成三班原生倒计时、遮罩及结束画面的检查。用户已反馈 [MetroTimeGateDemo](../MetroTimeGateDemo) 在其设备自动切卡且渲染时间不变；正式版的多层双向布局、内存占用、着色模式和其他设备仍需实机核对。这些测试不模拟 iOS 的遮罩渲染，也不等同于 Scripting 原生 API 完整类型检查。

## 导入与更新

[在 iPhone 上导入 / 更新 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fzhou-xc%2Fcqm-cd%2Ftree%2Fscripting%2FScripting%2FMetroMinutes%22%5D)

如果没有唤起 App，在 Scripting 的 GitHub / URL 导入入口粘贴：

```text
https://github.com/zhou-xc/cqm-cd/tree/scripting/Scripting/MetroMinutes
```

只导入这个子目录。它包含 `script.json`、`index.tsx` 和 `widget.tsx`，无需 npm 安装、编译或自己签名。更新到 **1.2.0** 后，运行一次并刷新桌面组件，让旧画面替换为新的三班画面。脚本名称仍是 **MetroMinutes**，不需要选择演示脚本；1.1.0 的站点偏好和缓存可继续使用。

## 使用

1. 运行 **MetroMinutes**，允许网络访问，选择线路、站点和方向。
2. 添加 Scripting 桌面组件，脚本选择 **MetroMinutes**。参数留空使用脚本中保存的设置。
3. 多个组件独立配置时，在脚本里选好站点、方向和主题，点 **复制小组件参数**，再长按目标组件 → 编辑小组件 → 粘贴参数。
4. 点击组件主体进入设置；点击刷新图标强制联网校准。
5. 在页面中点 **开始 / 更新锁屏倒计时**；点 **结束锁屏倒计时**可移除本脚本的活动。

手动参数示例（也可使用完整配置 JSON）：

```text
头塘|4号线|up|timer|dark
兰花路|10号线|down|timer|light
```

格式：`站名或站号|线路名或线路号|up或down|timer|dark或light`。换乘站必须指定线路。环线的 up/down 保持接口方向，不凭名称猜测内外环。

## 状态和缓存推算

| 时刻 / 数据情况 | 显示 |
| --- | --- |
| 尚未到预计到达时间 | 预计到达 + 到达倒计时 |
| 距预计到达不超过 30 秒 | 预计即将到达 |
| 到达后、发出前，停靠已确认 | 预计停站中 + 发车倒计时 |
| 距预计发出不超过 15 秒 | 预计即将发车 |
| 缺少或无效的预计发出时间 | 预计已到站 · 发车时间未知，不显示发车倒计时 |
| 停靠尚未确认且到达时间已过 | 已到预计时刻 · 停靠待确认，不声称正在停站 |
| 超过有效预计发出时间 | 切换下一条已知班次；页面注明上一班预计已驶离 |
| 本批班次全部用完 | 桌面显示班次数据已用完 · 请刷新，不外推第四班 |
| 查询已过 5 分钟 | 明确标记旧数据推算 |
| 查询已满 30 分钟 / 时间异常 | 旧数据已失效 · 请刷新，停止倒计时 |

所有状态都是预测，不是车辆位置或开关门实况。原始查询时间不会因推算或请求失败而改写。无发出时间的班次，在到达后最多保留 60 秒的“发车时间未知”提示（或下一班到达即切换）；该窗口不代表实际停站 60 秒，不据此声称已驶离。

普通加载在 5 分钟内复用成功缓存，状态变化不需要 HTTP 请求。手动刷新始终绕过缓存。网络失败保留原始响应及查询时间，显示失败提示；失败后 20 秒内避免重复请求。30 分钟是本脚本选择的推算上限，不是接口保证。

### 桌面与锁屏边界

1.1.0 只在系统重新运行组件时选择下一班，原生倒计时归零不会触发选班。1.2.0 改为预先叠放各个状态画面，通过 `ProgressView(timerFrom/timerTo)`、缩放、亮度转透明度与 `mask` 控制显隐，沿用用户实测演示的组合。当前画面在底层，后续不透明画面依次覆盖旧内容；过期画面覆盖倒计时，结束后不会循环。

每个方向最多处理近三班、最多 15 个状态画面，并合并内容相同的时刻。各方向独立切换，更新时直接从当前时间继续，不重播过期班次。遮罩在边界附近的约 2 秒区间内变化，实际切换粒度仍由系统原生渲染决定，不能理解为精确的定时回调。用户已验证演示在其设备上的基本切卡效果，正式布局及其他系统版本需实测；Scripting 需支持该演示使用的遮罩与滤镜接口。

系统重新加载申请改为按查询的新鲜度安排（正常以 5 分钟为目标，失败或已过期后约 1 分钟申请重试），用于获取新数据，仍可能被延迟。已有三班之间的视觉切换无需再次联网或重跑脚本；手动刷新始终可以校准数据。查询时间只在获得新响应时改变。

锁屏 / 灵动岛的视图是系统快照，JavaScript 不会在关闭页面后持续更新。锁屏同时展示单班到达计时和（已确认停靠且有发出时间时）发车计时；灵动岛紧凑视图标明“发车 / 到达 / 待确认”。锁屏不会自动切下一班，到零后请更新。实时活动过期时间取该班发出时间（缺失时取到达时间）与查询后 30 分钟的较早者，过期不保证系统立即移除画面。

## 停站字段核查与历史修正

官方旧页面 `metroTrends` 将 `skip_stop_flag=2` 显示为“本站不停靠”，而 `metroTrendsV2` 没有读取该字段。两者使用同一查询接口，不能把旧页面文案、V2 的无差别展示，或标记 `2` 单独当成重庆所有交路的可靠结论。

1.0.2 曾恢复这些记录但没有保留停站标记用于展示；1.1.0 修正这一点，显式保留字段并显示证据和不确定性。头塘 `2026-11-09 09:51:08` 的真实响应在 `tests/fixtures/toutang-20261109.json`。其中往民安大道的 `10:00:25` 班次不会被删除，但没有头塘本站时刻表或明确跨线终点时仍为“疑似直快 · 停靠待确认”。

## 开发与验证

桌面 Node.js 20+：

```sh
cd Scripting
npm ci
npm run check
npm test
# 可选：向公开接口进行一次真实查询
npm run smoke
```

测试覆盖协议、真实响应、线路/方向隔离、±10 分钟边界、周别、匹配歧义、普通车误判防护、停靠表、缺失发出时间、停站倒计时、预生成三班状态序列、重合时刻去重、初次渲染中实际包含未来计时视图、缓存与过期、请求失败、乱序响应和活动恢复。手机上仍需核对复制、字号和裁切、快车标记、停站时倒计时切换、断网后的旧数据提示、双向组件、深浅色/着色模式及锁屏布局。

## 实现来源

图片来自本次用户提供的四张时刻表，仅转录其红字/蓝字快车时刻及经停站，未填造其他站时刻。CryptoJS MIT 授权保留在 `core.js` 顶部；匿名 H5 公钥和 appid 不包含用户账号凭据。

- [官方 H5](https://ycx.cqmetro.cn/app-h5/msx-metro-pis/)
- [旧页面处理](https://ycx.cqmetro.cn/app-h5/msx-metro-pis/static/js/3.2b2f1907abcc7f6a30ac.js)、[文案 / 路由](https://ycx.cqmetro.cn/app-h5/msx-metro-pis/static/js/app.b83dfb359e9613d94dff.js)、[V2 页面](https://ycx.cqmetro.cn/app-h5/msx-metro-pis/static/js/1.80b5de9e3ac54d1f0cfa.js)
- Scripting：[Widget API](https://scriptingapp.github.io/guide/Widget/Widget%20API.md)、[时间标签](https://scriptingapp.github.io/guide/Views/Time-based%20label%20views.md)、[生命周期](https://scriptingapp.github.io/guide/View%20Modifiers/Lifecycle%20Events.md)、[LiveActivity](https://scriptingapp.github.io/guide/LiveActivity.md)、[Pasteboard](https://scriptingapp.github.io/guide/Device%20Capabilities/Pasteboard.md)
- 时间遮罩：[ProgressView](https://scriptingapp.github.io/guide/Views/Controls/ProgressView/)、[mask](https://scriptingapp.github.io/guide/View%20Modifiers/mask)、[scaleEffect](https://scriptingapp.github.io/guide/View%20Modifiers/scaleEffect)、[颜色与滤镜](https://scriptingapp.github.io/guide/View%20Modifiers/Color%20%26%20Filter%20Effects)
