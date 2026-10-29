# 打包为 MSIX 并提交 Microsoft Store

> 本文只描述要做的改动，**没有**修改 `package.json` 或 `src/`。所有代码/配置改动需另行实施。
> 文中的行号基于 2026-10-29 的工作区（`src/main/main.js` 正在被并行修改，行号可能漂移，以函数名为准）。

## 0. 阻塞项（必须先解决）

### ❶ `rasterizeBlocks` 把临时 HTML 写进应用目录 —— MSIX 下必定失败

`src/main/main.js:888-897`（函数 `rasterizeBlocks`，写文件在 `:897`，加载在 `:902`，删除在 `:943`）：

```js
async function rasterizeBlocks({ html, css, width = 720 }) {
  const distDir = path.join(__dirname, '../../dist');          // :889  应用安装目录内
  const name = `_wx-raster-${Date.now()}.html`;
  const file = path.join(distDir, name);
  ...
  await fsp.writeFile(file, page, 'utf8');                       // :897  写入安装目录
```

MSIX 包安装在 `C:\Program Files\WindowsApps\<包全名>\`，该目录对应用**只读**。更严重的是：`package.json` 没有关闭 asar，
现有打包产物 `release/win-unpacked/resources/` 里只有 `app.asar`，也就是说 `__dirname/../../dist` 指向的是
**`app.asar` 归档内部**——在任何打包版本（NSIS、zip、MSIX）里都无法向其中写文件。
因此 **“复制到微信公众号”里公式和 Mermaid 图表转 PNG 的功能在打包版中会写文件失败**（只在 `pnpm start` 开发模式下正常），
`--wx-test` 校验模式同理。这不仅是商店阻塞项，也是现有 GitHub Release 版本的 bug。

之所以写到 `dist/`，是为了让页面里的相对链接 `<link href="katex/katex.min.css">`（`:895`）和 KaTeX 字体能解析。修复思路（任选其一）：

1. 写到 `app.getPath('temp')` / `os.tmpdir()`（`htmlToPdf` 已经这么做，见 `:766`），并把 `href` 改成
   `pathToFileURL(path.join(__dirname, '../../dist/katex/katex.min.css')).href` 这样的绝对 `file://` URL，
   或在 `<head>` 里加 `<base href="file:///…/dist/">`；
2. 不落盘：`win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page), { baseURLForDataURL: pathToFileURL(distDir).href + '/' })`；
3. 用 `fsp.readFile` 读出 `katex.min.css`（`:1392` 已有类似代码）内联进 `<style>`，字体 URL 改为绝对路径。

修复后在 MSIX 安装版里实际执行一次“复制到微信公众号”（文档里放一个 `$$` 公式和一个 mermaid 图）验证。

### ❷ 仓库没有任何图标 / 商店 Logo

没有 `build/` 目录，`assets/` 只有 `.gitkeep`，`package.json` 未配置 `icon`。electron-builder 在找不到 `build/appx/*.png`
时会使用它自带的**默认示例图**，商店认证会以“使用占位图标”为由拒绝。需要先设计 Logo 并生成第 3 节列出的资源。

### ❸ 仓库没有 `LICENSE` 文件

`package.json` 声明 MIT，商店列表里也写了开源 MIT，但仓库根目录没有 LICENSE 文本。建议补上（不阻塞打包，但影响列表可信度）。

## 1. 需要的账号信息（Partner Center 提供）

在 Partner Center › 应用 › Posemark › **产品管理 › 产品标识** 页面可以看到下面几个值，原样填进配置：

| electron-builder 字段 | 来自 Partner Center 的 | 示例格式 |
| --- | --- | --- |
| `identityName` | Package/Identity/Name | `12345yunnysunny.Posemark` |
| `publisher` | Package/Identity/Publisher | `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` |
| `publisherDisplayName` | Package/Properties/PublisherDisplayName | `yunnysunny`（开发者账号显示名） |
| `displayName` | 已保留的应用名称 | `Posemark`（必须与保留名称完全一致） |

## 2. `build.appx` 配置（以后加入 `package.json`）

在 `build.win.target` 中加入一项：

```json
{ "target": "appx", "arch": ["x64"] }
```

并在 `build` 下新增：

```json
"appx": {
  "identityName": "<IDENTITY_NAME 例如 12345yunnysunny.Posemark>",
  "publisher": "CN=<PUBLISHER_GUID>",
  "publisherDisplayName": "<PUBLISHER_DISPLAY_NAME>",
  "displayName": "Posemark",
  "applicationId": "Posemark",
  "backgroundColor": "transparent",
  "languages": ["zh-CN", "en-US"],
  "showNameOnTiles": false,
  "addAutoLaunchExtension": false,
  "minVersion": "10.0.17763.0",
  "maxVersionTested": "10.0.26100.0",
  "artifactName": "${productName}-${version}-${arch}.${ext}"
}
```

说明：

