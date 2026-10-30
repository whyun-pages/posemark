'use strict';
// Document properties (Title / Author / Subject / Keywords) for a Chromium-printed PDF.
// printToPDF only fills in Title, so the rest is appended as a PDF incremental update:
// a new Info dictionary, a one-entry xref section and a trailer pointing back at the old one.

// PDF text string: plain ASCII stays literal, anything else becomes UTF-16BE hex with a BOM.
function pdfString(s) {
  const text = String(s);
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[\\()]/g, (c) => '\\' + c)})`;
  let hex = 'FEFF';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
    for (const u of units) hex += u.toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

// Returns a new buffer, or the input unchanged when the file is not a classic-xref PDF.
function setPdfInfo(buffer, info) {
  const entries = Object.entries(info || {}).filter(([, v]) => v !== undefined && v !== null && String(v) !== '');
  if (!entries.length) return buffer;
  const text = buffer.toString('latin1');
  const sx = text.lastIndexOf('startxref');
  const tr = text.lastIndexOf('trailer');
  if (sx < 0 || tr < 0 || tr > sx) return buffer;
  const prev = parseInt(text.slice(sx + 9).trim(), 10);
  const trailer = text.slice(tr, sx);
  const size = /\/Size\s+(\d+)/.exec(trailer);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer);
  if (!Number.isFinite(prev) || !size || !root) return buffer;

  // keep what Chromium wrote (Creator, Producer, dates) unless overridden
  const keep = {};
  const infoRef = /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  if (infoRef) {
    const m = new RegExp(`(?:^|\\s)${infoRef[1]}\\s+${infoRef[2]}\\s+obj\\s*<<([\\s\\S]*?)>>\\s*endobj`).exec(text);
    if (m) {
      for (const kv of m[1].matchAll(/\/(\w+)\s*(\([^)]*(?:\\\)[^)]*)*\)|<[0-9A-Fa-f\s]*>|\/\w+)/g)) keep[kv[1]] = kv[2];
    }
  }
  for (const [k, v] of entries) keep[k] = pdfString(v);

  const num = +size[1];
  const tail = buffer.length && buffer[buffer.length - 1] === 0x0a ? '' : '\n';
  const objOffset = buffer.length + Buffer.byteLength(tail, 'latin1');
  const obj = `${num} 0 obj\n<<${Object.entries(keep).map(([k, v]) => `/${k} ${v}`).join('\n')}>>\nendobj\n`;
  const xrefOffset = objOffset + Buffer.byteLength(obj, 'latin1');
  const xref =
    `xref\n${num} 1\n${String(objOffset).padStart(10, '0')} 00000 n \n` +
    `trailer\n<</Size ${num + 1}\n/Root ${root[1]}\n/Info ${num} 0 R\n/Prev ${prev}>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([buffer, Buffer.from(tail + obj + xref, 'latin1')]);
}

module.exports = { setPdfInfo, pdfString };
