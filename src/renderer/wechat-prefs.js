// Preferences › Export: the "Copy for WeChat" style panel with a live 公众号 preview.
//
// Left column edits the `wechat*` config keys; right column rebuilds the real WeChat
// fragment (same code path as the copy command) inside a stylesheet-free iframe, so
// what you see is what the 公众号 editor would keep.
import { buildWeChatFragment, themeTokens, WECHAT_DEFAULTS } from './wechat.js';

// config key <-> WECHAT_DEFAULTS option
export const WECHAT_KEYS = Object.keys(WECHAT_DEFAULTS).map((k) => ['wechat' + k[0].toUpperCase() + k.slice(1), k]);

export function wechatStyleFrom(config) {
  const style = {};
  for (const [key, opt] of WECHAT_KEYS) if (config[key] !== undefined) style[opt] = config[key];
  return style;
}

// preview choices survive re-rendering the panel (search, section switches)
const view = { device: 'phone', useSample: false };

const ACCENTS = ['#07c160', '#2f7ce0', '#e5484d', '#f5a623', '#8e4ec6'];

const SAMPLE = `# 用 Markdown 写公众号文章

公众号编辑器会丢掉所有样式表，所以导出时每个元素都要带上**行内样式**，链接也会变成[文末引用](https://example.com/inline-styles)。

## 为什么需要设置

> 不同的号有不同的调性：字号、行距和强调色都应该可以调。

- **主题**决定整体配色
- 行内公式 $E = mc^2$ 会转成图片
- 支持 ==高亮==、\`行内代码\` 和 ~~删除线~~

### 代码与表格

\`\`\`js
const style = load('wechat');
copy(render(doc, style));
\`\`\`

| 选项 | 默认值 |
| --- | --- |
| 字号 | 16px |
| 行高 | 1.75 |
`;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {HTMLElement} host      prefs body (emptied by the caller)
 * @param {HTMLElement} actions   footer slot for the copy buttons
 * @param {object} opts
 *   themes      theme registry
 *   config()    current config object
 *   save(patch) persist a config patch, resolves to the new config
 *   source()    current document Markdown
 *   docPath     current document path (for relative images)
 *   docName     shown in the phone's nav bar
 *   copy()      run the real Copy for WeChat command
 *   copyText(t) put plain text on the clipboard
 */
