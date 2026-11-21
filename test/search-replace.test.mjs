import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSearchRegExp,
  hitKey,
  expandReplacement,
  contentFingerprint,
  findMatches,
  previewReplace,
  applyReplaceText,
  isReadOnlyMode,
} = require('../src/main/search-replace.js');

test('plain replace is literal, not regex', () => {
  const text = 'a.b a.b';
  assert.equal(applyReplaceText(text, { query: 'a.b', replacement: 'X' }).text, 'X X');
  assert.equal(applyReplaceText(text, { query: 'a.b', replacement: 'X' }).count, 2);
  // 'a.b' as a pattern would also match 'axb'; as a literal it must not.
  assert.equal(applyReplaceText('axb', { query: 'a.b', replacement: 'X' }).text, 'axb');
});

test('case sensitivity follows the search options', () => {
  assert.equal(applyReplaceText('Foo foo FOO', { query: 'foo', replacement: 'bar' }).count, 3);
  assert.equal(applyReplaceText('Foo foo FOO', { query: 'foo', replacement: 'bar' }).text, 'bar bar bar');
  assert.equal(applyReplaceText('Foo foo FOO', { query: 'foo', replacement: 'bar', caseSensitive: true }).text, 'Foo bar FOO');
});

test('whole word does not touch parts of longer words', () => {
  const out = applyReplaceText('cat cats concatenate', { query: 'cat', replacement: 'dog', wholeWord: true });
  assert.equal(out.text, 'dog cats concatenate');
  assert.equal(out.count, 1);
});

test('regex groups: $1, $&, $$ and named groups', () => {
  const out = applyReplaceText('2026-11-21', { query: '(\\d+)-(\\d+)-(\\d+)', replacement: '$3/$2/$1', regex: true });
  assert.equal(out.text, '21/11/2026');
  assert.equal(applyReplaceText('ab', { query: 'b', replacement: '[$&]', regex: true }).text, 'a[b]');
  assert.equal(applyReplaceText('ab', { query: 'b', replacement: '$$', regex: true }).text, 'a$');
  const named = applyReplaceText('hi there', { query: '(?<w>hi)', replacement: '<$<w>>', regex: true });
  assert.equal(named.text, '<hi> there');
  // $10 with a single group means $1 followed by a literal 0.
  assert.equal(expandReplacement('$10', /(a)b/.exec('ab')), 'a0');
});

test('only the selected hits are replaced', () => {
  const text = 'foo foo foo';
  const hits = findMatches(text, { query: 'foo' });
  assert.equal(hits.length, 3);
  const key = hitKey(hits[1]);
  const out = applyReplaceText(text, { query: 'foo', replacement: 'bar' }, [key]);
  assert.equal(out.text, 'foo bar foo');
  assert.equal(out.count, 1);
  // selecting nothing replaces nothing
  assert.equal(applyReplaceText(text, { query: 'foo', replacement: 'bar' }, []).text, text);
});

test('a selected hit is only replaced when the text at its coordinate still matches the preview', () => {
  // Previewed against 'foo\nfoo'; the second hit is selected.
  const previewed = findMatches('foo\nfoo', { query: 'foo' });
  assert.equal(previewed.length, 2);
  const selected = new Map([[hitKey(previewed[1]), previewed[1].match]]);
  // Unchanged file: the selected hit is replaced, the other is untouched.
  const out = applyReplaceText('foo\nfoo', { query: 'foo', replacement: 'bar' }, selected);
  assert.equal(out.text, 'foo\nbar');
  assert.equal(out.count, 1);
  // File edited after previewing: the text at line 2, col 0 is now 'bar',
  // so the stale hit is skipped and nothing is replaced.
  const stale = applyReplaceText('foo\nbar', { query: 'foo', replacement: 'bar' }, selected);
  assert.equal(stale.text, 'foo\nbar');
  assert.equal(stale.count, 0);
  // A Map entry without a previewed match falls back to coordinate-only
  // matching, like a plain list of keys.
  const noMatch = applyReplaceText('foo\nfoo', { query: 'foo', replacement: 'bar' }, new Map([[hitKey(previewed[1]), undefined]]));
  assert.equal(noMatch.text, 'foo\nbar');
  assert.equal(noMatch.count, 1);
  // A stale hit does not block the other selected hits in the same file.
  const both = new Map([
    [hitKey(previewed[0]), previewed[0].match],
    [hitKey(previewed[1]), previewed[1].match],
  ]);
  const mixed = applyReplaceText('foo\nbar', { query: 'foo', replacement: 'bar' }, both);
  assert.equal(mixed.text, 'bar\nbar');
  assert.equal(mixed.count, 1);
});

test('invalid regex throws and nothing is applied', () => {
  assert.throws(() => buildSearchRegExp({ query: '(', regex: true }), /Invalid regular expression/);
  assert.throws(() => applyReplaceText('x', { query: '(', replacement: 'y', regex: true }));
  assert.throws(() => previewReplace('x', { query: '(', replacement: 'y', regex: true }));
});

