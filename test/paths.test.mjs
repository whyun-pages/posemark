import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirOf, toFileUrl, resolveSrc, basename } from '../src/renderer/paths.js';

test('dirOf normalises separators and returns the parent directory', () => {
  assert.equal(dirOf('C:\\docs\\note.md'), 'C:/docs');
  assert.equal(dirOf('/home/me/note.md'), '/home/me');
  assert.equal(dirOf('note.md'), null);
  assert.equal(dirOf(null), null);
});

test('toFileUrl builds file:/// URLs', () => {
  assert.equal(toFileUrl('C:\\docs\\a.png'), 'file:///C:/docs/a.png');
  assert.equal(toFileUrl('/home/me/a.png'), 'file:///home/me/a.png');
});

test('resolveSrc keeps remote and data URLs untouched', () => {
  for (const src of ['https://x.test/a.png', 'data:image/png;base64,AA', 'blob:abc', 'file:///a.png']) {
    assert.equal(resolveSrc(src, 'C:/d/doc.md'), src);
  }
});

test('resolveSrc resolves relative paths against the document', () => {
  assert.equal(resolveSrc('img/a.png', 'C:/d/doc.md'), 'file:///C:/d/img/a.png');
  assert.equal(resolveSrc('./img/a.png', 'C:/d/doc.md'), 'file:///C:/d/img/a.png');
  assert.equal(resolveSrc('../a.png', 'C:/d/sub/doc.md'), 'file:///C:/d/a.png');
  assert.equal(resolveSrc('img/a.png', null), 'img/a.png');
  assert.equal(resolveSrc('', 'C:/d/doc.md'), '');
});

test('resolveSrc handles absolute paths', () => {
  assert.equal(resolveSrc('D:\\pics\\a.png', 'C:/d/doc.md'), 'file:///D:/pics/a.png');
  assert.equal(resolveSrc('/srv/a.png', 'C:/d/doc.md'), 'file:///srv/a.png');
});

test('basename', () => {
  assert.equal(basename('C:\\a\\b.md'), 'b.md');
  assert.equal(basename('/x/y/z.md'), 'z.md');
  assert.equal(basename(''), '');
});

test('headingOf honours strict mode', async () => {
  const { headingOf } = await import('../src/renderer/blocks.js');
  const { ctx } = await import('../src/renderer/paths.js');
  assert.deepEqual(headingOf('## Two'), { level: 2, text: 'Two', marker: '##' });
  assert.equal(headingOf('##Tight'), null);
  ctx.config.strictMode = false;
  try {
    assert.deepEqual(headingOf('##Tight'), { level: 2, text: 'Tight', marker: '##' });
    assert.equal(headingOf('#######seven'), null);
    assert.equal(headingOf('#'), null);
  } finally {
    ctx.config.strictMode = true;
  }
});
