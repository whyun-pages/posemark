import {renderChapter,packChapters} from './render.js';
import {ctx} from '../paths.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let chapters=[],root='',current=-1,mode='book',defaultMode='book',color='#264a70',exported=null,loading=false,previewTemplate='',toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
function tab(name){$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});['content','appearance','output'].forEach(n=>$('#'+n+'-panel').hidden=n!==name);}
const selected=()=>chapters.filter(c=>c.selected);
function settings(){return {title:$('#book-title').value.trim()||'未命名的书',subtitle:$('#book-subtitle').value.trim(),author:$('#book-author').value.trim(),color,paper:$('#paper').value,fontSize:Number($('#font-size').value),mode:defaultMode};}
function renderList(){
  const active=selected()[current]?.id;
  $('#chapter-list').innerHTML=chapters.map((c,i)=>`<div class="chapter-row ${c.id===active?'active':''} ${c.selected?'':'excluded'}"><input type="checkbox" data-check="${c.id}" ${c.selected?'checked':''} aria-label="包含${escape(c.title)}"><button class="chapter-info" data-chapter="${c.id}"><strong>${escape(c.title)}</strong><small>${escape(c.file)} · ${c.words}</small></button><div class="reorder"><button data-move="${i}" data-dir="-1" ${!i?'disabled':''} aria-label="上移${escape(c.title)}"><svg class="icon"><use href="#up"/></svg></button><button data-move="${i}" data-dir="1" ${i===chapters.length-1?'disabled':''} aria-label="下移${escape(c.title)}"><svg class="icon"><use href="#down"/></svg></button></div></div>`).join('');
  $('#chapter-count').textContent=`${selected().length} / ${chapters.length} 篇`;$('#summary').textContent=`已选 ${selected().length} 篇文章`;
  $('#select-all').textContent=selected().length===chapters.length?'取消全选':'全部选中';$('#export').disabled=loading||!selected().length;
}
function preview(){
  renderList();
  if(!previewTemplate)return;
  const list=selected();current=Math.min(current,list.length-1);
  const data={settings:{...settings(),mode},chapters:packChapters(list,chapters,{copyResources:false}).chapters};
  const script='<script>window.POSEMARK_BOOK='+JSON.stringify(data).replace(/</g,'\\u003c')+';window.POSEMARK_PREVIEW_CURRENT='+current+';</script>';
  $('#site-preview').srcdoc=previewTemplate.replace('<script src="assets/book-data.js"></script>',script);
}
function setMode(value){mode=value;$$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===value);b.setAttribute('aria-pressed',String(b.dataset.mode===value));});preview();}
async function load(dir){
  if(loading)return;loading=true;$('#export').disabled=true;$('#choose-folder').disabled=true;$('#reset').disabled=true;
  try{
    const result=await window.ink.websiteScan(dir);const rendered=[];
    for(let i=0;i<result.chapters.length;i++){toast(`正在排版 ${i+1} / ${result.chapters.length} 篇文章…`);rendered.push(await renderChapter(result.chapters[i]));}
    root=result.root;chapters=rendered.map(c=>({...c,selected:true}));current=-1;
    const saved=result.settings;
    if(saved?.order){const ranks=new Map(saved.order.map((id,i)=>[id,i]));chapters.sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));chapters.forEach(c=>c.selected=saved.excluded?.includes(c.id)?false:true);}
    const s=saved||{};
    $('#source-name').textContent=result.name;$('#source-path').textContent=root;
    $('#book-title').value=s.title||result.name;$('#book-subtitle').value=s.subtitle||'';$('#book-author').value=s.author||'';
    $('#paper').value=s.paper||'warm';$('#font-size').value=s.fontSize||15;color=s.color||'#264a70';defaultMode=s.mode||'book';
    $$('[data-color]').forEach(b=>{b.classList.toggle('selected',b.dataset.color===color);b.setAttribute('aria-pressed',String(b.dataset.color===color));});
    $$('[data-default]').forEach(b=>{b.classList.toggle('active',b.dataset.default===defaultMode);b.setAttribute('aria-pressed',String(b.dataset.default===defaultMode));});
    $('#output-name').value=s.outputName||'my-book';$('#output-folder-label').textContent=$('#output-name').value+'/';
    setMode(defaultMode);toast(chapters.length?`已读取 ${chapters.length} 篇文章。导出使用磁盘上已保存的内容。`:'这个目录没有 Markdown 文件，请选择其他目录。');
  }catch(error){toast('读取失败：'+error.message);}finally{loading=false;$('#choose-folder').disabled=false;$('#reset').disabled=false;preview();}
}

