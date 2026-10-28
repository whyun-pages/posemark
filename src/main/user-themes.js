'use strict';
// User theme folder (`<userData>/themes`): whole themes (`mytheme.css`) show up in the
// Themes menu, and `base.user.css` / `<theme>.user.css` are appended to every theme / that
// theme — the same layout Typora uses, so its override snippets drop straight in.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const README = `Posemark theme folder
=====================

- base.user.css      overrides applied to every theme
- <theme>.user.css   overrides applied to one theme (default.user.css, night.user.css, …)
- <name>.css         a complete theme; it appears in the Themes menu as "<Name>"
                     (start the file with /* dark */ to mark it as a dark theme)

Styles are plain CSS. The editor is a CodeMirror view (.cm-editor, .cm-md-h1 … .cm-md-h6,
.md-pre, .md-table, …) and exports use .markdown-body — see styles/ in the app folder for the
variables each theme defines (--bg, --fg, --accent, --font-body, …).

Changes apply the next time the theme is (re)selected or the window is reloaded (Ctrl+R).
`;

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

class UserThemes {
  constructor(dir) {
    this.dir = dir;
  }

  async ensure() {
    await fsp.mkdir(this.dir, { recursive: true });
    const readme = path.join(this.dir, 'README.txt');
    if (!fs.existsSync(readme)) await fsp.writeFile(readme, README, 'utf8');
    const base = path.join(this.dir, 'base.user.css');
    if (!fs.existsSync(base)) await fsp.writeFile(base, '/* Posemark: rules here apply to every theme. */\n', 'utf8');
    return this.dir;
  }

  // Complete themes dropped into the folder.
  list() {
    let names = [];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.css') || name.endsWith('.user.css')) continue;
      const id = name.slice(0, -4).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      if (!id) continue;
      let dark = /dark|night|black/i.test(id);
      try {
        const head = fs.readFileSync(path.join(this.dir, name), 'utf8').slice(0, 400);
        if (/\/\*\s*dark\s*\*\//i.test(head)) dark = true;
        if (/\/\*\s*light\s*\*\//i.test(head)) dark = false;
      } catch {
        /* skip */
      }
      out.push({ id, name: titleCase(name.slice(0, -4)), dark, user: true, file: path.join(this.dir, name) });
    }
    return out;
  }

  // The override CSS for `themeId` (base + theme-specific), empty strings when absent.
  async overrides(themeId) {
    const read = (p) => fsp.readFile(p, 'utf8').catch(() => '');
    const base = await read(path.join(this.dir, 'base.user.css'));
    const theme = themeId ? await read(path.join(this.dir, `${themeId}.user.css`)) : '';
    return { base, theme };
  }
}

module.exports = { UserThemes };
