# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`mdTool` renders **Markdown** (`.md`) and **Jupyter notebooks** (`.ipynb`) with
switchable themes and exports faithful PDFs where chart/image layout is preserved.
It is a **Node.js render core** wrapped in a **Tauri desktop shell**. PDFs come from
**headless Chromium print** (Playwright), which is the mechanism that keeps embedded
charts in their exact notebook position.

## Common commands

```bash
npm install                       # core deps
npx playwright install chromium   # one-time: Chromium for PDF
npm test                          # node:test suite (markdown, notebook, pdf)
npm test -- -t "<name substring>" # single test by name
npm run typecheck                 # tsc --noEmit (core only)
npm run build                     # compile core: tsc -p tsconfig.json
node --import tsx src/cli.ts <file> --theme github [--out x.pdf] [--preview]

# Desktop (needs Rust toolchain):
npm run tauri dev                 # run app (frontend + Rust)
npm run tauri build               # production binary

# Frontend-only dev (no Rust) — proxies preview to the Node core:
cd tauri-app && npm install && npm run build && node dev-server.mjs
```

The root `package.json` `test` script runs `node --import tsx --test test/*.test.ts`.
Tests must live in `test/` so they are excluded from the core `tsconfig`.

## Architecture

- **`src/` is the framework-agnostic core.** Tauri, a future CLI, or a web backend
  all call the same API in `src/index.ts`: `renderFile(path, {theme})` returns
  `{html, meta}`; `fileToPdf(path, out, {theme})` writes a themed PDF.
- **Markdown path** (`src/parse/markdown.ts`): a unified pipeline. The order matters
  — `remark-parse → remark-gfm → remark-frontmatter → remark-math →
  remark-rehype → rehype-katex → rehype-stringify`. The `remark-rehype` bridge is
  required because rehype plugins consume hast, not mdast. Notebook raw-HTML outputs
  are injected at the HTML-string level (in `transform/outputs.ts`), NOT through this
  pipeline, so `rehype-raw` is intentionally omitted.
- **Jupyter path** (`src/parse/notebook.ts` + `src/transform/outputs.ts`): parse the
  `.ipynb` JSON, render `markdown` cells via the markdown pipeline, and for `code`
  cells highlight source with `shiki` and map each output to inline HTML. **The chart
  fidelity requirement lives here**: `image/png|jpeg` outputs become
  `<img src="data:image/png;base64,...">` and `image/svg+xml` is inlined, so Chromium
  print preserves them in place. `text/html` (Plotly/Altair) is passed through
  verbatim; `application/vnd.plotly+json` emits a `<div data-figure>` for client render.
- **Themes** (`src/theme/`): `registry.ts` maps name → CSS file and declares page
  geometry (`format`, `margin`) consumed by the PDF engine. CSS files carry their own
  `@page` rules. Add a theme by creating `themes/<name>.css` and adding the name to
  `THEME_NAMES` in `registry.ts`.
- **Assembly + PDF** (`src/render.ts`, `src/pdf.ts`): `render.ts` inlines theme CSS
  and KaTeX CSS (`require.resolve("katex/dist/katex.min.css")`) into one self-contained
  document. `pdf.ts` uses a lazily-shared Chromium instance; `page.pdf` uses
  `preferCSSPageSize` so the theme's `@page` size wins when no explicit margin is set.
  Call `closePdf()` after batch runs to free the browser.
- **Tauri shell** (`tauri-app/`): `src/main.ts` (UI) calls Rust commands `render_file`
  / `export_pdf` (`src-tauri/src/main.rs`), which shell out to `node --import tsx
  src/cli.ts`. In a plain browser (`__TAURI_INTERNALS__` absent) it falls back to
  `/api/render` served by `dev-server.mjs`. `cwd` for the spawned CLI is the workspace
  root (one level above `tauri-app`).

## Key invariants / gotchas

- Input kind is dispatched by extension in `renderFile`: `.ipynb` → notebook,
  `.md|.markdown|.mdown|.mkd|.text` → markdown, else markdown fallback.
- KaTeX CSS must be inlined at render time (no CDN) — the document must render offline
  and print identically.
- Charts are preserved only because outputs are embedded as data URIs in
  `transform/outputs.ts`; do not "optimize" these into separate files or external URLs.
- A shared Playwright `Browser` is created once (`pdf.ts`); never call
  `chromium.launch()` per document in new code.
