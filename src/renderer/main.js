// Application shell: files, sidebar, outline, status bar, menu dispatch, export.
import { EditorView } from '@codemirror/view';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import mermaid from 'mermaid';
import {
  createEditor,
  setDoc,
  setHeading,
  stepHeading,
  toggleQuote,
  toggleList,
  toggleTask,
  indentLines,
  insertBlock,
  insertTable,
  insertCodeFence,
  insertMathBlock,
  insertRule,
  insertLink,
  insertImage,
  insertAlert,
  clearStyle,
  toggleWrap,
  setSourceMode,
  enableFocusMode,
  setSpellcheck,
  scrollCaretToCenter,
  gotoLine,
  openFind,
  docStats,
  inCodeAt,
  ctx,
} from './editor.js';
import { refreshLivePreview } from './live-preview.js';
import { scanBlocks, headingOf } from './blocks.js';
import { htmlToMarkdown, htmlLooksPlain } from './html2md.js';
import { renderFragment, buildStandaloneHtml, splitFrontMatter, slugify } from './markdown.js';
import { buildWeChatFragment } from './wechat.js';
import { renderWeChatPanel, wechatStyleFrom } from './wechat-prefs.js';
import { basename, dirOf } from './paths.js';
import { buildOutlineTree, currentHeadingIndex, outlineMatches, outlineKeys } from './outline.js';
import { countText, readingTime, formatReadingTime } from './wordcount.js';

const $ = (sel) => document.querySelector(sel);
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

const S = {
  config: {},
  view: null,
  path: null,
  dirty: false,
  folder: null,
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  zoom: 1,
  treeCache: new Map(),
  treeSel: null,
  expanded: new Set(),
  mtime: 0,
  loading: false,
  outline: [],
  outlineKeys: [],
  outlineQuery: '',
  outlineCollapsed: new Set(),
  currentHeading: -1,
  search: { query: '', caseSensitive: false, wholeWord: false, regex: false, results: null },
  themeId: 'default',
  filesView: 'tree',
  listCache: null,
  listSel: null,
  // undo stack for rename / move / duplicate / create done from the file tree
  fileOps: [],
  draftPending: false,
};

const WELCOME = `# Posemark

A **Typora-style** markdown editor: what you write is what you see, and the Markdown
syntax only shows up on the line your caret is on.

## Things to try

- Move the caret onto this line to see the \`-\` and **bold** markers again.
- [ ] Task lists work: click the checkbox on the left.
- [x] This one is already done.

> Quotes render as quotes. Hover the caret into it and the \`>\` comes back.

### Code

\`\`\`js
function greet(name) {
  // syntax highlighting via highlight.js
  return \`hello, \${name}\`;
}
\`\`\`

### Math

Inline math like $e^{i\\pi} + 1 = 0$ works, and so do block equations:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

### Tables

| Feature | Status |
| --- | --- |
| Live preview | yes |
| Outline | yes |
| Export HTML / PDF | yes |

### Diagrams

\`\`\`mermaid
graph LR
  A[Write markdown] --> B{Live preview}
  B --> C[Export HTML/PDF]
\`\`\`

---

Open a folder from the sidebar to browse your notes, hit **Ctrl+P** to quick-open a file,
and **Ctrl+F** to search inside the document.
`;

// ---------------------------------------------------------------------------
// theme
// ---------------------------------------------------------------------------
// Pick a theme. With "follow the system dark mode" on, the pick lands in the slot that
// matches the current OS appearance (the main process decides); `renderTheme` then shows
// whichever theme applies right now.
async function applyTheme(id, { persist = true } = {}) {
  if (persist) await window.ink.pickTheme(id);
  await renderTheme(persist ? undefined : id);
}

// Put the effective theme on screen: the built-in or user stylesheet, followed by
// `base.user.css` + `<theme>.user.css` from the user theme folder.
async function renderTheme(forceId) {
  const id = forceId || (await window.ink.effectiveTheme());
  const theme = await window.ink.resolveTheme(id);
  const link = $('#theme-css');
  if (link.getAttribute('href') !== theme.href) link.setAttribute('href', theme.href);
  $('#user-css').textContent = theme.overrides || '';
  document.body.classList.toggle('theme-dark', !!theme.dark);
  document.body.dataset.theme = theme.id;
  S.themeId = theme.id;
}

// ---------------------------------------------------------------------------
// document lifecycle
// ---------------------------------------------------------------------------
function updateTitle() {
  const name = S.path ? basename(S.path) : 'Untitled';
  $('#doc-title').textContent = name;
  $('#dirty-dot').hidden = !S.dirty;
  document.title = `${name} — Posemark`;
  window.ink.setState({ path: S.path, title: name, dirty: S.dirty });
}

function markDirty() {
  if (S.loading) return;
  if (!S.dirty) {
    S.dirty = true;
    updateTitle();
  }
  scheduleOutline();
  updateStatus();
  scheduleAutoSave();
  scheduleDraft();
}

// Unsaved-draft backup: the dirty document is mirrored into the app's drafts folder a
// moment after each edit and removed again once it is saved (or deliberately discarded),
// so a crash or a forced shutdown loses at most a second or two of typing.
const scheduleDraft = debounce(() => writeDraft(), 1500);

async function writeDraft() {
  if (!S.dirty) return;
  const content = S.view.state.doc.toString();
  if (!S.path && !content.trim()) return;
  try {
    await window.ink.draftWrite({ content, docPath: S.path, title: S.path ? basename(S.path) : 'Untitled' });
    S.draftPending = true;
  } catch {
    /* disk trouble: the next edit tries again */
  }
}

async function clearDraft() {
  if (!S.draftPending) return;
  S.draftPending = false;
  await window.ink.draftClear();
}

// Remember the document we are leaving so File › Reopen Closed File can bring it back.
function noteClosed(prevPath, nextPath) {
  if (prevPath && !samePath(prevPath, nextPath)) window.ink.noteClosed(prevPath);
}

// A file was renamed or moved: keep the open document and the folder pointing at it.
function followPathChange(oldPath, newPath) {
  if (S.path && underPath(S.path, oldPath)) {
    S.path = newPath + norm(S.path).slice(norm(oldPath).length);
    ctx.docPath = S.path;
    updateTitle();
  }
  if (S.folder && underPath(S.folder, oldPath)) S.folder = newPath + norm(S.folder).slice(norm(oldPath).length);
}

// Collapsed outline headings are remembered per document.
function loadOutlineState() {
  const saved = S.path ? (S.config.outlineCollapsed || {})[norm(S.path)] : null;
  S.outlineCollapsed = new Set(Array.isArray(saved) ? saved : []);
}

async function openPath(p) {
  if (S.dirty) {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) return;
  }
  try {
    const { content, mtime } = await window.ink.readFile(p);
    noteClosed(S.path, p);
    await clearDraft();
    S.path = p;
    S.mtime = mtime || 0;
    ctx.docPath = p;
    S.loading = true;
    setDoc(S.view, content);
    S.loading = false;
    S.dirty = false;
    setSourceMode(S.view, S.sourceMode);
    loadOutlineState();
    updateTitle();
    renderOutline();
    updateStatus();
    if (!S.folder) setFolder(dirOf(p), { persist: false });
    highlightTreeSelection();
  } catch (err) {
    window.ink.info({ message: 'Could not open file', detail: String(err) });
  }
}

async function newDocument() {
  if (S.dirty) {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) return;
  }
  noteClosed(S.path, null);
  await clearDraft();
  S.path = null;
  S.mtime = 0;
  S.dirty = false;
  ctx.docPath = S.folder || null;
  S.loading = true;
  setDoc(S.view, '');
  S.loading = false;
  S.dirty = false;
  loadOutlineState();
  updateTitle();
  renderOutline();
  updateStatus();
  S.view.focus();
}

async function save({ saveAs = false } = {}) {
  const content = S.view.state.doc.toString();
  if (!S.path || saveAs) {
    const target = await window.ink.saveFileAs({
      content,
      defaultPath: S.path || undefined,
    });
    if (!target) return false;
    S.path = target;
    ctx.docPath = target;
    const st = await window.ink.stat(target);
    S.mtime = st ? st.mtime : 0;
    if (!S.folder) setFolder(dirOf(target), { persist: false });
  } else {
    S.mtime = (await window.ink.writeFile(S.path, content)) || S.mtime;
  }
  S.dirty = false;
  await clearDraft();
  updateTitle();
  refreshTree();
  return true;
}

// The open file was rewritten by another program: pick up the new content in place.
async function reloadFromDisk() {
  if (!S.path) return;
  let res;
  try {
    res = await window.ink.readFile(S.path);
  } catch {
    return;
  }
  const view = S.view;
  const sel = view.state.selection.main;
  const scroll = view.scrollDOM.scrollTop;
  S.loading = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: res.content },
    selection: { anchor: Math.min(sel.anchor, res.content.length), head: Math.min(sel.head, res.content.length) },
  });
  S.loading = false;
  view.scrollDOM.scrollTop = scroll;
  S.mtime = res.mtime || 0;
  S.dirty = false;
  updateTitle();
  renderOutline();
  updateStatus();
  flashMessage(`Reloaded ${basename(S.path)} (changed on disk)`);
}

async function checkExternalChange() {
  if (!S.path) return;
  const st = await window.ink.stat(S.path);
  if (!st) {
    flashMessage(`${basename(S.path)} was moved or deleted`);
    return;
  }
  if (!S.mtime || Math.abs(st.mtime - S.mtime) < 1) return;
  if (S.dirty || S.config.reloadOnExternalChange === false) {
    S.mtime = st.mtime;
    flashMessage(`${basename(S.path)} changed on disk — your unsaved edits are kept`);
    return;
  }
  await reloadFromDisk();
}

async function maybeSaveBeforeSwitch() {
  if (!S.dirty) return true;
  const name = S.path ? basename(S.path) : 'Untitled';
  const res = await window.ink.confirm({
    message: `Save changes to “${name}”?`,
    detail: 'Your changes will be lost if you do not save them.',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  if (res === 0) return await save();
  if (res === 1) await clearDraft(); // "Don't Save" is a deliberate discard
  return res === 1;
}

// ---------------------------------------------------------------------------
// recover unsaved drafts (File › Recover Unsaved Drafts…)
// ---------------------------------------------------------------------------
const fmtWhen = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  if (d.getFullYear() === today.getFullYear()) return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  return d.toLocaleDateString();
};

async function openDrafts() {
  const modal = $('#drafts');
  const list = $('#drafts-list');
  const items = await window.ink.draftList();
  list.innerHTML = '';
  if (!items.length) list.innerHTML = '<div class="empty-hint">No unsaved drafts</div>';
  for (const d of items) {
    const row = document.createElement('div');
    row.className = 'draft-row';
    const info = document.createElement('div');
    info.className = 'draft-info';
    const title = document.createElement('div');
    title.className = 'draft-title';
    title.textContent = d.title || 'Untitled';
    const where = document.createElement('div');
    where.className = 'draft-path';
    where.textContent = `${d.path || 'Untitled document'} · ${fmtWhen(d.savedAt)}`;
    const preview = document.createElement('div');
    preview.className = 'draft-preview';
    preview.textContent = d.preview || '';
    info.append(title, where, preview);
    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    const restore = document.createElement('button');
    restore.className = 'pref-btn primary';
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => restoreDraft(d));
    const discard = document.createElement('button');
    discard.className = 'pref-btn';
    discard.textContent = 'Discard';
    discard.addEventListener('click', async () => {
      await window.ink.draftRemove(d.id);
      row.remove();
      if (!list.childElementCount) list.innerHTML = '<div class="empty-hint">No unsaved drafts</div>';
    });
    actions.append(restore, discard);
    row.append(info, actions);
    list.appendChild(row);
  }
  modal.hidden = false;
}

