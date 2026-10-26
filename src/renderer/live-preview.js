// Typora-style "seamless" live preview: syntax markers are hidden outside of the
// line the caret sits on, and block constructs render in place as widgets.
//
// Both decoration sources are StateFields (CodeMirror forbids block/line
// decorations coming from view plugins).
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import katex from 'katex';
import {
  scanBlocks,
  CodeBlockWidget,
  MathBlockWidget,
  TableWidget,
  EditableTableWidget,
  DiagramWidget,
  ImageWidget,
  TaskWidget,
  MathLivePreviewWidget,
  MathFieldWidget,
  DiagramLivePreviewWidget,
  ImageLivePreviewWidget,
  TocWidget,
  ctx,
} from './blocks.js';

// ---------------------------------------------------------------------------
// scan cache (Text values are immutable, so a WeakMap keyed on them is safe)
// ---------------------------------------------------------------------------
const scanCache = new WeakMap();
function scan(doc) {
  let res = scanCache.get(doc);
  if (!res) {
    res = scanBlocks(doc);
    scanCache.set(doc, res);
  }
  return res;
}

// ---------------------------------------------------------------------------
// small widgets
// ---------------------------------------------------------------------------
class FootnoteRefWidget extends WidgetType {
  constructor(num, label, target) {
    super();
    this.num = num;
    this.label = label;
    this.target = target;
  }

  eq(other) {
    return other.num === this.num && other.target === this.target;
  }

  toDOM(view) {
    const sup = document.createElement('span');
    sup.className = 'md-fn-mark';
    sup.textContent = String(this.num);
    sup.title = `footnote ${this.label}`;
    sup.addEventListener('mousedown', (e) => e.stopPropagation());
    sup.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ selection: { anchor: this.target }, scrollIntoView: true });
      view.focus();
    });
    return sup;
  }

  ignoreEvent() {
    return false;
  }
}

// The `[^1]:` prefix on a definition line, rendered as a small badge.
class FootnoteBadge extends WidgetType {
  constructor(num) {
    super();
    this.num = num;
  }