- `applicationId`：清单 `<Application Id>`，只能是字母数字和点，且不能以数字开头；`Posemark` 即可。
- `backgroundColor`：磁贴/启动背景色。推荐 `transparent`（Win10/11 现行设计），或与 Logo 底色一致的 `#RRGGBB`。
- `languages`：包声明支持的语言，决定 Partner Center 自动列出的商店列表语言；第一个视为默认语言。
- 版本号：electron-builder 会把 `0.1.0` 转成 `0.1.0.0`。**商店要求第 4 段为 0**，保持默认（不要开启 `setBuildNumber`）。每次提交版本号必须大于上一次。
- `fileAssociations`（`.md` / `.markdown`）已在 `build` 顶层配置，electron-builder 会生成 `uap:FileTypeAssociation`；双击 `.md` 时文件路径以参数传入，现有的 `fileArg(process.argv)` 可以处理。
- 应用名在 `package.json` 里是 `productName: "Posemark"`，与保留名一致即可。
- 商店提交**不需要代码签名证书**：上传的 `.appx/.msix` 由 Microsoft 重新签名。只有在本机侧载测试时才需要签名，见第 4 节。

建议另加脚本（示例，同样以后再改）：`"dist:store": "node build.mjs && electron-builder --win appx --publish never"`，
不要把 appx 放进 GitHub Release 的默认产物（未签名的 appx 用户无法直接安装）。

## 3. Logo 资源（放在 `build/appx/`）

electron-builder 从 `buildResources`（默认 `build/`）下的 `appx/` 目录取图。所有文件为 PNG，建议透明背景。

| 文件名 | 基准尺寸 (scale-100) | 是否必需 | 用途 |
| --- | --- | --- | --- |
| `StoreLogo.png` | 50×50 | **必需** | 商店/安装器中的包 Logo |
| `Square44x44Logo.png` | 44×44 | **必需** | 任务栏、开始菜单列表、标题栏 |
| `Square150x150Logo.png` | 150×150 | **必需** | 中磁贴 / 开始菜单固定 |
| `Wide310x150Logo.png` | 310×150 | **必需** | 宽磁贴 |
| `LargeTile.png` | 310×310 | 可选 | 大磁贴（Square310x310Logo） |
| `SmallTile.png` | 71×71 | 可选 | 小磁贴（Square71x71Logo） |
| `SplashScreen.png` | 620×300 | 可选 | 启动画面 |
| `BadgeLogo.png` | 24×24 | 可选 | 锁屏徽标，不需要 |

缩放变体：同名加后缀，如 `StoreLogo.scale-100.png`、`.scale-125`、`.scale-150`、`.scale-200`、`.scale-400`
（尺寸分别 ×1/1.25/1.5/2/4）。至少提供 `scale-100` 和 `scale-200`，推荐全部提供以避免高 DPI 下模糊。

`Square44x44Logo` 还应提供目标尺寸（taskbar/开始菜单用）：
`Square44x44Logo.targetsize-16.png`、`-24`、`-32`、`-48`、`-256`，以及无底板版本
`Square44x44Logo.targetsize-16_altform-unplated.png` 等（否则任务栏上图标会带色块底板）。

另外还需要：

- `build/icon.ico`（含 16/24/32/48/64/128/256）—— NSIS/zip 版本和 exe 图标用，目前也缺；
- 商店单独上传的 **1:1 应用磁贴图标 300×300 PNG**（Partner Center › 商店列表 › Store logos，强烈推荐，会优先于包内图标）；
- 可选 **16:9 Super hero art 1920×1080 或 3840×2160 PNG**（不能含文字和 UI 截图，见 `screenshots.md`）。

工具建议：用一张 1024×1024 的源图，借助 Visual Studio 的“资源生成器”、Windows App SDK 的 `MRT` 工具、
或 `pwabuilder` 的图片生成器批量生成上述尺寸。

## 4. 构建与本地测试

```bash
pnpm install
pnpm exec electron-builder --win appx --x64 --publish never   # 产物：release/Posemark-0.1.0-x64.appx
```

- 构建在 Windows 上进行；electron-builder 会使用其 `winCodeSign` 缓存中的 `makeappx.exe`，若失败请安装 Windows 10/11 SDK。
- **本地侧载测试**需要签名：生成自签名证书，Subject 必须与 `publisher` 完全相同（`CN=<PUBLISHER_GUID>`），
  配置 `win.certificateFile` / `certificatePassword`（或 `CSC_LINK`），把证书导入“受信任的人”后双击安装；
  或在“设置 › 系统 › 开发者选项”打开开发人员模式后用 `Add-AppxPackage -Register <解包目录>\AppxManifest.xml`。
  **提交商店的那个包不需要签名**（签了也会被替换）。
- 测试清单：首次启动、打开/保存文件、双击 `.md` 打开、第二次启动带文件参数（新窗口）、拖入图片、
  导出 HTML/PDF、**复制到微信公众号（含公式与 mermaid）**、草稿恢复、“打开主题文件夹”、卸载后数据被清除。

