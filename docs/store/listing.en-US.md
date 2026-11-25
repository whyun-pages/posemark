# Microsoft Store listing — en-US

Paste each fenced block into the matching Partner Center field (Store listings › English (United States)).
Field limits are taken from Microsoft Learn ("Add and edit Store listing info for MSIX app",
"App screenshots, images, and trailers", Store FAQ), with primary fields checked on 2026-11-15; limits marked *(assumed)* could not be
confirmed in current docs and should be re-checked against the live Partner Center form.

| Field | Limit | Used |
| --- | --- | --- |
| Product name | must match a reserved name | `Posemark` |
| Description | required, ≤ 10,000 chars, plain text, no HTML / code / URLs | 4,714 |
| Short description | optional, ≤ 1,000 chars (only the first ~270 shown in some views) | 195 |
| What's new in this version | ≤ 1,500 chars — leave blank on the first submission | 0.4.1 update text |
| Product features | up to 20 items, ≤ 200 chars each, no own bullets | 20 items, longest 121 |
| Search terms | up to 7 terms, ≤ 30 chars each; not shown to users; avoid competitor brand names and words like "free"/"best" | 7, longest 21 |
| Screenshot captions | ≤ 200 chars each, up to 10 desktop screenshots | 7 screenshots and captions carried forward from 0.4.0, see `update-0.4.0.md` |
| Copyright and trademark info | ≤ 200 chars *(assumed)* | 1 line |
| Additional license terms | ≤ 10,000 chars *(assumed)*; optional | MIT notice below |

---

## Product name

```
Posemark
```

## Short description

```
A live-preview Markdown editor with editable tables, math, Mermaid diagrams and WeChat formatting. Keep your files on your own disk, and turn a folder of articles into an offline reading website.
```

## Description

```
Posemark is a desktop Markdown editor that renders your document while you type. You write plain Markdown; headings look like headings, tables look like tables, formulas and diagrams are drawn in place, and the Markdown markers only reappear on the line your caret is on. The file on disk is always ordinary Markdown, so it works with Git, static site generators and every other Markdown tool.

Live preview editing
- Headings, lists, quotes, task lists with clickable checkboxes, horizontal rules, bold, italic, strikethrough, highlight, subscript and superscript.
- GFM tables open as an editable grid when you click into them. Tab and Shift+Tab walk the cells, Enter moves down a row, and a right-click menu inserts or deletes rows and columns and sets alignment. Every keystroke is written back to the Markdown source.
- Fenced code blocks are syntax-highlighted, with optional line numbers, soft wrap and a copy button, and stay highlighted while you edit them.
- Inline and block math with KaTeX, including mhchem chemistry, a subset of the physics package, equation numbering and \label / \ref cross-references. A math block opens as a field with the rendered formula updating underneath.
- Mermaid diagrams, plus sequence and flow diagram syntaxes, render in place and follow the editor theme. Right-click a diagram to save it as SVG or PNG.
- GitHub-style alerts, footnotes, a clickable [TOC] block, emoji shortcodes with autocomplete, reference-style links and YAML front matter.
- Source code mode shows the raw Markdown with syntax highlighting.

Images
- Drop or paste an image and it is copied into the document's image folder (assets/ by default) and linked for you. Video and audio files become players.
- Click an image to resize it with a drag handle; the size is written into the Markdown.
- A right-click menu opens, reveals, copies, zooms, moves or deletes images, and can download a remote image into the image folder.
- Optional uploading through PicGo-Core, PicList or your own command, if you set one up.

Writing comfort
- Smart typography, auto-pairing of brackets and Markdown markers, and smart paste that turns rich text from web pages or Word into Markdown.
- Find and replace with regular expressions, jump to line, focus mode, typewriter mode, zoom and full screen.
- Word count with characters, lines, paragraphs and reading time.
- Detects UTF-8, GBK and UTF-16 (with a byte order mark) files, keeps the original encoding on save, and shows it in the status bar.

Workspace
- Open a folder and work from a file tree: new file, new folder, rename, duplicate, drag-and-drop move, move to the Recycle Bin, and undo of the last file operation. Clear file and folder icons and a collapse-all button help you navigate.
- Quick open, recent files, pinned folders, a flat file list view and search across the whole folder.
- Find and replace across a folder: preview every hit, tick the ones you want, then apply. Originals are backed up before anything is replaced.
- Right-click a file or folder in File Explorer to open it with Posemark. If Posemark is already running, each path opens in a new window.
- An outline panel with folding and filtering.
- Changes made to the folder by other programs show up automatically.
- Multiple windows, one document per window, and automatic save if you want it.
- Unsaved edits are backed up as drafts so a crash or a forced shutdown loses nothing; recover them from the File menu.

Output
- Export to self-contained HTML or to PDF.
- Turn a folder of Markdown articles into a website with a cover and searchable contents. Select and reorder chapters, adjust the appearance and preview before exporting. The reader supports chapter and continuous reading, font size and paper colours, including on phones. Local images, attachments, equations and diagrams are bundled: open index.html for offline reading or upload the complete folder to a static host. Remote resources still need a connection. The export panel and generated reader currently use Chinese.
- Copy as HTML or as Markdown.
- Copy for WeChat Official Accounts: the document is rebuilt with inline styles only, with formulas and diagrams turned into images, and a live preview lets you tune the look.

Themes
- Five built-in themes (Default, Night, Pixyll, Whitey, Newsprint), automatic switching with the Windows light or dark mode, and your own CSS overrides or complete themes.

Privacy
Posemark works on local files. It has no account, no ads and no telemetry. It only goes online when your document references a remote image, when you ask it to download an image, or when you use an image uploader you configured yourself.

Posemark is free and open source under the MIT license.
```

