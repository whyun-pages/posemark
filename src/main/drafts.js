'use strict';
// Unsaved-draft backups: every dirty document is mirrored into `<userData>/drafts/<id>.md`
// (with a `.json` sidecar describing where it came from) until it is saved or discarded,
// so a crash or a forced shutdown never loses more than a couple of seconds of typing.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Stable id per source document (so a draft of the same file overwrites itself) and a
// per-window id for untitled documents (so two unsaved windows do not fight over one slot).
function draftId(docPath, fallback) {
  const key = docPath ? `path:${String(docPath).replace(/\\/g, '/').toLowerCase()}` : `untitled:${fallback || 'x'}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

class Drafts {
  constructor(dir) {
    this.dir = dir;
  }

  file(id) {
    return path.join(this.dir, `${id}.md`);
  }

  meta(id) {
    return path.join(this.dir, `${id}.json`);
  }

  async write({ id, content, docPath, title }) {
    await fsp.mkdir(this.dir, { recursive: true });
    const tmp = this.file(id) + '.tmp';
    await fsp.writeFile(tmp, content, 'utf8');
    await fsp.rename(tmp, this.file(id));
    const meta = { id, path: docPath || null, title: title || (docPath ? path.basename(docPath) : 'Untitled'), savedAt: Date.now(), bytes: Buffer.byteLength(content) };
    await fsp.writeFile(this.meta(id), JSON.stringify(meta), 'utf8');
    return meta;
  }

  async remove(id) {
    for (const p of [this.file(id), this.meta(id), this.file(id) + '.tmp']) {
      await fsp.unlink(p).catch(() => {});
    }
    return true;
  }

  async read(id) {
    const content = await fsp.readFile(this.file(id), 'utf8');
    const meta = await this.readMeta(id);
    return { ...meta, id, content };
  }

  async readMeta(id) {
    try {
      return JSON.parse(await fsp.readFile(this.meta(id), 'utf8'));
    } catch {
      return { id, path: null, title: 'Untitled', savedAt: 0 };
    }
  }

  // Newest first. Drafts whose Markdown file is gone (half-written) are skipped.
  async list() {
    let names = [];
    try {
      names = await fsp.readdir(this.dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      if (!fs.existsSync(this.file(id))) continue;
      const meta = await this.readMeta(id);
      let preview = '';
      try {
        const fd = await fsp.open(this.file(id), 'r');
        const buf = Buffer.alloc(400);
        const { bytesRead } = await fd.read(buf, 0, 400, 0);
        await fd.close();
        preview = buf.toString('utf8', 0, bytesRead).replace(/�$/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
      } catch {
        /* unreadable */
      }
      out.push({ ...meta, id, preview });
    }
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return out;
  }
}

module.exports = { Drafts, draftId };
