import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const THEME_NAMES = ["github", "academic", "minimal"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

interface ThemeDef {
  name: ThemeName;
  label: string;
  /** Page geometry used for PDF export. */
  page: { format: string; margin: string };
}

export const THEMES: Record<ThemeName, ThemeDef> = {
  github: {
    name: "github",
    label: "GitHub",
    page: { format: "A4", margin: "24mm 20mm" },
  },
  academic: {
    name: "academic",
    label: "Academic (paper)",
    page: { format: "Letter", margin: "25mm 25mm" },
  },
  minimal: {
    name: "minimal",
    label: "Minimal",
    page: { format: "A4", margin: "18mm 18mm" },
  },
};

export function isThemeName(s: string): s is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(s);
}

/** Load a theme's CSS file contents. */
export async function loadThemeCss(name: ThemeName): Promise<string> {
  const path = join(__dirname, "themes", `${name}.css`);
  return readFile(path, "utf8");
}

/** Resolve page geometry for a theme (used by the PDF engine). */
export function themePage(name: ThemeName) {
  return THEMES[name].page;
}
