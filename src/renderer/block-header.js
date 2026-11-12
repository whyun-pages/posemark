import { tr } from './i18n.js';

const icons = {
  copy: '<rect x="6" y="6" width="8" height="8" rx="1.5"/><path d="M10 3H3v7"/>',
  check: '<path d="m3 8 3 3 7-7"/>',
  source: '<path d="m5 4-4 4 4 4m6-8 4 4-4 4M9 2 7 14"/>',
  preview: '<rect x="1.5" y="2" width="5" height="4" rx="1"/><rect x="9.5" y="10" width="5" height="4" rx="1"/><path d="M4 6v6h5.5"/>',
  expand: '<path d="M10 2h4v4M14 2 9 7M6 14H2v-4m0 4 5-5"/>',
  collapse: '<path d="M14 6h-4V2m0 4 4-4M2 10h4v4m0-4-4 4"/>',
  more: '<circle cx="3" cy="8" r=".8"/><circle cx="8" cy="8" r=".8"/><circle cx="13" cy="8" r=".8"/>',
};

function setIcon(button, name, label) {
  button.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  if (label) {
    const text = document.createElement('span');
    text.textContent = tr(label);
    button.appendChild(text);
  }
}

function shell() {
  const header = document.createElement('div');
  header.className = 'md-block-header';
  header.contentEditable = 'false';
  header.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    if (event.target.closest('button')) event.preventDefault();
  });
  header.addEventListener('click', (event) => event.stopPropagation());
  return header;
}

function button(icon, title, run, label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'md-block-action';
  el.title = tr(title);
  el.setAttribute('aria-label', tr(title));
  setIcon(el, icon, label);
  el.addEventListener('click', run);
  return el;
}

export function languageLabel(info) {
  const label = document.createElement('span');
  label.className = 'md-code-lang';
  label.textContent = info || tr('Plain text');
  label.title = label.textContent;
  return label;
}

export function createBlockHeader(info, source) {
  const header = shell();
  const actions = document.createElement('div');
  actions.className = 'md-block-actions';
  const status = document.createElement('span');
  status.className = 'md-block-status';
  status.setAttribute('role', 'status');
  let resetCopy;
  const copy = button('copy', 'Copy code', async () => {
    try {
      if (window.ink?.clipboardWrite) await window.ink.clipboardWrite(source);
      else await navigator.clipboard.writeText(source);
      setIcon(copy, 'check', 'Copied');
      status.textContent = tr('Copied');
      clearTimeout(resetCopy);
      resetCopy = setTimeout(() => { setIcon(copy, 'copy', 'Copy'); status.textContent = ''; }, 1800);
    } catch { status.textContent = tr('Action failed. Try again.'); }
  }, 'Copy');
  copy.classList.add('md-code-copy');
  actions.append(status, copy);
  header.append(languageLabel(info), actions);
  return { header };
}

export function createDiagramHeader({ id, frame, holder, source, measure, menu }) {
  const header = shell();
  const tabs = document.createElement('div');
  tabs.className = 'md-diagram-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', tr('Diagram view'));
  const actions = document.createElement('div');
  actions.className = 'md-block-actions';
  const panels = [holder, source];
  const tabButtons = panels.map((panel, index) => {
    const tab = button(index ? 'source' : 'preview', index ? 'Source' : 'Preview', () => select(index), index ? 'Source' : 'Preview');
    tab.classList.add('md-diagram-tab');
    tab.id = `${id}-tab-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${id}-panel-${index}`);
    panel.id = `${id}-panel-${index}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    tabs.appendChild(tab);
    return tab;
  });
  function select(index) {
    panels.forEach((panel, n) => {
      panel.hidden = n !== index;
      tabButtons[n].setAttribute('aria-selected', String(n === index));
      tabButtons[n].tabIndex = n === index ? 0 : -1;
    });
    measure();
  }
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : tabButtons.indexOf(event.target) === 0 ? 1 : 0;
    select(index);
    tabButtons[index].focus();
  });
  const expand = button('expand', 'Expand diagram', () => {
    const expanded = frame.classList.toggle('expanded');
    select(0);
    setIcon(expand, expanded ? 'collapse' : 'expand');
    expand.title = tr(expanded ? 'Restore diagram' : 'Expand diagram');
    expand.setAttribute('aria-label', expand.title);
    expand.setAttribute('aria-pressed', String(expanded));
  });
  expand.setAttribute('aria-pressed', 'false');
  const more = button('more', 'More actions', () => menu(more));
  more.setAttribute('aria-haspopup', 'menu');
  actions.append(expand, more);
  header.append(tabs, actions);
  select(0);
  return { header };
}
