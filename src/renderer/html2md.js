// Clipboard HTML -> Markdown, for the "smart paste" that turns a rich-text copy (browser,
// Word, Google Docs, another editor) into Markdown source instead of flattening it.
//
// Block elements become paragraphs separated by blank lines; inline elements become the
// matching Markdown spans. Anything with no Markdown equivalent (<u>, <kbd>) stays as
// the HTML tag Typora also keeps.

const INLINE_TAGS = new Set([
  'A', 'ABBR', 'ACRONYM', 'B', 'BDI', 'BDO', 'BIG', 'BR', 'BUTTON', 'CITE', 'CODE', 'DATA', 'DEL',
  'DFN', 'EM', 'FONT', 'I', 'IMG', 'INPUT', 'INS', 'KBD', 'LABEL', 'MARK', 'Q', 'RP', 'RT', 'RUBY',
  'S', 'SAMP', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'SVG', 'TIME', 'TT', 'U', 'VAR', 'WBR',
]);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'IFRAME', 'OBJECT']);
const ALERT_TYPES = new Set(['note', 'tip', 'important', 'warning', 'caution']);

const isText = (n) => n.nodeType === 3;
const isElement = (n) => n.nodeType === 1;
const isInline = (n) => isText(n) || (isElement(n) && INLINE_TAGS.has(n.tagName));

function styleOf(el) {
  const s = el.getAttribute && el.getAttribute('style');
  return s ? s.toLowerCase() : '';
}

// Google Docs wraps everything in <b style="font-weight:normal">; Word uses styled spans.
function effectiveTag(el) {
  const tag = el.tagName;
  const style = styleOf(el);
  if ((tag === 'B' || tag === 'STRONG') && /font-weight:\s*(normal|400|300)/.test(style)) return 'SPAN';
  if (tag === 'SPAN' || tag === 'FONT') {
    if (/font-weight:\s*(bold|bolder|[6-9]00)/.test(style)) return 'STRONG';
    if (/font-style:\s*italic/.test(style)) return 'EM';
    if (/text-decoration(?:-line)?:\s*[^;]*line-through/.test(style)) return 'DEL';
  }
  return tag;
}

