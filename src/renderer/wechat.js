// "Copy for WeChat" — flatten the document into a fragment the 公众号 editor keeps.
//
// The WeChat editor throws away every stylesheet, <style> block and class rule, so
// everything has to be inline styles on plain elements. Anything it cannot hold
// (KaTeX's layout spans, mermaid's <svg>) is rasterised to a PNG first.
import mermaid from 'mermaid';
import { renderFragment, splitFrontMatter } from './markdown.js';

const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

// ---------------------------------------------------------------------------
// theme -> inline style table
// ---------------------------------------------------------------------------
// Style options (Preferences › Export › Copy for WeChat). Missing keys fall back here.
export const WECHAT_DEFAULTS = {
  theme: 'current', // a light theme id, or 'current' to follow the editor
  fontSize: 16,
  lineHeight: 1.75,
  letterSpacing: 0.02, // em
  paragraphSpacing: 16, // px under paragraphs, lists, quotes, code
  justify: false,
  accent: '', // '' = the theme's link colour
  headingStyle: 'bar', // h2 decoration: bar | underline | badge | plain
  firstLineIndent: false, // 2em text-indent on body paragraphs
  codeLang: true, // small language label at the top of fenced code
  linkRefs: true, // append a 参考链接 list for the URLs that 公众号 will not keep
};

// Colours are read from a theme's custom properties. A theme other than the one on
// screen is loaded into a throwaway iframe so its :root variables can be measured.
// Dark themes are never used: 公众号 shows the article on white.
export async function themeTokens(themeId) {
  const themes = await window.ink.themes();
  const current = document.body.dataset.theme || 'default';
  let id = themeId && themeId !== 'current' ? themeId : current;
  if (themes.find((t) => t.id === id)?.dark) id = 'default';
  if (id === current) return readTokens(getComputedStyle(document.body));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px;border:0';
  frame.srcdoc = `<!doctype html><link rel="stylesheet" href="styles/themes/${id}.css"><body></body>`;
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
  document.body.appendChild(frame);
  try {
    await loaded;
    return readTokens(frame.contentWindow.getComputedStyle(frame.contentDocument.body));
  } finally {
    frame.remove();
  }
}

function readTokens(cs) {
  const v = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    bg: v('--bg', '#ffffff'),
    fg: v('--fg', '#24292f'),
    soft: v('--fg-soft', '#3a4048'),
    muted: v('--fg-muted', '#6a737d'),
    faint: v('--fg-faint', '#9aa3ad'),
    border: v('--border', '#e4e6e9'),
    accent: v('--link', '#1f6feb'),
    accentSoft: v('--accent-soft', '#cfe2fb'),
    codeBg: v('--code-block-bg', '#f7f8fa'),
    codeInlineBg: v('--code-inline-bg', '#f2f3f5'),
    codeInlineFg: v('--code-inline-fg', '#b3261e'),
    quoteBar: v('--quote-bar', '#d5d9de'),
    quoteBg: v('--hover', '#f0f1f3'),
    tableBorder: v('--table-border', '#e2e5e9'),
    tableHead: v('--table-head', '#f6f7f9'),
    highlight: v('--highlight-bg', '#fff3b8'),
    hlComment: v('--hl-comment', '#6e7781'),
    hlKeyword: v('--hl-keyword', '#cf222e'),
    hlString: v('--hl-string', '#0a3069'),
    hlNumber: v('--hl-number', '#0550ae'),
    hlTitle: v('--hl-title', '#8250df'),
    hlBuiltin: v('--hl-builtin', '#953800'),
    hlVariable: v('--hl-variable', '#24292f'),
    hlMeta: v('--hl-meta', '#116329'),
    danger: v('--danger', '#c62828'),
  };
}

// hljs class -> colour, mirroring editor.css so code looks the same in WeChat.
function hlStyle(cls, T) {
  const has = (n) => cls.includes(`hljs-${n}`);
  if (has('comment') || has('quote')) return `color:${T.hlComment};font-style:italic`;
  if (has('keyword') || has('selector-tag') || has('literal') || has('type')) return `color:${T.hlKeyword}`;
  if (has('string') || has('regexp') || has('addition') || has('attribute')) return `color:${T.hlString}`;
  if (has('number') || has('symbol') || has('bullet')) return `color:${T.hlNumber}`;
  if (has('title') || has('section') || has('name')) return `color:${T.hlTitle}`;
  if (has('built_in')) return `color:${T.hlBuiltin}`;
  if (has('variable') || has('template-variable') || has('params')) return `color:${T.hlVariable}`;
  if (has('meta') || has('doctag')) return `color:${T.hlMeta}`;
  if (has('deletion')) return `color:${T.danger}`;
  if (has('emphasis')) return 'font-style:italic';
  if (has('strong')) return 'font-weight:700';
  return '';
}

