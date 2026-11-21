# TODO — closing the gap with Typora

Compared against the Typora documentation (https://support.typora.io/). Done items are
tracked in `README.md`; this file lists what is still missing, in the suggested order.

## Explorer context menu in the Store build

- [x] Add the "Open with Posemark" entry on files and the "Open Folder with Posemark" entry on folders and folder backgrounds to the Microsoft Store (AppX/MSIX) build, with English and Chinese labels and icons, wired into the local and CI builds.

Implemented as a native `IExplorerCommand` COM DLL, registered through the package manifest as two command classes and three entry points. The extension reads the file system path directly and launches the packaged `Posemark.exe`, reusing the existing CLI and single-instance forwarding. For folder backgrounds it reads the current directory from the shell site, and the menu is hidden for virtual folders. The Store-specific config compiles the DLL automatically, adds the manifest namespaces through the `appxManifestCreated` hook, and verifies the actual contents after packaging. Implementation and build notes: [Store packaging doc section 5.1](docs/store/packaging.md#51-windows-11-右键菜单windowsfileexplorercontextmenus).

On 2026-11-19, `pnpm test` (77 tests), `pnpm test:shell` and `pnpm dist:store` passed, producing `release/Posemark-0.3.0-x64.appx`. The native tests cover COM lifetime, English and Chinese resources, multi-selection of files, directories, folder backgrounds, virtual folders, paths with Chinese characters and spaces, drive roots, and argument escaping. The final AppX was checked for DLL architecture and SHA-256, CLSIDs, the three menu contexts, file associations and command-line aliases. The DLL depends only on Windows system libraries.

- [ ] Before release, install the signed package on a clean Windows 11 machine and on each supported Windows 10 version. Verify the actual menu display, cold start and an already running instance, upgrade, uninstall and coexistence with the NSIS build, and run WACK. This verification did not replace the installed Store version.

Basis for the design: [Microsoft Learn: add File Explorer context menu commands to a packaged desktop app](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer) (checked 2026-11-19).

## Batch 3 — export

- [ ] Pandoc-based formats (docx, odt, rtf, epub, LaTeX, MediaWiki, reST, Textile, OPML) and custom command exports

## Editor details

- [ ] Inline HTML and HTML blocks rendered and editable in place (`<details>`, `<video>`, `<audio>`, `<iframe>`, `<kbd>`…)
- [ ] Select line / word / styled scope; delete word / paragraph / styled scope; jump to selection, line start/end
- [ ] `Alt+Up/Down` moves paragraphs, list items and table rows
- [ ] Table: `Ctrl+Enter` inserts a row, `Ctrl+Shift+Backspace` deletes one, drag row/column borders to reorder, header tooltip for size and alignment
- [ ] Code blocks: language autocomplete, default language (incl. "last used"), indent size, Tab / Shift+Tab indent selected lines, "Copy Code Content"
- [ ] "Copy without theme styling", "copy Markdown source as plain text by default"
- [ ] Smart punctuation: convert-on-render mode, custom quote pairs (« »), remap full-width punctuation to ASCII on parse
- [ ] Spell check: language selection, custom dictionary (learn / unlearn), suggestions in the context menu
- [ ] Custom key bindings, floating toolbar, typewriter mode "only while typing" option
- [ ] Strict mode: also relax list indentation (only headings are relaxed today)
- [ ] RTL support (experimental in Typora)
