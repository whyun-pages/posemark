'use strict';
// Capture real UI states, without replacing application styles or content widgets.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const lang = process.env.POSEMARK_SHOT_LANG;
const profile = process.env.POSEMARK_SHOT_PROFILE;
if (!['zh', 'en'].includes(lang) || !profile) throw Error('Run shots.mjs');
const folder = path.join(__dirname, lang === 'zh' ? '我的笔记' : 'Notes');
const doc = path.join(folder, lang === 'zh' ? '写作指南.md' : 'Writing guide.md');
const math = path.join(folder, lang === 'zh' ? '公式与图表.md' : 'Math and diagrams.md');
const out = path.join(__dirname, 'out');
fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({
  language: lang === 'zh' ? 'zh-CN' : 'en', theme: 'default', themeFollowSystem: false,
  launchAction: 'file', activeFile: doc, lastFolder: folder, recordRecent: false,
  sidebarWidth: 240, showSidebar: true, sidebarTab: 'files', filesView: 'tree', fontSize: 17, lineWidth: 690,
  windowBounds: { width: 1120, height: 740 },
}));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.on('browser-window-created', (_, win) => { win.show = () => {}; });
require('../../src/main/main.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const manifest = [];
app.whenReady().then(async () => {
  const deadline = setTimeout(() => { console.error('Screenshot deadline exceeded'); app.exit(1); }, 100_000);
  try {
    const win = BrowserWindow.getAllWindows()[0];
    const js = code => win.webContents.executeJavaScript(code);
    const until = async (code, label) => {
      for (let i = 0; i < 160; i++) { try { if (await js(code)) return; } catch {} await pause(100); }
      throw Error('Not ready: ' + label);
    };
    await until('!!window.__ink && document.querySelectorAll(".tree-item").length > 0', 'editor');
    await js(`window.__ink.openPath(${JSON.stringify(doc)})`);
    await js(`(async()=>{for(const row of [...document.querySelectorAll('.tree-item.dir')]){row.click();await new Promise(r=>setTimeout(r,120));}})()`);
    const settle = async () => {
      await js(`(()=>{const v=window.__ink.view();v.dispatch({selection:{anchor:v.state.doc.length}});v.contentDOM.blur();document.querySelector('.cm-scroller').scrollTop=0;document.querySelector('#filetree').blur();})()`);
      await js('document.fonts.ready'); await pause(350);
    };
    const shot = async (name, region, target = win) => {
      if (['editor', 'math', 'source', 'dark', 'dark-feature'].includes(name)) {
        const modernTree = await js(`(()=>{const tree=document.querySelector('#filetree');const row=tree.querySelector('.tree-item.dir');const arrow=row?.querySelector('.twisty svg');const icon=[...row?.querySelectorAll('.tree-icon svg')||[]].find(e=>e.getBoundingClientRect().width>0);const toolbar=document.querySelector('#btn-tree-collapse');return tree.getBoundingClientRect().width>0&&arrow?.getBoundingClientRect().width===14&&icon?.getBoundingClientRect().width===16&&row.offsetHeight===30&&toolbar.getBoundingClientRect().width===28})()`);
        if (!modernTree) throw Error(name + ' screenshot must show the current file tree and toolbar');
      }
      const clip = region ? await target.webContents.executeJavaScript(region) : undefined;
      await target.webContents.capturePage(clip, { stayHidden: true, stayAwake: true });
      await pause(180);
      const image = await target.webContents.capturePage(clip, { stayHidden: true, stayAwake: true });
      if (image.isEmpty()) throw Error('Empty image: ' + name);
      const file = `${name}-${lang}.png`;
      fs.writeFileSync(path.join(out, file), image.toPNG());
      const size = image.getSize(); manifest.push({ name, file, ...size });
      console.log(file, size.width, size.height);
    };
    const region = selector => `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`;
    const content = `(()=>{const c=document.querySelector('.cm-content').getBoundingClientRect();return {x:Math.round(c.left-16),y:38,width:Math.round(c.width+32),height:650}})()`;
    // Folder expansion may leave a navigation selection on a folder; focus the document.
    await js(`document.querySelector('.tree-item.sel')?.classList.remove('sel');window.__ink.state.treeSel=null;`);
    win.setContentSize(1120, 620); await settle(); await shot('editor');
    win.setContentSize(1120, 740);
    await js(`window.__ink.openPath(${JSON.stringify(math)})`); await settle();
    await until(`!!document.querySelector('.md-diagram-holder svg')`, 'Mermaid diagram');
    await shot('math'); await shot('math-feature', content);
    await js(`window.__ink.openPath(${JSON.stringify(doc)})`);
    await js(`window.__ink.run('view:sourceMode')`); await settle();
    await shot('source'); await shot('source-feature', content);
    await js(`window.__ink.run('view:sourceMode');window.__ink.setTheme('night');window.__ink.run('view:files')`); await settle();
    // Keep the same file panel as normal startup; put the caret on a blank line.
    await js(`(()=>{const v=window.__ink.view();v.dispatch({selection:{anchor:v.state.doc.line(2).from}});v.contentDOM.blur();document.querySelector('.cm-scroller').scrollTop=0;})()`);
    await shot('dark');
    win.setContentSize(960, 700); await pause(250); await shot('dark-feature');
    win.setContentSize(1120, 740);
    await js(`window.__ink.setTheme('default');window.__ink.run('view:files');window.__ink.run('export:settings')`);
    await until(`!document.querySelector('#prefs').hidden && document.querySelector('.prefs-nav-item.active')?.textContent.trim()===${JSON.stringify(lang === 'zh' ? '导出' : 'Export')}`, 'export preferences');
    await pause(300); await shot('export', region('#prefs .modal-box')); await shot('export-feature', region('#prefs .prefs-main'));
    await js(`document.querySelector('#prefs-close').click();window.__ink.run('app:preferences','wechat')`);
    await until(`!!document.querySelector('.wx-preview')?.textContent && !/updating|更新中/i.test(document.querySelector('.wx-preview').textContent)`, 'WeChat preview');
    await pause(700); await shot('wechat', region('#prefs .modal-box')); await shot('wechat-feature', region('.wx-split'));
    await js(`document.querySelector('#prefs-close').click();window.__ink.run('export:website')`);
    const website = BrowserWindow.getAllWindows().find(w => w.id !== win.id);
    if (!website) throw Error('Website export window did not open');
    let websiteReady = false;
    for (let i = 0; i < 160; i++) {
      try { websiteReady = await website.webContents.executeJavaScript(`!!document.querySelector('.chapter-row') && !document.querySelector('#export').disabled && !!document.querySelector('#site-preview').contentDocument?.querySelector('.cover')`); } catch {}
      if (websiteReady) break;
      await pause(100);
    }
    if (!websiteReady) throw Error('Website export preview did not become ready');
    await website.webContents.executeJavaScript('document.fonts.ready');
    // Let the normal completion toast expire before taking the documentation shot.
    for (let i = 0; i < 70; i++) {
      if (await website.webContents.executeJavaScript(`document.querySelector('#toast').hidden`)) break;
      await pause(100);
    }
    await pause(250); await shot('website', null, website);
    fs.writeFileSync(path.join(out, `manifest-${lang}.json`), JSON.stringify(manifest, null, 2));
    clearTimeout(deadline); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
