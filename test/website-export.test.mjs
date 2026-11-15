import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const {scanWebsite,writeWebsite}=require('../src/main/website-export');
const templateDir=fileURLToPath(new URL('../src/renderer/site-export/',import.meta.url));

test('website scan: natural order, nested paths, stable IDs, hidden files excluded',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'posemark-site-scan-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'分卷'));await fs.mkdir(path.join(root,'.git'));
  for(const file of ['10.md','2.md','分卷/README.markdown','.draft.md','.git/hidden.md'])await fs.writeFile(path.join(root,file),'# '+file);
  const first=await scanWebsite(root),second=await scanWebsite(root);
  assert.deepEqual(first.chapters.map(c=>c.file),['2.md','10.md','分卷/README.markdown']);
  assert.deepEqual(first.chapters.map(c=>c.id),second.chapters.map(c=>c.id));
  assert.ok(first.chapters.every(c=>c.source.startsWith('#')));
});

test('website export: standalone classic scripts, copied assets, safe unique output',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'posemark-site-write-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
  const source=path.join(parent,'图片.svg');await fs.writeFile(source,'<svg xmlns="http://www.w3.org/2000/svg"/>');
  const payload={parent,name:'my-book',settings:{title:'<书名>',author:'作者',mode:'book'},chapters:[{id:'chapter-a',title:'标题',html:'<p>离线正文</p>'}],resources:[{source:pathToFileURL(source).href,target:'assets/files/r1.svg'}],templateDir};
  const first=await writeWebsite(payload);
  assert.equal(await fs.readFile(path.join(first.folder,'assets/files/r1.svg'),'utf8'),await fs.readFile(source,'utf8'));
  assert.match(await fs.readFile(first.path,'utf8'),/<title>&lt;书名&gt;<\/title>/);
  const data=await fs.readFile(path.join(first.folder,'assets/book-data.js'),'utf8');assert.match(data,/window.POSEMARK_BOOK=/);assert.doesNotMatch(data,/<书名>/);
  const reader=await fs.readFile(path.join(first.folder,'assets/reader.js'),'utf8');assert.doesNotMatch(reader,/\bfetch\s*\(/);
  const second=await writeWebsite(payload);assert.notEqual(second.folder,first.folder);assert.equal(path.basename(second.folder),'my-book-2');
  await assert.rejects(writeWebsite({...payload,name:'../outside'}),/无效/);
  await assert.rejects(writeWebsite({...payload,name:'CON'}),/无效/);
  await assert.rejects(writeWebsite({...payload,resources:[{source,target:'../outside.svg'}]}),/资源路径无效/);
  await assert.rejects(writeWebsite({...payload,resources:[{source:path.join(parent,'missing.png'),target:'assets/files/r1.png'}]}),/找不到本地资源/);
  await assert.rejects(fs.stat(path.join(parent,'my-book-3')),/ENOENT/);
});