function escapeText(s) {
  return s.replace(/([\\`*])/g, '\\$1').replace(/(^|[^\p{L}\p{N}])_/gu, '$1\\_');
}

function wrap(text, mark) {
  const inner = text.replace(/^\s+|\s+$/g, '');
  if (!inner) return text;
  const lead = /^\s/.test(text) ? ' ' : '';
  const tail = /\s$/.test(text) ? ' ' : '';
  return `${lead}${mark}${inner}${mark}${tail}`;
}

function inlineChildren(node) {
  let out = '';
  for (const child of node.childNodes) out += inlineNode(child);
  return out;
}

function inlineNode(n) {
  if (isText(n)) return escapeText(n.nodeValue.replace(/\u00a0/g, ' ').replace(/\s+/g, ' '));
  if (!isElement(n)) return '';
  if (DROP_TAGS.has(n.tagName)) return '';
  switch (effectiveTag(n)) {
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return wrap(inlineChildren(n), '**');
    case 'EM':
    case 'I':
      return wrap(inlineChildren(n), '*');
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return wrap(inlineChildren(n), '~~');
    case 'MARK':
      return wrap(inlineChildren(n), '==');
    case 'SUP':
      return wrap(inlineChildren(n), '^');
    case 'SUB':
      return wrap(inlineChildren(n), '~');
    case 'U':
    case 'INS': {
      const x = inlineChildren(n).trim();
      return x ? `<u>${x}</u>` : '';
    }
    case 'KBD':
      return `<kbd>${inlineChildren(n).trim()}</kbd>`;
    case 'CODE':
    case 'SAMP':
    case 'TT':
    case 'VAR': {
      const code = n.textContent.replace(/\n/g, ' ');
      if (!code.trim()) return '';
      const ticks = code.includes('`') ? '``' : '`';
      const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
      return `${ticks}${pad}${code}${pad}${ticks}`;
    }
    case 'A': {
      const href = (n.getAttribute('href') || '').trim();
      const text = inlineChildren(n).trim();
      if (!href || href.startsWith('javascript:')) return text;
      if (!text) return href.startsWith('mailto:') ? href.slice(7) : `<${href}>`;
      const title = n.getAttribute('title');
      return `[${text}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`;
    }
    case 'IMG': {
      const src = (n.getAttribute('src') || '').trim();
      if (!src) return '';
      const alt = (n.getAttribute('alt') || '').replace(/[[\]]/g, '').trim();
      return `![${alt}](${src})`;
    }
    case 'INPUT':
      return (n.getAttribute('type') || '').toLowerCase() === 'checkbox' ? (n.hasAttribute('checked') ? '[x] ' : '[ ] ') : '';
    case 'SVG':
      return '';
    default:
      if (INLINE_TAGS.has(n.tagName)) return inlineChildren(n);
      // a block element nested inside an inline one: rare, keep its text on its own lines
      return `\n${blockNode(n)}\n`;
  }
}

// Markdown would read a leading #, -, 1. or > as syntax, so escape those at line start.
function escapeLineStart(line) {
  return line.replace(/^(\s*)([#>+-]|\d+[.)])(?=\s)/, '$1\\$2');
}

function cleanInline(s) {
  return s
    .split('\n')
    .map((l) => escapeLineStart(l.replace(/^[ \t]+|[ \t]+$/g, '')))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\[([ x])\] {2,}/, '[$1] ') // checkbox + the text's own leading space
    .trim();
}

function blockChildren(node) {
  const out = [];
  let run = '';
  const flush = () => {
    const text = cleanInline(run);
    if (text) out.push(text);
    run = '';
  };
  for (const child of node.childNodes) {
    if (isInline(child)) {
      run += inlineNode(child);
      continue;
    }
    if (!isElement(child)) continue;
    flush();
    const block = blockNode(child);
    if (block) out.push(block);
  }
  flush();
  return out;
}

function languageOf(el) {
  for (const node of [el, el.parentElement]) {
    const cls = node && node.getAttribute && node.getAttribute('class');
    const m = cls && /(?:language|lang)-([\w#+-]+)/i.exec(cls);
    if (m) return m[1].toLowerCase();
    const lang = node && node.getAttribute && node.getAttribute('data-lang');
    if (lang) return lang;
  }
  return '';
}

function listBlock(el) {
  const ordered = el.tagName === 'OL';
  let n = parseInt(el.getAttribute('start'), 10) || 1;
  const items = [];
  for (const li of el.children) {
    if (li.tagName !== 'LI') continue;
    const marker = ordered ? `${n++}. ` : '- ';
    const indent = ' '.repeat(marker.length);
    const body = blockChildren(li).join('\n\n');
    const lines = body.split('\n');
    items.push(marker + lines.map((l, i) => (i === 0 ? l : l ? indent + l : l)).join('\n'));
  }
  return items.join('\n');
}

function tableBlock(el) {
  const rows = [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el);
  if (!rows.length) return '';
  const cells = (tr) =>
    [...tr.children]
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      .map((c) => cleanInline(inlineChildren(c)).replace(/\n/g, '<br>').replace(/\|/g, '\\|'));
  const matrix = rows.map(cells);
  const width = Math.max(...matrix.map((r) => r.length));
  if (!width) return '';
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  const out = [line(matrix[0]), `| ${Array(width).fill('---').join(' | ')} |`];
  for (const r of matrix.slice(1)) out.push(line(r));
  return out.join('\n');
}

function quoted(inner) {
  return inner.split('\n').map((l) => `> ${l}`.replace(/\s+$/, '')).join('\n');
}

function blockNode(el) {
  if (DROP_TAGS.has(el.tagName)) return '';
  const tag = el.tagName;
  const cls = el.getAttribute('class') || '';
  const alert = /markdown-alert-(\w+)/.exec(cls);
  if (tag === 'DIV' && alert && ALERT_TYPES.has(alert[1].toLowerCase())) {
    const title = el.querySelector('.markdown-alert-title');
    if (title) title.remove();
    return `> [!${alert[1].toUpperCase()}]\n${quoted(blockChildren(el).join('\n\n'))}`;
  }
  switch (tag) {
    case 'P':
      return cleanInline(inlineChildren(el));
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const text = cleanInline(inlineChildren(el)).replace(/\n/g, ' ').replace(/^\\/, '');
      return text ? `${'#'.repeat(Number(tag[1]))} ${text}` : '';
    }
    case 'HR':
      return '---';
    case 'PRE': {
      const code = el.querySelector('code') || el;
      const text = code.textContent.replace(/\n$/, '');
      const fence = text.includes('```') ? '~~~' : '```';
      return `${fence}${languageOf(code)}\n${text}\n${fence}`;
    }
    case 'BLOCKQUOTE':
      return quoted(blockChildren(el).join('\n\n'));
    case 'UL':
    case 'OL':
      return listBlock(el);
    case 'LI':
      return `- ${blockChildren(el).join('\n\n')}`;
    case 'TABLE':
      return tableBlock(el);
    case 'IMG':
      return inlineNode(el);
    default:
      return blockChildren(el).join('\n\n');
  }
}

/** True when the HTML carries no formatting worth keeping (code editors, terminals). */
export function htmlLooksPlain(html, text) {
  if (!html) return true;
  const semantic = /<(a|b|strong|em|i|h[1-6]|ul|ol|li|table|pre|code|blockquote|img|del|s|mark|sup|sub|u|kbd|hr)\b/i;
  if (!semantic.test(html)) return true;
  // code-editor copies: a single <pre>/<div> full of coloured spans whose text equals the plain flavour
  const md = htmlToMarkdown(html);
  const squash = (s) => String(s || '').replace(/\\([\\`*_#>+-])/g, '$1').replace(/\s+/g, '');
  return squash(md) === squash(text);
}

export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script, style, template, noscript').forEach((el) => el.remove());
  const blocks = blockChildren(doc.body || doc.documentElement);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
