import { writeFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/** Lazily launch a shared headless Chromium instance. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch();
  }
  return browserPromise;
}

export interface PdfOptions {
  /** Output file path (.pdf). */
  outPath: string;
  format?: string; // "A4" | "Letter" | ... matches CSS @page size
  margin?: { top: string; right: string; bottom: string; left: string } | string;
  printBackground?: boolean;
}

/**
 * Render an HTML string to PDF via headless Chromium print.
 *
 * Using Chromium print (not a PDF library) is what guarantees that images and
 * charts embedded as data URIs keep their exact in-document layout and size.
 */
export async function htmlToPdf(html: string, opts: PdfOptions): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
    // Give KaTeX/math a beat to settle (it's synchronous, but be safe).
    await page.waitForTimeout(150);

    let margin: any = undefined;
    if (typeof opts.margin === "string") {
      const [top, right, bottom, left] = opts.margin.split(" ").map((s) => s.trim());
      margin = { top, right: right ?? top, bottom: bottom ?? top, left: left ?? right ?? top };
    } else if (opts.margin) {
      margin = opts.margin;
    }

    await page.pdf({
      path: opts.outPath,
      format: opts.format ?? "A4",
      margin,
      printBackground: opts.printBackground ?? true,
      preferCSSPageSize: margin === undefined,
    });
    return opts.outPath;
  } finally {
    await page.close();
  }
}

/** Close the shared browser (call on shutdown). */
export async function closePdf(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
