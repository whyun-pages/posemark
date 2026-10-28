// Markdown rendering used for HTML export, copy-as-HTML and inline table rendering.
import MarkdownIt from 'markdown-it';
import { full as emojiPlugin } from 'markdown-it-emoji';
import katex from 'katex';
import { highlightCode, isDiagramLang } from './syntax.js';
import { ctx, resolveSrc } from './paths.js';
import { diagramSource } from './diagrams.js';
import { renderTex, numberEquations, prepareTex, labelsOf, renderRefText } from './math.js';

export const mdit = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
});

// :smile: → 😄 (GitHub shortcodes); the live preview uses the same table (see emoji.js)
mdit.use(emojiPlugin);
mdit.renderer.rules.emoji = (tokens, idx) =>
  ctx.config.emoji === false ? mdit.utils.escapeHtml(tokens[idx].markup) : tokens[idx].content;
const emojiRule = mdit.core.ruler.__rules__.find((r) => r.name === 'emoji');
if (emojiRule) {
  const orig = emojiRule.fn;
  emojiRule.fn = (state) => (ctx.config.emoji === false ? undefined : orig(state));
}

// ---------------------------------------------------------------------------
// GitHub-style alerts: a blockquote whose first line is `[!NOTE]` / `[!TIP]` / …
// ---------------------------------------------------------------------------
export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'];
const ALERT_RE = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i;

mdit.core.ruler.before('inline', 'posemark_alerts', (state) => {
  if (ctx.config.githubAlerts === false) return;
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== 'blockquote_open') continue;
    const p = tokens[i + 1];
    const inline = tokens[i + 2];
    if (!p || p.type !== 'paragraph_open' || !inline || inline.type !== 'inline') continue;
    const m = ALERT_RE.exec(inline.content);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const open = tokens[i];
    open.tag = 'div';
    open.attrJoin('class', `markdown-alert markdown-alert-${type}`);
    for (let k = i + 1, depth = 1; k < tokens.length; k++) {
      if (tokens[k].type === 'blockquote_open') depth++;
      else if (tokens[k].type === 'blockquote_close' && --depth === 0) {
        tokens[k].tag = 'div';
        break;
      }
    }
    const title = new state.Token('html_block', '', 0);
    title.content = `<p class="markdown-alert-title">${type[0].toUpperCase()}${type.slice(1)}</p>\n`;
    inline.content = inline.content.slice(m[0].length);
    if (inline.content.trim()) tokens.splice(i + 1, 0, title);
    else tokens.splice(i + 1, 3, title);
  }
});

// ---------------------------------------------------------------------------
// non-strict headings: `#Title` without the space (Typora's "strict mode" off)
// ---------------------------------------------------------------------------
mdit.block.ruler.before('heading', 'posemark_lenient_heading', (state, startLine, _endLine, silent) => {
  if (ctx.config.strictMode !== false) return false;
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.charCodeAt(pos) !== 0x23) return false;
  let level = 1;
  pos++;
  while (level <= 6 && pos < max && state.src.charCodeAt(pos) === 0x23) {
    level++;
    pos++;
  }
  if (level > 6 || pos >= max) return false;
  const next = state.src.charCodeAt(pos);
  if (next === 0x20 || next === 0x09) return false; // the standard rule handles these
  if (silent) return true;
  let end = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(end, 0x23, pos);
  if (tmp > pos && state.src.charCodeAt(tmp - 1) === 0x20) end = tmp;
  state.line = startLine + 1;
  const markup = '#'.repeat(level);
  const open = state.push('heading_open', `h${level}`, 1);
  open.markup = markup;
  open.map = [startLine, state.line];
  const inline = state.push('inline', '', 0);
  inline.content = state.src.slice(pos, end).trim();
  inline.map = [startLine, state.line];
  inline.children = [];
  const close = state.push('heading_close', `h${level}`, -1);
  close.markup = markup;
  return true;
});

// ---------------------------------------------------------------------------
// math
// ---------------------------------------------------------------------------
function renderMath(tex, displayMode, env, number = 0) {
  try {
    return renderTex(prepareTex(tex, { number, labels: env && env.mathLabels }), displayMode);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    return `<span class="katex-error" title="${mdit.utils.escapeHtml(message)}">${mdit.utils.escapeHtml(tex)}</span>`;
  }
}

