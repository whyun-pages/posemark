import {renderFragment, splitFrontMatter} from '../markdown.js';
import {ctx, toFileUrl} from '../paths.js';
import mermaid from 'mermaid';

mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral'});
let sequence=0;
export async function renderChapter(chapter) {
  const meta=splitFrontMatter(chapter.source).meta||{};
  ctx.rootUrl=meta['typora-root-url']||null;
  const host=document.createElement('div');
  host.innerHTML=renderFragment(chapter.source,{docPath:chapter.path});
  const heading=host.querySelector('h1');
  const title=meta.title||heading?.textContent?.trim()||chapter.file.split('/').pop().replace(/\.[^.]+$/,'');
  // Keep the heading anchor while avoiding a duplicate title in the book page.
  if(heading && heading.textContent.trim()===title){const anchor=document.createElement('span');anchor.id=heading.id;heading.replaceWith(anchor);}
  sanitize(host);
  for(const el of host.querySelectorAll('.mermaid')){
    try{const result=await mermaid.render('site-diagram-'+(++sequence),el.getAttribute('data-src')||el.textContent);el.innerHTML=result.svg;}
    catch{el.textContent='图表未能渲染，请检查 Mermaid 语法。\n'+(el.getAttribute('data-src')||el.textContent);}
  }
  return {...chapter,title,group:chapter.file.includes('/')?chapter.file.slice(0,chapter.file.lastIndexOf('/')):'',html:host.innerHTML,words:`${chapter.source.replace(/\s/g,'').length.toLocaleString()} 字`};
}

function sanitize(host){
  host.querySelectorAll('script,iframe,object,embed,base,link,meta,style,form,animate,animateMotion,animateTransform,set,foreignObject').forEach(el=>el.remove());
  for(const el of host.querySelectorAll('*')) for(const attr of [...el.attributes]){
    if(/^on/i.test(attr.name)||['srcdoc','action','formaction','srcset'].includes(attr.name))el.removeAttribute(attr.name);
    else if(attr.name==='style' && /url\s*\(|expression\s*\(|@import/i.test(attr.value))el.removeAttribute(attr.name);
    else if(['href','src','xlink:href','poster'].includes(attr.name)&&/^(javascript|vbscript|blob):/i.test(attr.value.replace(/[\u0000-\u0020]/g,'')))el.removeAttribute(attr.name);
    else if(['href','xlink:href'].includes(attr.name)&&/^\s*data:/i.test(attr.value))el.removeAttribute(attr.name);
  }
}

export function packChapters(chapters, allChapters=chapters, {copyResources=true}={}) {
  const resources=new Map(), warnings=new Set();
  const pathKey=value=>window.ink.platform==='win32'?value.toLowerCase():value;
  const decode=value=>{try{return decodeURIComponent(value);}catch{return value;}};
  const paths=new Map(chapters.map(c=>[pathKey(new URL(toFileUrl(c.path)).href),c]));
  const allPaths=new Set(allChapters.map(c=>pathKey(new URL(toFileUrl(c.path)).href)));
  const packed=chapters.map(chapter=>{
    const host=document.createElement('div');host.innerHTML=chapter.html;
    for(const el of host.querySelectorAll('[src],[href],[poster],[xlink\\:href]'))for(const attr of ['src','href','poster','xlink:href']){
      const raw=el.getAttribute(attr);if(!raw)continue;
      if(raw.startsWith('#')){if(el.tagName.toLowerCase()==='a')el.setAttribute(attr,'#'+chapter.id+'~'+encodeURIComponent(decode(raw.slice(1))));continue;}
      let url;try{url=new URL(raw,toFileUrl(chapter.path));}catch{warnings.add('无法解析链接：'+raw);continue;}
      if(url.protocol==='http:'||url.protocol==='https:'){if(attr!=='href')warnings.add('网络资源需联网：'+url.href);else{el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}continue;}
      if(url.protocol==='data:'||url.protocol==='mailto:'||url.protocol==='tel:')continue;
      if(url.protocol!=='file:'){el.removeAttribute(attr);continue;}
      const fragment=url.hash.slice(1);url.hash='';url.search='';
      const key=pathKey(url.href);const target=paths.get(key);
      if(attr==='href'&&target){el.setAttribute(attr,'#'+target.id+(fragment?'~'+encodeURIComponent(decode(fragment)):''));continue;}
      if(attr==='href'&&(allPaths.has(key)||/\.(md|markdown|mdown|mkd|mdwn)$/i.test(url.pathname))){el.removeAttribute(attr);el.setAttribute('title','该章节未包含在本次导出中');warnings.add('未包含的章节链接：'+raw);continue;}
      if(!copyResources){el.setAttribute(attr,url.href+(fragment?'#'+fragment:''));continue;}
      if(!resources.has(url.href)){
        const ext=url.pathname.match(/\.[a-z0-9]{1,12}$/i)?.[0]||'';
        resources.set(url.href,{source:url.href,target:'assets/files/r'+(resources.size+1)+ext.toLowerCase()});
      }
      el.setAttribute(attr,resources.get(url.href).target+(fragment?'#'+fragment:''));
    }
    return {id:chapter.id,title:chapter.title,group:chapter.group,html:host.innerHTML};
  });
  return {chapters:packed,resources:[...resources.values()],warnings:[...warnings]};
}
