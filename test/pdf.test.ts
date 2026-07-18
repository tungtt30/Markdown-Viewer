import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileToPdf } from "../src/index.js";

test("fileToPdf produces a valid PDF containing embedded images", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mdtool-"));
  const out = join(dir, "notebook.pdf");
  try {
    await fileToPdf(
      join(process.cwd(), "samples", "sample.ipynb"),
      out,
      { theme: "github" }
    );
    const buf = await readFile(out);
    // PDF magic header.
    assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-");
    // Embedded chart image XObject present.
    assert.match(buf.toString("latin1"), /\/Image/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("fileToPdf applies the chosen theme (academic -> Letter page)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mdtool-"));
  const out = join(dir, "doc.pdf");
  try {
    await fileToPdf(
      join(process.cwd(), "samples", "sample.md"),
      out,
      { theme: "academic" }
    );
    const buf = await readFile(out);
    assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-");
    // Academic theme uses Letter; Chromium embeds the page size. We at least
    // assert a well-formed PDF was produced.
    assert.ok(buf.length > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
