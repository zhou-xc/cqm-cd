# 到站 · MetroMinutes

重庆轨道到站查询的原生 iPhone 应用与黑白桌面小组件。最低 iOS 17。

**当前交付状态：源码初版和 macOS 构建流程已准备；尚未经过 Xcode 编译、模拟器运行或真机安装。此源码包不是 IPA。**

## 功能

- 应用内选择站点、线路和方向，保存偏好；目录含 2026-11-06 获取的 328 条站点与线路组合。
- 显示最近一班及接口返回的后续可乘班次，手动刷新、下拉刷新、回到应用时刷新。
- 黑底白字或白底黑字；桌面提供小号和中号小组件、刷新按钮、点击站名打开应用。
- 两位分钟数（例如 `03`）或系统原生分秒倒计时（例如 `3:20`）。
- 相同到站时刻及目的地的重复记录合并；跳过 `skip_stop_flag=2` 的不停靠班次。
- 不把缺失方向替换成另一方向，不把历史记录补成未来班次；5 分钟后按过期处理。
- 无服务器、无渝畅行账号、无定位权限；设备直接查询官方 H5 使用的匿名接口。

## 桌面刷新边界

普通 App 图标保持静态。用户指定的站名和数字显示在桌面小组件内，最小约占 2×2 图标位置。

两位分钟模式预先提交分钟变化的时间轴，**WidgetKit 可能延迟或合并这些显示更新，不能保证每分钟准点变化**。连续分秒模式使用系统动态时间文本。两种模式的计时都基于上次查询的预计到站时间，并不意味着每秒或每分钟重新查过线路数据。到站后切换后续班次、过期提示也依赖系统展示时间轴。

小组件申请约每 5 分钟刷新；这只是请求时间，iOS 可能明显推迟。需要及时校准时点击小组件刷新或打开应用。更新时间始终可见。5 分钟有效期是本应用选择的保守策略，不是接口官方承诺。

## 两种签名适配

| 构建模式 | 应用内设置同步到桌面 | 适用条件 |
|---|---|---|
| `shared` 完整版 | 支持，小组件默认跟随应用；也可分别配置 | App 和 Widget 都有匹配的 App Groups 权限、签名与描述文件 |
| `portable` 独立设置版 | 不自动同步；小组件通过“长按 → 编辑小组件”单独选站 | 减少共享权限要求，供个人签名工具尝试；仍需支持 Widget 扩展的签名 |

`shared` 对应最初的完整目标。`portable` 是 Windows/爱思安装环境下的兼容选项，不能声称完全等同于共享版。爱思是否保留并正确签名 Widget 扩展、设备上能否添加小组件，均需实际验证。

## 生成 IPA

见 [INSTALL.md](INSTALL.md)。仓库附有 `.github/workflows/ios.yml`：手动触发 macOS runner，生成工程，运行 iOS 模拟器测试，编译 iPhone arm64 App，并打包含 Widget 扩展的 **UNSIGNED.ipa**。编译或测试失败时不会进入 IPA 打包步骤。

构建和签名是两件事。工程公开托管在 [zhou-xc/cqm-cd](https://github.com/zhou-xc/cqm-cd)。云端构建不使用用户的 Apple ID、签名私钥或描述文件。`main` 上的代码变更会触发 `portable` 构建，也可手动选择构建模式；最新状态见仓库 Actions。

## 本地核验

- 2026-11-06 14:39（北京时间）：Node 实测同一公开协议，二郎环线仅返回一个方向，头塘 4/9 号线均返回两个方向。
- 对 Swift 文件做语法树解析检查，对工程/工作流配置做格式检查；这不等于 Xcode 类型检查或编译。
- `Tests/` 包含可在 Xcode/CI 执行的真实响应解码、跳站/重复过滤、方向隔离、缓存过期和密码学参考向量测试。当前 Windows 环境未执行这些 XCTest。
- `Preview/` 是布局示意，使用明确标注的示例数据，不是 iOS 模拟器截图。

## 文件

- `App/`：SwiftUI 应用、设置与选站页面。
- `Widget/`：WidgetKit、独立配置、刷新 App Intent。
- `Shared/`：API 请求、签名与解密、数据模型、共享/独立存储。
- `Resources/`：站点目录与黑白图标。
- `tools/prepare-data.cjs`：通过只读接口更新目录和测试样本；不要高频执行。
- `tools/configure.py`：根据签名模式与 Bundle ID 生成 XcodeGen 项目配置。

## 数据与来源

匿名请求协议来自 [渝畅行公开 H5](https://ycx.cqmetro.cn/app-h5/msx-metro-pis/)，不是有稳定性承诺的开放开发者 API。公钥和应用标识均来自该页面公开前端资源；无用户登录凭据。

Apple：[小组件刷新](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)、[动态时间显示](https://developer.apple.com/documentation/widgetkit/displaying-dynamic-dates)、[设备分发](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)。爱思：[IPA 签名教程](https://www.i4.cn/news_detail_38195.html)。
