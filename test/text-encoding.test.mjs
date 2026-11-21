import { test } from 'node:test';
import assert from 'node:assert/strict';
import codec from '../src/main/text-encoding.js';

const { decodeText, encodeText } = codec;
const samples = [
  ['utf-8', 'e4b8ad'],
  ['utf-8', 'efbbbfe4b8ad'],
  ['utf-16le', 'fffe2d4e'],
  ['utf-16be', 'feff4e2d'],
];

test('detects Unicode encodings and preserves their exact byte order marks', () => {
  for (const [encoding, hex] of samples) {
    const bytes = Buffer.from(hex, 'hex');
    const decoded = decodeText(bytes);
    assert.equal(decoded.encoding, encoding);
    assert.equal(decoded.text, '中');
    assert.deepEqual(encodeText(decoded.text, decoded), bytes);
    assert.equal(decodeText(encodeText('中 🙂', decoded)).text, '中 🙂');
  }
  assert.deepEqual(encodeText('new'), Buffer.from('new'));
  assert.equal(decodeText(Buffer.alloc(0)).text, '');
  assert.equal(decodeText(Buffer.from('efbbbfefbbbf61', 'hex')).text, '\uFEFFa');
});

test('rejects unsupported or malformed byte sequences', () => {
  for (const hex of ['e920666f6f', 'd6', 'efbbbfd6d0', 'fffe61', 'feffd800', '0000feff00000061', '61006200']) {
    assert.throws(() => decodeText(Buffer.from(hex, 'hex')), { code: 'UNSUPPORTED_TEXT_ENCODING' });
  }
});


test('detects valid GBK after trying UTF-8 and preserves the GBK bytes on write', () => {
  const bytes = Buffer.from('d6d0cec4', 'hex');
  const decoded = decodeText(bytes);
  assert.deepEqual(decoded, { text: '中文', encoding: 'gbk', bom: null });
  assert.deepEqual(encodeText(decoded.text, decoded), bytes);
  assert.equal(encodeText('你好', decoded).toString('hex'), 'c4e3bac3');
  assert.equal(decodeText(Buffer.from('ASCII')).encoding, 'utf-8');
  assert.throws(() => encodeText('中文 🙂', decoded), /cannot be saved in GBK/);
});
