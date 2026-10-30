'use strict';
// UI translation shared by the main process (menus, dialogs) and the renderer (bundled by esbuild).
// The English text is the key. A key may carry `{name}` slots: "Exported to {path}" matches any
// "Exported to …" string and the captured parts are put back into the translation, so call sites
// keep building their English strings and translate the finished text.

const LOCALES = {
  'zh-CN': require('./locales/zh-CN'),
};

// what the language preference offers: [value, label in its own language]
const LANGUAGES = [
  ['system', 'System / 跟随系统'],
  ['en', 'English'],
  ['zh-CN', '简体中文'],
];

// 'system' | 'en' | 'zh-CN' + the OS locale list → the language the UI uses
function resolveLanguage(setting, systemLocales = []) {
  if (setting && setting !== 'system') return LOCALES[setting] || setting === 'en' ? setting : 'en';
  for (const loc of systemLocales) {
    const l = String(loc || '').toLowerCase();
    if (l.startsWith('zh')) return 'zh-CN';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(dict) {
  const patterns = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!/\{\w+\}/.test(key)) continue;
    const names = [];
    const re = escapeRe(key).replace(/\\\{(\w+)\\\}/g, (_m, name) => {
      names.push(name);
      return '([\\s\\S]+?)';
    });
    patterns.push({ re: new RegExp(`^${re}$`), names, value, fixed: key.replace(/\{\w+\}/g, '').length });
  }
  // the most literal text first, so "Upload failed: {e}" wins over "{x}: {y}"
  patterns.sort((a, b) => b.fixed - a.fixed);
  return patterns;
}

function createTranslator(lang) {
  const dict = LOCALES[lang] || null;
  const patterns = dict ? compile(dict) : [];
  const cache = new Map();
  const t = (text) => {
    if (!dict || text == null) return text;
    const s = String(text);
    if (Object.prototype.hasOwnProperty.call(dict, s)) return dict[s];
    if (cache.has(s)) return cache.get(s);
    let out = s;
    for (const p of patterns) {
      const m = p.re.exec(s);
      if (!m) continue;
      // slots are translated too when they are themselves known strings (format names, units…)
      out = p.value.replace(/\{(\w+)\}/g, (all, name) => {
        const i = p.names.indexOf(name);
        if (i < 0) return all;
        const part = m[i + 1];
        return Object.prototype.hasOwnProperty.call(dict, part) ? dict[part] : part;
      });
      break;
    }
    if (cache.size < 2000) cache.set(s, out);
    return out;
  };
  t.lang = lang;
  return t;
}

// Electron menu template: labels translated in place (roles get an explicit label, since
// Electron's built-in role labels are English).
const ROLE_LABELS = {
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  minimize: 'Minimize',
  zoom: 'Zoom',
  close: 'Close',
  toggleDevTools: 'Toggle Developer Tools',
};

function translateMenu(template, t) {
  if (!t || !t.lang || t.lang === 'en') return template;
  return template.map((item) => {
    if (!item || item.type === 'separator') return item;
    const out = { ...item };
    if (out.label) out.label = t(out.label);
    else if (out.role && ROLE_LABELS[out.role]) out.label = t(ROLE_LABELS[out.role]);
    if (Array.isArray(out.submenu)) out.submenu = translateMenu(out.submenu, t);
    return out;
  });
}

module.exports = { LANGUAGES, resolveLanguage, createTranslator, translateMenu };
