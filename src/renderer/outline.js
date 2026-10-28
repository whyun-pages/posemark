// Outline panel helpers (pure; the DOM work stays in main.js).

// Nest a flat heading list by level: a heading owns everything after it that is deeper,
// up to the next heading of the same or a shallower level.
export function buildOutlineTree(headings) {
  const root = { level: 0, children: [] };
  const stack = [root];
  headings.forEach((h, index) => {
    const node = { ...h, index, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return root.children;
}

// Index of the heading the caret is in (the last one starting at or before `pos`), or -1.
export function currentHeadingIndex(headings, pos) {
  let found = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].from <= pos) found = i;
    else break;
  }
  return found;
}

// Keyword filter: case-insensitive substring; every word of the query must match.
export function outlineMatches(text, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = String(text || '').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

// Stable key for remembering a collapsed heading across edits: level + text (+ a counter
// for duplicate titles).
export function outlineKeys(headings) {
  const seen = new Map();
  return headings.map((h) => {
    const base = `${h.level}:${h.text}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  });
}
