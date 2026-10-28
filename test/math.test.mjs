import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequenceToMermaid, flowToMermaid, diagramSource } from '../src/renderer/diagrams.js';
import { numberEquations, prepareTex, labelsOf, renderTex, PHYSICS_MACROS } from '../src/renderer/math.js';
import { ctx } from '../src/renderer/paths.js';

test('sequenceToMermaid maps js-sequence-diagrams syntax', () => {
  const out = sequenceToMermaid('Title: Demo\nparticipant A as "Alice"\nA->B: hi\nB-->A: back\nA->>B: open\nB-->>A: dashed open\nNote left of A: left\nNote over A,B: both');
  assert.equal(
    out,
    ['sequenceDiagram', '  title Demo', '  participant A as Alice', '  A->>B: hi', '  B-->>A: back', '  A-)B: open', '  B--)A: dashed open', '  Note left of A: left', '  Note over A,B: both'].join('\n'),
  );
});

test('flowToMermaid maps flowchart.js nodes and connections', () => {
  const out = flowToMermaid('st=>start: Start:>http://x.test\nop=>operation: Do "it"\ncond=>condition: Ok?\nio=>inputoutput: read\ne=>end: End\n\nst->op->cond\ncond(yes)->io->e\ncond(no,right)->op');
  assert.equal(
    out,
    [
      'flowchart TD',
      '  st(["Start"])',
      '  click st "http://x.test"',
      '  op["Do #quot;it#quot;"]',
      '  cond{"Ok?"}',
      '  io[/"read"/]',
      '  e(["End"])',
      '  st --> op',
      '  op --> cond',
      '  cond -->|yes| io',
      '  io --> e',
      '  cond -->|no| op',
    ].join('\n'),
  );
  assert.equal(diagramSource('mermaid', 'graph LR\nA-->B'), 'graph LR\nA-->B');
  assert.equal(diagramSource('js', 'x'), null);
  assert.match(diagramSource('flow', 'a=>start: A'), /^flowchart TD/);
});

test('numberEquations: none / ams / all, labels and explicit tags', () => {
  const blocks = [
    { tex: 'a = b' },
    { tex: '\\begin{align} x &= 1 \\label{eq:x} \\end{align}' },
    { tex: 'y = 2 \\label{eq:y}' },
    { tex: 'z \\tag{Z}' },
    { tex: '\\begin{align*} w \\end{align*}' },
  ];
  assert.deepEqual(numberEquations(blocks, 'none').numbers, [0, 0, 0, 0, 0]);
  const ams = numberEquations(blocks, 'ams');
  assert.deepEqual(ams.numbers, [0, 1, 2, 0, 0]);
  assert.equal(ams.labels.get('eq:x'), 1);
  assert.equal(ams.labels.get('eq:y'), 2);
  const all = numberEquations(blocks, 'all');
  assert.deepEqual(all.numbers, [1, 2, 3, 0, 4]);
});

test('prepareTex strips labels, resolves refs and appends the tag', () => {
  const labels = new Map([['eq:x', 3]]);
  assert.equal(prepareTex('y = f(x) \\label{eq:y}', { number: 4, labels }), 'y = f(x)\\tag{4}');
  assert.equal(prepareTex('see \\eqref{eq:x} and \\ref{nope}', { labels }), 'see \\text{(3)} and \\text{(?)}');
  assert.equal(prepareTex('z \\tag{Z}', { number: 9, labels }), 'z \\tag{Z}');
  assert.deepEqual(labelsOf('a \\label{one} b \\label{ two }'), ['one', 'two']);
});

test('renderTex knows mhchem and the physics macros', () => {
  const chem = renderTex('\\ce{H2O}', false);
  assert.match(chem, /katex/);
  assert.doesNotMatch(chem, /katex-error/);
  const phys = renderTex('\\dv{f}{x} + \\abs{y} + \\braket{a}{b} + \\vb{v} + \\grad \\phi', false);
  assert.doesNotMatch(phys, /katex-error/);
  assert.match(phys, /\\mathrm|mathrm|∂|d/);
  ctx.config.mathPhysics = false;
  try {
    // KaTeX shows an unknown command as red text (errorColor) instead of failing the expression
    assert.match(renderTex('\\abs{y}', false), /cc0000/);
    assert.doesNotMatch(phys, /cc0000/);
  } finally {
    ctx.config.mathPhysics = true;
  }
  assert.ok(Object.keys(PHYSICS_MACROS).length > 40);
});

test('exporter: numbering, \\[ \\], \\( \\), ```math and \\eqref', async () => {
  const { renderFragment } = await import('../src/renderer/markdown.js');
  ctx.config.mathNumbering = 'all';
  try {
    const html = renderFragment('$$\na = b \\label{eq:a}\n$$\n\n\\[\nc = d\n\\]\n\n```math\ne = f\n```\n\nInline \\(x^2\\) and $y$, see \\eqref{eq:a} and \\ref{eq:zz}.');
    assert.equal((html.match(/class="math-block"/g) || []).length, 3);
    assert.match(html, /id="eq-eq%3Aa" data-eq="1"/);
    assert.match(html, /data-eq="2"/);
    assert.match(html, /data-eq="3"/);
    assert.match(html, /<a class="eqref" href="#eq-eq%3Aa">\(1\)<\/a>/);
    assert.match(html, /<a class="eqref" href="#eq-eq%3Azz">\(\?\)<\/a>/);
    // both inline forms rendered as KaTeX
    assert.equal((html.match(/class="katex"/g) || []).length >= 2, true);
  } finally {
    ctx.config.mathNumbering = 'none';
  }
  const plain = renderFragment('$$\na = b\n$$\n\n```sequence\nA->B: hi\n```');
  assert.doesNotMatch(plain, /data-eq=/);
  assert.match(plain, /class="mermaid" data-lang="sequence" data-src="sequenceDiagram\n  A-&gt;&gt;B: hi"/);
});
