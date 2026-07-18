import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { renderMarkdown } from "./parse/markdown.js";
import { renderNotebook } from "./parse/notebook.js";
import { assembleHtml } from "./render.js";
import { htmlToPdf, closePdf, type PdfOptions } from "./pdf.js";
import { isThemeName, type ThemeName, themePage } from "./theme/registry.js";

export { renderMarkdown, renderNotebook, assembleHtml, htmlToPdf, closePdf };
export { THEME_NAMES, THEMES, isThemeName } from "./theme/registry.js";
export type { ThemeName } from "./theme/registry.js";

export interface RenderOptions {
  theme?: ThemeName;
  title?: string;
  baseFontSize?: number;
}

const MARKDOWN_EXTS = new Set([".md", ".markdown", ".mdown", ".mkd", ".text"]);

/** Detect input kind and render body HTML accordingly. */
export async function renderFile(
  filePath: string,
  opts: RenderOptions = {}
): Promise<{ html: string; meta: Record<string, unknown> }> {
  const theme: ThemeName = opts.theme && isThemeName(opts.theme) ? opts.theme : "github";
  const raw = await readFile(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".ipynb") {
    const nb = await renderNotebook(raw);
    return { html: nb.html, meta: nb.meta };
  }
  if (MARKDOWN_EXTS.has(ext)) {
    const md = await renderMarkdown(raw);
    return { html: md.html, meta: md.meta };
  }
  // Fallback: treat unknown as markdown.
  const md = await renderMarkdown(raw);
  return { html: md.html, meta: md.meta };
}

/** High-level: render a file to a themed PDF. */
export async function fileToPdf(
  filePath: string,
  outPath: string,
  opts: RenderOptions = {}
): Promise<string> {
  const theme: ThemeName = opts.theme && isThemeName(opts.theme) ? opts.theme : "github";
  const { html, meta } = await renderFile(filePath, { theme });
  const title = opts.title ?? (meta.title as string) ?? filePath;
  const doc = await assembleHtml(html, { theme, title, baseFontSize: opts.baseFontSize });
  const page = themePage(theme);
  const pdfOpts: PdfOptions = {
    outPath,
    format: page.format,
    margin: page.margin,
  };
  const result = await htmlToPdf(doc, pdfOpts);
  await closePdf();
  return result;
}