// Bring a draft back into this window: it becomes the (dirty) document, attached to its
// original file when that still exists.
async function restoreDraft(d) {
  let draft;
  try {
    draft = await window.ink.draftRead(d.id);
  } catch {
    flashMessage('That draft is gone');
    return;
  }
  if (S.dirty) {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) return;
  }
  const target = draft.path && (await window.ink.exists(draft.path)) ? draft.path : null;
  noteClosed(S.path, target);
  await clearDraft();
  S.path = target;
  ctx.docPath = target || S.folder || null;
  S.mtime = target ? (await window.ink.stat(target))?.mtime || 0 : 0;
  S.loading = true;
  setDoc(S.view, draft.content);
  S.loading = false;
  await window.ink.draftRemove(d.id);
  S.dirty = true;
  loadOutlineState();
  updateTitle();
  renderOutline();
  updateStatus();
  highlightTreeSelection();
  scheduleDraft();
  $('#drafts').hidden = true;
  flashMessage(`Restored draft of ${draft.title || 'Untitled'} — remember to save it`);
  S.view.focus();
}

const scheduleAutoSave = debounce(async () => {
  if (S.config.autoSave && S.path && S.dirty) await save();
}, 900);

// ---------------------------------------------------------------------------
// status bar + outline
// ---------------------------------------------------------------------------
function updateStatus() {
  const text = S.view.state.doc.toString();
  const { words, chars } = docStats(text);
  $('#stat-words').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  $('#stat-chars').textContent = `${chars} ${chars === 1 ? 'character' : 'characters'}`;
  const mode = [];
  if (S.sourceMode) mode.push('Source');
  if (S.focusMode) mode.push('Focus');
  if (S.typewriterMode) mode.push('Typewriter');
  $('#stat-mode').textContent = mode.join(' · ');
  updateSelectionStat(S.view.state);
}

// "n words selected" next to the document count while there is a selection.
function updateSelectionStat(state) {
  const sel = state.selection.main;
  const el = $('#stat-sel');
  if (sel.empty) {
    el.hidden = true;
  } else {
    const c = countText(state.sliceDoc(sel.from, sel.to));
    el.textContent = `(${c.words} ${c.words === 1 ? 'word' : 'words'}, ${c.chars} chars selected)`;
    el.hidden = false;
  }
  if (!$('#wordcount').hidden) renderWordCount();
}

function updateCursor(state) {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  $('#stat-cursor').textContent = `Ln ${line.number}, Col ${head - line.from + 1}`;
  updateSelectionStat(state);
  highlightCurrentHeading();
}

// Word count panel (click the count in the status bar, or Ctrl+Shift+W).
function renderWordCount() {
  const host = $('#wordcount');
  const state = S.view.state;
  const all = countText(state.doc.toString());
  const sel = state.selection.main;
  const selected = sel.empty ? null : countText(state.sliceDoc(sel.from, sel.to));
  const speed = Number(S.config.readingSpeed) || 275;
  const row = (label, value) => `<div class="wc-row"><span>${label}</span><b>${value}</b></div>`;
  const block = (title, c) =>
    `<div class="wc-title">${title}</div>` +
    row('Words', c.words.toLocaleString()) +
    row('Characters', c.chars.toLocaleString()) +
    row('Characters (with spaces)', c.charsWithSpaces.toLocaleString()) +
    row('Lines', c.lines.toLocaleString()) +
    row('Paragraphs', c.paragraphs.toLocaleString()) +
    row('Reading time', formatReadingTime(readingTime(c, speed)));
  host.innerHTML =
    block('Document', all) +
    (selected ? `<div class="wc-section">${block('Selection', selected)}</div>` : '') +
    `<div class="wc-section">${row('Reading speed', `${speed} words/min`)}</div>`;
}

function toggleWordCount(force) {
  const host = $('#wordcount');
  const show = force === undefined ? host.hidden : !!force;
  host.hidden = !show;
  $('#stat-words').classList.toggle('on', show);
  if (show) renderWordCount();
}

// The matched part of a heading is highlighted while the filter box has text.
function renderMatch(el, text, query) {
  const q = String(query || '').trim().toLowerCase();
  el.textContent = '';
  if (!q) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (const w of words) {
      if (lower.startsWith(w, i) && (!hit || w.length > hit.length)) hit = w;
    }
    if (hit) {
      const m = document.createElement('mark');
      m.textContent = text.slice(i, i + hit.length);
      el.appendChild(m);
      i += hit.length;
    } else {
      const next = Math.min(...words.map((w) => (lower.indexOf(w, i + 1) + 1 || text.length + 1) - 1), text.length);
      el.appendChild(document.createTextNode(text.slice(i, Math.max(i + 1, next))));
      i = Math.max(i + 1, next);
    }
  }
}

function renderOutline() {
  const { headings } = scanBlocks(S.view.state.doc);
  S.outline = headings;
  S.outlineKeys = outlineKeys(headings);
  const host = $('#outline');
  host.innerHTML = '';
  if (!headings.length) {
    host.innerHTML = '<div class="empty-hint">Outline is empty</div>';
    S.currentHeading = -1;
    return;
  }
  const query = S.outlineQuery.trim();
  const flat = !!S.config.outlineFlat || !!query;
  const minLevel = Math.min(...headings.map((h) => h.level));
  const hasMatch = (node) => outlineMatches(node.text, query) || node.children.some(hasMatch);
  const frag = document.createDocumentFragment();
  const addRow = (node, depth) => {
    const key = S.outlineKeys[node.index];
    const collapsed = !flat && S.outlineCollapsed.has(key);
    const row = document.createElement('div');
    row.className = `outline-item level-${node.level}`;
    row.dataset.index = String(node.index);
    row.style.paddingLeft = `${(flat ? node.level - minLevel : depth) * 14 + 8}px`;
    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = !flat && node.children.length ? (collapsed ? '▸' : '▾') : '';
    const text = document.createElement('span');
    text.className = 'outline-text';
    renderMatch(text, node.text || '(untitled)', query);
    row.title = node.text;
    row.append(twisty, text);
    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOutlineCollapse(key);
    });
    row.addEventListener('click', () => {
      S.view.dispatch({
        selection: { anchor: node.from },
        effects: EditorView.scrollIntoView(node.from, { y: 'start', yMargin: 40 }),
      });
      S.view.focus();
    });
    frag.appendChild(row);
    if (!collapsed) for (const c of node.children) if (!query || hasMatch(c)) addRow(c, depth + 1);
  };
  for (const node of buildOutlineTree(headings)) if (!query || hasMatch(node)) addRow(node, 0);
  if (!frag.childElementCount) host.innerHTML = '<div class="empty-hint">No matching headings</div>';
  else host.appendChild(frag);
  highlightCurrentHeading(true);
}

function toggleOutlineCollapse(key) {
  if (S.outlineCollapsed.has(key)) S.outlineCollapsed.delete(key);
  else S.outlineCollapsed.add(key);
  renderOutline();
  if (S.path) {
    const all = { ...(S.config.outlineCollapsed || {}) };
    const k = norm(S.path);
    if (S.outlineCollapsed.size) all[k] = [...S.outlineCollapsed];
    else delete all[k];
    // keep the map from growing without bound
    const keys = Object.keys(all);
    for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete all[old];
    window.ink.setConfig({ outlineCollapsed: all });
  }
}

// The heading the caret is under gets a marker; if it is folded away, its nearest
// visible ancestor does.
function highlightCurrentHeading(force) {
  if (!S.view) return;
  const idx = currentHeadingIndex(S.outline, S.view.state.selection.main.head);
  if (!force && idx === S.currentHeading) return;
  S.currentHeading = idx;
  const rows = [...$('#outline').querySelectorAll('.outline-item')];
  let best = null;
  for (const el of rows) {
    const i = Number(el.dataset.index);
    if (i <= idx && (!best || i > Number(best.dataset.index))) best = el;
  }
  for (const el of rows) el.classList.toggle('current', el === best);
  if (best && !$('#panel-outline').hidden) best.scrollIntoView({ block: 'nearest' });
}

const scheduleOutline = debounce(renderOutline, 250);

const norm = (p) => (p ? String(p).replace(/\\/g, '/') : '');
const samePath = (a, b) => !!a && !!b && norm(a).toLowerCase() === norm(b).toLowerCase();
const underPath = (child, parent) => {
  if (!child || !parent) return false;
  const c = norm(child).toLowerCase();
  const p = norm(parent).toLowerCase().replace(/\/+$/, '');
  return c === p || c.startsWith(p + '/');
};

function highlightTreeSelection() {
  document.querySelectorAll('.tree-item.file, .list-item').forEach((el) => {
    el.classList.toggle('active', samePath(el.dataset.path, S.path));
  });
}

// ---------------------------------------------------------------------------
// context menu (tree rows, sidebar background)
// ---------------------------------------------------------------------------
function closeCtxMenu() {
  document.querySelectorAll('.ctx-menu').forEach((el) => el.remove());
}

function openCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  for (const it of items) {
    if (it === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'ctx-item' + (it.danger ? ' danger' : '');
    const span = document.createElement('span');
    span.textContent = it.label;
    b.appendChild(span);
    if (it.hint) {
      const k = document.createElement('span');
      k.className = 'ctx-key';
      k.textContent = it.hint;
      b.appendChild(k);
    }
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      closeCtxMenu();
      await it.run();
    });
    menu.appendChild(b);
  }
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  if (r.right > innerWidth - 8) menu.style.left = `${Math.max(8, innerWidth - r.width - 8)}px`;
  if (r.bottom > innerHeight - 8) menu.style.top = `${Math.max(8, innerHeight - r.height - 8)}px`;
  return menu;
}

function treeRowFor(p) {
  return [...document.querySelectorAll('.tree-item')].find((el) => samePath(el.dataset.path, p)) || null;
}

// Expand the tree down to `dir` so a freshly created item is visible.
async function expandTo(dir) {
  if (!S.folder || !dir || samePath(dir, S.folder)) return;
  const rel = norm(dir).slice(norm(S.folder).length).replace(/^\/+/, '');
  if (!rel) return;
  let acc = S.folder;
  for (const seg of rel.split('/')) {
    acc = `${acc}/${seg}`;
    const row = treeRowFor(acc);
    if (!row) return;
    const children = row.nextElementSibling;
    if (children && children.classList.contains('tree-children') && children.hidden) row.click();
    await new Promise((r) => setTimeout(r, 60));
  }
}

