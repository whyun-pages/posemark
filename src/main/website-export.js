'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');

const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portable = value => value.split(path.sep).join('/');
const excluded = new Set(['node_modules', '.git', '.posemark', '.idea', '.vscode']);

async function scanWebsite(root) {
  root = await fs.realpath(root);
  const files = [];
  async function walk(dir) {
    for (const entry of (await fs.readdir(dir, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}))) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.') || excluded.has(entry.name)) continue;
      const file = path.join(dir,entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(md|markdown|mdown|mkd|mdwn)$/i.test(entry.name)) {
        if (files.length >= 2000) throw new Error('目录超过 2000 篇文章，请选择更小的目录。');
        const relative = portable(path.relative(root,file));
        const stat = await fs.stat(file);
        if (stat.size > 20 * 1024 * 1024) throw new Error(`文章过大：${relative}（超过 20 MB）`);
        files.push({id:'ch-'+digest(relative),path:file,file:relative,source:await fs.readFile(file,'utf8')});
      }
    }
  }
  await walk(root);
  return {root,name:path.basename(root),chapters:files};
}

// The renderer resolves and sanitizes HTML in a detached DOM. Keep filesystem writes
// in the main process, and always create a new directory rather than overwrite a site.
async function writeWebsite({parent, name, settings, chapters, resources = [], mathCss = '', templateDir}) {
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw new Error('网站文件夹名称无效。');
  if (!Array.isArray(chapters) || !chapters.length) throw new Error('请至少选择一篇文章。');
  const resourceMap = new Map();
  for (const resource of resources) {
    const source = resource.source.startsWith('file:') ? fileURLToPath(resource.source) : path.resolve(resource.source);
    if (!/^assets\/files\/r\d{1,6}(?:\.[a-z0-9]{1,12})?$/i.test(resource.target)) throw new Error('资源路径无效。');
    if (resourceMap.has(resource.target) && resourceMap.get(resource.target)!==source) throw new Error('资源名称冲突。');
    const stat = await fs.stat(source).catch(()=>null);
    if (!stat?.isFile()) throw new Error(`找不到本地资源：${source}。请修复引用或排除该章节。`);
    resourceMap.set(resource.target,source);
  }
  // Reserve a unique, empty output. Existing files are never overwritten.
  let target;
  for (let suffix=0; ; suffix++) {
    target=path.join(parent,suffix ? `${name}-${suffix+1}` : name);
    try {await fs.mkdir(target);break;} catch(error) {if(error.code!=='EEXIST')throw error;}
  }
  try {
    await fs.mkdir(path.join(target,'assets/files'),{recursive:true});
    for (const [dest,source] of resourceMap) await fs.copyFile(source,path.join(target,dest));
    for (const name of ['reader.js','style.css','reader.css']) await fs.copyFile(path.join(templateDir,name),path.join(target,'assets',name));
    for (const name of ['cormorant.ttf','OFL.txt']) await fs.copyFile(path.join(templateDir,'assets',name),path.join(target,'assets',name));
    const cssFile=path.join(target,'assets/style.css');
    await fs.writeFile(cssFile,(await fs.readFile(cssFile,'utf8')).replaceAll("url('assets/cormorant.ttf')","url('cormorant.ttf')"));
    await fs.writeFile(path.join(target,'assets/math.css'),mathCss,'utf8');
    const data={settings,chapters:chapters.map(({id,title,group,html})=>({id,title,group,html}))};
    // A classic script loads on file://; no fetch, modules, backend or CDN needed.
    await fs.writeFile(path.join(target,'assets/book-data.js'),'window.POSEMARK_BOOK='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n','utf8');
    const reader=await fs.readFile(path.join(templateDir,'reader.html'),'utf8');
    await fs.writeFile(path.join(target,'index.html'),reader.replaceAll('{{TITLE}}',escape(settings.title)),'utf8');
    return {path:path.join(target,'index.html'),folder:target,chapters:chapters.length,resources:resourceMap.size};
  } catch(error) {
    // Preserve a partial output for inspection; never recursively remove a user path.
    throw new Error(`导出未完成：${error.message}。未完成的文件位于 ${target}`);
  }
}

module.exports={scanWebsite,writeWebsite};
