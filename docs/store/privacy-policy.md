# Posemark 隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-10-29（提交前按实际日期修改 / update before publishing）
适用版本 / Applies to: Posemark 0.1.0 及以后版本 / and later

> 托管 / Hosting: 网页版是 `website/privacy.html`。把 `website/` 部署到网站后，将其地址填到
> Partner Center › 属性 › 隐私策略 URL。本文件修改后请同步更新网页版。
> The web version is `website/privacy.html`; keep the two in sync.

---

## 中文

Posemark（以下简称“本应用”）是一款在你电脑本地运行的 Markdown 编辑器，由 yunnysunny 开发并以 MIT 许可证开源。

### 我们不收集任何个人信息

- 本应用**没有账号系统、没有广告、没有遥测、没有崩溃上报、没有统计分析**，不会向开发者或任何第三方发送你的文档、使用数据或设备信息。
- 开发者没有运营任何接收本应用数据的服务器。

### 本应用在你的电脑上保存哪些数据

所有数据都只保存在你自己的电脑上：

- **你的文档和图片**：保存在你自己选择的位置。拖入或粘贴的图片默认复制到文档旁的 `assets/` 文件夹；没有打开文档时保存到“图片/posemark”文件夹。
- **设置**：保存在本应用的用户数据目录（`userData`）下的 `config.json`，包括偏好设置、最近打开的文件和文件夹、固定的文件夹、界面状态（侧边栏、主题、上次打开的文件夹等）。你可以在“偏好设置 › 通用”中关闭最近文件记录。
- **未保存草稿备份**：文档有未保存修改时，内容会自动备份到用户数据目录下的 `drafts/` 文件夹，保存后即删除；你可以通过“文件 › 恢复未保存的草稿…”查看、恢复或丢弃它们。
- **自定义主题**：用户数据目录下的 `themes/` 文件夹。
- 导出 PDF 等操作会在系统临时目录写入临时文件，完成后删除。

通过 Microsoft Store 安装时，用户数据目录由 Windows 为本应用单独隔离保存，卸载本应用时会一并删除。

### 本应用什么时候会联网

本应用的核心编辑功能完全离线可用。只有在以下情况才会发生网络访问，且都由你的文档内容或你的操作触发：

1. **显示网络图片**：如果你的文档引用了 `http(s)://` 图片，本应用会像浏览器一样从该地址加载图片以便显示。图片所在的服务器会因此看到你的 IP 地址等常规请求信息。
2. **下载网络图片**：你在图片右键菜单中选择“下载”，或执行“全部移动/复制图片到…”时，本应用会下载对应的网络图片并保存到本地。
3. **上传图片（默认关闭）**：只有你在“偏好设置 › 图片”中自己配置了上传工具后才会上传。本应用支持：
   - **PicGo-Core**：调用你电脑上安装的 `picgo` 命令；
   - **PicList**：向你填写的 PicList 服务地址（默认是本机 `http://127.0.0.1:36677`）发送文件路径；
   - **自定义命令**：运行你填写的命令，并把图片文件路径作为参数传给它。
   图片会被这些工具上传到**你在工具中配置的图床/存储服务**，其数据处理遵循该服务自己的隐私政策，与本应用开发者无关。“测试上传”按钮会上传一张 1×1 像素的测试图片。
4. **打开链接**：你点击文档中的 `http(s)` / `mailto` 链接时，本应用会交给系统默认浏览器或邮件程序打开，之后的行为由该程序决定。
5. **拼写检查**：拼写检查使用 Windows 系统自带的拼写检查服务；对于系统不支持的语言，Electron/Chromium 可能会从 Google 的服务器下载拼写词典文件（只下载词典，不上传你的文本）。

本应用不会把你的文档内容发送到上述以外的任何地方。

### 儿童隐私

本应用不收集任何人的个人信息，包括 13 岁以下儿童。

### 政策变更

如本政策发生变更，会更新本页面并修改上方的生效日期。

### 联系方式

问题或反馈：<https://github.com/whyun-pages/posemark/issues>

---

## English

Posemark ("the app") is a Markdown editor that runs locally on your computer. It is developed by yunnysunny and released as open source under the MIT License.

### We do not collect personal information

- The app has **no accounts, no ads, no telemetry, no crash reporting and no analytics**. It does not send your documents, usage data or device information to the developer or to any third party.
- The developer does not operate any server that receives data from the app.

### Data the app stores on your computer

Everything stays on your own computer:

- **Your documents and images** are saved where you choose. Images you drop or paste are copied into an `assets/` folder next to the document by default, or into `Pictures/posemark` when no document is open.
- **Settings** are stored in `config.json` in the app's user data folder (`userData`): preferences, recent files and folders, pinned folders and UI state (sidebar, theme, last folder). Recording of recent files can be turned off in Preferences › General.
- **Unsaved-draft backups**: while a document has unsaved changes its content is mirrored into the `drafts/` folder in the user data folder and removed once you save. File › Recover Unsaved Drafts… lets you review, restore or discard them.
- **Custom themes** live in the `themes/` folder in the user data folder.
- Some operations, such as PDF export, write temporary files to the system temp folder and delete them afterwards.

When installed from the Microsoft Store, Windows keeps the user data folder in a location private to the app and removes it when the app is uninstalled.

### When the app connects to the internet

All core editing works offline. Network access happens only in these cases, each triggered by your document or by your own action:

1. **Displaying remote images**: if your document references an `http(s)://` image, the app loads it from that address to display it, as a web browser would. That server sees ordinary request information such as your IP address.
2. **Downloading remote images**: when you choose Download in the image context menu, or run Move/Copy All Images To…, the app downloads those images and saves them locally.
3. **Uploading images (off by default)**: only if you configure an uploader yourself in Preferences › Images:
   - **PicGo-Core**: runs the `picgo` command installed on your computer;
   - **PicList**: sends the file paths to the PicList server address you enter (by default `http://127.0.0.1:36677` on your own computer);
   - **Custom command**: runs the command you enter, passing the image file paths as arguments.
   These tools upload the images to **the image hosting or storage service you configured in them**; that service's own privacy policy applies, and the developer of this app has no access to it. The "Test Upload" button uploads a 1×1 pixel test image.
4. **Opening links**: clicking an `http(s)` or `mailto` link hands it to your default browser or mail app.
5. **Spell checking** uses the Windows spell checker. For languages the system does not support, Electron/Chromium may download dictionary files from Google's servers (dictionaries only; your text is not uploaded).

The app does not send your document content anywhere else.

### Children's privacy

The app collects no personal information from anyone, including children under 13.

### Changes

If this policy changes, this page will be updated and the effective date above revised.

### Contact

Questions or feedback: <https://github.com/whyun-pages/posemark/issues>