## Product features (20, one per field)

```
Live preview: Markdown renders in place, markers reappear only on the line you are editing
Edit tables as a grid with Tab navigation, row and column commands and alignment
Syntax-highlighted code blocks with optional line numbers, highlighted while you edit
KaTeX math with equation numbering, \label and \ref, mhchem and physics macros
Mermaid, sequence and flow diagrams rendered in place; save them as SVG or PNG
Drop or paste images into the document's assets folder, then resize them by dragging
Image menu: copy, zoom, move, delete, download remote images, batch move or copy all
Optional image upload through PicGo-Core, PicList or a custom command
GitHub-style alerts, footnotes, [TOC] block, emoji shortcodes and front matter
Smart paste from web pages and Word, smart typography, and auto-pairing of brackets and Markdown markers
File tree with clear icons, collapse all, rename, drag-and-drop move, Recycle Bin and undo
Quick open, recent files, pinned folders, and folder search with previewed batch replace
Outline panel with folding and filtering; word count; UTF-8, GBK and UTF-16 detection
Source code mode with Markdown syntax highlighting
Focus mode, typewriter mode, multiple windows, auto save and a File Explorer right-click menu
Unsaved-draft backups you can recover after a crash
Export to self-contained HTML or PDF; copy as HTML or Markdown
Export articles as an offline website with a cover and searchable contents; export panel and reader currently use Chinese
Copy for WeChat Official Accounts with inline styles and a live style preview
Five themes, follow Windows dark mode, and your own custom CSS
```

## Search terms (7, ≤ 30 chars each)

```
markdown editor
live preview markdown
wysiwyg markdown
markdown notes
latex math editor
mermaid diagram
markdown to pdf
```

## What's new in this version

Text for the 0.4.1 update.

```
You can now maximize a Mermaid diagram in a separate preview dialog and right-click it there to save or copy it.

Fixed an issue where SVG images defined only by a viewBox could disappear in the Markdown live preview.
```

## Copyright and trademark info

```
Copyright (c) 2026 yunnysunny. Released under the MIT License.
```

## Additional license terms (optional)

```
Posemark is open-source software licensed under the MIT License. The full license text and source code are available from the project's GitHub repository.
```

## Properties page (Partner Center › Properties)

| Field | Value |
| --- | --- |
| Category | **Productivity** (recommended; Productivity has no subcategory). Alternative: **Developer tools › Utilities** |
| Privacy policy URL | `https://<PLACEHOLDER>/privacy.html` — the `website/privacy.html` page on your site |
| Website | `https://github.com/whyun-pages/posemark` |
| Support contact info | `https://github.com/whyun-pages/posemark/issues` (or an e-mail address) |
| System requirements | Windows 10 version 1809 (build 17763) or later, x64; keyboard and mouse recommended |
| Product declarations | does not need internet to run its core features; not accessible-tested yet (leave unchecked) |
| Display mode | Desktop |
