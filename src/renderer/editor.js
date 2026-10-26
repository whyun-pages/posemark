// CodeMirror 6 editor setup, Typora-ish commands and editor-level state.
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLineGutter,
  placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { syntaxHighlighting, HighlightStyle, LanguageDescription, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { livePreview, focusMode, setFocusMode } from './live-preview.js';
import { ctx } from './paths.js';

const mdHighlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--link)' },
  { tag: tags.url, color: 'var(--muted)' },
  { tag: tags.monospace, fontFamily: 'var(--mono)' },
  { tag: tags.processingInstruction, color: 'var(--muted)' },
  { tag: tags.contentSeparator, color: 'var(--muted)' },
  // fenced-code content while the caret is inside the block (codeLanguages below)
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--hl-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--hl-string)' },
  { tag: [tags.comment, tags.blockComment, tags.lineComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--hl-number)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.variableName)], color: 'var(--hl-title)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--hl-builtin)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--hl-variable)' },
]);

// Languages highlighted while editing a fence. Anything else falls back to plain text;
// the rendered (non-editing) view still uses highlight.js for the long tail.
// (A `LanguageDescription` list rather than a function: the function form of
// `codeLanguages` does not get mounted by @lezer/markdown here.)
const CODE_LANGS = [
  LanguageDescription.of({ name: 'js', alias: ['javascript', 'jsx', 'mjs', 'cjs'], support: javascript() }),
  LanguageDescription.of({ name: 'ts', alias: ['typescript', 'tsx'], support: javascript({ typescript: true }) }),
  LanguageDescription.of({ name: 'python', alias: ['py'], support: python() }),
  LanguageDescription.of({ name: 'json', alias: ['jsonc', 'json5'], support: json() }),
];

const tabSize = new Compartment();
const spellcheckAttr = new Compartment();
// Live preview can be swapped out at runtime to get "source code mode".
export const sourceMode = new Compartment();

// ---------------------------------------------------------------------------
// smart typography: -- -> em dash, ... -> ellipsis, straight quotes -> curly
// ---------------------------------------------------------------------------
const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode', 'CodeText', 'HTMLBlock']);

function inCodeAt(state, pos) {
  let node = syntaxTree(state).resolveInner(Math.min(Math.max(pos, 0), state.doc.length), -1);
  while (node) {
    if (CODE_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

const WORD = /[\p{L}\p{N}]/u;

export const smartTypography = EditorView.inputHandler.of((view, from, to, text) => {
  if (ctx.config.smartTypography === false) return false;
  if (!text || text.length !== 1) return false;
  if (to !== from) return false;
  const state = view.state;
  const doc = state.doc;
  if (inCodeAt(state, from)) return false;

  const prev1 = from > 0 ? doc.sliceString(from - 1, from) : '';
  const prev2 = from > 1 ? doc.sliceString(from - 2, from - 1) : '';
  const next1 = doc.sliceString(to, to + 1);
  const line = doc.lineAt(from);

  let start = from;
  let replacement = '';

  if (text === '.' && prev1 === '.' && prev2 === '.') {
    start = from - 2;
    replacement = '\u2026';
  } else if (text === '-' && prev1 === '-') {
    // keep `---` usable as front matter / horizontal rule: never convert at line start
    const beforePair = from > 1 ? doc.sliceString(from - 2, from - 1) : '';
    if (beforePair === '-' || from - 1 <= line.from) return false;
    start = from - 1;
    replacement = '\u2014';
  } else if (text === "'") {
    replacement = WORD.test(prev1) ? '\u2019' : WORD.test(next1) ? '\u2018' : '\u2019';
  } else if (text === '"') {
    replacement = !prev1 || /[\s([{<\u2014\u2013-]/.test(prev1) ? '\u201c' : '\u201d';
  } else {
    return false;
  }

  view.dispatch({
    changes: { from: start, to, insert: replacement },
    selection: { anchor: start + replacement.length },
    userEvent: 'input.type',
    scrollIntoView: true,
  });
  return true;
});

export function createEditor({ parent, doc = '', onChange, onCursor, onScroll }) {
  const state = EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      EditorView.lineWrapping,
      placeholder('Start writing… Markdown syntax is rendered as you type.'),
      markdown({ base: markdownLanguage, addKeymap: true, codeLanguages: CODE_LANGS }),
      syntaxHighlighting(mdHighlight),
      search({ top: true }),
      keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
      smartTypography,
      tabSize.of(EditorState.tabSize.of(4)),
      spellcheckAttr.of(EditorView.contentAttributes.of({ spellcheck: 'true' })),
      sourceMode.of(livePreview),
      focusMode,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange?.(u);
        if (u.selectionSet || u.docChanged) onCursor?.(u.state);
        if (u.docChanged) {
          const el = u.view.scrollDOM;
          onScroll?.(el.scrollTop);
        }
      }),
      EditorView.domEventHandlers({
        scroll: (_e, view) => {
          onScroll?.(view.scrollDOM.scrollTop);
        },
      }),
    ],
  });

  const view = new EditorView({ state, parent });
  return view;
}

// ---------------------------------------------------------------------------
// document helpers
// ---------------------------------------------------------------------------
export function setDoc(view, text, { preserveView = false } = {}) {
  const scroll = view.scrollDOM.scrollTop;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
  });
  if (!preserveView) view.scrollDOM.scrollTop = 0;
  else view.scrollDOM.scrollTop = scroll;
}