async function startRename(target) {
  const row = target.row;
  if (!row) return;
  const label = row.querySelector('.tree-label');
  if (!label || row.querySelector('.tree-rename')) return;
  const full = basename(target.path);
  const dot = target.dir ? -1 : full.lastIndexOf('.');
  const stem = dot > 0 ? full.slice(0, dot) : full;
  const ext = dot > 0 ? full.slice(dot) : '';

  const input = document.createElement('input');
  input.className = 'tree-rename';
  input.value = stem;
  input.spellcheck = false;
  label.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (input.isConnected) input.replaceWith(label);
    if (!commit || !value || value === stem) return;
    const next = ext && !value.includes('.') ? value + ext : value;
    const res = await window.ink.renamePath(target.path, next);
    if (!res) {
      flashMessage('Name cannot be empty');
      return;
    }
    if (res.error === 'exists') {
      flashMessage(`${next} already exists`);
      return;
    }
    followPathChange(target.path, res);
    pushFileOp({ kind: 'rename', from: target.path, to: res });
    await refreshTree();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

async function deleteTarget(target) {
  const res = await window.ink.confirm({
    message: `Move \u201c${basename(target.path)}\u201d to the recycle bin?`,
    detail: target.path,
    buttons: ['Move to Trash', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (res !== 0) return;
  const gone = await window.ink.deletePath(target.path);
  if (!gone) return;
  if (S.path && underPath(S.path, target.path)) await newDocument();
  await refreshTree();
}

// ---------------------------------------------------------------------------
// file operations: move (drag and drop), duplicate, undo
// ---------------------------------------------------------------------------
function pushFileOp(op) {
  S.fileOps.push(op);
  if (S.fileOps.length > 30) S.fileOps.shift();
}

async function moveItem(src, destDir) {
  if (!src || !destDir || samePath(dirOf(src), destDir) || samePath(src, destDir)) return false;
  const res = await window.ink.movePath(src, destDir);
  if (!res) return false;
  if (res.error === 'exists') {
    flashMessage(`${basename(src)} already exists in ${basename(destDir)}`);
    return false;
  }
  if (res.error === 'inside') {
    flashMessage('A folder cannot be moved into itself');
    return false;
  }
  followPathChange(src, res);
  pushFileOp({ kind: 'move', from: src, to: res });
  S.expanded.add(norm(destDir).toLowerCase());
  await refreshTree();
  flashMessage(`Moved ${basename(src)} to ${basename(destDir)}/`);
  return true;
}

async function duplicateTarget(target) {
  const res = await window.ink.duplicatePath(target.path);
  if (!res) return;
  pushFileOp({ kind: 'create', path: res });
  await refreshTree();
  const row = treeRowFor(res);
  if (row) {
    document.querySelectorAll('.tree-item.sel').forEach((el) => el.classList.remove('sel'));
    row.classList.add('sel');
    S.treeSel = { row, path: res, dir: target.dir };
  }
  flashMessage(`Duplicated as ${basename(res)}`);
}

// Undo the last rename / move / duplicate / new file: the inverse operation, or the
// recycle bin for things that were created.
async function undoFileOp() {
  const op = S.fileOps.pop();
  if (!op) {
    flashMessage('No file operation to undo');
    return;
  }
  if (op.kind === 'rename' || op.kind === 'move') {
    const res = op.kind === 'rename' ? await window.ink.renamePath(op.to, basename(op.from)) : await window.ink.movePath(op.to, dirOf(op.from));
    if (!res || res.error) {
      flashMessage(`Could not undo: ${res && res.error === 'exists' ? 'the old name is taken' : 'the file is gone'}`);
      return;
    }
    followPathChange(op.to, res);
    flashMessage(`Undid ${op.kind}: ${basename(op.from)}`);
  } else if (op.kind === 'create') {
    if (S.path && underPath(S.path, op.path)) {
      await newDocument();
      if (S.path && underPath(S.path, op.path)) {
        S.fileOps.push(op); // the switch was cancelled
        return;
      }
    }
    if (!(await window.ink.deletePath(op.path))) {
      flashMessage('Nothing to undo: it was already removed');
    } else flashMessage(`Removed ${basename(op.path)} (moved to the recycle bin)`);
  }
  await refreshTree();
}

async function createItemIn(dir, kind, { rename = true } = {}) {
  const extRaw = String(S.config.defaultExtension || 'md').trim().replace(/^\.+/, '');
  const ext = `.${extRaw || 'md'}`;
  const base = kind === 'dir' ? 'New Folder' : `Untitled${ext}`;
  const p = kind === 'dir' ? await window.ink.makeDir(dir, base) : await window.ink.createFile(dir, base);
  pushFileOp({ kind: 'create', path: p });
  await refreshTree();
  await expandTo(dir);
  const row = treeRowFor(p);
  if (kind === 'file') await openPath(p);
  if (row && rename) await startRename({ row, path: p, dir: kind === 'dir' });
  else if (row) row.classList.add('active');
  return p;
}

function treeMenuItems(target) {
  const dir = target && target.dir ? target.path : dirOf(target ? target.path : S.folder) || S.folder;
  const items = [
    { label: 'New File', run: () => createItemIn(dir, 'file') },
    { label: 'New Folder', run: () => createItemIn(dir, 'dir') },
    '-',
    { label: 'Rename', hint: 'F2', run: () => startRename(target) },
    { label: 'Duplicate', hint: 'Ctrl+D', run: () => duplicateTarget(target) },
    { label: 'Move to Trash', hint: 'Del', danger: true, run: () => deleteTarget(target) },
    '-',
    { label: 'Undo Last File Operation', hint: 'Ctrl+Z', run: () => undoFileOp() },
    '-',
    { label: 'Reveal in File Explorer', run: () => window.ink.reveal(target.path) },
    {
      label: 'Copy Path',
      run: async () => {
        await window.ink.clipboardWrite(target.path);
        flashMessage('Path copied');
      },
    },
  ];
  return items;
}

// Sort order / hidden files / file types for the sidebar (the ⋯ button and the background menu).
function treeViewMenuItems() {
  const setTree = async (patch) => {
    S.config = await window.ink.setConfig(patch);
    await refreshTree();
  };
  const sort = S.config.treeSort || 'natural';
  const check = (on) => (on ? '✓' : '');
  const pinned = isPinned(S.folder);
  return [
    { label: 'Show as Tree', hint: check(S.filesView !== 'list'), run: () => setFilesView('tree', { persist: true }) },
    { label: 'Show as List', hint: check(S.filesView === 'list'), run: () => setFilesView('list', { persist: true }) },
    '-',
    { label: pinned ? 'Unpin This Folder' : 'Pin This Folder', hint: pinned ? '📌' : '', run: () => togglePinFolder(S.folder) },
    { label: 'Undo Last File Operation', hint: 'Ctrl+Z', run: () => undoFileOp() },
    '-',
    { label: 'Sort by Name', hint: check(sort === 'name'), run: () => setTree({ treeSort: 'name' }) },
    { label: 'Sort Naturally', hint: check(sort === 'natural'), run: () => setTree({ treeSort: 'natural' }) },
    { label: 'Sort by Modified Date', hint: check(sort === 'mtime'), run: () => setTree({ treeSort: 'mtime' }) },
    { label: 'Sort by Created Date', hint: check(sort === 'ctime'), run: () => setTree({ treeSort: 'ctime' }) },
    { label: 'Descending', hint: check(S.config.treeSortDesc), run: () => setTree({ treeSortDesc: !S.config.treeSortDesc }) },
    '-',
    { label: 'Show Hidden Files', hint: check(S.config.treeShowHidden), run: () => setTree({ treeShowHidden: !S.config.treeShowHidden }) },
    { label: 'Show All File Types', hint: check(S.config.treeShowAllFiles), run: () => setTree({ treeShowAllFiles: !S.config.treeShowAllFiles }) },
    '-',
    { label: 'Refresh', run: () => refreshTree() },
  ];
}

function wireTree() {
  const host = $('#filetree');
  host.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.tree-item');
    e.preventDefault();
    if (row) {
      document.querySelectorAll('.tree-item.sel').forEach((el) => el.classList.remove('sel'));
      row.classList.add('sel');
      S.treeSel = { row, path: row.dataset.path, dir: row.classList.contains('dir') };
      openCtxMenu(e.clientX, e.clientY, treeMenuItems(S.treeSel));
    } else if (S.folder) {
      S.treeSel = null;
      openCtxMenu(e.clientX, e.clientY, [
        { label: 'New File', run: () => createItemIn(S.folder, 'file') },
        { label: 'New Folder', run: () => createItemIn(S.folder, 'dir') },
        '-',
        { label: 'Reveal Folder', run: () => window.ink.reveal(S.folder) },
        '-',
        ...treeViewMenuItems(),
      ]);
    }
  });

  $('#btn-tree-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openCtxMenu(r.left, r.bottom + 2, treeViewMenuItems());
  });

  host.addEventListener('click', (e) => {
    if (!e.target.closest('.ctx-menu')) closeCtxMenu();
    const row = e.target.closest('.tree-item');
    selectTreeRow(row);
  });

  // keyboard: arrows walk the visible rows, Right/Left expand and collapse, Enter opens
  host.addEventListener('keydown', (e) => {
    if (e.target !== host) return;
    const rows = visibleTreeRows();
    if (!rows.length) return;
    const cur = S.treeSel && S.treeSel.row.isConnected ? S.treeSel.row : null;
    const idx = cur ? rows.indexOf(cur) : -1;
    const go = (i) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
      selectTreeRow(row);
      row.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go(idx < 0 ? 0 : idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(rows.length - 1);
    } else if (e.key === 'ArrowRight' && cur) {
      e.preventDefault();
      if (cur.classList.contains('dir')) {
        const children = cur.nextElementSibling;
        if (children && children.hidden) cur.click();
        else go(idx + 1);
      }
    } else if (e.key === 'ArrowLeft' && cur) {
      e.preventDefault();
      const children = cur.classList.contains('dir') ? cur.nextElementSibling : null;
      if (children && !children.hidden) cur.click();
      else {
        const parent = cur.parentElement.classList.contains('tree-children') ? cur.parentElement.previousElementSibling : null;
        if (parent) selectTreeRow(parent);
      }
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      cur.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoFileOp();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && cur) {
      e.preventDefault();
      duplicateTarget(S.treeSel);
    }
  });

  // drag a row onto a folder (or the empty area below the tree for the root) to move it
  host.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.tree-item');
    if (!row) return;
    e.dataTransfer.setData('text/x-posemark-path', row.dataset.path);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  host.addEventListener('dragend', (e) => {
    const row = e.target.closest('.tree-item');
    if (row) row.classList.remove('dragging');
    clearDropMarks();
  });
  const dropDirFor = (e) => {
    const row = e.target.closest('.tree-item');
    if (!row) return { dir: S.folder, row: null };
    return row.classList.contains('dir') ? { dir: row.dataset.path, row } : { dir: dirOf(row.dataset.path), row: null };
  };
  host.addEventListener('dragover', (e) => {
    if (!S.folder || ![...e.dataTransfer.types].includes('text/x-posemark-path')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const { row } = dropDirFor(e);
    clearDropMarks();
    if (row) row.classList.add('drop-target');
    else host.classList.add('drop-root');
  });
  host.addEventListener('dragleave', (e) => {
    if (!host.contains(e.relatedTarget)) clearDropMarks();
  });
  host.addEventListener('drop', async (e) => {
    const src = e.dataTransfer.getData('text/x-posemark-path');
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    clearDropMarks();
    const { dir } = dropDirFor(e);
    if (dir) await moveItem(src, dir);
  });

  document.addEventListener('keydown', (e) => {
    if (!S.treeSel || !S.treeSel.row.isConnected) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
    if (e.key === 'F2') {
      e.preventDefault();
      startRename(S.treeSel);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteTarget(S.treeSel);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ctx-menu') && !e.target.closest('.tree-item')) closeCtxMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtxMenu();
  });
}

function clearDropMarks() {
  document.querySelectorAll('.tree-item.drop-target').forEach((el) => el.classList.remove('drop-target'));
  $('#filetree').classList.remove('drop-root');
}

function visibleTreeRows() {
  return [...$('#filetree').querySelectorAll('.tree-item')].filter((el) => el.offsetParent !== null);
}

function selectTreeRow(row) {
  document.querySelectorAll('.tree-item.sel').forEach((el) => el.classList.remove('sel'));
  if (!row) {
    S.treeSel = null;
    return;
  }
  row.classList.add('sel');
  S.treeSel = { row, path: row.dataset.path, dir: row.classList.contains('dir') };
}

// ---------------------------------------------------------------------------
// pinned folders (Open Recent, Quick Open)
// ---------------------------------------------------------------------------
const isPinned = (dir) => !!dir && (S.config.pinnedFolders || []).some((p) => samePath(p, dir));

async function togglePinFolder(dir) {
  if (!dir) return;
  const list = (S.config.pinnedFolders || []).filter((p) => !samePath(p, dir));
  if (!isPinned(dir)) list.unshift(dir);
  S.config = await window.ink.setConfig({ pinnedFolders: list.slice(0, 12) });
  flashMessage(isPinned(dir) ? `Pinned ${basename(dir)}` : `Unpinned ${basename(dir)}`);
}

// ---------------------------------------------------------------------------
// file tree / file list
// ---------------------------------------------------------------------------
async function setFolder(dir, { persist = true } = {}) {
  if (!samePath(dir, S.folder)) S.expanded = new Set();
  S.folder = dir;
  S.treeCache.clear();
  $('#folder-name').textContent = dir ? basename(dir) : 'No folder opened';
  $('#folder-name').title = dir || '';
  $('#btn-tree-menu').hidden = !dir;
  $('#btn-files-view').hidden = !dir;
  if (persist && dir) await window.ink.setConfig({ lastFolder: dir });
  window.ink.watchFolder(dir || null);
  renderFiles();
}

// Files panel: the tree, or the flat "articles" list of every note newest first.
function setFilesView(view, { persist = false } = {}) {
  S.filesView = view === 'list' ? 'list' : 'tree';
  $('#filetree').hidden = S.filesView !== 'tree';
  $('#filelist').hidden = S.filesView !== 'list';
  const btn = $('#btn-files-view');
  btn.classList.toggle('on', S.filesView === 'list');
  btn.title = S.filesView === 'list' ? 'Show as tree' : 'Show as list (all notes, newest first)';
  if (persist) window.ink.setConfig({ filesView: S.filesView });
  renderFiles();
}

function renderFiles() {
  return S.filesView === 'list' ? renderList() : renderTree();
}

async function renderList() {
  const host = $('#filelist');
  host.innerHTML = '';
  if (!S.folder) {
    host.innerHTML = '<div class="empty-hint">Open a folder to browse notes</div>';
    return;
  }
  const files = await window.ink.listFiles(S.folder);
  S.listCache = files;
  if (!files.length) {
    host.innerHTML = '<div class="empty-hint">No Markdown files in this folder</div>';
    return;
  }
  const root = norm(S.folder);
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.dataset.path = f.path;
    const name = document.createElement('div');
    name.className = 'list-name';
    name.textContent = f.name;
    const meta = document.createElement('div');
    meta.className = 'list-meta';
    const dir = document.createElement('span');
    dir.className = 'list-dir';
    const rel = norm(f.path).slice(root.length).replace(/^\/+/, '');
    dir.textContent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const date = document.createElement('span');
    date.className = 'list-date';
    date.textContent = fmtWhen(f.mtime);
    meta.append(dir, date);
    row.append(name, meta);
    row.title = f.path;
    row.addEventListener('click', () => {
      document.querySelectorAll('.list-item.sel').forEach((el) => el.classList.remove('sel'));
      row.classList.add('sel');
      S.treeSel = { row, path: f.path, dir: false };
      openPath(f.path);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.list-item.sel').forEach((el) => el.classList.remove('sel'));
      row.classList.add('sel');
      S.treeSel = { row, path: f.path, dir: false };
      openCtxMenu(e.clientX, e.clientY, treeMenuItems(S.treeSel));
    });
    host.appendChild(row);
  }
  highlightTreeSelection();
}

function wireList() {
  const host = $('#filelist');
  host.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.list-item') || !S.folder) return;
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY, [
      { label: 'New File', run: () => createItemIn(S.folder, 'file') },
      '-',
      ...treeViewMenuItems(),
    ]);
  });
  host.addEventListener('keydown', (e) => {
    if (e.target !== host) return;
    const rows = [...host.querySelectorAll('.list-item')];
    if (!rows.length) return;
    const cur = rows.find((el) => el.classList.contains('sel'));
    const idx = cur ? rows.indexOf(cur) : -1;
    const go = (i) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
      rows.forEach((el) => el.classList.remove('sel'));
      row.classList.add('sel');
      S.treeSel = { row, path: row.dataset.path, dir: false };
      row.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go(idx < 0 ? 0 : idx - 1);
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      openPath(cur.dataset.path);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoFileOp();
    }
  });
}

