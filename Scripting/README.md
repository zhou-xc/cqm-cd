# 重庆轨道到站 · Scripting

此分支新增可直接导入 Scripting 的脚本，目录为 [`MetroMinutes`](./MetroMinutes)。原仓库的原生 iOS 项目保留。

[在 iPhone 上导入 Scripting](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fzhou-xc%2Fcqm-cd%2Ftree%2Fscripting%2FScripting%2FMetroMinutes%22%5D)

如果浏览器没有唤起 App，在 Scripting 的 GitHub / URL 导入入口粘贴下面这个**子目录地址**：

```text
https://github.com/zhou-xc/cqm-cd/tree/scripting/Scripting/MetroMinutes
```

不要导入整个仓库根目录，根目录是原生 App 项目。目标目录直接包含 `script.json`、`index.tsx`、`widget.tsx`；不需要 npm 安装、编译、Apple 开发者账号或自己签名。建议使用最新版 Scripting；桌面交互按钮需要 iOS 17 或以上。脚本未使用 Pro 后台任务、远程推送或付费 API。Scripting 自身的功能授权以安装版本为准。

## 第一次使用

1. 导入后运行 **MetroMinutes**，允许网络访问，选择线路、站点和方向。
2. 在桌面添加 Scripting 的小号组件，编辑小组件，脚本选择 **MetroMinutes**。
3. 参数留空，组件使用脚本中保存的设置。点组件主体进入设置；点 `arrow.clockwise` 图标重新查询。
4. 需要锁屏显示时，在脚本里点 **开始 / 更新锁屏倒计时**，允许实时活动。关闭页面后系统倒计时继续。
5. 再次点开始 / 更新会更新已有活动；点 **结束锁屏倒计时**移除本脚本创建的活动。

小号组件采用纯图标交互：20pt 刷新图标、至少 44×44pt 点击区域，与倒计时并排，底部显示状态及查询时间。站名和方向使用单行缩放。中号显示双向班次；大号补充后续班次。最终布局以真实桌面为准，App 预览不等于 WidgetKit 实际渲染。

```text
┌──────────────────────┐
│ 二郎              环线│
│ 方向一 · 上桥         │
│  3:24          ⟳     │
│ 预计到站              │
│ 查 08:26:36           │
└──────────────────────┘
```

## 多个独立组件

在各组件的参数中分别填写（也可填写完整配置 JSON）：

```text
二郎|环线|up|timer|dark
头塘|4号线|down|timer|light
```

格式：`站名或站号|线路名或线路号|up或down|timer|dark或light`。换乘站必须指定线路。环线方向沿用接口的“方向一 / 方向二”，并显示该班车的终点；不会根据终点名称猜测内环外环。脚本详情页会显示当前配置的参数文本。

## 刷新和时效

- 秒数由 `TimerIntervalLabel` 的系统计时显示更新，无需每秒运行 JavaScript。倒计时到零停止，不会正向计时。
- **计时更新不等于班次更新。** 数据来自重庆轨道官方匿名 H5 查询接口，页面和组件均保留查询时间。
- 刷新图标通过 AppIntent 强制查询，写入缓存后请求 WidgetKit 重绘。系统仍掌控显示时机；不能保证每次点击都瞬间重绘。
- 自动更新仅向系统申请约一分钟后的刷新，不承诺固定间隔。一般加载的 20 秒缓存用于避免点击刷新后紧接着再请求一次。
- 查询失败保留缓存原始时间，并标“刷新失败 · 缓存”。再次渲染时，超过 5 分钟的缓存不再用于显示倒计时。系统若延迟重绘，旧画面仍可能保留，需结合查询时间判断。
- 实时活动展示一次查询选中的班车，不后台轮询，不自动切换下一班；到站或查询超过 5 分钟即提交为过期时间。系统不保证立刻移除过期画面，可在脚本里手动结束。
- 无班次、末班后、响应异常时显示明确状态，不能把空列表当作“马上到站”。

## 开发与验证

只把 `MetroMinutes/` 导入手机，开发依赖和测试位于它的外层。桌面 Node.js 20+：

```sh
cd Scripting
npm ci
npm run check
npm test
# 可选：向公开接口发出一次真实查询
npm run smoke
```

`check` 检查项目元数据、TS/TSX 语法、纯数据模块严格类型和入口依赖解析；它没有伪造 Scripting 的原生类型声明，**不等同于完整原生 API 类型检查或 iPhone 验证**。连接官方 `scripting-cli` 后可用 App 同步的声明做进一步检查。

测试覆盖摘要 / AES / RSA、真实响应样本、时间和方向解析、换乘站参数、过期缓存、强制刷新、网络失败和乱序响应。实际接口检查只证明检查当时网络和协议可用。

导入后需在真机验证：小号站名与方向不被裁掉；刷新图标独立可点；计时到零不倒增；飞行模式有缓存/失败提示；两组件参数互不串站；深浅色和系统着色模式；锁屏活动在关闭脚本后继续、再次打开可更新和结束。没有进行真机验证前，不把本版本称作已完成系统联调。

## 实现来源

`core.js` 从原有重庆轨道到站 Scriptable 脚本提取可移植的公开接口协议、站点目录和数据处理逻辑，不保留 Scriptable UI。内置 CryptoJS 的 MIT 授权保留在文件顶部；公钥和 appid 是匿名 H5 协议的公开材料，不包含用户账号凭据。

Scripting 接口依据：[官方文档索引](https://scriptingapp.github.io/llms.txt)、[Widget](https://scriptingapp.github.io/guide/Widget/Widget%20API.md)、[交互按钮](https://scriptingapp.github.io/guide/Interactive%20Widget%20and%20LiveActivity.md)、[LiveActivity](https://scriptingapp.github.io/guide/LiveActivity.md)、[Script 导入 URL](https://scriptingapp.github.io/guide/Script/Script.md)。