const selectedLines = (view) => {
  const { state } = view;
  const out = [];
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) out.push(state.doc.line(n));
  }
  return out;
};

function applyLineChanger(view, changer) {
  const { state } = view;
  const changes = [];
  const seen = new Set();
  for (const line of selectedLines(view)) {
    if (seen.has(line.number)) continue;
    seen.add(line.number);
    const next = changer(line.text, line.number);
    if (next !== null && next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  if (changes.length) view.dispatch({ changes });
  return changes.length > 0;
}

function wrapSelection(view, before, after = before, { placeholder: ph } = {}) {
  const { state } = view;
  const changes = [];
  const ranges = [];
  for (const range of state.selection.ranges) {
    const sel = state.sliceDoc(range.from, range.to);
    if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
      const inner = sel.slice(before.length, sel.length - after.length);
      changes.push({ from: range.from, to: range.to, insert: inner });
      ranges.push(EditorSelection.range(range.from, range.from + inner.length));
    } else {
      const inner = sel || ph || '';
      changes.push({ from: range.from, to: range.to, insert: before + inner + after });
      const start = range.from + before.length;
      ranges.push(EditorSelection.range(start, start + inner.length));
    }
  }
  view.dispatch({ changes, selection: EditorSelection.create(ranges, 0), userEvent: 'input.format' });
  view.focus();
}

export function toggleWrap(view, before, after = before, opts) {
  wrapSelection(view, before, after, opts);
}

// ---------------------------------------------------------------------------
// paragraph commands
// ---------------------------------------------------------------------------
export function setHeading(view, level) {
  applyLineChanger(view, (text) => {
    const stripped = text.replace(/^(\s*)(#{1,6}\s+)?/, '$1');
    if (!level) return stripped;
    return `${stripped.replace(/^\s*/, '')}`.replace(/^(.*)$/, `${'#'.repeat(level)} $1`);
  });
}

export function stepHeading(view, delta) {
  applyLineChanger(view, (text) => {
    const m = /^(\s*)(#{1,6})\s+(.*)$/.exec(text);
    if (!m) return `${'#'.repeat(Math.max(1, Math.min(6, 1)))} ${text}`;
    const level = Math.max(1, Math.min(6, m[2].length + delta));
    return `${m[1]}${'#'.repeat(level)} ${m[3]}`;
  });
}

export function togglePrefix(view, prefix, detect) {
  const re = detect || new RegExp(`^\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  applyLineChanger(view, (text) => {
    const m = /^(\s*)(.*)$/.exec(text);
    if (re.test(text)) return m[1] + m[2].replace(re, '').replace(/^\s+/, '');
    return `${m[1]}${prefix}${m[2]}`;
  });
}

export function toggleQuote(view) {
  applyLineChanger(view, (text) => {
    const m = /^(\s*)>\s?/.exec(text);
    if (m) return m[1] + text.slice(m[0].length);
    return `> ${text}`;
  });
}

export function toggleList(view, marker) {
  const isOrdered = marker !== '- ';
  applyLineChanger(view, (text, n) => {
    const existing = /^(\s*)([-*+]|\d+[.)])\s+/.exec(text);
    const body = existing ? text.slice(existing[0].length) : text;
    if (existing && (isOrdered ? /\d/.test(existing[2]) : /[-*+]/.test(existing[2]))) {
      return body;
    }
    const order = isOrdered ? `${n}. ` : '- ';
    return `${existing ? existing[1] : ''}${order}${body}`;
  });
}

export function toggleTask(view) {
  applyLineChanger(view, (text) => {
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(text)) return text.replace(/^(\s*[-*+]\s+)\[[ xX]\]\s+/, '$1');
    const m = /^(\s*)([-*+]\s+)?(.*)$/.exec(text);
    return `${m[1]}- [ ] ${m[3]}`;
  });
}

export function indentLines(view, dir = 1) {
  const size = ctx.config.indentSize || 4;
  applyLineChanger(view, (text) => {
    if (dir > 0) return ' '.repeat(size) + text;
    return text.replace(new RegExp(`^ {1,${size}}`), '');
  });
}

export function insertBlock(view, text, cursorOffset = null) {
  const { state } = view;
  const range = state.selection.main;
  const before = state.doc.sliceString(0, range.to);
  const after = state.doc.sliceString(range.to);
  const prefix = before.length && !before.endsWith('\n') ? '\n' : '';
  const suffix = after.length && !after.startsWith('\n') ? '\n' : '';
  const insert = prefix + text + suffix;
  const end = range.to + insert.length;
  const caret = cursorOffset === null ? end - suffix.length : range.to + prefix.length + cursorOffset;
  view.dispatch({
    changes: { from: range.to, to: range.to, insert },
    selection: { anchor: caret },
  });
  view.focus();
}

export function insertTable(view) {
  insertBlock(view, '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
}

export function insertCodeFence(view, lang = '') {
  const { state } = view;
  const sel = state.sliceDoc(state.selection.main.from, state.selection.main.to);
  insertBlock(view, `\`\`\`${lang}\n${sel}\n\`\`\`\n`);
}

export function insertMathBlock(view) {
  insertBlock(view, '$$\n\n$$\n', 3);
}

export function insertRule(view) {
  insertBlock(view, '---\n');
}

export function insertLink(view) {
  const { state } = view;
  const sel = state.sliceDoc(state.selection.main.from, state.selection.main.to);
  if (/^https?:\/\//i.test(sel)) {
    insertBlock(view, `[](${sel})`);
    const pos = state.selection.main.to + 2;
    view.dispatch({ selection: { anchor: pos } });
    return;
  }
  wrapSelection(view, '[', '](https://)', { placeholder: sel || 'text' });
  const { from } = view.state.selection.main;
  const end = view.state.doc.lineAt(from).to;
  view.dispatch({ selection: { anchor: end - 1, head: end - 1 } });
}

export function insertImage(view, src = '') {
  insertBlock(view, `![](${src})`, 4);
}

export function clearStyle(view) {
  const { state } = view;
  const changes = [];
  for (const range of state.selection.ranges) {
    if (range.empty) continue;
    const text = state.sliceDoc(range.from, range.to);
    const plain = text
      .replace(/(\*\*|__|~~|==|`|\*|_)/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '');
    changes.push({ from: range.from, to: range.to, insert: plain });
  }
  if (changes.length) view.dispatch({ changes });
  view.focus();
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------
export const markCompartment = tabSize;

export function setSourceMode(view, on) {
  view.dispatch({ effects: sourceMode.reconfigure(on ? [] : livePreview) });
}

export function setSpellcheck(view, on) {
  view.dispatch({ effects: spellcheckAttr.reconfigure(EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' })) });
}

export function enableFocusMode(view, on) {
  setFocusMode(view, on);
}

export function scrollCaretToCenter(view) {
  const head = view.state.selection.main.head;
  view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
}

export function gotoLine(view, n) {
  const { doc } = view.state;
  const line = doc.line(Math.max(1, Math.min(doc.lines, n)));
  view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
  view.focus();
}

export function openFind(view) {
  openSearchPanel(view);
}

export function docStats(text) {
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9_'\u00c0-\u024f]+/g) || []).length;
  const lines = text ? text.split('\n').length : 0;
  return { words: cjk + words, chars: text.replace(/\s/g, '').length, lines };
}

export { ctx };