// The folder watcher in the main process: refresh the tree, and pick up external edits
// to the open file.
const scheduleTreeRefresh = debounce(() => refreshTree(), 250);
function onTreeChanged({ paths = [] } = {}) {
  scheduleTreeRefresh();
  if (S.path && paths.some((p) => samePath(p, S.path) || samePath(p, dirOf(S.path)))) checkExternalChange();
}

async function renderTree() {
  const host = $('#filetree');
  host.innerHTML = '';
  if (!S.folder) {
    host.innerHTML = '<div class="empty-hint">Open a folder to browse notes</div>';
    return;
  }
  const root = document.createElement('div');
  root.className = 'tree-root';
  host.appendChild(root);
  await fillTree(S.folder, root, 0);
  highlightTreeSelection();
}

async function fillTree(dir, container, depth) {
  let entries = S.treeCache.get(dir);
  if (!entries) {
    entries = await window.ink.readDir(dir);
    S.treeCache.set(dir, entries);
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = `tree-item ${entry.dir ? 'dir' : 'file'}${entry.markdown === false ? ' other' : ''}`;
    row.dataset.path = entry.path;
    row.draggable = true;
    row.style.paddingLeft = `${depth * 12 + 10}px`;
    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = entry.dir ? '▸' : '';
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = entry.name;
    row.append(twisty, label);
    container.appendChild(row);

    if (entry.dir) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      children.hidden = true;
      container.appendChild(children);
      const open = async () => {
        children.hidden = false;
        twisty.textContent = '▾';
        S.expanded.add(norm(entry.path).toLowerCase());
        if (!children.dataset.loaded) {
          children.dataset.loaded = '1';
          await fillTree(entry.path, children, depth + 1);
          highlightTreeSelection();
        }
      };
      row.addEventListener('click', async () => {
        if (!children.hidden) {
          children.hidden = true;
          twisty.textContent = '▸';
          S.expanded.delete(norm(entry.path).toLowerCase());
          return;
        }
        await open();
      });
      // folders that were open before a refresh stay open
      if (S.expanded.has(norm(entry.path).toLowerCase())) await open();
    } else if (entry.markdown === false) {
      // non-Markdown files (when "show all file types" is on) open in their own app
      row.title = 'Open with the default application';
      row.addEventListener('click', () => window.ink.openPath(entry.path));
    } else {
      row.addEventListener('click', () => openPath(entry.path));
    }
  }
}

async function refreshTree() {
  S.treeCache.clear();
  await renderFiles();
}

async function createNote() {
  if (!S.folder) {
    const dir = await window.ink.openFolderDialog();
    if (!dir) return;
    await setFolder(dir);
  }
  const p = await window.ink.createFile(S.folder, 'Untitled.md');
  await refreshTree();
  await openPath(p);
}

// ---------------------------------------------------------------------------
// quick open
// ---------------------------------------------------------------------------
let quickItems = [];

// Quick Open lists pinned folders first, then every note in the folder, then recent files
// from elsewhere.
async function openQuickOpen() {
  const modal = $('#quick-open');
  modal.hidden = false;
  const input = $('#quick-open-input');
  input.value = '';
  input.focus();
  const list = $('#quick-open-list');
  list.innerHTML = '';
  const files = S.folder ? await window.ink.walk(S.folder) : [];
  const inFolder = new Set(files.map((p) => norm(p).toLowerCase()));
  quickItems = [
    ...(S.config.pinnedFolders || []).map((p) => ({ p, kind: 'folder', name: basename(p) || p })),
    ...files.map((p) => ({ p, kind: 'file', name: basename(p) })),
    ...(S.config.recentFiles || []).filter((p) => !inFolder.has(norm(p).toLowerCase())).map((p) => ({ p, kind: 'recent', name: basename(p) })),
  ];
  renderQuickList('');
}

function renderQuickList(query) {
  const list = $('#quick-open-list');
  const q = query.trim().toLowerCase();
  const matches = quickItems.filter((x) => !q || x.p.toLowerCase().includes(q) || x.name.toLowerCase().includes(q)).slice(0, 60);
  list.innerHTML = '';
  if (!matches.length) {
    list.innerHTML = `<div class="empty-hint">${S.folder ? 'No matches' : 'Open a folder first'}</div>`;
    return;
  }
  matches.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'quick-item' + (i === 0 ? ' active' : '');
    row.innerHTML = `<span class="quick-name"></span><span class="quick-path"></span><span class="quick-badge"></span>`;
    row.querySelector('.quick-name').textContent = m.name;
    row.querySelector('.quick-path').textContent = m.kind === 'folder' ? m.p : dirOf(m.p) || '';
    row.querySelector('.quick-badge').textContent = m.kind === 'folder' ? '📌 folder' : m.kind === 'recent' ? 'recent' : '';
    row.addEventListener('click', () => {
      $('#quick-open').hidden = true;
      if (m.kind === 'folder') setFolder(m.p);
      else openPath(m.p);
    });
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// search across the folder (sidebar › Search, Ctrl+Shift+F)
// ---------------------------------------------------------------------------
function openSearchPanel(prefill) {
  document.body.classList.remove('hide-sidebar');
  switchTab('search');
  const input = $('#search-input');
  if (prefill) input.value = prefill;
  input.focus();
  input.select();
}

async function runSearch() {
  const input = $('#search-input');
  const query = input.value;
  S.search.query = query;
  const host = $('#search-results');
  if (!S.folder) {
    host.innerHTML = '<div class="empty-hint">Open a folder first</div>';
    return;
  }
  if (!query.trim()) {
    host.innerHTML = '';
    $('#search-summary').textContent = '';
    return;
  }
  $('#search-summary').textContent = 'Searching…';
  const res = await window.ink.searchFolder({
    dir: S.folder,
    query,
    caseSensitive: S.search.caseSensitive,
    wholeWord: S.search.wholeWord,
    regex: S.search.regex,
  });
  if (query !== $('#search-input').value) return; // a newer search is on its way
  S.search.results = res;
  renderSearchResults(res);
}

function renderSearchResults(res) {
  const host = $('#search-results');
  const summary = $('#search-summary');
  host.innerHTML = '';
  if (res.error) {
    summary.textContent = '';
    host.innerHTML = `<div class="empty-hint">Invalid pattern: ${escapeHtml(res.error)}</div>`;
    return;
  }
  const n = res.results.length;
  summary.textContent = n
    ? `${n}${res.truncated ? '+' : ''} result${n === 1 ? '' : 's'} in ${res.files} file${res.files === 1 ? '' : 's'}`
    : `No results in ${res.scanned} file${res.scanned === 1 ? '' : 's'}`;
  if (!n) return;
  let currentFile = null;
  let group = null;
  for (const hit of res.results) {
    if (!samePath(hit.path, currentFile)) {
      currentFile = hit.path;
      group = document.createElement('div');
      group.className = 'search-group';
      const head = document.createElement('div');
      head.className = 'search-file';
      const name = document.createElement('span');
      name.className = 'search-file-name';
      name.textContent = basename(hit.path);
      const dir = document.createElement('span');
      dir.className = 'search-file-dir';
      const rel = norm(hit.path).slice(norm(S.folder).length).replace(/^\/+/, '');
      dir.textContent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      head.append(name, dir);
      head.addEventListener('click', () => group.classList.toggle('collapsed'));
      group.appendChild(head);
      host.appendChild(group);
    }
    const row = document.createElement('div');
    row.className = 'search-hit';
    const ln = document.createElement('span');
    ln.className = 'search-line';
    ln.textContent = String(hit.line);
    const text = document.createElement('span');
    text.className = 'search-text';
    const mark = document.createElement('mark');
    mark.textContent = hit.match;
    text.append(document.createTextNode(hit.before), mark, document.createTextNode(hit.after));
    row.append(ln, text);
    row.addEventListener('click', () => openSearchHit(hit));
    group.appendChild(row);
  }
}

async function openSearchHit(hit) {
  if (!samePath(hit.path, S.path)) {
    await openPath(hit.path);
    if (!samePath(hit.path, S.path)) return; // the switch was cancelled
  }
  const view = S.view;
  const doc = view.state.doc;
  if (hit.line < 1 || hit.line > doc.lines) return;
  const line = doc.line(hit.line);
  const anchor = Math.min(line.from + hit.col, line.to);
  const head = Math.min(anchor + hit.len, line.to);
  view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
  });
  view.focus();
}

