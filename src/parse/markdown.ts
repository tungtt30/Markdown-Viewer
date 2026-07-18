import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";

export interface MarkdownResult {
  /** Rendered HTML body (no <html>/<head> wrapper). */
  html: string;
  /** Frontmatter metadata, if present. */
  meta: Record<string, unknown>;
}

/**
 * remark plugin: lift a leading YAML frontmatter node into `data.meta` so the
 * caller can read metadata without it appearing in the rendered HTML.
 */
function extractFrontmatter() {
  return (tree: any, file: any) => {
    visit(tree, "yaml", (node: any) => {
      try {
        file.data.meta = parseYaml(node.value);
      } catch {
        file.data.meta = {};
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMath)
  .use(extractFrontmatter)
  // Bridge mdast -> hast so rehype plugins (KaTeX, stringify) can compile it.
  .use(remarkRehype, { allowDangerousHtml: true })
  // Allow raw HTML passthrough (notebook text/html outputs are injected at the
  // HTML-string level in src/parse/notebook.ts, not through this pipeline).
  .use(rehypeKatex)
  .use(rehypeStringify, { allowDangerousHtml: true });

/** Parse and render GitHub-Flavored Markdown (with math, frontmatter, raw HTML). */
export async function renderMarkdown(md: string): Promise<MarkdownResult> {
  const file = await processor.process(md);
  return {
    html: String(file),
    meta: (file.data.meta as Record<string, unknown>) ?? {},
  };
}
