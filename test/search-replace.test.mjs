import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildSearchRegExp,
  hitKey,
  expandReplacement,
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

test('read-only mode detection', () => {
  assert.equal(isReadOnlyMode(0o100444), true);
  assert.equal(isReadOnlyMode(0o100644), false);
  assert.equal(isReadOnlyMode(0o100600), false);
});
