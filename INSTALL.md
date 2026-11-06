# 从 Windows 到 iPhone

## 目前还缺的环节

当前文件是源码，不含已构建的 IPA。Windows 本机没有 Apple 的 iOS SDK/Xcode；需要 macOS 构建环境。现有工程提供 GitHub Actions 的 macOS 构建配置，不需要在构建阶段提供 Apple ID 或证书。

## 1. 在 GitHub 构建

1. 本项目的公开仓库为 [zhou-xc/cqm-cd](https://github.com/zhou-xc/cqm-cd)。也可使用你自己的仓库，将本目录内容放到仓库根目录，保留 `.github/workflows/ios.yml`。不要上传 `.python/`、`build/`、证书或私钥。
2. 打开仓库的 **Actions → Build iPhone app → Run workflow**。
3. 选择模式：`shared` 为应用与小组件共享设置；`portable` 为小组件单独设置，减少签名权限要求。填一个自己的 Bundle ID，例如 `cn.yourname.metrominutes`。模式与权限差异见 README。
4. 等待测试、编译及打包成功，再下载 `MetroMinutes-…-unsigned` 工件并解压。
5. 得到 `MetroMinutes-…-UNSIGNED.ipa`。**这个文件尚未签名，不能保证直接拖到手机就能安装。**

公开仓库的标准 GitHub 托管 runner 构建免费；私有仓库会占用账户构建额度。当前使用标准 `macos-15` runner。`main` 上的代码变更会自动构建独立设置版，也可手动触发；没有定时任务，不会把 App 发布到 App Store。具体规则见 [GitHub 计费说明](https://docs.github.com/en/actions/concepts/billing-and-usage)。

## 2. 签名与爱思安装

按爱思当前版本的“IPA 签名”功能，在你自己的电脑上选择 Apple ID 或已有证书签名，再安装。账号密码、证书私钥和密码无需发到聊天或写进仓库。

**主应用和 `PlugIns/MetroMinutesWidget.appex` 都必须正确签名；签名工具如果剥离扩展，就不会有桌面小组件。** 主应用和扩展的 Bundle ID 必须保持包含关系，扩展 ID 以主应用 ID 加 `.widget` 结尾。

`shared` 模式还需要主应用和扩展使用同一个已授权 App Group：`group.<你的 Bundle ID>`。签名/描述文件必须允许该权限，不能仅在文件中声明。若个人签名流程不支持，请使用 `portable`；它不要求 App Groups，但需要在小组件编辑页单独配置。

爱思官方文档说明，Apple ID 个人签通常有效 7 天，需重新签名。实际以签名结果为准。安装过程若系统提示信任开发者或启用开发者模式，请按系统提示处理。

## 3. 添加和设置

1. 安装后先打开“到站”，允许联网，选择站点与方向，点刷新确认真实数据。
2. 长按主屏幕空白处 → 编辑 → 添加小组件 → 搜索“到站”。
3. `shared` 默认跟随应用；`portable` 需长按小组件 → 编辑小组件 → 设置站点、方向与外观。方向一/二对应应用中从左至右的两个方向；应用里会根据返回班次显示具体目的地。
4. 小组件右上角 ↻ 刷新；站名打开应用。两位分钟模式可能被系统延迟，连续分秒模式可在显示方式中选择。

## 有 Mac 时

安装 Xcode、XcodeGen 和 Python 的 PyYAML 后：

```sh
python3 tools/configure.py --mode shared --bundle-id cn.yourname.metrominutes
xcodegen generate --spec project.generated.json
open MetroMinutes.xcodeproj
```

在主应用和 Widget 两个 target 中选择自己的开发团队，配置与 Bundle ID 匹配的 App Group，再运行测试/真机或 Archive 导出有效签名的 IPA。

## 验收项

- 应用能查询二郎与头塘，切换方向不会把另一方向的缓存当作当前数据。
- 头塘同一物理站的 4 号线和 9 号线可以分别选择。
- 刷新后数字、后续班次和更新时间一致。
- 返回主屏幕后能找到“到站”小组件；刷新按钮可以联网。
- 共享版改站后桌面跟随；独立版通过编辑小组件改变站点。
- 断网、接口返回空数组、5 分钟未刷新时，不把旧数据当作新查询。
- 两位分钟与分秒模式分别实测系统更新节奏；到站切换和过期提示可能受系统调度影响。
