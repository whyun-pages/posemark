# Posemark website

Static site: `index.html` (home), `docs.html` (user guide), `privacy.html` (privacy policy — the
URL Partner Center asks for). No build step: open the files directly in a browser to preview, and
upload the folder (without `tools/`) to any static host. Once it has a domain, make the
`og:image` meta tags absolute (`https://<domain>/assets/og.png`) so link previews show the card. Every page is bilingual: elements carry `lang="zh-CN"` or
`lang="en"`, and `site.js` picks one from the browser language (remembered after a toggle).

## Assets

`assets/screenshots/*-{zh,en}.jpg`, `assets/og.png` (social card), the logo and favicons are
generated — re-run after UI changes:

```bash
pnpm build && node website/tools/shots.mjs
```

The script drives the real app using an isolated temporary profile for each language. It opens the
sample notes in `tools/我的笔记/` and `tools/Notes/`, expands the updated file tree, and captures
live preview, equations and Mermaid, source mode, dark theme with the file tree, export preferences,
the completed WeChat preview, and the website export panel with its live reader. It does not use
or change your running editor or its settings. The website export panel currently has a Chinese
interface in both captures; the English guide calls this out rather than showing translated mock UI.

The hero uses a wide full-window capture. Tutorial images retain the surrounding app or complete
settings panel; `*-feature-{zh,en}.jpg` images use a closer composition for the homepage's narrow
feature column. Their dimensions are recorded in `tools/out/dimensions.json`; keep the corresponding
HTML width and height attributes in sync when changing the capture viewport. All images are
rendered at 2× density and saved as JPEGs up to 1600 pixels wide. No CSS is injected into the app.
Editor captures keep the Files panel in tree mode with a 240-pixel sidebar. Before capture, the
script verifies that the file tree, folder icons, disclosure arrows and toolbar are visible at the
current application sizes, so switching to Outline cannot silently produce a different sidebar.
Screenshots open at full size in a new tab when clicked; these links follow the selected language.

Raw captures and manifests go to `tools/out/` (ignored). The script stops on a failed capture and
only postprocesses images listed in the current manifests, so old captures cannot silently replace
new ones. Temporary profiles are removed after each process exits. The social card is laid out
in `tools/og.html` and is refreshed with the new editor screenshot.

After regenerating assets, run `pnpm exec electron website/tools/verify-shots.cjs` to check image
dimensions, bilingual swapping, all feature tabs and overflow at desktop and phone widths. Layout
captures are saved to `tools/out/layout-*.png` for visual review.
