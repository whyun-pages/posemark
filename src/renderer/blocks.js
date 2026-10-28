// Block scanning + block-level widgets (code fences, tables, math, diagrams, images).
import { WidgetType } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import katex from 'katex';
import mermaid from 'mermaid';
import { mdit } from './markdown.js';
import { highlightCode, isDiagramLang } from './syntax.js';
import { ctx, resolveSrc, parseImageTag } from './paths.js';
import { diagramSource } from './diagrams.js';
import { renderTex, prepareTex } from './math.js';

export { highlightCode, isDiagramLang };
export { ctx };

// ---------------------------------------------------------------------------
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*(.*)$/;
const TABLE_DELIM_RE = /^ {0,3}\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
// `#Title` without the space — accepted when Typora-style strict mode is off
const LENIENT_HEADING_RE = /^ {0,3}(#{1,6})(?![#\s])(.+?)[ \t]*#*[ \t]*$/;
const SETEXT_RE = /^ {0,3}(=+|-{2,})[ \t]*$/;

/** The `{ level, text }` of an ATX heading line, honouring the strict-mode setting. */
export function headingOf(text) {
  let m = HEADING_RE.exec(text);
  if (!m && ctx.config.strictMode === false) m = LENIENT_HEADING_RE.exec(text);
  if (!m) return null;
  return { level: m[1].length, text: m[2], marker: m[1] };
}

export function scanBlocks(doc) {
  const blocks = [];
  const headings = [];
  const n = doc.lines;
  let ln = 1;

  const pushTable = (start, end) => {
    const from = doc.line(start).from;
    const to = doc.line(end).to;
    blocks.push({ type: 'table', start, end, from, to, body: doc.sliceString(from, to) });
  };

  while (ln <= n) {
    const line = doc.line(ln);
    const text = line.text;

    // YAML front matter
    if (ln === 1 && /^---\s*$/.test(text)) {
      let end = 0;
      for (let k = 2; k <= Math.min(n, 60); k++) {
        if (/^(---|\.\.\.)\s*$/.test(doc.line(k).text)) {
          end = k;
          break;
        }
      }
      if (end) {
        const from = doc.line(1).from;
        const to = doc.line(end).to;
        blocks.push({ type: 'frontmatter', start: 1, end, from, to, body: doc.sliceString(from, to) });
        ln = end + 1;
        continue;
      }
    }

    // fenced code
    const fence = FENCE_RE.exec(text);
    if (fence) {
      const mark = fence[1];
      const info = fence[2].trim();
      let end = n;
      for (let k = ln + 1; k <= n; k++) {
        const t = doc.line(k).text;
        if (new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(t)) {
          end = k;
          break;
        }
      }
      const bodyFrom = doc.line(ln).to + 1;
      const bodyTo = end > ln ? doc.line(end).from - 1 : doc.line(ln).to;
      const body = end > ln ? doc.sliceString(bodyFrom, Math.max(bodyFrom, bodyTo)) : '';
      const lang = info.split(/\s+/)[0].toLowerCase();
      if (lang === 'math') {
        // ```math … ``` is a display equation, same as $$ … $$
        blocks.push({ type: 'math', start: ln, end, from: doc.line(ln).from, to: doc.line(end).to, body: body.trim(), delim: 'fence', fence: mark });
      } else {
        blocks.push({
          type: isDiagramLang(info) ? 'diagram' : 'code',
          start: ln,
          end,
          from: doc.line(ln).from,
          to: doc.line(end).to,
          info,
          body,
          closed: end !== n || /^ {0,3}(`{3,}|~{3,})\s*$/.test(doc.line(n).text),
        });
      }
      ln = end + 1;
      continue;
    }

    // block math: $$ ... $$
    if (/^ {0,3}\$\$/.test(text)) {
      const open = text.trim();
      let end = 0;
      let body = '';
      if (open.length > 4 && /\$\$\s*$/.test(open.slice(2))) {
        end = ln;
        body = open.slice(2, open.lastIndexOf('$$'));
      } else {
        for (let k = ln + 1; k <= n; k++) {
          const t = doc.line(k).text;
          if (/\$\$\s*$/.test(t)) {
            end = k;
            break;
          }
        }
        if (end) {
          body = doc.sliceString(doc.line(ln).to + 1, doc.line(end).from - 1);
          if (end === ln + 1) body = '';
        }
      }
      if (end) {
        blocks.push({
          type: 'math',
          start: ln,
          end,
          from: doc.line(ln).from,
          to: doc.line(end).to,
          body: body.trim(),
          delim: 'dollar',
        });
        ln = end + 1;
        continue;
      }
    }

    // block math, LaTeX style: \[ ... \]
    if (/^ {0,3}\\\[/.test(text)) {
      const open = text.trim();
      let end = 0;
      let body = '';
      if (open.length > 4 && /\\\]\s*$/.test(open.slice(2))) {
        end = ln;
        body = open.slice(2, open.lastIndexOf('\\]'));
      } else {
        for (let k = ln + 1; k <= n; k++) {
          if (/\\\]\s*$/.test(doc.line(k).text)) {
            end = k;
            break;
          }
        }
        if (end) {
          body = doc.sliceString(doc.line(ln).to + 1, doc.line(end).from - 1);
          if (end === ln + 1) body = '';
        }
      }
      if (end) {
        blocks.push({ type: 'math', start: ln, end, from: doc.line(ln).from, to: doc.line(end).to, body: body.trim(), delim: 'bracket' });
        ln = end + 1;
        continue;
      }
    }

    // GFM table
    if (text.includes('|') && ln < n && TABLE_DELIM_RE.test(doc.line(ln + 1).text) && doc.line(ln + 1).text.includes('-')) {      let end = ln + 2;
      while (end < n && doc.line(end + 1).text.includes('|') && doc.line(end + 1).text.trim()) end++;
      pushTable(ln, end);
      ln = end + 1;
      continue;
    }

    // [TOC] placeholder line
    if (/^ {0,3}\[toc\]\s*$/i.test(text)) {
      blocks.push({ type: 'toc', start: ln, end: ln, from: line.from, to: line.to });
      ln++;
      continue;
    }

    // headings (for the outline)
    const atx = headingOf(text);
    if (atx) {
      headings.push({
        level: atx.level,
        text: atx.text.replace(/[*_`$]/g, '').replace(/\s*\{#[^}]+\}\s*$/, '').trim(),
        line: ln,
        from: line.from,
      });
    } else if (ln < n && text.trim() && SETEXT_RE.test(doc.line(ln + 1).text)) {
      const marker = doc.line(ln + 1).text.trim();
      headings.push({ level: marker[0] === '=' ? 1 : 2, text: text.trim(), line: ln, from: line.from });
    }

    ln++;
  }

  for (const block of blocks) {
    if (block.type === 'toc') block.headings = headings.filter((h) => h.line !== block.start);
  }

  return { blocks, headings };
}

// ---------------------------------------------------------------------------
// widgets
// ---------------------------------------------------------------------------
function cursorInto(view, pos) {
  const target = Math.min(Math.max(pos, 0), view.state.doc.length);
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
  view.focus();
}

function bindClick(el, view, pos) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('a, input, button')) return;
    e.preventDefault();
    cursorInto(view, pos);
  });
}

