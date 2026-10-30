// Export settings: YAML front matter overrides, `${var}` expansion, PDF page / header / footer
// options, PDF document properties and the collapsible HTML outline. Pure functions — the shell
// (main.js) feeds them the config and the rendered headings.

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------------------------------------------------------------------------
// front matter overrides
// ---------------------------------------------------------------------------
const bool = (v) => {
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(s)) return true;
  if (['false', 'no', 'off', '0'].includes(s)) return false;
  return undefined;
};
const num = (v) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const str = (v) => String(v);

// CSS-like shorthand: "10" | "10 15" | "10 15 20" | "10 15 20 25" (mm, top right bottom left)
export function parseMargins(v) {
  const parts = String(v).trim().split(/[\s,]+/).map((x) => parseFloat(x));
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [t, r = t, b = t, l = r] = parts;
  return { pdfMarginTop: t, pdfMarginRight: r, pdfMarginBottom: b, pdfMarginLeft: l };
}

// front matter key → [config key, parser]; keys are matched case-insensitively
const OVERRIDES = {
  'export-theme': ['exportTheme', str],
  'pdf-theme': ['exportTheme', str],
  'pdf-paper': ['pdfPaperSize', str],
  'pdf-paper-size': ['pdfPaperSize', str],
  'pdf-landscape': ['pdfLandscape', bool],
  'pdf-margin-top': ['pdfMarginTop', num],
  'pdf-margin-right': ['pdfMarginRight', num],
  'pdf-margin-bottom': ['pdfMarginBottom', num],
  'pdf-margin-left': ['pdfMarginLeft', num],
  'pdf-header': ['pdfHeader', str],
  'pdf-footer': ['pdfFooter', str],
  'pdf-h1-page-break': ['pdfH1PageBreak', bool],
  'pdf-page-break-before-h1': ['pdfH1PageBreak', bool],
  'html-outline': ['htmlOutline', bool],
  'html-head': ['htmlHead', str],
  'html-body': ['htmlBody', str],
  'image-width': ['exportImageWidth', num],
};

