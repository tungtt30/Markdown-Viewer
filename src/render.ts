import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { loadThemeCss } from "./theme/registry.js";
import type { ThemeName } from "./theme/registry.js";

const require = createRequire(import.meta.url);
const KATEX_CSS_PATH = require.resolve("katex/dist/katex.min.css");

/**
 * Assemble a self-contained HTML document from rendered body content.
 *
 * Everything needed to display faithfully (theme CSS + KaTeX CSS) is inlined so
 * the document renders identically in a browser preview and when printed to PDF
 * by Chromium — no network required.
 */
export async function assembleHtml(
  bodyHtml: string,
  opts: { theme: ThemeName; title?: string; baseFontSize?: number }
): Promise<string> {
  const themeCss = await loadThemeCss(opts.theme);
  const katexCss = await readFile(KATEX_CSS_PATH, "utf8").catch(() => "");

  const title = opts.title ?? "mdTool";
  const fontSize = opts.baseFontSize ? ` body{font-size:${opts.baseFontSize}px;}` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${fontSize}</style>
</head>
<body>
<main class="mdtool-doc">
${bodyHtml}
</main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
