# 商店截图与宣传图

## 商店要求（Microsoft Learn《App screenshots, images, and trailers》，2026-10 查阅）

- 至少 **1 张**，桌面最多 **10 张**；建议 4 张以上（FAQ 建议 5–8 张）。
- **PNG**，横向或纵向均可，单张 ≤ **50 MB**。
- 桌面：**1366×768 或更大**，最高支持 4K（**3840×2160**）。
- 每张可配 **≤ 200 字符** 的说明文字；每种语言的商店列表要**分别上传**截图并填写说明。
- 关键内容放在图片上方 2/3（下方 1/3 可能被叠加文字遮挡）；不要在截图里加额外 Logo、图标或营销文字；避免极亮/极暗或强对比条纹。

## 现有截图检查（读取 PNG IHDR 得到的实际尺寸）

| 文件 | 尺寸 | 尺寸是否合格 |
| --- | --- | --- |
| `light.png` | 3540×2016 | 合格 |
| `table-edit.png` | 3540×2016 | 合格 |
| `table-menu.png` | 3540×2016 | 合格 |
| `table-cells.png` | 3540×2016 | 合格 |
| `code-edit.png` | 3540×2016 | 合格 |
| `code.png` | 3540×2016 | 合格 |
| `night-code.png` | 3540×2016 | 合格 |
| `math-field.png` | 3540×2016 | 合格 |
| `diagram-live.png` | 3540×2016 | 合格 |
| `image-live.png` | 3540×2016 | 合格 |
| `image-resize.png` | 3540×2016 | 合格 |
| `image-size.png` | 3540×2016 | 合格（但不推荐，见下） |
| `drop-hint.png` | 3540×2016 | 合格 |
| `toc.png` | 3540×2016 | 合格 |
| `footnotes.png` | 3540×2016 | 合格 |
| `tree-menu.png` | 3540×2016 | 合格 |
| `prefs.png` | 3540×2016 | 合格 |
| `wechat.png` | 2383×1836 | 合格 |

**没有尺寸过小的截图**：全部 ≥ 1366×768，且都在 3840×2160 以内，可直接上传。

### ⚠ 但需要重拍：截图里还是旧名字 “Inkdown”

抽查 `light.png`：front matter 显示 `title: Inkdown demo`，大标题是 “Inkdown — live preview demo”；
`image-size.png` 中图片文字也是 “Inkdown image test”，侧边栏是 `exp` / `exp2` / `exp45` 这类测试目录。
`samples/demo.md` 现在已经改为 `title: Posemark demo`，所以这些截图是改名前拍的。**商店截图出现与产品名不一致的名称会引起混淆，甚至被审核质疑**，建议用现在的 `samples/demo.md` 全部重拍。

重拍方法（README 中的验证模式，不需要手动点击）：

```bash
pnpm exec electron . samples/demo.md --screenshot=tmp/store/light.png --wait=4000
# 配合 POSEMARK_SCROLL=<px> 滚动到表格/公式/图表位置，POSEMARK_JS=<script> 打开菜单或进入编辑状态
```

建议：
- 窗口内容区保持 16:9（例如 1920×1080 窗口，在 200% 缩放下得到 3840×2160；或 1366×768 @100%）。现有 3540×2016 也可以。
- 侧边栏里不要出现 `tmp`、`exp2` 等测试目录，用一个干净的示例文件夹（如 `samples/`）。
- 为 zh-CN 列表另准备一份**中文内容**的示例文档再拍一组（应用界面是英文，但文档内容用中文更贴近中文用户）；若来不及，两种语言可以先用同一组图。
- `wechat.png` 展示的是粘贴后的效果，不是应用窗口本身，可放在最后作为补充。

## 推荐顺序与说明文字（最多 10 张）

