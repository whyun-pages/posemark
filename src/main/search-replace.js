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
// group expands to ''), $<name> -> the named group when it exists.
// Anything that is not a real group reference stays literal: $0, $n with n
// larger than the group count, and $<name> with no such named group.
// Two-digit tokens fall back like the native implementation: $10 with a
// single group means $1 followed by a literal '0' (and $11 means $1 + '1'),
// while $99 with one group stays literal because 9 is not a group either.
function expandReplacement(replacement, match) {
  const groupCount = match.length - 1;
  const groups = match.groups || {};
  return String(replacement).replace(/\$(\$|&|`|'|<[^>]*>|\d{1,2}|.)/g, (all, token) => {
    if (token === '$') return '$';
    if (token === '&') return match[0];
    if (token === '`') return match.input.slice(0, match.index);
    if (token === "'") return match.input.slice(match.index + match[0].length);
    if (token.startsWith('<')) {
      const name = token.slice(1, -1);
      if (!Object.prototype.hasOwnProperty.call(groups, name)) return all;
      return groups[name] === undefined ? '' : groups[name];
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

// Matches arrive in increasing index order, so line/col can be tracked by
// scanning forward once instead of rescanning the whole prefix per hit —
// the old per-hit rescan was quadratic on files with many matches (a 160 KB
// file with 40,000 hits took ~8 s to preview).
function createLineTracker(text) {
  let line = 1;
  let lineStart = 0;
  let scanned = 0;
  return (index) => {
    while (scanned < index) {
      if (text[scanned] === '\n') {
        line++;
        lineStart = scanned + 1;
      }
      scanned++;
    }
    return { line, col: index - lineStart };
  };
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
// 80 after the match, within its line). `opts.limit` stops after that many
// hits instead of scanning the whole file.
function findMatches(text, opts) {
  const re = buildSearchRegExp(opts);
  const limit = opts.limit ?? Infinity;
  const position = createLineTracker(text);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = position(m.index);
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
    if (hits.length >= limit) break;
  }
  return hits;
}

// Preview: the search hits plus, per hit, the replacement text for that hit and
// the context line as it would look after replacing just that hit.
// `opts.limit` (the caller's remaining result budget) stops the scan early —
// a preview capped at 2,000 hits must not pay for all 40,000 of them first.
function previewReplace(text, { replacement = '', limit = Infinity, ...opts }) {
  const re = buildSearchRegExp(opts);
  const position = createLineTracker(text);
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = position(m.index);
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
  const position = createLineTracker(text);
  const spans = [];
  let resolved = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const { line, col } = position(m.index);
    if (wanted) {
      const key = hitKey({ line, col });
      if (!wanted.has(key)) continue;
      resolved++;
      if (wanted instanceof Map) {
        // Stale preview: the text at this coordinate changed after
        // previewing, so this is not the hit the user approved.
        const expected = wanted.get(key);
        if (expected !== undefined && m[0] !== expected) {
          if (resolved >= wanted.size) break;
          continue;
        }
      }
      spans.push({ index: m.index, len: m[0].length, replacement: expandReplacement(replacement, m) });
      // Once every selected hit has been accounted for (replaced or
      // rejected as stale) there is nothing left to do in this file.
      if (resolved >= wanted.size) break;
    } else {
      spans.push({ index: m.index, len: m[0].length, replacement: expandReplacement(replacement, m) });
    }
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
