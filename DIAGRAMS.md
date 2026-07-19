# mdTool — Technical Diagrams

This document contains all technical charts and diagrams for `mdTool`, a two-layer
tool that renders **Markdown** and **Jupyter notebooks** into themed, self-contained
HTML and faithful PDFs (via headless Chromium print). Diagrams are drawn with
Mermaid so they render directly on GitHub and in the mdTool preview.

- **Layer 1 — Node Core (`src/`)**: framework-agnostic render library + CLI.
- **Layer 2 — Tauri Shell (`tauri-app/`)**: Rust + webview desktop UI that shells out
  to the core.

---

## 1. System Context Diagram

Shows the top-level actors and the two deployable artifacts.

```mermaid
flowchart TB
    subgraph Actors
        U[User / Developer]
        CI[CI Pipeline\nGitHub Actions]
    end

    subgraph Artifacts
        CLI["CLI binary\n`mdtool` → src/cli.ts"]
        APP["Desktop App\nTauri (.app / .exe / .dmg)"]
    end

    subgraph Engine
        CORE["Node Render Core\nsrc/index.ts\n(renderFile · fileToPdf)"]
    end

    U -->|commands| CLI
    U -->|open / export| APP
    CI -->|build + release| APP
    CI -->|npm test| CLI
    CLI --> CORE
    APP -->|spawns `node` on core CLI| CORE
    CORE -->|headless Chromium| PDF[(PDF file)]
    CORE -->|self-contained HTML| HTML[(HTML file)]
```

---

## 2. Repository Layout (Component Map)

Directory tree and which layer each part belongs to.

```mermaid
flowchart LR
    ROOT["mdTool/ (repo root)"] --> SRC["src/ — Render Core"]
    ROOT --> TAURI["tauri-app/ — Desktop Shell"]
    ROOT --> TEST["test/ — node:test"]
    ROOT --> SAMP["samples/ — fixtures"]
    ROOT --> BUILD["bundle-core.sh\nmake-dmg.sh\npackage.json"]

    SRC --> IDX["index.ts\npublic API"]
    SRC --> CLI["cli.ts\nCLI entry"]
    SRC --> RENDER["render.ts\nassembleHtml"]
    SRC --> PDF["pdf.ts\nhtmlToPdf / closePdf"]
    SRC --> PMD["parse/markdown.ts\nunified pipeline"]
    SRC --> PNB["parse/notebook.ts\n.ipynb → HTML"]
    SRC --> OUT["transform/outputs.ts\noutput → HTML"]
    SRC --> THEME["theme/registry.ts\nthemes/*.css"]

    TAURI --> MAIN["src/main.ts\nUI logic"]
    TAURI --> RS["src-tauri/src/main.rs\nrender_file / export_pdf"]
    TAURI --> DEV["dev-server.mjs\n/api/render proxy"]

    TEST --> TMD["markdown.test.ts"]
    TEST --> TNB["notebook.test.ts"]
    TEST --> TPDF["pdf.test.ts"]
```

---

## 3. Markdown Render Pipeline

The unified processor in `src/parse/markdown.ts:35-46`. Order is significant.

```mermaid
flowchart LR
    MD[Markdown string] --> P1["remark-parse\n→ mdast"]
    P1 --> P2["remark-gfm\ntables · strike · tasks · autolinks"]
    P2 --> P3["remark-frontmatter (yaml)\n+ extractFrontmatter (custom)\n→ file.data.meta"]
    P3 --> P4["remark-math\n$…$ · $$…$$"]
    P4 --> P5["remark-rehype\nallowDangerousHtml\nmdast → hast"]
    P5 --> P6["rehype-katex\nmath → KaTeX span"]
    P6 --> P7["rehype-stringify\nallowDangerousHtml\n→ HTML string"]

    P3 -. "stored, not deleted" .-> META[("meta\ntitle, etc.")]
    P7 --> OUT["{ html, meta }\n(body only, no wrapper)"]
```

> **Gotcha:** `rehype-raw` / `rehype-sanitize` are declared deps but unused.
> Notebook `text/html` outputs are injected at the string level in `outputs.ts`,
> **not** through this pipeline.

---

## 4. Jupyter Notebook Render Path

Orchestrated by `src/parse/notebook.ts:63-85`; per-cell branching then assembly into
a single `.nb-*`-classed HTML body.

