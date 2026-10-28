'use strict';
// Image files for the editor: landing dropped / pasted pictures in the document's image
// folder, moving and copying them, downloading remote ones, and handing local ones to an
// uploader (PicGo-Core, PicList or any command that prints URLs).
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif', '.tif', '.tiff', '.ico', '.apng']);
const MEDIA_EXT = new Set(['.mp4', '.webm', '.ogv', '.ogg', '.mov', '.m4v', '.mp3', '.wav', '.m4a', '.flac', '.aac']);

const isImageName = (name) => IMAGE_EXT.has(path.extname(name).toLowerCase());
const isMediaName = (name) => MEDIA_EXT.has(path.extname(name).toLowerCase());

const cleanStem = (name) =>
  name
    .replace(/[^\w.\-一-鿿぀-ヿ가-힯]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';

// A free file name inside `dir`, numbering collisions: pic.png, pic-1.png, pic-2.png …
function uniquePath(dir, stem, ext) {
  let dest = path.join(dir, stem + ext);
  let n = 1;
  while (fs.existsSync(dest)) dest = path.join(dir, `${stem}-${n++}${ext}`);
  return dest;
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

// Copy a dropped / chosen file into `destDir`; the same file already there is reused.
async function importFile(src, destDir) {
  if (!src || !fs.existsSync(src)) return null;
  await fsp.mkdir(destDir, { recursive: true });
  const ext = (path.extname(src) || '.png').toLowerCase();
  const stem = cleanStem(path.basename(src, path.extname(src)));
  if (samePath(path.dirname(src), destDir)) return { path: src, alt: stem, copied: false };
  const dest = uniquePath(destDir, stem, ext);
  await fsp.copyFile(src, dest);
  return { path: dest, alt: stem, copied: true };
}

// Clipboard bytes become `pasted-<timestamp>.<ext>` in `destDir`.
async function writePasted(bytes, mime, destDir) {
  const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/gif' ? '.gif' : mime === 'image/webp' ? '.webp' : mime === 'image/svg+xml' ? '.svg' : '.png';
  await fsp.mkdir(destDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  const dest = uniquePath(destDir, `pasted-${stamp}`, ext);
  await fsp.writeFile(dest, bytes);
  return { path: dest, alt: 'pasted image' };
}

async function copyTo(src, destDir) {
  if (!src || !fs.existsSync(src)) return { error: 'missing' };
  await fsp.mkdir(destDir, { recursive: true });
  if (samePath(path.dirname(src), destDir)) return { path: src, unchanged: true };
  const dest = uniquePath(destDir, path.basename(src, path.extname(src)), path.extname(src));
  await fsp.copyFile(src, dest);
  return { path: dest };
}

async function moveTo(src, destDir) {
  if (!src || !fs.existsSync(src)) return { error: 'missing' };
  await fsp.mkdir(destDir, { recursive: true });
  if (samePath(path.dirname(src), destDir)) return { path: src, unchanged: true };
  const dest = uniquePath(destDir, path.basename(src, path.extname(src)), path.extname(src));
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fsp.copyFile(src, dest);
    await fsp.unlink(src);
  }
  return { path: dest };
}

const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif', 'image/bmp': '.bmp' };

// Download `url` into `destDir` (name from the URL, extension from the content type when
// the URL has none). `fetchImpl` is Electron's net.fetch in the app, swappable in tests.
async function download(url, destDir, fetchImpl = globalThis.fetch, { timeoutMs = 30000, maxBytes = 64 * 1024 * 1024 } = {}) {
  if (!/^https?:\/\//i.test(url)) return { error: 'not-http' };
  await fsp.mkdir(destDir, { recursive: true });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return { error: `http ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return { error: 'too-large' };
    let name;
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
    } catch {
      name = '';
    }
    let ext = path.extname(name).toLowerCase();
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_EXT.has(ext)) ext = MIME_EXT[type] || ext || '.png';
    const stem = cleanStem(path.basename(name, path.extname(name)) || 'image');
    const dest = uniquePath(destDir, stem, ext);
    await fsp.writeFile(dest, buf);
    return { path: dest, bytes: buf.length };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// uploaders
// ---------------------------------------------------------------------------
const URL_LINE = /https?:\/\/[^\s"'<>]+/g;

function urlsFromOutput(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(URL_LINE);
    if (m) out.push(...m);
  }
  return out;
}

function runCommand(command, args, { shell = false, timeoutMs = 60000, cwd } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(command, args, { shell, cwd, windowsHide: true });
    } catch (err) {
      resolve({ code: -1, stdout, stderr: err.message });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* gone */
      }
      stderr += '\n(timed out)';
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

// Quote one argument for a shell command line (Windows cmd or POSIX sh).
const quoteArg = (a) => (process.platform === 'win32' ? `"${String(a).replace(/"/g, '\\"')}"` : `'${String(a).replace(/'/g, `'\\''`)}'`);

/**
 * Upload local files, returning `{ urls }` with one URL per input path in order, or
 * `{ error, output }`.
 *   picgo-core: `picgo upload <files>` (URLs are printed one per line)
 *   piclist:    POST {list: [files]} to the PicList HTTP server (default port 36677)
 *   custom:     `<command> <files…>`; the command prints the URLs
 */
async function upload(paths, options = {}, fetchImpl = globalThis.fetch) {
  const uploader = options.uploader || 'none';
  if (!paths.length) return { urls: [] };
  if (uploader === 'none') return { error: 'No image uploader is configured (Preferences › Images)' };
  const missing = paths.find((p) => !fs.existsSync(p));
  if (missing) return { error: `Not found: ${missing}` };

  if (uploader === 'piclist') {
    const base = String(options.piclistUrl || 'http://127.0.0.1:36677').replace(/\/+$/, '');
    try {
      const res = await fetchImpl(`${base}/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ list: paths }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return { error: `PicList answered ${res.status}` };
      if (!data.success || !Array.isArray(data.result)) return { error: data.message || 'PicList reported a failure', output: JSON.stringify(data) };
      if (data.result.length < paths.length) return { error: `PicList returned ${data.result.length} of ${paths.length} URLs`, output: JSON.stringify(data) };
      return { urls: data.result.slice(0, paths.length) };
    } catch (err) {
      return { error: `Could not reach PicList at ${base}: ${err.message}` };
    }
  }

  let result;
  if (uploader === 'picgo-core') {
    const bin = String(options.picgoPath || 'picgo').trim() || 'picgo';
    // picgo is usually an npm shim (.cmd on Windows), so run it through the shell
    result = await runCommand([quoteArg(bin), 'upload', ...paths.map(quoteArg)].join(' '), [], { shell: true });
  } else if (uploader === 'custom') {
    const cmd = String(options.command || '').trim();
    if (!cmd) return { error: 'No upload command is set (Preferences › Images)' };
    result = await runCommand([cmd, ...paths.map(quoteArg)].join(' '), [], { shell: true });
  } else {
    return { error: `Unknown uploader: ${uploader}` };
  }
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const urls = urlsFromOutput(result.stdout).filter((u) => !/picgo\.github\.io|github\.com\/PicGo/i.test(u));
  if (result.code !== 0 && urls.length < paths.length) return { error: `Uploader exited with code ${result.code}`, output };
  if (urls.length < paths.length) return { error: `Uploader printed ${urls.length} of ${paths.length} URLs`, output };
  // uploaders echo the whole batch at the end; take the last N lines
  return { urls: urls.slice(-paths.length), output };
}

// A 1×1 PNG to validate the uploader settings with.
async function testImage() {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==', 'base64');
  const dir = path.join(os.tmpdir(), 'posemark');
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `upload-test-${Date.now()}.png`);
  await fsp.writeFile(file, png);
  return file;
}

module.exports = { importFile, writePasted, copyTo, moveTo, download, upload, urlsFromOutput, testImage, isImageName, isMediaName, uniquePath, cleanStem, IMAGE_EXT, MEDIA_EXT };
