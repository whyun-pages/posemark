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
// Search, preview and apply match each line independently. Empty matches
// are skipped so patterns like a* do not insert text at every position.

const crypto = require('crypto');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Content fingerprint of a file's text, used to catch a file that changed
// after previewing: matching by line:col (and even by the text at that
// coordinate) cannot see an identical line inserted before a hit, which
// shifts every later hit down a line. A whole-file hash can.
function contentFingerprint(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

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

// Expand a replacement string for one match, mirroring String.replace()
// (verified against Node's native behaviour):
// $$ -> $, $& -> whole match, $` / $' -> text before/after the match,
// $n (1-99) -> capture group n when it exists (an existing but unmatched
// group expands to ''). When named captures exist, $<name> expands to the
// group's value or '' for an unknown or unmatched name. Otherwise it stays literal.
// $0 and numeric references outside the capture range also stay literal.
// Two-digit tokens fall back like the native implementation: $10 with a
// single group means $1 followed by a literal '0' (and $11 means $1 + '1'),
// while $99 with one group stays literal because 9 is not a group either.
function expandReplacement(replacement, match, input = match.input, index = match.index) {
  const groupCount = match.length - 1;
  const tokens = match.groups
    ? /\$(\$|&|`|'|<[^>]*>|\d{1,2})/g
    : /\$(\$|&|`|'|\d{1,2})/g;
  return String(replacement).replace(tokens, (all, token) => {
    if (token === '$') return '$';
    if (token === '&') return match[0];
    if (token === '`') return input.slice(0, index);
    if (token === "'") return input.slice(index + match[0].length);
    if (token.startsWith('<')) {
      return match.groups[token.slice(1, -1)] ?? '';
    }
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 1 && n <= groupCount) return match[n] === undefined ? '' : match[n];
      // Native String.replace(): a two-digit token whose first digit is a
      // real group means that group plus the second digit as a literal.
      if (token.length === 2) {
        const first = Number(token[0]);
        if (first >= 1 && first <= groupCount) {
          return (match[first] === undefined ? '' : match[first]) + token[1];
        }
      }
      return all;
    }
    return all;
  });
}

// Scan one LF or CRLF-delimited line at a time. Keep the absolute offset
// for writing replacements without changing the original line endings.
function* matchesByLine(text, re) {
  let start = 0;
  let line = 1;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline === -1 ? text.length : newline;
    const contentEnd = newline !== -1 && text[end - 1] === '\r' ? end - 1 : end;
    const lineText = text.slice(start, contentEnd);
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(lineText)) !== null) {
      const col = match.index;
      if (match[0] === '') {
        re.lastIndex += lineText.codePointAt(col) > 0xffff ? 2 : 1;
        continue;
      }
      yield { line, col, index: start + col, match };
    }
    start = end + 1;
    line++;
  }
}

function matchContext({ line, col, match }) {
  const from = Math.max(0, col - 40);
  const afterStart = col + match[0].length;
  return {
    line,
    col,
    len: match[0].length,
    match: match[0],
    before: (from > 0 ? '…' : '') + match.input.slice(from, col),
    after: match.input.slice(afterStart, afterStart + 80),
  };
}

// Stop at the result budget without splitting or scanning the rest of the file.
function findMatches(text, opts, re = buildSearchRegExp(opts)) {
  const limit = opts.limit ?? Infinity;
  const hits = [];
  if (limit <= 0) return hits;
  for (const match of matchesByLine(text, re)) {
    hits.push(matchContext(match));
    if (hits.length >= limit) break;
  }
  return hits;
}

function previewReplace(text, { replacement = '', limit = Infinity, ...opts }) {
  const re = buildSearchRegExp(opts);
  const hits = [];
  if (limit <= 0) return hits;
  for (const match of matchesByLine(text, re)) {
    const hit = matchContext(match);
    const replaced = expandReplacement(replacement, match.match, text, match.index);
    hits.push({
      ...hit,
      replacement: replaced,
      replaced: hit.before + replaced + hit.after,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

// Apply the replacement. `selected` is an optional iterable of hitKey() values
// (any hit at that coordinate is replaced), or a Map from hitKey() to the
// match text previewed at that coordinate. With a Map, a hit is only replaced
// when the text freshly scanned at its coordinate still equals the previewed
// text: a file edited after previewing (or saved through the Save and Replace
// prompt) must never have a different hit replaced in its place. Rejected
// hits are simply skipped, like hits that are no longer found at all.
// Returns { text, count }. The input text is returned unchanged when nothing
// matches (or when `selected` matches nothing).
function applyReplaceText(text, { replacement = '', ...opts }, selected) {
  const re = buildSearchRegExp(opts);
  const wanted = selected === undefined || selected === null ? null
    : (selected instanceof Map ? selected : new Set(selected));
  if (wanted?.size === 0) return { text, count: 0 };
  const spans = [];
  let resolved = 0;
  for (const hit of matchesByLine(text, re)) {
    const { match, index } = hit;
    if (wanted) {
      const key = hitKey(hit);
      if (!wanted.has(key)) continue;
      resolved++;
      const expected = wanted instanceof Map ? wanted.get(key) : undefined;
      if (expected !== undefined && match[0] !== expected) {
        if (resolved === wanted.size) break;
        continue;
      }
    }
    spans.push({ index, len: match[0].length, replacement: expandReplacement(replacement, match, text, index) });
    if (wanted && resolved === wanted.size) break;
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
  contentFingerprint,
  findMatches,
  previewReplace,
  applyReplaceText,
  isReadOnlyMode,
};