document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.tab)tab(b.dataset.tab);if(b.dataset.next)tab(b.dataset.next);
  if(b.dataset.chapter){const index=selected().findIndex(c=>c.id===b.dataset.chapter);if(index<0){toast('请先勾选这篇文章。');return;}current=index;setMode('book');}
  if(b.dataset.move!==undefined){const i=Number(b.dataset.move),j=i+Number(b.dataset.dir),id=selected()[current]?.id;[chapters[i],chapters[j]]=[chapters[j],chapters[i]];current=selected().findIndex(c=>c.id===id);preview();}
  if(b.dataset.mode)setMode(b.dataset.mode);
  if(b.dataset.device){$$('[data-device]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});$('.preview').classList.toggle('phone-frame',b.dataset.device==='mobile');}
  if(b.dataset.color){color=b.dataset.color;$$('[data-color]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});preview();}
  if(b.dataset.default){defaultMode=b.dataset.default;$$('[data-default]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});setMode(defaultMode);}
});
$('#chapter-list').onchange=e=>{const id=selected()[current]?.id;const c=chapters.find(c=>c.id===e.target.dataset.check);if(c)c.selected=e.target.checked;current=selected().findIndex(c=>c.id===id);preview();};
$('#select-all').onclick=()=>{const value=selected().length!==chapters.length;chapters.forEach(c=>c.selected=value);current=-1;preview();};
['book-title','book-subtitle','book-author','paper','font-size'].forEach(id=>$('#'+id).addEventListener('input',preview));
$('#output-name').oninput=()=>{$('#output-name').removeAttribute('aria-invalid');$('#output-folder-label').textContent=($('#output-name').value||'my-book')+'/';};
$('#choose-folder').onclick=async()=>{const dir=await window.ink.pickFolder(root||undefined);if(dir)await load(dir);};
$('#reset').onclick=()=>root&&load(root);
$('#expand').onclick=()=>{const expanded=document.body.classList.toggle('expanded');$('#expand').setAttribute('aria-label',expanded?'退出放大预览':'放大阅读预览');};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('expanded');});
$('#export').onclick=async()=>{
  const name=$('#output-name').value.trim();
  if(!/^[A-Za-z0-9_-]{1,60}$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)){tab('output');$('#output-name').setAttribute('aria-invalid','true');$('#output-name').focus();toast('请填写有效的文件夹名称。');return;}
  loading=true;$('#export').disabled=true;$('#export span').textContent='正在导出…';
  try{
    const packed=packChapters(selected(),chapters);
    if(packed.warnings.length){const response=await window.ink.confirm({message:'部分内容需要注意',detail:packed.warnings.join('\n')+'\n\n是否继续导出？',buttons:['继续导出','取消'],defaultId:1,cancelId:1});if(response!==0)return;}
    const payload={...packed,name,settings:settings(),root,remember:$('#remember').checked,order:chapters.map(c=>c.id),excluded:chapters.filter(c=>!c.selected).map(c=>c.id),mathCss:await window.ink.katexCss()};
    exported=await window.ink.websiteWrite(payload);
    if(!exported)return;
    $('#result-title').textContent=settings().title;$('#result-summary').textContent=`${exported.chapters} 篇文章 · ${exported.resources} 个本地资源 · 可直接双击打开`;$('#result-path').textContent=exported.path;$('#result').showModal();
  }catch(error){toast('导出失败：'+error.message);}finally{loading=false;$('#export span').textContent='导出网站';renderList();}
};
$('.dialog-close').onclick=()=>$('#result').close();$('#return-settings').onclick=()=>$('#result').close();
$('#open-reader').onclick=()=>exported&&window.ink.openPath(exported.path);
$('#reveal-output').onclick=()=>exported&&window.ink.reveal(exported.path);

async function init(){
  ctx.config={...ctx.config,...await window.ink.getConfig()};
  const css=await window.ink.katexCss();
  // Load the real reader in an isolated frame with local assets; messages update preview.
  const response=await window.ink.websitePreview();
  previewTemplate=response.replace('</head>','<style>'+css+'</style></head>');
  window.addEventListener('message',event=>{if(event.source!==$('#site-preview').contentWindow)return;if(event.data?.type==='posemark-position'){current=event.data.current;renderList();}});
  const initial=await window.ink.websiteInitial();if(initial.root)await load(initial.root);else toast('请选择包含 Markdown 文章的目录。');
}
init().catch(error=>toast('初始化失败：'+error.message));
