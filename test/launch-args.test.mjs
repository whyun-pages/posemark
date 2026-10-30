import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseLaunchArgs } = require('../src/main/launch-args.js');

const disk = { 'C:\\notes\\a.md': 'file', 'C:\\notes': 'folder', 'C:\\notes\\pic.png': 'file' };
const kind = (p) => disk[p] || null;

test('a file on the command line opens as the document', () => {
  assert.deepEqual(parseLaunchArgs(['Posemark.exe', 'C:\\notes\\a.md'], { kind }), { file: path.resolve('C:\\notes\\a.md') });
});

test('a folder on the command line opens in the sidebar', () => {
  assert.deepEqual(parseLaunchArgs(['Posemark.exe', 'C:\\notes'], { kind }), { folder: path.resolve('C:\\notes') });
});

test('flags and missing paths are skipped', () => {
  assert.deepEqual(parseLaunchArgs(['Posemark.exe', '--user-data-dir=x', 'C:\\gone.md', 'C:\\notes\\a.md'], { kind }), {
    file: path.resolve('C:\\notes\\a.md'),
  });
  assert.equal(parseLaunchArgs(['Posemark.exe'], { kind }), null);
  assert.equal(parseLaunchArgs(['Posemark.exe', '--inspect'], { kind }), null);
});

test('any existing file is accepted, not only Markdown', () => {
  assert.deepEqual(parseLaunchArgs(['Posemark.exe', 'C:\\notes\\pic.png'], { kind }), { file: path.resolve('C:\\notes\\pic.png') });
});

test('`electron .` skips the app path', () => {
  assert.equal(parseLaunchArgs(['electron', 'C:\\notes'], { kind, defaultApp: true }), null);
  assert.deepEqual(parseLaunchArgs(['electron', '.', 'C:\\notes'], { kind, defaultApp: true }), { folder: path.resolve('C:\\notes') });
});