export function renderWeChatPanel(host, actions, opts) {
  const ui = { seq: 0, timer: null, html: '' };
  const cfg = () => opts.config();
  const light = opts.themes.filter((t) => !t.dark);

  const split = el('div', 'wx-split');
  const form = el('div', 'wx-form');
  const pv = el('div', 'wx-preview');
  split.append(form, pv);
  host.appendChild(split);

  // -------------------------------------------------------------- preview
  const bar = el('div', 'wx-pv-bar');
  const title = el('span', 'wx-pv-title', 'Live preview');
  const status = el('small', 'wx-pv-status');
  title.appendChild(status);
  const sourceSeg = segmented(
    [['doc', 'Document'], ['sample', 'Sample']],
    () => (view.useSample ? 'sample' : 'doc'),
    (v) => {
      view.useSample = v === 'sample';
      refresh(0);
    },
  );
  const deviceSeg = segmented(
    [['phone', 'Phone'], ['desktop', 'Desktop']],
    () => view.device,
    (v) => {
      view.device = v;
      stage.dataset.device = v;
    },
  );
  const tools = el('span', 'wx-pv-tools');
  tools.append(sourceSeg.node, deviceSeg.node);
  bar.append(title, tools);

  const stage = el('div', 'wx-stage');
  stage.dataset.device = view.device;
  const device = el('div', 'wx-device');
  const statusBar = el('div', 'wx-statusbar');
  statusBar.append(el('span', '', '9:41'), el('span', '', '●●● 100%'));
  const nav = el('div', 'wx-navbar');
  const navTitle = el('span', 'wx-navtitle');
  nav.append(el('span', 'wx-back', '‹'), navTitle);
  const frame = el('iframe', 'wx-frame');
  frame.setAttribute('sandbox', 'allow-same-origin');
  device.append(statusBar, nav, frame);
  stage.appendChild(device);
  pv.append(bar, stage);

  function refresh(delay = 220) {
    clearTimeout(ui.timer);
    ui.timer = setTimeout(build, delay);
  }

  async function build() {
    const seq = ++ui.seq;
    const doc = opts.source();
    const sample = view.useSample || !doc.trim();
    navTitle.textContent = sample ? 'Sample' : opts.docName || 'Untitled';
    status.textContent = ' · updating…';
    try {
      const { html } = await buildWeChatFragment(sample ? SAMPLE : doc, {
        docPath: sample ? null : opts.docPath,
        style: wechatStyleFrom(cfg()),
      });
      if (seq !== ui.seq) return; // a newer build is on its way
      ui.html = html;
      const y = frame.contentWindow?.scrollY || 0;
      frame.addEventListener('load', () => frame.contentWindow.scrollTo(0, y), { once: true });
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px 16px 48px;background:#fff">${html}</body>`;
      status.textContent = sample ? ' · sample document' : ' · current document';
    } catch (err) {
      if (seq === ui.seq) status.textContent = ` · preview failed: ${err.message || err}`;
    }
  }

  // -------------------------------------------------------------- form
  async function set(key, value, { rerender = true } = {}) {
    await opts.save({ [key]: value });
    if (rerender) renderForm();
    refresh();
  }

  function group(text, extra) {
    const h = el('div', 'wx-group', text);
    if (extra) h.appendChild(extra);
    form.appendChild(h);
  }

  function row(label, control) {
    const r = el('div', 'wx-row');
    r.append(el('span', 'wx-label', label), control);
    form.appendChild(r);
  }

  function check(key, label) {
    const r = el('label', 'wx-check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!cfg()[key];
    box.addEventListener('change', () => set(key, box.checked));
    r.append(box, el('span', '', label));
    form.appendChild(r);
  }

  function slider(key, { min, max, step, fmt }) {
    const wrap = el('span', 'wx-slider');
    const input = el('input');
    input.type = 'range';
    Object.assign(input, { min, max, step });
    input.value = cfg()[key];
    const out = el('b', '', fmt(Number(input.value)));
    const paint = () => input.style.setProperty('--pct', `${((input.value - min) / (max - min)) * 100}%`);
    paint();
    // live: preview follows the drag; the value is persisted when it is released
    input.addEventListener('input', () => {
      out.textContent = fmt(Number(input.value));
      paint();
      cfg()[key] = Number(input.value);
      refresh(120);
    });
    input.addEventListener('change', () => set(key, Number(input.value), { rerender: false }));
    wrap.append(input, out);
    return wrap;
  }

  async function renderForm() {
    const scroll = form.scrollTop;
    form.innerHTML = '';
    const c = cfg();

    const reset = el('button', 'wx-link', 'Reset');
    reset.addEventListener('click', async () => {
      await opts.save(Object.fromEntries(WECHAT_KEYS.map(([key, opt]) => [key, WECHAT_DEFAULTS[opt]])));
      renderForm();
      refresh(0);
    });
    group('Style', reset);

    // theme cards
    const cards = el('div', 'wx-themes');
    const choices = [...light.map((t) => [t.id, t.name]), ['current', 'Follow editor']];
    for (const [id, name] of choices) {
      const card = el('button', 'wx-theme' + ((c.wechatTheme || 'current') === id ? ' on' : ''));
      const mini = el('span', 'wx-mini');
      card.append(mini, el('span', 'wx-theme-name', name));
      card.addEventListener('click', () => set('wechatTheme', id));
      cards.appendChild(card);
      paintMini(mini, id);
    }
    form.appendChild(cards);

    // accent swatches: theme colour, presets, custom picker
    const tokens = await themeTokens(c.wechatTheme);
    const sw = el('span', 'wx-swatches');
    const accent = (c.wechatAccent || '').toLowerCase();
    const themeSw = el('button', 'wx-sw' + (!accent ? ' on' : ''));
    themeSw.style.background = tokens.accent;
    themeSw.title = "Theme colour";
    themeSw.addEventListener('click', () => set('wechatAccent', ''));
    sw.appendChild(themeSw);
    for (const color of ACCENTS) {
      const b = el('button', 'wx-sw' + (accent === color ? ' on' : ''));
      b.style.background = color;
      b.title = color;
      b.addEventListener('click', () => set('wechatAccent', color));
      sw.appendChild(b);
    }
    const custom = el('label', 'wx-sw custom' + (accent && !ACCENTS.includes(accent) ? ' on' : ''));
    custom.title = 'Custom colour';
    if (accent && !ACCENTS.includes(accent)) custom.style.background = accent;
    const pick = el('input');
    pick.type = 'color';
    pick.value = accent || tokens.accent;
    pick.addEventListener('change', () => set('wechatAccent', pick.value));
    custom.appendChild(pick);
    sw.appendChild(custom);
    row('Accent colour', sw);

    row(
      'H2 style',
      segmented(
        [['bar', 'Bar'], ['underline', 'Underline'], ['badge', 'Badge'], ['plain', 'Plain']],
        () => cfg().wechatHeadingStyle,
        (v) => set('wechatHeadingStyle', v),
      ).node,
    );

    group('Typography');
    row('Font size', slider('wechatFontSize', { min: 14, max: 18, step: 1, fmt: (v) => `${v}px` }));
    row('Line height', slider('wechatLineHeight', { min: 1.5, max: 2.2, step: 0.05, fmt: (v) => v.toFixed(2) }));
    row(
      'Letter spacing',
      segmented(
        [[0, 'None'], [0.02, 'Slight'], [0.05, 'Wide']],
        () => cfg().wechatLetterSpacing,
        (v) => set('wechatLetterSpacing', v),
      ).node,
    );
    row(
      'Paragraph spacing',
      segmented(
        [[12, 'Compact'], [16, 'Normal'], [24, 'Loose']],
        () => cfg().wechatParagraphSpacing,
        (v) => set('wechatParagraphSpacing', v),
      ).node,
    );
    check('wechatJustify', 'Justify paragraphs');
    check('wechatFirstLineIndent', 'Indent first line of paragraphs (2 字)');

    group('Content');
    check('wechatLinkRefs', 'List link URLs at the end (参考链接)');
    check('wechatCodeLang', 'Show code block language label');
    form.scrollTop = scroll;
  }

  // -------------------------------------------------------------- footer
  actions.innerHTML = '';
  const copyHtml = el('button', 'pref-btn', 'Copy preview HTML');
  copyHtml.addEventListener('click', () => ui.html && opts.copyText(ui.html));
  const copy = el('button', 'pref-btn primary', 'Copy for WeChat');
  copy.addEventListener('click', () => opts.copy());
  actions.append(copyHtml, copy);

  renderForm();
  refresh(0);
}

// small thumbnail of a theme: page, heading, body lines, one accent line
const miniCache = new Map();
async function paintMini(node, id) {
  if (!miniCache.has(id)) miniCache.set(id, themeTokens(id));
  const T = await miniCache.get(id);
  node.style.background = T.bg;
  node.innerHTML = '';
  const line = (w, color, h = 4) => {
    const i = document.createElement('i');
    i.style.cssText = `width:${w}%;height:${h}px;background:${color}`;
    node.appendChild(i);
  };
  line(55, T.fg, 6);
  line(90, T.border);
  line(68, T.accent);
  line(80, T.border);
}

function segmented(options, get, onPick) {
  const node = el('span', 'wx-seg');
  const paint = () => {
    for (const b of node.children) b.classList.toggle('on', String(b.dataset.v) === String(get()));
  };
  for (const [value, label] of options) {
    const b = el('button', '', label);
    b.dataset.v = value;
    b.addEventListener('click', () => {
      onPick(value);
      paint();
    });
    node.appendChild(b);
  }
  paint();
  return { node, paint };
}
