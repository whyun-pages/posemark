const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 1280, height: 800, useContentSize: true });
    await win.loadFile(path.join(__dirname, 'index.html'));
    await win.webContents.executeJavaScript('document.fonts.ready');
    await new Promise(resolve => setTimeout(resolve, 500));
    await fs.writeFile(path.join(__dirname, 'preview.png'), (await win.webContents.capturePage()).toPNG());
    console.log('render', await win.webContents.executeJavaScript(`JSON.stringify({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,rows:document.querySelectorAll('.tree-row').length,rowHeight:document.querySelector('.tree-row').getBoundingClientRect().height})`));
    console.log('interaction', await win.webContents.executeJavaScript(`(()=>{document.querySelector('.folder').click();const closed=document.querySelector('.folder').getAttribute('aria-expanded');document.querySelector('.folder').click();document.querySelector('#before').click();const before=document.body.classList.contains('original');document.querySelector('#after').click();return JSON.stringify({collapsed:closed==='false',comparison:before&&!document.body.classList.contains('original')})})()`));
    win.setContentSize(1280, 720);
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('short-screen', await win.webContents.executeJavaScript(`JSON.stringify({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,verticalOverflow:document.documentElement.scrollHeight>innerHeight,treeScrollable:document.querySelector('#tree').scrollHeight>document.querySelector('#tree').clientHeight})`));
    await fs.writeFile(path.join(__dirname, 'preview-720.png'), (await win.webContents.capturePage()).toPNG());
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
