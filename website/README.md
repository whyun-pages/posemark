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

The script drives the real app through its `--screenshot` mode with a throwaway config, opening
the sample notes in `tools/我的笔记/` and `tools/Notes/`; raw captures go to `tools/out/` (ignored).
The social card is laid out in `tools/og.html`.
