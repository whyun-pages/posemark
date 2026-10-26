import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, splitFrontMatter, extractFootnotes, renderFragment, buildStandaloneHtml } from '../src/renderer/markdown.js';

test('slugify', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('你好 世界!'), '你好-世界');
  assert.equal(slugify('Title {#Custom-ID}'), 'custom-id');
  assert.equal(slugify('<b>Bold</b> text'), 'bold-text');
});

test('splitFrontMatter', () => {
  const { body, meta } = splitFrontMatter('---\ntitle: "Hi"\nTags: a\n---\n# Body');
  assert.equal(body, '# Body');
  assert.deepEqual(meta, { title: 'Hi', tags: 'a' });
  assert.deepEqual(splitFrontMatter('# No meta'), { body: '# No meta', meta: null });
});

test('extractFootnotes pulls definitions out of the body', () => {
  const { body, defs } = extractFootnotes('Text[^1]\n\n[^1]: The note');
  assert.ok(!body.includes('[^1]:'));
  assert.equal(defs.get('1'), 'The note');
});

test('renderFragment renders headings with ids', () => {
  const html = renderFragment('# Hello World\n\n## Custom {#my-id}');
  assert.match(html, /<h1 id="hello-world">Hello World<\/h1>/);
  assert.match(html, /<h2 id="my-id">Custom<\/h2>/);
});

test('renderFragment strips front matter', () => {
  const html = renderFragment('---\ntitle: x\n---\nbody');
  assert.equal(html.trim(), '<p>body</p>');
});

test('renderFragment renders math with KaTeX', () => {
  assert.match(renderFragment('$x^2$'), /class="katex"/);
  assert.match(renderFragment('$$\nE=mc^2\n$$'), /katex-display/);
});

test('renderFragment highlights fenced code', () => {
  assert.match(renderFragment('```js\nconst a = 1;\n```'), /hljs-keyword/);
});

test('renderFragment applies image size and resolves the source', () => {
  const html = renderFragment('![shot|240x120](img/a.png)', { docPath: 'C:/d/doc.md' });
  assert.match(html, /src="file:\/\/\/C:\/d\/img\/a\.png"/);
  assert.match(html, /width="240"/);
  assert.match(html, /height="120"/);
  assert.match(html, /alt="shot"/);
});

test('renderFragment appends numbered footnotes', () => {
  const html = renderFragment('A[^n] B\n\n[^n]: Note text');
  assert.match(html, /<section class="footnotes">/);
  assert.match(html, /<li id="fn-1"><p>Note text/);
});

test('buildStandaloneHtml escapes the title', () => {
  const html = buildStandaloneHtml({ title: '<x>', bodyHtml: '<p>b</p>', css: 'p{}' });
  assert.match(html, /<title>&lt;x&gt;<\/title>/);
  assert.ok(html.includes('<p>b</p>'));
});