```mermaid
flowchart TB
    IPYNB[".ipynb JSON string"] --> RN["renderNotebook\nnotebook.ts:63"]

    RN --> CELLS{cell.cell_type}

    CELLS -->|markdown| MDC["renderMarkdown\nsame unified pipeline\n→ .nb-cell-markdown"]
    CELLS -->|code| CDC["renderCodeCell\nnotebook.ts:32"]
    CELLS -->|raw| RDC[".nb-cell-raw\nverbatim <pre>"]

    CDC --> SHI["shiki codeToHtml\n(lang python, github-dark)\nfallback <pre>"]
    CDC --> OUTS["each output →\noutputNodeToHtml\ntransform/outputs.ts"]

    OUTS --> MAP["outputDataToHtml\npick richest MIME"]
    MAP --> PNG["image/png / jpeg →\n<img data:base64>"]
    MAP --> SVG["image/svg+xml →\ninline <svg>"]
    MAP --> PLOT["plotly+json →\n<div data-figure>"]
    MAP --> HTML["text/html →\nverbatim passthrough"]
    MAP --> MD["text/markdown →\ndiv (as-is)"]
    MAP --> TXT["text/plain →\n<pre> escaped"]

    MDC --> BODY["concatenated\nHTML body"]
    CDC --> BODY
    RDC --> BODY
    BODY --> RES["{ html, meta,\ncellCount }"]
```

### 4a. Output-to-HTML MIME Preference Order

`outputDataToHtml` (`outputs.ts:21-54`) picks the **richest** available MIME type:

```mermaid
flowchart TD
    DATA["output.data\ndict of mime → content"] --> O1{image/png?}
    O1 -->|yes| R1["<img class=nb-output-image\nsrc=data:image/png;base64>"]
    O1 -->|no| O2{image/jpeg?}
    O2 -->|yes| R2["<img ... jpeg>"]
    O2 -->|no| O3{image/svg+xml?}
    O3 -->|yes| R3["<div nb-output-svg>\nraw svg</div>"]
    O3 -->|no| O4{plotly+json?}
    O4 -->|yes| R4["<div nb-plotly data-figure>"]
    O4 -->|no| O5{text/html?}
    O5 -->|yes| R5["<div nb-output-html>\nverbatim</div>"]
    O5 -->|no| O6{text/markdown?}
    O6 -->|yes| R6["<div nb-output-markdown>"]
    O6 -->|no| R7["<pre nb-output-text>\nescaped text/plain</pre>"]
```

> **Chart fidelity invariant:** `image/png|jpeg` and `svg` become data URIs /
> inlined markup so Chromium print keeps them in exact position. Do **not**
> externalize these.

---

## 5. Theme System & Page Geometry

Two sources of page geometry; one wins depending on how `pdf.ts` is called.

```mermaid
flowchart TB
    subgraph Registry["src/theme/registry.ts"]
        NAMES["THEME_NAMES =\ngithub · academic · minimal"]
        THEMES["THEMES[name].page\n{ format, margin }"]
        LOAD["loadThemeCss(name)\nreads dist/.../themes/<name>.css"]
    end

    subgraph CSS["themes/*.css"]
        G["github.css\nA4 · 24mm 20mm"]
        A["academic.css\nLetter · 25mm 25mm"]
        M["minimal.css\nA4 · 18mm 18mm"]
    end

    NAMES --> THEMES
    THEMES -->|drives| PDFARG["pdf.ts page.pdf\nformat + margin"]
    LOAD -->|inlined into| ASM["assembleHtml\n<style> theme CSS"]
    CSS -. "@media print @page" .-> CSSPAGE["CSS @page\nsize + margin"]

    PDFARG --> MERGE{"pdf.ts:\npreferCSSPageSize\n= (margin===undefined)?"}
    CSSPAGE -. "used ONLY when\nmargin is undefined" .-> MERGE
    MERGE --> FINAL["final print geometry"]
```

| Theme | `format` | `margin` | CSS `@page` |
|-------|----------|----------|-------------|
| github | A4 | `24mm 20mm` | A4 / 24mm 20mm |
| academic | Letter | `25mm 25mm` | Letter / 25mm 25mm |
| minimal | A4 | `18mm 18mm` | A4 / 18mm 18mm |

> `fileToPdf` always passes `page.margin`, so **registry values win** in normal use;
> CSS `@page` is only honored when no margin is supplied to `htmlToPdf`.

---

## 6. HTML Assembly — `assembleHtml`

`src/render.ts:16-42` produces one fully self-contained, offline document.

