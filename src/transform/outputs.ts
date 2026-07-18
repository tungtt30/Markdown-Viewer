/**
 * Convert a Jupyter cell output's `data` map into inline HTML.
 *
 * The critical goal: chart/images are embedded as data URIs (or raw HTML) so
 * that when the assembled document is printed to PDF by Chromium, the chart
 * appears in its exact notebook position and size — layout is preserved.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Join multi-line string outputs (Jupyter stores them as string[]). */
function joinLines(v: string | string[]): string {
  return Array.isArray(v) ? v.join("") : v;
}

export function outputDataToHtml(data: Record<string, any>): string {
  // Prefer the richest representation available.
  if (data["image/png"]) {
    const b64 = joinLines(data["image/png"]);
    return `<img class="nb-output-image" src="data:image/png;base64,${b64}" alt="notebook output" />`;
  }
  if (data["image/jpeg"]) {
    const b64 = joinLines(data["image/jpeg"]);
    return `<img class="nb-output-image" src="data:image/jpeg;base64,${b64}" alt="notebook output" />`;
  }
  if (data["image/svg+xml"]) {
    // Inline SVG preserves vector charts crisply in PDF.
    return `<div class="nb-output-svg">${joinLines(data["image/svg+xml"])}</div>`;
  }
  if (data["application/vnd.plotly+json"]) {
    const fig = typeof data["application/vnd.plotly+json"] === "string"
      ? data["application/vnd.plotly+json"]
      : JSON.stringify(data["application/vnd.plotly+json"]);
    // Plotly renders client-side; embed the spec for the frontend to draw.
    return `<div class="nb-plotly" data-figure='${escapeHtml(fig)}'></div>`;
  }
  if (data["text/html"]) {
    // Raw HTML passthrough (Altair/Plotly/HTML widgets). Rendered verbatim.
    return `<div class="nb-output-html">${joinLines(data["text/html"])}</div>`;
  }
  if (data["text/markdown"]) {
    // Markdown rendered later by the main pipeline; emit as-is for now.
    return `<div class="nb-output-markdown">${joinLines(data["text/markdown"])}</div>`;
  }
  if (data["text/plain"]) {
    return `<pre class="nb-output-text">${escapeHtml(joinLines(data["text/plain"]))}</pre>`;
  }
  return "";
}

/**
 * Render a stream/error/execute_result output node (the post-6.0 nbformat shape)
 * where outputs carry `output_type` and either `data` or `text`.
 */
export function outputNodeToHtml(out: any): string {
  switch (out.output_type) {
    case "display_data":
    case "execute_result":
      return outputDataToHtml(out.data ?? {});
    case "stream": {
      const text = joinLines(out.text ?? "");
      const cls = out.name === "stderr" ? "nb-stream nb-stream-error" : "nb-stream";
      return `<pre class="${cls}">${escapeHtml(text)}</pre>`;
    }
    case "error": {
      const trace = (out.traceback ?? []).join("\n");
      const msg = `${out.ename}: ${out.evalue}`;
      return `<pre class="nb-error">${escapeHtml(trace || msg)}</pre>`;
    }
    default:
      return "";
  }
}
