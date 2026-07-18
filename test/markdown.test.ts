import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/parse/markdown.js";

test("renders headings and GFM tables", async () => {
  const { html } = await renderMarkdown("# Title\n\n| a | b |\n| - | - |\n| 1 | 2 |");
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
});

test("extracts YAML frontmatter into meta", async () => {
  const { meta } = await renderMarkdown("---\ntitle: Hi\n---\n\n# Body");
  assert.equal(meta.title, "Hi");
});

test("renders math via KaTeX", async () => {
  const { html } = await renderMarkdown("Inline $E=mc^2$ and $$\\int_0^1 x\\,dx$$");
  assert.match(html, /class="katex"/);
});

test("renders task lists (GFM)", async () => {
  const { html } = await renderMarkdown("- [x] done\n- [ ] todo");
  assert.match(html, /<input[^>]*type="checkbox"/);
  assert.match(html, /checked/);
});