```mermaid
flowchart LR
    BODY["bodyHtml\n(.md / .nb content)"]
    TH["loadThemeCss(theme)"]
    KT["require.resolve\nkatex/dist/katex.min.css"]
    FS["optional\nbody{font-size:…}"]

    BODY --> DOC
    TH --> DOC
    KT --> DOC
    FS --> DOC

    DOC["<!doctype html>\n<head><style>…theme…</style>\n<style>…katex…</style>\n+ font override</head>\n<main class=mdtool-doc>…</main>"]
```

> No network dependency. KaTeX CSS must be inlined (no CDN) so preview and print
> render identically.

---

## 7. PDF Engine — Shared Chromium

`src/pdf.ts` lazily launches one Chromium instance and reuses it.

```mermaid
sequenceDiagram
    participant Caller as htmlToPdf caller
    participant PDF as pdf.ts
    participant B as Browser (singleton)
    participant PG as Page
    participant C as Chromium

    Caller->>PDF: htmlToPdf(html, opts)
    PDF->>PDF: getBrowser() (launch once)
    PDF->>B: newPage()
    B->>PG: create
    PG->>C: setContent(html, networkidle)
    PG->>PG: waitForTimeout(150) (settle KaTeX)
    PDF->>PG: resolve margin (string|object|undefined)
    PG->>C: page.pdf({format, margin,\n printBackground, preferCSSPageSize})
    C-->>Caller: PDF file written to outPath
    PG->>PG: close() (finally)

    Note over PDF,B: closePdf() closes & nulls the singleton\n(free browser after batch runs)
```

---

## 8. End-to-End Render Flow (single file)

Bridges all core modules — `index.ts` → `render.ts` → `pdf.ts`.

```mermaid
flowchart TB
    F["input file"] --> RF["renderFile\nindex.ts:22"]
    RF --> EXT{extension}
    EXT -->|".ipynb"| NB["renderNotebook"]
    EXT -->|".md/.markdown/…"| MD["renderMarkdown"]
    EXT -->|fallback| MD
    NB --> BODY["{ html, meta }"]
    MD --> BODY
    BODY --> ASM["assembleHtml\n(theme CSS + katex CSS)"]
    ASM --> PG["themePage(theme)\n→ {format, margin}"]
    PG --> TOPDF["htmlToPdf\n(shared Chromium)"]
    TOPDF --> CLOSE["closePdf()"]
    CLOSE --> OUT["PDF on disk"]

    subgraph Defaults
        D1["theme default: github"]
        D2["out default: <input>.pdf"]
    end
```

---

## 9. Tauri Desktop Shell — Control Flow

How the desktop UI reaches the same Node core as the CLI.

```mermaid
flowchart TB
    subgraph UI["tauri-app/src/main.ts (webview)"]
        ISO{"isTauri()?\n__TAURI_INTERNALS__\nin window"}
    end

    ISO -->|yes| INV["invoke('render_file'\n / 'export_pdf')"]
    ISO -->|no (dev browser)| FETCH["fetch('/api/render?path&theme')"]

    INV --> RS["src-tauri/src/main.rs"]
    RS --> CMD["Command::new(node)\n→ core cli.ts / dist/cli.js"]
    CMD --> CORE["Node Render Core\n(--preview → HTML stdout\n --out → PDF file)"]
    CORE --> RET1["render_file: returns HTML"]
    CORE --> RET2["export_pdf: writes PDF"]

    FETCH --> DS["dev-server.mjs\n(port 1420)"]
    DS --> SPAWN["spawn node cli.ts --preview"]
    SPAWN --> CORE
    CORE --> HTML2["HTML → srcdoc"]
```

### 9a. Tauri Core Resolution Logic

`main.rs` decides where `node` and the core entry live.

```mermaid
flowchart TD
    START["command invoked"] --> CORE["core_root()\nprefer bundled, else workspace"]
    CORE --> NODE{"bundled\nbin/node?"}
    NODE -->|yes| N1["node = bin/node\nargs = [cli.js (dist)]"]
    NODE -->|no| N2["node = system 'node'\nargs = ['--import','tsx', cli.ts]"]
    N1 --> RUN["Command::new(node).args(...).output()"]
    N2 --> RUN
    RUN --> OUT{"command"}
    OUT -->|render_file| R["args + --theme + --preview\n→ stdout = HTML"]
    OUT -->|export_pdf| E["args + --theme + --out\n→ writes PDF"]
```

---

## 10. Entry Points & Public API Surface

All ways to drive mdTool.