export class CodeBlockWidget extends WidgetType {
  constructor(code, info, block) {
    super();
    this.code = code;
    this.info = info;
    this.block = block;
  }

  eq(other) {
    return (
      other.code === this.code &&
      other.info === this.info &&
      other.block.from === this.block.from &&
      other.block.to === this.block.to
    );
  }

  get estimatedHeight() {
    const lines = this.code.split('\n').length + 2;
    return Math.min(lines * 20 + 24, 1000);
  }

  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'md-block md-codeblock';
    bindClick(wrap, view, this.block.start < view.state.doc.lines ? view.state.doc.line(this.block.start).to + 1 : this.block.from);

    const pre = document.createElement('pre');
    pre.className = 'md-pre' + (ctx.config.codeWrap ? ' wrap' : '');
    if (this.info) pre.dataset.lang = this.info;
    const code = document.createElement('code');
    code.className = 'hljs';
    const html = highlightCode(this.code, this.info);
    if (html !== null) code.innerHTML = ctx.config.lineNumbersInCode ? wrapLines(html) : html;
    else code.textContent = this.code;
    pre.appendChild(code);
    if (this.info) {
      const tag = document.createElement('span');
      tag.className = 'md-code-lang';
      tag.textContent = this.info;
      wrap.appendChild(tag);
    }
    wrap.appendChild(pre);
    return wrap;
  }
}

function wrapLines(html) {
  return html
    .split('\n')
    .map((l) => `<span class="md-code-line">${l || ' '}</span>`)
    .join('\n');
}

// The source text a math block is written back as, for each of the three delimiters.
export function wrapMath(block, tex) {
  if (block && block.delim === 'bracket') return `\\[\n${tex}\n\\]`;
  if (block && block.delim === 'fence') return `${block.fence || '```'}math\n${tex}\n${block.fence || '```'}`;
  return `$$\n${tex}\n$$`;
}

export class MathBlockWidget extends WidgetType {
  constructor(tex, block, numbering = {}) {
    super();
    this.tex = tex;
    this.block = block;
    this.number = numbering.number || 0;
    this.prepared = prepareTex(tex, numbering);
  }

  eq(other) {
    return other.prepared === this.prepared && other.block.from === this.block.from;
  }

  toDOM(view) {
    const div = document.createElement('div');
    div.className = 'md-block md-mathblock';
    if (this.number) div.dataset.eq = String(this.number);
    try {
      div.innerHTML = renderTex(this.prepared, true);
    } catch (err) {
      div.textContent = String(err && err.message ? err.message : err);
      div.classList.add('error');
    }
    bindClick(div, view, this.block.from + 2);
    return div;
  }
}

export class TableWidget extends WidgetType {
  constructor(source, block) {
    super();
    this.source = source;
    this.block = block;
  }

  eq(other) {
    return other.source === this.source && other.block.from === this.block.from;
  }

