'use strict';
// Folder search & replace — pure functions, no Electron dependency, so they can be
// unit-tested with node:test (see test/search-replace.test.mjs).
//
// The matching rules are exactly the ones searchFolder() in src/main/main.js has
// always used: literal text is escaped unless `regex` is set, `wholeWord` wraps the
// pattern in Unicode letter/digit lookarounds, and the flags are `gu` plus `i`
// unless `caseSensitive` is set. Replacement is applied per match with the same
// `$` expansion JavaScript's String.replace() does ($&, $1…$99, $<name>, $$, $`,
// $'), implemented here explicitly so a single hit can be previewed and so only
// the hits the user checked are applied.
//
// Matches are found by scanning the whole text (not line by line) so preview and
// apply always agree; empty matches are skipped, exactly like searchFolder does
// (a pattern such as `a*` must not insert the replacement everywhere).

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Throws on an invalid pattern (SyntaxError from RegExp); callers that report to
// the UI should catch it and surface `err.message` instead of running anything.
function buildSearchRegExp({ query, caseSensitive = false, wholeWord = false, regex = false }) {
  let source = regex ? query : escapeRegExp(query);
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  return new RegExp(source, `gu${caseSensitive ? '' : 'i'}`);
}

// The key that identifies one hit inside one file, used to carry the user's
// checkbox selection from the preview list to the apply step.
const hitKey = (hit) => `${hit.line}:${hit.col}`;

// Expand a replacement string for one match, mirroring String.replace():
// $$ -> $, $& -> whole match, $` / $' -> text before/after the match,
// $1…$99 -> capture groups, $<name> -> named groups, anything else after $
// stays literal.
function expandReplacement(replacement, match) {
  return String(replacement).replace(/\$(\$|&|`|'|<[^>]*>|\d{1,2}|.)/g, (all, token) => {
    if (token === '$') return '$';
    if (token === '&') return match[0];
    if (token === '`') return match.input.slice(0, match.index);
    if (token === "'") return match.input.slice(match.index + match[0].length);
    if (token.startsWith('<')) {
      const name = token.slice(1, -1);
      const groups = match.groups || {};
      return groups[name] === undefined ? '' : groups[name];
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n === 0) return match[0];
      if (match[n] !== undefined) return match[n];
      // Native String.replace(): $10 with fewer than 10 groups means $1 + "0".
      if (token.length === 2) {
        const first = match[Number(token[0])];
        return (first === undefined ? '' : first) + token[1];
      }
      return '';
    }
    return all;
  });
}

function lineColOf(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart };
}

function lineBoundsOf(text, index) {
  let start = index;
  while (start > 0 && text[start - 1] !== '\n') start--;
  let end = index;
  while (end < text.length && text[end] !== '\n') end++;
  return { start, end };
}

// Every non-empty match in `text`, in order. Each hit carries the same
// before/match/after context searchFolder() shows (up to 40 chars before and
// 80 after the match, within its line).
function findMatches(text, opts) {
  const re = buildSearchRegExp(opts);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = lineColOf(text, m.index);
    const { start, end } = lineBoundsOf(text, m.index);
    const lineText = text.slice(start, end).replace(/\r$/, '');
    const from = Math.max(0, m.index - start - 40);
    const relIndex = m.index - start;
    hits.push({
      line,
      col,
      len: m[0].length,
      match: m[0],
      before: (from > 0 ? '…' : '') + lineText.slice(from, relIndex),
      after: lineText.slice(relIndex + m[0].length, relIndex + m[0].length + 80),
    });
  }
  return hits;
}

// Preview: the search hits plus, per hit, the replacement text for that hit and
// the context line as it would look after replacing just that hit.
function previewReplace(text, { replacement = '', ...opts }) {
  const re = buildSearchRegExp(opts);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = lineColOf(text, m.index);
    const { start, end } = lineBoundsOf(text, m.index);
    const lineText = text.slice(start, end).replace(/\r$/, '');
    const relIndex = m.index - start;
    const from = Math.max(0, relIndex - 40);
    const before = (from > 0 ? '…' : '') + lineText.slice(from, relIndex);
    const after = lineText.slice(relIndex + m[0].length, relIndex + m[0].length + 80);
    const replaced = expandReplacement(replacement, m);
    hits.push({
      line,
      col,
      len: m[0].length,
      match: m[0],
      before,
      after,
      replacement: replaced,
      replaced: before + replaced + after,
    });
  }
  return hits;
}

// Apply the replacement. `selected` is an optional iterable of hitKey() values;
// when given, only those hits are replaced, the rest are left untouched.
// Returns { text, count }. The input text is returned unchanged when nothing
// matches (or when `selected` matches nothing).
function applyReplaceText(text, { replacement = '', ...opts }, selected) {
  const re = buildSearchRegExp(opts);
  const wanted = selected === undefined || selected === null ? null : new Set(selected);
  const spans = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = lineColOf(text, m.index);
    if (wanted && !wanted.has(hitKey({ line, col }))) continue;
    spans.push({ index: m.index, len: m[0].length, replacement: expandReplacement(replacement, m) });
  }
  if (!spans.length) return { text, count: 0 };
  let out = '';
  let pos = 0;
  for (const s of spans) {
    out += text.slice(pos, s.index) + s.replacement;
    pos = s.index + s.len;
  }
  out += text.slice(pos);
  return { text: out, count: spans.length };
}

// Read-only check on a stat() mode, mirroring what the main process does before
// touching a file: no write bit set for anyone means "read-only, skip it".
// (Write failures are still caught per file in the main process — a mode check
// alone is not authoritative on every platform.)
function isReadOnlyMode(mode) {
  return (mode & 0o222) === 0;
}

module.exports = {
  escapeRegExp,
  buildSearchRegExp,
  hitKey,
  expandReplacement,
  findMatches,
  previewReplace,
  applyReplaceText,
  isReadOnlyMode,
};
