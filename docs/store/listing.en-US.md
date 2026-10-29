# Microsoft Store listing — en-US

Paste each fenced block into the matching Partner Center field (Store listings › English (United States)).
Field limits are taken from Microsoft Learn ("Add and edit Store listing info for MSIX app",
"App screenshots, images, and trailers", Store FAQ) as of 2026-10; limits marked *(assumed)* could not be
confirmed in current docs and should be re-checked against the live Partner Center form.

| Field | Limit | Used |
| --- | --- | --- |
| Product name | must match a reserved name | `Posemark` |
| Description | required, ≤ 10,000 chars, plain text, no HTML / code / URLs | see below (3,687) |
| Short description | optional, ≤ 1,000 chars (only the first ~270 shown in some views) | 225 |
| What's new in this version | ≤ 1,500 chars — **leave blank on the first submission** (MS guidance) | text kept for 0.1.x updates |
| Product features | up to 20 items, ≤ 200 chars each, no own bullets | 20 items, longest 90 |
| Search terms | up to 7 terms, ≤ 30 chars each; not shown to users; avoid competitor brand names and words like "free"/"best" | 7, longest 21 |
| Screenshot captions | ≤ 200 chars each, up to 10 desktop screenshots | see `screenshots.md` |
| Copyright and trademark info | ≤ 200 chars *(assumed)* | 1 line |
| Additional license terms | ≤ 10,000 chars *(assumed)*; optional | MIT notice below |

---

## Product name

```
Posemark
```

## Short description

```
A Typora-style live-preview Markdown editor. Write plain Markdown and see it rendered in place: tables you edit as a grid, KaTeX math, Mermaid diagrams, images, footnotes and a table of contents. Your files stay on your disk.
```

> Note: mentioning "Typora-style" describes the editing model; if certification objects to the
> third-party name, use "A live-preview (WYSIWYG-style) Markdown editor." instead.

## Description

```
Posemark is a desktop Markdown editor that renders your document while you type. You write plain Markdown; headings look like headings, tables look like tables, formulas and diagrams are drawn in place, and the Markdown markers only reappear on the line your caret is on. The file on disk is always ordinary Markdown, so it works with Git, static site generators and every other Markdown tool.

Live preview editing
- Headings, lists, quotes, task lists with clickable checkboxes, horizontal rules, bold, italic, strikethrough, highlight, subscript and superscript.
- GFM tables open as an editable grid when you click into them. Tab and Shift+Tab walk the cells, Enter moves down a row, and a right-click menu inserts or deletes rows and columns and sets alignment. Every keystroke is written back to the Markdown source.
- Fenced code blocks are syntax-highlighted, with optional line numbers and soft wrap, and stay highlighted while you edit them.
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

Workspace
- Open a folder and work from a file tree: new file, new folder, rename, duplicate, drag-and-drop move, move to the Recycle Bin, and undo of the last file operation.
- Quick open, recent files, pinned folders, a flat file list view and search across the whole folder.
- An outline panel with folding and filtering.
- Changes made to the folder by other programs show up automatically.
- Multiple windows, one document per window, and automatic save if you want it.
- Unsaved edits are backed up as drafts so a crash or a forced shutdown loses nothing; recover them from the File menu.

Output
- Export to self-contained HTML or to PDF.
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
Smart paste converts rich text from web pages and Word documents into Markdown
Smart typography and auto-pairing of brackets and Markdown markers
File tree with rename, duplicate, drag-and-drop move, Recycle Bin and undo
Quick open, recent files, pinned folders and search across the whole folder
Outline panel with folding and filtering; word count and reading time
Source code mode with Markdown syntax highlighting
Focus mode, typewriter mode, multiple windows and auto save
Unsaved-draft backups you can recover after a crash
Export to self-contained HTML or PDF; copy as HTML or Markdown
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

First submission: leave blank (Microsoft guidance). Text prepared for the first Store update, edit
for the actual release:

```
First Microsoft Store release of Posemark 0.1.0: live-preview Markdown editing with grid tables, KaTeX math, Mermaid diagrams, image management and uploaders, file tree and folder search, unsaved-draft recovery, HTML/PDF export and Copy for WeChat.
```

## Copyright and trademark info

```
Copyright (c) 2026 yunnysunny. Released under the MIT License.
```

## Additional license terms (optional)

```
Posemark is open-source software licensed under the MIT License. The full license text and source code are available from the project's GitHub repository.
```

> Note: the repository currently has no `LICENSE` file even though `package.json` says MIT — add one
> before submission so the claim can be verified.

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
