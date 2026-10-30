# 年龄分级、能力声明、定价与市场

本文对应 Partner Center 提交流程中的 **年龄分级（Age ratings）**、**属性 › 产品声明**、**定价和可用性（Pricing and availability）** 几步，以及 MSIX 包清单里的 **capabilities**。

## 1. 年龄分级（IARC 问卷）

Partner Center 使用 IARC 问卷，根据回答自动生成各地区分级（ESRB、PEGI、USK、ClassInd、ACB 等）。
问卷的具体措辞会随版本调整，下面按问题类别给出建议回答，以表单实际问题为准。

**第一步：类别** —— 选择 **“应用（App）”**，不是“游戏”，也不是“社交/通讯”或“网络浏览器”类。

| 问卷问题（类别） | 回答 | 说明 |
| --- | --- | --- |
| 是否是游戏 | 否 | 文本编辑器 |
| 暴力、血腥、恐怖内容 | 否 | 应用本身不包含任何此类内容 |
| 性内容 / 裸露 | 否 | 同上 |
| 粗俗语言 | 否 | 同上 |
| 受管制物品（毒品、酒精、烟草）| 否 | 同上 |
| 赌博 / 模拟赌博 | 否 | |
| 用户之间互动 / 交流（聊天、评论、社区） | **否** | 没有任何用户与用户之间的通讯、账号、社区或内容分享功能 |
| 用户生成内容可被其他用户看到 / 分享 | **否** | 文档只保存在本地，应用不提供发布或分享渠道（“复制到微信公众号”只是把内容放到剪贴板，由用户自己粘贴到外部网站） |
| 分享用户位置 | 否 | 不读取位置 |
| 应用内购买 / 数字商品 | 否 | 完全免费 |
| 收集或分享个人信息 | 否 | 无遥测、无账号，见 `privacy-policy.md` |
| 是否可以不受限制地访问互联网 / 是网络浏览器 | **否（建议）** | 应用不是浏览器，不能任意浏览网页。但需要知道：它会显示用户文档中引用的网络图片，并把用户点击的链接交给系统默认浏览器打开。如果问卷有“应用能显示来自互联网的任意内容”这类问题，如实回答“是”可能导致分级变高（如 PEGI 12 / “用户互动”提示），一般理解此类问题指的是内置浏览器或内容流，这里可答“否”；若审核认为不符，再改答。 |
| 数字购买 / 广告 | 否 | 无广告 |

**预期结果**：各地区最低分级（ESRB Everyone、PEGI 3、USK 0、IARC 3+ 等）。

> 补充说明：本应用会渲染用户自己打开的任意 Markdown/HTML 内容（包括 `<img>`、`<video>`、`<audio>`），
> 内容完全来自用户本地文件，与“应用提供的内容”无关；分级针对应用本身提供的内容。

## 2. 产品声明（Partner Center › 属性 › 产品声明）

| 声明 | 勾选 | 理由 |
| --- | --- | --- |
| 本产品允许用户从 Windows 外部提供的应用/内容进行购买 | 否 | |
| 本产品访问、收集或传输个人信息 | **否** | 不收集；仍需提供隐私政策 URL（桌面应用含网络能力时商店要求提供，建议一定填写） |
| 本产品已经过测试，满足无障碍指南 | 否 | 尚未做无障碍测试，不要勾选 |
| 客户可以在可移动存储设备上安装本产品 | 可勾选 | MSIX 默认允许 |
| 本产品依赖 Windows 备份/OneDrive 自动备份数据 | 否 | |
| 本产品需要 Microsoft 账户 / 第三方账户 | 否 | |

## 3. 包清单 capabilities（restricted capabilities 声明）

Electron 应用通过 MSIX 打包后属于“桌面桥 / 完全信任桌面应用”：

| Capability | 是否需要 | 说明 |
| --- | --- | --- |
| `runFullTrust`（受限能力） | **需要** | 所有 Win32/Electron 桌面应用打包为 MSIX 都必须声明；electron-builder 的 appx 目标会自动写入清单。提交时 Partner Center 会要求在“提交选项 › 受限能力说明”里填写理由，可写：*Posemark is a Win32 desktop (Electron) application packaged with the Desktop Bridge; runFullTrust is required for the app to run as a full-trust desktop process.* |
| `internetClient` | 不需要单独声明 | full trust 进程本身即可联网；electron-builder 默认不额外添加 |
| `broadFileSystemAccess` | **不使用** | 这是 UWP 应用的能力；full-trust 桌面进程本来就可以通过普通 Win32 文件 API 和“打开/保存”对话框访问用户文件，不要申请（申请会触发额外审核） |
| `picturesLibrary` / `documentsLibrary` | 不需要 | 同上，full trust 下不需要 |
| `allowElevation` | 不需要 | 应用从不请求管理员权限 |
| `unvirtualizedResources` | 暂不需要 | 见 `packaging.md` 第 5 节关于 userData 虚拟化的说明；只有在需要让外部程序（资源管理器）看到真实 AppData 路径时才考虑 |

文件关联（`.md` / `.markdown`）是清单 `Extensions` 中的 `uap:FileTypeAssociation`，不是 capability，不需要额外声明。

## 4. 定价与可用性

| 项目 | 建议 |
| --- | --- |
| 价格 | **免费**（开源 MIT 项目） |
| 免费试用 | 无 |
| 应用内购买 / 订阅 | 无 |
| 市场 | **所有市场**（默认全选）。包内提供 en-US 与 zh-CN 两种语言的商店列表，其它市场显示英文列表 |
| 发现性 | 在 Microsoft Store 中公开可见，可搜索 |
| 发布时间 | “认证通过后立即发布”，或第一次选“手动发布”以便最后检查列表 |
| 设备系列 | 仅 Windows 10/11 桌面（x64）；不勾选 Xbox、HoloLens、Surface Hub 等 |
| 组织许可 / 企业商店 | 可保持默认（允许）|

> 中国大陆市场：Microsoft Store 在中国可正常上架免费应用，无需额外 ICP 等证明；如 Partner Center 对某些市场有额外要求，以表单提示为准。
