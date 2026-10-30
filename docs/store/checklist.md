# Microsoft Store（Partner Center）提交清单 — Posemark 0.1.0

相关文档：`listing.zh-CN.md` / `listing.en-US.md`（列表文字）、`privacy-policy.md`、`age-rating-and-declarations.md`、
`packaging.md`（MSIX 打包）、`screenshots.md`（截图与宣传图）。

## 🔴 阻塞项 / 待办（先处理）

1. ~~**“复制到微信公众号”在打包版中写文件失败**~~ —— ✅ 已修复：`rasterizeBlocks` 改写到 `os.tmpdir()`，KaTeX CSS 连同字体内联；已在 `release/win-unpacked` 打包版中验证。
2. ~~**没有图标和商店 Logo**~~ —— ✅ 已生成：`build/icon.svg` 为源文件，`pnpm icons` 生成 `build/icon.png`、`build/icon.ico`、`build/appx/*.png`（含 scale / targetsize 变体）和 `docs/store/store-logo-300.png`。
3. ~~**截图里是旧名字 “Inkdown”**~~ —— ✅ 已有新截图：`node website/tools/shots.mjs` 生成中英文各 6 张，原图（3840×2016，满足商店 ≥1366×768）在 `website/tools/out/`，商店列表可直接上传对应语言的那一组；`samples/assets` 里的示例图也已改为 Posemark。
4. **隐私政策需要公开 URL** —— 已做成网站页面 `website/privacy.html`，把 `website/` 部署到你的网站后，将 `https://<你的域名>/privacy.html` 填到 Partner Center › 隐私策略 URL。
5. **“打开主题文件夹”在 MSIX 中打开的是未虚拟化的真实 AppData 路径** —— `src/main/main.js:1277-1281`，用户放入的 CSS 应用读不到（风险项，非硬阻塞），见 `packaging.md` §5。
6. ~~**补 `LICENSE` 文件**~~ —— ✅ 已添加（MIT）。
7. ~~**`package.json` 尚未加入 `build.appx` 配置**~~ —— ✅ 已加入，标识已填（`whyun.Posemark` / `CN=48325D51-0D86-4D4C-811F-9CFEA8D3F947` / `whyun`，Store ID `9PPSNFZN20LQ`）。本地用 `pnpm dist:store` 打包；推 `v*` tag 时 Release 工作流的 `store` 任务会打出 `.appx` 作为构建产物（不挂到 GitHub Release），标识取自仓库变量 `APPX_IDENTITY_NAME` / `APPX_PUBLISHER` / `APPX_PUBLISHER_DISPLAY_NAME`。

## 需要你填写的占位符

| 占位符 | 位置 | 来源 |
| --- | --- | --- |
| `<IDENTITY_NAME>` → `build.appx.identityName` | package.json | Partner Center › 产品标识 › Package/Identity/Name |
| `CN=<PUBLISHER_GUID>` → `build.appx.publisher` | package.json | Partner Center › 产品标识 › Package/Identity/Publisher |
| `<PUBLISHER_DISPLAY_NAME>` → `build.appx.publisherDisplayName` | package.json | Partner Center › 产品标识 › PublisherDisplayName |
| 隐私政策 URL | Partner Center › 属性 | 网站上 `privacy.html` 的实际地址 |
| 支持联系（可选邮箱） | Partner Center › 属性 | 默认用 GitHub Issues |
| 隐私政策生效日期 | `privacy-policy.md` 顶部 | 发布当天 |
| `backgroundColor`（如不用 `transparent`） | package.json | Logo 底色 |

## 步骤

### A. 账号与名称
- [ ] 1. 注册 Microsoft Partner Center 开发者账号（个人账号即可；https://storedeveloper.microsoft.com ，个人开发者目前免注册费，以页面为准），完成身份验证。
- [ ] 2. 新建应用 → **保留名称 “Posemark”**（同时可再保留中文名备用，如需要）。
- [ ] 3. 打开 产品管理 › **产品标识**，记下 Identity Name / Publisher / PublisherDisplayName。