function wireSearch() {
  const input = $('#search-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    } else if (e.key === 'Escape') {
      input.blur();
      S.view.focus();
    }
  });
  input.addEventListener('input', debounce(() => runSearch(), 350));
  for (const btn of document.querySelectorAll('.search-opt')) {
    const key = btn.dataset.opt;
    btn.classList.toggle('on', !!S.search[key]);
    btn.addEventListener('click', () => {
      S.search[key] = !S.search[key];
      btn.classList.toggle('on', S.search[key]);
      runSearch();
    });
  }
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function quickKeyboard(e) {
  const list = $('#quick-open-list');
  const items = [...list.querySelectorAll('.quick-item')];
  if (!items.length) return;
  const idx = items.findIndex((el) => el.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((el) => el.classList.remove('active'));
    items[next].classList.add('active');
    items[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    (items[idx] || items[0]).click();
  } else if (e.key === 'Escape') {
    $('#quick-open').hidden = true;
  }
}

// ---------------------------------------------------------------------------
// preferences
// ---------------------------------------------------------------------------
const PREF_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    groups: [
      {
        title: 'Startup',
        fields: [
          {
            key: 'launchAction',
            label: 'On launch',
            type: 'select',
            hint: 'A file passed on the command line always wins',
            options: [
              ['new', 'Start with a new document'],
              ['folder', 'Restore the last folder'],
              ['file', 'Restore the last file and folder'],
              ['fixed', 'Open a fixed folder'],
            ],
          },
          { key: 'launchFolder', label: 'Fixed folder', type: 'folder', hint: 'Used by "Open a fixed folder"' },
        ],
      },
      {
        title: 'Saving',
        fields: [
          { key: 'autoSave', label: 'Auto save', type: 'bool', hint: 'Save the current file shortly after you stop typing' },
          { key: 'confirmOnClose', label: 'Ask before closing with unsaved changes', type: 'bool' },
          {
            key: 'recoverDrafts',
            label: 'Unsaved drafts',
            type: 'button',
            text: 'Recover…',
            hint: 'Unsaved documents are backed up a moment after each edit; recover them here or from File › Recover Unsaved Drafts',
            run: () => openDrafts(),
          },
        ],
      },
      {
        title: 'Files',
        fields: [
          { key: 'defaultExtension', label: 'Default file extension', type: 'text', hint: 'Used for new files and Save As' },
          {
            key: 'reloadOnExternalChange',
            label: 'Reload the open file when it changes on disk',
            type: 'bool',
            hint: 'Only while it has no unsaved edits',
          },
          {
            key: 'recordRecent',
            label: 'Record recently opened files and folders',
            type: 'bool',
            hint: 'Off: Open Recent and Quick Open stop collecting history (pinned folders stay)',
          },
          { key: 'readingSpeed', label: 'Reading speed (words per minute)', type: 'number', min: 100, max: 1000, hint: 'For the reading time in the word count panel' },
        ],
      },
      {
        title: 'File tree',
        fields: [
          {
            key: 'treeSort',
            label: 'Sort files',
            type: 'select',
            options: [['natural', 'Naturally (1, 2, 10)'], ['name', 'By name'], ['mtime', 'By modified date'], ['ctime', 'By created date']],
          },
          { key: 'treeSortDesc', label: 'Descending order', type: 'bool' },
          { key: 'treeShowHidden', label: 'Show hidden files and folders', type: 'bool' },
          { key: 'treeShowAllFiles', label: 'Show all file types', type: 'bool', hint: 'Other files open in their default application' },
        ],
      },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    groups: [
      {
        title: 'Theme',
        fields: [
          { key: 'theme', label: 'Theme', type: 'theme', hint: 'While following the system: the theme for light mode' },
          { key: 'themeFollowSystem', label: 'Follow the system dark mode', type: 'bool', hint: 'Switch between the two themes below with the OS appearance' },
          { key: 'themeDark', label: 'Dark theme', type: 'theme', hint: 'Used while the system is in dark mode' },
          {
            key: 'themeFolder',
            label: 'Custom CSS',
            type: 'button',
            text: 'Open Theme Folder',
            hint: 'base.user.css applies to every theme, <theme>.user.css to one; a whole <name>.css becomes a theme',
            run: async () => {
              await window.ink.openThemeFolder();
              flashMessage('Edits apply when the theme is re-selected or the window is reloaded (Ctrl+R)');
            },
          },
        ],
      },
      {
        title: 'Layout',
        fields: [
          { key: 'fontSize', label: 'Editor font size (px)', type: 'number', min: 11, max: 30 },
          { key: 'lineWidth', label: 'Content width (px)', type: 'number', min: 500, max: 1400 },
        ],
      },
      {
        title: 'Window',
        fields: [
          { key: 'showSidebar', label: 'Show sidebar', type: 'bool' },
          { key: 'showStatusBar', label: 'Show status bar', type: 'bool' },
        ],
      },
      {
        title: 'Sidebar',
        fields: [
          {
            key: 'filesView',
            label: 'Files panel',
            type: 'select',
            options: [['tree', 'Folder tree'], ['list', 'File list (all notes, newest first)']],
          },
          { key: 'outlineFlat', label: 'Flat outline', type: 'bool', hint: 'Off: headings nest and can be collapsed' },
        ],
      },
    ],
  },
  {
    id: 'editor',
    label: 'Editor',
    groups: [
      {
        title: 'Typing',
        fields: [
          { key: 'smartTypography', label: 'Smart typography', type: 'bool', hint: '-- → —, ... → …, straight quotes → curly quotes' },
          { key: 'autoPairBrackets', label: 'Auto pair brackets and quotes', type: 'bool', hint: '( [ { and " \' — quotes only while smart typography is off' },
          {
            key: 'autoPairMarkdown',
            label: 'Auto pair Markdown syntax',
            type: 'bool',
            hint: '* _ ` $ close themselves; typing * ~ = ^ ` with a selection wraps it',
          },
          { key: 'emojiAutocomplete', label: 'Suggest emoji after typing :', type: 'bool' },
          { key: 'spellcheck', label: 'Spell check', type: 'bool' },
        ],
      },
      {
        title: 'Clipboard',
        fields: [
          {
            key: 'pasteHtmlAsMarkdown',
            label: 'Convert rich text to Markdown when pasting',
            type: 'bool',
            hint: 'Ctrl+Shift+V always pastes the plain text',
          },
        ],
      },
    ],
  },
  {
    id: 'markdown',
    label: 'Markdown',
    groups: [
      {
        title: 'Syntax',
        fields: [
          { key: 'inlineMath', label: 'Inline math ($…$)', type: 'bool' },
          { key: 'emoji', label: 'Emoji shortcodes (:smile:)', type: 'bool' },
          { key: 'githubAlerts', label: 'GitHub-style alerts', type: 'bool', hint: '> [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]' },
          {
            key: 'strictMode',
            label: 'Strict mode',
            type: 'bool',
            hint: 'Off: `#Title` without a space still counts as a heading',
          },
          {
            key: 'preserveLineBreaks',
            label: 'Preserve single line breaks on export',
            type: 'bool',
            hint: 'The editor always shows them; this keeps them in HTML, PDF and copies',
          },
        ],
      },
      {
        title: 'Code blocks',
        fields: [
          { key: 'lineNumbersInCode', label: 'Line numbers in code blocks', type: 'bool' },
          { key: 'codeWrap', label: 'Wrap long code lines', type: 'bool' },
        ],
      },
    ],
  },
  {
    id: 'export',
    label: 'Export',
    // the section itself is the WeChat style panel; the fields below serve search
    panel: true,
    groups: [
      {
        title: 'Copy for WeChat',
        fields: [
          {
            key: 'wechatTheme',
            label: 'Colour theme',
            type: 'select',
            hint: 'Dark themes are not offered — 公众号 shows articles on white',
            options: (themes) => [
              ['current', 'Follow editor theme'],
              ...themes.filter((t) => !t.dark).map((t) => [t.id, t.name]),
            ],
          },
          { key: 'wechatAccent', label: 'Accent colour', type: 'color', hint: 'Links, heading bars and footnote marks' },
          {
            key: 'wechatHeadingStyle',
            label: 'Level-2 heading style',
            type: 'select',
            options: [['bar', 'Left bar'], ['underline', 'Underline'], ['badge', 'Badge'], ['plain', 'Plain']],
          },
          {
            key: 'wechatFontSize',
            label: 'Body font size',
            type: 'select',
            hint: 'Headings scale with it',
            options: [14, 15, 16, 17, 18].map((n) => [n, `${n}px`]),
          },
          {
            key: 'wechatLineHeight',
            label: 'Line height',
            type: 'select',
            options: [[1.5, '1.5'], [1.6, '1.6'], [1.75, '1.75'], [1.9, '1.9'], [2, '2.0'], [2.2, '2.2']],
          },
          {
            key: 'wechatLetterSpacing',
            label: 'Letter spacing',
            type: 'select',
            options: [[0, 'None'], [0.02, 'Slight'], [0.05, 'Wide']],
          },
          {
            key: 'wechatParagraphSpacing',
            label: 'Paragraph spacing',
            type: 'select',
            options: [[12, 'Compact'], [16, 'Normal'], [24, 'Loose']],
          },
          { key: 'wechatJustify', label: 'Justify paragraphs', type: 'bool' },
          { key: 'wechatFirstLineIndent', label: 'Indent first line of paragraphs (2 字)', type: 'bool' },
          { key: 'wechatCodeLang', label: 'Show code block language label', type: 'bool' },
          { key: 'wechatLinkRefs', label: 'List link URLs at the end (参考链接)', type: 'bool', hint: 'Links cannot be clicked inside 公众号' },
        ],
      },
    ],
  },
];

let prefsSection = 'general';