test('a pattern that can match empty text replaces nothing', () => {
  // Like searchFolder, empty matches are skipped rather than inserting the
  // replacement at every position.
  const out = applyReplaceText('bbb', { query: 'a*', replacement: 'X', regex: true });
  assert.equal(out.text, 'bbb');
  assert.equal(out.count, 0);
});

test('empty replacement deletes the matches', () => {
  assert.equal(applyReplaceText('aXbXc', { query: 'X', replacement: '' }).text, 'abc');
});

test('preview shows per-hit before/match/after and the replaced context', () => {
  const hits = previewReplace('hello world, hello there', { query: 'hello', replacement: 'hi' });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].line, 1);
  assert.equal(hits[0].match, 'hello');
  assert.equal(hits[0].replacement, 'hi');
  assert.equal(hits[0].replaced, 'hi world, hello there'.slice(0, hits[0].replaced.length));
  assert.equal(hits[0].before, '');
  assert.ok(hits[0].after.startsWith(' world'));
  // line numbers and columns are 1-based lines, 0-based columns, like searchFolder
  const multi = previewReplace('one\ntwo two', { query: 'two', replacement: '2' });
  assert.equal(multi.length, 2);
  assert.equal(multi[0].line, 2);
  assert.equal(multi[0].col, 0);
  assert.equal(multi[1].col, 4);
});

test('apply preserves line endings and the rest of the file byte for byte', () => {
  const text = 'a\r\nb foo\r\nc\n';
  const out = applyReplaceText(text, { query: 'foo', replacement: 'bar' });
  assert.equal(out.text, 'a\r\nb bar\r\nc\n');
});

test('dollar expansion matches native String.replace for nonexistent groups', () => {
  // Verified against Node's native behaviour: a reference to a group that
  // does not exist stays literal instead of being deleted.
  assert.equal(expandReplacement('$1', /x/.exec('x')), '$1');
  assert.equal(expandReplacement('$0', /x/.exec('x')), '$0');
  assert.equal(expandReplacement('$<nope>', /(a)/.exec('a')), '$<nope>');
  // $99 with one group stays literal: 9 is not a group either.
  assert.equal(expandReplacement('$99', /(a)/.exec('a')), '$99');
  assert.equal(expandReplacement('$07', /(a)/.exec('a')), '$07');
  // Two-digit fallback is kept: $10 / $11 with one group mean $1 + '0' / '1'.
  assert.equal(expandReplacement('$10', /(a)b/.exec('ab')), 'a0');
  assert.equal(expandReplacement('$11', /(a)/.exec('a')), 'a1');
  // An existing group that did not participate in the match expands to ''.
  assert.equal(expandReplacement('[$2]', /(a)|(b)/.exec('a')), '[]');
  assert.equal(expandReplacement('[$<y>]', /(?<x>a)|(?<y>b)/.exec('a')), '[]');
  // Same through the whole-text path, including a plain literal search.
  assert.equal(applyReplaceText('x', { query: 'x', replacement: '$1' }).text, '$1');
  assert.equal(applyReplaceText('x', { query: 'x', replacement: '$0' }).text, '$0');
});

test('preview stops at the limit and stays fast on many matches', () => {
  const text = 'foo\n'.repeat(40000); // ~160 KB, 40,000 matches
  const start = Date.now();
  const hits = previewReplace(text, { query: 'foo', replacement: 'bar', limit: 2000 });
  const ms = Date.now() - start;
  assert.equal(hits.length, 2000);
  assert.equal(hits[1999].line, 2000);
  assert.equal(hits[1999].col, 0);
  // The old per-hit rescan took ~8 s for this input; the incremental
  // tracker plus early stop should be orders of magnitude faster.
  assert.ok(ms < 2000, `preview took ${ms}ms`);
  // Without a limit the full scan still returns every hit, with correct
  // line numbers throughout.
  const all = findMatches(text, { query: 'foo' });
  assert.equal(all.length, 40000);
  assert.equal(all[39999].line, 40000);
});

test('findMatches honours a limit', () => {
  assert.equal(findMatches('foo foo foo', { query: 'foo', limit: 2 }).length, 2);
  assert.equal(findMatches('foo foo foo', { query: 'foo' }).length, 3);
});

test('read-only mode detection', () => {
  assert.equal(isReadOnlyMode(0o100444), true);
  assert.equal(isReadOnlyMode(0o100644), false);
  assert.equal(isReadOnlyMode(0o100600), false);
});

test('content fingerprint catches any change, including an inserted identical line', () => {
  const before = 'foo\nfoo\n';
  const fp = contentFingerprint(before);
  assert.equal(contentFingerprint(before), fp);
  assert.equal(contentFingerprint(''), contentFingerprint(''));
  assert.notEqual(contentFingerprint(''), fp);
  // A changed character changes the fingerprint.
  assert.notEqual(contentFingerprint('foo\nbar\n'), fp);
  // Codex's example: inserting an identical line before the selected hit
  // leaves the text at the old coordinate unchanged ('foo'), so the
  // per-hit match check alone would still pass — the whole-file
  // fingerprint is what catches it.
  assert.notEqual(contentFingerprint('foo\nfoo\nfoo\n'), fp);
});
