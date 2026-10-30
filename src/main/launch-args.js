'use strict';
// What a launch (or a second instance) was asked to open: the first existing path on the command
// line. A file opens in the editor, a folder opens in the sidebar (Explorer's "Open Folder with
// Posemark"). Flags (`--user-data-dir=…`) are skipped; in `electron .` the app path is too.
const fs = require('fs');
const path = require('path');

function statKind(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory() ? 'folder' : st.isFile() ? 'file' : null;
  } catch {
    return null;
  }
}

function parseLaunchArgs(argv, { defaultApp = false, kind = statKind } = {}) {
  const args = (argv || []).slice(defaultApp ? 2 : 1).filter((a) => a && !a.startsWith('-'));
  for (const a of args) {
    const k = kind(a);
    if (k === 'file') return { file: path.resolve(a) };
    if (k === 'folder') return { folder: path.resolve(a) };
  }
  return null;
}

module.exports = { parseLaunchArgs };
