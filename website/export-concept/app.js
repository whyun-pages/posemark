(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name === 'book' ? 'book-icon' : name}"/></svg>`;
  const escape = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const samples = [
    {id:'intro',file:'00-序言.md',title:'写在翻开之前',words:'680 字',paras:['很多时候，我们写下的并不是什么大事。是早起时照进厨房的一束光，是散步路上认出的一棵树，也是读到一句好话时，想要留住它的心情。','这些文字原本散落在不同的文件里。直到把它们放在一起，才发现，日子已经悄悄有了自己的章节。','这本小书，留给那些不急着抵达的时刻。也留给愿意停下来，认真看一看生活的你。']},
    {id:'walk',file:'01-去散步吧.md',title:'去散步吧',words:'1,240 字',paras:['出门的时候，天刚刚放晴。我没有想好要去哪里，只是把手机放进口袋，沿着熟悉的小路往前走。','街角的面包店换了一块招牌，梧桐树下有人坐着读报。平日里匆匆走过的街道，忽然有了许多可以停留的地方。','散步不需要一个目的地。走得慢一点，风的方向、树叶的颜色，甚至脚步落地的声音，都成了值得注意的事。','我开始明白，所谓记录生活，或许就是重新学习怎样看见。','回来的路上，我买了一枝花。不是为了什么特别的日子，只是觉得，今天也很好。']},
    {id:'read',file:'02-书页里的远方.md',title:'书页里的远方',words:'960 字',paras:['一本书可以很薄，却装得下很远的地方。翻开它的时候，我们暂时放下自己的生活，去别人的世界里坐一会儿。','我喜欢在书页边上留下一点记号。有时是一条细细的线，有时是一个问号。很久以后再翻到，会遇见当时的自己。','阅读给人的，并不总是答案。更多时候，它让那些模糊的感受有了可以安放的词语。']},
    {id:'rain',file:'03-雨天的房间.md',title:'雨天的房间',words:'820 字',paras:['下雨的下午，房间变得比平时安静。窗外的声音隔着一层水汽，连时间也像慢了下来。','烧一壶水，收拾桌面，把读了一半的书放在手边。这些小小的动作，让一个普通的下午有了自己的秩序。','我们总想把每一刻填满。偶尔什么也不做，只听雨落下来，也是一种很好的生活。']},
    {id:'write',file:'04-慢慢写下去.md',title:'慢慢写下去',words:'1,180 字',paras:['起初，我总觉得要等到有了完整的想法才能动笔。后来才发现，想法常常是在写的过程中，慢慢变清楚的。','于是开始允许自己写得短一点，也允许一句话暂时没有结尾。写作不必每次都交出一份答案。','把今天看见的、想到的留下来。文字会替我们记住，那些差一点就被忘掉的瞬间。','写得慢一些也没有关系。重要的是，你还愿意打开新的一页。']},
    {id:'after',file:'05-后记.md',title:'日子还在继续',words:'460 字',paras:['写到这里，窗外的树又长出了新叶。这本小书暂时告一段落，生活却仍然每天展开。','谢谢你读到这里。愿你也能在自己的日常里，找到值得留下的一页。']}
  ];
  let chapters = samples.map(c => ({...c,selected:true}));
  let current = -1, mode = 'book', device = 'desktop', defaultMode = 'book', busy = false, toastTimer, flipTimer;
  const selected = () => chapters.filter(c => c.selected);
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
  function tab(name) { $$('.tabs button').forEach(b => {b.classList.toggle('active',b.dataset.tab===name);if(b.dataset.tab===name)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}); ['content','appearance','output'].forEach(n => $(`#${n}-panel`).hidden=n!==name); }
  function renderList() {
    const active = selected()[current]?.id;
    $('#chapter-list').innerHTML = chapters.map((c,i) => `<div class="chapter-row ${c.id===active?'active':''} ${c.selected?'':'excluded'}"><input type="checkbox" data-check="${escape(c.id)}" ${c.selected?'checked':''} aria-label="包含${escape(c.title)}">${icon('file')}<button class="chapter-info" data-chapter="${escape(c.id)}" aria-label="预览${escape(c.title)}"><strong>${escape(c.title)}</strong><small>${escape(c.file)} · ${escape(c.words)}</small></button><div class="reorder"><button data-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="上移${escape(c.title)}">${icon('up')}</button><button data-move="${i}" data-direction="1" ${i===chapters.length-1?'disabled':''} aria-label="下移${escape(c.title)}">${icon('down')}</button></div></div>`).join('');
    $('#chapter-count').textContent=`${selected().length} / ${chapters.length} 篇`;
    $('#summary').textContent=`已选 ${selected().length} 篇文章`;
    $('#export').disabled = !selected().length;
    $('#select-all').textContent = selected().length===chapters.length ? '取消全选' : '全部选中';
  }
  function metadata() {return {title:$('#book-title').value.trim()||'未命名的书',subtitle:$('#book-subtitle').value.trim(),author:$('#book-author').value.trim()||'佚名'};}
  function renderDirectory() {
    const query=$('#directory-search').value.trim().toLocaleLowerCase();
    const matches=selected().map((c,i)=>({c,i})).filter(({c})=>c.title.toLocaleLowerCase().includes(query));
    $('#directory-list').innerHTML=matches.map(({c,i})=>`<button data-directory-jump="${i}" ${current===i?'aria-current="page"':''}><span>${String(i+1).padStart(2,'0')}</span><strong>${escape(c.title)}</strong>${current===i?'<small>正在阅读</small>':''}</button>`).join('');
    $('#directory-empty').hidden=matches.length>0;
    $('#directory-count').textContent=`${selected().length} 章`;
    $('#directory-toggle').disabled=!selected().length;
  }
  function closeDirectory(restoreFocus=false) {$('#reader-directory').hidden=true;$('#directory-toggle').setAttribute('aria-expanded','false');if(restoreFocus)$('#directory-toggle').focus();}
  function page(c, n, title) {return `<article class="page right"><div class="running"><span>${escape(title)}</span><span>${String(n+1).padStart(2,'0')}</span></div><h3>${escape(c.title)}</h3><div class="prose">${c.paras.map(p=>`<p>${escape(p)}</p>`).join('')}</div><div class="page-foot"><span>${escape(metadata().author)}</span><span>${String(n+1).padStart(2,'0')}</span></div></article>`;}
  function renderBook() {
    const list = selected(), m = metadata();
    current = Math.min(current,list.length-1);
    $('#reader-name').textContent=m.title;
    renderDirectory();
    if(!list.length){$('#book').innerHTML='<article class="page empty"><div class="running">阅读预览</div><h3>还没有选中的章节</h3><div class="prose"><p>在左侧勾选至少一篇文章，开始制作你的书。</p></div></article>';}
    else if(mode==='flow') {
      $('#book').innerHTML=`<article class="page cover"><div class="cover-top"><span>生活手记</span>${icon('book')}</div><h2>${escape(m.title)}</h2><p class="cover-subtitle">${escape(m.subtitle)}</p><div class="cover-author">${escape(m.author)} / 著</div></article>${list.map((c,i)=>page(c,i,m.title)).join('')}`;
    } else if(current<0){
      const coverTitle = m.title==='日常，值得成书。' ? '日常，\n值得成书。' : m.title;
      $('#book').innerHTML=`<article class="page cover"><div class="cover-top"><span>生活手记 · ${new Date().getFullYear()}</span>${icon('book')}</div><h2>${escape(coverTitle)}</h2><p class="cover-subtitle">${escape(m.subtitle)}</p><div class="cover-rule"></div><div class="cover-author">${escape(m.author)} / 著</div><div class="cover-bottom"><span>${list.length} 篇文字，一本小书</span><em>Everyday notes</em></div></article>${page(list[0],0,m.title)}`;
    } else {
      $('#book').innerHTML=`<article class="page left"><div class="running"><span>${escape(m.title)}</span><span>目录</span></div><h3>在这些文字之间</h3><div class="book-contents">${list.map((c,i)=>`<button data-jump="${i}" class="${i===current?'current':''}"><span>${String(i+1).padStart(2,'0')}</span>${escape(c.title)}</button>`).join('')}</div><div class="page-foot"><span>${escape(m.subtitle)}</span></div></article>${page(list[current],current,m.title)}`;
    }
    $('#position-label').textContent=current<0?'封面与序言':list[current]?.title||'未选择章节';
    $('#position-count').textContent=`${current<0?0:current+1} / ${list.length} 章`;
    $('#previous').disabled=current<0||!list.length;
    $('#next').disabled=!list.length||current>=list.length-1;
    $('#next').innerHTML=`${current<0?'翻开阅读':'下一章'}${icon('arrow')}`;
    $('#reading-tip').textContent=mode==='flow'?'在书页内向下滚动，连续阅读全部章节。':device==='mobile'?'单页阅读 · 左右滑动或打开目录切换章节':'用左右方向键翻章，或打开目录跳转章节。';
    renderList();
  }
  function go(target) {
    if(busy||mode==='flow'||target< -1||target>=selected().length||target===current)return;
    current=target;renderBook();
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){busy=true;$('.book-wrap').classList.add('flipping');clearTimeout(flipTimer);flipTimer=setTimeout(()=>{busy=false;$('.book-wrap').classList.remove('flipping');},670);}
  }
  function setMode(next) {mode=next;$('#stage').classList.toggle('flow',next==='flow');$$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});renderBook();}
  document.addEventListener('click',e=>{
    const t=e.target.closest('button');if(!t)return;
    if(t.dataset.tab)tab(t.dataset.tab);
    if(t.dataset.next)tab(t.dataset.next);
    if(t.dataset.chapter){const c=chapters.find(c=>c.id===t.dataset.chapter);if(!c.selected){toast('先勾选这篇文章，再预览章节。');return;}setMode('book');go(selected().findIndex(c=>c.id===t.dataset.chapter));}
    if(t.dataset.move!==undefined){const i=Number(t.dataset.move),j=i+Number(t.dataset.direction),active=selected()[current]?.id;[chapters[i],chapters[j]]=[chapters[j],chapters[i]];current=active?selected().findIndex(c=>c.id===active):-1;renderBook();}
    if(t.dataset.jump!==undefined)go(Number(t.dataset.jump));
    if(t.dataset.directoryJump!==undefined){const target=Number(t.dataset.directoryJump);closeDirectory(true);if(mode==='flow'){current=target;renderBook();$('#book .page.right:nth-of-type('+(target+2)+')')?.scrollIntoView({block:'nearest'});}else go(target);}
    if(t.dataset.mode)setMode(t.dataset.mode);
    if(t.dataset.device){device=t.dataset.device;$('#stage').classList.toggle('mobile',device==='mobile');$$('[data-device]').forEach(b=>{b.classList.toggle('active',b.dataset.device===device);b.setAttribute('aria-pressed',b.dataset.device===device);});renderBook();}
    if(t.dataset.color){document.documentElement.style.setProperty('--cover',t.dataset.color);$$('[data-color]').forEach(b=>{b.classList.toggle('selected',b===t);b.setAttribute('aria-pressed',b===t);});}
    if(t.dataset.default){defaultMode=t.dataset.default;$$('[data-default]').forEach(b=>{b.classList.toggle('active',b===t);b.setAttribute('aria-pressed',b===t);});setMode(defaultMode);}
  });
  $('#chapter-list').addEventListener('change',e=>{if(!e.target.dataset.check)return;const active=selected()[current]?.id;chapters.find(c=>c.id===e.target.dataset.check).selected=e.target.checked;current=active?selected().findIndex(c=>c.id===active):-1;renderBook();});
  $('#select-all').onclick=()=>{const on=selected().length!==chapters.length;chapters.forEach(c=>c.selected=on);current=-1;renderBook();};
  ['book-title','book-subtitle','book-author'].forEach(id=>$('#'+id).addEventListener('input',renderBook));
  $('#paper').onchange=e=>document.documentElement.style.setProperty('--paper',e.target.value==='white'?'#ffffff':'#fcfaf5');
  $('#font-size').onchange=e=>document.documentElement.style.setProperty('--book-font',e.target.value+'px');
  $('#output-name').oninput=()=>{$('#output-folder-label').textContent=($('#output-name').value||'website')+'/';$('#output-name').removeAttribute('aria-invalid');};
  $('#previous').onclick=()=>go(current-1);$('#next').onclick=()=>go(current+1);
  $('#directory-toggle').onclick=()=>{const open=$('#reader-directory').hidden;$('#reader-directory').hidden=!open;$('#directory-toggle').setAttribute('aria-expanded',String(open));if(open){$('#directory-search').value='';renderDirectory();$('#directory-search').focus();}};
  $('#directory-close').onclick=()=>closeDirectory(true);
  $('#directory-search').oninput=renderDirectory;
  document.addEventListener('click',e=>{if(!e.target.closest('.reader-directory,#directory-toggle'))closeDirectory();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#reader-directory').hidden){e.stopImmediatePropagation();closeDirectory(true);}},true);
  $('#back-cover').onclick=()=>{setMode('book');go(-1);};
  $('#expand').onclick=()=>{document.body.classList.toggle('expanded');$('#expand').setAttribute('aria-label',document.body.classList.contains('expanded')?'退出放大预览':'放大阅读预览');};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('expanded');$('#expand').setAttribute('aria-label','放大阅读预览');}if(e.target.closest?.('input,select,textarea,dialog'))return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();go(current-1);}});
  let touchX=0,touchY=0;$('#book').addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX;touchY=e.changedTouches[0].clientY;},{passive:true});$('#book').addEventListener('touchend',e=>{const x=e.changedTouches[0].clientX-touchX,y=e.changedTouches[0].clientY-touchY;if(Math.abs(x)>60&&Math.abs(x)>Math.abs(y)*1.5)go(current+(x<0?1:-1));},{passive:true});
  $('#choose-folder').onclick=()=>$('#folder-input').click();
  $('#folder-input').onchange=async e=>{
    const files=[...e.target.files].filter(f=>/\.(md|markdown)$/i.test(f.name)).sort((a,b)=>a.webkitRelativePath.localeCompare(b.webkitRelativePath,'zh-CN',{numeric:true}));
    if(!files.length){toast('这个目录没有 Markdown 文件，请重新选择。');return;}
    try {const loaded=await Promise.all(files.map(async(f,i)=>{const text=(await f.text()).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');const title=text.match(/^#\s+(.+)$/m)?.[1]||f.name.replace(/\.(md|markdown)$/i,'');return {id:'local-'+i,file:f.name,title,words:`${text.replace(/\s/g,'').length.toLocaleString()} 字`,selected:true,paras:text.replace(/^#\s+.+\r?\n?/m,'').split(/\r?\n\s*\r?\n/).filter(Boolean)};}));chapters=loaded;current=-1;$('#source-name').textContent=files[0].webkitRelativePath.split('/')[0];$('#source-path').textContent='本地目录 · 仅在浏览器中读取';$('.sample-label').textContent='本地';renderBook();toast('已载入文字预览；本设计稿暂不解析 Markdown 格式和本地图片。');}catch{toast('读取失败，请检查文件后重新选择目录。');}
  };
  $('#reset').onclick=()=>{chapters=samples.map(c=>({...c,selected:true}));current=-1;$('#source-name').textContent='日常手记';$('#source-path').textContent='我的文稿 / 日常手记';$('.sample-label').textContent='示例';$('#folder-input').value='';$('#book-title').value='日常，值得成书。';$('#book-subtitle').value='一些散步、阅读与生活的手记';$('#book-author').value='林间';$('#output-name').value='everyday-notes';$('#output-name').removeAttribute('aria-invalid');$('#output-folder-label').textContent='everyday-notes/';$('#paper').value='warm';$('#font-size').value='15';document.documentElement.style.removeProperty('--paper');document.documentElement.style.removeProperty('--book-font');document.documentElement.style.removeProperty('--cover');$$('[data-color]').forEach((b,i)=>{b.classList.toggle('selected',i===0);b.setAttribute('aria-pressed',i===0);});$('#remember').checked=true;defaultMode='book';$$('[data-default]').forEach(b=>{b.classList.toggle('active',b.dataset.default==='book');b.setAttribute('aria-pressed',b.dataset.default==='book');});device='desktop';$('#stage').classList.remove('mobile');$$('[data-device]').forEach(b=>{b.classList.toggle('active',b.dataset.device==='desktop');b.setAttribute('aria-pressed',b.dataset.device==='desktop');});tab('content');setMode('book');toast('已恢复初始示例。');};
  $('#export').onclick=()=>{if(!selected().length)return;const name=$('#output-name').value.trim();if(!/^[A-Za-z0-9_-]+$/.test(name)){tab('output');$('#output-name').setAttribute('aria-invalid','true');$('#output-name').focus();toast('请填写有效的文件夹名称：英文字母、数字、短横线或下划线。');return;}$('#result-title').textContent=metadata().title;$('#result-summary').textContent=`${selected().length} 篇文章 · ${defaultMode==='book'?'图书翻页':'连续阅读'} · ${$('#remember').checked?'保留本书设置':'不保留设置'}`;$('#result-path').textContent=name+'/index.html';$('#result').showModal();};
  $('.dialog-close').onclick=()=>$('#result').close();$('#return-settings').onclick=()=>$('#result').close();$('#open-reader').onclick=()=>{$('#result').close();setMode(defaultMode);current=-1;renderBook();document.body.classList.add('expanded');$('#expand').setAttribute('aria-label','退出放大预览');};
  renderBook();
})();
