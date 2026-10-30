'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard, nativeTheme, nativeImage, net, screen } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const { parseCli, helpText } = require('./cli-args');
const BUILTIN_THEMES = require('./themes');
const { buildMenu } = require('./menu');
const { Drafts, draftId } = require('./drafts');
const { UserThemes } = require('./user-themes');
const images = require('./images');
const { setPdfInfo } = require('./pdf-info');
const i18n = require('./i18n');

const MD_EXT = ['md', 'markdown', 'mmd', 'mdown', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'txt', 'text', 'rmd'];
const isDev = !!process.env.POSEMARK_DEV;
// Window / taskbar icon while running from source (packaged builds take it from the executable).
const DEV_ICON = path.join(__dirname, '../../build/icon.png');
const windowIcon = fs.existsSync(DEV_ICON) ? DEV_ICON : undefined;

let store = null;
let drafts = null;
let userThemes = null;

const cfg = (key) => store.get(key);

// UI language: the preference, or the OS language for 'system'.
let tr = i18n.createTranslator('en');
const uiLanguage = () => i18n.resolveLanguage(cfg('language'), app.getPreferredSystemLanguages ? app.getPreferredSystemLanguages() : [app.getLocale()]);
function refreshLanguage() {
  tr = i18n.createTranslator(uiLanguage());
}
const patch = (obj) => store.set(obj);

// ---------------------------------------------------------------------------
// window registry: one document per window, like Typora
// ---------------------------------------------------------------------------
const windows = new Map(); // win.id -> { win, state, initial, watcher, watchTimer, watchQueue, allowClose, session }
let lastFocusedId = null;
let firstWindow = true;
// ids of drafts written by windows that are still open (they are not "unsaved drafts to recover")
const liveDrafts = new Set();

const entryOf = (win) => (win ? windows.get(win.id) : null);
const entryFor = (e) => entryOf(BrowserWindow.fromWebContents(e.sender));
const winFor = (e) => BrowserWindow.fromWebContents(e.sender);

function focusedWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && windows.has(focused.id)) return focused;
  const last = lastFocusedId != null ? windows.get(lastFocusedId) : null;
  if (last && !last.win.isDestroyed()) return last.win;
  const first = [...windows.values()].find((w) => !w.win.isDestroyed());
  return first ? first.win : null;
}

function orderedWindows() {
  return [...windows.values()].map((w) => w.win).filter((w) => !w.isDestroyed());
}

