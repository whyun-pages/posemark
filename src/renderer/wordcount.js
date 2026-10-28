// Word count panel figures (pure). Chinese/Japanese characters count one word each.
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/g;
const LATIN_WORD = /[A-Za-z0-9_'À-ɏЀ-ӿ]+/g;

export function countText(text) {
  const src = String(text || '');
  const cjk = (src.match(CJK) || []).length;
  const latin = (src.match(LATIN_WORD) || []).length;
  const words = cjk + latin;
  const chars = src.replace(/\s/g, '').length;
  const charsWithSpaces = src.replace(/\r?\n/g, '').length;
  const lines = src ? src.split('\n').length : 0;
  const paragraphs = src
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(```|~~~|\$\$|---)/.test(p)).length;
  return { words, chars, charsWithSpaces, lines, paragraphs, cjk, latin };
}

// Reading time in whole minutes (at least 1 when there is anything to read). Chinese is
// read at roughly 1.5× the English word rate, so CJK characters are weighted 2/3.
export function readingTime(counts, wordsPerMinute = 275) {
  const wpm = Math.max(60, Number(wordsPerMinute) || 275);
  const effective = counts.latin + counts.cjk * (2 / 3);
  if (!effective) return 0;
  return Math.max(1, Math.round(effective / wpm));
}

export function formatReadingTime(minutes) {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
