import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTranslator, resolveLanguage, translateMenu } = require('../src/main/i18n.js');
const zh = require('../src/main/locales/zh-CN.js');

test('language resolution', () => {
  assert.equal(resolveLanguage('zh-CN', ['en-US']), 'zh-CN');
  assert.equal(resolveLanguage('en', ['zh-CN']), 'en');
  assert.equal(resolveLanguage('system', ['zh-TW', 'en']), 'zh-CN');
  assert.equal(resolveLanguage('system', ['fr-FR', 'en-GB']), 'en');
  assert.equal(resolveLanguage('system', ['fr-FR']), 'en');
  assert.equal(resolveLanguage('xx', []), 'en');
});

test('exact strings and templates', () => {
  const t = createTranslator('zh-CN');
  assert.equal(t('Save'), '保存');
  assert.equal(t('Exported to C:\\a b\\x.pdf'), '已导出到 C:\\a b\\x.pdf');
  assert.equal(t('323 words'), '323 字');
  assert.equal(t('Ln 3, Col 5'), '第 3 行，第 5 列');
  // a slot that is itself a known string is translated too
  assert.equal(t('Export with Previous (HTML without styles)'), '使用上次设置导出（无样式 HTML）');
  // the most literal template wins
  assert.equal(t('Saved to note.md'), '已保存到 note.md');
  assert.equal(t('Saved note.md'), '已保存 note.md');
  assert.equal(t('Something unknown'), 'Something unknown');
  assert.equal(createTranslator('en')('Save'), 'Save');
});

test('menu templates are translated, roles get labels', () => {
  const t = createTranslator('zh-CN');
  const menu = translateMenu([{ label: '&File', submenu: [{ label: 'Save' }, { type: 'separator' }, { role: 'copy' }, { label: 'notes.md' }] }], t);
  assert.equal(menu[0].label, '文件(&F)');
  assert.deepEqual(menu[0].submenu.map((i) => i.label), ['保存', undefined, '复制', 'notes.md']);
  const en = [{ label: '&File' }];
  assert.equal(translateMenu(en, createTranslator('en')), en);
});

test('dictionary templates keep their slots', () => {
  for (const [key, value] of Object.entries(zh)) {
    const slots = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(slots(value), slots(key), key);
  }
});
