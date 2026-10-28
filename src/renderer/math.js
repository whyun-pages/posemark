// Math helpers shared by the editor widgets and the exporter: KaTeX options (mhchem,
// physics-style macros), equation numbering with \label / \ref, and the extra delimiters.
import katex from 'katex';
import 'katex/contrib/mhchem';
import { ctx } from './paths.js';

// A KaTeX-friendly subset of the LaTeX `physics` package. Macros take fixed arguments, so
// the optional-argument forms (\dv[n]{f}{x}, \qty(…)) degrade to their plain versions.
export const PHYSICS_MACROS = {
  '\\dd': '\\mathrm{d}',
  '\\dv': '\\frac{\\mathrm{d} #1}{\\mathrm{d} #2}',
  '\\pdv': '\\frac{\\partial #1}{\\partial #2}',
  '\\fdv': '\\frac{\\delta #1}{\\delta #2}',
  '\\abs': '\\left| #1 \\right|',
  '\\norm': '\\left\\| #1 \\right\\|',
  '\\eval': '\\left. #1 \\right|',
  '\\order': '\\mathcal{O}\\left( #1 \\right)',
  '\\qty': '',
  '\\pqty': '\\left( #1 \\right)',
  '\\bqty': '\\left[ #1 \\right]',
  '\\Bqty': '\\left\\{ #1 \\right\\}',
  '\\vqty': '\\left| #1 \\right|',
  '\\comm': '\\left[ #1 , #2 \\right]',
  '\\acomm': '\\left\\{ #1 , #2 \\right\\}',
  '\\pb': '\\left\\{ #1 , #2 \\right\\}',
  '\\bra': '\\left\\langle #1 \\right|',
  '\\ket': '\\left| #1 \\right\\rangle',
  '\\braket': '\\left\\langle #1 \\middle| #2 \\right\\rangle',
  '\\ketbra': '\\left| #1 \\middle\\rangle\\middle\\langle #2 \\right|',
  '\\dyad': '\\left| #1 \\middle\\rangle\\middle\\langle #2 \\right|',
  '\\expval': '\\left\\langle #1 \\right\\rangle',
  '\\mel': '\\left\\langle #1 \\middle| #2 \\middle| #3 \\right\\rangle',
  '\\vb': '\\mathbf{#1}',
  '\\va': '\\vec{\\mathbf{#1}}',
  '\\vu': '\\hat{\\mathbf{#1}}',
  '\\grad': '\\boldsymbol{\\nabla}',
  '\\divergence': '\\boldsymbol{\\nabla}\\cdot',
  '\\curl': '\\boldsymbol{\\nabla}\\times',
  '\\laplacian': '\\nabla^2',
  '\\cross': '\\times',
  '\\cp': '\\times',
  '\\crossproduct': '\\times',
  '\\vdot': '\\cdot',
  '\\dotproduct': '\\cdot',
  '\\tr': '\\operatorname{tr}',
  '\\Tr': '\\operatorname{Tr}',
  '\\rank': '\\operatorname{rank}',
  '\\erf': '\\operatorname{erf}',
  '\\Res': '\\operatorname{Res}',
  '\\pv': '\\mathcal{P}',
  '\\principalvalue': '\\mathcal{P}',
  '\\qq': '\\quad\\text{#1}\\quad',
  '\\qc': ',\\quad',
  '\\qqtext': '\\quad\\text{#1}\\quad',
  '\\qif': '\\quad\\text{if}\\quad',
  '\\qthen': '\\quad\\text{then}\\quad',
  '\\qelse': '\\quad\\text{else}\\quad',
  '\\qand': '\\quad\\text{and}\\quad',
  '\\qor': '\\quad\\text{or}\\quad',
  '\\qas': '\\quad\\text{as}\\quad',
  '\\qfor': '\\quad\\text{for}\\quad',
  '\\qsince': '\\quad\\text{since}\\quad',
  '\\qlet': '\\quad\\text{let}\\quad',
  '\\qunless': '\\quad\\text{unless}\\quad',
  '\\qotherwise': '\\quad\\text{otherwise}\\quad',
  '\\sin': '\\operatorname{sin}',
  '\\E': '\\mathrm{E}',
};
// \sin is already fine in KaTeX; keep the table honest
delete PHYSICS_MACROS['\\sin'];

export function katexOptions(displayMode, extra = {}) {
  const macros = ctx.config.mathPhysics === false ? {} : { ...PHYSICS_MACROS };
  return { displayMode, throwOnError: false, output: 'html', strict: 'ignore', macros, ...extra };
}

export function renderTex(tex, displayMode, extra) {
  return katex.renderToString(tex, katexOptions(displayMode, extra));
}

// AMS environments that LaTeX numbers (the starred forms do not).
const AMS_ENV_RE = /\\begin\{(equation|align|gather|multline|eqnarray|alignat|flalign)\}/;
const LABEL_RE = /\\label\{([^}]*)\}/g;
const TAG_RE = /\\(tag|notag|nonumber)\b/;

/**
 * Decide which display equations get a number. `blocks` is the document's display math in
 * order (`{ tex }` objects); `mode` is 'none' | 'ams' | 'all'.
 *   ams: AMS environments and anything carrying a \label are numbered
 *   all: every display equation (a \tag of its own is respected, \notag suppresses)
 * Returns the number for each block (0 = none) and the label → number map.
 */
export function numberEquations(blocks, mode = 'none') {
  const numbers = [];
  const labels = new Map();
  let n = 0;
  for (const b of blocks) {
    const tex = String(b.tex || '');
    const labelNames = [...tex.matchAll(LABEL_RE)].map((m) => m[1].trim()).filter(Boolean);
    const explicitTag = TAG_RE.test(tex);
    let numbered = false;
    if (!explicitTag) {
      if (mode === 'all') numbered = true;
      else if (mode === 'ams') numbered = AMS_ENV_RE.test(tex) || labelNames.length > 0;
    }
    const num = numbered ? ++n : 0;
    numbers.push(num);
    for (const name of labelNames) if (!labels.has(name)) labels.set(name, num || labels.size + 1);
  }
  return { numbers, labels };
}

const refText = (labels, name) => {
  const n = labels && labels.get(String(name).trim());
  return n ? `(${n})` : '(?)';
};

// Turn `\label{}` / `\ref{}` / `\eqref{}` inside TeX into something KaTeX can show, and add
// the equation number as a \tag.
export function prepareTex(tex, { number = 0, labels = null } = {}) {
  let out = String(tex).replace(LABEL_RE, '');
  out = out.replace(/\\(?:eq)?ref\{([^}]*)\}/g, (m, name) => `\\text{${refText(labels, name)}}`);
  if (number && !TAG_RE.test(out)) {
    // \tag must sit outside environments like align; appending it at the end works for KaTeX
    out = `${out.replace(/\s+$/, '')}\\tag{${number}}`;
  }
  return out;
}

export function labelsOf(tex) {
  return [...String(tex).matchAll(LABEL_RE)].map((m) => m[1].trim()).filter(Boolean);
}

// `\eqref{x}` / `\ref{x}` written in plain text (outside math).
export const TEXT_REF_RE = /\\(eqref|ref)\{([^}\n]+)\}/g;

export function renderRefText(labels, name) {
  return refText(labels, name);
}
