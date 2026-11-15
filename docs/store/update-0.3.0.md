# Posemark 0.3.0 商店更新资料

中英文商店文案分别维护在 [listing.zh-CN.md](listing.zh-CN.md) 和 [listing.en-US.md](listing.en-US.md)。本次更新了简短说明、完整说明、产品功能和“此版本中的新增功能”，补充网站导出、离线阅读与文件树改进。产品功能仍为 20 条。英文文案明确说明网站导出页面与阅读器目前使用中文。

运行 `node docs/store/prepare-update.cjs`，会从这两份文案中提取纯文本字段，并把已经重拍的应用原始 PNG 复制到 `release/store-0.3.0/zh-CN/` 和 `release/store-0.3.0/en-US/`。每种语言有 `description.txt`、`short-description.txt`、`whats-new.txt`、`features.txt`、`search-terms.txt` 和 `captions.txt`，可直接复制到 Partner Center 对应字段。`features.txt` 与 `search-terms.txt` 每行对应后台的一个输入框。

截图按实时预览、网站导出、公式与图表、源代码、深色主题、公众号排版和导出设置排列，每种语言共七张。文件名自带顺序，`captions.txt` 提供对应标题。全部使用 `website/tools/out/` 中的原始 PNG，不使用官网经过压缩的 JPG 或功能区裁切图。深色截图展示文件面板，带当前文件树图标和顶部工具栏。网站导出页面的两张语言版本均保留应用真实的中文界面。

在新环境准备素材时，先运行 `pnpm build` 和 `node website/tools/shots.mjs`，再运行资料整理脚本。脚本在写入前校验文字长度、产品功能数量、PNG 格式、截图尺寸和标题长度；实际结果保存在 `release/store-0.3.0/manifest.json`。微软对“此版本中的新增功能”的限制为 1500 字符，说明为 10000 字符；桌面截图要求 PNG、至少 1366×768，标题最多 200 字符。依据为 [MSIX 商店列表文档](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info) 与 [截图文档](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/screenshots-and-images)，于 2026-11-15 核对。

本次版本标签为 `v0.3.0`。Release 工作流中的 `store` 任务生成 `Posemark-0.3.0-x64.appx`，保存在名为 `Posemark-v0.3.0-store` 的 Actions 构建产物中。商店程序包版本应为 `0.3.0.0`。在 Partner Center 的新提交中替换程序包后，分别更新中文（中国）与 English (United States) 的文案和截图并保存。GitHub Release 与商店审核彼此独立，商店提交状态需要在后台单独确认。
