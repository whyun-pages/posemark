(() => {
  'use strict';
  const data=window.POSEMARK_BOOK;
  if(!data?.chapters?.length){document.querySelector('#book').innerHTML='<article class="page empty"><h3>还没有选中的章节</h3><p>勾选至少一篇文章，开始制作你的书。</p></article>';return;}
  const {settings:s,chapters}=data;
  const $=selector=>document.querySelector(selector);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=-1,mode=s.mode||'book',busy=false,touchX=0,touchY=0,contentGesture=false;
  document.documentElement.style.setProperty('--cover',/^#[\da-f]{6}$/i.test(s.color)?s.color:'#264a70');
  document.documentElement.style.setProperty('--paper',s.paper==='white'?'#ffffff':'#fcfaf5');
  document.documentElement.style.setProperty('--book-font',Number(s.fontSize)>=17?'19px':'17px');
  $('#site-title').textContent=s.title;$('#site-author').textContent=s.author||'';$('#directory-count').textContent=chapters.length+' 章';
  const cover=()=>`<article class="page cover"><div class="cover-top"><span>${escape(s.subtitle||'文字成书')}</span><span>${chapters.length} 章</span></div><h2>${(String(s.title).match(/[^，、：！？。]+[，、：！？。]?|[，、：！？。]/g)||[s.title]).map(part=>'<span>'+escape(part)+'</span>').join('')}</h2><p class="cover-subtitle">${escape(s.subtitle)}</p><div class="cover-rule"></div><div class="cover-author">${escape(s.author)}</div><button class="cover-start" data-start>开始阅读</button><div class="cover-bottom"><span>${chapters.length} 篇文字，一本小书</span><em>Everyday notes</em></div></article>`;
  const page=(c,i)=>`<article class="page right" data-page="${escape(c.id)}"><div class="running"><span>${escape(c.group||s.title)}</span><span>${String(i+1).padStart(2,'0')}</span></div><h3 class="chapter-title" tabindex="-1">${escape(c.title)}</h3><div class="prose markdown-body">${c.html}</div><div class="page-foot"><span>${escape(s.author)}</span><span>${String(i+1).padStart(2,'0')}</span></div></article>`;
  function render(){
    $('#book').classList.toggle('flow-book',mode==='flow');
    if(mode==='flow')$('#book').innerHTML=cover()+chapters.map(page).join('');
    else if(current<0)$('#book').innerHTML=cover();
    else $('#book').innerHTML=page(chapters[current],current);
    updateNavigation();
    $('#reading-tip').textContent=mode==='flow'?'向下滚动阅读，或打开目录跳转章节。':'左右方向键或滑动翻章 · 长章节可在页内滚动';
    renderDirectory();
  }
  function updateNavigation(){
    $('#position-label').textContent=current<0?'封面':chapters[current].title;
    $('#position-count').textContent=current<0?`${chapters.length} 章`:`${current+1} / ${chapters.length} 章 · ${Math.round((current+1)/chapters.length*100)}%`;
    $('#previous').disabled=current<0;$('#next').disabled=current===chapters.length-1;
    $('#next').textContent=current<0?'翻开阅读':'下一章';
    document.querySelectorAll('[data-read-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.readMode===mode)));
    $('.reader-controls').hidden=false;
  }
  function renderDirectory(){const query=$('#directory-search').value.trim().toLowerCase();let group=null;const matches=chapters.filter(c=>c.title.toLowerCase().includes(query)||(c.group||'').toLowerCase().includes(query));$('#directory-list').innerHTML=matches.map(c=>{const heading=c.group&&c.group!==group?`<p class="group-title">${escape(c.group)}</p>`:'';group=c.group;const i=chapters.indexOf(c);return heading+`<button data-chapter="${escape(c.id)}" ${i===current?'aria-current="page"':''}><span>${i+1}</span><strong>${escape(c.title)}</strong>${i===current?'<small>正在阅读</small>':''}</button>`;}).join('');$('#directory-empty').hidden=matches.length>0;}
  function closeDirectory(focus=false){$('#reader-directory').hidden=true;$('#directory-toggle').setAttribute('aria-expanded','false');if(focus)$('#directory-toggle').focus();}
  function show(id,anchor='',animate=false){
    const index=id==='cover'?-1:chapters.findIndex(c=>c.id===id);
    if(index<0&&id!=='cover')return;
    current=index;
    if(mode==='book'){render();window.scrollTo(0,0);}
    else {updateNavigation();renderDirectory();}
    if(mode==='flow') {const target=current<0?$('.cover'):$(`[data-page="${chapters[current].id}"]`);target?.scrollIntoView({block:'start'});}
    else if(animate&&!matchMedia('(prefers-reduced-motion:reduce)').matches){busy=true;$('.book-wrap').classList.add('flipping');setTimeout(()=>{$('.book-wrap').classList.remove('flipping');busy=false;},670);}
    if(anchor){const page=current<0?$('#book'):$(`[data-page="${chapters[current].id}"]`);const target=[...page.querySelectorAll('[id]')].find(e=>e.id===anchor);if(target){if(mode==='book')page.scrollTop+=target.getBoundingClientRect().top-page.getBoundingClientRect().top-24;else target.scrollIntoView({block:'start'});}}
    const title=current<0?s.title:chapters[current].title+' · '+s.title;document.title=title;
    if(window.parent!==window)window.parent.postMessage({type:'posemark-position',current},'*');
  }
  function navigate(id,anchor='',animate=true){const hash='#'+encodeURIComponent(id)+(anchor?'~'+encodeURIComponent(anchor):'');if(location.hash!==hash){try{history.pushState(null,'',hash);}catch{}}show(id,anchor,animate);}
  function fromHash(){const [id,anchor='']=location.hash.slice(1).split('~');try{show(decodeURIComponent(id||'cover'),decodeURIComponent(anchor));}catch{show('cover');}}
  $('#directory-toggle').onclick=()=>{closeSettings();const open=$('#reader-directory').hidden;$('#reader-directory').hidden=!open;$('#directory-toggle').setAttribute('aria-expanded',String(open));if(open){$('#directory-search').value='';renderDirectory();$('#directory-search').focus();}};
  $('#directory-close').onclick=()=>closeDirectory(true);$('#directory-search').oninput=renderDirectory;
  function closeSettings(focus=false){$('#reader-settings').hidden=true;$('#settings-toggle').setAttribute('aria-expanded','false');if(focus)$('#settings-toggle').focus();}
  $('#settings-toggle').onclick=()=>{const open=$('#reader-settings').hidden;closeDirectory();$('#reader-settings').hidden=!open;$('#settings-toggle').setAttribute('aria-expanded',String(open));if(open)$('#settings-close').focus();};
  $('#settings-close').onclick=()=>closeSettings(true);
  document.querySelectorAll('[data-read-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.readMode;render();show(current<0?'cover':chapters[current].id);});
  let fontSize=Number(s.fontSize)>=17?19:17;
  function setFont(value){fontSize=Math.max(14,Math.min(28,value));document.documentElement.style.setProperty('--book-font',fontSize+'px');$('#font-value').value=fontSize;$('#font-decrease').disabled=fontSize===14;$('#font-increase').disabled=fontSize===28;}
  $('#font-decrease').onclick=()=>setFont(fontSize-1);$('#font-increase').onclick=()=>setFont(fontSize+1);setFont(fontSize);
  const papers={white:['#faf9f6','#303b38','#647268','#dfe3da'],warm:['#f5efdf','#3b382f','#6b6555','#dcd5c5'],green:['#e6ecdf','#303b38','#53654e','#cbd6c4'],dark:['#292e2b','#e5e8df','#b3c0b3','#48544a']};
  function setPaper(name){document.body.dataset.readerTheme=name;const colors=papers[name]||papers.warm;['--reader-bg','--reader-ink','--reader-muted','--reader-line'].forEach((key,i)=>document.documentElement.style.setProperty(key,colors[i]));document.querySelectorAll('[data-reader-paper]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.readerPaper===name)));}
  document.querySelectorAll('[data-reader-paper]').forEach(b=>b.onclick=()=>setPaper(b.dataset.readerPaper));setPaper(s.paper||'warm');
  $('#header-author').textContent=s.author?s.author+' 著':'';
  $('#previous').onclick=()=>{if(!busy&&current>=0)navigate(current===0?'cover':chapters[current-1].id);};
  $('#next').onclick=()=>{if(!busy&&current<chapters.length-1)navigate(chapters[current+1].id);};
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-start]')){navigate(chapters[0].id);return;}
    const button=event.target.closest('[data-chapter]');if(button){closeDirectory(true);navigate(button.dataset.chapter);return;}
    const link=event.target.closest('a');
    if(link?.getAttribute('href')?.startsWith('#')){event.preventDefault();const hash=link.getAttribute('href').slice(1);const [id,anchor='']=hash.split('~');try {const decoded=decodeURIComponent(id);if(decoded==='cover'||chapters.some(c=>c.id===decoded))navigate(decoded,decodeURIComponent(anchor));else navigate(current<0?chapters[0].id:chapters[current].id,decoded,false);}catch{}return;}
    if(!event.target.closest('.reader-directory,#directory-toggle'))closeDirectory();
    if(!event.target.closest('.reader-settings,#settings-toggle'))closeSettings();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#reader-directory').hidden)closeDirectory(true);if(!$('#reader-settings').hidden)closeSettings(true);return;}if(event.target.closest('input,textarea,select')||!$('#reader-directory').hidden||!$('#reader-settings').hidden||mode==='flow')return;if(event.key==='ArrowRight'){event.preventDefault();$('#next').click();}if(event.key==='ArrowLeft'){event.preventDefault();$('#previous').click();}});
  $('#book').addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;touchY=e.changedTouches[0].clientY;contentGesture=!!e.target.closest('pre,table,.katex-display,input,textarea,select,a,button,video,audio');for(let el=e.target;el&&el!==$('#book');el=el.parentElement){if(el.scrollWidth>el.clientWidth+1&&/auto|scroll/.test(getComputedStyle(el).overflowX)){contentGesture=true;break;}}},{passive:true});
  $('#book').addEventListener('touchend',e=>{const x=e.changedTouches[0].clientX-touchX,y=e.changedTouches[0].clientY-touchY;if(!contentGesture&&mode==='book'&&Math.abs(x)>65&&Math.abs(x)>Math.abs(y)*1.5)(x<0?$('#next'):$('#previous')).click();},{passive:true});
  let scrollFrame=0;
  $('#book').addEventListener('scroll',()=>{if(mode!=='flow'||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;const top=$('#book').getBoundingClientRect().top+80;let index=-1;document.querySelectorAll('[data-page]').forEach((el,i)=>{if(el.getBoundingClientRect().top<=top)index=i;});if(index!==current){current=index;updateNavigation();renderDirectory();if(window.parent!==window)window.parent.postMessage({type:'posemark-position',current},'*');}});},{passive:true});
  window.addEventListener('hashchange',fromHash);window.addEventListener('popstate',fromHash);
  render();if(Number.isInteger(window.POSEMARK_PREVIEW_CURRENT)){const index=window.POSEMARK_PREVIEW_CURRENT;show(index<0?'cover':chapters[index]?.id||'cover');}else fromHash();
})();
