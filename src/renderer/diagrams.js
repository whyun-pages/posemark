// Typora's two extra diagram languages, translated to Mermaid so one renderer draws all
// three. `sequence` is js-sequence-diagrams syntax, `flow` is flowchart.js syntax.

const esc = (s) => String(s).replace(/"/g, '#quot;');

// --- sequence (js-sequence-diagrams) ----------------------------------------
//   Title: Here is a title
//   participant A as "Alias"
//   A->B: Normal line          A-->B: Dashed line
//   A->>B: Open arrow          A-->>B: Dashed open arrow
//   Note left of A: text / Note right of A: text / Note over A,B: text
export function sequenceToMermaid(src) {
  const out = ['sequenceDiagram'];
  for (const raw of String(src).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = /^title\s*:\s*(.*)$/i.exec(line))) {
      out.push(`  title ${m[1].trim()}`);
      continue;
    }
    if ((m = /^participant\s+("[^"]*"|\S+)(?:\s+as\s+("[^"]*"|.+))?$/i.exec(line))) {
      const id = m[1].replace(/^"|"$/g, '');
      const alias = m[2] ? m[2].trim().replace(/^"|"$/g, '') : '';
      out.push(alias ? `  participant ${id} as ${alias}` : `  participant ${id}`);
      continue;
    }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(line))) {
      const who = m[2].trim().replace(/\s*,\s*/g, ',');
      out.push(`  Note ${m[1].toLowerCase()} ${who}: ${m[3].trim() || ' '}`);
      continue;
    }
    if ((m = /^(.+?)\s*(-->>|->>|-->|->)\s*(.+?)\s*:\s*(.*)$/.exec(line))) {
      const arrow = { '->': '->>', '-->': '-->>', '->>': '-)', '-->>': '--)' }[m[2]];
      out.push(`  ${m[1].trim()}${arrow}${m[3].trim()}: ${m[4].trim() || ' '}`);
      continue;
    }
    // anything else passes through, Mermaid will complain if it is wrong
    out.push(`  ${line}`);
  }
  return out.join('\n');
}

// --- flow (flowchart.js) ----------------------------------------------------
//   st=>start: Start:>http://example.com   e=>end: End
//   op=>operation: Do a thing              sub=>subroutine: Call it
//   cond=>condition: Yes or No?            io=>inputoutput: catch something
//   para=>parallel: both ways
//   st->op->cond   cond(yes)->io->e   cond(no,right)->sub(right)->op   para(path1,bottom)->e
const SHAPES = {
  start: (t) => `([${t}])`,
  end: (t) => `([${t}])`,
  operation: (t) => `[${t}]`,
  subroutine: (t) => `[[${t}]]`,
  condition: (t) => `{${t}}`,
  inputoutput: (t) => `[/${t}/]`,
  parallel: (t) => `[${t}]`,
};

export function flowToMermaid(src) {
  const nodes = [];
  const edges = [];
  const known = new Set();
  for (const raw of String(src).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = /^([A-Za-z0-9_]+)\s*=>\s*([a-z]+)\s*:\s*(.*)$/i.exec(line))) {
      const id = m[1];
      const type = m[2].toLowerCase();
      let text = m[3].trim();
      let href = '';
      const link = /:>\s*(\S+)\s*$/.exec(text);
      if (link) {
        href = link[1];
        text = text.slice(0, link.index).trim();
      }
      text = text.replace(/\|\s*[A-Za-z0-9_]+\s*$/, '').trim(); // |flowstate hints
      const shape = SHAPES[type] || SHAPES.operation;
      nodes.push(`  ${id}${shape(`"${esc(text || id)}"`)}`);
      if (href) nodes.push(`  click ${id} "${href}"`);
      known.add(id);
      continue;
    }
    if (line.includes('->')) {
      const parts = line.split('->').map((p) => p.trim());
      for (let i = 0; i < parts.length - 1; i++) {
        const from = /^([A-Za-z0-9_]+)(?:\(([^)]*)\))?$/.exec(parts[i]);
        const to = /^([A-Za-z0-9_]+)/.exec(parts[i + 1]);
        if (!from || !to) continue;
        // (yes), (no, right), (path1, bottom): the first word is the label, the rest a direction hint
        const label = from[2] ? from[2].split(',')[0].trim() : '';
        const isDirection = /^(left|right|top|bottom)$/i.test(label);
        edges.push(label && !isDirection ? `  ${from[1]} -->|${esc(label)}| ${to[1]}` : `  ${from[1]} --> ${to[1]}`);
      }
      continue;
    }
  }
  return ['flowchart TD', ...nodes, ...edges].join('\n');
}

// Mermaid source for a diagram fence, or null when the language is not a diagram.
export function diagramSource(lang, code) {
  const l = String(lang || '').trim().toLowerCase();
  if (l === 'mermaid') return code;
  if (l === 'sequence') return sequenceToMermaid(code);
  if (l === 'flow' || l === 'flowchart') return flowToMermaid(code);
  return null;
}