function createWindow(initial = {}) {
  const bounds = cfg('windowBounds');
  const ref = focusedWindow();
  let x = bounds?.x;
  let y = bounds?.y;
  if (ref) {
    // a second window steps down-right from the one that spawned it
    const b = ref.getBounds();
    x = b.x + 28;
    y = b.y + 28;
    const area = screen.getDisplayMatching(b).workArea;
    if (x + (bounds?.width || 1180) > area.x + area.width) x = area.x + 24;
    if (y + (bounds?.height || 800) > area.y + area.height) y = area.y + 24;
  }
  const win = new BrowserWindow({
    width: bounds?.width || 1180,
    height: bounds?.height || 800,
    x,
    y,
    minWidth: 520,
    minHeight: 360,
    icon: windowIcon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#7a7a7a', height: 38 },
    trafficLightPosition: { x: 12, y: 12 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: !initial.hidden, // a CLI export window is never shown
    },
  });

  const entry = {
    win,
    state: { path: null, title: 'Untitled', dirty: false },
    initial: { ...initial, first: firstWindow },
    watcher: null,
    docWatcher: null,
    watchTimer: null,
    watchQueue: new Set(),
    allowClose: false,
    session: crypto.randomUUID(),
    draft: null,
  };
  windows.set(win.id, entry);
  const isFirst = firstWindow;
  firstWindow = false;

  win.loadFile(path.join(__dirname, '../../dist/index.html'));

  win.once('ready-to-show', () => {
    if (!initial.hidden) win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
    if (isFirst) installVerificationModes(win, entry);
  });

  win.on('focus', () => {
    lastFocusedId = win.id;
    updateMenu();
  });

  win.on('close', (e) => {
    if (entry.allowClose) {
      const b = win.getBounds();
      patch({ windowBounds: { width: b.width, height: b.height, x: b.x, y: b.y } });
      return;
    }
    e.preventDefault();
    win.webContents.send('menu:command', 'app:requestClose');
  });

  win.on('closed', () => {
    if (initial.waitToken) releaseWaitToken(initial.waitToken); // `posemark --wait` returns
    stopWatch(entry);
    if (entry.state.path) rememberClosed(entry.state.path);
    if (entry.draft) liveDrafts.delete(entry.draft);
    windows.delete(win.id);
    if (lastFocusedId === win.id) lastFocusedId = null;
    updateMenu();
  });

  // Keep native Chrome context menu only where it makes sense; suppress the rest.
  win.webContents.on('context-menu', (_e, params) => {
    // rendered images get the editor's own menu (zoom, move, upload, delete…)
    if (params.mediaType === 'image' || params.mediaType === 'video' || params.mediaType === 'audio') return;
    const items = [];
    if (params.isEditable) {
      items.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Copy for WeChat', accelerator: 'CmdOrCtrl+Alt+C', click: () => sendTo(win, 'export:copyWeChat') },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }
    if (params.linkURL) {
      items.push({ type: 'separator' }, {
        label: 'Open Link',
        click: () => shell.openExternal(params.linkURL),
      }, {
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.webContents.on('did-finish-load', () => {
    win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff');
    win.webContents.send('config:changed', store.get());
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('did-fail-load', code, desc, url);
  });

  if (process.env.POSEMARK_DEBUG) {
    win.webContents.on('console-message', (...args) => {
      const detail = args[1];
      const msg = detail && typeof detail === 'object' ? `${detail.message} @${detail.sourceId}:${detail.lineNumber}` : args[2];
      console.log('[renderer]', msg);
    });
    win.webContents.on('render-process-gone', (_e, details) => console.error('renderer gone', details));
  }

  const langs = ['en-US', 'zh-CN'];
  try {
    win.webContents.session.setSpellCheckerLanguages(langs);
  } catch { /* dictionaries may be unavailable */ }

  updateMenu();
  return win;
}

// `--selftest`, `--export-test=<dir>`, `--wx-test=<dir>`, `--screenshot=<path>`: verification
// modes that drive the first window from the command line and exit (never user features).
function installVerificationModes(win, entry) {
  const quit = () => {
    entry.allowClose = true;
    app.exit(0);
  };

  if (process.argv.includes('--selftest')) {
    setTimeout(async () => {
      try {
        const log = await win.webContents.executeJavaScript(`(async () => {
          const log = [];
          const view = window.__ink.view();
          const setDoc = (t) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
          const run = (id) => {
            try { window.__ink.run(id); log.push('OK   ' + id); }
            catch (e) { log.push('FAIL ' + id + ' :: ' + e.message); }
            log.push('     doc=' + JSON.stringify(view.state.doc.toString().slice(0, 80)));
          };
          setDoc('hello world');
          view.dispatch({ selection: { anchor: 0, head: 5 } });
          run('fmt:bold');
          view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
          run('para:h1');
          run('para:headingDown');
          setDoc('a\\nb');
          view.dispatch({ selection: { anchor: 0, head: 3 } });
          run('para:ul'); run('para:task'); run('para:quote'); run('para:indent'); run('para:outdent');
          setDoc('x'); run('para:code'); run('para:table'); run('para:mathBlock'); run('para:hr'); run('fmt:link'); run('fmt:clear');
          run('view:sourceMode'); run('view:sourceMode');
          run('view:focusMode'); run('view:focusMode');
          run('view:typewriterMode'); run('view:typewriterMode');
          run('view:wordCount'); run('view:wordCount');
          run('view:outlineFlat'); run('view:outlineFlat');
          run('view:filesList'); run('view:filesList');
          try { const html = await window.__ink.exportHtml(); log.push('export html length ' + html.length); }
          catch (e) { log.push('FAIL export :: ' + e.message); }
          return log;
        })()`);
        console.log('SELFTEST:\n' + log.join('\n'));
      } catch (err) {
        console.error('selftest failed', err);
      }
      quit();
    }, 2500);
  }

  const exportArg = process.argv.find((a) => a.startsWith('--export-test='));
  if (exportArg) {
    const dir = exportArg.slice('--export-test='.length);
    setTimeout(async () => {
      try {
        const html = await win.webContents.executeJavaScript('window.__ink.exportHtml()');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'export.html'), html);
        const pdf = await win.webContents.executeJavaScript("window.__ink.exportPayload('pdf')");
        await htmlToPdf(pdf.html, path.join(dir, 'export.pdf'), pdf.pdf, pdf.info);
        const full = await win.webContents.executeJavaScript("window.__ink.exportPayload('png')");
        await htmlToPng(full.html, path.join(dir, 'export-full.png'), full.width);
        fs.writeFileSync(path.join(dir, 'export-plain.html'), (await win.webContents.executeJavaScript("window.__ink.exportPayload('html-plain')")).html);
        const preview = new BrowserWindow({ width: 1000, height: 1500, show: false });
        await preview.loadFile(path.join(dir, 'export.html'));
        await new Promise((r) => setTimeout(r, 900));
        const png = await preview.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'export.png'), png.toPNG());
        preview.destroy();
        console.log('export test ok ->', dir);
      } catch (err) {
        console.error('export test failed', err);
      }
      quit();
    }, 3200);
  }

  const wxArg = process.argv.find((a) => a.startsWith('--wx-test='));
  if (wxArg) {
    const dir = wxArg.slice('--wx-test='.length);
    setTimeout(async () => {
      try {
        const res = await win.webContents.executeJavaScript('window.__ink.copyWeChat(true)');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'wx-fragment.html'), res.html);
        const bare = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 32px;background:#fff">\n${res.html}\n</body></html>`;
        const barePath = path.join(dir, 'wx-bare.html');
        fs.writeFileSync(barePath, bare);
        const preview = new BrowserWindow({ width: 820, height: 1600, show: false });
        await preview.loadFile(barePath);
        await new Promise((r) => setTimeout(r, 900));
        const shots = [];
        for (let i = 0; i < 8; i++) {
          const png = await preview.webContents.capturePage();
          const size = png.getSize();
          const cut = Math.round((14 * size.width) / 820);
          const trimmed = png.crop({ x: 0, y: 0, width: Math.max(10, size.width - cut), height: size.height });
          shots.push(trimmed.toPNG());
          const more = await preview.webContents.executeJavaScript(
            `(() => { const el = document.scrollingElement; const before = el.scrollTop; el.scrollTop = before + ${1500}; return el.scrollTop > before; })()`,
          );
          await new Promise((r) => setTimeout(r, 450));
          if (!more) break;
        }
        shots.forEach((buf, i) => fs.writeFileSync(path.join(dir, `wx-${i + 1}.png`), buf));
        fs.writeFileSync(path.join(dir, 'wx.png'), shots[0]);
        const full = await preview.webContents.executeJavaScript('document.scrollingElement.scrollHeight');
        const audit = await preview.webContents.executeJavaScript(`(() => {
          const pick = (sel, props) => {
            const el = document.querySelector(sel);
            if (!el) return sel + ': MISSING';
            const cs = getComputedStyle(el);
            return sel + ': ' + props.map((p) => p + '=' + cs.getPropertyValue(p)).join(' | ');
          };
          return [
            pick('blockquote', ['border-left-width', 'background-color']),
            pick('hr', ['border-top-width', 'border-top-color']),
            pick('table td', ['border-top-width', 'border-left-width', 'border-right-width', 'border-bottom-width', 'border-left-style', 'border-left-color']),
            pick('pre', ['background-color', 'border-top-width', 'font-family', 'padding-left']),
            pick('pre .hljs-comment', ['color', 'font-style']),
            pick('pre .hljs-keyword', ['color']),
            pick('section.footnotes, section:last-of-type', ['border-top-width', 'font-size']),
            pick('pre code', ['font-family']),
            pick('inline-math-img', ['vertical-align']).replace('inline-math-img', 'img[style*="vertical-align"]'),
            pick('h2', ['border-left-width', 'padding-left', 'font-size']),
            pick('mark', ['background-color']),
            pick('h1', ['border-bottom-width']),
          ].join('\\n');
        })()`);
        console.log('AUDIT (no stylesheets):\\n' + audit);
        preview.setContentSize(820, Math.min(Math.ceil(full) + 60, 9000));
        await preview.webContents.executeJavaScript('document.scrollingElement.scrollTop = 0');
        await new Promise((r) => setTimeout(r, 600));
        const tall = await preview.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'wx-full.png'), tall.toPNG());
        for (const sel of ['blockquote', 'table', 'pre', 'img[style*="vertical-align"]']) {
          const box = await preview.webContents.executeJavaScript(`(() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return null;
            const target = el.tagName === 'IMG' ? el.closest('p') || el : el;
            target.scrollIntoView({ block: 'center' });
            const b = target.getBoundingClientRect();
            return { x: 0, y: Math.max(0, b.y - 16), w: 780, h: Math.min(420, b.height + 40) };
          })()`);
          if (!box) continue;
          await new Promise((r) => setTimeout(r, 300));
          const shot = await preview.webContents.capturePage({
            x: box.x,
            y: Math.round(box.y),
            width: box.w,
            height: Math.max(80, Math.round(box.h)),
          });
          const name = sel.replace(/[^a-z]/gi, '').slice(0, 12);
          fs.writeFileSync(path.join(dir, `crop-${name}.png`), shot.toPNG());
        }
        preview.destroy();
        console.log('wx test ok ->', dir, JSON.stringify(res.stats), 'html', res.html.length);
        await win.webContents.executeJavaScript('window.__ink.copyWeChat(false)');
        await new Promise((r) => setTimeout(r, 400));
        const items = await clipboard.read();
        const flavours = items.flatMap((i) => i.types).filter((t) => t.startsWith('text/'));
        let clipHtml = '';
        if (flavours.includes('text/html')) {
          const blob = await items[0].getType('text/html');
          clipHtml = typeof blob === 'string' ? blob : await blob.text();
        }
        console.log('clipboard flavours', JSON.stringify(flavours), 'html', clipHtml.length);
      } catch (err) {
        console.error('wx test failed', err);
      }
      quit();
    }, 3200);
  }

  const shotArg = process.argv.find((a) => a.startsWith('--screenshot='));
  if (shotArg) {
    const out = shotArg.slice('--screenshot='.length);
    const wait = Number(process.argv.find((a) => a.startsWith('--wait='))?.slice(7) || 2600);
    setTimeout(async () => {
      try {
        if (process.env.POSEMARK_DUMP === '1') {
          const names = await win.webContents.executeJavaScript(
            `(() => { const out = []; try { window.__ink.dumpTree((n) => out.push(n)); } catch (e) { out.push('ERR ' + e.message); } return [...new Set(out)]; })()`,
          );
          console.log('TREE NODES:', JSON.stringify(names));
        }
        if (process.env.POSEMARK_DUMP === '3') {
          const info = await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.md-block')].map((el, i) => i + ' ' + el.className + ' ' + el.offsetWidth + 'x' + el.offsetHeight + ' :: ' + JSON.stringify((el.innerText || '').slice(0, 50)))`,
          );
          console.log('BLOCKS:\n' + info.join('\n'));
        } else if (process.env.POSEMARK_DUMP === '2') {
          const lines = await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('.cm-line')].map((el, i) => i + ': ' + JSON.stringify(el.innerText))`,
          );
          console.log('LINES:\n' + lines.join('\n'));
        }
        if (process.env.POSEMARK_SCROLL) {
          const top = Number(process.env.POSEMARK_SCROLL) || 0;
          await win.webContents.executeJavaScript(`document.querySelector('.cm-scroller').scrollTop = ${top};`);
          await new Promise((r) => setTimeout(r, 700));
        }
        if (process.env.POSEMARK_JS) {
          const result = await win.webContents.executeJavaScript(process.env.POSEMARK_JS);
          if (result !== undefined) console.log('JS RESULT:', typeof result === 'string' ? result : JSON.stringify(result));
          await new Promise((r) => setTimeout(r, 600));
        }
        if (process.env.POSEMARK_TYPE) {
          win.focus();
          await new Promise((r) => setTimeout(r, 200));
          for (const ch of process.env.POSEMARK_TYPE) {
            win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
            await new Promise((r) => setTimeout(r, 45));
          }
          await new Promise((r) => setTimeout(r, 300));
          const typed = await win.webContents.executeJavaScript('window.__ink.view().state.doc.toString()');
          console.log('TYPED DOC:', JSON.stringify(typed));
        }
        // POSEMARK_CLIP: renderer code returning { x, y, width, height } in CSS px; only that
        // region is captured (the website's feature screenshots crop to the part that matters)
        let clip;
        if (process.env.POSEMARK_CLIP) {
          clip = await win.webContents.executeJavaScript(process.env.POSEMARK_CLIP);
          console.log('CLIP:', JSON.stringify(clip));
        }
        const img = await win.webContents.capturePage(clip);
        fs.writeFileSync(out, img.toPNG());
        console.log('screenshot written', out);
      } catch (err) {
        console.error('screenshot failed', err);
      }
      quit();
    }, wait);
  }
}

// ---------------------------------------------------------------------------
// themes (built-in + user folder), following the system dark mode
// ---------------------------------------------------------------------------
function allThemes() {
  const user = userThemes ? userThemes.list() : [];
  const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
  return [...BUILTIN_THEMES, ...user.filter((t) => !builtinIds.has(t.id))];
}

function themeById(id) {
  return allThemes().find((t) => t.id === id) || null;
}

// The theme a window should show right now.
function effectiveThemeId() {
  if (cfg('themeFollowSystem') && nativeTheme.shouldUseDarkColors) {
    const dark = cfg('themeDark') || 'night';
    if (themeById(dark)) return dark;
  }
  return themeById(cfg('theme')) ? cfg('theme') : 'default';
}

// KaTeX's stylesheet with its woff2 fonts inlined, so an exported HTML file renders formulas
// anywhere (and the PDF / PNG pages, which load from a temp file, find the fonts).
let katexCssCache = null;
async function katexExportCss() {
  if (katexCssCache) return katexCssCache;
  const dir = path.join(__dirname, '../../dist/katex');
  const css = await fsp.readFile(path.join(dir, 'katex.min.css'), 'utf8').catch(() => '');
  const fonts = new Map();
  for (const m of css.matchAll(/url\(fonts\/([\w-]+\.woff2)\)/g)) {
    if (!fonts.has(m[1])) fonts.set(m[1], (await fsp.readFile(path.join(dir, 'fonts', m[1])).catch(() => null))?.toString('base64'));
  }
  // keep only the woff2 source of each @font-face
  katexCssCache = css.replace(/src:url\(fonts\/([\w-]+\.woff2)\) format\("woff2"\)[^;}]*/g, (all, name) =>
    fonts.get(name) ? `src:url(data:font/woff2;base64,${fonts.get(name)}) format("woff2")` : all,
  );
  return katexCssCache;
}

async function themeCss(themeId) {
  const theme = themeById(themeId) || themeById('default');
  const read = (p) => fsp.readFile(p, 'utf8').catch(() => '');
  const base = theme.user ? await read(theme.file) : await read(path.join(__dirname, '../../dist/styles/themes', `${theme.id}.css`));
  const over = await userThemes.overrides(theme.id);
  return `${base}\n${over.base}\n${over.theme}`;
}

function broadcast(channel, ...args) {
  for (const w of orderedWindows()) w.webContents.send(channel, ...args);
}

function sendConfig() {
  broadcast('config:changed', store.get());
}

function updateMenu() {
  const menu = buildMenu({
    isDev,
    themes: allThemes(),
    currentTheme: effectiveThemeId(),
    recentFiles: cfg('recentFiles'),
    recentFolders: cfg('recentFolders'),
    pinnedFolders: cfg('pinnedFolders') || [],
    closedFiles: cfg('closedFiles') || [],
    lastExport: cfg('lastExport') || null,
    t: tr,
    windows: orderedWindows().map((w) => ({ id: w.id, title: entryOf(w)?.state.title || 'Untitled', focused: w.id === (focusedWindow()?.id) })),
    onCommand: (id, payload) => sendCommand(id, payload),
    onWindow: (id) => {
      const w = windows.get(id)?.win;
      if (w && !w.isDestroyed()) {
        if (w.isMinimized()) w.restore();
        w.focus();
      }
    },
  });
  Menu.setApplicationMenu(menu);
}

function sendTo(win, id, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('menu:command', id, payload);
}

function sendCommand(id, payload) {
  // window-level commands are handled here; everything else goes to the focused document
  if (id === 'window:new') return void createWindow({});
  if (id === 'window:next' || id === 'window:prev') return void cycleWindow(id === 'window:next' ? 1 : -1);
  sendTo(focusedWindow(), id, payload);
}

function cycleWindow(delta) {
  const list = orderedWindows();
  if (list.length < 2) return;
  const cur = focusedWindow();
  const idx = Math.max(0, list.findIndex((w) => w === cur));
  const next = list[(idx + delta + list.length) % list.length];
  if (next.isMinimized()) next.restore();
  next.focus();
}

function addRecent(kind, p) {
  if (cfg('recordRecent') === false) return;
  const key = kind === 'folder' ? 'recentFolders' : 'recentFiles';
  const list = [p, ...(cfg(key) || []).filter((x) => x !== p)].slice(0, 20);
  patch({ [key]: list });
  updateMenu();
}

function rememberClosed(p) {
  if (!p) return;
  const list = [p, ...(cfg('closedFiles') || []).filter((x) => x !== p)].slice(0, 20);
  patch({ closedFiles: list });
  updateMenu();
}

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------
const mdFilters = [
  { name: 'Markdown', extensions: MD_EXT },
  { name: 'All Files', extensions: ['*'] },
];

async function readTextFile(p) {
  const content = await fsp.readFile(p, 'utf8');
  const st = await fsp.stat(p);
  return { path: p, content, mtime: st.mtimeMs };
}

const isMarkdownName = (name) => MD_EXT.includes(path.extname(name).slice(1).toLowerCase());
const hiddenName = (name) => name.startsWith('.') || name === 'node_modules';

// Sidebar listing: sort order, hidden files and non-Markdown files follow the preferences.
async function dirEntries(dir) {
  const items = await fsp.readdir(dir, { withFileTypes: true });
  const showHidden = !!cfg('treeShowHidden');
  const allFiles = !!cfg('treeShowAllFiles');
  const sort = cfg('treeSort') || 'natural';
  const needStat = sort === 'mtime' || sort === 'ctime';
  const out = [];
  for (const it of items) {
    if (!showHidden && hiddenName(it.name)) continue;
    const full = path.join(dir, it.name);
    const isDir = it.isDirectory();
    if (!isDir && !allFiles && !isMarkdownName(it.name)) continue;
    const entry = { name: it.name, path: full, dir: isDir, markdown: isDir || isMarkdownName(it.name) };
    if (needStat) {
      try {
        const st = await fsp.stat(full);
        entry.mtime = st.mtimeMs;
        entry.ctime = st.birthtimeMs || st.ctimeMs;
      } catch {
        entry.mtime = entry.ctime = 0;
      }
    }
    out.push(entry);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh', sort === 'natural' ? { numeric: true, sensitivity: 'base' } : undefined);
  const desc = cfg('treeSortDesc') ? -1 : 1;
  out.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1; // folders first, always
    if (sort === 'mtime' || sort === 'ctime') {
      const d = (a[sort] || 0) - (b[sort] || 0);
      if (d) return desc * (d > 0 ? 1 : -1);
    }
    return desc * byName(a, b);
  });
  return out;
}

async function walkMarkdown(dir, limit = 4000) {
  const out = [];
  const stack = [dir];
  const showHidden = !!cfg('treeShowHidden');
  while (stack.length && out.length < limit) {
    const cur = stack.pop();
    let items = [];
    try {
      items = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const it of items) {
      if (!showHidden && hiddenName(it.name)) continue;
      if (it.name === 'node_modules' || it.name === '.git') continue;
      const full = path.join(cur, it.name);
      if (it.isDirectory()) stack.push(full);
      else if (isMarkdownName(it.name)) out.push(full);
    }
  }
  return out;
}

// Flat "articles" listing for the sidebar's list mode: every Markdown file under the
// folder with its modified time, newest first.
async function listMarkdown(dir) {
  const files = await walkMarkdown(dir, 4000);
  const out = [];
  for (const file of files) {
    try {
      const st = await fsp.stat(file);
      out.push({ path: file, name: path.basename(file), mtime: st.mtimeMs, size: st.size });
    } catch {
      /* vanished */
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// A name that does not collide inside `dir`: "note.md" -> "note 1.md", "note 2.md", …
function freeName(dir, name, { copy = false } = {}) {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let target = path.join(dir, copy ? `${stem} copy${ext}` : name);
  let i = copy ? 2 : 1;
  while (fs.existsSync(target)) target = path.join(dir, copy ? `${stem} copy ${i++}${ext}` : `${stem} ${i++}${ext}`);
  return target;
}

const sameOrInside = (child, parent) => {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + path.sep);
};

// ---------------------------------------------------------------------------
// folder watcher (one per window): the sidebar follows changes made outside the app
// ---------------------------------------------------------------------------
const closeWatcher = (w) => {
  try {
    if (w) w.close();
  } catch {
    /* already closed */
  }
};

function stopWatch(entry) {
  if (!entry) return;
  closeWatcher(entry.watcher);
  closeWatcher(entry.docWatcher);
  entry.watcher = null;
  entry.docWatcher = null;
  clearTimeout(entry.watchTimer);
  entry.watchQueue = new Set();
}

// The open document may live outside the sidebar folder (Open…, command line, Reopen
// Closed File): its own directory gets a flat watcher so external edits still reload it.
function startDocWatch(entry, dir) {
  closeWatcher(entry.docWatcher);
  entry.docWatcher = null;
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    entry.docWatcher = fs.watch(dir, { persistent: false }, watchHandler(entry, dir));
    entry.docWatcher.on('error', () => {
      closeWatcher(entry.docWatcher);
      entry.docWatcher = null;
    });
    return true;
  } catch {
    return false;
  }
}

function watchHandler(entry, dir) {
  return (_event, filename) => {
    if (filename) {
      const name = String(filename);
      // our own temp files and VCS churn are not interesting
      if (/(^|[\\/])\.git([\\/]|$)/.test(name) || /\.(tmp|swp)$/i.test(name) || /~$/.test(name)) return;
      entry.watchQueue.add(path.join(dir, name));
    } else entry.watchQueue.add(dir);
    clearTimeout(entry.watchTimer);
    entry.watchTimer = setTimeout(() => {
      const paths = [...entry.watchQueue];
      entry.watchQueue = new Set();
      if (!entry.win.isDestroyed()) entry.win.webContents.send('tree:changed', { dir, paths });
    }, 350);
  };
}

function startWatch(entry, dir) {
  closeWatcher(entry.watcher);
  entry.watcher = null;
  clearTimeout(entry.watchTimer);
  entry.watchQueue = new Set();
  if (!dir || !fs.existsSync(dir)) return false;
  const onChange = watchHandler(entry, dir);
  try {
    entry.watcher = fs.watch(dir, { recursive: true, persistent: false }, onChange);
  } catch {
    try {
      entry.watcher = fs.watch(dir, { persistent: false }, onChange);
    } catch {
      entry.watcher = null;
      return false;
    }
  }
  entry.watcher.on('error', () => stopWatch(entry));
  return true;
}

// ---------------------------------------------------------------------------
// search across the folder (Ctrl+Shift+F)
// ---------------------------------------------------------------------------
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function searchFolder({ dir, query, caseSensitive = false, wholeWord = false, regex = false, maxResults = 2000 }) {
  const out = { results: [], files: 0, scanned: 0, truncated: false, error: null };
  if (!dir || !query) return out;
  let source = regex ? query : escapeRegExp(query);
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  let re;
  try {
    re = new RegExp(source, `gu${caseSensitive ? '' : 'i'}`);
  } catch (err) {
    out.error = err.message;
    return out;
  }
  const files = await walkMarkdown(dir, 20000);
  for (const file of files) {
    if (out.results.length >= maxResults) {
      out.truncated = true;
      break;
    }
    let text;
    try {
      const st = await fsp.stat(file);
      if (st.size > 8 * 1024 * 1024) continue;
      text = await fsp.readFile(file, 'utf8');
    } catch {
      continue;
    }
    out.scanned++;
    if (!re.test(text)) continue;
    out.files++;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && out.results.length < maxResults; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        if (m[0] === '') {
          re.lastIndex++;
          continue;
        }
        const from = Math.max(0, m.index - 40);
        out.results.push({
          path: file,
          line: i + 1,
          col: m.index,
          len: m[0].length,
          before: (from > 0 ? '…' : '') + line.slice(from, m.index),
          match: m[0],
          after: line.slice(m.index + m[0].length, m.index + m[0].length + 80),
        });
        if (out.results.length >= maxResults) break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
// Load an export page into a throwaway window (written to a temp file so relative file:// images
// resolve the same way as when the user opens the exported HTML).
async function withExportPage(html, opts, fn) {
  const tmp = path.join(os.tmpdir(), `posemark-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  await fsp.writeFile(tmp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    useContentSize: true,
    ...opts,
    webPreferences: { backgroundThrottling: false, ...(opts && opts.webPreferences) },
  });
  try {
    await win.loadFile(tmp);
    // Give fonts and images a moment to settle.
    await new Promise((r) => setTimeout(r, 600));
    return await fn(win);
  } finally {
    win.destroy();
    fsp.unlink(tmp).catch(() => {});
  }
}

// `pdf` comes from pdfOptions() in the renderer (inches); `info` is the document properties.
async function htmlToPdf(html, outPath, pdf = {}, info = null) {
  await withExportPage(html, { webPreferences: { javascript: false } }, async (win) => {
    const options = {
      printBackground: true,
      pageSize: pdf.pageSize || 'A4',
      landscape: !!pdf.landscape,
      margins: pdf.margins || { top: 0, bottom: 0, left: 0, right: 0 },
      displayHeaderFooter: !!pdf.displayHeaderFooter,
    };
    if (pdf.displayHeaderFooter) {
      options.headerTemplate = pdf.headerTemplate;
      options.footerTemplate = pdf.footerTemplate;
    }
    let data = await win.webContents.printToPDF(options);
    if (info) data = setPdfInfo(Buffer.from(data), info);
    await fsp.writeFile(outPath, data);
  });
}

// The whole page as one PNG: the window is scrolled one viewport at a time and the captures
// are stitched row by row (a single capture is capped by the GPU texture size).
async function htmlToPng(html, outPath, width = 860) {
  const viewport = 1600;
  await withExportPage(html, { width, height: viewport }, async (win) => {
    const wc = win.webContents;
    // no scrollbars in the picture (the page's own, or a wide code block's)
    await wc.insertCSS('::-webkit-scrollbar { display: none !important; } html { scrollbar-width: none; }');
    const total = await wc.executeJavaScript('Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))');
    const view = await wc.executeJavaScript('window.innerHeight');
    const rows = [];
    let pixelWidth = 0;
    let scale = 1;
    for (let y = 0; y < total; y += view) {
      const actual = await wc.executeJavaScript(`window.scrollTo(0, ${y}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(window.scrollY))))`);
      await new Promise((r) => setTimeout(r, 60));
      const shot = await wc.capturePage();
      const size = shot.getSize();
      if (!size.width || !size.height) continue;
      scale = size.width / width;
      pixelWidth = size.width;
      const bitmap = shot.toBitmap();
      const stride = bitmap.length / size.height;
      // the last viewport may be clamped: skip what the previous capture already covered
      const skip = Math.round((y - actual) * scale);
      const take = Math.min(size.height - skip, Math.round(Math.min(view, total - y) * scale));
      for (let r = 0; r < take; r++) {
        const start = (skip + r) * stride;
        rows.push(bitmap.subarray(start, start + pixelWidth * 4));
      }
    }
    if (!rows.length) throw new Error('nothing was rendered');
    const image = nativeImage.createFromBitmap(Buffer.concat(rows), { width: pixelWidth, height: rows.length, scaleFactor: 1 });
    await fsp.writeFile(outPath, image.toPNG());
  });
}

const EXPORT_FORMATS = {
  html: { name: 'HTML', ext: 'html' },
  'html-plain': { name: 'HTML', ext: 'html' },
  pdf: { name: 'PDF', ext: 'pdf' },
  png: { name: 'PNG Image', ext: 'png' },
};

// Where the save dialog starts: the export folder preference, else next to the document.
function exportDefaultPath(docPath, ext) {
  const name = `${docPath ? path.basename(docPath).replace(/\.[^.]+$/, '') : 'Untitled'}.${ext}`;
  const dir = cfg('exportFolder') || (docPath ? path.dirname(docPath) : app.getPath('documents'));
  return path.join(dir, name);
}

// payload: { format, html, docPath, pdf, info, width, previous }
// `previous` skips the dialog and writes into the folder of the last export.
async function exportDocument(win, payload) {
  const format = EXPORT_FORMATS[payload.format];
  if (!format) throw new Error(`unknown export format ${payload.format}`);
  let target;
  if (payload.previous) {
    const last = cfg('lastExport');
    const dir = (last && last.dir) || path.dirname(exportDefaultPath(payload.docPath, format.ext));
    target = path.join(dir, path.basename(exportDefaultPath(payload.docPath, format.ext)));
  } else {
    const res = await dialog.showSaveDialog(win, {
      defaultPath: exportDefaultPath(payload.docPath, format.ext),
      filters: [{ name: format.name, extensions: [format.ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  if (payload.format === 'pdf') await htmlToPdf(payload.html, target, payload.pdf, payload.info);
  else if (payload.format === 'png') await htmlToPng(payload.html, target, payload.width);
  else await fsp.writeFile(target, payload.html, 'utf8');
  patch({ lastExport: { format: payload.format, dir: path.dirname(target) } });
  updateMenu();
  sendConfig();
  const after = cfg('exportOpenAfter');
  if (after === 'open') shell.openPath(target);
  else if (after === 'reveal') shell.showItemInFolder(target);
  return target;
}

// ---------------------------------------------------------------------------
// WeChat rasteriser: anything the 公众号 editor cannot hold (KaTeX trees, mermaid
// svg) is drawn once in a throwaway window and handed back as a PNG data URL.
// ---------------------------------------------------------------------------
async function rasterizeBlocks({ html, css, width = 720 }) {
  // A temp file, not next to the app: in a packaged build dist/ lives inside the read-only
  // app.asar (and an MSIX install is read-only too). KaTeX comes inline with its fonts.
  const file = path.join(os.tmpdir(), `posemark-wx-raster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  const page = `<!doctype html><html><head><meta charset="utf-8">
<style>${await katexExportCss()}</style>
<style>html,body{margin:0;padding:0;background:#fff}
::-webkit-scrollbar{display:none}
${css || ''}</style>
</head><body>${html}</body></html>`;
  await fsp.writeFile(file, page, 'utf8');

  const win = new BrowserWindow({ width, height: 1200, show: false, backgroundColor: '#ffffff' });
  const out = [];
  try {
    await win.loadFile(file);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((r) => setTimeout(r, 350));
    const count = await win.webContents.executeJavaScript(`document.querySelectorAll('[data-wx]').length`);
    for (let i = 0; i < count; i++) {
      let box = await win.webContents.executeJavaScript(`(() => {
        const el = document.querySelector('[data-wx="${i}"]');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      })()`);
      if (!box) {
        out.push(null);
        continue;
      }
      if (box.h > 1100) {
        win.setContentSize(width, Math.min(Math.ceil(box.h) + 60, 3400));
        await new Promise((r) => setTimeout(r, 200));
        box = await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelector('[data-wx="${i}"]');
          el.scrollIntoView({ block: 'center' });
          const b = el.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        })()`);
      }
      const rect = {
        x: Math.max(0, Math.floor(box.x) - 3),
        y: Math.max(0, Math.floor(box.y) - 3),
        width: Math.ceil(box.w) + 6,
        height: Math.ceil(box.h) + 6,
      };
      if (rect.width < 2 || rect.height < 2) {
        out.push(null);
        continue;
      }
      const img = await win.webContents.capturePage(rect);
      out.push(img.isEmpty() ? null : { url: img.toDataURL(), w: rect.width, h: rect.height });
    }
  } finally {
    win.destroy();
    fsp.unlink(file).catch(() => {});
  }
  return out;
}

// Uploader settings come from the config; the renderer may override for a test run.
function uploaderOptions(override) {
  const o = override || {};
  return {
    uploader: o.uploader ?? cfg('imageUploader') ?? 'none',
    picgoPath: o.picgoPath ?? cfg('imagePicgoPath') ?? 'picgo',
    piclistUrl: o.piclistUrl ?? cfg('imagePiclistUrl') ?? 'http://127.0.0.1:36677',
    command: o.command ?? cfg('imageUploadCommand') ?? '',
  };
}

// ---------------------------------------------------------------------------
// launch: what the first window opens when no file was passed on the command line
// ---------------------------------------------------------------------------
// `posemark --wait file`: the invoking shell blocks until the window closes. The waiting process
// owns a token file; whoever ends up showing the window deletes it when the window goes away.
const waitTokenDir = () => path.join(os.tmpdir(), 'posemark-wait');
let ownWaitToken = null;
function newWaitToken() {
  fs.mkdirSync(waitTokenDir(), { recursive: true });
  ownWaitToken = path.join(waitTokenDir(), `${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(ownWaitToken, '');
  return ownWaitToken;
}
function releaseWaitToken(token) {
  try {
    fs.unlinkSync(token);
  } catch { /* already gone */ }
}
function whenWaitTokenReleased(token, done) {
  const tick = () => (fs.existsSync(token) ? setTimeout(tick, 250) : done());
  tick();
}

// What a launch asks for, as windows to open: one per path, else the usual launch payload.
function windowsFor(cli, waitToken) {
  if (!cli.paths.length) return cli.newWindow ? [launchPayload()] : [];
  return cli.paths.map((p, i) => ({ ...p, waitToken: i === 0 ? waitToken : undefined }));
}

// `posemark export`: a hidden window renders each file; nothing is shown.
async function runCliExport(cli) {
  const win = createWindow({ hidden: true });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const deadline = Date.now() + 30000;
  while (!(await js('!!(window.__ink && window.__ink.view())').catch(() => false))) {
    if (Date.now() > deadline) throw new Error('the editor did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  const ext = { html: 'html', 'html-plain': 'html', pdf: 'pdf', png: 'png', wechat: 'html' }[cli.format];
  const many = cli.inputs.length > 1;
  const outIsDir = !!cli.out && (many || /[\\/]$/.test(cli.out) || (fs.existsSync(cli.out) && fs.statSync(cli.out).isDirectory()));
  if (outIsDir) fs.mkdirSync(cli.out, { recursive: true });
  const rel = (p) => path.relative(process.cwd(), p) || p;
  let failed = 0;
  for (const file of cli.inputs) {
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const target = outIsDir ? path.join(cli.out, `${base}.${ext}`) : cli.out || path.join(path.dirname(file), `${base}.${ext}`);
    try {
      await js(`window.__ink.openPath(${JSON.stringify(file)})`);
      await new Promise((r) => setTimeout(r, 300));
      if (cli.format === 'wechat') {
        const { html } = await js('window.__ink.copyWeChat(true)');
        await fsp.writeFile(target, html, 'utf8');
      } else {
        const payload = await js(`window.__ink.exportPayload(${JSON.stringify(cli.format)}, ${JSON.stringify(cli.overrides)})`);
        if (cli.format === 'pdf') await htmlToPdf(payload.html, target, payload.pdf, payload.info);
        else if (cli.format === 'png') await htmlToPng(payload.html, target, payload.width);
        else await fsp.writeFile(target, payload.html, 'utf8');
      }
      console.log(`${rel(file)} -> ${rel(target)}`);
    } catch (err) {
      failed += 1;
      console.error(`${rel(file)}: ${err.message || err}`);
    }
  }
  return failed ? 1 : 0;
}

// macOS: File › Install "posemark" Shell Command links the bundled script into /usr/local/bin.
async function installShellCommand() {
  const script = path.join(process.resourcesPath, 'bin', 'posemark');
  const link = '/usr/local/bin/posemark';
  if (!fs.existsSync(script)) throw new Error('the command line script is not part of this build');
  try {
    fs.mkdirSync('/usr/local/bin', { recursive: true });
    try { fs.unlinkSync(link); } catch { /* none yet */ }
    fs.symlinkSync(script, link);
  } catch {
    // /usr/local/bin is usually root-owned: ask once, through the system prompt
    const { execFileSync } = require('child_process');
    const shellCmd = `mkdir -p /usr/local/bin && ln -sf ${JSON.stringify(script)} ${JSON.stringify(link)}`;
    execFileSync('osascript', ['-e', `do shell script ${JSON.stringify(shellCmd)} with administrator privileges`], { stdio: 'ignore' });
  }
  return link;
}

function launchPayload() {
  const action = cfg('launchAction') || 'folder';
  const lastFolder = cfg('lastFolder');
  const exists = (p) => !!p && fs.existsSync(p);
  if (action === 'new') return {};
  if (action === 'fixed') {
    const fixed = cfg('launchFolder');
    return exists(fixed) ? { folder: fixed } : {};
  }
  if (action === 'file') {
    const file = cfg('activeFile');
    return { file: exists(file) ? file : null, folder: exists(lastFolder) ? lastFolder : null };
  }
  return { folder: exists(lastFolder) ? lastFolder : null };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('dialog:openFile', async (e, startDir) => {
    const res = await dialog.showOpenDialog(winFor(e), {
      properties: ['openFile'],
      filters: mdFilters,
      defaultPath: startDir || cfg('lastFolder') || app.getPath('documents'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    const p = res.filePaths[0];
    addRecent('file', p);
    return readTextFile(p);
  });

  ipcMain.handle('dialog:openFolder', async (e, startDir) => {
    const res = await dialog.showOpenDialog(winFor(e), {
      properties: ['openDirectory'],
      defaultPath: startDir || cfg('lastFolder') || app.getPath('documents'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    const dir = res.filePaths[0];
    patch({ lastFolder: dir });
    addRecent('folder', dir);
    return dir;
  });

  // Folder picker that only returns the path (Preferences › Startup › fixed folder).
  ipcMain.handle('dialog:pickFolder', async (e, startDir) => {
    const res = await dialog.showOpenDialog(winFor(e), {
      properties: ['openDirectory'],
      defaultPath: startDir || cfg('lastFolder') || app.getPath('documents'),
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:saveFileAs', async (e, payload) => {
    const ext = cfg('defaultExtension') || 'md';
    const res = await dialog.showSaveDialog(winFor(e), {
      defaultPath: payload.defaultPath || path.join(cfg('lastFolder') || app.getPath('documents'), `Untitled.${ext}`),
      filters: mdFilters,
    });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, payload.content ?? '', 'utf8');
    addRecent('file', res.filePath);
    return res.filePath;
  });

  ipcMain.handle('file:read', (_e, p) => readTextFile(p));
  ipcMain.handle('file:write', async (_e, p, content) => {
    await fsp.writeFile(p, content, 'utf8');
    const st = await fsp.stat(p);
    return st.mtimeMs;
  });
  ipcMain.handle('file:exists', (_e, p) => fs.existsSync(p));
  ipcMain.handle('file:dir', (_e, dir) => dirEntries(dir));
  ipcMain.handle('file:walk', (_e, dir) => walkMarkdown(dir));
  ipcMain.handle('file:list', (_e, dir) => listMarkdown(dir));
  ipcMain.handle('file:stat', async (_e, p) => {
    try {
      const st = await fsp.stat(p);
      return { mtime: st.mtimeMs, size: st.size, dir: st.isDirectory() };
    } catch {
      return null;
    }
  });
  ipcMain.handle('folder:watch', (e, dir) => {
    const entry = entryFor(e);
    if (!entry) return false;
    return dir ? startWatch(entry, dir) : (stopWatch(entry), false);
  });
  ipcMain.handle('doc:watch', (e, dir) => {
    const entry = entryFor(e);
    return entry ? startDocWatch(entry, dir) : false;
  });
  ipcMain.handle('search:folder', (_e, payload) => searchFolder(payload || {}));
  ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('file:create', async (_e, dir, name) => {
    const target = freeName(dir, name);
    await fsp.writeFile(target, '', 'utf8');
    return target;
  });

  ipcMain.handle('file:mkdir', async (_e, dir, name) => {
    const target = path.join(dir, name);
    await fsp.mkdir(target, { recursive: true });
    return target;
  });

  // Rename in place; returns the new absolute path, or null if the name is unusable.
  ipcMain.handle('file:rename', async (_e, p, name) => {
    const clean = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean || clean === '.' || clean === '..') return null;
    const target = path.join(path.dirname(p), clean);
    if (target === p) return p;
    if (fs.existsSync(target)) return { error: 'exists', path: target };
    await fsp.rename(p, target);
    return target;
  });

  // Move a file or folder into another folder (file tree drag and drop); never overwrites.
  ipcMain.handle('file:move', async (_e, p, destDir) => {
    if (!p || !destDir || !fs.existsSync(p) || !fs.existsSync(destDir)) return null;
    if (sameOrInside(destDir, p)) return { error: 'inside' };
    const target = path.join(destDir, path.basename(p));
    if (path.resolve(target) === path.resolve(p)) return p;
    if (fs.existsSync(target)) return { error: 'exists', path: target };
    try {
      await fsp.rename(p, target);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      await fsp.cp(p, target, { recursive: true, errorOnExist: true });
      await fsp.rm(p, { recursive: true });
    }
    return target;
  });

  // Duplicate next to the original: "note.md" -> "note copy.md" (folders copied recursively).
  ipcMain.handle('file:duplicate', async (_e, p) => {
    if (!p || !fs.existsSync(p)) return null;
    const target = freeName(path.dirname(p), path.basename(p), { copy: true });
    await fsp.cp(p, target, { recursive: true, errorOnExist: true });
    return target;
  });

  // Delete goes to the recycle bin, never a hard unlink.
  ipcMain.handle('file:delete', async (_e, p) => {
    if (!p || !fs.existsSync(p)) return false;
    await shell.trashItem(p);
    return true;
  });

  ipcMain.handle('styles:export', async (_e, themeId) => {
    const dir = path.join(__dirname, '../../dist/styles');
    const content = await fsp.readFile(path.join(dir, 'content.css'), 'utf8').catch(() => '');
    return `${await katexExportCss()}\n${content}\n${await themeCss(themeId)}`;
  });

  // Images: the renderer works out the destination folder (front matter, preference,
  // or nothing for an untitled document → Pictures/posemark) and the Markdown path.
  const imageDir = (destDir) => destDir || path.join(app.getPath('pictures'), 'posemark');

  // Copy a dropped / chosen image (or video) into the document's image folder.
  ipcMain.handle('image:import', (_e, { src, destDir }) => images.importFile(src, imageDir(destDir)));

  // Paste an image straight out of the clipboard.
  // (Electron 45 dropped `clipboard.readImage`; this uses the W3C-style async API.)
  ipcMain.handle('image:pasteClipboard', async (_e, { destDir }) => {
    const items = (await clipboard.read()) || [];
    let mime = '';
    let bytes = null;
    for (const item of items) {
      const type = (item.types || []).find((t) => /^image\//i.test(t));
      if (!type) continue;
      const blob = await item.getType(type);
      const buffer = Buffer.from(await blob.arrayBuffer());
      if (buffer.length) {
        mime = type.toLowerCase();
        bytes = buffer;
        break;
      }
    }
    if (!bytes) return null;
    return images.writePasted(bytes, mime, imageDir(destDir));
  });

  ipcMain.handle('image:copyTo', (_e, { src, destDir }) => images.copyTo(src, imageDir(destDir)));
  ipcMain.handle('image:moveTo', (_e, { src, destDir }) => images.moveTo(src, imageDir(destDir)));
  ipcMain.handle('image:download', (_e, { url, destDir }) => images.download(url, imageDir(destDir), net.fetch));
  ipcMain.handle('image:upload', (_e, { paths, options }) => images.upload(paths || [], uploaderOptions(options)));
  ipcMain.handle('image:uploadTest', async (_e, options) => {
    const file = await images.testImage();
    try {
      return await images.upload([file], uploaderOptions(options));
    } finally {
      fsp.unlink(file).catch(() => {});
    }
  });
  // put the picture itself on the clipboard (not its path)
  ipcMain.handle('image:copyToClipboard', (_e, p) => {
    if (!p || !fs.existsSync(p)) return false;
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    return true;
  });
  ipcMain.handle('image:kind', (_e, name) => (images.isImageName(name) ? 'image' : images.isMediaName(name) ? 'media' : null));

  // diagrams rendered in the editor: save the SVG text or a PNG data URL
  ipcMain.handle('diagram:save', async (e, { kind, data, defaultName }) => {
    const res = await dialog.showSaveDialog(winFor(e), {
      defaultPath: path.join(cfg('lastFolder') || app.getPath('pictures'), defaultName || `diagram.${kind}`),
      filters: kind === 'png' ? [{ name: 'PNG image', extensions: ['png'] }] : [{ name: 'SVG image', extensions: ['svg'] }],
    });
    if (res.canceled || !res.filePath) return null;
    if (kind === 'png') await fsp.writeFile(res.filePath, nativeImage.createFromDataURL(data).toPNG());
    else await fsp.writeFile(res.filePath, data, 'utf8');
    return res.filePath;
  });
  ipcMain.handle('app:clipboardWriteDataUrl', (_e, url) => {
    const img = nativeImage.createFromDataURL(url);
    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    return true;
  });

  ipcMain.handle('dialog:openImage', async (e, startDir) => {
    const res = await dialog.showOpenDialog(winFor(e), {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      defaultPath: startDir || cfg('lastFolder') || app.getPath('pictures'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  // What this window should open: the file/folder it was created for, plus how many
  // unsaved drafts are waiting (only told to the first window).
  ipcMain.handle('app:initial', async (e) => {
    const entry = entryFor(e);
    if (!entry) return { file: null, folder: null, drafts: 0 };
    const init = entry.initial || {};
    let drafts = 0;
    if (init.first) drafts = (await listRecoverableDrafts()).length;
    return { file: init.file || null, folder: init.folder || null, drafts, first: !!init.first };
  });

  ipcMain.handle('config:get', () => store.get());
  ipcMain.handle('config:set', (_e, p) => {
    patch(p);
    if ('language' in p) refreshLanguage();
    if (['language', 'theme', 'themeDark', 'themeFollowSystem', 'pinnedFolders', 'recentFiles', 'recentFolders', 'closedFiles'].some((k) => k in p)) updateMenu();
    sendConfig();
    return store.get();
  });

  ipcMain.handle('state:set', (e, state) => {
    const entry = entryFor(e);
    if (!entry) return false;
    const prev = entry.state.path;
    entry.state = { ...entry.state, ...state };
    const name = entry.state.title || 'Untitled';
    entry.win.setTitle(`${entry.state.dirty ? '● ' : ''}${name} — Posemark`);
    if (entry.state.path !== prev) {
      if (entry.state.path) patch({ activeFile: entry.state.path });
      updateMenu();
    }
    return true;
  });

  // The document in this window was closed or switched away from (for "Reopen Closed File").
  ipcMain.handle('file:noteClosed', (_e, p) => {
    rememberClosed(p);
    return true;
  });
  ipcMain.handle('file:popClosed', () => {
    const list = [...(cfg('closedFiles') || [])];
    let next = null;
    while (list.length) {
      const p = list.shift();
      if (fs.existsSync(p)) {
        next = p;
        break;
      }
    }
    patch({ closedFiles: list });
    updateMenu();
    return next;
  });

  ipcMain.handle('theme:list', () => allThemes());
  ipcMain.handle('theme:effective', () => effectiveThemeId());
  ipcMain.handle('theme:pick', (_e, id) => {
    // while following the system, picking a theme in dark mode sets the dark slot
    if (cfg('themeFollowSystem') && nativeTheme.shouldUseDarkColors) patch({ themeDark: id });
    else patch({ theme: id });
    updateMenu();
    sendConfig();
    return effectiveThemeId();
  });
  // Everything the renderer needs to put a theme on screen: the stylesheet location and
  // the user's override CSS.
  ipcMain.handle('theme:resolve', async (_e, id) => {
    const theme = themeById(id) || themeById('default');
    const over = await userThemes.overrides(theme.id);
    return {
      id: theme.id,
      name: theme.name,
      dark: !!theme.dark,
      user: !!theme.user,
      href: theme.user ? 'file:///' + theme.file.replace(/\\/g, '/').replace(/^\//, '') : `styles/themes/${theme.id}.css`,
      overrides: `${over.base}\n${over.theme}`,
    };
  });
  ipcMain.handle('theme:openFolder', async () => {
    const dir = await userThemes.ensure();
    await shell.openPath(dir);
    return dir;
  });
  ipcMain.handle('app:systemDark', () => nativeTheme.shouldUseDarkColors);

  // unsaved-draft backups
  ipcMain.handle('draft:write', async (e, { content, docPath, title }) => {
    const entry = entryFor(e);
    if (!entry) return null;
    const id = draftId(docPath, entry.session);
    if (entry.draft && entry.draft !== id) {
      liveDrafts.delete(entry.draft);
      await drafts.remove(entry.draft);
    }
    entry.draft = id;
    liveDrafts.add(id);
    return drafts.write({ id, content, docPath, title });
  });
  ipcMain.handle('draft:clear', async (e) => {
    const entry = entryFor(e);
    if (!entry || !entry.draft) return false;
    liveDrafts.delete(entry.draft);
    await drafts.remove(entry.draft);
    entry.draft = null;
    return true;
  });
  ipcMain.handle('draft:list', () => listRecoverableDrafts());
  ipcMain.handle('draft:read', (_e, id) => drafts.read(id));
  ipcMain.handle('draft:remove', (_e, id) => drafts.remove(id));

  ipcMain.handle('export:document', (e, payload) => exportDocument(winFor(e), payload));

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^(https?|mailto):/i.test(url)) return shell.openExternal(url);
    return null;
  });

  ipcMain.handle('shell:openPath', async (_e, p) => {
    if (!p || !fs.existsSync(p)) return 'missing';
    return (await shell.openPath(p)) || 'ok';
  });

  // Windows/Linux hide the native menu bar (titleBarStyle: 'hidden'), so the title
  // bar's menu button pops the application menu up under itself instead.
  ipcMain.handle('app:showMenu', (e, { x, y }) => {
    const win = winFor(e);
    const menu = Menu.getApplicationMenu();
    const z = e.sender.getZoomFactor(); // CSS px -> window DIPs
    if (win && menu) menu.popup({ window: win, x: Math.round(x * z), y: Math.round(y * z) });
  });
  ipcMain.handle('app:close', (e) => {
    const entry = entryFor(e);
    if (!entry) return;
    entry.allowClose = true;
    entry.win.close();
  });
  ipcMain.handle('app:installShellCommand', () => installShellCommand());
  ipcMain.handle('window:new', (_e, payload) => {
    const win = createWindow(payload || {});
    return win.id;
  });
  ipcMain.handle('window:focus', (_e, dir) => cycleWindow(dir < 0 ? -1 : 1));
  ipcMain.handle('window:count', () => orderedWindows().length);
  ipcMain.handle('app:confirm', async (e, payload) => {
    const res = await dialog.showMessageBox(winFor(e), {
      type: payload.type || 'question',
      message: tr(payload.message),
      detail: tr(payload.detail),
      buttons: (payload.buttons || ['OK']).map((b) => tr(b)),
      defaultId: payload.defaultId ?? 0,
      cancelId: payload.cancelId ?? (payload.buttons ? payload.buttons.length - 1 : 0),
      noLink: true,
    });
    return res.response;
  });
  ipcMain.handle('app:info', async (e, payload) => {
    await dialog.showMessageBox(winFor(e), {
      type: 'info',
      message: tr(payload.message),
      detail: tr(payload.detail),
      buttons: [tr('OK')],
      noLink: true,
    });
    return true;
  });
  ipcMain.handle('app:language', () => uiLanguage());
  ipcMain.handle('app:paths', () => ({
    documents: app.getPath('documents'),
    home: app.getPath('home'),
    userData: app.getPath('userData'),
    themes: userThemes.dir,
  }));
  ipcMain.handle('app:setZoom', (e, factor) => {
    e.sender.setZoomFactor(factor);
    return factor;
  });
  ipcMain.handle('app:setAlwaysOnTop', (e, on) => {
    const win = winFor(e);
    if (win) win.setAlwaysOnTop(!!on);
    return !!on;
  });
  ipcMain.handle('app:toggleFullScreen', (e) => {
    const win = winFor(e);
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('app:clipboardRead', () => clipboard.readText());
  ipcMain.handle('app:clipboardWrite', (_e, text) => {
    clipboard.writeText(text);
  });
  // rich clipboard write — the HTML flavour is what the 公众号 editor reads
  ipcMain.handle('app:clipboardWriteHtml', (_e, payload) => {
    clipboard.write({ html: payload.html, text: payload.text || '' });
    return true;
  });
  ipcMain.handle('katex:css', () =>
    fsp.readFile(path.join(__dirname, '../../dist/katex/katex.min.css'), 'utf8').catch(() => ''),
  );
  ipcMain.handle('export:rasterize', (_e, payload) => rasterizeBlocks(payload));
  ipcMain.handle('file:dataUrl', async (_e, p) => {
    try {
      const buf = await fsp.readFile(p);
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime =
        ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'gif'
            ? 'image/gif'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'svg'
                ? 'image/svg+xml'
                : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });
}

async function listRecoverableDrafts() {
  const all = await drafts.list();
  return all.filter((d) => !liveDrafts.has(d.id));
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
function bootServices() {
  store = new Store(path.join(app.getPath('userData'), 'config.json'));
  refreshLanguage();
  drafts = new Drafts(path.join(app.getPath('userData'), 'drafts'));
  userThemes = new UserThemes(path.join(app.getPath('userData'), 'themes'));
  registerIpc();
}

const cli = parseCli(process.argv, { defaultApp: !!process.defaultApp });
const say = (text, code) => process.stdout.write(text, () => app.exit(code));

if (cli.command === 'help') {
  say(helpText(), 0);
} else if (cli.command === 'version') {
  say(`${app.getName()} ${app.getVersion()} (Electron ${process.versions.electron})\n`, 0);
} else if (cli.error) {
  process.stderr.write(`posemark: ${cli.error}\n${helpText()}`, () => app.exit(2));
} else if (cli.command === 'export') {
  // no single-instance lock: exporting must not be forwarded to an open editor
  app.whenReady().then(async () => {
    bootServices();
    let code = 1;
    try {
      code = await runCliExport(cli);
    } catch (err) {
      console.error(`posemark: ${err.message || err}`);
    }
    store?.save();
    app.exit(code);
  });
} else if (!app.requestSingleInstanceLock({ waitToken: cli.wait && cli.paths.length ? newWaitToken() : null })) {
  // the running instance got our arguments; with --wait stay around until it is done with them
  if (ownWaitToken) {
    if (app.dock) app.dock.hide();
    whenWaitTokenReleased(ownWaitToken, () => app.exit(0));
  } else app.quit();
} else {
  // a second launch with paths opens them in new windows; without any it just raises us
  app.on('second-instance', (_e, argv, workingDirectory, data) => {
    if (process.env.POSEMARK_DEBUG) console.log('second-instance', JSON.stringify({ argv, workingDirectory, data }));
    const asked = parseCli(argv, { defaultApp: !!process.defaultApp, cwd: workingDirectory || process.cwd() });
    const wins = asked.command === 'open' && !asked.error ? windowsFor(asked, data && data.waitToken) : [];
    if (wins.length) {
      wins.forEach((w) => createWindow(w));
      return;
    }
    if (data && data.waitToken) releaseWaitToken(data.waitToken); // nothing to wait for
    const win = focusedWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (app.isReady()) createWindow({ file });
    else app.once('ready', () => setTimeout(() => createWindow({ file }), 50));
  });

  app.whenReady().then(() => {
    bootServices();
    const wins = windowsFor(cli, ownWaitToken);
    (wins.length ? wins : [launchPayload()]).forEach((w) => createWindow(w));
    nativeTheme.on('updated', () => {
      for (const w of orderedWindows()) w.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff');
      updateMenu();
      broadcast('menu:command', 'theme:systemChanged');
    });
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow(launchPayload());
    });
  });

  app.on('window-all-closed', () => {
    store?.save();
    if (process.platform !== 'darwin') app.quit();
  });
}

// Exported for the smoke test harness.
module.exports = { htmlToPdf };