mdit.inline.ruler.after('escape', 'math_inline', (state, silent) => {
  if (state.src[state.pos] !== '$') return false;
  if (state.src[state.pos + 1] === '$') return false;
  const start = state.pos;
  let pos = start + 1;
  while (pos < state.posMax) {
    const ch = state.src[pos];
    if (ch === '\\') {
      pos += 2;
      continue;
    }
    if (ch === '$') break;
    pos++;
  }
  if (pos >= state.posMax) return false;
  const content = state.src.slice(start + 1, pos);
  if (!content.trim()) return false;
  if (silent) return true;
  const token = state.push('math_inline', 'math', 0);
  token.content = content;
  token.markup = '$';
  state.pos = pos + 1;
  return true;
});

mdit.renderer.rules.math_inline = (tokens, idx, _o, env) => renderMath(tokens[idx].content, false, env);

// \( … \) inline math, and \eqref{} / \ref{} in prose
// (registered ahead of `escape`, which would otherwise swallow the backslash)
mdit.inline.ruler.before('escape', 'math_inline_paren', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x5c /* \\ */ || state.src[state.pos + 1] !== '(') return false;
  const end = state.src.indexOf('\\)', state.pos + 2);
  if (end < 0 || end > state.posMax) return false;
  const content = state.src.slice(state.pos + 2, end);
  if (!content.trim()) return false;
  if (silent) return true;
  const token = state.push('math_inline', 'math', 0);
  token.content = content;
  token.markup = '\\(';
  state.pos = end + 2;
  return true;
});

mdit.inline.ruler.before('escape', 'math_ref', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x5c) return false;
  const m = /^\\(eqref|ref)\{([^}\n]+)\}/.exec(state.src.slice(state.pos, state.posMax));
  if (!m) return false;
  if (silent) return true;
  const token = state.push('math_ref', 'a', 0);
  token.content = m[2].trim();
  state.pos += m[0].length;
  return true;
});

mdit.renderer.rules.math_ref = (tokens, idx, _o, env) => {
  const label = tokens[idx].content;
  const text = renderRefText(env && env.mathLabels, label);
  return `<a class="eqref" href="#eq-${mdit.utils.escapeHtml(encodeURIComponent(label))}">${mdit.utils.escapeHtml(text)}</a>`;
};

// Typora-style extras: ==mark==, ^sup^, ~sub~
function extraInline(marker, tag) {
  mdit.inline.ruler.after('escape', `extra_${tag}`, (state, silent) => {
    if (!state.src.startsWith(marker, state.pos)) return false;
    const start = state.pos + marker.length;
    const end = state.src.indexOf(marker, start);
    if (end < 0 || end === start) return false;
    const content = state.src.slice(start, end);
    if (!content.trim()) return false;
    if (silent) return true;
    const token = state.push(`extra_${tag}`, 'span', 0);
    token.content = content;
    state.pos = end + marker.length;
    return true;
  });
  mdit.renderer.rules[`extra_${tag}`] = (tokens, idx) => `<${tag}>${mdit.utils.escapeHtml(tokens[idx].content)}</${tag}>`;
}

extraInline('==', 'mark');
extraInline('^', 'sup');

mdit.inline.ruler.after('extra_sup', 'extra_sub', (state, silent) => {
  if (state.src[state.pos] !== '~' || state.src[state.pos + 1] === '~') return false;
  const start = state.pos + 1;
  const end = state.src.indexOf('~', start);
  if (end < 0 || end === start) return false;
  if (silent) return true;
  const token = state.push('extra_sub', 'sub', 0);
  token.content = state.src.slice(start, end);
  state.pos = end + 1;
  return true;
});
mdit.renderer.rules.extra_sub = (tokens, idx) => `<sub>${mdit.utils.escapeHtml(tokens[idx].content)}</sub>`;

mdit.block.ruler.before('fence', 'math_block', (state, startLine, _endLine, silent) => {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== '$$') return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;

  let lastLine = '';
  let next = startLine;
  let found = false;

  if (firstLine.trim().endsWith('$$')) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  while (!found) {
    next++;
    if (next >= state.lineMax) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith('$$')) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }

  if (!found) return false;

  state.line = next + 1;

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = [firstLine, ...rangeLines(state, startLine + 1, next), lastLine].join('\n').trim();
  token.map = [startLine, state.line];
  token.markup = '$$';
  return true;
});