function prefControl(field, themes) {
  let input;
  if (field.type === 'bool') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!S.config[field.key];
    input.addEventListener('change', () => setPref(field.key, input.checked));
  } else if (field.type === 'theme') {
    input = document.createElement('select');
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.user ? `${t.name} (user)` : t.name;
      opt.selected = t.id === S.config[field.key];
      input.appendChild(opt);
    }
    input.addEventListener('change', () => setPref(field.key, input.value));
  } else if (field.type === 'button') {
    input = document.createElement('button');
    input.className = 'pref-btn';
    input.textContent = field.text || field.label;
    input.addEventListener('click', (e) => {
      e.preventDefault();
      field.run();
    });
  } else if (field.type === 'folder') {
    input = document.createElement('span');
    input.className = 'pref-folder';
    const text = document.createElement('input');
    text.type = 'text';
    text.value = S.config[field.key] || '';
    text.placeholder = 'Choose a folder…';
    text.addEventListener('change', () => setPref(field.key, text.value.trim()));
    const browse = document.createElement('button');
    browse.className = 'pref-btn';
    browse.textContent = 'Browse…';
    browse.addEventListener('click', async (e) => {
      e.preventDefault();
      const dir = await window.ink.pickFolder(S.config[field.key] || S.folder || undefined);
      if (dir) {
        text.value = dir;
        await setPref(field.key, dir);
      }
    });
    input.append(text, browse);
  } else if (field.type === 'select') {
    input = document.createElement('select');
    const opts = typeof field.options === 'function' ? field.options(themes) : field.options;
    for (const [value, text] of opts) {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = text;
      opt.selected = String(value) === String(S.config[field.key]);
      input.appendChild(opt);
    }
    // keep numbers numeric in the config
    const numeric = opts.every(([v]) => typeof v === 'number');
    input.addEventListener('change', () => setPref(field.key, numeric ? Number(input.value) : input.value));
  } else if (field.type === 'color') {
    // '' means "use the theme's colour"
    input = document.createElement('span');
    input.className = 'pref-color';
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.value = S.config[field.key] || '#1f6feb';
    const reset = document.createElement('button');
    reset.className = 'pref-btn';
    reset.textContent = 'Theme';
    reset.title = "Use the theme's colour";
    const sync = () => {
      pick.classList.toggle('unset', !S.config[field.key]);
      reset.disabled = !S.config[field.key];
    };
    pick.addEventListener('change', async () => {
      await setPref(field.key, pick.value);
      sync();
    });
    reset.addEventListener('click', async (e) => {
      e.preventDefault();
      await setPref(field.key, '');
      sync();
    });
    sync();
    input.append(pick, reset);
  } else if (field.type === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    input.min = field.min;
    input.max = field.max;
    input.value = S.config[field.key];
    input.addEventListener('change', () => setPref(field.key, Number(input.value)));
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = S.config[field.key] || '';
    input.addEventListener('change', () => setPref(field.key, input.value.trim()));
  }
  return input;
}

function prefRow(field, themes) {
  // a <label> would forward clicks on the text to the button inside
  const row = document.createElement(['color', 'button', 'folder'].includes(field.type) ? 'div' : 'label');
  row.className = 'pref-row' + (field.type === 'bool' ? ' check' : '') + (field.type === 'button' ? ' action' : '');
  const text = document.createElement('span');
  text.className = 'pref-text';
  const label = document.createElement('span');
  label.className = 'pref-label';
  label.textContent = field.label;
  text.appendChild(label);
  if (field.hint) {
    const hint = document.createElement('span');
    hint.className = 'pref-hint';
    hint.textContent = field.hint;
    text.appendChild(hint);
  }
  const input = prefControl(field, themes);
  // checkboxes sit before their label, like a native settings pane
  if (field.type === 'bool') row.append(input, text);
  else row.append(text, input);
  return row;
}

// Right pane: the selected section, or every matching row while searching.
function renderPrefs(themes) {
  const body = $('#prefs-body');
  const query = $('#prefs-search').value.trim().toLowerCase();
  body.innerHTML = '';
  $('#prefs-actions').innerHTML = '';
  document.querySelectorAll('.prefs-nav-item').forEach((b) => {
    b.classList.toggle('active', !query && b.dataset.section === prefsSection);
  });
  const panel = !query && PREF_SECTIONS.find((s) => s.id === prefsSection)?.panel;
  $('#prefs .prefs').classList.toggle('wide', !!panel);
  body.classList.toggle('split', !!panel);
  if (panel) {
    renderWeChatPanel(body, $('#prefs-actions'), {
      themes,
      config: () => S.config,
      save: async (patch) => (S.config = await window.ink.setConfig(patch)),
      source: () => S.view.state.doc.toString(),
      docPath: S.path,
      docName: S.path ? basename(S.path) : 'Untitled',
      copy: () => copyForWeChat(),
      copyText: async (t) => {
        await window.ink.clipboardWrite(t);
        flashMessage('Copied the preview HTML');
      },
    });
    return;
  }
  const optionText = (f) => (Array.isArray(f.options) ? f.options.map(([, t]) => t).join(' ') : '');
  const matches = (f) => !query || `${f.label} ${f.hint || ''} ${optionText(f)}`.toLowerCase().includes(query);
  for (const section of PREF_SECTIONS) {
    if (!query && section.id !== prefsSection) continue;
    for (const group of section.groups) {
      const fields = group.fields.filter(matches);
      if (!fields.length) continue;
      const box = document.createElement('section');
      box.className = 'pref-group';
      const h = document.createElement('h3');
      h.textContent = query ? `${section.label} › ${group.title}` : group.title;
      box.appendChild(h);
      for (const f of fields) box.appendChild(prefRow(f, themes));
      body.appendChild(box);
    }
  }
  if (!body.childElementCount) body.innerHTML = '<div class="empty-hint">No matching settings</div>';
}

async function openPrefs(section) {
  if (section) prefsSection = section;
  const themes = await window.ink.themes();
  const nav = $('#prefs-nav');
  nav.innerHTML = '';
  for (const section of PREF_SECTIONS) {
    const b = document.createElement('button');
    b.className = 'prefs-nav-item';
    b.dataset.section = section.id;
    b.textContent = section.label;
    b.addEventListener('click', () => {
      prefsSection = section.id;
      $('#prefs-search').value = '';
      renderPrefs(themes);
    });
    nav.appendChild(b);
  }
  const search = $('#prefs-search');
  search.value = '';
  search.oninput = () => renderPrefs(themes);
  renderPrefs(themes);
  $('#prefs').hidden = false;
  search.focus();
}

async function setPref(key, value) {
  S.config = await window.ink.setConfig({ [key]: value });
  applyRuntimeConfig();
}

const PREVIEW_KEYS = ['emoji', 'githubAlerts', 'strictMode', 'inlineMath', 'lineNumbersInCode', 'codeWrap'];
const TREE_KEYS = ['treeSort', 'treeSortDesc', 'treeShowHidden', 'treeShowAllFiles'];
const THEME_KEYS = ['theme', 'themeDark', 'themeFollowSystem'];
let appliedConfig = null;

function applyRuntimeConfig() {
  ctx.config.lineNumbersInCode = !!S.config.lineNumbersInCode;
  ctx.config.codeWrap = S.config.codeWrap !== false;
  ctx.config.inlineMath = S.config.inlineMath !== false;
  ctx.config.smartTypography = S.config.smartTypography !== false;
  ctx.config.autoPairBrackets = S.config.autoPairBrackets !== false;
  ctx.config.autoPairMarkdown = S.config.autoPairMarkdown !== false;
  ctx.config.emojiAutocomplete = S.config.emojiAutocomplete !== false;
  ctx.config.emoji = S.config.emoji !== false;
  ctx.config.githubAlerts = S.config.githubAlerts !== false;
  ctx.config.strictMode = S.config.strictMode !== false;
  ctx.config.preserveLineBreaks = S.config.preserveLineBreaks === true;
  ctx.config.indentSize = S.config.indentSize || 4;
  if (appliedConfig && S.view) {
    if (PREVIEW_KEYS.some((k) => appliedConfig[k] !== S.config[k])) {
      refreshLivePreview(S.view);
      renderOutline();
    }
    if (TREE_KEYS.some((k) => appliedConfig[k] !== S.config[k])) refreshTree();
    if (THEME_KEYS.some((k) => appliedConfig[k] !== S.config[k])) renderTheme();
    if (appliedConfig.filesView !== S.config.filesView && S.config.filesView !== S.filesView) setFilesView(S.config.filesView);
    if (appliedConfig.outlineFlat !== S.config.outlineFlat) renderOutline();
    if (appliedConfig.readingSpeed !== S.config.readingSpeed && !$('#wordcount').hidden) renderWordCount();
  }
  $('#btn-outline-flat').classList.toggle('on', !!S.config.outlineFlat);
  appliedConfig = { ...S.config };
  document.documentElement.style.setProperty('--editor-font-size', `${S.config.fontSize || 16}px`);
  document.documentElement.style.setProperty('--line-width', `${S.config.lineWidth || 760}px`);
  $('#statusbar').hidden = !S.config.showStatusBar;
  document.body.classList.toggle('hide-sidebar', !S.config.showSidebar);
  if (S.view) setSpellcheck(S.view, S.config.spellcheck !== false);
  S.view?.requestMeasure();
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
async function buildExportHtml() {
  const src = S.view.state.doc.toString();
  const { meta } = splitFrontMatter(src);
  const host = document.createElement('div');
  host.innerHTML = renderFragment(src, { docPath: S.path });
  let i = 0;
  for (const el of host.querySelectorAll('.mermaid')) {
    const code = el.getAttribute('data-src') || el.textContent;
    try {
      const { svg } = await mermaid.render(`export-mmd-${++i}-${Date.now()}`, code);
      el.innerHTML = svg;
    } catch {
      /* leave the code block as is */
    }
  }
  const css = await window.ink.exportCss(S.themeId);
  const dark = document.body.classList.contains('theme-dark');
  const fallback = S.path ? basename(S.path).replace(/\.[^.]+$/, '') : 'Untitled';
  return buildStandaloneHtml({
    title: (meta && meta.title) || fallback,
    bodyHtml: host.innerHTML,
    css,
    bodyClass: dark ? 'theme-dark' : '',
  });
}

async function exportHtml() {
  const html = await buildExportHtml();
  const defaultPath = S.path ? S.path.replace(/\.[^.]+$/, '.html') : undefined;
  const saved = await window.ink.exportHtml({ html, defaultPath });
  if (saved) flashMessage(`Exported to ${saved}`);
}

async function exportPdf() {
  const html = await buildExportHtml();
  const defaultPath = S.path ? S.path.replace(/\.[^.]+$/, '.pdf') : undefined;
  const saved = await window.ink.exportPdf({ html, defaultPath });
  if (saved) flashMessage(`Exported to ${saved}`);
}

async function copyHtml() {
  const html = await buildExportHtml();
  await window.ink.clipboardWrite(html);
  flashMessage('HTML copied to clipboard');
}

// Copy for 公众号: inline styles only, hard blocks rasterised, links as references.
async function copyForWeChat(dry = false) {
  const src = S.view.state.doc.toString();
  const { html, text, stats } = await buildWeChatFragment(src, { docPath: S.path, style: wechatStyleFrom(S.config) });
  if (!dry) await writeRichClipboard(html, text);
  const bits = [];
  if (stats.rasterized) bits.push(`${stats.rasterized} formula/diagram image${stats.rasterized > 1 ? 's' : ''}`);
  if (stats.inlined) bits.push(`${stats.inlined} image${stats.inlined > 1 ? 's' : ''} inlined`);
  if (stats.remote) bits.push(`${stats.remote} remote image${stats.remote > 1 ? 's' : ''}`);
  if (stats.links) bits.push(`${stats.links} link${stats.links > 1 ? 's' : ''} in references`);
  if (!dry) flashMessage(`Copied for WeChat${bits.length ? ' · ' + bits.join(' · ') : ''}`);
  return { html, text, stats };
}

// Electron 45 dropped clipboard.write({html}) — the async web clipboard API is the
// only way to put a text/html flavour on the system clipboard now.
async function writeRichClipboard(html, text) {
  const item = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([text], { type: 'text/plain' }),
  });
  try {
    await navigator.clipboard.write([item]);
    return 'web';
  } catch (err) {
    await window.ink.clipboardWriteHtml({ html, text });
    return 'ipc';
  }
}

