import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNotebook } from "../src/parse/notebook.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SAMPLE = JSON.stringify({
  cells: [
    { cell_type: "markdown", source: ["# Heading\n", "some *text*"] },
    {
      cell_type: "code",
      execution_count: 1,
      source: ["plt.plot([1,2,3])", "plt.show()"],
      outputs: [
        { output_type: "display_data", data: { "image/png": PNG }, metadata: {} },
      ],
    },
    {
      cell_type: "code",
      execution_count: null,
      source: ['print("hi")'],
      outputs: [{ output_type: "stream", name: "stdout", text: ["hi\n"] }],
    },
  ],
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
});

test("renders markdown cells", async () => {
  const { html } = await renderNotebook(SAMPLE);
  assert.match(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, /<em>text<\/em>/);
});

test("embeds PNG chart output as a data URI (layout preserved in PDF)", async () => {
  const { html } = await renderNotebook(SAMPLE);
  assert.match(html, /<img[^>]*class="nb-output-image"/);
  assert.match(html, new RegExp(`src="data:image\\/png;base64,${PNG}"`));
});

test("renders stream output as preformatted text", async () => {
  const { html } = await renderNotebook(SAMPLE);
  assert.match(html, /<pre class="nb-stream">hi\n<\/pre>/);
});

test("reports cell count", async () => {
  const { cellCount } = await renderNotebook(SAMPLE);
  assert.equal(cellCount, 3);
});
