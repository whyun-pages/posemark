// Emoji shortcodes (`:smile:`) — the GitHub/gemoji table from markdown-it-emoji, shared by
// the live preview, the export renderer and the `:` autocomplete.
import full from 'markdown-it-emoji/lib/data/full.mjs';
import { ctx } from './paths.js';

export const EMOJI = full;

export function emojiFor(name) {
  return Object.prototype.hasOwnProperty.call(EMOJI, name) ? EMOJI[name] : null;
}

const NAMES = Object.keys(EMOJI);

// `:smi` -> a list of `:smile:` style completions. `inCode(state, pos)` keeps it out of
// fenced blocks and inline code, where a colon is just a colon.
export function emojiCompletion(inCode) {
  return (context) => {
    if (ctx.config.emojiAutocomplete === false) return null;
    const word = context.matchBefore(/:[a-z0-9_+\-]*$/i);
    if (!word) return null;
    // need at least one letter after the colon unless completion was requested explicitly
    if (word.text.length < 2 && !context.explicit) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (/[\p{L}\p{N}:]/u.test(before)) return null; // 10:30, http:// and ::
    if (inCode && inCode(context.state, word.from)) return null;
    const q = word.text.slice(1).toLowerCase();
    const starts = [];
    const contains = [];
    for (const name of NAMES) {
      if (name.startsWith(q)) starts.push(name);
      else if (q.length >= 2 && name.includes(q)) contains.push(name);
      if (starts.length >= 40) break;
    }
    const picked = [...starts, ...contains].slice(0, 40);
    if (!picked.length) return null;
    return {
      from: word.from,
      options: picked.map((name) => ({
        label: `:${name}:`,
        detail: EMOJI[name],
        type: 'emoji',
        boost: name.startsWith(q) ? 1 : 0,
      })),
      validFor: /^:[a-z0-9_+\-]*$/i,
    };
  };
}
