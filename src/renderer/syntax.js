// Shared syntax helpers (highlighting + diagram language detection).
import hljs from 'highlight.js/lib/common';

export function highlightCode(code, lang) {
  const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export function isDiagramLang(lang) {
  return /^(mermaid|flow|flowchart|sequence)$/i.test((lang || '').trim());
}

export const knownLanguages = () => hljs.listLanguages();