  toDOM(view) {
    const div = document.createElement('div');
    div.className = 'md-block md-table';
    try {
      div.innerHTML = mdit.render(this.source);
    } catch {
      div.textContent = this.source;
    }
    const table = div.querySelector('table');
    if (table) table.classList.add('md-table-el');
    // remember which cell was clicked so the editable grid can open on it
    div.addEventListener(
      'mousedown',
      (e) => {
        const cell = e.target.closest ? e.target.closest('th,td') : null;
        if (!cell || !table) {
          pendingCell = null;
          return;
        }
        const tr = cell.parentElement;
        const head = tr.parentElement && tr.parentElement.tagName === 'THEAD';
        const r = head ? -1 : Array.prototype.indexOf.call(tr.parentElement.children, tr);
        const c = Array.prototype.indexOf.call(tr.children, cell);
        pendingCell = { from: this.block.from, r, c };
      },
      true,
    );
    bindClick(div, view, this.block.from + 1);
    return div;
  }
}

// ---------------------------------------------------------------------------
// in-place table editing
// ---------------------------------------------------------------------------

/** The table cell currently being edited; kept outside the widget so the DOM
 *  survives the decoration rebuild that every keystroke triggers. */
let tableEditing = null;
/** Cell the user clicked in the rendered table, so the editor opens on it. */
let pendingCell = null;

export function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseTable(source) {
  const lines = source.split('\n').filter((l) => l.trim());
  const header = splitTableRow(lines[0] || '');
  const aligns = splitTableRow(lines[1] || '').map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  const rows = lines.slice(2).map(splitTableRow);
  const cols = Math.max(header.length, aligns.length, ...rows.map((r) => r.length), 1);
  const pad = (arr) => {
    const a = arr.slice(0, cols);
    while (a.length < cols) a.push('');
    return a;
  };
  return { header: pad(header), aligns: pad(aligns), rows: rows.map(pad) };
}

export function serializeTable(model) {
  const esc = (c) => c.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const row = (cells) => '| ' + cells.map(esc).join(' | ') + ' |';
  const delim = model.aligns.map((a) =>
    a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---',
  );
  return [row(model.header), '| ' + delim.join(' | ') + ' |', ...model.rows.map(row)].join('\n');
}

export class EditableTableWidget extends WidgetType {
  constructor(block) {
    super();
    this.block = block;
    this.source = block.body;
    this.key = 'tbl:' + block.from;
  }

  get estimatedHeight() {
    return 40 + this.source.split('\n').length * 34;
  }

  eq(other) {
    if (other.key !== this.key) return false;
    if (other.source === this.source) return true;
    // our own keystroke produced this change — keep the live DOM (and the caret in it)
    return !!(tableEditing && tableEditing.key === this.key && tableEditing.source === other.source);
  }

  ignoreEvent() {
    return true;
  }

