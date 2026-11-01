import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { fitDelimiters, isDelimiterMarker } from '../src/renderer/emphasis.js';

const md = new MarkdownIt();
const wrap = (before, sel, after, m = '**') => {
  const { start, end } = fitDelimiters(before, sel, after);
  return before + sel.slice(0, start) + m + sel.slice(start, end) + m + sel.slice(end) + after;
};

test('isDelimiterMarker', () => {
  for (const m of ['*', '**', '~~', '==', '_']) assert.ok(isDelimiterMarker(m));
  for (const m of ['`', '<u>', '^']) assert.ok(!isDelimiterMarker(m));
});

test('CJK punctuation at the selection edges moves inside the markers', () => {
  assert.equal(wrap('人一眼就知道', '「她」', '指的是小红'), '人一眼就知道「**她**」指的是小红');
  assert.equal(wrap('信息', '“借”', '过来'), '信息“**借**”过来');
  assert.equal(wrap('他说', '你好，', '然后'), '他说**你好**，然后');
  assert.match(md.renderInline(wrap('知道', '「她」', '指')), /<strong>她<\/strong>/);
});

test('selections that already flank are untouched', () => {
  assert.equal(wrap('知道', '她', '指'), '知道**她**指');
  assert.equal(wrap('say ', '"hi"', ' now'), 'say **"hi"** now');
  assert.equal(wrap('', '「她」', ''), '**「她」**');
  assert.equal(wrap('a', '!!', 'b'), 'a**!!**b'); // nothing renderable — leave as typed
});
