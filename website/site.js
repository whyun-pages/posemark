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
