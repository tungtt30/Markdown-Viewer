import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";

const preview = document.getElementById("preview") as HTMLIFrameElement;
const openBtn = document.getElementById("open") as HTMLButtonElement;
const exportBtn = document.getElementById("export") as HTMLButtonElement;
const themeSel = document.getElementById("theme") as HTMLSelectElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;

let currentPath: string | null = null;

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** Render a file to a full HTML doc. Uses Tauri command, or a dev-server fallback. */
async function renderCurrent(): Promise<void> {
  if (!currentPath) return;
  const theme = themeSel.value;
  let html = "";
  if (isTauri()) {
    html = (await invoke("render_file", { path: currentPath, theme })) as string;
  } else {
    const res = await fetch(`/api/render?path=${encodeURIComponent(currentPath)}&theme=${theme}`);
    html = await res.text();
  }
  preview.srcdoc = html;
  exportBtn.disabled = false;
  setStatus(`Rendered with "${theme}" theme`);
}

openBtn.addEventListener("click", async () => {
  try {
    if (isTauri()) {
      const picked = await openDialog({
        multiple: false,
        filters: [
          { name: "Markdown / Notebook", extensions: ["md", "markdown", "ipynb", "txt"] },
        ],
      });
      if (typeof picked === "string") {
        currentPath = picked;
        await renderCurrent();
      }
    } else {
      setStatus("Dev mode: use the Node CLI, e.g. node --import tsx src/cli.ts <file> --preview");
    }
  } catch (err) {
    setStatus(`Error: ${String(err)}`);
  }
});

themeSel.addEventListener("change", () => {
  if (currentPath) renderCurrent();
});

exportBtn.addEventListener("click", async () => {
  if (!currentPath) return;
  const theme = themeSel.value;
  try {
    if (isTauri()) {
      const out = await save({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof out === "string") {
        await invoke("export_pdf", { path: currentPath, out, theme });
        setStatus(`Saved PDF to ${out}`);
      }
    } else {
      setStatus("Dev mode: run node --import tsx src/cli.ts <file> --theme <theme>");
    }
  } catch (err) {
    setStatus(`Export failed: ${String(err)}`);
  }
});

setStatus("Ready. Open a .md or .ipynb file.");
