// Sidebar icons share the same 20px grid and stroke weight.
const paths = {
  folder: '<path d="M2.5 6V4.5h6l2 2h7v10h-15Z"/><path d="M2.5 7h15"/>',
  folderOpen: '<path d="M2.5 10V4.5h6l2 2h7V9"/><path d="m2.5 9 1.5 7.5h13l1-7.5Z"/>',
  markdown: '<path d="M11.5 2.5h-7v15h11v-11Z"/><path d="M11.5 2.5v4h4M6.5 13v-4l2 2 2-2v4m2-3v3m-1-1 1 1 1-1"/>',
  file: '<path d="M11.5 2.5h-7v15h11v-11Z"/><path d="M11.5 2.5v4h4M7 10h6m-6 3h4"/>',
  image: '<rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="7" cy="7" r="1"/><path d="m3 14 4-4 3 3 3-4 4 5"/>',
  heading: '<path d="m8 3-2 14m8-14-2 14M4 7h13M3 13h13"/>',
};

export function treeIcon(name) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">${paths[name] || paths.file}</svg>`;
}

export function fileTreeIcon(entry) {
  if (entry.dir) return treeIcon('folder') + treeIcon('folderOpen');
  if (/\.(png|jpe?g|gif|svg|webp|bmp|avif|tiff?|ico|apng)$/i.test(entry.name)) return treeIcon('image');
  return treeIcon(entry.markdown === false ? 'file' : 'markdown');
}

export function disclosureIcon() {
  return '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m6 4 4 4-4 4"/></svg>';
}
