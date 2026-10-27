// Path helpers + shared mutable context (no node `path` module inside the renderer).
export const ctx = {
  docPath: null,
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

export function dirOf(p) {
  if (!p) return null;
  const norm = p.replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i > 0 ? norm.slice(0, i) : null;
}

export function toFileUrl(p) {
  const norm = p.replace(/\\/g, '/');
  return 'file:///' + norm.replace(/^\//, '');
}

export function resolveSrc(src, docPath = ctx.docPath) {
  if (!src) return '';
  if (/^(https?:|data:|file:|blob:)/i.test(src)) return src;
  const clean = decodeURI(src.replace(/^<|>$/g, ''));
  if (/^[A-Za-z]:[\\/]/.test(clean) || clean.startsWith('/')) return toFileUrl(clean);
  const dir = dirOf(docPath);
  if (!dir) return clean;
  const parts = dir.split('/');
  for (const seg of clean.replace(/^\.\//, '').split('/')) {
    if (seg === '.' || seg === '') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return toFileUrl(parts.join('/'));
}

export function basename(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').split('/').pop();
}
