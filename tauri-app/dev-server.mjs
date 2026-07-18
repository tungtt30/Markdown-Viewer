// Lightweight dev server used only when running the frontend WITHOUT the Rust
// shell (i.e. `npm run dev` in tauri-app, before `npm run tauri dev`).
// It serves Vite's static output and proxies /api/render to the Node core so the
// preview pane works in a plain browser. For production, the Tauri Rust commands
// (render_file / export_pdf) call the core directly and this file is unused.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Project root = one level up from tauri-app/ (i.e. the mdTool workspace).
const root = join(__dirname, "..");
const distDir = join(__dirname, "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function renderViaCli(path, theme) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      ["--import", "tsx", join(root, "src", "cli.ts"), path, "--theme", theme, "--preview"],
      { cwd: root }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))
    );
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/render") {
      const html = await renderViaCli(
        url.searchParams.get("path") ?? "",
        url.searchParams.get("theme") ?? "github"
      );
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    let filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);
    filePath = normalize(filePath);
    try {
      const data = await readFile(filePath);
      res.writeHead(200, {
        "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
      });
      res.end(data);
    } catch {
      const index = await readFile(join(distDir, "index.html")).catch(
        () => "<h1>Run `npm run build` first</h1>"
      );
      res.writeHead(200, { "content-type": "text/html" });
      res.end(index);
    }
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

server.listen(1420, () => console.log("mdTool dev server on http://localhost:1420"));
