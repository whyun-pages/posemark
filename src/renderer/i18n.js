// Interface language in the renderer. The app is written in English; `tr()` translates a finished
// string, and `watchDom()` translates UI text as it lands in the page (flash messages, menus,
// preferences, the status bar…) so most call sites stay plain English. User content — the editor,
// file names, headings, search hits — is never touched.
import i18n from '../main/i18n.js';

let t = i18n.createTranslator('en');

export const currentLanguage = () => t.lang;

// "A · B · C" status texts are translated part by part when the whole is not a known string.
export function tr(text) {
  if (t.lang === 'en' || text == null) return text;
  const s = String(text);
  const whole = t(s);
  if (whole !== s || !s.includes(' · ')) return whole;
  return s.split(' · ').map((part) => t(part)).join(' · ');
}

// Containers that show the user's own text.
const SKIP = '.cm-editor, #filetree, #filelist, #outline, #search-results, #quick-open-list, #folder-name, #drafts-list .draft-preview, iframe, .no-i18n';
const ATTRS = ['title', 'placeholder', 'aria-label'];
const originals = new WeakMap(); // text node -> English text
const outputs = new WeakMap(); // text node -> what we last wrote into it
const attrOriginals = new WeakMap(); // element -> { attr: English }

function skipped(el) {
  return !el || !!el.closest(SKIP);
}

function translateText(node) {
  const el = node.parentElement;
  if (skipped(el) || el.closest('script, style, textarea')) return;
  const raw = node.data;
  // what we wrote last time means the English original is still current; anything else was
  // written by the app and is the new original
  const english = outputs.get(node) === raw && originals.has(node) ? originals.get(node) : raw;
  if (!/[A-Za-z]/.test(english)) return;
  const lead = /^\s*/.exec(english)[0];
  const trail = /\s*$/.exec(english)[0];
  const core = english.trim();
  const out = core ? lead + tr(core) + trail : english;
  originals.set(node, english);
  outputs.set(node, out);
  if (out !== raw) node.data = out;
}

function translateAttrs(el) {
  if (skipped(el)) return;
  let saved = attrOriginals.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !/[A-Za-z]/.test(v)) continue;
    if (!saved) attrOriginals.set(el, (saved = {}));
    // a value we did not write ourselves is a new English original
    if (saved[a] === undefined || (v !== saved[a] && v !== saved[`${a}:out`])) saved[a] = v;
    const out = tr(saved[a]);
    saved[`${a}:out`] = out;
    if (out !== v) el.setAttribute(a, out);
  }
}

export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
  translateAttrs(root);
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) translateAttrs(el);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) translateText(n);
}

let observer = null;

export function watchDom(root = document.body) {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
      else for (const n of r.addedNodes) translateTree(n);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// Switch the language and re-translate everything on the page from the English originals.
export function setLanguage(lang, root = document.body) {
  t = i18n.createTranslator(lang);
  document.documentElement.lang = lang === 'zh-CN' ? 'zh-CN' : 'en';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const english = originals.get(n);
    if (english !== undefined && n.data === outputs.get(n) && n.data !== english) {
      n.data = english;
      outputs.set(n, english);
    }
  }
  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
    const saved = attrOriginals.get(el);
    if (!saved) continue;
    for (const a of ATTRS) if (saved[a] !== undefined) el.setAttribute(a, saved[a]);
  }
  translateTree(root);
}

export const LANGUAGES = i18n.LANGUAGES;
