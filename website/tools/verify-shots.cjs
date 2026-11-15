'use strict';
// Layout QA for both languages and desktop/mobile, after regenerating assets.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'out');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', path.join(out, 'qa-profile'));
app.whenReady().then(async () => {
  try {
    nativeTheme.themeSource = 'light';
    const win = new BrowserWindow({ show: false, width: 1280, height: 1000, useContentSize: true });
    const js = source => win.webContents.executeJavaScript(source);
    const results = [];
    const capture = async name => {
      await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true});
      await new Promise(r => setTimeout(r, 180));
      fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage(undefined, {stayHidden:true,stayAwake:true})).toPNG());
    };
    for (const page of ['index', 'docs']) for (const lang of ['zh-CN', 'en']) for (const width of [1280, 390]) {
      win.setContentSize(width, 1000);
      await win.loadFile(path.join(__dirname, '../', page + '.html'));
      await js(`localStorage.setItem('posemark-site-lang',${JSON.stringify(lang)})`);
      await win.reload();
      await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      await js(`Promise.all([...document.querySelectorAll('img[data-shot]')].map(async i=>{i.loading='eager';await i.decode()}))`);
      const result = await js(`(()=>{const images=[...document.querySelectorAll('img[data-shot]')];return {page:${JSON.stringify(page)},lang:document.documentElement.lang,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,images:images.map(i=>({shot:i.dataset.shot,loaded:i.naturalWidth>0,dimensionsCorrect:i.naturalWidth===Number(i.getAttribute('width'))&&i.naturalHeight===Number(i.getAttribute('height'))}))}})()`);
      if (result.overflow || result.lang !== lang || result.images.some(i=>!i.loaded || !i.dimensionsCorrect)) {
        result.overflowElements=await js(`Array.from(document.querySelectorAll('body *')).filter(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,55)}))`);
        throw Error(JSON.stringify(result));
      }
      const linksOK=await js(`Array.from(document.querySelectorAll('img[data-shot]')).every(i=>i.parentElement.matches('a.screenshot-link')&&i.parentElement.href===i.src)`);
      if(!linksOK) throw Error('Full-size screenshot links did not follow language');
      if(page==='docs'){
        const anchorsOK=await js(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return new Set(ids).size===ids.length&&[...document.querySelectorAll('.docs-nav a[href^="#"]')].every(a=>document.getElementById(a.hash.slice(1)))&&['files','website-export','website-reader'].every(id=>document.getElementById(id)&&document.querySelector('.docs-nav a[href="#'+id+'"]'))})()`);
        if(!anchorsOK)throw Error('Docs navigation target missing or duplicated');
      }
      results.push(result);
      if (page === 'index') {
        await js(`document.querySelector('#features').scrollIntoView({behavior:'instant'})`);
        for (const feature of ['math','dark','source','export','wechat']) {
          await js(`document.querySelector('#feature-tab-${feature}').click()`);
          if (await js('document.documentElement.scrollWidth>innerWidth')) throw Error('Feature overflow: '+feature);
          if (lang==='zh-CN' && feature==='math') await capture(`layout-${page}-${width}`);
        }
      } else if (lang==='zh-CN') {
        await js(`document.querySelector('img[data-shot="math"]').scrollIntoView({behavior:'instant',block:'center'})`);
        await capture(`layout-${page}-${width}`);
      }
    }
    console.log(JSON.stringify(results, null, 2)); app.quit();
  } catch(error) { console.error(error); app.exit(1); }
});
