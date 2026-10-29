import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { splitFrontMatter, buildStandaloneHtml } from '../src/renderer/markdown.js';
import {
  resolveExportSettings,
  parseMargins,
  exportVars,
  expandVars,
  paperSize,
  pdfTemplate,
  pdfOptions,
  pdfCss,
  pdfInfo,
  outlineHtml,
} from '../src/renderer/export-settings.js';

const require = createRequire(import.meta.url);
const { setPdfInfo, pdfString } = require('../src/main/pdf-info.js');

test('front matter: block lists and block scalars', () => {
  const { meta } = splitFrontMatter('---\ntitle: T\nkeywords:\n  - a\n  - "b c"\nhtml-head: |\n  <meta name="x">\n  <link rel="y">\nnext: 1\n---\nbody');
  assert.equal(meta.keywords, 'a, b c');
  assert.equal(meta['html-head'], '<meta name="x">\n<link rel="y">');
  assert.equal(meta.next, '1');
  assert.equal(meta.title, 'T');
});

test('front matter overrides export settings', () => {
  const config = { pdfPaperSize: 'A4', pdfH1PageBreak: false, htmlOutline: false, pdfMarginTop: 18 };
  const out = resolveExportSettings(config, {
    'pdf-paper': 'Letter',
    'pdf-h1-page-break': 'yes',
    'html-outline': 'true',
    'pdf-margin': '10 20',
    'pdf-landscape': 'maybe',
    title: 'ignored',
  });
  assert.equal(out.pdfPaperSize, 'Letter');
  assert.equal(out.pdfH1PageBreak, true);
  assert.equal(out.htmlOutline, true);
  assert.deepEqual([out.pdfMarginTop, out.pdfMarginRight, out.pdfMarginBottom, out.pdfMarginLeft], [10, 20, 10, 20]);
  assert.equal(out.pdfLandscape, undefined);
  assert.equal(config.pdfPaperSize, 'A4');
  assert.equal(parseMargins('x'), null);
});

test('variables expand with escaping and leave unknown names alone', () => {
  const vars = exportVars({ title: 'A & B', author: 'Ann' }, { filePath: 'C:\\docs\\note.md', now: new Date(2026, 0, 5) });
  assert.equal(vars.filename, 'note');
  assert.equal(vars.today, '2026-01-05');
  assert.equal(expandVars('${title} by ${Author} on ${today} ${nope}', vars), 'A &amp; B by Ann on 2026-01-05 ${nope}');
  assert.equal(exportVars(null, { filePath: '/x/y.md' }).title, 'y');
});

test('paper sizes', () => {
  assert.equal(paperSize('letter'), 'Letter');
  assert.equal(paperSize('nonsense'), 'A4');
  const b5 = paperSize('B5');
  assert.ok(Math.abs(b5.width - 176 / 25.4) < 1e-9);
  const custom = paperSize('148 x 210 mm');
  assert.ok(Math.abs(custom.height - 210 / 25.4) < 1e-9);
  assert.deepEqual(paperSize('8.5x11in'), { width: 8.5, height: 11 });
});

test('pdf header / footer templates', () => {
  assert.equal(pdfTemplate('', {}), '');
  const t = pdfTemplate('${title} | | ${pageNo} / ${pageCount}', { title: 'Doc' });
  assert.match(t, /text-align:left[^"]*">Doc</);
  assert.match(t, /<span class="pageNumber"><\/span> \/ <span class="totalPages"><\/span>/);
  const o = pdfOptions({ pdfPaperSize: 'A4', pdfFooter: '${pageNo}', pdfMarginTop: 25.4 }, {});
  assert.equal(o.displayHeaderFooter, true);
  assert.equal(o.margins.top, 1);
  assert.equal(o.headerTemplate, '<span></span>');
  assert.equal(pdfOptions({}, {}).displayHeaderFooter, false);
  assert.match(pdfCss({ pdfH1PageBreak: true }), /h1:not\(:first-child\) \{ break-before: page/);
  assert.doesNotMatch(pdfCss({}), /break-before/);
});

test('pdf info from front matter', () => {
  assert.deepEqual(pdfInfo({ author: 'Ann', description: 'D', tags: '[a, "b"]' }, 'T'), { Title: 'T', Author: 'Ann', Subject: 'D', Keywords: 'a, b' });
  assert.deepEqual(pdfInfo(null, 'T'), { Title: 'T' });
});

test('outline nests headings', () => {
  const html = outlineHtml([
    { level: 2, id: 'a', text: 'A' },
    { level: 3, id: 'b', text: 'B <x>' },
    { level: 2, id: 'c', text: 'C' },
  ]);
  assert.match(html, /<ul><li><details open><summary><a href="#a">A<\/a><\/summary><ul><li><a href="#b">B &lt;x&gt;<\/a><\/li><\/ul><\/details><\/li><li><a href="#c">C<\/a><\/li><\/ul>/);
  assert.equal(outlineHtml([]), '');
});

test('standalone html without styles and with additions', () => {
  const html = buildStandaloneHtml({ title: 't', bodyHtml: '<p>b</p>', css: '', head: '<meta name="h">', afterBody: '<script>1</script>' });
  assert.doesNotMatch(html, /<style>/);
  assert.match(html, /<meta name="h">\n<\/head>/);
  assert.match(html, /<\/div>\n<script>1<\/script>\n<\/body>/);
});

test('pdf info incremental update', () => {
  const objs = ['1 0 obj\n<</Title (old)\n/Producer (Skia/PDF m140)>>\nendobj\n', '2 0 obj\n<</Type /Catalog>>\nendobj\n'];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (const o of objs) {
    offsets.push(body.length);
    body += o;
  }
  const xref = body.length;
  body += `xref\n0 3\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size 3\n/Root 2 0 R\n/Info 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  const out = setPdfInfo(Buffer.from(body, 'latin1'), { Title: 'New', Author: '张三' }).toString('latin1');
  assert.ok(out.startsWith(body));
  const tail = out.slice(body.length);
  assert.match(tail, /^3 0 obj\n<<\/Title \(New\)\n\/Producer \(Skia\/PDF m140\)\n\/Author <FEFF5F204E09>>>\nendobj\n/);
  assert.match(tail, /\/Size 4\n\/Root 2 0 R\n\/Info 3 0 R\n\/Prev \d+/);
  const objAt = +/xref\n3 1\n(\d{10})/.exec(tail)[1];
  assert.equal(out.slice(objAt, objAt + 7), '3 0 obj');
  const sx = +/startxref\n(\d+)\n%%EOF\n$/.exec(tail)[1];
  assert.equal(out.slice(sx, sx + 4), 'xref');
  assert.equal(pdfString('a(b)'), '(a\\(b\\))');
  assert.equal(setPdfInfo(Buffer.from('junk'), { Title: 'x' }).toString(), 'junk');
});