## 5. MSIX 环境下的行为差异（逐项核查结果）

| 项目 | 现状 | 在 MSIX 中 | 结论 |
| --- | --- | --- | --- |
| 写入安装目录 | `rasterizeBlocks` 写 `dist/`（`src/main/main.js:889-897`） | 安装目录只读 | **阻塞，见 ❶** |
| 读取安装目录 | `dist/index.html`(`:103`)、主题 CSS(`:439`、`:1117`)、`katex.min.css`(`:1392`) | 只读访问没问题 | OK |
| 临时文件 | `htmlToPdf` 用 `os.tmpdir()`(`:766`)；上传测试图 `src/main/images.js` `testImage()` 用 `os.tmpdir()` | 可写 | OK |
| userData | `config.json` / `drafts/` / `themes/`（`src/main/main.js:1448-1450`） | `%APPDATA%\Posemark` 的写入被**重定向**到 `%LOCALAPPDATA%\Packages\<PFN>\LocalCache\Roaming\Posemark`，对应用本身透明；卸载时删除 | 功能正常，但见下一行 |
| “打开主题文件夹” | `theme:openFolder` → `shell.openPath(userThemes.dir)`（`:1277-1281`） | 资源管理器是包外进程，看到的是**真实**的 `%APPDATA%\Posemark\themes`（不存在或为空），而不是重定向后的目录 | **风险**：用户放进去的 CSS 应用看不到。修复：`process.windowsStore` 为真时把路径换算成 `LocalCache\Roaming\…` 再打开，或在清单中为该目录声明 `unvirtualizedResources`/改用 `app.setPath('userData', …)` 到 `Documents` 之类非虚拟化位置 |
| 渲染进程拿到的 `userData` 路径 | `:1366` 把 `app.getPath('userData')` 交给渲染进程 | 显示的路径与资源管理器中实际位置不一致 | 低风险，同上处理 |
| 单实例 / 第二实例 | `requestSingleInstanceLock` + `second-instance`（`:1424-1440`） | MSIX 下正常工作 | OK |
| 文件关联 | `build.fileAssociations` md/markdown | 由清单声明，Windows 11 会在“打开方式”中列出，不能静默设为默认 | OK（用户需自行设为默认） |
| 协议注册 | 未使用 `app.setAsDefaultProtocolClient` | — | OK |
| 自动更新 | 未使用 `autoUpdater` / `electron-updater` | 由商店负责更新 | OK；注意 GitHub Release 版与商店版并存时两者 userData 不共享 |
| 开机自启 | 未使用 `setLoginItemSettings` | — | OK，保持 `addAutoLaunchExtension: false` |
| 写注册表 | 未发现 | — | OK |
| 子进程 | 图片上传 `spawn`（`src/main/images.js` `runCommand`，`shell: true`）运行用户配置的 `picgo` / 自定义命令 | full trust 允许；子进程也在包容器内运行，其 AppData 写入同样被重定向 | 基本 OK，需在 MSIX 版实测 PicGo-Core |
| 回收站 / 资源管理器 | `shell.trashItem`、`showItemInFolder`、`openPath` | full trust 下正常 | OK |
| 网络 | `net.fetch` 下载图片(`:1152`)、PicList HTTP、渲染进程加载远程图片 | full trust 无需声明 `internetClient` | OK |
| 开发用参数 | `--screenshot` / `--selftest` / `--export-test` / `--wx-test` 写入用户指定目录 | 不影响正常使用 | OK（`--wx-test` 会因 ❶ 失败） |

## 6. Windows 应用认证工具包（WACK）

商店在提交后会跑同等检查，本地先跑一遍可以省一轮审核：

1. 安装 Windows SDK（包含 WACK），启动“Windows App Cert Kit”（`C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcertui.exe`）。
2. 选择“验证应用商店应用” → 选中 `release/Posemark-0.1.0-x64.appx`（需先用自签名证书签名并安装，或选择已安装的包）。
3. 全部测试运行，期间不要操作电脑；保存 XML 报告。
4. 常见问题：
   - **默认/占位图片**（见 ❷）——失败项；
   - **Package sanity / 二进制分析**：Electron 自带的部分 DLL 可能出现“警告”，警告不阻止提交；
   - **受支持的 API**：桌面桥应用不适用，跳过；
   - **启动/挂起**：确保首次启动没有阻塞对话框。
5. 报告中“失败”项必须修复，“警告”可在提交说明中解释。

## 7. CI（可选，后续）

在 `.github/workflows` 的 release 工作流中可另起一个 Windows job 运行 `electron-builder --win appx`，把 `.appx` 作为构建产物上传（不发布到 Release），再手动上传到 Partner Center；
或使用 Microsoft Store Submission API / `msstore` CLI（`msstore publish`）自动提交，需要在 Partner Center 中创建 Azure AD 应用并配置 tenantId/clientId/secret。
