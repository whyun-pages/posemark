import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  ctx,
  resolveFile,
  resolveSrc,
  relativePath,
  imageMarkdownPath,
  imageFolderFor,
  parseImageTag,
  encodeMarkdownPath,
} from '../src/renderer/paths.js';

const require = createRequire(import.meta.url);
const images = require('../src/main/images.js');

test('relativePath walks up and down, case-insensitively on the shared prefix', () => {
  assert.equal(relativePath('C:/docs', 'C:/docs/assets/a.png'), 'assets/a.png');
  assert.equal(relativePath('C:/docs/sub', 'C:/docs/a.png'), '../a.png');
  assert.equal(relativePath('c:/Docs', 'C:/docs/a.png'), 'a.png');
  assert.equal(relativePath('C:/docs', 'D:/pics/a.png'), null);
  assert.equal(relativePath('/home/me', '/home/me/x/a.png'), 'x/a.png');
});

test('imageMarkdownPath: relative, ./ prefix, absolute, root url, escaping', () => {
  const doc = 'C:/notes/post.md';
  assert.equal(imageMarkdownPath('C:\\notes\\assets\\pic.png', { docPath: doc }), 'assets/pic.png');
  assert.equal(imageMarkdownPath('C:/notes/assets/pic.png', { docPath: doc, dotSlash: true }), './assets/pic.png');
  assert.equal(imageMarkdownPath('C:/notes/assets/pic.png', { docPath: doc, useRelative: false }), 'C:/notes/assets/pic.png');
  assert.equal(imageMarkdownPath('D:/elsewhere/pic.png', { docPath: doc }), 'D:/elsewhere/pic.png');
  assert.equal(imageMarkdownPath('C:/notes/my pic (1).png', { docPath: doc }), 'my%20pic%20%281%29.png');
  assert.equal(imageMarkdownPath('C:/notes/my pic.png', { docPath: doc, urlEscape: false }), '<my pic.png>');
  assert.equal(imageMarkdownPath('C:/site/static/img/a.png', { docPath: 'C:/site/content/p.md', rootUrl: 'C:/site/static' }), '/img/a.png');
  assert.equal(imageMarkdownPath('C:/other/a.png', { docPath: 'C:/site/content/p.md', rootUrl: 'C:/site/static' }), '../../other/a.png');
  assert.equal(imageMarkdownPath('C:/x/a.png', { docPath: null }), 'C:/x/a.png');
});

test('encodeMarkdownPath', () => {
  assert.equal(encodeMarkdownPath('a b/c(d).png'), 'a%20b/c%28d%29.png');
  assert.equal(encodeMarkdownPath('plain.png', false), 'plain.png');
  assert.equal(encodeMarkdownPath('a b.png', false), '<a b.png>');
});

test('imageFolderFor: front matter beats the preference, ${filename} expands', () => {
  const doc = 'C:/notes/post.md';
  assert.equal(imageFolderFor({ docPath: doc, fallback: 'assets' }), 'C:/notes/assets');
  assert.equal(imageFolderFor({ docPath: doc, fallback: '${filename}.assets' }), 'C:/notes/post.assets');
  assert.equal(imageFolderFor({ docPath: doc, copyTo: './img', fallback: 'assets' }), 'C:/notes/img');
  assert.equal(imageFolderFor({ docPath: doc, copyTo: '../shared/${filename}' }), 'C:/shared/post');
  assert.equal(imageFolderFor({ docPath: doc, copyTo: 'D:\\pics\\' }), 'D:/pics');
  assert.equal(imageFolderFor({ docPath: null, fallback: 'assets' }), null);
});

test('resolveFile / resolveSrc honour typora-root-url', () => {
  const doc = 'C:/site/content/p.md';
  assert.equal(resolveFile('img/a.png', doc, null), 'C:/site/content/img/a.png');
  assert.equal(resolveFile('/img/a.png', doc, 'C:/site/static'), 'C:/site/static/img/a.png');
  assert.equal(resolveFile('/srv/a.png', doc, null), '/srv/a.png');
  assert.equal(resolveFile('https://x.test/a.png', doc, 'C:/site/static'), null);
  assert.equal(resolveFile('my%20pic.png', doc, null), 'C:/site/content/my pic.png');
  ctx.rootUrl = 'C:/site/static';
  try {
    assert.equal(resolveSrc('/img/a.png', doc), 'file:///C:/site/static/img/a.png');
    assert.equal(resolveSrc('img/my pic.png', doc), 'file:///C:/site/content/img/my%20pic.png');
  } finally {
    ctx.rootUrl = null;
  }
});

test('parseImageTag reads width, height, zoom and sources', () => {
  assert.deepEqual(
    (({ tag, src, alt, width, height, zoom }) => ({ tag, src, alt, width, height, zoom }))(parseImageTag('<img src="a.png" alt="A" width="320" style="zoom:50%;">')),
    { tag: 'img', src: 'a.png', alt: 'A', width: 320, height: 0, zoom: '50%' },
  );
  assert.equal(parseImageTag("<img src='b.png' style='width: 200px; height: 100px'/>").width, 200);
  assert.equal(parseImageTag("<img src='b.png' style='width: 200px; height: 100px'/>").height, 100);
  assert.equal(parseImageTag('<video controls src="clip.mp4"></video>').tag, 'video');
  assert.equal(parseImageTag('<p>no</p>'), null);
});

