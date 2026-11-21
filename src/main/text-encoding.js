'use strict';

const iconv = require('iconv-lite');

const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
const utf16leBom = Buffer.from([0xff, 0xfe]);
const utf16beBom = Buffer.from([0xfe, 0xff]);
const utf32Boms = [Buffer.from([0xff, 0xfe, 0, 0]), Buffer.from([0, 0, 0xfe, 0xff])];

function decodeText(bytes) {
  const startsWith = (mark) => bytes.subarray(0, mark.length).equals(mark);
  let encoding = 'utf-8';
  let bom = null;
  const unsupported = () => Object.assign(
    new Error('Unsupported or invalid text encoding. Expected UTF-8, GBK, or UTF-16 with a byte order mark.'),
    { code: 'UNSUPPORTED_TEXT_ENCODING' },
  );
  if (utf32Boms.some(startsWith)) throw unsupported();
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
  if (!bom && body.includes(0)) throw unsupported();
  try {
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(body);
    return { text, encoding, bom };
  } catch {
    // An explicit BOM takes precedence. Without one, accept GBK only when
    // decoding and re-encoding preserves every byte.
    if (bom) throw unsupported();
    const text = iconv.decode(body, 'gbk');
    if (!iconv.encode(text, 'gbk').equals(body)) throw unsupported();
    return { text, encoding: 'gbk', bom: null };
  }
}

function encodeText(text, { encoding = 'utf-8', bom = null } = {}) {
  if (encoding === 'gbk') {
    const bytes = iconv.encode(text, 'gbk');
    if (iconv.decode(bytes, 'gbk') !== text) {
      throw new Error('This text contains characters that cannot be saved in GBK.');
    }
    return bytes;
  }
  const bytes = Buffer.from(text, encoding === 'utf-8' ? 'utf8' : 'utf16le');
  if (encoding === 'utf-16be') bytes.swap16();
  return bom ? Buffer.concat([bom, bytes]) : bytes;
}

module.exports = { decodeText, encodeText };
