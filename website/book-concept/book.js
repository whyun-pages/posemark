(() => {
  const spread = document.querySelector('#spread');
  const initial = spread.innerHTML;
  const layer = document.querySelector('#flip-layer');
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  const names = ['产品概览', '第一章 · 专注书写', '第二章 · 不止于文字', '第三章 · 开始你的下一篇'];
  const mobile = () => matchMedia('(max-width:720px)').matches;
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
  const running = (left, right) => `<div class="page-running"><span>${left}</span><span>${right}</span></div>`;
  const foot = (label, n) => `<div class="page-footer"><span>${label}</span><span>${n}</span></div>`;
  const shot = (name, alt) => `<figure class="product-shot"><img src="../assets/screenshots/${name}-zh.jpg" alt="${alt}" width="1600" height="840"></figure>`;
  const mobileShot = (name, alt) => `<figure class="mobile-preview"${mobile() ? '' : ' hidden'}><img src="../assets/screenshots/${name}-zh.jpg" alt="${alt}"><figcaption>Posemark 真实编辑界面</figcaption></figure>`;
  const showcase = (chapter, title, description, image, choices, caption) => `
    <section class="page showcase-title">${running(chapter, 'Posemark')}<h2>${title}</h2></section>
    <section class="page showcase-description"><p>${description}</p><div class="demo-switch" aria-label="切换功能截图">${choices.map(([name, label], i) => `<button data-shot="${name}" aria-pressed="${i === 0}">${label}</button>`).join('')}</div></section>
    <figure class="product-shot spread-shot"><button class="enlarge-shot" aria-label="放大查看产品截图"><img src="../assets/screenshots/${image}-zh.jpg" alt="Posemark ${choices[0][1]}实际界面"><span class="enlarge-label">点击查看原图</span></button></figure>
    <div class="spread-caption"><span>${caption}</span><a href="../docs.html">阅读使用文档</a></div>`;
  const pages = [
    () => initial,
    () => showcase('第一章 · 专注书写', '落笔，就能看见成稿。', '标题、引用、表格原位呈现。按需查看 Markdown 标记，也能随时切换深色主题或源代码模式。', 'editor', [['editor', '实时预览'], ['dark', '深色主题'], ['source', '源代码']], '完整编辑界面 · 点击截图可放大查看'),
    () => showcase('第二章 · 不止于文字', '把复杂的想法，表达清楚。', '公式与图表实时呈现。导出 PDF、HTML 或长图，也能为微信公众号排好版。', 'math', [['math', '公式与图表'], ['export', '文档导出'], ['wechat', '公众号排版']], '实际功能截图 · 点击截图可放大查看'),
    () => `<section class="page">${running('第三章', '开始你的下一篇')}<h2 class="download-title">空白的一页，<br>留给你的新想法。</h2><p>选择你的系统，把 Posemark 带回自己的桌面。<br>免费、开源，从第一行开始。</p><div class="download-platforms"><div class="platform-row"><div><strong>Windows</strong><small>Windows 10 / 11 · x64</small></div><a href="https://apps.microsoft.com/detail/9PPSNFZN20LQ" target="_blank" rel="noopener">微软商店${icon('download')}</a></div><div class="platform-row"><div><strong>macOS</strong><small>Intel 与 Apple 芯片</small></div><a href="https://github.com/whyun-pages/posemark/releases/latest" target="_blank" rel="noopener">下载 dmg${icon('download')}</a></div><div class="platform-row"><div><strong>Linux</strong><small>AppImage / deb</small></div><a href="https://github.com/whyun-pages/posemark/releases/latest" target="_blank" rel="noopener">获取安装包${icon('download')}</a></div></div><p class="legal-note">Windows 安装包与免安装版亦可在 <a class="text-link" href="https://github.com/whyun-pages/posemark/releases/latest" target="_blank" rel="noopener">GitHub Releases</a> 获取。</p>${foot('你的故事，从这里开始', '06')}</section><section class="page">${running('后记', '写作未完待续')}<img class="closing-logo" src="../assets/logo.svg" alt="Posemark 图标"><div class="closing-name">Posemark</div><blockquote class="closing-quote">工具轻一点，<br>思绪就远一点。</blockquote><p>无论是一则随手记，还是一篇长文章，<br>愿你每次打开 Posemark，<br>都能找回落笔时的自在。</p><a class="primary-link" href="../docs.html">打开使用文档${icon('book')}</a><p class="legal-note">源代码以 MIT 许可开放。<br><a class="text-link" href="https://github.com/whyun-pages/posemark" target="_blank" rel="noopener">在 GitHub 看看${icon('github')}</a></p>${foot('全书完，写作未完', '07')}</section>`
  ];
  let current = 0;
  let busy = false;
  const update = () => {
    previous.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    document.querySelector('#chapter-name').textContent = names[current];
    document.querySelectorAll('.chapter-tabs button').forEach((b, i) => i === current ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
    document.querySelectorAll('.progress-dots i').forEach((dot, i) => dot.classList.toggle('active', i === current));
    spread.setAttribute('aria-label', names[current]);
  };
  const go = target => {
    if (busy || target === current || target < 0 || target >= pages.length) return;
    busy = true;
    const forward = target > current;
    const temp = document.createElement('div');
    temp.innerHTML = pages[target]();
    const restoreFocus = spread.contains(document.activeElement);
    layer.replaceChildren();
    [spread, temp].forEach((source, i) => {
      const face = document.createElement('div');
      face.className = `flip-face${i ? ' back' : ''}`;
      const snapshot = document.createElement('div');
      snapshot.className = 'spread flip-snapshot';
      snapshot.innerHTML = source.innerHTML;
      snapshot.style.width = `${spread.offsetWidth}px`;
      snapshot.style.minHeight = `${spread.offsetHeight}px`;
      if (!mobile()) snapshot.style.transform = `translateX(${(i ? !forward : forward) ? -spread.offsetWidth / 2 : 0}px)`;
      face.append(snapshot);
      layer.append(face);
    });
    layer.inert = true;
    // The underlying spread is the next destination; the overlay carries both sides of the turning sheet.
    spread.replaceChildren(...temp.childNodes);
    current = target;
    update();
    if (restoreFocus) document.querySelector('.chapter-tabs [aria-current]').focus({ preventScroll: true });
    layer.className = `flip-layer turning${forward ? '' : ' reverse'}`;
    const finish = () => { layer.removeEventListener('animationend', finish); layer.className = 'flip-layer'; layer.replaceChildren(); busy = false; };
    layer.addEventListener('animationend', finish, { once: true });
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) finish();
  };
  document.addEventListener('click', event => {
    const jump = event.target.closest('[data-goto]');
    if (jump) go(Number(jump.dataset.goto));
    const enlarge = event.target.closest('.enlarge-shot');
    if (enlarge && !busy) {
      const source = enlarge.querySelector('img');
      const viewer = document.querySelector('#image-viewer');
      const image = viewer.querySelector('img');
      image.src = source.src; image.alt = source.alt;
      document.querySelector('#viewer-title').textContent = source.alt;
      viewer.showModal();
    }
    const control = event.target.closest('[data-shot]');
    if (control && !busy) {
      const panel = spread;
      const image = panel.querySelector('.product-shot img');
      image.src = `../assets/screenshots/${control.dataset.shot}-zh.jpg`;
      image.alt = `Posemark ${control.textContent}实际界面`;
      panel.querySelectorAll('[data-shot]').forEach(button => button.setAttribute('aria-pressed', String(button === control)));
    }
  });
  const viewer = document.querySelector('#image-viewer');
  viewer.querySelector('.viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  previous.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));
  document.addEventListener('keydown', event => {
    if (document.querySelector('#image-viewer').open) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1); }
  });
  let touch = null;
  spread.addEventListener('touchstart', event => { touch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  spread.addEventListener('touchend', event => {
    if (!touch || event.target.closest('a,button')) { touch = null; return; }
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.7) go(current + (dx < 0 ? 1 : -1));
    touch = null;
  }, { passive: true });
  const media = matchMedia('(max-width:720px)');
  media.addEventListener('change', () => { if (!busy) spread.innerHTML = pages[current](); });
  // Announce chapter changes without reading every paragraph after a flip.
  document.querySelector('#chapter-name').setAttribute('aria-live', 'polite');
  update();
})();
