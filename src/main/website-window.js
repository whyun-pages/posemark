'use strict';
const {BrowserWindow,ipcMain,dialog,shell,app}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {scanWebsite,writeWebsite}=require('./website-export');

function registerWebsiteExport({cfg,patch}){
  const sessions=new Map();
  const templateDir=path.join(__dirname,'../../dist/site-export');
  const session=event=>{const value=sessions.get(event.sender.id);if(!value)throw new Error('请从导出菜单打开网站导出。');return value;};
  ipcMain.handle('website:open',async(event,root)=>{
    const owner=BrowserWindow.fromWebContents(event.sender);
    const win=new BrowserWindow({width:1440,height:1000,minWidth:760,minHeight:650,title:'导出为网站 · Posemark',parent:owner,show:false,backgroundColor:'#f7f8fa',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
    sessions.set(win.webContents.id,{root:root||null,win});
    const id=win.webContents.id;
    win.on('closed',()=>sessions.delete(id));
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return {action:'deny'};});
    win.webContents.on('will-navigate',event=>event.preventDefault());
    await win.loadFile(path.join(templateDir,'index.html'));
    win.show();return true;
  });
  ipcMain.handle('website:initial',event=>({root:session(event).root}));
  ipcMain.handle('website:scan',async(event,root)=>{
    const state=session(event);const result=await scanWebsite(root);state.root=result.root;
    result.settings=(cfg('websiteBooks')||{})[result.root]||null;
    return result;
  });
  ipcMain.handle('website:preview',async event=>{
    session(event);
    const html=await fs.readFile(path.join(templateDir,'reader.html'),'utf8');
    return html.replace('<head>','<head><base href="'+pathToFileURL(templateDir+path.sep).href+'">')
      .replaceAll('{{TITLE}}','阅读预览').replace('href="assets/style.css"','href="style.css"').replace('href="assets/reader.css"','href="reader.css"').replace('<link rel="stylesheet" href="assets/math.css">','').replace('src="assets/reader.js"','src="reader.js"');
  });
  ipcMain.handle('website:write',async(event,payload)=>{
    const state=session(event);
    if(!state.root || payload.root!==state.root)throw new Error('源目录已经改变，请重新选择目录。');
    const result=await dialog.showOpenDialog(state.win,{title:'选择网站的保存位置（将创建新的子文件夹）',properties:['openDirectory','createDirectory'],defaultPath:cfg('exportFolder')||app.getPath('documents')});
    if(result.canceled||!result.filePaths.length)return null;
    const output=await writeWebsite({...payload,parent:result.filePaths[0],templateDir});
    const books={...(cfg('websiteBooks')||{})};
    if(payload.remember)books[state.root]={...payload.settings,outputName:payload.name,order:payload.order,excluded:payload.excluded};else delete books[state.root];
    patch({websiteBooks:books});
    return output;
  });
}
module.exports={registerWebsiteExport};