  eq(other) {
    return other.num === this.num;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'md-fn-badge';
    span.textContent = `fn ${this.num}`;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

class InlineMathWidget extends WidgetType {
  constructor(tex) {
    super();
    this.tex = tex;
  }

  eq(other) {
    return other.tex === this.tex;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'md-math-inline';
    try {
      span.innerHTML = katex.renderToString(this.tex, { throwOnError: false, output: 'html' });
    } catch {
      span.textContent = `$${this.tex}$`;
    }
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const div = document.createElement('div');
    div.className = 'md-block md-hr';
    div.appendChild(document.createElement('hr'));
    return div;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function selectionLines(state) {
  const lines = new Set();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) lines.add(i);
  }
  return lines;
}

const LINE_CLASS_BY_TYPE = {
  code: 'cm-md-fence',
  math: 'cm-md-math-raw',
  table: 'cm-md-table-raw',
  diagram: 'cm-md-fence',
  frontmatter: 'cm-md-frontmatter',
};

const MARK_CLASS = {
  Emphasis: 'md-em',
  StrongEmphasis: 'md-strong',
  Strikethrough: 'md-strike',
  Subscript: 'md-sub',
  Superscript: 'md-sup',
};

// Extra Typora-ish inline syntax that lezer/GFM does not know about.
const EXTRA_INLINE = [{ re: /==([^=\n]+)==/g, cls: 'md-mark', mark: 2 }];
// ![alt](src "title") — used for the preview shown while editing an image line.
const IMG_RE = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g;

// ---------------------------------------------------------------------------
// decoration builder
// ---------------------------------------------------------------------------
function buildInner(state) {
  const doc = state.doc;
  const decos = [];
  const active = selectionLines(state);
  const { blocks, headings } = scan(doc);
  const replaced = [];

  const insideReplaced = (pos) => replaced.some(([f, t]) => pos > f && pos < t);

  const pushReplace = (from, to, deco) => {
    if (from >= to) return false;
    if (replaced.some(([f, t]) => from < t && to > f)) return false;
    decos.push(deco.range(from, to));
    replaced.push([from, to]);
    return true;
  };

  const addLineClasses = (from, to, cls) => {
    let line = doc.lineAt(from);
    for (;;) {
      decos.push(Decoration.line({ class: cls }).range(line.from));
      if (line.to >= to || line.number >= doc.lines) break;
      line = doc.line(line.number + 1);
    }
  };

  // ---- blocks ------------------------------------------------------------
  const frontMatterRanges = blocks.filter((b) => b.type === 'frontmatter').map((b) => [b.from, b.to]);
  const inFrontMatter = (pos) => frontMatterRanges.some(([f, t]) => pos >= f && pos <= t);

  for (const b of blocks) {
    const isActive = [...active].some((n) => n >= b.start && n <= b.end);
    if (isActive && b.type === 'table') {
      // a table opens as an editable grid instead of raw pipes
      pushReplace(b.from, b.to, Decoration.replace({ widget: new EditableTableWidget(b), block: true }));
      continue;
    }
    if (isActive && b.type === 'math') {
      // a $$ block opens as a field with the formula rendered underneath
      pushReplace(b.from, b.to, Decoration.replace({ widget: new MathFieldWidget(b.body, b), block: true }));
      continue;
    }
    if (isActive) {
      addLineClasses(b.from, b.to, LINE_CLASS_BY_TYPE[b.type] || 'cm-md-fence');
      // keep a rendered copy under the source while it is being edited
      if (b.type === 'diagram') {
        decos.push(
          Decoration.widget({ widget: new DiagramLivePreviewWidget(b.body, b), block: true, side: 1 }).range(b.to),
        );
      }
      continue;
    }
    let widget = null;
    switch (b.type) {
      case 'code': widget = new CodeBlockWidget(b.body, b.info, b); break;
      case 'math': widget = new MathBlockWidget(b.body, b); break;
      case 'table': widget = new TableWidget(b.body, b); break;
      case 'toc': widget = new TocWidget(b); break;
      case 'diagram': widget = new DiagramWidget(b.body, b); break;
      case 'frontmatter':
        addLineClasses(b.from, b.to, 'cm-md-frontmatter');
        continue;
      default:
        continue;
    }
    pushReplace(b.from, b.to, Decoration.replace({ widget, block: true }));
  }

  // ---- headings ----------------------------------------------------------
  for (const h of headings) {
    if (insideReplaced(h.from)) continue;
    const l = doc.line(h.line);
    decos.push(Decoration.line({ class: `cm-md-h${h.level}` }).range(l.from));
    if (h.level <= 2) decos.push(Decoration.line({ class: `cm-md-h${h.level}-line` }).range(l.from));
  }

  // ---- inline ------------------------------------------------------------
  const lineActive = (pos) => active.has(doc.lineAt(pos).number);
  const inlineCode = [];
  const inCode = (pos) => inlineCode.some(([f, t]) => pos >= f && pos <= t);

  // ---- footnotes: definitions + numbered references ---------------------
  // ---- footnotes: definitions + numbered references ----------------------
  const fnDefs = new Map();
  const fnNum = new Map();
  const FN_DEF = /^ {0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/;
  const FN_REF = /\[\^([^\]]+)\]/g;
  for (let n = 1; n <= doc.lines; n++) {
    const m = FN_DEF.exec(doc.line(n).text);
    if (m) fnDefs.set(m[1].toLowerCase(), { line: n, text: m[2], from: doc.line(n).from });
  }
  if (fnDefs.size) {
    for (let n = 1; n <= doc.lines; n++) {
      const text = doc.line(n).text;
      if (FN_DEF.test(text)) continue;
      FN_REF.lastIndex = 0;
      let m;
      while ((m = FN_REF.exec(text))) {
        const label = m[1].toLowerCase();
        if (fnDefs.has(label) && !fnNum.has(label)) fnNum.set(label, fnNum.size + 1);
      }
    }
  }

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (insideReplaced(line.from) || inCode(line.from)) continue;
    const fnDef = FN_DEF.exec(line.text);
    if (fnDef) {
      decos.push(Decoration.line({ class: 'cm-md-fn-def' }).range(line.from));
      const label = fnDef[1].toLowerCase();
      if (fnNum.has(label)) {
        const from = line.from + line.text.indexOf('[^');
        pushReplace(from, from + fnDef[1].length + 4, Decoration.replace({ widget: new FootnoteBadge(fnNum.get(label)) }));
      }
    } else if (fnNum.size && !active.has(n) && line.text.includes('[^')) {
      FN_REF.lastIndex = 0;
      let rm;
      while ((rm = FN_REF.exec(line.text))) {
        const label = rm[1].toLowerCase();
        const num = fnNum.get(label);
        if (!num) continue;
        const from = line.from + rm.index;
        if (from < line.from || insideReplaced(from)) continue;
        pushReplace(from, from + rm[0].length, Decoration.replace({ widget: new FootnoteRefWidget(num, label, fnDefs.get(label).from) }));
      }
    }

  }

  let tree = syntaxTree(state);
  if (tree.length < doc.length) tree = ensureSyntaxTree(state, doc.length, 400) || tree;

  tree.iterate({
    enter(node) {
      if (insideReplaced(node.from)) return false;
      const name = node.name;

      if (/^ATXHeading[1-6]$/.test(name)) return;

      if (name === 'Blockquote') {
        addLineClasses(node.from, node.to, 'md-quote');
        return;
      }
      if (name === 'FencedCode' || name === 'CodeBlock') {
        addLineClasses(node.from, node.to, 'cm-md-fence');
        return false;
      }
      if (name === 'HorizontalRule') {
        if (!lineActive(node.from) && !inFrontMatter(node.from)) {
          pushReplace(node.from, node.to, Decoration.replace({ widget: new RuleWidget(), block: true }));
        }
        return false;
      }
      if (name === 'Image') {
        if (lineActive(node.from)) {
          decos.push(Decoration.mark({ class: 'md-image-src' }).range(node.from, node.to));
          return false;
        }
        const raw = doc.sliceString(node.from, node.to);
        const m = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)?\s*(?:"([^"]*)")?\s*\)$/.exec(raw);
        if (m) {
          const widget = new ImageWidget((m[2] || '').replace(/^<|>$/g, ''), m[1], m[3] || '', {
            from: node.from,
            to: node.to,
          });
          pushReplace(node.from, node.to, Decoration.replace({ widget }));
        }
        return false;
      }
      if (name === 'InlineCode') {
        inlineCode.push([node.from, node.to]);
        decos.push(Decoration.mark({ class: 'md-inline-code' }).range(node.from, node.to));
        return;
      }
      if (name === 'Link') {
        decos.push(Decoration.mark({ class: 'md-link' }).range(node.from, node.to));
        if (!lineActive(node.from)) {
          const raw = doc.sliceString(node.from, node.to);
          if (raw.startsWith('[')) pushReplace(node.from, node.from + 1, Decoration.replace({}));
          const close = Math.max(raw.lastIndexOf(']('), raw.lastIndexOf(']['));
          if (close > 0) pushReplace(node.from + close, node.to, Decoration.replace({}));
        }
        return false;
      }
      if (name === 'EmphasisMark' || name === 'CodeMark' || name === 'StrikethroughMark' || name === 'QuoteMark' ||
          name === 'SubscriptMark' || name === 'SuperscriptMark') {
        if (!lineActive(node.from)) {
          let to = node.to;
          if (name === 'QuoteMark') {
            while (to < doc.length && /[ \t]/.test(doc.sliceString(to, to + 1))) to++;
          }
          pushReplace(node.from, to, Decoration.replace({}));
        }
        return false;
      }
      if (name === 'HeaderMark') {
        if (!lineActive(node.from)) {
          let to = node.to;
          while (to < doc.length && /[ \t]/.test(doc.sliceString(to, to + 1))) to++;
          pushReplace(node.from, to, Decoration.replace({}));
        }
        return false;
      }
      const cls = MARK_CLASS[name];
      if (cls) decos.push(Decoration.mark({ class: cls }).range(node.from, node.to));
    },
  });

  // ---- line-scanned constructs: task boxes, inline math, extra syntax -----
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const skip = insideReplaced(line.from) || inCode(line.from);
    if (skip) continue;

    const task = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s)/.exec(line.text);
    if (task) {
      const from = line.from + task[1].length;
      const to = from + 3;
      if (active.has(n)) {
        decos.push(Decoration.mark({ class: 'md-task-mark' }).range(from, to));
      } else {
        pushReplace(from, to, Decoration.replace({ widget: new TaskWidget(task[2].toLowerCase() === 'x', from, to) }));
      }
    }

    const lazy = active.has(n);
    // images: while the line is being edited, show the picture underneath its source
    if (lazy && line.text.includes('![')) {
      const found = [];
      IMG_RE.lastIndex = 0;
      let im;
      while ((im = IMG_RE.exec(line.text)) && found.length < 3) {
        if (inCode(line.from + im.index)) continue;
        found.push({ src: im[2], alt: im[1] || '', title: im[3] || '' });
      }
      if (found.length) {
        decos.push(
          Decoration.widget({ widget: new ImageLivePreviewWidget(found), block: true, side: 1 }).range(line.to),
        );
      }
    }
    if (ctx.config.inlineMath !== false && !lazy && line.text.includes('$')) {
      const re = /(^|[^\\$])\$(?![\s$])([^$\n]+?)(?<![\s$])\$(?!\d)/g;
      let mm;
      while ((mm = re.exec(line.text))) {
        const from = line.from + mm.index + mm[1].length;
        const to = from + mm[0].length - mm[1].length;
        if (inCode(from) || insideReplaced(from)) continue;
        pushReplace(from, to, Decoration.replace({ widget: new InlineMathWidget(mm[2]) }));
      }
    }

    if (!lazy && line.text.length < 400) {
      for (const { re, cls, mark } of EXTRA_INLINE) {
        re.lastIndex = 0;
        let em;
        while ((em = re.exec(line.text))) {
          const start = line.from + em.index;
          if (inCode(start) || insideReplaced(start)) continue;
          const end = start + em[0].length;
          const w = mark || 1;
          if (!pushReplace(start, start + w, Decoration.replace({}))) continue;
          if (!pushReplace(end - w, end, Decoration.replace({}))) continue;
          decos.push(Decoration.mark({ class: cls }).range(start + w, end - w));
        }
      }
    }
  }

  return Decoration.set(decos, true);
}

