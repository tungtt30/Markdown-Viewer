# mdTool

A desktop tool that reads **Markdown** (`.md`) and **Jupyter notebooks** (`.ipynb`),
renders them with **beautiful, switchable themes**, and exports **faithful PDFs**
where images and charts keep their exact notebook layout.

Built on a Node.js render core wrapped in a Tauri desktop shell. PDFs are produced
by headless Chromium print, which is what guarantees chart/image fidelity.

## Features

- **Markdown**: GitHub-Flavored Markdown (tables, task lists, strikethrough),
  YAML frontmatter, math via KaTeX, fenced code with syntax highlighting.
- **Jupyter notebooks**: parses `nbformat` v4, renders markdown cells, code cells
  (Python, highlighted), and all rich outputs — including `image/png` charts
  embedded inline as data URIs so they print in place.
- **Themes**: `github`, `academic` (paper/Letter), `minimal`. Each defines its own
  print page geometry via CSS `@page` rules.
- **PDF**: pixel-accurate Chromium print with `printBackground` and theme margins.

## Architecture

```
src/                       Node.js render CORE (framework-agnostic)
  parse/markdown.ts        unified/remark/rehype GFM + math + frontmatter
  parse/notebook.ts        .ipynb -> cells -> HTML (shiki highlight)
  transform/outputs.ts     map Jupyter outputs -> inline HTML (chart/data URI)
  theme/                   registry + CSS themes (github/academic/minimal)
  render.ts                assemble self-contained HTML (theme + KaTeX CSS inlined)
  pdf.ts                   Playwright Chromium print-to-PDF
  index.ts                 public API: renderFile / fileToPdf
  cli.ts                   `mdtool <file> [--theme] [--out] [--preview]`
tauri-app/                 Tauri desktop shell
  src/main.ts              UI: open file, theme picker, live preview, export PDF
  src-tauri/               Rust backend: render_file / export_pdf commands
```

The core (`src/`) is independent of the UI. The same API can later back a CLI or
web backend without rework.

---

## Prerequisites

### 1. Node.js

mdTool needs **Node.js 20 or newer** (uses built-in `node --test` and the modern
module loader). Check your version:

```bash
node --version
```

Download from <https://nodejs.org> (LTS is fine), or install via a version manager:

| Platform | Recommended install |
| --- | --- |
| **macOS** | Homebrew: `brew install node` |
| **Windows** | `winget install OpenJS.NodeJS.LTS` (or the official installer) |
| **Either** | [`nvm`](https://github.com/nvm-sh/nvm) (macOS/Linux) / [`nvm-windows`](https://github.com/coreybutler/nvm-windows) |

### 2. Rust toolchain (only for the desktop app)

The Tauri native shell is written in Rust. **Skip this if you only want the CLI /
core** — see [No-Rust frontend dev](#no-rust-frontend-dev).

Install with the official toolchain:

- **macOS / Linux**:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Windows**: download **`rustup-init.exe`** from <https://rustup.rs> and run it.
  Choose the default (MSVC) toolchain when prompted.

Tauri also needs **platform system dependencies**:

- **Windows**: the MSVC build tools ship with `rustup-init` (default). No extra
  step. Make sure you picked the *MSVC* (not GNU) toolchain during install.
- **macOS**: install the Xcode Command Line Tools (needed to build the native webview):
  ```bash
  xcode-select --install
  ```

### 3. Chromium for PDF export

The core uses **Playwright's headless Chromium** to print PDFs. Install it once:

```bash
npx playwright install chromium
```

> On some Linux CI / headless servers you may also need OS libraries; on
> **macOS and Windows desktop** the bundled Chromium works out of the box.

---

## Install

From the project root:

```bash
npm install                 # install core deps
cd tauri-app && npm install # install the frontend deps
cd ..
```

---

## Build

### Core (Node)

```bash
npm run build               # tsc -> dist/
```

This compiles the framework-agnostic render core to `dist/`. It has no Rust
dependency and works on both macOS and Windows.

### Self-contained release bundling

A released desktop app ships with **no dependency on a system Node**. Before the
Rust binary is bundled, `bundle-core.sh` stages the render core into
`bundle-staging/mdTool/` and Tauri embeds it in the app's `Resources/mdTool`
(macOS) / `resources/mdTool` (Windows, Linux). The staged dir contains:

- a **Node binary** at `bin/node` (copied from the build machine's PATH),
- the compiled core at `dist/`,
- `node_modules/` and `package.json`,
- the theme CSS at `dist/src/theme/themes/` (themes are not compiled by `tsc`).

At runtime the Rust commands (`render_file` / `export_pdf`) resolve the core via
`core_root()`: in a bundle that is `<Resources>/mdTool` (derived from the exe
path); in dev it falls back to the workspace root and runs `src/cli.ts` through
`tsx`. The table below shows the command form each mode uses.

| Mode | Node | CLI entry |
| --- | --- | --- |
| Bundled release | `…/Resources/mdTool/bin/node` | `…/Resources/mdTool/dist/src/cli.js` |
| Dev | system `node` | workspace `src/cli.ts` (via `tsx`) |

> The staged core is ~400 MB because it includes `node_modules` (Playwright's
> Chromium download among it). Build and ship on the **same OS/arch** as your
> target — the bundled `node` binary is platform-specific.

### Desktop app (Tauri) — requires Rust

| Action | macOS | Windows |
| --- | --- | --- |
| Run in dev (hot reload) | `npm run tauri dev` | `npm run tauri dev` |
| Production build | `npm run tauri build` | `npm run tauri build` |

The compiled app lands in `tauri-app/src-tauri/target/release/`:

- **macOS**: a `.app` and a `.dmg` under `target/release/bundle/`
- **Windows**: an `.exe` installer (NSIS) and/or `.msi` under `target/release/bundle/`

> On Windows the first `tauri build` can take several minutes while it compiles
> the Rust backend and bundles WebView2. This is normal.

#### macOS: DMG bundling workaround

On **macOS 15 / 26 (Tahoe)**, Tauri's vendored `create-dmg` fails at the final
step with `hdiutil: couldn't unmount "diskN" - Resource busy`. The Finder window
it opens on the mounted volume (and QuickLook/Spotlight) keeps the volume busy so
it can't be unmounted. The `.app` bundle still builds fine — only the `.dmg`
step aborts.

To produce the `.dmg` reliably, use the committed helper instead of relying on
Tauri's bundled script:

```bash
npm run tauri build     # builds the .app (the dmg step may fail — that's ok)
npm run make-dmg        # creates the .dmg from the already-built .app
```

`make-dmg.sh` closes the Finder window and force-unmounts the volume, sidestepping
the lock. The resulting `.dmg` is at
`tauri-app/src-tauri/target/release/bundle/dmg/mdTool_0.1.0_aarch64.dmg`.

---

## No-Rust frontend dev

To run the **UI + core without installing Rust**, use the dev server. It builds the
frontend and proxies live preview to the Node core:

```bash
cd tauri-app
npm install
npm run build               # build frontend -> dist/
node dev-server.mjs         # serves http://localhost:1420
```

Open a sample from `samples/` in the browser UI. In a plain browser the app
automatically falls back to the `/api/render` endpoint served by `dev-server.mjs`
instead of calling the native Rust commands.

---

## CLI usage

The core ships a CLI (`mdtool`). It works on **both** macOS and Windows once the
core is built (or directly via `tsx` without building):

```bash
# Via tsx (no build step needed)
node --import tsx src/cli.ts report.md --theme academic

# Or after `npm run build`, use the compiled binary
mdtool report.md --theme academic

# Examples
mdtool notebook.ipynb --out notebook.pdf
mdtool file.md --preview            # print assembled HTML to stdout
mdtool --list-themes
```

Flag reference:

| Flag | Description |
| --- | --- |
| `--theme <name>` | One of `github`, `academic`, `minimal` |
| `--out <file>` | PDF output path (defaults to input name + `.pdf`) |
| `--preview` | Print the assembled HTML to stdout instead of a PDF |
| `--list-themes` | List available themes and exit |

---

## Test

```bash
npm test                    # node:test suite: markdown, notebook, pdf
npm test -- -t "PNG chart"  # run a single test by name
npm run typecheck           # tsc --noEmit (core only)
```

---

## Samples

`samples/sample.md` and `samples/sample.ipynb` exercise tables, math, task lists,
and an embedded chart output. Open them in the app or render with the CLI:

```bash
node --import tsx src/cli.ts samples/sample.md --theme github --out samples/out.pdf
```

---

## Updating Chromium

If PDF export fails after a Playwright upgrade, re-run:

```bash
npx playwright install chromium
```
