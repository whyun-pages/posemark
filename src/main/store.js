'use strict';
// Tiny JSON config store persisted under the app's userData directory.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'default',
  // follow the OS dark mode: `theme` is used in light mode, `themeDark` in dark mode
  themeFollowSystem: false,
  themeDark: 'night',
  // what a fresh launch opens: 'new' | 'folder' (last folder) | 'file' (last file + folder) | 'fixed'
  launchAction: 'folder',
  launchFolder: '',
  recordRecent: true,
  readingSpeed: 275,
  fontSize: 16,
  lineWidth: 760,
  autoSave: false,
  autoSaveDelay: 900,
  showStatusBar: true,
  showSidebar: true,
  sidebarWidth: 240,
  sidebarTab: 'files',
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  lineNumbersInCode: false,
  codeWrap: true,
  inlineMath: true,
  smartTypography: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  emojiAutocomplete: true,
  pasteHtmlAsMarkdown: true,
  emoji: true,
  githubAlerts: true,
  strictMode: true,
  preserveLineBreaks: false,
  indentSize: 4,
  spellcheck: true,
  confirmOnClose: true,
  defaultExtension: 'md',
  // file tree
  treeSort: 'natural',
  treeSortDesc: false,
  treeShowHidden: false,
  treeShowAllFiles: false,
  reloadOnExternalChange: true,
  // Copy for WeChat style (see WECHAT_DEFAULTS in src/renderer/wechat.js)
  wechatTheme: 'current',
  wechatFontSize: 16,
  wechatLineHeight: 1.75,
  wechatLetterSpacing: 0.02,
  wechatParagraphSpacing: 16,
  wechatJustify: false,
  wechatAccent: '',
  wechatHeadingStyle: 'bar',
  wechatFirstLineIndent: false,
  wechatCodeLang: true,
  wechatLinkRefs: true,
  recentFiles: [],
  recentFolders: [],
  pinnedFolders: [],
  closedFiles: [],
  lastFolder: null,
  activeFile: null,
  windowBounds: null,
  // sidebar › Files: 'tree' or 'list' (every file under the folder, newest first)
  filesView: 'tree',
  // outline panel: flat list instead of a collapsible tree
  outlineFlat: false,
  outlineCollapsed: {},
};

class Store {
  constructor(file) {
    this.file = file;
    this.data = { ...DEFAULTS };
    this.load();
    this._timer = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(raw);
      this.data = { ...DEFAULTS, ...parsed };
    } catch {
      this.data = { ...DEFAULTS };
    }
    return this.data;
  }

  get(key) {
    return key === undefined ? this.data : this.data[key];
  }

  set(patch) {
    Object.assign(this.data, patch);
    this.scheduleSave();
    return this.data;
  }

  scheduleSave() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), 250);
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('failed to save config', err);
    }
  }
}

module.exports = { Store, DEFAULTS };
