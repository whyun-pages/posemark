// Screenshots for the website, in both interface languages, through the app's own `--screenshot`
// verification mode. Each shot starts from a fresh config in a throwaway user-data folder, so it
// never touches your own Posemark settings (or a running Posemark).
//
//   pnpm build && node website/tools/shots.mjs
//
// Raw captures land in website/tools/out/, then postprocess.cjs writes the web-sized JPEGs to
// website/assets/screenshots/ and renders the social card (website/assets/og.png).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'out');
// the electron package exports the path of its binary
const electron = createRequire(import.meta.url)(path.join(root, 'node_modules/electron'));
fs.mkdirSync(out, { recursive: true });

const LANGS = {
  zh: { language: 'zh-CN', doc: '我的笔记/发布说明.md', math: '公式' },
  en: { language: 'en', doc: 'Notes/Release notes.md', math: 'Math' },
};

// park the caret at the end so no line shows its Markdown markers, then go back to the top
const settle = `(() => {
  const v = window.__ink.view();
  v.dispatch({ selection: { anchor: v.state.doc.length } });
  v.contentDOM.blur();
  document.querySelector('.cm-scroller').scrollTop = 0;
})();`;
const scrollTo = (text) => `(() => {
  const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.trim() === '## ${text}' || l.textContent.trim() === '${text}');
  if (line) document.querySelector('.cm-scroller').scrollTop = line.offsetTop - 24;
})();`;

// Crop regions, in CSS px of the app window. The editor column is the document's content box plus
// a little margin, cut to a fixed aspect so both languages produce the same picture size; dialogs
// are captured as they are. Without a clip the whole window is captured.
const column = (aspect) => `(() => {
  const c = document.querySelector('.cm-content').getBoundingClientRect();
  const s = document.querySelector('.cm-scroller').getBoundingClientRect();
  const x = Math.round(Math.max(s.left, c.left - 32));
  const width = Math.round(Math.min(s.right, c.right + 32)) - x;
  return { x, y: Math.round(s.top), width, height: Math.min(Math.round(s.height), Math.round(width / ${aspect})) };
})()`;
const sidebarAndColumn = (aspect) => `(() => {
  const side = document.querySelector('#sidebar').getBoundingClientRect();
  const c = document.querySelector('.cm-content').getBoundingClientRect();
  const x = Math.round(side.left);
  const width = Math.round(c.right + 24) - x;
  return { x, y: Math.round(side.top), width, height: Math.min(Math.round(side.height), Math.round(width / ${aspect})) };
})()`;
const dialog = `(() => {
  const r = document.querySelector('#prefs .modal-box').getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
})()`;

const previewReady = `new Promise((done) => {
  const t0 = Date.now();
  const tick = () => {
    const text = document.querySelector('.wx-preview')?.textContent || '';
    if ((text && !/updating|更新中/.test(text)) || Date.now() - t0 > 15000) setTimeout(done, 400);
    else setTimeout(tick, 150);
  };
  tick();
})`;

const SHOTS = [
  { name: 'editor', js: () => settle },
  { name: 'dark', config: { theme: 'night' }, js: () => `${settle} window.__ink.run('view:outline');`, clip: sidebarAndColumn(1.6) },
  { name: 'source', js: () => `window.__ink.run('view:sourceMode'); ${settle}`, clip: column(1.6) },
  { name: 'math', js: (l) => `${settle} ${scrollTo(l.math)}`, wait: 3600, clip: column(1.6) },
  { name: 'export', js: () => `${settle} window.__ink.run('export:settings');`, clip: dialog },
  // the 公众号 preview rasterises the formula and the diagram first: wait until it reports done
  { name: 'wechat', js: () => `${settle} window.__ink.run('app:preferences', 'wechat'); ${previewReady}`, clip: dialog },
];

for (const [lang, l] of Object.entries(LANGS)) {
  for (const shot of SHOTS) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-shot-'));
    fs.writeFileSync(
      path.join(userData, 'config.json'),
      JSON.stringify({
        language: l.language,
        windowBounds: { width: 1360, height: 860 },
        theme: 'default',
        themeFollowSystem: false,
        showSidebar: true,
        sidebarTab: 'files',
        recordRecent: false,
        ...shot.config,
      }),
    );
    const file = path.join(out, `${shot.name}-${lang}.png`);
    const res = spawnSync(
      electron,
      [root, path.join(here, l.doc), `--user-data-dir=${userData}`, `--screenshot=${file}`, `--wait=${shot.wait || 3000}`],
      { env: { ...process.env, POSEMARK_JS: shot.js(l), ...(shot.clip ? { POSEMARK_CLIP: shot.clip } : {}) }, encoding: 'utf8', timeout: 90_000 },
    );
    fs.rmSync(userData, { recursive: true, force: true });
    console.log(fs.existsSync(file) ? `ok   ${shot.name}-${lang}` : `FAIL ${shot.name}-${lang}\n${res.stdout}\n${res.stderr}`);
  }
}

const post = spawnSync(electron, [path.join(here, 'postprocess.cjs'), `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-post-'))}`], {
  encoding: 'utf8',
  timeout: 90_000,
});
console.log(post.stdout.trim() || post.stderr);
