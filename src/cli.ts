#!/usr/bin/env node
import { extname } from "node:path";
import { fileToPdf, isThemeName, THEME_NAMES, renderFile, assembleHtml } from "./index.js";
import { closePdf } from "./pdf.js";

function usage(): string {
  return `mdTool — render Markdown / Jupyter to themed PDF

Usage:
  mdtool <input.md|.ipynb> [--theme <name>] [--out <file.pdf>] [--preview]
  mdtool --list-themes

Options:
  --theme <name>   One of: ${THEME_NAMES.join(", ")}  (default: github)
  --out <file>     Output PDF path (default: <input>.pdf)
  --preview        Print assembled HTML to stdout instead of PDF
  --list-themes    List available themes and exit

Examples:
  mdtool report.md --theme academic
  mdtool notebook.ipynb --out notebook.pdf
`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  if (args.includes("--list-themes")) {
    console.log(THEME_NAMES.join("\n"));
    return;
  }

  const input = args.find((a) => !a.startsWith("--"));
  if (!input) {
    console.error(usage());
    process.exit(1);
  }

  let theme = "github";
  const tIdx = args.indexOf("--theme");
  if (tIdx !== -1 && args[tIdx + 1]) {
    theme = args[tIdx + 1];
    if (!isThemeName(theme)) {
      console.error(`Unknown theme '${theme}'. Available: ${THEME_NAMES.join(", ")}`);
      process.exit(1);
    }
  }

  let out = `${input.replace(extname(input), "")}.pdf`;
  const oIdx = args.indexOf("--out");
  if (oIdx !== -1 && args[oIdx + 1]) out = args[oIdx + 1];

  const preview = args.includes("--preview");

  if (preview) {
    const { html } = await renderFile(input, { theme: theme as any });
    const doc = await assembleHtml(html, { theme: theme as any, title: input });
    process.stdout.write(doc);
    await closePdf();
    return;
  }

  const result = await fileToPdf(input, out, { theme: theme as any });
  console.log(`Wrote ${result}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
