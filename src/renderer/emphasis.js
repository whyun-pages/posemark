// CommonMark delimiter-run flanking rules, used to keep toolbar/shortcut emphasis renderable.
//
// `知道**「她」**指` is *not* bold in CommonMark: the opening `**` is followed by punctuation
// (`「`) but preceded by a letter, so it is not left-flanking (likewise the closer). CJK text
// has no spaces around such punctuation, so wrapping a selection that starts/ends with `「」`,
// `“”`, `（）`, `，` … silently produces literal asterisks. `fitDelimiters` moves the markers
// inward past that punctuation until both runs flank — `知道「**她**」指` — which renders in
// every CommonMark parser (the live preview, export, GitHub).

const PUNCT = /[\p{P}\p{S}]/u;
const SPACE = /\s/u;

// Only markers that are delimiter runs are subject to flanking (not `code`, <u>, …).
export function isDelimiterMarker(marker) {
  return /^(\*+|_+|~+|=+)$/.test(marker);
}

const isPunct = (ch) => !!ch && PUNCT.test(ch);
const isSpace = (ch) => !ch || SPACE.test(ch); // line edge counts as whitespace

function canOpen(prev, next) {
  if (isSpace(next)) return false;
  return !isPunct(next) || isSpace(prev) || isPunct(prev);
}

function canClose(prev, next) {
  if (isSpace(prev)) return false;
  return !isPunct(prev) || isSpace(next) || isPunct(next);
}

const firstChar = (s) => (s ? String.fromCodePoint(s.codePointAt(0)) : '');
const lastChar = (s) => (s ? Array.from(s.slice(-2)).pop() : '');

/**
 * Given the text before the selection, the selected text and the text after it, return
 * `{ start, end }` offsets inside `text` to wrap so the delimiters can open/close.
 * Falls back to the whole selection when no valid placement exists.
 */
export function fitDelimiters(before, text, after) {
  let start = 0;
  let end = text.length;
  const prevOf = () => (start === 0 ? lastChar(before) : lastChar(text.slice(0, start)));
  const nextOf = () => (end === text.length ? firstChar(after) : firstChar(text.slice(end)));
  while (start < end && !canOpen(prevOf(), firstChar(text.slice(start, end)))) {
    const ch = firstChar(text.slice(start, end));
    if (!isPunct(ch) && !isSpace(ch)) break;
    start += ch.length;
  }
  while (end > start && !canClose(lastChar(text.slice(start, end)), nextOf())) {
    const ch = lastChar(text.slice(start, end));
    if (!isPunct(ch) && !isSpace(ch)) break;
    end -= ch.length;
  }
  const inner = text.slice(start, end);
  if (!inner || !canOpen(prevOf(), firstChar(inner)) || !canClose(lastChar(inner), nextOf())) {
    return { start: 0, end: text.length };
  }
  return { start, end };
}
