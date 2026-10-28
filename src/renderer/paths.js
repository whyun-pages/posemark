// Path helpers + shared mutable context (no node `path` module inside the renderer).
export const ctx = {
  docPath: null,
  // `typora-root-url` from the document's front matter (absolute directory), or null
  rootUrl: null,
  config: {
    lineNumbersInCode: false,
    codeWrap: true,
    inlineMath: true,
    emoji: true,
    githubAlerts: true,
    strictMode: true,
    preserveLineBreaks: false,
    autoPairBrackets: true,
    autoPairMarkdown: true,
    emojiAutocomplete: true,
  },
};

export const norm = (p) => (p ? String(p).replace(/\\/g, '/') : '');

export function dirOf(p) {
  if (!p) return null;
  const n = norm(p);
  const i = n.lastIndexOf('/');
  return i > 0 ? n.slice(0, i) : null;
}

export function toFileUrl(p) {
  const n = norm(p);
  return 'file:///' + encodeURI(n.replace(/^\//, '')).replace(/[?#]/g, (c) => encodeURIComponent(c));
}

export const isAbsolutePath = (p) => /^[A-Za-z]:[\\/]/.test(p) || norm(p).startsWith('/');
export const isRemote = (src) => /^(https?:|data:|blob:|file:)/i.test(src || '');

// Resolve `rel` against `dir` (`..` and `.` folded), forward slashes, no trailing slash.
export function joinDir(dir, rel) {
  const parts = norm(dir).split('/').filter(Boolean);
  const lead = norm(dir).startsWith('/') ? '/' : '';
  for (const seg of norm(rel).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return lead + parts.join('/');
}

// The absolute file a Markdown image source refers to (null for remote / data URLs).
export function resolveFile(src, docPath = ctx.docPath, rootUrl = ctx.rootUrl) {
  if (!src || isRemote(src)) return null;
  let clean = src.replace(/^<|>$/g, '');
  try {
    clean = decodeURI(clean);
  } catch {
    /* keep raw */
  }
  if (/^[A-Za-z]:[\\/]/.test(clean)) return norm(clean);
  if (clean.startsWith('/')) {
    if (rootUrl) return joinDir(rootUrl, clean);
    return norm(clean);
  }
  const dir = dirOf(docPath);
  if (!dir) return null;
  return joinDir(dir, clean.replace(/^\.\//, ''));
}

export function resolveSrc(src, docPath = ctx.docPath) {
  if (!src) return '';
  if (isRemote(src)) return src;
  const file = resolveFile(src, docPath, ctx.rootUrl);
  if (!file) return src.replace(/^<|>$/g, '');
  return toFileUrl(file);
}

export function basename(p) {
  if (!p) return '';
  return norm(p).split('/').pop();
}

const sameDrive = (a, b) => {
  const da = /^([A-Za-z]):/.exec(a);
  const db = /^([A-Za-z]):/.exec(b);
  if (!da && !db) return true;
  return !!da && !!db && da[1].toLowerCase() === db[1].toLowerCase();
};

// Relative path from directory `fromDir` to `toPath`, or null when they share no drive.
export function relativePath(fromDir, toPath) {
  const a = norm(fromDir).replace(/\/+$/, '');
  const b = norm(toPath);
  if (!sameDrive(a, b)) return null;
  const ap = a.split('/').filter(Boolean);
  const bp = b.split('/').filter(Boolean);
  const eq = (x, y) => x.toLowerCase() === y.toLowerCase();
  let i = 0;
  while (i < ap.length && i < bp.length && eq(ap[i], bp[i])) i++;
  if (ap.length && i === 0 && /^[A-Za-z]:$/.test(ap[0])) return null;
  return [...Array(ap.length - i).fill('..'), ...bp.slice(i)].join('/');
}

const underDir = (file, dir) => {
  const f = norm(file).toLowerCase();
  const d = norm(dir).toLowerCase().replace(/\/+$/, '');
  return !!d && (f === d || f.startsWith(d + '/'));
};

// Encode a path for a Markdown link target. With escaping off, a path containing spaces
// or parentheses is wrapped in `<…>` (CommonMark) instead.
export function encodeMarkdownPath(p, urlEscape = true) {
  if (urlEscape) {
    return encodeURI(p).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29')).replace(/%5C/gi, '/');
  }
  return /[\s()]/.test(p) ? `<${p}>` : p;
}

/**
 * The path that goes into `![alt](…)` for the image file `absPath`.
 * - under `typora-root-url` → site-root path starting with `/`
 * - useRelative (default) → relative to the document (`./` prefix optional)
 * - otherwise the absolute path with forward slashes
 */
export function imageMarkdownPath(absPath, { docPath = ctx.docPath, rootUrl = ctx.rootUrl, useRelative = true, dotSlash = false, urlEscape = true } = {}) {
  const abs = norm(absPath);
  let out;
  if (rootUrl && underDir(abs, rootUrl)) {
    out = '/' + abs.slice(norm(rootUrl).replace(/\/+$/, '').length + 1);
  } else {
    const dir = dirOf(docPath);
    const rel = useRelative && dir ? relativePath(dir, abs) : null;
    if (rel != null) out = dotSlash && !rel.startsWith('../') && !rel.startsWith('/') ? `./${rel}` : rel;
    else out = abs;
  }
  return encodeMarkdownPath(out, urlEscape);
}

/**
 * Where inserted images are copied for a document: the front matter's
 * `typora-copy-images-to` first, then the "copy images to" preference (`${filename}`
 * stands for the document name without extension). Relative folders hang off the
 * document's directory. Null when there is no document (the caller picks a default).
 */
export function imageFolderFor({ docPath = ctx.docPath, copyTo = '', fallback = 'assets' } = {}) {
  const dir = dirOf(docPath);
  const stem = docPath ? basename(docPath).replace(/\.[^.]+$/, '') : 'Untitled';
  const raw = String(copyTo || fallback || '').trim().replace(/\$\{filename\}/g, stem);
  if (!raw) return dir;
  if (isAbsolutePath(raw)) return norm(raw).replace(/\/+$/, '');
  if (!dir) return null;
  return joinDir(dir, raw);
}

// `<img src="a.png" width="320" style="zoom:50%">` → the parts the editor cares about.
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
export function parseImageTag(tag) {
  const m = /^\s*<(img|video|audio)\b([^>]*?)\/?>/i.exec(tag);
  if (!m) return null;
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let a;
  while ((a = ATTR_RE.exec(m[2]))) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
  const style = attrs.style || '';
  const zoom = /zoom\s*:\s*([\d.]+%?)/i.exec(style);
  const w = /(?:^|;)\s*width\s*:\s*(\d+)px/i.exec(style);
  const h = /(?:^|;)\s*height\s*:\s*(\d+)px/i.exec(style);
  const num = (v) => (v && /^\d+$/.test(String(v).trim()) ? Number(v) : 0);
  return {
    tag: m[1].toLowerCase(),
    src: attrs.src || '',
    alt: attrs.alt || '',
    title: attrs.title || '',
    width: num(attrs.width) || (w ? Number(w[1]) : 0),
    height: num(attrs.height) || (h ? Number(h[1]) : 0),
    zoom: zoom ? zoom[1] : '',
    attrs,
  };
}
