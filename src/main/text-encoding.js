'use strict';

const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
const utf16leBom = Buffer.from([0xff, 0xfe]);
const utf16beBom = Buffer.from([0xfe, 0xff]);
const utf32Boms = [Buffer.from([0xff, 0xfe, 0, 0]), Buffer.from([0, 0, 0xfe, 0xff])];

function decodeText(bytes) {
  const startsWith = (mark) => bytes.subarray(0, mark.length).equals(mark);
  let encoding = 'utf-8';
  let bom = null;
  try {
    if (utf32Boms.some(startsWith)) throw new Error();
    if (startsWith(utf8Bom)) {
      bom = utf8Bom;
    } else if (startsWith(utf16leBom)) {
      encoding = 'utf-16le';
      bom = utf16leBom;
    } else if (startsWith(utf16beBom)) {
      encoding = 'utf-16be';
      bom = utf16beBom;
    }
    const body = bytes.subarray(bom?.length ?? 0);
    // NUL bytes without a BOM often indicate UTF-16 or binary data.
    if (!bom && body.includes(0)) throw new Error();
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(body);
    return { text, encoding, bom };
  } catch {
    const err = new Error('Unsupported or invalid text encoding. Expected UTF-8 or UTF-16 with a byte order mark.');
    err.code = 'UNSUPPORTED_TEXT_ENCODING';
    throw err;
  }
}

function encodeText(text, { encoding = 'utf-8', bom = null } = {}) {
  const bytes = Buffer.from(text, encoding === 'utf-8' ? 'utf8' : 'utf16le');
  if (encoding === 'utf-16be') bytes.swap16();
  return bom ? Buffer.concat([bom, bytes]) : bytes;
}

module.exports = { decodeText, encodeText };