  toDOM(view) {
    const model = parseTable(this.source);
    const colsOf = () => model.header.length;
    const key = this.key;
    const from = this.block.from;

    const wrap = document.createElement('div');
    wrap.className = 'md-block md-table md-table-edit';
    const table = document.createElement('table');
    table.className = 'md-table-el md-table-input';
    wrap.appendChild(table);

    const state = { key, from, source: this.source, model, view, wrap, last: { r: -1, c: 0 }, timer: 0 };
    tableEditing = state;
    if (pendingCell && Math.abs(pendingCell.from - from) <= 4) {
      state.last = { r: pendingCell.r, c: pendingCell.c };
    }
    pendingCell = null;

    const serialize = () => serializeTable(model);
    const commit = () => {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = 0;
      }
      const src = serialize();
      if (src === state.source) return;
      const to = state.from + state.source.length;
      state.source = src;
      view.dispatch({ changes: { from: state.from, to, insert: src } });
    };
    const schedule = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = 0;
        commit();
      }, 140);
    };

    const caretToEnd = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };

    const focusCell = (r, c, toEnd = false) => {
      const el = table.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!el) return false;
      el.focus();
      if (toEnd) caretToEnd(el);
      state.last = { r, c };
      return true;
    };

    const exitTable = (up) => {
      commit();
      const doc = view.state.doc;
      const line = doc.lineAt(Math.min(state.from, doc.length));
      const to = state.from + state.source.length;
      if (up) {
        const anchor = line.number > 1 ? doc.line(line.number - 1).from : 0;
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
      } else if (to >= doc.length) {
        view.dispatch({ changes: { from: to, insert: '\n' }, selection: { anchor: to + 1 }, scrollIntoView: true });
      } else {
        view.dispatch({ selection: { anchor: to + 1 }, scrollIntoView: true });
      }
      view.focus();
    };

    const addRow = () => {
      const n = colsOf();
      model.rows.push(new Array(n).fill(''));
      const tr = document.createElement('tr');
      for (let c = 0; c < n; c++) tr.appendChild(makeCell(model.rows.length - 1, c, false));
      tbody.appendChild(tr);
    };

    const step = (r, c, forward) => {
      const cols = colsOf();
      let nr = r;
      let nc = c + (forward ? 1 : -1);
      if (nc >= cols) {
        nc = 0;
        nr = r + 1;
      } else if (nc < 0) {
        nc = cols - 1;
        nr = r - 1;
      }
      if (nr < -1) return exitTable(true);
      if (nr >= model.rows.length) {
        if (!forward) return exitTable(false);
        addRow();
        nr = model.rows.length - 1;
        nc = 0;
        commit();
      }
      focusCell(nr, nc, true);
    };

    // ---- cells ------------------------------------------------------------
    const inlineHtml = (raw) => {
      const s = (raw || '').trim();
      if (!s) return '';
      try {
        return mdit.renderInline(s, { docPath: ctx.docPath });
      } catch {
        return mdit.utils.escapeHtml(raw);
      }
    };

    // `<br>` inside a cell survives the round trip through contenteditable.
    const cellText = (el) => {
      let out = '';
      el.childNodes.forEach((node) => {
        if (node.nodeType === 3) out += node.nodeValue;
        else if (node.nodeName === 'BR') out += '<br>';
        else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
          if (out && !out.endsWith('<br>')) out += '<br>';
          out += node.textContent;
        } else out += node.textContent;
      });
      return out.replace(/\u00a0/g, ' ');
    };

    function makeCell(r, c, header) {
      const cell = document.createElement(header ? 'th' : 'td');
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.contentEditable = 'true';
      cell.spellcheck = false;
      const raw = () => (header ? model.header : model.rows[r])[c] ?? '';
      // idle cells show their inline Markdown rendered; focusing a cell shows the source
      cell.innerHTML = inlineHtml(raw());
      if (model.aligns[c]) cell.style.textAlign = model.aligns[c];
      let clickAt = null;

      cell.addEventListener('mousedown', (e) => {
        clickAt = { x: e.clientX, y: e.clientY };
      });
      cell.addEventListener('input', () => {
        const target = header ? model.header : model.rows[r];
        target[c] = cellText(cell);
        schedule();
      });
      cell.addEventListener('focus', () => {
        state.last = { r, c };
        if (cell.querySelector('*')) {
          const at = clickAt;
          cell.textContent = raw();
          if (at) {
            const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(at.x, at.y) : null;
            if (range && cell.contains(range.startContainer)) {
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
        clickAt = null;
      });
      cell.addEventListener('blur', () => {
        commit();
        cell.innerHTML = inlineHtml(raw());
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        commit();
        openMenu(e.clientX, e.clientY, r, c);
      });
      const insertLineBreak = () => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const br = document.createElement('br');
        range.insertNode(br);
        const after = document.createRange();
        after.setStartAfter(br);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        const target = header ? model.header : model.rows[r];
        target[c] = cellText(cell);
        schedule();
      };

      cell.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'Tab') {
          e.preventDefault();
          commit();
          step(r, c, !e.shiftKey);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            insertLineBreak();
            return;
          }
          commit();
          step(r, c, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          exitTable(false);
        } else if (mod && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          e.stopPropagation();
          commit();
          (e.shiftKey ? redo : undo)(view);
        } else if (mod && (e.key === 'y' || e.key === 'Y')) {
          e.preventDefault();
          e.stopPropagation();
          commit();
          redo(view);
        }
      });
      cell.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        if (!text) return;
        e.preventDefault();
        const clean = text.replace(/\r?\n+/g, ' ');
        document.execCommand('insertText', false, clean);
      });
      return cell;
    }

    let tbody = null;
    const thead = document.createElement('thead');
    tbody = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);

    function render() {
      thead.textContent = '';
      tbody.textContent = '';
      const n = colsOf();
      const htr = document.createElement('tr');
      for (let c = 0; c < n; c++) htr.appendChild(makeCell(-1, c, true));
      thead.appendChild(htr);
      for (let r = 0; r < model.rows.length; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < n; c++) tr.appendChild(makeCell(r, c, false));
        tbody.appendChild(tr);
      }
    }
    render();

    // ---- structure edits -------------------------------------------------
    function insertRow(at) {
      const n = colsOf();
      const i = Math.max(0, Math.min(at, model.rows.length));
      model.rows.splice(i, 0, new Array(n).fill(''));
      render();
      commit();
      focusCell(i, state.last.c, true);
    }
    function deleteRow(r) {
      if (r < 0 || r >= model.rows.length || model.rows.length <= 1) return;
      model.rows.splice(r, 1);
      render();
      commit();
      focusCell(Math.min(r, model.rows.length - 1), state.last.c, true);
    }
    function insertCol(at) {
      const i = Math.max(0, Math.min(at, colsOf()));
      model.header.splice(i, 0, '');
      model.aligns.splice(i, 0, '');
      model.rows.forEach((row) => row.splice(i, 0, ''));
      render();
      commit();
      focusCell(state.last.r, i, true);
    }
    function deleteCol(c) {
      if (colsOf() <= 1) return;
      model.header.splice(c, 1);
      model.aligns.splice(c, 1);
      model.rows.forEach((row) => row.splice(c, 1));
      render();
      commit();
      focusCell(state.last.r, Math.min(c, colsOf() - 1), true);
    }
    function setAlign(c, a) {
      model.aligns[c] = a;
      render();
      commit();
      focusCell(state.last.r, c, true);
    }

    // ---- row / column menu ----------------------------------------------
    const menu = document.createElement('div');
    menu.className = 'md-tbl-menu';
    menu.hidden = true;
    document.body.appendChild(menu);

    const closeMenu = () => {
      menu.hidden = true;
    };

    function openMenu(x, y, r, c) {
      state.last = { r, c };
      menu.textContent = '';
      const add = (label, action, disabled, on) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'md-tbl-item' + (on ? ' on' : '');
        b.textContent = label;
        b.disabled = !!disabled;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => {
          closeMenu();
          action();
        });
        menu.appendChild(b);
      };
      const sep = () => {
        const s = document.createElement('div');
        s.className = 'md-tbl-sep';
        menu.appendChild(s);
      };
      add('Row above', () => insertRow(r < 0 ? 0 : r));
      add('Row below', () => insertRow(r < 0 ? 0 : r + 1));
      add('Delete row', () => deleteRow(r), r < 0 || model.rows.length <= 1);
      sep();
      add('Column left', () => insertCol(c));
      add('Column right', () => insertCol(c + 1));
      add('Delete column', () => deleteCol(c), colsOf() <= 1);
      sep();
      add('Align left', () => setAlign(c, 'left'), false, model.aligns[c] === 'left');
      add('Align center', () => setAlign(c, 'center'), false, model.aligns[c] === 'center');
      add('Align right', () => setAlign(c, 'right'), false, model.aligns[c] === 'right');
      menu.hidden = false;
      const box = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) + 'px';
    }

    const onDocDown = (e) => {
      if (!menu.contains(e.target)) closeMenu();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    state.cleanup = () => {
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      menu.remove();
    };

    const hint = document.createElement('span');
    hint.className = 'md-table-hint';
    const hintText = document.createElement('span');
    hintText.textContent = 'Tab next cell · Enter next row · Esc done · right-click for rows/columns';
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'md-table-menu-btn';
    menuBtn.title = 'Rows, columns, alignment';
    menuBtn.textContent = '⋮';
    menuBtn.addEventListener('mousedown', (e) => e.preventDefault());
    menuBtn.addEventListener('click', (e) => {
      const box = menuBtn.getBoundingClientRect();
      openMenu(box.left, box.bottom + 4, state.last.r, state.last.c);
      e.stopPropagation();
    });
    hint.appendChild(hintText);
    hint.appendChild(menuBtn);
    wrap.appendChild(hint);

    // the caret is inside this block, so take the keyboard into the grid
    wrap.__inkTable = state;
    const target = state.last;
    requestAnimationFrame(() => {
      if (tableEditing !== state) return;
      focusCell(target.r, target.c, true);
    });
    return wrap;
  }

  destroy(dom) {
    const st = dom && dom.__inkTable;
    if (st && st.cleanup) st.cleanup();
  }
}

