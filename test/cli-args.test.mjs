import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCli, helpText } = require('../src/main/cli-args.js');

const cwd = path.resolve('C:\\work');
// an absolute path outside cwd, spelled so it is absolute on every platform
const elsewhere = path.resolve(cwd, '..', 'elsewhere', 'c.md');
const disk = {
  [path.resolve(cwd, 'a.md')]: 'file',
  [path.resolve(cwd, 'b.md')]: 'file',
  [path.resolve(cwd, 'notes')]: 'folder',
  [elsewhere]: 'file',
};
const kind = (p) => disk[p] || null;
const parse = (args, extra = {}) => parseCli(['Posemark.exe', ...args], { cwd, kind, ...extra });

test('no arguments: plain launch', () => {
  const r = parse([]);
  assert.equal(r.command, 'open');
  assert.deepEqual(r.paths, []);
  assert.equal(r.error, null);
});

test('files and folders, relative to the caller folder', () => {
  const r = parse(['a.md', 'notes', elsewhere]);
  assert.deepEqual(r.paths, [{ file: path.resolve(cwd, 'a.md') }, { folder: path.resolve(cwd, 'notes') }, { file: elsewhere }]);
});

test('missing paths are an error, Chromium flags are ignored', () => {
  assert.match(parse(['gone.md']).error, /no such file or folder: gone.md/);
  const r = parse(['--user-data-dir=x', '--inspect', 'a.md']);
  assert.equal(r.error, null);
  assert.equal(r.paths.length, 1);
});

test('help and version win over everything else', () => {
  assert.equal(parse(['a.md', '--help']).command, 'help');
  assert.equal(parse(['-v']).command, 'version');
  assert.equal(parse(['version']).command, 'version');
  assert.match(helpText(), /posemark export/);
});

test('-n and --wait', () => {
  const r = parse(['-n', '-w', 'a.md']);
  assert.equal(r.newWindow, true);
  assert.equal(r.wait, true);
});

test('`electron .` skips the app path', () => {
  const r = parseCli(['electron', '.', 'a.md'], { cwd, kind, defaultApp: true });
  assert.deepEqual(r.paths, [{ file: path.resolve(cwd, 'a.md') }]);
});

test('export: inputs, format, output and overrides', () => {
  const r = parse(['export', 'a.md', 'b.md', '-f', 'pdf', '-o', 'out', '--theme', 'night', '--paper=Letter', '--landscape', '--margin', '10 12', '--set', 'pdf-h1-page-break=true']);
  assert.equal(r.command, 'export');
  assert.equal(r.error, null);
  assert.deepEqual(r.inputs, [path.resolve(cwd, 'a.md'), path.resolve(cwd, 'b.md')]);
  assert.equal(r.format, 'pdf');
  assert.equal(r.out, path.resolve(cwd, 'out'));
  assert.deepEqual(r.overrides, {
    'export-theme': 'night',
    'pdf-paper': 'Letter',
    'pdf-landscape': 'true',
    'pdf-margin': '10 12',
    'pdf-h1-page-break': 'true',
  });
});

test('export errors', () => {
  assert.match(parse(['export']).error, /at least one file/);
  assert.match(parse(['export', 'gone.md']).error, /no such file: gone.md/);
  assert.match(parse(['export', 'a.md', '-f', 'docx']).error, /unknown format "docx"/);
  assert.match(parse(['export', 'a.md', '-f']).error, /-f needs a value/);
  assert.match(parse(['export', 'a.md', '--set', 'oops']).error, /key=value/);
});