function flashMessage(text) {
  let el = $('#flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------------------
// menu commands
// ---------------------------------------------------------------------------
const commands = {
  'file:new': () => newDocument(),
  'file:open': async () => {
    const res = await window.ink.openFileDialog(S.folder);
    if (res) {
      if (S.dirty && !(await maybeSaveBeforeSwitch())) return;
      if (!S.folder) await setFolder(dirOf(res.path), { persist: false });
      noteClosed(S.path, res.path);
      await clearDraft();
      S.path = res.path;
      ctx.docPath = res.path;
      S.loading = true;
      setDoc(S.view, res.content);
      S.loading = false;
      S.dirty = false;
      setSourceMode(S.view, S.sourceMode);
      loadOutlineState();
      updateTitle();
      renderOutline();
      updateStatus();
      highlightTreeSelection();
    }
  },
  'file:openPath': (payload) => openPath(payload),
  // Ctrl+Shift+T: back into this window when it is empty, otherwise a new window
  'file:reopenClosed': async () => {
    const p = await window.ink.popClosed();
    if (!p) {
      flashMessage('No recently closed file');
      return;
    }
    if (!S.path && !S.dirty) await openPath(p);
    else await window.ink.newWindow({ file: p, folder: S.folder || undefined });
  },
  'file:recoverDrafts': () => openDrafts(),
  'window:new': () => window.ink.newWindow({ folder: S.folder || undefined }),
  'window:next': () => window.ink.focusWindow(1),
  'window:prev': () => window.ink.focusWindow(-1),
  'file:openFolder': async () => {
    const dir = await window.ink.openFolderDialog(S.folder);
    if (dir) await setFolder(dir);
  },
  'file:openFolderPath': async (payload) => setFolder(payload),
  'file:save': () => save(),
  'file:saveAs': () => save({ saveAs: true }),
  'file:quickOpen': () => openQuickOpen(),
  'file:clearRecent': () => window.ink.setConfig({ recentFiles: [], recentFolders: [], closedFiles: [] }),
  'tree:undo': () => undoFileOp(),
  'edit:find': () => openFind(S.view),
  'edit:replace': () => openFind(S.view),
  'edit:gotoLine': () => {
    $('#goto-line').hidden = false;
    $('#goto-line-input').value = '';
    $('#goto-line-input').focus();
  },
  'edit:copyMarkdown': async () => {
    const { state } = S.view;
    const sel = state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to)).join('\n');
    await window.ink.clipboardWrite(sel || state.doc.toString());
    flashMessage('Markdown copied');
  },
  'edit:pastePlain': async () => {
    const text = await window.ink.clipboardRead();
    if (!text) return;
    insertText(text);
  },
  'edit:findInFiles': () => {
    const { state } = S.view;
    const sel = state.sliceDoc(state.selection.main.from, state.selection.main.to);
    openSearchPanel(sel && !sel.includes('\n') ? sel : undefined);
  },
  'para:h1': () => setHeading(S.view, 1),
  'para:h2': () => setHeading(S.view, 2),
  'para:h3': () => setHeading(S.view, 3),
  'para:h4': () => setHeading(S.view, 4),
  'para:h5': () => setHeading(S.view, 5),
  'para:h6': () => setHeading(S.view, 6),
  'para:p': () => setHeading(S.view, 0),
  'para:headingUp': () => stepHeading(S.view, -1),
  'para:headingDown': () => stepHeading(S.view, 1),
  'para:quote': () => toggleQuote(S.view),
  'para:alert': (type) => insertAlert(S.view, type || 'note'),
  'para:ul': () => toggleList(S.view, '- '),
  'para:ol': () => toggleList(S.view, '1. '),
  'para:task': () => toggleTask(S.view),
  'para:table': () => insertTable(S.view),
  'para:code': () => insertCodeFence(S.view),
  'para:codeMermaid': () => insertCodeFence(S.view, 'mermaid'),
  'para:mathBlock': () => insertMathBlock(S.view),
  'para:hr': () => insertRule(S.view),
  'para:indent': () => indentLines(S.view, 1),
  'para:outdent': () => indentLines(S.view, -1),
  'fmt:bold': () => toggleWrap(S.view, '**'),
  'fmt:italic': () => toggleWrap(S.view, '*'),
  'fmt:underline': () => toggleWrap(S.view, '<u>', '</u>'),
  'fmt:code': () => toggleWrap(S.view, '`'),
  'fmt:strike': () => toggleWrap(S.view, '~~'),
  'fmt:highlight': () => toggleWrap(S.view, '=='),
  'fmt:superscript': () => toggleWrap(S.view, '^'),
  'fmt:subscript': () => toggleWrap(S.view, '~'),
  'fmt:link': () => insertLink(S.view),
  'fmt:image': async () => {
    const p = await window.ink.openImageDialog(S.folder || dirOf(S.path));
    insertImage(S.view, p ? p.replace(/\\/g, '/') : '');
  },
  'fmt:clear': () => clearStyle(S.view),
  'view:sourceMode': () => {
    S.sourceMode = !S.sourceMode;
    setSourceMode(S.view, S.sourceMode);
    updateStatus();
  },
  'view:focusMode': () => {
    S.focusMode = !S.focusMode;
    enableFocusMode(S.view, S.focusMode);
    updateStatus();
  },
  'view:typewriterMode': () => {
    S.typewriterMode = !S.typewriterMode;
    if (S.typewriterMode) scrollCaretToCenter(S.view);
    updateStatus();
  },
  'view:sidebar': () => {
    document.body.classList.toggle('hide-sidebar');
    window.ink.setConfig({ showSidebar: !document.body.classList.contains('hide-sidebar') });
  },
  'view:outline': () => {
    document.body.classList.remove('hide-sidebar');
    switchTab('outline');
  },
  'view:search': () => openSearchPanel(),
  'view:files': () => {
    document.body.classList.remove('hide-sidebar');
    switchTab('files');
  },
  'view:wordCount': () => toggleWordCount(),
  'view:filesList': () => {
    document.body.classList.remove('hide-sidebar');
    switchTab('files');
    setFilesView(S.filesView === 'list' ? 'tree' : 'list', { persist: true });
  },
  'view:outlineFlat': async () => {
    S.config = await window.ink.setConfig({ outlineFlat: !S.config.outlineFlat });
    applyRuntimeConfig();
  },
  'view:statusBar': async () => {
    const on = !S.config.showStatusBar;
    S.config = await window.ink.setConfig({ showStatusBar: on });
    applyRuntimeConfig();
  },
  'view:zoomIn': () => setZoom(S.zoom + 0.1),
  'view:zoomOut': () => setZoom(S.zoom - 0.1),
  'view:zoomReset': () => setZoom(1),
  'view:fullscreen': () => window.ink.toggleFullScreen(),
  'view:alwaysOnTop': () => {
    S.alwaysOnTop = !S.alwaysOnTop;
    window.ink.setAlwaysOnTop(S.alwaysOnTop);
  },
  'view:reload': () => location.reload(),
  'theme:set': (id) => applyTheme(id),
  'theme:systemChanged': () => renderTheme(),
  'theme:openFolder': async () => {
    await window.ink.openThemeFolder();
    flashMessage('Edits apply when the theme is re-selected or the window is reloaded (Ctrl+R)');
  },
  'app:preferences': () => openPrefs(),
  'app:closeWindow': () => attemptClose(),
  'app:quit': () => attemptClose(),
  'app:requestClose': () => attemptClose(),
  'export:html': () => exportHtml(),
  'export:pdf': () => exportPdf(),
  'export:print': () => exportPdf(),
  'export:copyHtml': () => copyHtml(),
  'export:copyWeChat': () => copyForWeChat(),
  'export:settings': () => openPrefs('export'),
  'help:about': () =>
    window.ink.info({
      message: 'Posemark 0.1.0',
      detail:
        'A Typora-style live-preview Markdown editor.\n\nBuilt with Electron, CodeMirror 6, markdown-it, KaTeX, highlight.js and Mermaid.',
    }),
};

async function attemptClose() {
  if (S.dirty && S.config.confirmOnClose !== false) {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) return;
  }
  // (closing without the prompt keeps the draft on disk — that is the safety net)
  window.ink.closeWindow();
}

function setZoom(v) {
  S.zoom = Math.max(0.5, Math.min(2.5, Math.round(v * 10) / 10));
  window.ink.setZoom(S.zoom);
  flashMessage(`Zoom ${Math.round(S.zoom * 100)}%`);
}

// ---------------------------------------------------------------------------
// sidebar + resizer
// ---------------------------------------------------------------------------
function switchTab(tab) {
  document.querySelectorAll('.side-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#panel-files').hidden = tab !== 'files';
  $('#panel-outline').hidden = tab !== 'outline';
  $('#panel-search').hidden = tab !== 'search';
  window.ink.setConfig({ sidebarTab: tab });
}

function initResizer() {
  const resizer = $('#resizer');
  let dragging = false;
  resizer.addEventListener('mousedown', () => {
    dragging = true;
    document.body.classList.add('resizing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.max(150, Math.min(560, e.clientX));
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10);
    window.ink.setConfig({ sidebarWidth: w });
  });
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
// drag & drop images
// ---------------------------------------------------------------------------
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|avif|tiff?)$/i;
const dropHint = document.createElement('div');
dropHint.className = 'drop-hint';
dropHint.hidden = true;
dropHint.textContent = 'Drop to insert image';
document.body.appendChild(dropHint);

function hasFiles(e) {
  const t = e.dataTransfer && e.dataTransfer.types;
  return !!t && [...t].includes('Files');
}

async function insertImageFromPath(srcPath, pos) {
  const res = await window.ink.importImage(srcPath, S.path || null);
  if (!res) return false;
  insertSnippet(`![${res.alt}](${res.rel})`, pos);
  return true;
}

// Drop `snippet` in on its own paragraph, where the caret is.
function insertSnippet(snippet, pos) {
  const view = S.view;
  const doc = view.state.doc;
  const at = Math.max(0, Math.min(pos == null ? view.state.selection.main.head : pos, doc.length));
  const line = doc.lineAt(at);
  const before = line.text.slice(0, at - line.from);
  const after = line.text.slice(at - line.from);
  const lead = before.trim() ? '\n\n' : '';
  const tail = after.trim() ? '\n\n' : '\n';
  const text = `${lead}${snippet}${tail}`;
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    scrollIntoView: true,
  });
  view.focus();
  markDirty();
}

// Replace the selection with `text`, as a paste would.
function insertText(text) {
  const view = S.view;
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
  view.focus();
}