```mermaid
flowchart LR
    subgraph EntryPoints
        BIN["bin `mdtool`\nsrc/cli.ts"]
        API["src/index.ts\nlibrary API"]
        RUST["Tauri commands\nrender_file · export_pdf"]
        HTTP["GET /api/render\ndev-server.mjs"]
    end

    subgraph CoreAPI["exports from index.ts"]
        RF["renderFile(path, opts)"]
        FTP["fileToPdf(path, out, opts)"]
        RM["renderMarkdown(md)"]
        RN["renderNotebook(ipynb)"]
        ASM["assembleHtml(body, opts)"]
        HTP["htmlToPdf(html, opts)"]
        CP["closePdf()"]
        TH["THEME_NAMES · THEMES\nisThemeName · ThemeName"]
    end

    BIN --> API
    RUST --> BIN
    HTTP --> BIN
    API --- CoreAPI
```

---

## 11. Test Suite Coverage Map

`node --import tsx --test test/*.test.ts`

```mermaid
flowchart TB
    T["npm test"] --> TM["markdown.test.ts"]
    T --> TN["notebook.test.ts"]
    T --> TP["pdf.test.ts"]

    TM --> TM1["headings + GFM table"]
    TM --> TM2["YAML frontmatter → meta.title"]
    TM --> TM3["KaTeX math rendered"]
    TM --> TM4["GFM task list checkboxes"]

    TN --> TN1["md cell → h1, em"]
    TN --> TN2["PNG data URI in img"]
    TN --> TN3["stream → nb-stream pre"]
    TN --> TN4["cellCount === 3"]

    TP --> TP1["sample.ipynb → %PDF-\n+ embedded /Image XObject"]
    TP --> TP2["sample.md academic → %PDF- len>1000"]
```

---

## 12. Build & Release Pipeline

How source becomes a shipped app, including the CSS-staging detail.

```mermaid
flowchart TB
    SRC["src/**/*.ts + cli.ts"] --> TSC["tsc -p tsconfig.json\n→ dist/"]
    CSS["src/theme/themes/*.css"] --> BUNDLE["bundle-core.sh\nstages CSS into dist/\nsrc/theme/themes/"]
    TSC --> STAGE["bundle-staging/mdTool\n(dist + CSS = core)"]
    BUNDLE --> STAGE

    STAGE --> CONF["tauri.conf.json\nbundles ../../bundle-staging/mdTool\n→ Resources/mdTool"]
    CONF --> TBLD["npm run tauri build\nRust app + bundled node + core"]
    TBLD --> APPS["(.app) / (.exe) / (.dmg via make-dmg.sh)"]

    SRC --> TYPE["npm run typecheck\ntsc --noEmit"]
    T --> TESTRUN["npm test"]
```

---

## 13. Module Dependency Graph

Internal imports between core modules.

```mermaid
flowchart BT
    IDX["index.ts"] --> PMD["markdown.ts"]
    IDX --> PNB["notebook.ts"]
    IDX --> RENDER["render.ts"]
    IDX --> PDF["pdf.ts"]
    IDX --> REG["registry.ts"]

    PNB --> PMD
    PNB --> OUT["outputs.ts"]
    RENDER --> REG
    PDF -.-> PDF

    CLI["cli.ts"] --> IDX
    CLI --> PDF

    OUT --> REG
```

---

## 14. Data Formats & Key Invariants

Quick reference of the contracts each stage obeys.

| Stage | Input | Output | Invariant |
|-------|-------|--------|-----------|
| `renderMarkdown` | Markdown string | `{html, meta}` body-only | frontmatter → `meta` only |
| `renderNotebook` | nbformat v4 JSON | `{html, meta, cellCount}` | per-cell branching |
| `outputDataToHtml` | output `.data` | richest-MIME HTML | data URIs for images/svg |
| `assembleHtml` | body HTML + theme | full `<html>` doc | **offline**, CSS inlined |
| `htmlToPdf` | full HTML | PDF file | shared Chromium, `preferCSSPageSize` |
| `renderFile` | file path | `{html, meta}` | extension dispatch |
| `fileToPdf` | file path + out | PDF path | chains all above |

**Cross-cutting invariants**
1. Input kind dispatched by extension in `renderFile` (`src/index.ts:22`).
2. KaTeX CSS inlined at render time — no CDN, identical print/preview.
3. Charts preserved only as data URIs (`outputs.ts`) — never externalize.
4. One shared Playwright `Browser` (`pdf.ts`); never `chromium.launch()` per doc.
5. CSS files staged by `bundle-core.sh`, **not** compiled by `tsc`.
6. Tauri shell never renders — it only spawns `node` against the core.
