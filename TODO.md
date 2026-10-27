# TODO — closing the gap with Typora

Compared against the Typora documentation (https://support.typora.io/). Done items are
tracked in `README.md`; this file lists what is still missing, in the suggested order.

## Batch 2 — workspace

- [ ] Launch behaviour: new file / restore last folder / restore last file and folder / open a fixed folder
- [ ] Unsaved-draft backup and a "Recover Unsaved Drafts" entry
- [ ] Multiple windows (`Ctrl+Shift+N`), `Ctrl+Tab` between open documents, reopen closed file (`Ctrl+Shift+T`)
- [ ] Follow the system dark mode: one theme for light, one for dark
- [ ] Custom CSS overrides (`base.user.css`, `{theme}.user.css`) with an "Open Theme Folder" button
- [ ] Sidebar "file list" (articles) mode next to the tree
- [ ] File tree: drag and drop to move, duplicate file, undo last file operation, keyboard navigation
- [ ] Pin folders in Open Recent / Quick Open; option to stop recording recent files
- [ ] Word count panel: lines, characters, reading time (configurable speed), selection counts
- [ ] Outline panel: keyword filter, flat / collapsible view, highlight current heading

## Batch 3 — export

- [ ] HTML (without styles), export as PNG image
- [ ] PDF: paper size and margins, header/footer with `${pageNo}` / `${pageCount}` variables, page break before h1, theme selection, YAML metadata into PDF properties
- [ ] HTML: optional collapsible outline, custom `<head>` / `<body>` additions, `${title}` style YAML variables
- [ ] General: default export location, open after export, "export with previous settings", YAML front matter overriding export settings
- [ ] Pandoc-based formats (docx, odt, rtf, epub, LaTeX, MediaWiki, reST, Textile, OPML) and custom command exports

## Batch 4 — images

- [ ] Global insert policy: copy to a chosen folder / keep original path / upload, plus per-document `typora-copy-images-to`
- [ ] `typora-root-url` for site-root paths; "use relative path", `./` prefix and URL-escape switches
- [ ] Image context menu: delete image (file too), move / copy image to…, move / copy all images (download remote ones)
- [ ] Accept Typora's `<img width>` and `style="zoom:50%"` sizing alongside `![alt|320]()`
- [ ] Image uploaders (PicGo-Core, PicList, custom command) and "Upload All Local Images"
- [ ] Dropping a video inserts `<video controls>`

## Batch 5 — math and diagrams

- [ ] Equation auto numbering (none / AMS / all), `\label` and `\ref` cross references
- [ ] mhchem (`\ce{}`), physics package, `\(...\)` / `\[...\]` delimiters, ` ```math ` blocks
- [ ] `sequence` (js-sequence) and `flow` (flowchart.js) code blocks
- [ ] Mermaid options via CSS variables (theme, font, sequence numbers, flowchart curve), right-click save as SVG / PNG

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
