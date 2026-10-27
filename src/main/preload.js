'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

contextBridge.exposeInMainWorld('ink', {
  platform: process.platform,
  openFileDialog: (dir) => ipcRenderer.invoke('dialog:openFile', dir),
  openImageDialog: (dir) => ipcRenderer.invoke('dialog:openImage', dir),
  initialFile: () => ipcRenderer.invoke('app:initial'),
  exportCss: (themeId) => ipcRenderer.invoke('styles:export', themeId),
  openFolderDialog: (dir) => ipcRenderer.invoke('dialog:openFolder', dir),
  saveFileAs: (payload) => ipcRenderer.invoke('dialog:saveFileAs', payload),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, content) => ipcRenderer.invoke('file:write', p, content),
  exists: (p) => ipcRenderer.invoke('file:exists', p),
  readDir: (dir) => ipcRenderer.invoke('file:dir', dir),
  walk: (dir) => ipcRenderer.invoke('file:walk', dir),
  stat: (p) => ipcRenderer.invoke('file:stat', p),
  watchFolder: (dir) => ipcRenderer.invoke('folder:watch', dir),
  searchFolder: (payload) => ipcRenderer.invoke('search:folder', payload),
  reveal: (p) => ipcRenderer.invoke('file:reveal', p),
  createFile: (dir, name) => ipcRenderer.invoke('file:create', dir, name),
  makeDir: (dir, name) => ipcRenderer.invoke('file:mkdir', dir, name),
  renamePath: (p, name) => ipcRenderer.invoke('file:rename', p, name),
  deletePath: (p) => ipcRenderer.invoke('file:delete', p),
  // real filesystem path of a dropped File (Electron >= 32 removed File.path)
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  importImage: (src, docPath) => ipcRenderer.invoke('image:import', { src, docPath }),
  pasteImage: (docPath) => ipcRenderer.invoke('image:pasteClipboard', { docPath }),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (p) => ipcRenderer.invoke('config:set', p),
  setState: (s) => ipcRenderer.invoke('state:set', s),
  themes: () => ipcRenderer.invoke('theme:list'),
  pickTheme: (id) => ipcRenderer.invoke('theme:pick', id),
  exportHtml: (payload) => ipcRenderer.invoke('export:html', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  closeWindow: () => ipcRenderer.invoke('app:close'),
  showAppMenu: (x, y) => ipcRenderer.invoke('app:showMenu', { x, y }),
  confirm: (payload) => ipcRenderer.invoke('app:confirm', payload),
  info: (payload) => ipcRenderer.invoke('app:info', payload),
  paths: () => ipcRenderer.invoke('app:paths'),
  setZoom: (f) => ipcRenderer.invoke('app:setZoom', f),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('app:setAlwaysOnTop', on),
  toggleFullScreen: () => ipcRenderer.invoke('app:toggleFullScreen'),
  clipboardRead: () => ipcRenderer.invoke('app:clipboardRead'),
  clipboardWrite: (t) => ipcRenderer.invoke('app:clipboardWrite', t),
  clipboardWriteHtml: (payload) => ipcRenderer.invoke('app:clipboardWriteHtml', payload),
  dataUrl: (p) => ipcRenderer.invoke('file:dataUrl', p),
  katexCss: () => ipcRenderer.invoke('katex:css'),
  rasterize: (payload) => ipcRenderer.invoke('export:rasterize', payload),
  onCommand: on('menu:command'),
  onConfig: on('config:changed'),
  onTreeChanged: on('tree:changed'),
});
