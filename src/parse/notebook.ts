import { renderMarkdown } from "./markdown.js";
import { outputNodeToHtml } from "../transform/outputs.js";
import { codeToHtml } from "shiki";

export interface NotebookResult {
  html: string;
  meta: Record<string, unknown>;
  /** Number of cells, for diagnostics. */
  cellCount: number;
}

interface Cell {
  cell_type: "markdown" | "code" | "raw";
  source: string | string[];
  metadata?: Record<string, any>;
  outputs?: any[];
  execution_count?: number | null;
}

interface Notebook {
  cells?: Cell[];
  metadata?: Record<string, any>;
  nbformat?: number;
  nbformat_minor?: number;
}

function joinSource(src: string | string[] | undefined): string {
  if (src == null) return "";
  return Array.isArray(src) ? src.join("") : src;
}

async function renderCodeCell(cell: Cell): Promise<string> {
  const source = joinSource(cell.source);
  let highlighted = "";
  try {
    highlighted = await codeToHtml(source, {
      lang: "python",
      theme: "github-dark",
    });
  } catch {
    highlighted = `<pre class="nb-code"><code>${source}</code></pre>`;
  }

  const outputs = (cell.outputs ?? [])
    .map(outputNodeToHtml)
    .filter((s) => s.length > 0)
    .join("\n");

  const count = cell.execution_count != null ? `[${cell.execution_count}] ` : "";

  return [
    `<div class="nb-cell nb-cell-code">`,
    `<div class="nb-input">`,
    `<div class="nb-prompt">In ${count}</div>`,
    highlighted,
    `</div>`,
    outputs ? `<div class="nb-outputs">${outputs}</div>` : "",
    `</div>`,
  ].join("\n");
}

/** Parse a Jupyter .ipynb (nbformat v4) JSON string into themed HTML. */
export async function renderNotebook(ipynb: string): Promise<NotebookResult> {
  const nb = JSON.parse(ipynb) as Notebook;
  const cells = nb.cells ?? [];
  const parts: string[] = [];

  for (const cell of cells) {
    if (cell.cell_type === "markdown") {
      const { html } = await renderMarkdown(joinSource(cell.source));
      parts.push(`<div class="nb-cell nb-cell-markdown">${html}</div>`);
    } else if (cell.cell_type === "code") {
      parts.push(await renderCodeCell(cell));
    } else if (cell.cell_type === "raw") {
      const text = joinSource(cell.source);
      parts.push(`<div class="nb-cell nb-cell-raw"><pre>${text}</pre></div>`);
    }
  }

  return {
    html: parts.join("\n"),
    meta: nb.metadata ?? {},
    cellCount: cells.length,
  };
}