test('resized / retargeted image sources for both syntaxes', async () => {
  const { resizedImageSource, retargetedImageSource } = await import('../src/renderer/blocks.js');
  assert.equal(resizedImageSource('![alt](a.png)', 320, 0), '![alt|320](a.png)');
  assert.equal(resizedImageSource('![alt|100](a.png "t")', 320, 200), '![alt|320x200](a.png "t")');
  assert.equal(resizedImageSource('![alt|100](a.png)', 0, 0), '![alt](a.png)');
  assert.equal(resizedImageSource('<img src="a.png" width="100" style="zoom:50%; border:1px">', 320, 0), '<img src="a.png" style="border:1px" width="320">');
  assert.equal(resizedImageSource('<img src="a.png" style="zoom:50%" />', 0, 0), '<img src="a.png" />');
  assert.equal(retargetedImageSource('![alt|320](old.png "t")', 'new/x.png'), '![alt|320](new/x.png "t")');
  assert.equal(retargetedImageSource('<img src="old.png" width="20">', 'https://h/x.png'), '<img src="https://h/x.png" width="20">');
  assert.equal(retargetedImageSource('<video controls src=\'c.mp4\'></video>', 'd.mp4'), '<video controls src="d.mp4"></video>');
  assert.equal(retargetedImageSource('plain', 'x'), null);
});

test('exported HTML resolves <img>/<video> sources like Markdown images', async () => {
  const { renderFragment } = await import('../src/renderer/markdown.js');
  const html = renderFragment('<img src="a b.png" width="320" style="zoom:50%">\n\nText <img src="in/line.png"> and\n\n<video controls src="clip.mp4"></video>', { docPath: 'C:/d/doc.md' });
  assert.match(html, /<img src="file:\/\/\/C:\/d\/a%20b\.png" width="320" style="zoom:50%">/);
  assert.match(html, /<img src="file:\/\/\/C:\/d\/in\/line\.png">/);
  assert.match(html, /<video controls src="file:\/\/\/C:\/d\/clip\.mp4">/);
});

test('images.js: import, copy, move and unique names', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-img-'));
  try {
    const src = path.join(dir, 'My Shot (1).png');
    fs.writeFileSync(src, 'png');
    const dest = path.join(dir, 'assets');
    const a = await images.importFile(src, dest);
    assert.equal(a.path, path.join(dest, 'My-Shot-1.png'));
    assert.equal(a.alt, 'My-Shot-1');
    const b = await images.importFile(src, dest);
    assert.equal(b.path, path.join(dest, 'My-Shot-1-1.png'));
    // importing a file already in the folder keeps it in place
    const c = await images.importFile(a.path, dest);
    assert.equal(c.path, a.path);
    assert.equal(c.copied, false);
    const moved = await images.moveTo(b.path, path.join(dir, 'moved'));
    assert.ok(fs.existsSync(moved.path));
    assert.ok(!fs.existsSync(b.path));
    const copied = await images.copyTo(a.path, path.join(dir, 'moved'));
    assert.ok(fs.existsSync(copied.path) && fs.existsSync(a.path));
    assert.deepEqual(await images.copyTo(path.join(dir, 'nope.png'), dest), { error: 'missing' });
    assert.equal((await images.copyTo(a.path, dest)).unchanged, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('images.js: download names the file from the URL or the content type', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-dl-'));
  try {
    const fakeFetch = async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => (url.includes('noext') ? 'image/jpeg' : 'application/octet-stream') },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const a = await images.download('https://h.test/pics/photo%20one.png?x=1', dir, fakeFetch);
    assert.equal(path.basename(a.path), 'photo-one.png');
    const b = await images.download('https://h.test/noext', dir, fakeFetch);
    assert.equal(path.basename(b.path), 'noext.jpg');
    assert.deepEqual(await images.download('ftp://x/y.png', dir, fakeFetch), { error: 'not-http' });
    const bad = await images.download('https://h.test/404.png', dir, async () => ({ ok: false, status: 404 }));
    assert.equal(bad.error, 'http 404');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('images.js: upload through a custom command and PicList', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posemark-up-'));
  try {
    const f1 = path.join(dir, 'a.png');
    const f2 = path.join(dir, 'b.png');
    fs.writeFileSync(f1, 'x');
    fs.writeFileSync(f2, 'y');
    // a script that echoes a URL per argument
    const script = path.join(dir, 'up.js');
    fs.writeFileSync(script, "for (const a of process.argv.slice(2)) console.log('[ok] https://cdn.test/' + require('path').basename(a));");
    const res = await images.upload([f1, f2], { uploader: 'custom', command: `"${process.execPath}" "${script}"` });
    assert.deepEqual(res.urls, ['https://cdn.test/a.png', 'https://cdn.test/b.png']);
    assert.equal(images.urlsFromOutput('x\n[PicGo SUCCESS]:\nhttps://a/b.png\n').length, 1);
    const none = await images.upload([f1], { uploader: 'none' });
    assert.match(none.error, /No image uploader/);
    const missing = await images.upload([path.join(dir, 'zz.png')], { uploader: 'custom', command: 'x' });
    assert.match(missing.error, /Not found/);
    const piclist = await images.upload([f1], { uploader: 'piclist', piclistUrl: 'http://127.0.0.1:1' }, async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:1/upload');
      assert.deepEqual(JSON.parse(init.body), { list: [f1] });
      return { ok: true, status: 200, json: async () => ({ success: true, result: ['https://pl.test/a.png'] }) };
    });
    assert.deepEqual(piclist.urls, ['https://pl.test/a.png']);
    const down = await images.upload([f1], { uploader: 'piclist', piclistUrl: 'http://127.0.0.1:1' }, async () => {
      throw new Error('ECONNREFUSED');
    });
    assert.match(down.error, /Could not reach PicList/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