// The config with any export settings the document's front matter pins down.
export function resolveExportSettings(config, meta) {
  const out = { ...config };
  if (!meta) return out;
  for (const [key, raw] of Object.entries(meta)) {
    const k = key.toLowerCase();
    if (k === 'pdf-margin') {
      const m = parseMargins(raw);
      if (m) Object.assign(out, m);
      continue;
    }
    const spec = OVERRIDES[k];
    if (!spec) continue;
    const value = spec[1](raw);
    if (value !== undefined) out[spec[0]] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ${variables}
// ---------------------------------------------------------------------------
// Every front matter key plus title / author / filename / today / date.
export function exportVars(meta, { title, filePath, now = new Date() } = {}) {
  const file = filePath ? String(filePath).replace(/\\/g, '/').split('/').pop() : '';
  const vars = {};
  for (const [k, v] of Object.entries(meta || {})) vars[k.toLowerCase()] = String(v);
  vars.title = (meta && meta.title) || title || file.replace(/\.[^.]+$/, '') || 'Untitled';
  vars.author = (meta && meta.author) || '';
  vars.filename = file.replace(/\.[^.]+$/, '') || 'Untitled';
  vars.today = isoDate(now);
  if (!vars.date) vars.date = vars.today;
  return vars;
}

// `${name}` → value (HTML-escaped by default). Unknown names stay as written; `extra` maps names
// to raw replacements (the PDF page counters).
export function expandVars(template, vars, { escape = true, extra = {} } = {}) {
  return String(template || '').replace(/\$\{\s*([A-Za-z0-9_-]+)\s*\}/g, (all, name) => {
    if (Object.prototype.hasOwnProperty.call(extra, name)) return extra[name];
    const key = name.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return all;
    return escape ? escapeHtml(vars[key]) : vars[key];
  });
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export const PAPER_SIZES = ['A3', 'A4', 'A5', 'B5', 'Letter', 'Legal', 'Tabloid'];
const MM_PER_INCH = 25.4;
const CUSTOM_SIZES = { B5: [176, 250] };

// "A4" | "Letter" | "210x297" | "210 x 297 mm" | "8.5x11in" → Electron's pageSize
export function paperSize(value) {
  const v = String(value || 'A4').trim();
  const known = PAPER_SIZES.find((p) => p.toLowerCase() === v.toLowerCase());
  if (known && CUSTOM_SIZES[known]) {
    const [w, h] = CUSTOM_SIZES[known];
    return { width: w / MM_PER_INCH, height: h / MM_PER_INCH };
  }
  if (known) return known;
  const m = /^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)?$/i.exec(v);
  if (m) {
    const f = { mm: 1 / MM_PER_INCH, cm: 10 / MM_PER_INCH, in: 1 }[(m[3] || 'mm').toLowerCase()];
    return { width: +m[1] * f, height: +m[2] * f };
  }
  return 'A4';
}

// header / footer text → Chromium print template. "left | center | right" splits into columns;
// ${pageNo} and ${pageCount} become the live page counters.
export function pdfTemplate(text, vars, { left = 0, right = 0 } = {}) {
  if (!String(text || '').trim()) return '';
  const counters = {
    pageNo: '<span class="pageNumber"></span>',
    pageCount: '<span class="totalPages"></span>',
  };
  const parts = String(text).split('|').map((p) => expandVars(p.trim(), vars, { extra: counters }));
  const cells = parts.length === 1 ? ['', parts[0], ''] : parts.length === 2 ? [parts[0], '', parts[1]] : parts.slice(0, 3);
  const align = ['left', 'center', 'right'];
  const cols = cells.map((c, i) => `<span style="flex:1;text-align:${align[i]};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c}</span>`);
  return `<div style="box-sizing:border-box;width:100%;display:flex;gap:8px;font-size:9px;color:#666;font-family:-apple-system,'Segoe UI',sans-serif;padding:0 ${left}mm 0 ${right}mm">${cols.join('')}</div>`;
}

// Everything printToPDF needs, in Electron units (inches).
export function pdfOptions(settings, vars) {
  const mm = (k, d) => (Number.isFinite(+settings[k]) ? +settings[k] : d);
  const margin = {
    top: mm('pdfMarginTop', 18),
    right: mm('pdfMarginRight', 16),
    bottom: mm('pdfMarginBottom', 18),
    left: mm('pdfMarginLeft', 16),
  };
  const header = pdfTemplate(settings.pdfHeader, vars, margin);
  const footer = pdfTemplate(settings.pdfFooter, vars, margin);
  return {
    pageSize: paperSize(settings.pdfPaperSize),
    landscape: settings.pdfLandscape === true,
    margins: {
      top: margin.top / MM_PER_INCH,
      right: margin.right / MM_PER_INCH,
      bottom: margin.bottom / MM_PER_INCH,
      left: margin.left / MM_PER_INCH,
    },
    displayHeaderFooter: !!(header || footer),
    // Chromium prints its own date/title when a template is empty
    headerTemplate: header || '<span></span>',
    footerTemplate: footer || '<span></span>',
  };
}

// Extra CSS for paged output: real page margins replace the screen padding.
export function pdfCss(settings) {
  const mm = (k, d) => (Number.isFinite(+settings[k]) ? +settings[k] : d);
  let css = `@page { margin: ${mm('pdfMarginTop', 18)}mm ${mm('pdfMarginRight', 16)}mm ${mm('pdfMarginBottom', 18)}mm ${mm('pdfMarginLeft', 16)}mm; }\n`;
  css += '@media print { .markdown-body { max-width: none; padding: 0; margin: 0; } pre, table, img, svg, .katex-display { break-inside: avoid; } }';
  if (settings.pdfH1PageBreak) css += '\n.markdown-body h1:not(:first-child) { break-before: page; }';
  return css;
}

// YAML metadata → PDF document properties.
export function pdfInfo(meta, title) {
  const m = meta || {};
  const list = (v) => String(v || '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', ');
  const info = { Title: m.title || title || '' };
  if (m.author) info.Author = m.author;
  if (m.subject || m.description) info.Subject = m.subject || m.description;
  const kw = list(m.keywords || m.tags);
  if (kw) info.Keywords = kw;
  return info;
}

// ---------------------------------------------------------------------------
// HTML: collapsible outline (CSS only — <details> nests, a checkbox hides the panel)
// ---------------------------------------------------------------------------
export function outlineHtml(headings) {
  if (!headings.length) return '';
  const min = Math.min(...headings.map((h) => h.level));
  // build a tree, then render it
  const root = { children: [] };
  const stack = [{ level: min - 1, node: root }];
  for (const h of headings) {
    const node = { ...h, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: h.level, node });
  }
  const link = (n) => `<a href="#${escapeHtml(n.id)}">${escapeHtml(n.text)}</a>`;
  const list = (nodes) =>
    `<ul>${nodes
      .map((n) => (n.children.length ? `<li><details open><summary>${link(n)}</summary>${list(n.children)}</details></li>` : `<li>${link(n)}</li>`))
      .join('')}</ul>`;
  return `<input type="checkbox" id="pm-outline-toggle" class="pm-outline-toggle" checked>
<label for="pm-outline-toggle" class="pm-outline-button" title="Outline">☰</label>
<nav class="pm-outline">${list(root.children)}</nav>`;
}

export const OUTLINE_CSS = `
.pm-outline-toggle { position: fixed; opacity: 0; pointer-events: none; }
.pm-outline-button { position: fixed; top: 12px; left: 12px; z-index: 11; width: 30px; height: 30px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px;
  background: var(--bg); color: var(--fg-muted, #666); border: 1px solid var(--border, #ddd); }
.pm-outline { position: fixed; top: 0; bottom: 0; left: 0; width: 260px; overflow-y: auto; padding: 52px 12px 24px 12px;
  box-sizing: border-box; border-right: 1px solid var(--border, #ddd); background: var(--bg); font-size: 13.5px; line-height: 1.5; z-index: 10;
  transform: translateX(-100%); transition: transform .18s ease; }
.pm-outline-toggle:checked ~ .pm-outline { transform: none; }
.pm-outline ul { list-style: none; margin: 0; padding-left: 14px; }
.pm-outline > ul { padding-left: 0; }
.pm-outline li { margin: 2px 0; }
.pm-outline summary { cursor: pointer; }
.pm-outline summary::marker { color: var(--fg-muted, #999); }
.pm-outline li:not(:has(details)) { padding-left: 14px; }
.pm-outline a { color: var(--fg); text-decoration: none; }
.pm-outline a:hover { color: var(--link); }
@media (min-width: 1100px) { .pm-outline-toggle:checked ~ .markdown-body { margin-left: max(280px, calc((100% - var(--line-width, 760px)) / 2)); } }
@media print { .pm-outline, .pm-outline-button { display: none; } }
`;