// A screenshot on the clipboard becomes an asset + an inline image, same as the file drop.
// Rich text (a browser page, Word, Google Docs, another editor) is converted to Markdown.
function wirePaste() {
  const host = $('#editor');
  host.addEventListener(
    'paste',
    async (e) => {
      const data = e.clipboardData;
      const items = [...((data && data.items) || [])];
      const hasImage = items.some((it) => it.kind === 'file' && /^image\//i.test(it.type));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        const res = await window.ink.pasteImage(S.path || null);
        if (!res) {
          flashMessage('Clipboard has no image');
          return;
        }
        insertSnippet(`![${res.alt}](${res.rel})`);
        flashMessage(`Pasted to ${res.rel}`);
        return;
      }
      // smart paste: only into the Markdown text itself, not table cells or the math field
      if (S.config.pasteHtmlAsMarkdown === false || S.sourceMode) return;
      if (e.target.closest('.md-table-input, textarea, input, [contenteditable="true"]:not(.cm-content)')) return;
      const html = data.getData('text/html');
      const text = data.getData('text/plain');
      if (!html || htmlLooksPlain(html, text)) return;
      if (inCodeAt(S.view.state, S.view.state.selection.main.head)) return;
      const md = htmlToMarkdown(html);
      if (!md) return;
      e.preventDefault();
      e.stopPropagation();
      insertText(md);
      flashMessage('Pasted as Markdown · Ctrl+Shift+V pastes plain text');
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// links: external URLs, sibling markdown files, in-page anchors
// ---------------------------------------------------------------------------
const MD_LINK_EXT = /\.(md|markdown|mmd|mdown|mkd|mdwn|mdtxt|mdtext|txt|text|rmd)$/i;

function joinPath(dir, rel) {
  const parts = norm(dir).split('/').filter(Boolean);
  for (const seg of norm(rel).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function scrollToAnchor(id) {
  const view = S.view;
  const doc = view.state.doc;
  const want = String(id || '')
    .replace(/^#/, '')
    .toLowerCase();
  if (!want) return false;
  for (let n = 1; n <= doc.lines; n++) {
    const h = headingOf(doc.line(n).text);
    if (!h) continue;
    const explicit = /\{#([^}]+)\}\s*$/.exec(h.text);
    const id = explicit ? explicit[1].trim().toLowerCase() : slugify(h.text);
    if (id === want) {
      view.dispatch({ selection: { anchor: doc.line(n).from }, scrollIntoView: true });
      view.focus();
      return true;
    }
  }
  return false;
}

async function openHref(href) {
  const url = String(href || '')
    .trim()
    .replace(/^<|>$/g, '');
  if (!url) return;
  if (/^(https?|mailto|tel):/i.test(url)) {
    await window.ink.openExternal(url);
    return;
  }
  if (url.startsWith('#')) {
    if (!scrollToAnchor(url)) flashMessage(`No heading \u201c${url.slice(1)}\u201d`);
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    await window.ink.openExternal(url);
    return;
  }
  const [pathPart, hash] = url.split('#');
  if (!pathPart) {
    if (hash) scrollToAnchor(hash);
    return;
  }
  const clean = decodeURI(pathPart);
  const base = ctx.docPath ? dirOf(ctx.docPath) : S.folder || null;
  const abs = /^([a-zA-Z]:[\\/]|\/)/.test(clean) ? norm(clean) : base ? joinPath(base, clean) : null;
  if (!abs) return;
  if (MD_LINK_EXT.test(abs)) {
    if (await window.ink.exists(abs)) {
      await openPath(abs);
      if (hash) scrollToAnchor(hash);
      return;
    }
    flashMessage(`Missing: ${basename(abs)}`);
    return;
  }
  const kind = await window.ink.openPath(abs);
  if (kind === 'missing') flashMessage(`Missing: ${basename(abs)}`);
}

// The URL of the markdown link under `pos`, if any.
function hrefAt(state, pos) {
  let tree = syntaxTree(state);
  if (tree.length < state.doc.length) tree = ensureSyntaxTree(state, state.doc.length, 200) || tree;
  let node = tree.resolveInner(pos, 1);
  while (node && !['Link', 'Autolink', 'LinkReference'].includes(node.name)) node = node.parent;
  if (!node) return null;
  const raw = state.doc.sliceString(node.from, node.to);
  if (node.name === 'Autolink') return raw.replace(/^<|>$/g, '');
  const inline = /\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/.exec(raw);
  if (inline) return inline[1];
  // reference-style: look the label up in the `[label]: url` definitions
  const ref = /^\[((?:[^\]\\]|\\.)*)\](?:\[((?:[^\]\\]|\\.)*)\])?$/.exec(raw);
  if (!ref) return null;
  const label = (ref[2] || ref[1]).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!label) return null;
  const doc = state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (!text.includes(']:')) continue;
    const m = /^ {0,3}\[((?!\^)[^\]]+)\]:[ \t]*(<[^>]*>|\S+)/.exec(text);
    if (m && m[1].trim().toLowerCase().replace(/\s+/g, ' ') === label) return m[2].replace(/^<|>$/g, '');
  }
  return null;
}

function wireLinks() {
  const host = $('#editor');

  host.addEventListener('click', async (e) => {
    const anchor = e.target.closest('a[href]');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      await openHref(anchor.getAttribute('href'));
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const pos = S.view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const href = hrefAt(S.view.state, pos);
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    await openHref(href);
  });

  // Hold Ctrl/Cmd to make links look clickable.
  const setMod = (on) => document.body.classList.toggle('mod-key', on);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') setMod(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') setMod(false);
  });
  window.addEventListener('blur', () => setMod(false));
}

function wireImageDrop() {
  const host = $('#editor');
  host.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropHint.hidden = false;
  });
  host.addEventListener('dragleave', (e) => {
    if (!host.contains(e.relatedTarget)) dropHint.hidden = true;
  });
  host.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dropHint.hidden = true;
    const files = [...(e.dataTransfer.files || [])].filter(
      (f) => /^image\//i.test(f.type) || IMAGE_EXT.test(f.name || ''),
    );
    if (!files.length) return;
    let at = S.view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (at == null) at = S.view.state.selection.main.head;
    for (const f of files) {
      const p = window.ink.pathForFile(f);
      if (!p) continue;
      await insertImageFromPath(p, at);
      at = S.view.state.selection.main.head;
    }
  });
}

// ---------------------------------------------------------------------------
async function boot() {
  S.config = await window.ink.getConfig();
  document.documentElement.style.setProperty('--sidebar-width', `${S.config.sidebarWidth || 240}px`);
  await renderTheme();

  S.view = createEditor({
    parent: $('#editor'),
    doc: WELCOME,
    onChange: () => markDirty(),
    onCursor: (state) => {
      updateCursor(state);
      if (S.typewriterMode) scrollCaretToCenter(S.view);
    },
  });
  applyRuntimeConfig();
  wireImageDrop();
  wirePaste();
  wireTree();
  wireList();
  wireSearch();
  wireLinks();
  wireOutline();
  switchTab(S.config.sidebarTab || 'files');
  S.filesView = S.config.filesView === 'list' ? 'list' : 'tree';
  $('#btn-files-view').classList.toggle('on', S.filesView === 'list');
  $('#filetree').hidden = S.filesView !== 'tree';
  $('#filelist').hidden = S.filesView !== 'list';
  window.ink.onTreeChanged(onTreeChanged);

  // initial document: the file / folder this window was opened for (main applies the
  // launch preference for the first window: new document, last folder, last file, fixed folder)
  const initial = (await window.ink.initialFile()) || {};
  if (initial.folder) await setFolder(initial.folder, { persist: false });
  if (initial.file) await openPath(initial.file);
  else if (!initial.folder) setFolder(null, { persist: false });
  updateTitle();
  updateStatus();
  updateCursor(S.view.state);
  renderOutline();
  if (initial.drafts) {
    setTimeout(() => flashMessage(`${initial.drafts} unsaved draft${initial.drafts > 1 ? 's' : ''} from last time · File › Recover Unsaved Drafts`), 900);
  }

  // wiring
  document.querySelectorAll('.side-tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  // macOS keeps its menu in the system bar; elsewhere the native bar is hidden
  const menuBtn = $('#btn-menu');
  if (window.ink.platform === 'darwin') menuBtn.hidden = true;
  menuBtn.addEventListener('click', () => {
    const r = menuBtn.getBoundingClientRect();
    window.ink.showAppMenu(r.left, r.bottom);
  });
  $('#btn-sidebar').addEventListener('click', () => commands['view:sidebar']());
  $('#btn-mode').addEventListener('click', () => commands['view:sourceMode']());
  $('#btn-open-folder').addEventListener('click', () => commands['file:openFolder']());
  $('#btn-files-view').addEventListener('click', () => setFilesView(S.filesView === 'list' ? 'tree' : 'list', { persist: true }));
  $('#stat-words').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWordCount();
  });
  document.addEventListener('mousedown', (e) => {
    if (!$('#wordcount').hidden && !e.target.closest('#wordcount, #stat-words')) toggleWordCount(false);
  });
  $('#drafts-close').addEventListener('click', () => ($('#drafts').hidden = true));
  $('#drafts').addEventListener('mousedown', (e) => {
    if (e.target.id === 'drafts') $('#drafts').hidden = true;
  });
  $('#drafts-discard-all').addEventListener('click', async () => {
    const items = await window.ink.draftList();
    if (!items.length) return;
    const res = await window.ink.confirm({
      message: `Discard ${items.length} unsaved draft${items.length > 1 ? 's' : ''}?`,
      detail: 'They cannot be recovered afterwards.',
      buttons: ['Discard', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (res !== 0) return;
    for (const d of items) await window.ink.draftRemove(d.id);
    openDrafts();
  });
  $('#prefs-close').addEventListener('click', () => ($('#prefs').hidden = true));
  $('#prefs').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#prefs').hidden = true;
  });
  $('#prefs').addEventListener('mousedown', (e) => {
    if (e.target.id === 'prefs') $('#prefs').hidden = true;
  });
  $('#quick-open-input').addEventListener('input', (e) => renderQuickList(e.target.value));
  $('#quick-open-input').addEventListener('keydown', quickKeyboard);
  $('#quick-open').addEventListener('mousedown', (e) => {
    if (e.target.id === 'quick-open') $('#quick-open').hidden = true;
  });
  $('#goto-line-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      gotoLine(S.view, parseInt(e.target.value, 10) || 1);
      $('#goto-line').hidden = true;
    } else if (e.key === 'Escape') $('#goto-line').hidden = true;
  });
  initResizer();

  window.ink.onCommand((id, payload) => {
    const fn = commands[id];
    if (fn) {
      try {
        fn(payload);
      } catch (err) {
        console.error('command failed', id, err);
      }
    }
  });

  window.ink.onConfig((cfg) => {
    S.config = cfg;
    applyRuntimeConfig();
  });

  // drag & drop markdown files
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !/\.(md|markdown|mmd|mdown|mkd|txt|text)$/i.test(file.name)) return;
    const p = window.ink.pathForFile(file);
    if (p) openPath(p);
  });

  // focus outline refresh
  S.view.focus();
  document.body.classList.remove('loading');

  // debug hooks for the smoke script
  window.__ink = {
    state: S,
    view: () => S.view,
    run: (id, arg) => commands[id](arg),
    setTheme: (id) => applyTheme(id),
    tree: () => refreshTree(),
    setFolder: (d) => setFolder(d, { persist: false }),
    openPath: (p) => openPath(p),
    openHref: (h) => openHref(h),
    hrefAt: (pos) => hrefAt(S.view.state, pos),
    rename: (p, name) => window.ink.renamePath(p, name),
    dumpTree(cb) {
      syntaxTree(S.view.state).iterate({ enter: (node) => cb(node.name) });
    },
    async exportHtml() {
      return buildExportHtml();
    },
    copyWeChat: (dry = true) => copyForWeChat(dry),
    dropImage: (p, pos) => insertImageFromPath(p, pos),
    html2md: (html, text) => ({ plain: htmlLooksPlain(html, text), markdown: htmlToMarkdown(html) }),
    search: async (q, opts = {}) => {
      Object.assign(S.search, opts);
      $('#search-input').value = q;
      await runSearch();
      return S.search.results;
    },
    reload: () => reloadFromDisk(),
    wordCount: () => {
      toggleWordCount(true);
      return $('#wordcount').innerText;
    },
    outline: () => [...document.querySelectorAll('.outline-item')].map((el) => `${el.classList.contains('current') ? '>' : ' '}${el.style.paddingLeft} ${el.innerText}`),
    filterOutline: (q) => {
      $('#outline-filter').value = q;
      S.outlineQuery = q;
      renderOutline();
    },
    files: () => [...document.querySelectorAll('#filetree .tree-item, #filelist .list-item')].filter((el) => el.offsetParent).map((el) => el.dataset.path),
    move: (src, dir) => moveItem(src, dir),
    duplicate: (p) => duplicateTarget({ path: p, dir: false }),
    undoFileOp: () => undoFileOp(),
    drafts: () => window.ink.draftList(),
    writeDraft: () => writeDraft(),
    theme: () => ({ id: S.themeId, href: $('#theme-css').getAttribute('href'), user: $('#user-css').textContent.length }),
  };
}

function wireOutline() {
  const input = $('#outline-filter');
  input.addEventListener('input', () => {
    S.outlineQuery = input.value;
    renderOutline();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      S.outlineQuery = '';
      renderOutline();
      S.view.focus();
    } else if (e.key === 'Enter') {
      const first = $('#outline .outline-item');
      if (first) first.click();
    }
  });
  $('#btn-outline-flat').addEventListener('click', () => commands['view:outlineFlat']());
}

boot();
