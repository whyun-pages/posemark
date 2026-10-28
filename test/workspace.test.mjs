import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildOutlineTree, currentHeadingIndex, outlineMatches, outlineKeys } from '../src/renderer/outline.js';
import { countText, readingTime, formatReadingTime } from '../src/renderer/wordcount.js';

const require = createRequire(import.meta.url);
const { Drafts, draftId } = require('../src/main/drafts.js');
const { UserThemes } = require('../src/main/user-themes.js');

const H = (level, text, from) => ({ level, text, from, line: from });

test('buildOutlineTree nests headings by level', () => {
  const tree = buildOutlineTree([H(1, 'A', 0), H(2, 'A.1', 10), H(3, 'A.1.a', 20), H(2, 'A.2', 30), H(1, 'B', 40)]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].text, 'A');
  assert.deepEqual(tree[0].children.map((c) => c.text), ['A.1', 'A.2']);
  assert.equal(tree[0].children[0].children[0].text, 'A.1.a');
  assert.equal(tree[1].children.length, 0);
  // a document that starts deep still works
  const deep = buildOutlineTree([H(3, 'x', 0), H(1, 'y', 5)]);
  assert.deepEqual(deep.map((n) => n.text), ['x', 'y']);
});

test('currentHeadingIndex picks the heading the caret is under', () => {
  const hs = [H(1, 'A', 0), H(2, 'B', 50), H(1, 'C', 100)];
  assert.equal(currentHeadingIndex(hs, 0), 0);
  assert.equal(currentHeadingIndex(hs, 49), 0);
  assert.equal(currentHeadingIndex(hs, 50), 1);
  assert.equal(currentHeadingIndex(hs, 500), 2);
  assert.equal(currentHeadingIndex([H(1, 'A', 10)], 3), -1);
});

test('outlineMatches is a case-insensitive all-words filter', () => {
  assert.equal(outlineMatches('Getting Started', 'start'), true);
  assert.equal(outlineMatches('Getting Started', 'get start'), true);
  assert.equal(outlineMatches('Getting Started', 'stop'), false);
  assert.equal(outlineMatches('anything', ''), true);
});

test('outlineKeys disambiguates duplicate titles', () => {
  assert.deepEqual(outlineKeys([H(2, 'Notes', 0), H(2, 'Notes', 1), H(3, 'Notes', 2)]), ['2:Notes', '2:Notes#1', '3:Notes']);
});

test('countText counts words, characters, lines and paragraphs', () => {
  const c = countText('Hello world\n\n你好世界\n\n```\ncode\n```\n');
  assert.equal(c.words, 3 + 4); // code inside the fence is still a word
  assert.equal(c.cjk, 4);
  assert.equal(c.latin, 3);
  assert.equal(c.chars, 'Helloworld'.length + 4 + '```code```'.length);
  assert.equal(c.lines, 8);
  assert.equal(c.paragraphs, 2); // the fence is not prose
  assert.deepEqual(countText(''), { words: 0, chars: 0, charsWithSpaces: 0, lines: 0, paragraphs: 0, cjk: 0, latin: 0 });
});

test('readingTime rounds to whole minutes and never reports 0 for real text', () => {
  assert.equal(readingTime(countText(''), 275), 0);
  assert.equal(readingTime(countText('one two three'), 275), 1);
  assert.equal(readingTime({ latin: 550, cjk: 0 }, 275), 2);
  assert.equal(readingTime({ latin: 0, cjk: 900 }, 300), 2);
  assert.equal(formatReadingTime(0), '0 min');
  assert.equal(formatReadingTime(7), '7 min');
  assert.equal(formatReadingTime(125), '2 h 5 min');
});

test('draftId is stable per path and distinct per untitled session', () => {
  assert.equal(draftId('C:\\notes\\a.md'), draftId('c:/notes/A.md'));
  assert.notEqual(draftId('C:/a.md'), draftId('C:/b.md'));
  assert.notEqual(draftId(null, 'session-1'), draftId(null, 'session-2'));
  assert.match(draftId('x'), /^[a-f0-9]{16}$/);
});

test('Drafts writes, lists newest first, reads and removes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-drafts-'));
  try {
    const d = new Drafts(dir);
    assert.deepEqual(await d.list(), []);
    await d.write({ id: 'aaaa', content: '# Old\n\nbody', docPath: 'C:/notes/old.md' });
    await new Promise((r) => setTimeout(r, 5));
    await d.write({ id: 'bbbb', content: 'untitled text', docPath: null, title: 'Untitled' });
    const list = await d.list();
    assert.deepEqual(list.map((x) => x.id), ['bbbb', 'aaaa']);
    assert.equal(list[1].title, 'old.md');
    assert.equal(list[1].path, 'C:/notes/old.md');
    assert.equal(list[1].preview, '# Old body');
    const read = await d.read('aaaa');
    assert.equal(read.content, '# Old\n\nbody');
    // overwriting keeps one slot per id
    await d.write({ id: 'aaaa', content: 'newer', docPath: 'C:/notes/old.md' });
    assert.equal((await d.list()).length, 2);
    assert.equal((await d.read('aaaa')).content, 'newer');
    await d.remove('aaaa');
    assert.deepEqual((await d.list()).map((x) => x.id), ['bbbb']);
    assert.equal(fs.existsSync(path.join(dir, 'aaaa.md')), false);
    // a half-written draft (no .md) is not listed
    fs.writeFileSync(path.join(dir, 'cccc.json'), '{"id":"cccc"}');
    assert.deepEqual((await d.list()).map((x) => x.id), ['bbbb']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('UserThemes lists whole themes and reads overrides', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-themes-'));
  try {
    const t = new UserThemes(dir);
    assert.deepEqual(t.list(), []);
    await t.ensure();
    assert.ok(fs.existsSync(path.join(dir, 'base.user.css')));
    assert.ok(fs.existsSync(path.join(dir, 'README.txt')));
    fs.writeFileSync(path.join(dir, 'my-paper.css'), ':root { --bg: #fff; }');
    fs.writeFileSync(path.join(dir, 'Midnight Blue.css'), '/* dark */\n:root { --bg: #000; }');
    fs.writeFileSync(path.join(dir, 'default.user.css'), 'h1 { color: red }');
    fs.writeFileSync(path.join(dir, 'base.user.css'), 'body { letter-spacing: 1px }');
    const list = t.list().sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(
      list.map((x) => [x.id, x.name, x.dark, x.user]),
      [
        ['midnight-blue', 'Midnight Blue', true, true],
        ['my-paper', 'My Paper', false, true],
      ],
    );
    assert.equal(list[1].file, path.join(dir, 'my-paper.css'));
    const over = await t.overrides('default');
    assert.equal(over.base, 'body { letter-spacing: 1px }');
    assert.equal(over.theme, 'h1 { color: red }');
    assert.equal((await t.overrides('night')).theme, '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