function styleFor(el, T, inPre, O) {
  const px = (n) => `${Math.round((n * O.fontSize) / 16)}px`;
  const gap = `${O.paragraphSpacing}px`;
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute('class') || '';

  if (cls.includes('toc-title')) return `font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};font-weight:600;margin:0 0 8px`;
  if (cls.split(/\s+/).includes('toc')) return `margin:0 0 22px;padding:14px 18px;background:${T.tableHead};border-left:3px solid ${T.accent};border-radius:6px`;
  if (cls.includes('footnotes')) return `margin:28px 0 0;padding-top:14px;border-top:1px solid ${T.border};font-size:14px;color:${T.muted}`;
  if (cls.includes('footnote-back')) return `color:${T.accent};text-decoration:none;margin-left:4px`;
  if (cls.includes('math-fallback')) return `font-family:${MONO};font-size:13px;color:${T.muted}`;
  if (cls.includes('katex-error')) return `color:${T.danger}`;
  if (cls.includes('wx-lang')) return `display:block;text-align:right;font-family:${SANS};font-size:11px;line-height:1.2;color:${T.faint};margin:-4px -6px 4px 0`;

  if (inPre) {
    if (tag !== 'code') {
      const hl = hlStyle(cls, T);
      return hl || '';
    }
    return `font-family:${MONO};font-size:13px;line-height:1.65;color:${T.fg};background:none;padding:0;white-space:pre;display:block`;
  }

  switch (tag) {
    case 'section':
      return '';
    case 'h1':
      return `margin:34px 0 16px;font-size:${px(23)};line-height:1.4;font-weight:700;color:${T.fg};padding-bottom:8px;border-bottom:1px solid ${T.border}`;
    case 'h2': {
      const base = `margin:30px 0 14px;font-size:${px(19)};line-height:1.45;font-weight:700;color:${T.fg}`;
      if (O.headingStyle === 'underline') return `${base};padding-bottom:6px;border-bottom:2px solid ${T.accent}`;
      if (O.headingStyle === 'plain') return base;
      if (O.headingStyle === 'badge') {
        return `${base.replace(`color:${T.fg}`, 'color:#fff')};display:inline-block;padding:3px 12px;background:${T.accent};border-radius:4px`;
      }
      return `${base};padding-left:11px;border-left:4px solid ${T.accent}`;
    }
    case 'h3':
      return `margin:26px 0 12px;font-size:${px(17)};line-height:1.45;font-weight:700;color:${T.fg}`;
    case 'h4':
      return `margin:22px 0 10px;font-size:${px(16)};line-height:1.45;font-weight:700;color:${T.soft}`;
    case 'h5':
    case 'h6':
      return `margin:20px 0 10px;font-size:${px(15)};line-height:1.45;font-weight:700;color:${T.muted}`;
    case 'p': {
      // indent body paragraphs only, not the ones inside lists, quotes or cells
      const body = !el.parentElement?.closest('li, blockquote, td, th, .footnotes, .toc');
      return `margin:0 0 ${gap}${O.justify ? ';text-align:justify' : ''}${O.firstLineIndent && body ? ';text-indent:2em' : ''}`;
    }
    case 'strong':
    case 'b':
      return `font-weight:700;color:${T.fg}`;
    case 'em':
    case 'i':
      return 'font-style:italic';
    case 'del':
    case 's':
      return `text-decoration:line-through;color:${T.muted}`;
    case 'sup':
      return `font-size:11px;vertical-align:super;line-height:0;color:${T.accent}`;
    case 'sub':
      return `font-size:11px;vertical-align:sub;line-height:0`;
    case 'mark':
      return `background:${T.highlight};padding:0 2px;border-radius:2px;color:${T.fg}`;
    case 'code':
      return `font-family:${MONO};font-size:13px;background:${T.codeInlineBg};color:${T.codeInlineFg};padding:2px 5px;border-radius:3px;word-break:break-all`;
    case 'pre':
      return `margin:0 0 ${gap};padding:14px 16px;background:${T.codeBg};border:1px solid ${T.border};border-radius:6px;overflow-x:auto;white-space:pre;font-family:${MONO};font-size:13px;line-height:1.65;color:${T.fg}`;
    case 'blockquote':
      return `margin:0 0 ${gap};padding:10px 16px;border-left:4px solid ${T.quoteBar};background:${T.quoteBg};color:${T.soft};border-radius:0 4px 4px 0`;
    case 'ul':
      return `margin:0 0 ${gap};padding-left:22px;list-style-type:disc`;
    case 'ol':
      return `margin:0 0 ${gap};padding-left:22px;list-style-type:decimal`;
    case 'li':
      return `margin:5px 0;line-height:${O.lineHeight}`;
    case 'hr':
      return `border:none;border-top:1px solid ${T.border};margin:28px 0`;
    case 'table':
      return `border-collapse:collapse;width:100%;font-size:14px;margin:0`;
    case 'thead':
      return '';
    case 'th':
      return `border:1px solid ${T.tableBorder};padding:9px 12px;background:${T.tableHead};font-weight:700;text-align:left;color:${T.fg}`;
    case 'td':
      return `border:1px solid ${T.tableBorder};padding:9px 12px;text-align:left;color:${T.soft}`;
    case 'img':
      return `max-width:100%;height:auto;display:block;margin:6px auto;border-radius:4px`;
    case 'figure':
      return `margin:16px 0;text-align:center`;
    case 'figcaption':
      return `font-size:13px;color:${T.muted};margin-top:6px;text-align:center`;
    case 'a':
      return `color:${T.accent};text-decoration:none`;
    case 'input':
      return 'margin-right:6px';
    case 'kbd':
      return `font-family:${MONO};font-size:12px;padding:1px 5px;border:1px solid ${T.border};border-bottom-width:2px;border-radius:4px;background:${T.tableHead};color:${T.soft}`;
    case 'div':
      if (cls.includes('table-scroll')) return `margin:0 0 ${gap};overflow-x:auto`;
      return '';
    case 'nav':
      return '';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// hard bits -> PNG
// ---------------------------------------------------------------------------
async function injectMermaid(host) {
  let i = 0;
  for (const el of host.querySelectorAll('.mermaid')) {
    const code = el.getAttribute('data-src') || el.textContent;
    try {
      const { svg } = await mermaid.render(`wx-mmd-${++i}-${Date.now()}`, code);
      el.innerHTML = svg;
    } catch {
      el.textContent = code;
    }
  }
}

// Rasterised shots keyed by font size + source markup, so the live preview in
// Preferences does not reopen the offscreen window on every slider move.
const shotCache = new Map();

// WeChat will not run KaTeX's CSS or draw an <svg>, so both become images.
async function rasterize(host, css, fontSize) {
  const targets = [...host.querySelectorAll('.math-block, .katex, .mermaid svg')].filter((el) => {
    // a display block is captured whole, an inline formula on its own
    if (el.classList.contains('katex') && el.closest('.math-block')) return false;
    return true;
  });
  if (!targets.length) return 0;

  // mermaid ids carry a timestamp, so key diagrams by their source instead
  const keys = targets.map((el) => {
    const mmd = el.tagName.toLowerCase() === 'svg' && el.closest('.mermaid');
    return `${fontSize}|${mmd ? 'mmd:' + mmd.getAttribute('data-src') : el.outerHTML}`;
  });
  const missing = targets.filter((_el, i) => !shotCache.has(keys[i]));
  if (missing.length) await shoot(missing, css, fontSize, keys.filter((k) => !shotCache.has(k)));

  let done = 0;
  targets.forEach((el, i) => {
    const shot = shotCache.get(keys[i]);
    if (!shot || !shot.url) return;
    const img = document.createElement('img');
    img.setAttribute('src', shot.url);
    // capturePage pixels are device pixels — pin the CSS size or the 3x image
    // would show up three times too large in the 公众号 editor
    const w = Math.min(shot.w, 677);
    const h = Math.round((shot.h * w) / shot.w);
    const display = el.closest('.math-block') || el.tagName.toLowerCase() === 'svg';
    if (display) {
      img.setAttribute('style', `width:${w}px;max-width:100%;height:auto;display:block;margin:14px auto`);
    } else {
      img.setAttribute('style', `width:${w}px;height:${h}px;max-width:100%;vertical-align:middle;margin:0 1px`);
    }
    const holder = el.closest('.math-block') || el;
    holder.replaceWith(img);
    done++;
  });
  return done;
}

async function shoot(targets, css, fontSize, keys) {
  if (shotCache.size > 300) shotCache.clear();
  const width = 720;
  const strip = document.createElement('div');
  strip.style.cssText = `width:${width}px;font-family:${SANS};font-size:${fontSize}px;line-height:1.75;background:#fff`;
  const clones = targets.map((el, i) => {
    const wrap = document.createElement('div');
    // display blocks need to be laid out at full width, inline maths at its natural size
    const display = el.closest('.math-block') || el.tagName.toLowerCase() === 'svg';
    wrap.style.cssText = display ? 'margin:10px 0' : 'margin:10px 0;line-height:1.9';
    const inner = el.cloneNode(true);
    // measure the element itself — the wrapper would report the full column width
    inner.setAttribute('data-wx', String(i));
    wrap.appendChild(inner);
    strip.appendChild(wrap);
    return inner;
  });
  const html = strip.outerHTML;

  const urls = await window.ink.rasterize({ html, css, width });
  (urls || []).forEach((shot, i) => {
    if (shot && shot.url) shotCache.set(keys[i], shot);
  });
}

// local images cannot be shown by WeChat, so they go in as data URIs
async function inlineImages(host) {
  const notes = { inlined: 0, remote: 0, missing: 0 };
  for (const img of [...host.querySelectorAll('img')]) {
    const src = img.getAttribute('src') || '';
    if (/^https?:/i.test(src)) {
      notes.remote++;
      continue;
    }
    if (/^data:/i.test(src)) {
      notes.inlined++;
      continue;
    }
    const file = src.replace(/^file:\/{2,}/i, '').replace(/\//g, '\\');
    const dataUrl = await window.ink.dataUrl(decodeURIComponent(file));
    if (!dataUrl) {
      notes.missing++;
      img.setAttribute('alt', `${img.getAttribute('alt') || 'image'} (缺失)`);
      continue;
    }
    img.setAttribute('src', dataUrl);
    notes.inlined++;
  }
  return notes;
}

// ---------------------------------------------------------------------------
// attribute flattening + links
// ---------------------------------------------------------------------------
function collectLinks(host, T, withRefs) {
  const notes = [];
  for (const a of [...host.querySelectorAll('a')]) {
    const href = a.getAttribute('href') || '';
    const text = a.textContent || href;
    if (!href || href.startsWith('#')) {
      // in-page anchors do not survive the paste; keep the words, drop the jump
      a.replaceWith(document.createTextNode(text));
      continue;
    }
    const span = document.createElement('span');
    span.setAttribute('style', `color:${T.accent}`);
    span.textContent = text;
    if (!withRefs) {
      a.replaceWith(span);
      continue;
    }
    const n = notes.push({ href, text }) - 1;
    const sup = document.createElement('sup');
    sup.setAttribute('style', `font-size:11px;vertical-align:super;line-height:0;color:${T.accent};margin-left:1px`);
    sup.textContent = String(n + 1);
    a.replaceWith(span, sup);
  }
  return notes;
}

const KEEP_ATTRS = new Set(['style', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height']);

function flattenAttrs(root) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (!KEEP_ATTRS.has(attr.name)) el.removeAttribute(attr.name);
    }
  }
}

// KaTeX trees and <svg> carry their own inline styles — never touch inside them.
function isOpaque(el) {
  if (el.tagName.toLowerCase() === 'svg') return true;
  const cls = el.getAttribute('class') || '';
  return cls.split(/\s+/).some((c) => c === 'katex' || c === 'katex-error');
}

function restyle(root, T, O) {
  const walk = (el, inPre) => {
    if (isOpaque(el)) return;
    const s = styleFor(el, T, inPre, O);
    if (s) el.setAttribute('style', s);
    else el.removeAttribute('style');
    const pre = inPre || el.tagName.toLowerCase() === 'pre';
    for (const child of [...el.children]) walk(child, pre);
  };
  for (const child of [...root.children]) walk(child, false);
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------
export async function buildWeChatFragment(source, { docPath, style } = {}) {
  const O = { ...WECHAT_DEFAULTS, ...style };
  const T = await themeTokens(O.theme);
  if (O.accent) T.accent = O.accent;
  const host = document.createElement('div');
  host.innerHTML = renderFragment(source, { docPath });

  await injectMermaid(host);
  if (O.codeLang) {
    for (const pre of host.querySelectorAll('pre[data-lang]')) {
      const tag = document.createElement('span');
      tag.className = 'wx-lang';
      tag.textContent = pre.getAttribute('data-lang');
      pre.prepend(tag);
    }
  }
  const images = await inlineImages(host);
  restyle(host, T, O);
  const katexCss = await window.ink.katexCss();
  const rasterized = await rasterize(host, katexCss, O.fontSize);
  const links = collectLinks(host, T, O.linkRefs);
  flattenAttrs(host);

  if (links.length) {
    const items = links
      .map(
        (l, i) =>
          `<p style="margin:0 0 4px;font-size:13px;line-height:1.6;color:${T.muted};word-break:break-all">${i + 1}. ${escapeHtml(l.text)} — <span style="color:${T.accent}">${escapeHtml(l.href)}</span></p>`,
      )
      .join('');
    host.insertAdjacentHTML(
      'beforeend',
      `<section style="margin:26px 0 0;padding-top:12px;border-top:1px solid ${T.border}"><p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};font-weight:600">参考链接</p>${items}</section>`,
    );
  }

  const body = host.innerHTML.trim();
  const html = `<section style="font-family:${SANS};font-size:${O.fontSize}px;line-height:${O.lineHeight};color:${T.fg};letter-spacing:${O.letterSpacing}em;word-break:break-word;background:#fff;padding:2px 0">${body}</section>`;
  const text = source.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '').trim();
  return { html, text, stats: { links: links.length, ...images, rasterized } };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
