'use strict';
const { Menu, app, shell } = require('electron');

const isMac = process.platform === 'darwin';

function buildMenu(opts) {
  const { onCommand, themes, currentTheme, recentFiles = [], recentFolders = [], isDev, hasFile } = opts;
  const cmd = (id) => () => onCommand(id);
  const item = (label, id, accelerator, extra = {}) => ({
    label,
    accelerator,
    click: cmd(id),
    ...extra,
  });

  const recentItems = [
    ...recentFolders.slice(0, 8).map((p) => ({
      label: p,
      sublabel: 'Folder',
      click: () => onCommand('file:openFolderPath', p),
    })),
    ...recentFiles.slice(0, 12).map((p) => ({
      label: require('path').basename(p),
      sublabel: p,
      click: () => onCommand('file:openPath', p),
    })),
  ];
  if (recentItems.length) recentItems.push({ type: 'separator' }, item('Clear Recent', 'file:clearRecent'));

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '&File',
      submenu: [
        item('New', 'file:new', 'CmdOrCtrl+N'),
        item('Open…', 'file:open', 'CmdOrCtrl+O'),
        item('Open Folder…', 'file:openFolder', 'CmdOrCtrl+Shift+O'),
        item('Open Recent', 'file:recent', undefined, { submenu: recentItems.length ? recentItems : [{ label: 'Empty', enabled: false }] }),
        { type: 'separator' },
        item('Save', 'file:save', 'CmdOrCtrl+S', { enabled: true }),
        item('Save As…', 'file:saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            item('HTML', 'export:html'),
            item('PDF', 'export:pdf'),
            item('Copy as HTML Code', 'export:copyHtml'),
            item('Copy for WeChat', 'export:copyWeChat', 'CmdOrCtrl+Alt+C'),
            item('Export Settings…', 'export:settings'),
            { type: 'separator' },
            item('Print…', 'export:print', 'CmdOrCtrl+P'),
          ],
        },
        { type: 'separator' },
        item('Preferences…', 'app:preferences', 'CmdOrCtrl+,'),
        { type: 'separator' },
        isMac ? { role: 'close' } : item('Close', 'app:closeWindow', 'CmdOrCtrl+W'),
        ...(isMac ? [] : [item('Quit', 'app:quit', 'CmdOrCtrl+Q')]),
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('Paste as Plain Text', 'edit:pastePlain', 'CmdOrCtrl+Shift+V'),
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find', 'edit:find', 'CmdOrCtrl+F'),
        item('Find and Replace', 'edit:replace', 'CmdOrCtrl+H'),
        item('Find in Folder…', 'edit:findInFiles', 'CmdOrCtrl+Shift+F'),
        item('Jump to Line…', 'edit:gotoLine', 'CmdOrCtrl+G'),
        { type: 'separator' },
        item('Copy as Markdown', 'edit:copyMarkdown', 'CmdOrCtrl+Shift+C'),
      ],
    },
    {
      label: '&Paragraph',
      submenu: [
        item('Heading 1', 'para:h1', 'CmdOrCtrl+1'),
        item('Heading 2', 'para:h2', 'CmdOrCtrl+2'),
        item('Heading 3', 'para:h3', 'CmdOrCtrl+3'),
        item('Heading 4', 'para:h4', 'CmdOrCtrl+4'),
        item('Heading 5', 'para:h5', 'CmdOrCtrl+5'),
        item('Heading 6', 'para:h6', 'CmdOrCtrl+6'),
        item('Paragraph', 'para:p', 'CmdOrCtrl+0'),
        { type: 'separator' },
        item('Increase Heading Level', 'para:headingUp', 'CmdOrCtrl+='),
        item('Decrease Heading Level', 'para:headingDown', 'CmdOrCtrl+-'),
        { type: 'separator' },
        item('Table', 'para:table', 'CmdOrCtrl+T'),
        {
          label: 'Code Fences',
          submenu: [item('Plain', 'para:code'), item('Mermaid Diagram', 'para:codeMermaid'), item('Math Block', 'para:mathBlock', 'CmdOrCtrl+Shift+M')],
        },
        item('Quote', 'para:quote', 'CmdOrCtrl+Shift+Q'),
        {
          label: 'Alert',
          submenu: ['Note', 'Tip', 'Important', 'Warning', 'Caution'].map((name) => ({
            label: name,
            click: () => onCommand('para:alert', name.toLowerCase()),
          })),
        },
        item('Ordered List', 'para:ol', 'CmdOrCtrl+Shift+['),
        item('Unordered List', 'para:ul', 'CmdOrCtrl+Shift+]'),
        item('Task List', 'para:task', 'CmdOrCtrl+Shift+X'),
        { type: 'separator' },
        item('Horizontal Rule', 'para:hr'),
        item('Indent', 'para:indent', 'CmdOrCtrl+]'),
        item('Outdent', 'para:outdent', 'CmdOrCtrl+['),
      ],
    },
    {
      label: 'F&ormat',
      submenu: [
        item('Bold', 'fmt:bold', 'CmdOrCtrl+B'),
        item('Italic', 'fmt:italic', 'CmdOrCtrl+I'),
        item('Underline', 'fmt:underline', 'CmdOrCtrl+U'),
        item('Code', 'fmt:code', 'CmdOrCtrl+Shift+`'),
        item('Strike', 'fmt:strike', 'Alt+Shift+5'),
        item('Highlight', 'fmt:highlight', 'CmdOrCtrl+Shift+H'),
        item('Superscript', 'fmt:superscript'),
        item('Subscript', 'fmt:subscript'),
        { type: 'separator' },
        item('Hyperlink', 'fmt:link', 'CmdOrCtrl+K'),
        item('Image', 'fmt:image', 'CmdOrCtrl+Shift+I'),
        item('Clear Style', 'fmt:clear', 'CmdOrCtrl+\\'),
      ],
    },
    {
      label: '&View',
      submenu: [
        item('Source Code Mode', 'view:sourceMode', 'CmdOrCtrl+/'),
        item('Focus Mode', 'view:focusMode', 'F8'),
        item('Typewriter Mode', 'view:typewriterMode', 'F9'),
        { type: 'separator' },
        item('Toggle Sidebar', 'view:sidebar', 'CmdOrCtrl+Shift+L'),
        item('Outline', 'view:outline', 'CmdOrCtrl+Shift+1'),
        item('Search', 'view:search', 'CmdOrCtrl+Shift+2'),
        item('File Tree', 'view:files', 'CmdOrCtrl+Shift+3'),
        item('Word Count', 'view:wordCount', 'CmdOrCtrl+Shift+W'),
        item('Status Bar', 'view:statusBar'),
        { type: 'separator' },
        item('Zoom In', 'view:zoomIn', 'CmdOrCtrl+Shift+='),
        item('Zoom Out', 'view:zoomOut', 'CmdOrCtrl+Shift+-'),
        item('Actual Size', 'view:zoomReset', 'CmdOrCtrl+Shift+0'),
        { type: 'separator' },
        item('Toggle Fullscreen', 'view:fullscreen', 'F11'),
        item('Always on Top', 'view:alwaysOnTop', 'CmdOrCtrl+Shift+P'),
        { type: 'separator' },
        item('Reload', 'view:reload', 'CmdOrCtrl+R'),
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: '&Themes',
      submenu: themes.map((t) => ({
        label: t.name,
        type: 'radio',
        checked: currentTheme === t.id,
        click: () => onCommand('theme:set', t.id),
      })),
    },
    {
      label: '&Help',
      submenu: [
        item('Quick Open…', 'file:quickOpen', 'CmdOrCtrl+P'),
        { type: 'separator' },
        item('About Posemark', 'help:about'),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