export const livePreviewField = StateField.define({
  create(state) {
    try {
      return buildInner(state);
    } catch (err) {
      console.error('live preview failed', err);
      return Decoration.none;
    }
  },
  update(deco, tr) {
    if (!tr.docChanged && !tr.selection) return deco;
    try {
      return buildInner(tr.state);
    } catch (err) {
      console.error('live preview failed', err);
      return Decoration.none;
    }
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Drop-in extension: source code mode removes it via a compartment. */
export const livePreview = livePreviewField;

// ---------------------------------------------------------------------------
// focus mode: dim everything but the current block
// ---------------------------------------------------------------------------
export const setFocusEffect = StateEffect.define();

export const focusEnabledField = StateField.define({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFocusEffect)) return effect.value;
    return value;
  },
});

function buildFocus(state) {
  const doc = state.doc;
  const head = state.selection.main.head;
  const isBlank = (n) => (n < 1 || n > doc.lines ? true : !doc.line(n).text.trim());
  let start = doc.lineAt(head).number;
  let end = start;
  while (!isBlank(start - 1)) start--;
  while (!isBlank(end + 1)) end++;
  const keep = (n) => n >= start - 1 && n <= end + 1;

  const decos = [];
  const from = Math.max(1, start - 600);
  const to = Math.min(doc.lines, end + 600);
  for (let n = from; n <= to; n++) {
    if (!keep(n)) decos.push(Decoration.line({ class: 'cm-focus-dim' }).range(doc.line(n).from));
  }
  return Decoration.set(decos, true);
}

export const focusDecoField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    if (!tr.state.field(focusEnabledField)) return Decoration.none;
    if (tr.docChanged || tr.selection || tr.effects.length) return buildFocus(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const focusMode = [focusEnabledField, focusDecoField];

export function setFocusMode(view, on) {
  view.dispatch({ effects: setFocusEffect.of(!!on) });
}
