'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard, nativeTheme, screen } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { Store } = require('./store');
const THEMES = require('./themes');
const { buildMenu } = require('./menu');

const MD_EXT = ['md', 'markdown', 'mmd', 'mdown', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'txt', 'text', 'rmd'];
const isDev = !!process.env.POSEMARK_DEV;

let mainWindow = null;
let store = null;
let allowClose = false;
let editorState = { path: null, title: 'Untitled', dirty: false };

const cfg = (key) => store.get(key);
const patch = (obj) => store.set(obj);

// ---------------------------------------------------------------------------
// window
// ---------------------------------------------------------------------------
function createWindow() {
  const bounds = cfg('windowBounds');
  const win = new BrowserWindow({
    width: bounds?.width || 1180,
    height: bounds?.height || 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 520,
    minHeight: 360,
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
    },
  });

  win.loadFile(path.join(__dirname, '../../dist/index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });

    // `--selftest` exercises the command layer without any clicking (verification only).
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
            try { const html = await window.__ink.exportHtml(); log.push('export html length ' + html.length); }
            catch (e) { log.push('FAIL export :: ' + e.message); }
            return log;
          })()`);
          console.log('SELFTEST:\n' + log.join('\n'));
        } catch (err) {
          console.error('selftest failed', err);
        }
        allowClose = true;
        app.exit(0);
      }, 2500);
    }

    // `--export-test=<dir>` renders HTML+PDF through the real pipeline (verification only).
    const exportArg = process.argv.find((a) => a.startsWith('--export-test='));
    if (exportArg) {
      const dir = exportArg.slice('--export-test='.length);
      setTimeout(async () => {
        try {
          const html = await win.webContents.executeJavaScript('window.__ink.exportHtml()');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'export.html'), html);
          await htmlToPdf(html, path.join(dir, 'export.pdf'));
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
        allowClose = true;
        app.exit(0);
      }, 3200);
    }

    // `--wx-test=<dir>` builds the WeChat fragment and renders it with every stylesheet
    // stripped, which is the closest thing to what the 公众号 editor will show.
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
            // trim the scrollbar strip off the right edge so the asset looks like a page
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
          // one tall shot so the whole fragment can be eyeballed at once
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
          // close-ups of the pieces that are easiest to break
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
          // prove the HTML flavour really lands on the clipboard (it replaces the current one)
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
        allowClose = true;
        app.exit(0);
      }, 3200);
    }

    // `--screenshot=<path>` renders the loaded document once and exits (used by scripts/smoke.js).
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
            await win.webContents.executeJavaScript(process.env.POSEMARK_JS);
            await new Promise((r) => setTimeout(r, 600));
          }
          // `POSEMARK_TYPE=<text>` types real keystrokes (used to verify input handlers).
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
          const img = await win.webContents.capturePage();
          fs.writeFileSync(out, img.toPNG());
          console.log('screenshot written', out);
        } catch (err) {
          console.error('screenshot failed', err);
        }
        allowClose = true;
        app.exit(0);
      }, wait);
    }
  });

  win.on('close', (e) => {
    if (allowClose) {
      const b = win.getBounds();
      patch({ windowBounds: { width: b.width, height: b.height, x: b.x, y: b.y } });
      return;
    }
    e.preventDefault();
    win.webContents.send('menu:command', 'app:requestClose');
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Keep native Chrome context menu only where it makes sense; suppress the rest.
  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    if (params.isEditable) {
      items.push(
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Copy for WeChat', accelerator: 'CmdOrCtrl+Alt+C', click: () => sendCommand('export:copyWeChat') },
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
        click: () => require('electron').clipboard.writeText(params.linkURL),
      });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.webContents.on('did-finish-load', () => {
    notifyTheme();
    sendConfig();
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

  return win;
}

function notifyTheme() {
  if (!mainWindow) return;
  mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff');
}

function sendConfig() {
  if (mainWindow) mainWindow.webContents.send('config:changed', store.get());
}

function updateMenu() {
  const menu = buildMenu({
    isDev,
    themes: THEMES,
    currentTheme: cfg('theme'),
    recentFiles: cfg('recentFiles'),
    recentFolders: cfg('recentFolders'),
    hasFile: !!editorState.path,
    onCommand: (id, payload) => sendCommand(id, payload),
  });
  Menu.setApplicationMenu(menu);
}

function sendCommand(id, payload) {
  if (mainWindow) mainWindow.webContents.send('menu:command', id, payload);
}

function addRecent(kind, p) {
  const key = kind === 'folder' ? 'recentFolders' : 'recentFiles';
  const list = [p, ...(cfg(key) || []).filter((x) => x !== p)].slice(0, 20);
  patch({ [key]: list });
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

// ---------------------------------------------------------------------------
// folder watcher: the sidebar follows changes made outside the app
// ---------------------------------------------------------------------------
let watcher = null;
let watchTimer = null;
let watchQueue = new Set();

function stopWatch() {
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* already closed */
    }
  }
  watcher = null;
  clearTimeout(watchTimer);
  watchQueue = new Set();
}

function startWatch(dir) {
  stopWatch();
  if (!dir || !fs.existsSync(dir)) return false;
  const onChange = (_event, filename) => {
    if (filename) {
      const name = String(filename);
      // our own temp files and VCS churn are not interesting
      if (/(^|[\\/])\.git([\\/]|$)/.test(name) || /\.(tmp|swp)$/i.test(name) || /~$/.test(name)) return;
      watchQueue.add(path.join(dir, name));
    } else watchQueue.add(dir);
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      const paths = [...watchQueue];
      watchQueue = new Set();
      if (mainWindow) mainWindow.webContents.send('tree:changed', { dir, paths });
    }, 350);
  };
  try {
    watcher = fs.watch(dir, { recursive: true, persistent: false }, onChange);
  } catch {
    try {
      watcher = fs.watch(dir, { persistent: false }, onChange);
    } catch {
      watcher = null;
      return false;
    }
  }
  watcher.on('error', () => stopWatch());
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
async function htmlToPdf(html, outPath, pageSize = 'A4') {
  const tmp = path.join(os.tmpdir(), `posemark-print-${Date.now()}.html`);
  await fsp.writeFile(tmp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false },
  });
  try {
    await win.loadFile(tmp);
    // Give fonts and images a moment to settle.
    await new Promise((r) => setTimeout(r, 600));
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize,
      margins: { marginType: 'none' },
    });
    await fsp.writeFile(outPath, data);
  } finally {
    win.destroy();
    fsp.unlink(tmp).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// WeChat rasteriser: anything the 公众号 editor cannot hold (KaTeX trees, mermaid
// svg) is drawn once in a throwaway window and handed back as a PNG data URL.
// ---------------------------------------------------------------------------
async function rasterizeBlocks({ html, css, width = 720 }) {
  const distDir = path.join(__dirname, '../../dist');
  const name = `_wx-raster-${Date.now()}.html`;
  const file = path.join(distDir, name);
  const page = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
${css || ''}</style>
<link rel="stylesheet" href="katex/katex.min.css">
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

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('dialog:openFile', async (_e, startDir) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: mdFilters,
      defaultPath: startDir || cfg('lastFolder') || app.getPath('documents'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    const p = res.filePaths[0];
    addRecent('file', p);
    return readTextFile(p);
  });

  ipcMain.handle('dialog:openFolder', async (_e, startDir) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath: startDir || cfg('lastFolder') || app.getPath('documents'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    const dir = res.filePaths[0];
    patch({ lastFolder: dir });
    addRecent('folder', dir);
    return dir;
  });

  ipcMain.handle('dialog:saveFileAs', async (_e, payload) => {
    const ext = cfg('defaultExtension') || 'md';
    const res = await dialog.showSaveDialog(mainWindow, {
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
  ipcMain.handle('file:stat', async (_e, p) => {
    try {
      const st = await fsp.stat(p);
      return { mtime: st.mtimeMs, size: st.size, dir: st.isDirectory() };
    } catch {
      return null;
    }
  });
  ipcMain.handle('folder:watch', (_e, dir) => (dir ? startWatch(dir) : (stopWatch(), false)));
  ipcMain.handle('search:folder', (_e, payload) => searchFolder(payload || {}));
  ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('file:create', async (_e, dir, name) => {
    const full = path.join(dir, name);
    let target = full;
    let i = 1;
    while (fs.existsSync(target)) {
      const ext = path.extname(full);
      target = path.join(dir, `${path.basename(full, ext)} ${i++}${ext}`);
    }
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

  // Delete goes to the recycle bin, never a hard unlink.
  ipcMain.handle('file:delete', async (_e, p) => {
    if (!p || !fs.existsSync(p)) return false;
    await shell.trashItem(p);
    return true;
  });

  ipcMain.handle('styles:export', async (_e, themeId) => {
    const dir = path.join(__dirname, '../../dist/styles');
    const read = (p) => fsp.readFile(p, 'utf8').catch(() => '');
    const content = await read(path.join(dir, 'content.css'));
    const theme = await read(path.join(dir, 'themes', `${themeId || 'default'}.css`));
    return `${content}\n${theme}`;
  });

  // Copy a dropped image next to the document and hand back a path the Markdown can use.
  ipcMain.handle('image:import', async (_e, { src, docPath }) => {
    if (!src || !fs.existsSync(src)) return null;
    const destDir = docPath ? path.join(path.dirname(docPath), 'assets') : path.join(app.getPath('pictures'), 'posemark');
    await fsp.mkdir(destDir, { recursive: true }).catch(() => {});
    const ext = (path.extname(src) || '.png').toLowerCase();
    const stem =
      path
        .basename(src, path.extname(src))
        .replace(/[^\w.\-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';
    let dest = path.join(destDir, stem + ext);
    let n = 1;
    while (fs.existsSync(dest)) dest = path.join(destDir, `${stem}-${n++}${ext}`);
    await fsp.copyFile(src, dest);
    const rel = docPath
      ? path.relative(path.dirname(docPath), dest).split(path.sep).join('/')
      : dest.split(path.sep).join('/');
    return { path: dest, rel, alt: stem };
  });

  // Paste an image straight out of the clipboard: land it in assets/ and hand back the path.
  // (Electron 45 dropped `clipboard.readImage`; this uses the W3C-style async API.)
  ipcMain.handle('image:pasteClipboard', async (_e, { docPath }) => {
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

    const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/gif' ? '.gif' : mime === 'image/webp' ? '.webp' : '.png';
    const destDir = docPath ? path.join(path.dirname(docPath), 'assets') : path.join(app.getPath('pictures'), 'posemark');
    await fsp.mkdir(destDir, { recursive: true }).catch(() => {});
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '-');
    let dest = path.join(destDir, `pasted-${stamp}${ext}`);
    let n = 1;
    while (fs.existsSync(dest)) dest = path.join(destDir, `pasted-${stamp}-${n++}${ext}`);
    await fsp.writeFile(dest, bytes);
    const rel = docPath
      ? path.relative(path.dirname(docPath), dest).split(path.sep).join('/')
      : dest.split(path.sep).join('/');
    return { path: dest, rel, alt: 'pasted image' };
  });

  ipcMain.handle('dialog:openImage', async (_e, startDir) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
      defaultPath: startDir || cfg('lastFolder') || app.getPath('pictures'),
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('app:initial', () => {
    const arg = process.argv
      .slice(1)
      .find((a) => !a.startsWith('-') && /\.(md|markdown|mmd|mdown|txt|text)$/i.test(a) && fs.existsSync(a));
    return arg ? path.resolve(arg) : null;
  });

  ipcMain.handle('config:get', () => store.get());
  ipcMain.handle('config:set', (_e, p) => {
    patch(p);
    if ('theme' in p) updateMenu();
    sendConfig();
    return store.get();
  });

  ipcMain.handle('state:set', (_e, state) => {
    editorState = { ...editorState, ...state };
    if (mainWindow) {
      const name = editorState.title || 'Untitled';
      mainWindow.setTitle(`${editorState.dirty ? '● ' : ''}${name} — Posemark`);
    }
    return true;
  });

  ipcMain.handle('theme:list', () => THEMES);
  ipcMain.handle('theme:pick', (_e, id) => {
    patch({ theme: id });
    updateMenu();
    sendConfig();
  });

  ipcMain.handle('export:html', async (_e, payload) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.defaultPath,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await fsp.writeFile(res.filePath, payload.html, 'utf8');
    return res.filePath;
  });

  ipcMain.handle('export:pdf', async (_e, payload) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await htmlToPdf(payload.html, res.filePath, payload.pageSize || 'A4');
    return res.filePath;
  });

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
    const win = BrowserWindow.fromWebContents(e.sender);
    const menu = Menu.getApplicationMenu();
    const z = e.sender.getZoomFactor(); // CSS px -> window DIPs
    if (win && menu) menu.popup({ window: win, x: Math.round(x * z), y: Math.round(y * z) });
  });
  ipcMain.handle('app:close', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('app:confirm', async (_e, payload) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: payload.type || 'question',
      message: payload.message,
      detail: payload.detail,
      buttons: payload.buttons || ['OK'],
      defaultId: payload.defaultId ?? 0,
      cancelId: payload.cancelId ?? (payload.buttons ? payload.buttons.length - 1 : 0),
      noLink: true,
    });
    return res.response;
  });
  ipcMain.handle('app:info', async (_e, payload) => {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: payload.message,
      detail: payload.detail,
      buttons: ['OK'],
      noLink: true,
    });
    return true;
  });
  ipcMain.handle('app:paths', () => ({
    documents: app.getPath('documents'),
    home: app.getPath('home'),
    userData: app.getPath('userData'),
  }));
  ipcMain.handle('app:setZoom', (_e, factor) => {
    if (mainWindow) mainWindow.webContents.setZoomFactor(factor);
    return factor;
  });
  ipcMain.handle('app:setAlwaysOnTop', (_e, on) => {
    if (mainWindow) mainWindow.setAlwaysOnTop(!!on);
    return !!on;
  });
  ipcMain.handle('app:toggleFullScreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  ipcMain.handle('app:clipboardRead', () => require('electron').clipboard.readText());
  ipcMain.handle('app:clipboardWrite', (_e, text) => {
    require('electron').clipboard.writeText(text);
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

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    store = new Store(path.join(app.getPath('userData'), 'config.json'));
    registerIpc();
    mainWindow = createWindow();
    updateMenu();
    nativeTheme.on('updated', () => {
      notifyTheme();
      sendCommand('theme:systemChanged');
    });
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) {
        mainWindow = createWindow();
        updateMenu();
      }
    });
  });

  app.on('window-all-closed', () => {
    stopWatch();
    store?.save();
    if (process.platform !== 'darwin') app.quit();
  });
}

// Exported for the smoke test harness.
module.exports = { htmlToPdf };