let diagramSeq = 0;

// ---------------------------------------------------------------------------
// math block as an editable field
// ---------------------------------------------------------------------------

/** Non-null while a $$ block is being edited in its own field. */
let mathEditing = null;

export class MathFieldWidget extends WidgetType {
  constructor(tex, block, numbering = {}) {
    super();
    this.tex = tex;
    this.block = block;
    this.numbering = numbering;
    this.key = 'math:' + block.from;
  }

  eq(other) {
    if (other.key !== this.key) return false;
    if (other.tex === this.tex) return true;
    // our own typing produced this change — keep the field (and its caret)
    return !!(mathEditing && mathEditing.key === this.key && mathEditing.tex === other.tex);
  }

  ignoreEvent() {
    return true;
  }

  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'md-block md-math-edit';

    const input = document.createElement('textarea');
    input.className = 'md-math-input';
    input.spellcheck = false;
    input.rows = 1;
    input.value = this.tex;

    const preview = document.createElement('div');
    preview.className = 'md-math-preview';

    const tag = document.createElement('span');
    tag.className = 'md-live-tag';
    tag.textContent = 'math';

    wrap.appendChild(tag);
    wrap.appendChild(input);
    wrap.appendChild(preview);

    const state = { key: this.key, tex: this.tex, from: this.block.from, to: this.block.to, view, timer: 0, block: this.block, numbering: this.numbering };
    mathEditing = state;

    const renderPreview = () => {
      if (!state.tex.trim()) {
        preview.textContent = '…';
        preview.classList.add('empty');
        return;
      }
      preview.classList.remove('empty');
      try {
        preview.innerHTML = renderTex(prepareTex(state.tex, state.numbering), true);
      } catch (err) {
        preview.classList.add('error');
        preview.textContent = String(err && err.message ? err.message : err);
      }
    };

    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = Math.max(28, input.scrollHeight) + 'px';
    };

    const commit = () => {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = 0;
      }
      const tex = state.tex.replace(/\s+$/, '');
      const next = wrapMath(state.block, tex);
      const doc = view.state.doc;
      const from = state.from;
      const to = Math.min(state.to, doc.length);
      if (doc.sliceString(from, to) === next) return;
      state.to = from + next.length;
      view.dispatch({ changes: { from, to, insert: next } });
    };

    const exitField = () => {
      commit();
      const doc = view.state.doc;
      const to = Math.min(state.from + wrapMath(state.block, state.tex.replace(/\s+$/, '')).length, doc.length);
      if (to >= doc.length) {
        view.dispatch({ changes: { from: to, insert: '\n' }, selection: { anchor: to + 1 }, scrollIntoView: true });
      } else {
        view.dispatch({ selection: { anchor: to + 1 }, scrollIntoView: true });
      }
      view.focus();
    };

    input.addEventListener('input', () => {
      state.tex = input.value;
      renderPreview();
      autosize();
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = 0;
        commit();
      }, 180);
    });
    input.addEventListener('blur', () => commit());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        e.stopPropagation();
        exitField();
      }
    });

    renderPreview();
    requestAnimationFrame(() => {
      if (mathEditing !== state) return;
      input.focus();
      autosize();
      const n = input.value.length;
      input.setSelectionRange(n, n);
    });
    return wrap;
  }
}