function rangeLines(state, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    const pos = state.bMarks[i] + state.tShift[i];
    const max = state.eMarks[i];
    out.push(state.src.slice(pos, max));
  }
  return out;
}

// \[ … \] display math, LaTeX style
mdit.block.ruler.before('fence', 'math_block_bracket', (state, startLine, _endLine, silent) => {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (pos + 2 > max || state.src.slice(pos, pos + 2) !== '\\[') return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  if (silent) return true;
  let lastLine = '';
  let next = startLine;
  let found = false;
  if (firstLine.trim().endsWith('\\]')) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  while (!found) {
    next++;
    if (next >= state.lineMax) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith('\\]')) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }
  if (!found) return false;
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = [firstLine, ...rangeLines(state, startLine + 1, next), lastLine].join('\n').trim();
  token.map = [startLine, state.line];
  token.markup = '\\[';
  return true;
});

// Equation numbering + \label registry: display equations in document order
const isMathFence = (t) => t.type === 'fence' && (t.info || '').trim().split(/\s+/)[0].toLowerCase() === 'math';
mdit.core.ruler.after('block', 'posemark_math_numbers', (state) => {
  const eqs = state.tokens.filter((t) => t.type === 'math_block' || isMathFence(t));
  const { numbers, labels } = numberEquations(eqs.map((t) => ({ tex: t.content })), ctx.config.mathNumbering || 'none');
  eqs.forEach((t, i) => {
    t.meta = { ...(t.meta || {}), number: numbers[i], labels: labelsOf(t.content) };
  });
  state.env.mathLabels = labels;
});

const mathBlockHtml = (token, env) => {
  const number = (token.meta && token.meta.number) || 0;
  const label = token.meta && token.meta.labels && token.meta.labels[0];
  const id = label ? ` id="eq-${mdit.utils.escapeHtml(encodeURIComponent(label))}"` : '';
  return `<div class="math-block"${id}${number ? ` data-eq="${number}"` : ''}>${renderMath(token.content, true, env, number)}</div>\n`;
};
mdit.renderer.rules.math_block = (tokens, idx, _o, env) => mathBlockHtml(tokens[idx], env);

// ---------------------------------------------------------------------------
// fenced code
// ---------------------------------------------------------------------------
mdit.renderer.rules.fence = (tokens, idx, _o, env) => {
  const token = tokens[idx];
  const info = (token.info || '').trim();
  const lang = info.split(/\s+/)[0].toLowerCase();
  if (isDiagramLang(lang)) {
    // sequence / flow fences are translated to Mermaid; data-src carries what gets rendered
    const src = diagramSource(lang, token.content) ?? token.content;
    return `<div class="mermaid" data-lang="${mdit.utils.escapeHtml(lang)}" data-src="${mdit.utils.escapeHtml(src)}">${mdit.utils.escapeHtml(token.content)}</div>\n`;
  }
  if (lang === 'math') return mathBlockHtml(token, env);
  const html = highlightCode(token.content, lang);
  const body = html === null ? mdit.utils.escapeHtml(token.content) : html;
  return `<pre class="code-block"${lang ? ` data-lang="${mdit.utils.escapeHtml(lang)}"` : ''}><code class="hljs${lang ? ` language-${mdit.utils.escapeHtml(lang)}` : ''}">${body}</code></pre>\n`;
};

