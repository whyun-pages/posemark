// Language switch (remembered per browser), screenshot swapping and the docs page's active link.
(function () {
  var KEY = 'posemark-site-lang';
  var html = document.documentElement;

  function pick() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'zh-CN' || saved === 'en') return saved;
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^zh/i.test(nav) ? 'zh-CN' : 'en';
  }

  function apply(lang) {
    html.lang = lang;
    var suffix = lang === 'en' ? 'en' : 'zh';
    document.querySelectorAll('img[data-shot]').forEach(function (img) {
      img.src = 'assets/screenshots/' + img.getAttribute('data-shot') + '-' + suffix + '.jpg';
    });
    var title = document.querySelector('meta[name="title-' + suffix + '"]');
    if (title) document.title = title.content;
    document.querySelectorAll('.lang-toggle').forEach(function (b) {
      b.textContent = lang === 'en' ? '中文' : 'English';
    });
  }

  apply(pick());

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.lang-toggle');
    if (!b) return;
    var next = html.lang === 'en' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem(KEY, next);
    } catch (err) {}
    apply(next);
  });

  // Feature tabs activate on click or Enter/Space; arrow keys move focus.
  var stage = document.querySelector('.feature-stage');
  if (stage) {
    var tabs = Array.from(stage.querySelectorAll('[role="tab"]'));
    var panels = Array.from(stage.querySelectorAll('[role="tabpanel"]'));
    function selectFeature(tab) {
      tabs.forEach(function (item) {
        var selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      panels.forEach(function (panel) { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { selectFeature(tab); });
      tab.addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault();
        tabs[next].focus();
      });
    });
    selectFeature(tabs[0]);
    stage.classList.add('is-ready');
    stage.querySelector('[role="tablist"]').hidden = false;
  }

  // docs: highlight the section in view
  var links = document.querySelectorAll('.docs-nav a[href^="#"]');
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) {
      byId[a.getAttribute('href').slice(1)] = a;
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) {
            a.classList.remove('active');
          });
          var a = byId[en.target.id];
          if (a) a.classList.add('active');
        });
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    document.querySelectorAll('.prose h2[id]').forEach(function (h) {
      io.observe(h);
    });
  }
})();