// ---------------------------------------------------------------------------
// live previews shown under a block while its source is being edited
// ---------------------------------------------------------------------------

function previewShell(className, label) {
  const wrap = document.createElement('div');
  wrap.className = 'md-block md-live ' + className;
  const tag = document.createElement('span');
  tag.className = 'md-live-tag';
  tag.textContent = label;
  wrap.appendChild(tag);
  const body = document.createElement('div');
  body.className = 'md-live-body';
  wrap.appendChild(body);
  return { wrap, body };
}

/** Rendered maths sitting under a $$ block while you type in it. */
export class MathLivePreviewWidget extends WidgetType {
  constructor(tex, block, numbering = {}) {
    super();
    this.tex = tex;
    this.block = block;
    this.prepared = prepareTex(tex, numbering);
  }

  eq(other) {
    return other.prepared === this.prepared && other.block.from === this.block.from;
  }

  toDOM() {
    const { wrap, body } = previewShell('md-live-math', 'preview');
    if (!this.tex.trim()) {
      body.textContent = '…';
      body.classList.add('empty');
      return wrap;
    }
    try {
      body.innerHTML = renderTex(this.prepared, true);
    } catch (err) {
      body.classList.add('error');
      body.textContent = String(err && err.message ? err.message : err);
    }
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

/** Rendered mermaid diagram sitting under a ```mermaid block while you type. */
export class DiagramLivePreviewWidget extends WidgetType {
  constructor(code, block) {
    super();
    this.code = code;
    this.block = block;
  }

  eq(other) {
    return other.code === this.code && other.block.from === this.block.from;
  }

  toDOM() {
    const { wrap, body } = previewShell('md-live-diagram', 'diagram');
    body.textContent = 'Rendering…';
    body.classList.add('pending');
    // Re-render only after a pause: mermaid parsing is async and throws on
    // half-typed input, so keep the last good picture on screen meanwhile.
    clearTimeout(liveDiagramTimer);
    const code = diagramSource(this.block.info, this.code) ?? this.code;
    liveDiagramTimer = setTimeout(() => {
      if (!body.isConnected) return;
      mermaid
        .render('ink-live-' + ++diagramSeq, code)
        .then(({ svg }) => {
          body.classList.remove('pending', 'error');
          body.innerHTML = svg;
        })
        .catch((err) => {
          body.classList.remove('pending');
          body.classList.add('error');
          body.textContent = String(err && err.message ? err.message : err).slice(0, 300);
        });
    }, 260);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

let liveDiagramTimer = 0;

/** The picture itself, shown under the ![]() source while that line is being edited. */
export class ImageLivePreviewWidget extends WidgetType {
  constructor(images) {
    super();
    this.images = images;
  }

  eq(other) {
    return JSON.stringify(other.images) === JSON.stringify(this.images);
  }

  toDOM() {
    const { wrap, body } = previewShell('md-live-image', 'image');
    for (const item of this.images) {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      const spec = imageSpec(item);
      img.src = resolveSrc(spec.src);
      img.alt = spec.label;
      applyImageSize(img, spec);
      if (spec.title) img.title = spec.title;
      img.addEventListener('error', () => {
        fig.classList.add('error');
        fig.textContent = `missing: ${spec.src}`;
      });
      fig.appendChild(img);
      const sizeNote = spec.width ? ` · ${spec.width}px` : spec.zoom ? ` · zoom ${spec.zoom}` : '';
      if (spec.label || sizeNote) {
        const cap = document.createElement('figcaption');
        cap.textContent = spec.label + sizeNote;
        fig.appendChild(cap);
      }
      body.appendChild(fig);
    }
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

// Mermaid picks its look up from the theme's CSS variables first (`--mermaid-theme`,
// `--mermaid-font-family`, `--mermaid-sequence-numbers`, `--mermaid-flowchart-curve`, the
// names Typora uses), then from the preferences, then follows light / dark.
export function mermaidConfig() {
  const has = typeof document !== 'undefined' && document.body;
  const cs = has ? getComputedStyle(document.body) : null;
  const v = (name) => (cs ? cs.getPropertyValue(name).trim().replace(/^["']|["']$/g, '') : '');
  const dark = has && document.body.classList.contains('theme-dark');
  const pref = ctx.config.mermaidTheme || 'auto';
  const theme = v('--mermaid-theme') || (pref !== 'auto' ? pref : dark ? 'dark' : 'default');
  const fontFamily = v('--mermaid-font-family') || 'inherit';
  const seq = v('--mermaid-sequence-numbers');
  const showSequenceNumbers = seq ? /^(on|true|1|yes)$/i.test(seq) : ctx.config.mermaidSequenceNumbers === true;
  const curve = v('--mermaid-flowchart-curve') || ctx.config.mermaidFlowchartCurve || 'basis';
  return { startOnLoad: false, securityLevel: 'loose', theme, fontFamily, sequence: { showSequenceNumbers }, flowchart: { curve } };
}

export function configureMermaid() {
  mermaid.initialize(mermaidConfig());
}

configureMermaid();

export class DiagramWidget extends WidgetType {
  constructor(code, block) {
    super();
    this.code = code;
    this.block = block;
    this.id = 'ink-mmd-' + ++diagramSeq;
  }

  eq(other) {
    return other.code === this.code && other.block.from === this.block.from && other.block.to === this.block.to;
  }

  get estimatedHeight() {
    return 220;
  }

  toDOM(view) {
    const div = document.createElement('div');
    div.className = 'md-block md-diagram';
    const holder = document.createElement('div');
    holder.className = 'md-diagram-holder';
    holder.textContent = 'Rendering diagram…';
    div.appendChild(holder);
    bindClick(div, view, this.block.from + 3);
    mermaid
      .render(this.id, diagramSource(this.block.info, this.code) ?? this.code)
      .then(({ svg }) => {
        holder.innerHTML = svg;
      })
      .catch((err) => {
        holder.classList.add('error');
        holder.textContent = String(err && err.message ? err.message : err);
        try {
          const orphan = document.getElementById('d' + this.id);
          if (orphan) orphan.remove();
        } catch { /* ignore */ }
      });
    return div;
  }
}

// One description for both image syntaxes:
//   ![alt|240x160](pic.png "title")      kind 'md'   (size written by the resize handle)
//   <img src="pic.png" width="240" style="zoom:50%">   kind 'html' (Typora's other form)
export function imageSpec(item) {
  if (item.kind === 'html') {
    const t = parseImageTag(item.raw) || {};
    return {
      kind: 'html',
      raw: item.raw,
      src: t.src || '',
      label: t.alt || '',
      title: t.title || '',
      width: t.width || 0,
      height: t.height || 0,
      zoom: t.zoom || '',
    };
  }
  const size = /^(.*?)\|\s*(\d+)(?:\s*x\s*(\d+))?\s*$/.exec(item.alt || '');
  return {
    kind: 'md',
    raw: item.raw || '',
    src: item.src || '',
    label: size ? size[1] : item.alt || '',
    title: item.title || '',
    width: size ? Number(size[2]) : 0,
    height: size && size[3] ? Number(size[3]) : 0,
    zoom: '',
  };
}

function applyImageSize(img, spec) {
  if (spec.width) img.style.width = spec.width + 'px';
  if (spec.height) img.style.height = spec.height + 'px';
  if (!spec.width && !spec.height && spec.zoom) img.style.zoom = spec.zoom;
}

export class ImageWidget extends WidgetType {
  constructor(item, block) {
    super();
    const spec = imageSpec(item);
    this.spec = spec;
    this.src = spec.src;
    this.label = spec.label;
    this.title = spec.title;
    this.width = spec.width;
    this.height = spec.height;
    this.block = block;
    // the resolved URL is part of the identity: a changed typora-root-url re-renders
    this.resolved = resolveSrc(spec.src);
  }

  eq(other) {
    return other.spec.raw === this.spec.raw && other.resolved === this.resolved && other.block.from === this.block.from;
  }

  toDOM(view) {
    const span = document.createElement('span');
    span.className = 'md-inline-image';
    span.dataset.src = this.src;
    span.dataset.from = String(this.block.from);
    span.dataset.to = String(this.block.to);
    span.dataset.kind = this.spec.kind;
    const img = document.createElement('img');
    img.src = this.resolved;
    img.alt = this.label;
    if (this.title) img.title = this.title;
    applyImageSize(img, this.spec);
    img.draggable = false;
    img.addEventListener('error', () => {
      span.classList.add('error');
      span.textContent = `🖼 ${this.label || this.src}`;
    });
    span.appendChild(img);

    const from = this.block.from;
    const to = this.block.to;
    span.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('md-img-handle')) return;
      e.preventDefault();
      openImageFrame(view, span, img, from, to);
    });
    span.addEventListener('dblclick', (e) => {
      e.preventDefault();
      cursorInto(view, from);
    });
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/** Rewrite `![alt](src)` → `![alt|width](src)` (or drop the width when 0).
 *  With an explicit height it becomes `![alt|widthxheight](src)`.
 *  An `<img>` tag gets `width="…"` / `height="…"` attributes instead (any zoom is dropped). */
export function writeImageWidth(view, from, to, width, height) {
  const max = view.state.doc.length;
  const end = Math.min(to, max);
  const raw = view.state.doc.sliceString(from, end);
  const next = resizedImageSource(raw, width, height);
  if (next == null || next === raw) return;
  view.dispatch({ changes: { from, to: end, insert: next } });
}

export function resizedImageSource(raw, width, height) {
  const m = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)?\s*(?:"([^"]*)")?\s*\)$/.exec(raw);
  if (m) {
    const bare = m[1].replace(/\|\s*\d+(?:\s*x\s*\d+)?\s*$/, '');
    const size = width > 0 ? `|${width}${height > 0 ? `x${height}` : ''}` : '';
    return `![${bare}${size}](${m[2] || ''}${m[3] ? ` "${m[3]}"` : ''})`;
  }
  const tag = /^(\s*<img\b)([^>]*?)(\/?>\s*)$/i.exec(raw);
  if (!tag) return null;
  let attrs = tag[2]
    .replace(/\s+(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi, '')
    .replace(/\s+style\s*=\s*"([^"]*)"/i, (all, style) => {
      const kept = style
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !/^(zoom|width|height)\s*:/i.test(s))
        .join('; ');
      return kept ? ` style="${kept}"` : '';
    });
  if (width > 0) attrs += ` width="${width}"`;
  if (height > 0) attrs += ` height="${height}"`;
  return `${tag[1]}${attrs}${tag[3]}`;
}

/** Rewrite the source path of an image (either syntax), keeping everything else. */
export function retargetedImageSource(raw, newSrc) {
  const m = /^(!\[[^\]]*\]\(\s*)(<[^>]*>|[^)\s]+)?(\s*(?:"[^"]*")?\s*\))$/.exec(raw);
  if (m) return `${m[1]}${newSrc}${m[3]}`;
  const tag = /^(\s*<(?:img|video|audio)\b[^>]*?\ssrc\s*=\s*)("[^"]*"|'[^']*')([^>]*>)/i.exec(raw);
  if (tag) return raw.replace(tag[0], `${tag[1]}"${newSrc}"${tag[3]}`);
  return null;
}

/** `<video controls src="clip.mp4"></video>` rendered in place; double-click edits the source. */
export class VideoWidget extends WidgetType {
  constructor(raw, block) {
    super();
    this.raw = raw;
    this.block = block;
    this.spec = parseImageTag(raw) || { src: '', tag: 'video', attrs: {} };
    this.resolved = resolveSrc(this.spec.src);
  }

  eq(other) {
    return other.raw === this.raw && other.resolved === this.resolved && other.block.from === this.block.from;
  }

  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'md-block md-video';
    const media = document.createElement(this.spec.tag === 'audio' ? 'audio' : 'video');
    media.controls = true;
    media.preload = 'metadata';
    media.src = resolveSrc(this.spec.src);
    if (this.spec.width) media.style.width = this.spec.width + 'px';
    if (this.spec.attrs.poster) media.poster = resolveSrc(this.spec.attrs.poster);
    media.addEventListener('error', () => {
      wrap.classList.add('error');
      wrap.textContent = `missing: ${this.spec.src}`;
    });
    wrap.appendChild(media);
    wrap.addEventListener('dblclick', (e) => {
      e.preventDefault();
      cursorInto(view, this.block.from);
    });
    return wrap;
  }

  ignoreEvent(e) {
    return e.type !== 'dblclick';
  }
}

let activeFrame = null;

function closeImageFrame() {
  if (!activeFrame) return;
  activeFrame.span.classList.remove('resizing');
  const h = activeFrame.span.querySelector('.md-img-handle');
  if (h) h.remove();
  document.removeEventListener('mousedown', activeFrame.off, true);
  document.removeEventListener('keydown', activeFrame.onKey, true);
  activeFrame = null;
}

function openImageFrame(view, span, img, from, to) {
  closeImageFrame();
  span.classList.add('resizing');
  const handle = document.createElement('span');
  handle.className = 'md-img-handle';
  handle.title = 'Drag to resize — double-click the image to edit its Markdown';
  span.appendChild(handle);

  const off = (e) => {
    if (!span.contains(e.target)) closeImageFrame();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeImageFrame();
  };
  document.addEventListener('mousedown', off, true);
  document.addEventListener('keydown', onKey, true);
  activeFrame = { span, off, onKey };

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = img.getBoundingClientRect().width;
    const startH = img.getBoundingClientRect().height;
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
    // Shift unlocks the aspect ratio and writes an explicit `|WxH`
    let usedShift = !!e.shiftKey;
    document.body.classList.add('md-img-dragging');
    const move = (me) => {
      if (me.shiftKey) usedShift = true;
      const w = Math.max(40, Math.round(startW + (me.clientX - startX)));
      img.style.width = w + 'px';
      if (usedShift) {
        img.style.height = Math.max(30, Math.round(startH + (me.clientY - startY))) + 'px';
      } else {
        img.style.height = ratio ? Math.round(w / ratio) + 'px' : 'auto';
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('md-img-dragging');
      const w = Math.round(parseFloat(img.style.width) || startW);
      const h = usedShift ? Math.round(parseFloat(img.style.height) || startH) : 0;
      writeImageWidth(view, from, to, w, h);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

export class TocWidget extends WidgetType {
  constructor(block) {
    super();
    this.block = block;
    this.key = (block.headings || []).map((h) => `${h.level}:${h.line}:${h.text}`).join('|');
  }

  eq(other) {
    return other.block.from === this.block.from && other.key === this.key;
  }

  toDOM(view) {
    const nav = document.createElement('nav');
    nav.className = 'md-block md-toc';
    const title = document.createElement('div');
    title.className = 'md-toc-title';
    title.textContent = 'Table of Contents';
    nav.appendChild(title);

    const items = this.block.headings || [];
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'md-toc-empty';
      empty.textContent = 'No headings yet';
      nav.appendChild(empty);
      return nav;
    }

    const list = document.createElement('div');
    list.className = 'md-toc-list';
    for (const h of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `md-toc-item md-toc-l${h.level}`;
      row.textContent = h.text || '(untitled)';
      row.style.paddingLeft = `${(h.level - 1) * 14 + 4}px`;
      row.addEventListener('mousedown', (e) => e.stopPropagation());
      row.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        view.dispatch({ selection: { anchor: h.from }, scrollIntoView: true });
        view.focus();
      });
      list.appendChild(row);
    }
    nav.appendChild(list);
    return nav;
  }

  ignoreEvent() {
    return false;
  }
}

export class TaskWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'md-task';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    box.addEventListener('change', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: box.checked ? '[x]' : '[ ]' },
      });
      view.focus();
    });
    wrap.appendChild(box);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}