// ---------------------------------------------------------------------------
// task lists
// ---------------------------------------------------------------------------
mdit.core.ruler.after('inline', 'posemark_task_list', (state) => {
  const tokens = state.tokens;
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'list_item_open') stack.push(t);
    else if (t.type === 'list_item_close') stack.pop();
    else if (t.type === 'inline' && stack.length) {
      const m = /^\[([ xX])\]\s+([\s\S]*)$/.exec(t.content);
      if (!m) continue;
      const checked = m[1].toLowerCase() === 'x';
      const children = [];
      state.md.inline.parse(m[2], state.md, state.env, children);
      const box = new state.Token('html_inline', '', 0);
      box.content = `<input class="task-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}>`;
      t.children = [box, ...children];
      t.content = m[2];
      stack[stack.length - 1].attrJoin('class', 'task-list-item');
      for (let k = i - 1; k >= 0; k--) {
        if (tokens[k].type === 'bullet_list_open' || tokens[k].type === 'ordered_list_open') {
          tokens[k].attrJoin('class', 'task-list');
          break;
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// headings + links
// ---------------------------------------------------------------------------
export function slugify(text) {
  const raw = String(text).trim();
  const explicit = /\{#([^}]+)\}\s*$/.exec(raw);
  if (explicit) return explicit[1].trim().toLowerCase();
  return raw
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// `## Title {#custom-id}` — drop the marker from the text and use it as the id.
mdit.core.ruler.after('inline', 'posemark_heading_ids', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== 'inline') continue;
    const m = /\s*\{#([^}]+)\}\s*$/.exec(inline.content);
    if (!m) continue;
    tokens[i].attrSet('id', m[1].trim());
    inline.content = inline.content.slice(0, m.index);
    const last = inline.children && inline.children[inline.children.length - 1];
    if (last && last.type === 'text') last.content = last.content.replace(/\s*\{#[^}]+\}\s*$/, '');
  }
});

mdit.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx];
  if (!token.attrGet('id')) {
    const inline = tokens[idx + 1];
    const text = inline ? inline.content : '';
    token.attrSet('id', slugify(text) || `h-${idx}`);
  }
  return `<${token.tag}${mdit.renderer.renderAttrs(token)}>`;
};

// Raw HTML (`<img src="a.png" width="320">`, `<video src="clip.mp4">`) keeps its attributes but
// the relative source has to be resolved like a Markdown image's.
const SRC_TAG_RE = /(<(?:img|video|audio|source)\b[^>]*?\ssrc\s*=\s*)("([^"]*)"|'([^']*)')/gi;
function resolveHtmlSources(html, env) {
  return html.replace(SRC_TAG_RE, (m, head, quoted, dq, sq) => {
    const src = dq ?? sq ?? '';
    const q = quoted[0];
    return `${head}${q}${resolveSrc(src, env && env.docPath)}${q}`;
  });
}
for (const kind of ['html_inline', 'html_block']) {
  const base = mdit.renderer.rules[kind] || ((tokens, idx) => tokens[idx].content);
  mdit.renderer.rules[kind] = (tokens, idx, options, env, self) => resolveHtmlSources(base(tokens, idx, options, env, self), env);
}

const defaultImage = mdit.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
mdit.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src');
  // `![alt|240](pic.png)` — width (and optional height) written by the resize handle
  const size = /^(.*?)\|\s*(\d+)(?:\s*x\s*(\d+))?\s*$/.exec(token.content || '');
  if (size) {
    token.content = size[1];
    if (token.children && token.children[0] && token.children[0].type === 'text') token.children[0].content = size[1];
    token.attrSet('width', size[2]);
    if (size[3]) token.attrSet('height', size[3]);
  }
  if (src) token.attrSet('src', resolveSrc(src, env && env.docPath));
  token.attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

// ---------------------------------------------------------------------------
// footnotes: [^label] references, [^label]: text definitions
// ---------------------------------------------------------------------------
export function extractFootnotes(source) {
  const lines = String(source).split(/\r?\n/);
  const kept = [];
  const defs = new Map();
  let i = 0;
  while (i < lines.length) {
    const m = /^\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(lines[i]);
    if (!m) {
      kept.push(lines[i]);
      i++;
      continue;
    }
    const label = m[1].toLowerCase();
    const body = [m[2]];
    i++;
    while (i < lines.length) {
      const cont = /^(?: {2,}|\t+)(.*)$/.exec(lines[i]);
      if (!cont || /^\[\^[^\]]+\]:/.test(lines[i])) break;
      body.push(cont[1]);
      i++;
    }
    defs.set(label, body.join('\n').trim());
  }
  return { body: kept.join('\n'), defs };
}

mdit.inline.ruler.after('escape', 'footnote_ref', (state, silent) => {
  const defs = state.env && state.env.footnotes;
  if (!defs || !state.src.startsWith('[^', state.pos)) return false;
  const end = state.src.indexOf(']', state.pos + 2);
  if (end < 0) return false;
  const label = state.src.slice(state.pos + 2, end).trim().toLowerCase();
  if (!label || !defs.has(label)) return false;
  if (silent) return true;
  const token = state.push('footnote_ref', 'sup', 0);
  token.meta = { label };
  state.pos = end + 1;
  return true;
});

mdit.renderer.rules.footnote_ref = (tokens, idx, _options, env) => {
  const label = tokens[idx].meta.label;
  const order = env.fnOrder || (env.fnOrder = []);
  let n = order.indexOf(label);
  if (n < 0) {
    order.push(label);
    n = order.length - 1;
  }
  const num = n + 1;
  return `<sup class="footnote-ref"><a href="#fn-${num}" id="fnref-${num}">${num}</a></sup>`;
};

// ---------------------------------------------------------------------------
// [TOC] — a table of contents generated from the headings that follow it
// ---------------------------------------------------------------------------
function renderTocHtml(heads) {
  if (!heads.length) return '';
  const out = ['<nav class="toc"><div class="toc-title">Table of Contents</div>'];
  let level = 0;
  for (const h of heads) {
    const lv = Math.max(1, Math.min(h.level, 6));
    if (lv > level) for (let k = level; k < lv; k++) out.push('<ul>');
    else if (lv < level) for (let k = lv; k < level; k++) out.push('</li></ul>');
    else out.push('</li>');
    out.push(`<li><a href="#${h.id}">${mdit.utils.escapeHtml(h.text)}</a>`);
    level = lv;
  }
  for (let k = 0; k < level; k++) out.push('</li></ul>');
  out.push('</nav>\n');
  return out.join('');
}

mdit.core.ruler.after('inline', 'posemark_toc', (state) => {
  const tokens = state.tokens;
  const heads = [];
  const tocAt = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open') {
      const inline = tokens[i + 1];
      const text = inline ? inline.content : '';
      const id = t.attrGet('id') || slugify(text);
      heads.push({
        level: Number(t.tag.slice(1)),
        text: text.replace(/[*_`$~=^]/g, '').replace(/\s*\{#[^}]+\}\s*$/, '').trim(),
        id,
      });
    } else if (t.type === 'paragraph_open') {
      const inline = tokens[i + 1];
      if (inline && /^\[toc\]$/i.test(inline.content.trim())) tocAt.push(i);
    }
  }
  for (let k = tocAt.length - 1; k >= 0; k--) {
    const i = tocAt[k];
    const html = new state.Token('html_block', '', 0);
    html.content = renderTocHtml(heads);
    if (html.content) tokens.splice(i, 3, html);
  }
});

// ---------------------------------------------------------------------------
// public helpers
// ---------------------------------------------------------------------------
export function splitFrontMatter(source) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!m) return { body: source, meta: null };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { body: source.slice(m[0].length), meta };
}

export function renderFragment(source, env = {}) {
  const { body } = splitFrontMatter(source);
  const { body: bodyNoFoot, defs } = extractFootnotes(body);
  const scope = { ...env, footnotes: defs, fnOrder: [] };
  // "Preserve single line breaks" — the editor always shows them, this carries them to the output
  mdit.set({ breaks: ctx.config.preserveLineBreaks === true });
  let html = mdit.render(bodyNoFoot, scope);
  const order = scope.fnOrder || [];
  if (order.length) {
    const items = order.map((label, k) => {
      const num = k + 1;
      const text = mdit
        .render(defs.get(label) || '', {})
        .replace(/^<p>/, '')
        .replace(/<\/p>\s*$/, '')
        .trim();
      return `<li id="fn-${num}"><p>${text} <a class="footnote-back" href="#fnref-${num}">\u21a9</a></p></li>`;
    });
    html += `\n<section class="footnotes">\n<ol>\n${items.join('\n')}\n</ol>\n</section>\n`;
  }
  return html;
}

export function buildStandaloneHtml({ title, bodyHtml, css, bodyClass = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${mdit.utils.escapeHtml(title || 'Untitled')}</title>
<style>
${css}
</style>
</head>
<body class="${bodyClass}">
<div class="markdown-body">
${bodyHtml}
</div>
</body>
</html>`;
}