### B. 代码与资源准备
- [x] 4. 修复 `rasterizeBlocks` 写入安装目录的问题（阻塞项 1）。
- [x] 5. 设计 Logo，生成 `build/appx/` 下 StoreLogo / Square44x44 / Square150x150 / Wide310x150（含 scale-100/200 等变体与 targetsize 变体）、`build/icon.ico`、商店用 300×300 图标。
- [ ] 6. （建议）处理 MSIX 下“打开主题文件夹”的路径问题。（`LICENSE` 已补）
- [x] 7. （改为独立脚本 `pnpm dist:store`，不加进默认 `win.target`）加入 `build.appx` 配置块并填入第 3 步的值（`packaging.md` §2）。
- [ ] 8. 确认 `version` 为 `0.1.0`（打包后为 `0.1.0.0`，第 4 段必须为 0）。

### C. 构建与测试
- [x] 9. `pnpm dist:store` → `release/Posemark-0.1.0-x64.appx`（需 `-c.toolsets.winCodeSign=1.1.0`：旧工具集里的 makepri.exe 缺 DLL，脚本已带上）。
- [ ] 10. 用与 `publisher` 相同 Subject 的自签名证书签一个测试包，本机安装，按 `packaging.md` §4 的测试清单逐项试（特别是复制到微信公众号、双击 .md 打开、草稿恢复、卸载）。
- [ ] 11. 运行 **Windows App Certification Kit (WACK)**，所有“失败”项清零（`packaging.md` §6）。
- [ ] 12. 用当前示例文档重拍截图（`screenshots.md`），准备中英文说明。
- [ ] 13. 部署 `website/`，确认 `privacy.html` 可公开访问。

### D. Partner Center 提交
- [ ] 14. **定价和可用性**：免费；所有市场；公开可见；首次建议“认证后手动发布”（`age-rating-and-declarations.md` §4）。
- [ ] 15. **属性**：类别 *效率 (Productivity)*；隐私策略 URL；网站 `https://github.com/whyun-pages/posemark`；支持 `https://github.com/whyun-pages/posemark/issues`；系统要求 Windows 10 1809+ x64；产品声明按 `age-rating-and-declarations.md` §2。
- [ ] 16. **年龄分级**：完成 IARC 问卷（类别选“应用”，所有内容类问题答“否”，无用户互动/分享），预期 3+ / Everyone。
- [ ] 17. **程序包**：上传未签名或已签名的 `.appx`（商店会重新签名）；确认识别出的语言为 zh-CN、en-US，目标设备系列只勾选桌面。
- [ ] 18. **提交选项 › 受限能力**：为 `runFullTrust` 填写理由（文字见 `age-rating-and-declarations.md` §3）。
- [ ] 19. **商店列表 — 中文(中国)**：按 `listing.zh-CN.md` 填写名称、说明、简短说明、产品功能（20 条）、搜索词（7 个）、版权；“此版本中的新增功能”**留空**；上传截图与说明；可选上传 300×300 图标和 hero art。
- [ ] 20. **商店列表 — English (United States)**：按 `listing.en-US.md` 同样填写并上传截图。
- [ ] 21. 检查所有步骤为“已完成”，点击 **提交到商店**。
- [ ] 22. 关注认证结果（通常 1–3 个工作日）；被拒时按报告修改后重新提交，版本号需递增（如 0.1.1）。

### E. 上架后
- [ ] 23. 在 README 中加入商店链接/徽章（另行修改）。
- [ ] 24. 后续更新：`version` 递增 → 构建 appx → 新建提交 → 填写“此版本中的新增功能”（≤ 1,500 字符）。
- [ ] 25. 注意 GitHub Release 安装版与商店版的设置/草稿不共享（MSIX 的 userData 被隔离）。