| # | 文件（重拍后同名） | zh-CN 说明 | en-US caption |
| --- | --- | --- | --- |
| 1 | `light.png` | 边写边渲染：Markdown 标记只在光标所在行出现 | Write Markdown and see it rendered in place; markers appear only on the line you are editing |
| 2 | `table-edit.png` | 点进表格即可按网格编辑，Tab 在单元格之间移动 | Click into a table and edit it as a grid; Tab moves between cells |
| 3 | `table-menu.png` | 右键单元格插入、删除行列并设置对齐 | Right-click a cell to insert or delete rows and columns and set alignment |
| 4 | `math-field.png` | 公式块：上面输入 TeX，下面实时显示 KaTeX 渲染结果 | Math blocks: type TeX above, see the KaTeX rendering update below |
| 5 | `diagram-live.png` | Mermaid 图表边改边预览，语法错误直接显示在预览里 | Mermaid diagrams re-render below their source as you edit |
| 6 | `code-edit.png` | 编辑代码块时依然保持语法高亮 | Code blocks stay syntax-highlighted while you edit them |
| 7 | `image-resize.png` | 点击图片拖动缩放，宽度写回 Markdown | Click an image and drag to resize it; the width is written into the Markdown |
| 8 | `toc.png` | [TOC] 生成可点击的目录 | [TOC] turns into a clickable table of contents |
| 9 | `night-code.png` | 内置多套主题，可跟随 Windows 深色模式 | Built-in themes, including dark ones that follow Windows dark mode |
| 10 | `tree-menu.png` | 文件树：新建、重命名、移到回收站等操作 | File tree with new file, new folder, rename and move to Recycle Bin |

备选（可替换上面任意一张）：

| 文件 | zh-CN 说明 | en-US caption |
| --- | --- | --- |
| `table-cells.png` | 表格单元格在未编辑时渲染行内 Markdown | Table cells render their inline Markdown until you focus them |
| `image-live.png` | 编辑图片语法时，图片就显示在下一行 | The picture appears under the image line you are editing |
| `drop-hint.png` | 拖入图片自动复制到 assets 文件夹并插入 | Drop an image file to copy it into the assets folder and insert it |
| `footnotes.png` | 脚注渲染为上标编号，定义集中在文末 | Footnotes render as superscript numbers with definitions collected at the end |
| `prefs.png` | 偏好设置：编辑器、图片、Markdown、导出等选项 | Preferences for the editor, images, Markdown and export |
| `code.png` | 代码块语法高亮，可选行号 | Syntax-highlighted code blocks with optional line numbers |
| `wechat.png` | 一键复制到微信公众号，样式全部内联 | Copy for WeChat: the document rebuilt with inline styles only |

不推荐：`image-size.png`（测试素材，内容是旧名称的蓝色占位图，展示价值低）。

所有说明文字均 < 200 字符。

## 商店 Logo 与宣传图（可选但推荐）

| 素材 | 尺寸 | 要求 | 现状 |
| --- | --- | --- | --- |
| 1:1 应用磁贴图标 | **300×300** PNG | 强烈推荐，商店优先使用它而不是包内图标 | **缺，需设计** |
| 16:9 Super hero art | **1920×1080 或 3840×2160** PNG | 推荐；用于列表顶部和推广位。**不能含文字、产品名，也不要放应用 UI 截图**；关键元素放中间，避开下方 1/3；避免政治、宗教、旗帜等元素 | **缺** |
| 2:3 Poster art | 720×1080 或 1440×2160 | 主要针对游戏，应用可不提供 | 不需要 |
| 1:1 Box art | 1080×1080 或 2160×2160 | 主要针对游戏 | 不需要 |
| 预告片 | MP4/MOV 1920×1080，≤ 2 GB，缩略图 1920×1080 PNG | 可选 | 不需要 |

Hero art 设计建议：以 Logo 图形元素 + 抽象的纸张、排版线条等图形构图（符号也做成图形化处理，避免出现可读文字），浅色背景。
包内磁贴/图标（StoreLogo 等）的尺寸清单见 `packaging.md` 第 3 节。
