'use strict';
// The command line, for the first launch and for a second instance (`posemark` on PATH runs the
// same executable; see README › Command line):
//
//   posemark [options] [path…]              open files / folders (reuses the running instance)
//   posemark export [options] <file.md>…    write HTML / PDF / PNG next to the files, no window
//   posemark --help | --version
//
// Flags Posemark does not know (`--user-data-dir=…`, `--inspect`, the verification modes) are
// left alone so Chromium and the test modes still see them. In `electron .` the app path is
// skipped too. Paths are resolved against `cwd` (a second instance may run from another folder).
const fs = require('fs');
const path = require('path');

const FORMATS = ['html', 'html-plain', 'pdf', 'png', 'wechat'];

// CLI option → front matter key (the same overrides a document can carry)
const SETTINGS = {
  theme: 'export-theme',
  paper: 'pdf-paper',
  landscape: 'pdf-landscape',
  margin: 'pdf-margin',
  header: 'pdf-header',
  footer: 'pdf-footer',
  outline: 'html-outline',
};

function statKind(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory() ? 'folder' : st.isFile() ? 'file' : null;
  } catch {
    return null;
  }
}

function parseCli(argv, { defaultApp = false, cwd = process.cwd(), kind = statKind } = {}) {
  // `electron .`: the app path is the first positional argument, not necessarily argv[1] (a second
  // instance hands its switches over first)
  const args = (argv || []).slice(1);
  if (defaultApp) {
    const appArg = args.findIndex((a) => a && !a.startsWith('-'));
    if (appArg >= 0) args.splice(appArg, 1);
  }
  const out = { command: 'open', paths: [], newWindow: false, wait: false, format: 'html', out: null, overrides: {}, inputs: [], error: null };
  const missing = [];
  const positional = [];
  const need = (i, flag) => {
    if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
      out.error = `${flag} needs a value`;
      return undefined;
    }
    return args[i + 1];
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (a === '-h' || a === '--help' || a === 'help') return { ...out, command: 'help' };
    if (a === '-v' || a === '--version' || a === 'version') return { ...out, command: 'version' };
    if (a === '-n' || a === '--new-window') {
      out.newWindow = true;
      continue;
    }
    if (a === '-w' || a === '--wait') {
      out.wait = true;
      continue;
    }
    if (a === '--landscape') {
      out.overrides[SETTINGS.landscape] = 'true';
      continue;
    }
    if (a === '--no-outline' || a === '--outline') {
      out.overrides[SETTINGS.outline] = a === '--outline' ? 'true' : 'false';
      continue;
    }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const name = eq > 0 ? a.slice(2, eq) : a.startsWith('--') ? a.slice(2) : null;
    const inlineValue = eq > 0 ? a.slice(eq + 1) : undefined;
    const value = (flag) => (inlineValue !== undefined ? inlineValue : ((i += 1), need(i - 1, flag)));
    if (a === '-f' || name === 'format') {
      const v = value(a);
      if (v !== undefined) {
        if (!FORMATS.includes(v)) out.error = `unknown format "${v}" (one of ${FORMATS.join(', ')})`;
        out.format = v;
      }
      continue;
    }
    if (a === '-o' || name === 'out' || name === 'output') {
      const v = value(a);
      if (v !== undefined) out.out = path.resolve(cwd, v);
      continue;
    }
    if (name === 'set') {
      const v = value(a);
      if (v !== undefined) {
        const k = v.indexOf('=');
        if (k <= 0) out.error = `--set wants key=value, got "${v}"`;
        else out.overrides[v.slice(0, k).trim().toLowerCase()] = v.slice(k + 1);
      }
      continue;
    }
    if (name && SETTINGS[name]) {
      const v = value(a);
      if (v !== undefined) out.overrides[SETTINGS[name]] = v;
      continue;
    }
    if (a.startsWith('-')) continue; // not ours
    positional.push(a);
  }

  if (positional[0] === 'export') {
    out.command = 'export';
    for (const p of positional.slice(1)) {
      const full = path.resolve(cwd, p);
      if (kind(full) === 'file') out.inputs.push(full);
      else missing.push(p);
    }
    if (!out.error && missing.length) out.error = `no such file: ${missing.join(', ')}`;
    else if (!out.error && !out.inputs.length) out.error = 'export needs at least one file';
    return out;
  }

  for (const p of positional) {
    const full = path.resolve(cwd, p);
    const k = kind(full);
    if (k === 'file') out.paths.push({ file: full });
    else if (k === 'folder') out.paths.push({ folder: full });
    else missing.push(p);
  }
  if (missing.length) out.error = `no such file or folder: ${missing.join(', ')}`;
  return out;
}

function helpText(name = 'posemark') {
  return `Usage: ${name} [options] [path…]
       ${name} export [options] <file.md>…

Open files in the editor or folders in the sidebar. A running Posemark window is reused;
a path opens in a new window.

Options
  -n, --new-window       always open a new window
  -w, --wait             return when the window of the opened file closes
  -h, --help             show this help
  -v, --version          show the version

Export (no window is shown; output goes next to each file unless -o is given)
  -f, --format <fmt>     ${FORMATS.join(' | ')}  (default: html)
  -o, --out <path>       output file (one input) or folder (several inputs)
      --theme <id>       export theme, e.g. default, night, sepia
      --paper <size>     PDF paper: A4, Letter, … or 148x210 (mm)
      --landscape        PDF landscape
      --margin <mm>      PDF margins: "18" or "top right bottom left"
      --header <text>    PDF header with \${title} \${author} \${today} \${pageNo} \${pageCount}
      --footer <text>    PDF footer
      --outline          HTML with the outline panel      --no-outline  without
      --set <key=value>  any front matter export key (pdf-h1-page-break, html-head, …)
`;
}

module.exports = { parseCli, helpText, FORMATS, SETTINGS };
